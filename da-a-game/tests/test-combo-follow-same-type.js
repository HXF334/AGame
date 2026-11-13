// test-combo-follow-same-type.js
// [2026-11-13 用户] 「我上次说的是别人出单牌时AI怎么拆, 而不是所有跟牌逻辑,
//   如果上家出龙567, 我有999JQQK的话还是要先出JQK的。」
// -> 拆组偏好(拆龙/拆对子)只用于**跟单牌**; 跟组合牌型时同型优先。
//    本套件锁: 跟 567 龙时, 托管/提示都先出 JQK, 不因拆了 QQ 而过牌或改出 999。
var path = require('path');

require('./mock-wx.js');
var SB = require('./lib/state-builder.js');
var g = require('../game.js');
var ai = require('../src/ai.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name + (detail ? ' -> ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' -> ' + detail : '')); }
}

function mk(suit, rank, i) {
  return { id: suit + '-' + rank + '-c' + i, suit: suit, rank: rank };
}

// 手牌: 999 + J + QQ + K; 桌面: 567 龙(3 张)
var h = [
  mk('S', 9, 0), mk('H', 9, 1), mk('D', 9, 2),
  mk('C', 11, 3),
  mk('S', 12, 4), mk('H', 12, 5),
  mk('D', 13, 6)
];
var table = [mk('C', 5, 0), mk('D', 6, 0), mk('H', 7, 0)];
table.forEach(function (c) { c.location = { type: 'table' }; });

var st = SB.build({ handMap: { A: h }, table: table, lastPlayer: 'E', phase: 'PLAY' });
var me = st.players.filter(function (p) { return p.id === 'A'; })[0];
var keep = {};
h.forEach(function (c) { keep[c.id] = true; });
var extras = me.hand.filter(function (c) { return !keep[c.id]; });
st.discarded = (st.discarded || []).concat(extras);
me.hand = h.slice();

var act = ai.chooseAction(st, 'A');
var played = (act.cardIds || []).map(function (id) {
  return me.hand.filter(function (c) { return c.id === id; })[0];
});
var ranks = played.map(function (c) { return c.rank; }).sort(function (a, b) { return a - b; });

check('1 托管跟龙出 JQK', act.type === 'PLAY' && ranks.join(',') === '11,12,13',
  act.type + ' ranks=' + ranks.join(','));
check('2 托管没有改出 999', !(act.type === 'PLAY' && ranks.join(',') === '9,9,9'),
  'type=' + act.type);

g.__setState(st, { human: 'A', currentPlayer: 'A', clearLog: true });
var cands = g.uiHintCandidates();
var first = cands[0] || {};
check('3 提示首候选是同型龙(sameType=0)',
  !!first && first.sameType === 0 && first.type === 'STRAIGHT',
  'first=' + (first.label || '(none)') + ' sameType=' + first.sameType);
check('4 提示首候选是 JQK 且排在 999 前',
  !!first && /J/.test(first.label) && /Q/.test(first.label) && /K/.test(first.label),
  'first=' + (first.label || '(none)'));

console.log('');
console.log('test-combo-follow-same-type: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
