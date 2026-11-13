// test-combo-follow-same-type.js
// [2026-11-13 用户] 跟组合牌型的分层: ①同型不拆组 ②同型拆 1 组 ③蛋子+; 拆 >=2 组 禁。
//   本套件锁: 跟 567 龙时, 托管/提示都先出同型龙(只拆 1 组), 不因拆了 1 组而改出蛋子/过牌。
//   断言只锁性质(同型/张数/动了几组/首候选=托管), 不写死具体牌面。
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

// [2026-11-13 用户] 「上家出龙 567, 我有 999JQQK 还是要先出 JQK」:
//   跟组合牌型时同型优先, 拆 1 组允许; 不写死具体牌面, 只锁性质。
var ht = require('../src/hand-types.js');

var act = ai.chooseAction(st, 'A');
var played = (act.cardIds || []).map(function (id) {
  return me.hand.filter(function (c) { return c.id === id; })[0];
});
var tableHand = ht.identifyHand(table);
var playedHand = played.length ? ht.identifyHand(played) : null;
var touched = ai.usedGroupCount(played, me.hand);

check('1 托管跟龙出同型牌(龙), 张数与桌面一致',
  act.type === 'PLAY' && !!playedHand && playedHand.type === tableHand.type && played.length === table.length,
  act.type + ' type=' + (playedHand && playedHand.type) + ' n=' + played.length);
check('2 只拆 1 个同点组(允许拆 1 组, 不许拆 >=2 组)', touched === 1,
  'touched=' + touched);

g.__setState(st, { human: 'A', currentPlayer: 'A', clearLog: true });
var cands = g.uiHintCandidates();
var first = cands[0] || {};
check('3 提示首候选 = 托管那一手', !!first &&
  (first.ids || []).slice().sort().join(',') === (act.cardIds || []).slice().sort().join(','),
  'first=' + (first.label || '(none)'));
check('4 提示首候选同型且只拆 1 组',
  !!first && first.sameType === 0 && first.layer === 1 && first.type === tableHand.type,
  'first=' + (first.label || '(none)') + ' sameType=' + first.sameType + ' layer=' + first.layer);

console.log('');
console.log('test-combo-follow-same-type: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
