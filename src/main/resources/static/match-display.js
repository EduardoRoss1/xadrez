// Funções de apresentação sem dependência do DOM, compartilhadas com os testes.
(function (root) {
  const names = { P: 'Peão', N: 'Cavalo', B: 'Bispo', R: 'Torre', Q: 'Rainha', K: 'Rei' };
  function formatDuration(seconds) {
    if (seconds == null || !Number.isFinite(Number(seconds)) || Number(seconds) < 0) return 'Não disponível';
    const total = Math.floor(Number(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    return `${hours ? hours + 'h ' : ''}${String(minutes).padStart(2, '0')}min ${String(rest).padStart(2, '0')}s`;
  }
  function opponentMove(board, playerColor) {
    // No modo análise, indica o lance do lado que acabou de jogar.
    const color = playerColor || String(board.currentPlayer || '').toLowerCase();
    if (color === 'white') return board.lastBlackMove || null;
    if (color === 'black') return board.lastWhiteMove || null;
    return null;
  }
  function describeMove(move) {
    if (!move) return 'Aguardando a primeira jogada.';
    const promotion = move.promotion ? ` · promoção para ${names[move.promotion] || move.promotion}` : '';
    return `${names[move.piece] || move.piece}: ${move.source} → ${move.target}${promotion}`;
  }
  function groupCaptures(pieces = []) {
    const counts = new Map();
    for (const symbol of pieces) {
      if (!/^[pnbrqk]$/i.test(symbol)) continue;
      counts.set(symbol, (counts.get(symbol) || 0) + 1);
    }
    return Array.from(counts, ([symbol, count]) => ({ symbol, count }));
  }
  // --- Textos para a narração em áudio ---
  const feminine = new Set(['R', 'Q']); // torre e rainha
  function pieceName(symbol) {
    return names[String(symbol).toUpperCase()] || symbol;
  }
  // "e 4" em vez de "e4": os sintetizadores leem a letra e o número separadamente.
  function spokenSquare(square) {
    const text = String(square || '');
    return text.length === 2 ? `${text[0]} ${text[1]}` : text;
  }
  // Ex.: "peão branco", "torre preta". Maiúscula = branca, minúscula = preta.
  function spokenPiece(symbol) {
    const text = String(symbol || '');
    const letter = text.toUpperCase();
    const white = text === letter;
    const color = feminine.has(letter) ? (white ? 'branca' : 'preta') : (white ? 'branco' : 'preto');
    return `${pieceName(letter).toLowerCase()} ${color}`;
  }
  function spokenMove(move, actor) {
    if (!move) return '';
    const prefix = actor ? `${actor}: ` : '';
    const piece = String(move.piece || '').toUpperCase();
    const fileDelta = String(move.target || '').charCodeAt(0) - String(move.source || '').charCodeAt(0);
    if (piece === 'K' && Math.abs(fileDelta) === 2) {
      return `${prefix}roque ${fileDelta > 0 ? 'pequeno' : 'grande'}.`;
    }
    let text = `${prefix}${pieceName(piece).toLowerCase()} de ${spokenSquare(move.source)} para ${spokenSquare(move.target)}`;
    if (move.captured) text += `, captura ${pieceName(move.captured).toLowerCase()}`;
    if (move.promotion) text += `, promove a ${pieceName(move.promotion).toLowerCase()}`;
    return `${text}.`;
  }
  function spokenSelection(symbol, square, targets = []) {
    const base = `Selecionado: ${spokenPiece(symbol)} em ${spokenSquare(square)}.`;
    if (!targets.length) return `${base} Nenhum movimento possível.`;
    const list = targets.map(spokenSquare).join(', ');
    return `${base} ${targets.length === 1 ? 'Movimento possível' : `${targets.length} movimentos possíveis`}: ${list}.`;
  }

  const helpers = {
    formatDuration, opponentMove, describeMove, groupCaptures, pieceName,
    spokenSquare, spokenPiece, spokenMove, spokenSelection
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
  else root.ChessDisplay = helpers;
})(typeof globalThis !== 'undefined' ? globalThis : this);
