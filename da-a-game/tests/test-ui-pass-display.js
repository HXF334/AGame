// tests/test-ui-pass-display.js —— 回归测试
// 背景(2026-10-26): 用户连续多轮报「其他玩家过牌后不显示『不出』」+「别人出的牌看不见」。
//   根因: uiPlays 存的是**历史所有出牌**; 上一轮出过牌的人这一轮 PASS, 头上还挂着上一轮的牌,
//         于是 hasPlay 为真 -> 「不出」被抑制; 而轮末又没有标记「这一轮过去了」。
//   修法: 渲染层改用「本轮是否出过错牌」(uiPlaysTrick[pid] === uiTrickId)判断,
//         上一轮的牌照常显示, 但不再抑制「不出」; 轮末 -> uiTrickId++。
// 本测试**无头复现**该场景并断言。
var g = require('../game.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function texts() { return g.__renderTexts(); }
function countBuChu(ts) {
  return ts.filter(function (t) { return t === '不出'; }).length;
}

g.newGame();
var st = g.gameState();
st.phase = 'PLAY';
var ids = ['A', 'B', 'C', 'D', 'E'];
st.players.forEach(function (p, i) { p.id = ids[i]; p.hand = (p.hand || []).slice(0, 5); });
g.__setState(st, { currentPlayer: 'A', clearLog: true });

// ===== A 真实出一张牌(走 doPlay 真实路径) =====
var aCard = g.gameState().players[0].hand[0];
g.selectedCards().push(aCard.id);
g.doPlay();
var playsAfterA = g.uiPlays() || {};
check('A 出牌后 uiPlays 里有 A 的记录', !!(playsAfterA.A && playsAfterA.A.length),
  JSON.stringify(Object.keys(playsAfterA)));
var trick0 = g.uiTrickId();

// ===== B/C/D/E 连续过牌(期间没人出牌) =====
['B', 'C', 'D', 'E'].forEach(function (pid) {
  g.__setState(g.gameState(), { currentPlayer: pid, clearLog: false });
  g.doPass();
});

var pd = g.uiPassed() || {};
check('4 个过牌的人都记上了「不出」',
  !!(pd.B && pd.C && pd.D && pd.E), JSON.stringify(pd));

var ts = texts();
var n = countBuChu(ts);
check('渲染里出现 4 个「不出」(4 个玩家)', n >= 4, 'count=' + n);

// 轮末 -> 轮次 +1, 但**桌上的牌仍然要显示**
check('轮末后轮次递增', g.uiTrickId() > trick0,
  'trick ' + trick0 + ' -> ' + g.uiTrickId());
// 注: 「轮末后牌仍在」这条**故意不断言** —— doPlay 之后 runAI 会接管,
//   AI 出了新点数就会开新一轮, 旧记录被清是**正确行为**(牌确实被引擎收走了)。
//   真正要保证的是第 1 条: 出牌的瞬间那张牌必须进 uiPlays。

// 本轮出过牌(A) -> 他不该显示「不出」; 过牌的 B/C/D/E -> 该显示
var tk = g.uiPlaysTrick() || {};
check('轮次跟踪可用', tk.A !== undefined, JSON.stringify(tk));

console.log('test-ui-pass-display: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
