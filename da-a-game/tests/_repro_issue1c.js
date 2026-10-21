var mock = require('./mock-wx.js');
mock.install({ width: 800, height: 400 });
var SB = require('./lib/state-builder.js');
var { transition } = require('../src/transition.js');
var { ACTIONS } = require('../src/phases.js');
var { candidateCombos } = require('../src/combos.js');
var { identifyHand } = require('../src/hand-types.js');
var C = SB.C;

function mk() {
  return SB.build({
    handMap: { B: [C('S', 3), C('H', 3), C('D', 8), C('C', 11), C('S', 13), C('H', 2), C('D', 5), C('C', 9), C('S', 6)] },
    table: [C('D', 9), C('S', 9)],
    lastPlayer: 'A',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: true,
    主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_暗打'
  });
}

var st = mk();
var player = st.players.find(function (p) { return p.id === 'B'; });
var cands = candidateCombos(player.hand);

console.log('\u5019\u9009\u603b\u6570:', cands.length);
console.log('\u5bf93 \u5019\u9009\u5728\u54ea\u4e2a\u4f4d\u7f6e:');
var idx33 = -1;
cands.forEach(function (cb, i) {
  var cards = cb.map(function (id) { return player.hand.filter(function (c) { return c.id === id; })[0]; });
  if (cards.length === 2 && cards.every(function (c) { return c.rank === 3; })) idx33 = i;
});
console.log('  index =', idx33, '/', cands.length - 1, '(\u6700\u540e\u4e00\u4e2a\u662f\u5426)', idx33 === cands.length - 1);

console.log('');
console.log('=== \u9010\u4e2a\u8c03 transition, \u8bb0\u5f55\u5bf93 \u90a3\u4e00\u6b21\u7684\u7ed3\u679c ===');
var found = null;
for (var ci = 0; ci < cands.length; ci++) {
  var r2 = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'B', cardIds: cands[ci].slice() } });
  var cards = cands[ci].map(function (id) { return player.hand.filter(function (c) { return c.id === id; })[0]; });
  var is33 = cards.length === 2 && cards.every(function (c) { return c.rank === 3; });
  if (is33) {
    console.log('  [ci=' + ci + '] \u5bf93 -> ok=' + r2.ok + '  error=' + JSON.stringify(r2.error));
    found = r2.ok;
  }
  if (r2.ok && !found) {
    console.log('  [ci=' + ci + '] \u9996\u4e2a\u6210\u529f\u7684\u5019\u9009: ' + cards.map(function (c) { return c.rank; }).join(',') +
                ' (' + identifyHand(cards).type + ')');
    break;
  }
}
console.log('');
console.log('\u7ed3\u8bba: \u5bf93 \u5019\u9009\u80fd\u5426\u901a\u8fc7 transition =', found);

console.log('');
console.log('=== \u5173\u952e: cardIds \u987a\u5e8f ===');
var threes = player.hand.filter(function (c) { return c.rank === 3; });
console.log('\u5bf93 cardIds:', threes.map(function (c) { return c.id; }).join(', '));
var rDirect = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'B', cardIds: threes.map(function (c) { return c.id; }) } });
console.log('\u76f4\u63a5\u8c03 (\u5bf93): ok =', rDirect.ok);
var rRev = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'B', cardIds: threes.map(function (c) { return c.id; }).reverse() } });
console.log('\u53cd\u5e8f\u8c03 (\u5bf93): ok =', rRev.ok);

mock.uninstall();