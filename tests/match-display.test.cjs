const test = require('node:test');
const assert = require('node:assert/strict');
const {formatDuration,opponentMove,describeMove} = require('../src/main/resources/static/match-display.js');
test('duração inclui segundos, minutos e horas, sem transformar dados antigos em zero', () => {
  assert.equal(formatDuration(null),'Não disponível');
  assert.equal(formatDuration(-1),'Não disponível');
  assert.equal(formatDuration(0),'00min 00s');
  assert.equal(formatDuration(125),'02min 05s');
  assert.equal(formatDuration(3723),'1h 02min 03s');
});
test('cada jogador recebe o movimento do oponente, independente de quem está na vez', () => {
  const white={source:'e2',target:'e4',piece:'P'}; const black={source:'e7',target:'e5',piece:'P'};
  const board={currentPlayer:'BLACK',lastWhiteMove:white,lastBlackMove:black};
  assert.equal(opponentMove(board,'white'),black); assert.equal(opponentMove(board,'black'),white);
  assert.equal(opponentMove(board,null),white);
  assert.equal(opponentMove({currentPlayer:'WHITE'},'white'),null);
});
test('descrição textual identifica coordenadas e promoção, sem depender da cor do destaque', () => {
  assert.match(describeMove(null),/Aguardando/);
  assert.equal(describeMove({source:'b7',target:'a8',piece:'P',promotion:'N'}),'Peão: b7 → a8 · promoção para Cavalo');
});
test('capturas repetidas são agrupadas sem confundir peças brancas e pretas', () => {
  const {groupCaptures} = require('../src/main/resources/static/match-display.js');
  assert.deepEqual(groupCaptures(['p','p','r','P']), [{symbol:'p',count:2},{symbol:'r',count:1},{symbol:'P',count:1}]);
  assert.deepEqual(groupCaptures(), []);
});
