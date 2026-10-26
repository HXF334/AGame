// tests/test-ui-hint-joker.js —— 【提示】必须能选中「双大王」
//
// 用户原话(2026-10-26 真机实测):
//   「我有双大王, 桌面上有5个10, 点提示没有选中双大王。」
//
// 规则依据(SKILL §6 牌型表 L189): 「双王 | **任意2张王** | ... 可压 ... 大蛋子 ...」
//   -> 双大王是合法牌型, 且能管「5 张 10」(大蛋子)
// 引擎侧一直是对的: identifyHand(2张王) -> DOUBLE_JOKER; canBeat(DOUBLE_JOKER, BIG_TRIPLE) -> true
// 漏点在**候选枚举**: src/combos.js 的王组合只生成「1大1小/2大1小/1大2小」-> 从没生成过「双大王」
//   -> 【提示】/ AI 选牌 / doPlay 组合回退 三条路径(都走 candidateCombos)全都找不到双大王
//
// 跑法: node tests/test-ui-hint-joker.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var { createNormalCard, createBigJoker } = require('../src/card.js');
var { candidateCombos } = require('../src/combos.js');
g.__setAiDelay(0);

function C(suit, rank, deck) { return createNormalCard(suit, rank, deck); }

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}

// ===== 手牌: 丁(真人) 持双大王 + 杂牌 =====
var bj1 = createBigJoker(0), bj2 = createBigJoker(1);
var myHand = [
  bj1, bj2,
  C('S', 3, 'h0'), C('H', 4, 'h1'), C('D', 5, 'h2'), C('C', 6, 'h3'), C('S', 7, 'h4')
];
// ===== 桌面: 5 张 10 = 大蛋子 =====
var tableTens = [
  C('S', 10, 't0'), C('H', 10, 't1'), C('D', 10, 't2'), C('C', 10, 't3'), C('S', 10, 't4')
];
var ids = ['A', 'B', 'C', 'D', 'E'];
var st = g.gameState();
st.phase = 'PLAY';
st.players.forEach(function (p, i) {
  p.id = ids[i];
  p.hand = (i === 3) ? myHand.slice() : [C('H', 5, 'x' + i), C('D', 6, 'y' + i)];
});
st['主A'] = { suit: 'S', establishedBy: 'A', viaMethod: 'LIANG_A' };
st['反A'] = null;
st['次方'] = null;
st['次方公开'] = true;
st['底牌公开'] = true;
st.table = tableTens.slice();
st.discarded = [];
st.lastPlayer = 'A';
st.passedPlayers = [];
st.passCount = 0;
g.__setState(st, { currentPlayer: 'D', human: 'D', clearLog: true });

// ===== 1) 引擎层: 双大王能管大蛋子 =====
var jokerIds = [bj1.id, bj2.id].sort().join(',');
var combos = candidateCombos(myHand) || [];
var hasDoubleBig = combos.some(function (ids2) {
  return ids2.length === 2 && ids2.slice().sort().join(',') === jokerIds;
});
check('candidateCombos 含「双大王」组合(2 张王)', hasDoubleBig,
  'combos=' + JSON.stringify(combos.map(function (c) { return c.length + ':' + c.join('+'); })));

// ===== 2) 引擎 transition 接受这手牌 =====
var r = g.transition ? null : null;
var tr = require('../src/transition.js');
var res = tr.transition(st, { type: 'PLAY', payload: { playerId: 'D', cardIds: [bj1.id, bj2.id] } });
check('引擎 transition 接受「双大王」压 5 张 10(大蛋子)', !!(res && res.ok),
  res && res.ok ? '' : JSON.stringify(res && res.error));

// ===== 3) 【提示】能选到双大王 =====
var picked = null;
for (var i = 0; i < 30; i++) {
  var ok = g.uiHint();
  if (!ok) break;
  var sel = g.selectedCards() || [];
  if (sel.length === 2 && sel.slice().sort().join(',') === jokerIds) { picked = sel.slice(); break; }
}
check('【提示】多次点击能选中「双大王」', !!picked,
  'picked=' + JSON.stringify(picked) + ' lastLog=' + JSON.stringify((g.logHistory() || []).slice(-2)));

// ===== 4) 提示候选里**必须有**这一项(否则用户看到的是「当前没有可用牌」)=====
var logs = (g.logHistory() || []).join(' || ');
check('提示日志里出现过双大王(而不是「当前没有可用牌」)',
  logs.indexOf('双王') >= 0 || logs.indexOf('大王') >= 0,
  'logs=' + logs.slice(-240));

console.log('test-ui-hint-joker: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
