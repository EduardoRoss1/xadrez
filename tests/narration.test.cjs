const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const display = require('../src/main/resources/static/match-display.js');

test('lance falado informa peça, casas, captura, promoção e roque', () => {
  assert.equal(display.spokenMove({ source: 'e2', target: 'e4', piece: 'P' }, 'Você'), 'Você: peão de e 2 para e 4.');
  assert.equal(display.spokenMove({ source: 'd8', target: 'h4', piece: 'Q', captured: 'N' }, 'Máquina'),
    'Máquina: rainha de d 8 para h 4, captura cavalo.');
  assert.equal(display.spokenMove({ source: 'b7', target: 'a8', piece: 'P', captured: 'R', promotion: 'Q' }, 'Brancas'),
    'Brancas: peão de b 7 para a 8, captura torre, promove a rainha.');
  assert.equal(display.spokenMove({ source: 'e1', target: 'g1', piece: 'K' }, 'Você'), 'Você: roque pequeno.');
  assert.equal(display.spokenMove({ source: 'e8', target: 'c8', piece: 'K' }, 'Oponente'), 'Oponente: roque grande.');
  assert.equal(display.spokenMove(null, 'Você'), '');
});

test('seleção falada concorda gênero e cor da peça e lista os destinos', () => {
  assert.equal(display.spokenPiece('R'), 'torre branca');
  assert.equal(display.spokenPiece('n'), 'cavalo preto');
  assert.equal(display.spokenSelection('P', 'e2', ['e3', 'e4']),
    'Selecionado: peão branco em e 2. 2 movimentos possíveis: e 3, e 4.');
  assert.equal(display.spokenSelection('q', 'd8', ['d7']), 'Selecionado: rainha preta em d 8. Movimento possível: d 7.');
  assert.equal(display.spokenSelection('k', 'e8', []), 'Selecionado: rei preto em e 8. Nenhum movimento possível.');
});

// Carrega narrator.js com um navegador mínimo falso para testar a fila de falas.
function loadNarrator({ stored = 'true', autoEnd = false } = {}) {
  const spoken = [];
  const synth = {
    speaking: null,
    getVoices: () => [{ lang: 'pt-BR', name: 'fake' }],
    addEventListener() {},
    speak(u) { spoken.push(u.text); this.speaking = u; if (autoEnd) setImmediate(() => u.onend && u.onend()); },
    cancel() { const u = this.speaking; this.speaking = null; if (u && u.onerror) u.onerror({ error: 'interrupted' }); },
  };
  const listeners = {};
  const button = { attrs: {}, disabled: false, textContent: '', setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; }, addEventListener(t, fn) { this.click = fn; } };
  const window = {
    speechSynthesis: synth,
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    getSelection: () => ({ toString: () => '' }),
  };
  const document = {
    body: { classList: { toggle() {} } },
    addEventListener(type, fn) { listeners[type] = fn; },
    querySelectorAll: () => [],
    getElementById: id => (id === 'narrationToggle' ? button : null),
  };
  const context = {
    window, document, SpeechSynthesisUtterance: window.SpeechSynthesisUtterance,
    localStorage: { getItem: () => stored, setItem() {} }, setTimeout: () => 0, clearTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/main/resources/static/narrator.js'), 'utf8'), context);
  window.Narrator.init();
  return { narrator: window.Narrator, spoken, synth, button, listeners };
}

test('avisos do jogo interrompem leituras de mouse, e leituras de mouse substituem umas às outras', () => {
  const { narrator, spoken, synth } = loadNarrator();
  narrator.announce('botão A', { low: true });
  narrator.announce('botão B', { low: true });     // substitui A (que estava falando)
  narrator.announce('Você: peão de e 2 para e 4.'); // interrompe B
  narrator.announce('botão C', { low: true });     // espera o lance terminar
  assert.deepEqual(spoken, ['botão A', 'botão B', 'Você: peão de e 2 para e 4.']);
  synth.speaking.onend();
  assert.deepEqual(spoken.at(-1), 'botão C');
});

test('não repete a mesma fala pendente e fica em silêncio quando desativado', () => {
  const { narrator, spoken, synth } = loadNarrator();
  narrator.announce('Xeque!');
  narrator.announce('Xeque!');
  assert.equal(spoken.filter(t => t === 'Xeque!').length, 1);
  synth.speaking.onend();
  narrator.setEnabled(false);
  narrator.announce('não deve falar');
  assert.ok(!spoken.includes('não deve falar'));
  assert.equal(spoken.at(-1), 'Narração desativada.');
});

test('se o navegador bloquear o áudio antes de uma interação, a fala é refeita após o clique', () => {
  const { narrator, spoken, synth, listeners } = loadNarrator();
  narrator.announce('Tela: Início.');
  synth.speaking.onerror({ error: 'not-allowed' });
  narrator.announce('outro aviso');
  assert.deepEqual(spoken, ['Tela: Início.']);
  listeners.pointerdown();
  assert.deepEqual(spoken, ['Tela: Início.', 'Tela: Início.']);
});

test('o botão reflete o estado salvo e alterna a narração', () => {
  const { narrator, button } = loadNarrator({ stored: 'false' });
  assert.equal(narrator.isEnabled(), false);
  assert.equal(button.attrs['aria-pressed'], 'false');
  button.click();
  assert.equal(narrator.isEnabled(), true);
  assert.equal(button.attrs['aria-pressed'], 'true');
  assert.equal(button.textContent, 'Desativar narração');
});
