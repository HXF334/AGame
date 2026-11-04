// tests/test-combos-fake-eight.js —— 假八(FAKE_EIGHT)的候选枚举 + 【提示】能选中
//
// 用户原话(2026-11-01 真机报障):
//   「别人出双王, 我方手上有 JJJJ+QQQQ 时, 点【提示】说『当前没有可用牌』」
//
// 根因(**引擎侧一直是对的, 只漏在候选枚举**):
//   identifyHand(JJJJ+QQQQ) -> FAKE_EIGHT ✓  (SKILL §6 牌型库「假八 | 2组连续的四张同点数牌」)
//   canBeat(FAKE_EIGHT, DOUBLE_JOKER) -> true ✓ (§6.3 全局牌力: 假八 > 双王)
//   但 src/combos.js 的连段枚举 k 上界只到 3 -> 「每点取 4 张」的组合
//   (8 张假八 / 12 张三连假八) **从来没被枚举过**
//   -> 【提示】/ AI 选牌 / doPlay 组合回退 三条路径(都走 candidateCombos)全都找不到假八
//
// 跑法: node tests/test-combos-fake-eight.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var { candidateCombos } = require('../src/combos.js');
var { identifyHand, canBeat, HAND_TYPES } = require('../src/hand-types.js');
var { transition } = require('../src/transition.js');
var { ACTIONS, PHASES } = require('../src/phases.js');
var { createNormalCard, createBigJoker, createSmallJoker } = require('../src/card.js');
g.__setAiDelay(0);

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}

var n = 0;
function C(suit, rank, deck) { return createNormalCard(suit, rank, deck || ('c' + (++n))); }
function cardsOf(hand, ids) {
  return ids.map(function (id) { return hand.filter(function (c) { return c.id === id; })[0]; }).filter(Boolean);
}
function typeOf(hand, ids) { return identifyHand(cardsOf(hand, ids)).type; }

// ===== 手牌: JJJJ + QQQQ (J=11, Q=12 相邻 -> 2组连续的四张 = 假八) =====
var JJ = [C('H', 11, 'j0'), C('D', 11, 'j1'), C('C', 11, 'j2'), C('S', 11, 'j3')];
var QQ = [C('H', 12, 'q0'), C('D', 12, 'q1'), C('C', 12, 'q2'), C('S', 12, 'q3')];
var myHand = JJ.concat(QQ);

// ===== 1) 引擎层: 假八识别 + 能压双王 (这两个**修 bug 前就是对的**, 用来确认不是引擎坏了) =====
var fake8 = JJ.concat(QQ);
check('1.1 引擎把 JJJJ+QQQQ 识别为 FAKE_EIGHT',
  identifyHand(fake8).type === HAND_TYPES.FAKE_EIGHT, identifyHand(fake8).type);

var table = [createBigJoker('bj1'), createSmallJoker('sj1')];
check('1.2 引擎把 2 张王识别为 DOUBLE_JOKER',
  identifyHand(table).type === HAND_TYPES.DOUBLE_JOKER, identifyHand(table).type);
check('1.3 假八能压双王 (§6.3 假八 > 双王)',
  canBeat(identifyHand(fake8), identifyHand(table)) === true);

// ===== 2) 枚举层: 8 张假八必须被枚举出来 (本次修复点) =====
var combos = candidateCombos(myHand) || [];
var eight = combos.filter(function (ids) { return ids.length === 8; });
check('2.1 candidateCombos 枚举出 8 张的组合', eight.length >= 1,
  '组合数=' + combos.length + ' 8张组=' + eight.length);
check('2.2 其中有 8 张假八(FAKE_EIGHT)',
  eight.some(function (ids) { return typeOf(myHand, ids) === HAND_TYPES.FAKE_EIGHT; }),
  JSON.stringify(eight.map(function (ids) { return typeOf(myHand, ids); })));

// ===== 3) 12 张三连假八 (JJJJ+QQQQ+KKKK) 也要枚举得到 =====
var KK = [C('H', 13, 'k0'), C('D', 13, 'k1'), C('C', 13, 'k2'), C('S', 13, 'k3')];
var hand12 = JJ.concat(QQ).concat(KK);
var c12 = candidateCombos(hand12) || [];
var twelve = c12.filter(function (ids) { return ids.length === 12; });
check('3.1 candidateCombos 枚举出 12 张的组合', twelve.length >= 1,
  '组合数=' + c12.length + ' 12张组=' + twelve.length);
check('3.2 其中有 12 张三连假八(BIG_FAKE_EIGHT)',
  twelve.some(function (ids) { return typeOf(hand12, ids) === HAND_TYPES.BIG_FAKE_EIGHT; }),
  JSON.stringify(twelve.map(function (ids) { return typeOf(hand12, ids); })));

// ===== 4) 引擎 transition 接受这手假八压双王 (合法性由引擎裁决) =====
var st = g.gameState();
st.phase = PHASES.PLAY;
st.players.forEach(function (p, i) {
  p.id = ['A', 'B', 'C', 'D', 'E'][i];
  p.hand = (i === 3) ? myHand.slice() : [C('H', 5, 'x' + i), C('D', 6, 'y' + i)];
});
st['主A'] = { suit: 'S', establishedBy: 'A', viaMethod: 'LIANG_A' };
st['反A'] = null;
st['次方'] = null;
st['次方公开'] = true;
st['底牌公开'] = true;
st.table = table.slice();
st.discarded = [];
st.passedPlayers = [];
st.passCount = 0;
st.lastPlayer = 'A';
g.__setState(st, { currentPlayer: 'D', human: 'D', clearLog: true });

var eightIds = eight.filter(function (ids) { return typeOf(myHand, ids) === HAND_TYPES.FAKE_EIGHT; })[0] || [];
var res = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'D', cardIds: eightIds.slice() } });
check('4.1 引擎 transition 接受「8 张假八」压双王', !!(res && res.ok),
  res && res.ok ? '' : JSON.stringify(res && res.error));

// ===== 5) 【提示】能选中这手假八 (用户报的**现象**本身) =====
var picked = null;
for (var i = 0; i < 30; i++) {
  if (!g.uiHint()) break;
  var sel = g.selectedCards() || [];
  if (sel.length === 8 && typeOf(myHand, sel) === HAND_TYPES.FAKE_EIGHT) { picked = sel.slice(); break; }
}
check('5.1 【提示】能选中「8 张假八」(桌面是双王)', !!picked,
  'picked=' + JSON.stringify(picked) + ' lastLog=' + JSON.stringify((g.logHistory() || []).slice(-2)));

// ===== 6) 提示候选里必须真的有这一项(否则用户看到「当前没有可用牌」) =====
var logs = (g.logHistory() || []).join(' || ');
check('6.1 提示日志不是「当前没有可用牌」',
  logs.indexOf('当前没有可用牌') < 0, 'logs=' + logs.slice(-200));

console.log('test-combos-fake-eight: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
