// Narração em áudio para acessibilidade (Web Speech API, sem serviço externo).
// Quando ativada: fala avisos do jogo enviados pelo app.js, lê botões/campos sob o mouse
// ou com foco do teclado e lê o texto que o usuário selecionar.
(function () {
  const STORAGE_KEY = 'xadrezNarration';
  const supported = typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance === 'function';
  const synth = supported ? window.speechSynthesis : null;

  // Elementos lidos ao passar o mouse ou receber foco.
  const HOVER_SELECTOR = 'button, a[href], select, input, textarea, [role="button"], label';
  const HOVER_DELAY_MS = 180;      // evita narrar tudo ao apenas atravessar a tela com o mouse
  const MAX_SELECTION_CHARS = 1200;

  let enabled = false;
  let voice = null;
  let queue = [];          // itens { text, low } aguardando a vez
  let current = null;      // item sendo falado agora
  let token = 0;           // invalida eventos de falas já canceladas
  let blocked = false;     // o navegador exige um clique/tecla antes de permitir áudio
  let hoverTimer = null;
  let lastHovered = null;
  let lastSelection = '';

  function readStored() {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  }

  function store(value) {
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* armazenamento indisponível */ }
  }

  function pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices();
    voice = voices.find(v => /^pt[-_]BR$/i.test(v.lang))
      || voices.find(v => /^pt\b/i.test(v.lang))
      || null;
  }

  function clean(text) {
    return String(text ?? '').replace(/\s+/g, ' ').trim();
  }

  // --- Fila de falas ---------------------------------------------------------------
  // Avisos do jogo (prioridade normal) entram na fila e interrompem leituras de mouse/foco.
  // Leituras de mouse/foco (low) substituem umas às outras, para não acumular atraso.

  function stopCurrent() {
    token++;
    current = null;
    synth.cancel();
  }

  function pump() {
    if (!enabled || blocked || current || !queue.length) return;
    const item = queue.shift();
    const myToken = ++token;
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = voice?.lang || 'pt-BR';
    if (voice) utterance.voice = voice;
    utterance.rate = 1.05;
    current = { ...item, utterance };

    const finish = () => {
      if (myToken !== token) return;
      current = null;
      pump();
    };
    utterance.onend = finish;
    utterance.onerror = (event) => {
      if (myToken !== token) return;
      if (event.error === 'not-allowed') {
        // Áudio só é liberado após uma interação do usuário (ex.: ao recarregar a página
        // com a narração já ativa). Guarda a fala e tenta de novo no primeiro clique/tecla.
        current = null;
        queue.unshift(item);
        blocked = true;
        return;
      }
      finish();
    };

    synth.speak(utterance);
    // Alguns navegadores às vezes não disparam "onend"; este limite evita travar a fila.
    setTimeout(finish, 4000 + item.text.length * 120);
  }

  function announce(text, options = {}) {
    if (!enabled || !supported) return;
    const message = clean(text);
    if (!message) return;
    const low = !!options.low;

    if (current?.text === message || queue.some(item => item.text === message)) return;

    if (low) {
      queue = queue.filter(item => !item.low);
      if (current?.low) stopCurrent();
    } else if (current?.low) {
      stopCurrent();
    }

    queue.push({ text: message, low });
    pump();
  }

  function unblock() {
    if (!blocked) return;
    blocked = false;
    pump();
  }

  // --- Descrição de elementos (mouse e teclado) ---------------------------------------

  function labelText(label) {
    // Copia o rótulo sem os campos internos, para não ler as opções de um select junto.
    const copy = label.cloneNode(true);
    copy.querySelectorAll('input, select, textarea, button').forEach(node => node.remove());
    return clean(copy.textContent);
  }

  function describeField(el) {
    const label = clean(el.getAttribute('aria-label'))
      || (el.labels && el.labels.length ? labelText(el.labels[0]) : '')
      || clean(el.getAttribute('placeholder'))
      || clean(el.name);

    if (el.tagName === 'SELECT') {
      const selected = el.options[el.selectedIndex]?.text;
      return `${label}, lista de opções${selected ? `, selecionado: ${selected}` : ''}`;
    }
    if (el.tagName === 'TEXTAREA') return `${label}, campo de texto`;

    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (type === 'password') return `${label}, campo de senha${el.value ? ', preenchido' : ''}`;
    if (['button', 'submit', 'reset'].includes(type)) return `${clean(el.value) || label}, botão`;
    if (type === 'checkbox' || type === 'radio') return `${label}, ${el.checked ? 'marcado' : 'desmarcado'}`;
    const kind = type === 'number' ? 'campo numérico' : 'campo de texto';
    return `${label}, ${kind}${el.value ? `, conteúdo: ${el.value}` : ''}`;
  }

  function describeElement(el) {
    if (!el) return '';
    if (el.matches('input, select, textarea')) return describeField(el);

    if (el.tagName === 'LABEL') {
      const control = el.control || el.querySelector('input, select, textarea');
      return control ? describeField(control) : labelText(el);
    }

    // As casas do tabuleiro já têm um aria-label completo (casa, peça, cor, último lance).
    if (el.classList.contains('square')) return clean(el.getAttribute('aria-label'));

    const text = clean(el.getAttribute('aria-label')) || clean(el.textContent) || clean(el.title);
    if (!text) return '';
    const role = el.tagName === 'A' ? 'link' : 'botão';
    const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true' ? ', indisponível' : '';
    return `${text}, ${role}${disabled}`;
  }

  function isVisible(el) {
    return !!(el && el.getClientRects().length) && !el.closest('.hidden');
  }

  function onMouseOver(event) {
    const el = event.target.closest?.(HOVER_SELECTOR) || null;
    if (el === lastHovered) return;
    lastHovered = el;
    clearTimeout(hoverTimer);
    if (!el || !enabled) return;
    hoverTimer = setTimeout(() => {
      if (lastHovered === el && isVisible(el)) announce(describeElement(el), { low: true });
    }, HOVER_DELAY_MS);
  }

  function onFocusIn(event) {
    const el = event.target.closest?.(HOVER_SELECTOR);
    if (el && enabled) announce(describeElement(el), { low: true });
  }

  function onSelectionEnd() {
    if (!enabled) return;
    // Espera o navegador concluir a seleção (duplo clique, Shift + setas).
    setTimeout(() => {
      const text = clean(window.getSelection?.().toString());
      if (!text) {
        lastSelection = '';
        return;
      }
      if (text === lastSelection) return;
      lastSelection = text;
      const spoken = text.length > MAX_SELECTION_CHARS ? `${text.slice(0, MAX_SELECTION_CHARS)}…` : text;
      announce(`Texto selecionado: ${spoken}`);
    }, 60);
  }

  // Elementos marcados com data-narrate são lidos sempre que o texto muda ou ficam visíveis
  // (ex.: status da busca de partida, "Máquina pensando…").
  function observeLiveRegions() {
    if (typeof MutationObserver === 'undefined') return;
    document.querySelectorAll('[data-narrate]').forEach(el => {
      let lastText = clean(el.textContent);
      let wasVisible = isVisible(el);
      new MutationObserver(() => {
        const text = clean(el.textContent);
        const visible = isVisible(el);
        if (visible && text && (text !== lastText || !wasVisible)) announce(text);
        lastText = text;
        wasVisible = visible;
      }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    });
  }

  // --- Botão de ativar/desativar ---------------------------------------------------

  function updateButton() {
    const btn = document.getElementById('narrationToggle');
    if (!btn) return;
    if (!supported) {
      btn.disabled = true;
      btn.textContent = 'Narração indisponível';
      btn.title = 'Este navegador não oferece síntese de voz.';
      btn.setAttribute('aria-pressed', 'false');
      return;
    }
    btn.setAttribute('aria-pressed', String(enabled));
    btn.textContent = enabled ? 'Desativar narração' : 'Narração por voz';
    btn.setAttribute('aria-label', enabled ? 'Desativar narração por voz' : 'Ativar narração por voz');
    btn.title = btn.getAttribute('aria-label');
  }

  function setEnabled(value) {
    if (!supported) return;
    if (!value && enabled) {
      queue = [];
      stopCurrent();
      // Confirma o desligamento antes de silenciar.
      const bye = new SpeechSynthesisUtterance('Narração desativada.');
      bye.lang = voice?.lang || 'pt-BR';
      if (voice) bye.voice = voice;
      synth.speak(bye);
    }
    enabled = !!value;
    document.body.classList.toggle('narration-on', enabled);
    store(enabled);
    updateButton();
    if (enabled) {
      blocked = false;
      announce('Narração ativada. Os lances, a peça selecionada e os avisos do jogo serão falados. '
        + 'Passe o mouse sobre um botão ou selecione um texto para ouvi-lo.');
    }
  }

  function init() {
    if (supported) {
      pickVoice();
      synth.addEventListener?.('voiceschanged', pickVoice);
      enabled = readStored();
      document.body.classList.toggle('narration-on', enabled);
      // Com a narração salva como ativa, o navegador ainda pode exigir uma interação antes
      // da primeira fala; a fila espera esse clique/tecla.
      document.addEventListener('pointerdown', unblock, true);
      document.addEventListener('keydown', unblock, true);
      document.addEventListener('mouseover', onMouseOver, { passive: true });
      document.addEventListener('focusin', onFocusIn);
      document.addEventListener('mouseup', onSelectionEnd);
      document.addEventListener('keyup', event => { if (event.shiftKey || event.key === 'Shift') onSelectionEnd(); });
      observeLiveRegions();
    }

    updateButton();
    document.getElementById('narrationToggle')?.addEventListener('click', () => setEnabled(!enabled));
  }

  window.Narrator = {
    supported,
    isEnabled: () => enabled,
    setEnabled,
    announce,
    init,
  };
})();
