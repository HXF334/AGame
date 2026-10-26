// tests/test-ui-roundend-out.js —— 轮末: 已出完牌的人, 桌面清干净 + 提示「已出完」
//
// 用户原话(2026-10-26):
//   「轮末不清不出文字, 但是已经出完牌的人的桌面要清干净, 并提示已出完。」
//
// 场景: 甲 出掉最后两张 -> **手牌空了(出完)**; 乙丙丁戊 全部过牌 -> 轮末
// 期望:
//   1) 轮末 -> 甲 留在桌面上的那两张牌被清掉(桌面干净)
//   2) 甲 的位置显示「已出完」
//   3) 「不出」文字**保留**(轮末不清不出文字) -> 乙丙丁戊 仍显示「不出」
//
// 跑法: node tests/test-ui-roundend-out.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var { createNormalCard } = require('../src/card.js');
g.__setAiDelay(0);

function C(suit, rank) { return createNormalCard(suit, rank); }

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function texts() { return g.__renderTexts(); }
function countTxt(ts, s) { return ts.filter(function (t) { return t === s; }).length; }
function playBy(pid) { var p = g.uiPlays() || {}; return p[pid] || null; }

// 甲 只有 2 张 -> 出完; 其他人也都只有 2 张(凑够 108 张不校验, 这里只测 UI 行为)
var hands = [
  [C('H', 9), C('D', 9)],     // A 甲(出完)
  [C('H', 8), C('D', 8)],     // B 乙
  [C('H', 7), C('D', 7)],     // C 丙
  [C('H', 6), C('D', 6)],     // D 丁(真人)
  [C('H', 5), C('D', 5)]      // E 戊
];
var ids = ['A', 'B', 'C', 'D', 'E'];

var st = g.gameState();
st.phase = 'PLAY';
st.players.forEach(function (p, i) { p.id = ids[i]; p.hand = hands[i]; });
// 主A = 戊(避免推风目标落在真人身上, 让脚本完全可控)
st['主A'] = { suit: 'D', establishedBy: 'E', viaMethod: 'FORCED_CHECK' };
st['反A'] = null;
st['次方'] = null;
st['次方公开'] = true;
st['底牌公开'] = true;
st.table = [];
st.passedPlayers = [];
st.lastPlayer = null;
g.__setState(st, { currentPlayer: 'A', human: 'B', clearLog: true });

// 注: 无头测试 AI_STEP_DELAY=0 -> AI 会同步抢跑, 每次操作前把 human 设成**下一位**。

// 1) 甲 出掉最后两张 -> 出完
g.__setState(g.gameState(), { currentPlayer: 'A', human: 'B', clearLog: false });
var sel = g.selectedCards(); sel.length = 0;
sel.push(hands[0][0].id); sel.push(hands[0][1].id);
g.doPlay();
check('甲 出完(手牌为空)', (g.gameState().players[0].hand || []).length === 0,
  'hand=' + (g.gameState().players[0].hand || []).length);
check('甲 的两张牌先显示在桌面上', !!(playBy('A') && playBy('A').length === 2),
  'uiPlays=' + JSON.stringify(Object.keys(g.uiPlays() || {})));

// 2) 乙丙丁戊 依次过牌 -> 最后一个过完 = 轮末
['B', 'C', 'D', 'E'].forEach(function (pid, i) {
  var nextHuman = ['C', 'D', 'E', 'B'][i];
  g.__setState(g.gameState(), { currentPlayer: pid, human: nextHuman, clearLog: false });
  g.doPass();
});

// 3) 轮末断言
check('轮末: 甲(已出完)的桌面牌已清干净', !playBy('A'),
  'uiPlays=' + JSON.stringify(Object.keys(g.uiPlays() || {})));
var ts = texts();
check('轮末: 甲 显示「已出完」', countTxt(ts, '已出完') >= 1,
  '已出完=' + countTxt(ts, '已出完') + ' 不出=' + countTxt(ts, '不出'));
check('轮末: 「不出」文字保留(乙丙丁戊仍显示)', countTxt(ts, '不出') >= 1,
  '不出=' + countTxt(ts, '不出'));

console.log('test-ui-roundend-out: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
