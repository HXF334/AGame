var mock = require('./mock-wx.js');
mock.install({ width: 800, height: 400 });
var g = require('../game.js');
var SB = require('./lib/state-builder.js');
var card = require('../src/card.js');
var { identifyHand, canBeat } = require('../src/hand-types.js');
var { candidateCombos } = require('../src/combos.js');

var C = SB.C;
var NAME = { A: '\u7532', B: '\u4e59', C: '\u4e19', D: '\u4e01', E: '\u620a' };
function n(id) { return NAME[id] || id; }

console.log('=== \u89c4\u5219: \u5185\u8499\u53e4\u6253\u5927A \u70b9\u6570\u987a\u5e8f ===');
console.log('3 > 2 > A > K > Q > J > 10 > 9 > ... > 4   (\u5927A \u6700\u5927, \u5176\u6b21\u662f 3)');
var p3 = identifyHand([C('S', 3), C('H', 3)]);
var p9 = identifyHand([C('D', 9), C('C', 9)]);
console.log('canBeat(\u5bf93, \u5bf99) =', canBeat(p3, p9), '  => \u5bf93 \u80fd\u538b\u5bf99, \u5408\u89c4');
console.log('');

// \u6784\u9020: \u4e59(B) \u662f\u4eba\u7c7b, \u624b\u4e0a\u6709\u5bf93\u4e0d\u80fd\u88ab\u81ea\u52a8\u9009\u4e2d
var st = SB.build({
  handMap: { B: [C('S', 3), C('H', 3), C('D', 8), C('C', 11), C('S', 13), C('H', 2), C('D', 5), C('C', 9), C('S', 6)] },
  table: [C('D', 9), C('S', 9)],
  lastPlayer: 'A',
  主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
  次方: 'D', 次方公开: true,
  主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
  mode: '2V3_\u6697\u6253'
});

var bh = st.players.find(function (p) { return p.id === 'B'; }).hand;
console.log('\u4e59(B) \u624b\u724c (' + bh.length + ' \u5f20):', bh.map(function (c) { return c.rank; }).join(','));
console.log('\u684c\u4e0a:', st.table.map(function (c) { return c.rank; }).join(','), '=', identifyHand(st.table).type);
console.log('');

var th = identifyHand(st.table);
console.log('=== \u624b\u52a8\u9009\u4e2d\u5bf93 \u8bd5\u63a2 ===');
var p3hand = bh.filter(function (c) { return c.rank === 3; });
var p3h = identifyHand(p3hand);
console.log('\u5bf93 \u724c\u578b:', p3h.type, '| canBeat vs \u684c\u4e0a =', canBeat(p3h, th));
g.__setState(st, { currentPlayer: 'B', human: 'B', selectedCards: p3hand.map(function (c) { return c.id; }) });
g.doPlay();
console.log('doPlay \u540e currentPlayer =', n(g.currentPlayer()));
console.log('log:', g.logHistory().slice(-2).join(' || '));

// \u91cd\u7f6e\u5e76\u6d4b\u672a\u9009\u724c\u8def\u5f84
g.__setState(SB.build({
  handMap: { B: [C('S', 3), C('H', 3), C('D', 8), C('C', 11), C('S', 13), C('H', 2), C('D', 5), C('C', 9), C('S', 6)] },
  table: [C('D', 9), C('S', 9)], lastPlayer: 'A',
  主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
  次方: 'D', 次方公开: true, 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], mode: '2V3_\u6697\u6253'
}), { currentPlayer: 'B', human: 'B' });

console.log('');
console.log('=== \u672a\u9009\u724c\u76f4\u63a5\u70b9\u51fa\u724c (\u81ea\u52a8\u9009\u62e9) ===');
var combos = candidateCombos(bh);
console.log('candidateCombos \u5019\u9009\u6570:', combos.length);
combos.forEach(function (cb) {
  var cards = cb.map(function (id) { return bh.filter(function (c) { return c.id === id; })[0]; });
  var h = identifyHand(cards);
  console.log('  ' + cb.length + '\u5f20', cards.map(function (c) { return c.rank; }).join(','), '| ' + h.type, '| beats=', canBeat(h, th));
});
g.doPlay();
console.log('');
console.log('doPlay \u540e currentPlayer =', n(g.currentPlayer()));
console.log('log:', g.logHistory().slice(-3).join(' || '));

mock.uninstall();