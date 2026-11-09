// tests/test-ui-pass-display.js —— 回归测试
// 背景(2026-10-26): 用户连续多轮报「其他玩家过牌后不显示『不出』」+「别人出的牌看不见」。
//   根因: uiPlays 存的是**历史所有出牌**; 上一轮出过牌的人这一轮 PASS 了, 头上还挂着上一轮的牌,
//         于是 hasPlay 为真 -> 「不出」被抑制; 而轮末又没有标记「这一轮过去了」。
//   修法: 渲染层改用「本轮是否出过错牌」(uiPlaysTrick[pid] === uiTrickId)判断,
//         上一轮的牌照常显示, 但不再抑制「不出」; 轮末 -> uiTrickId++。
//         之后又改成「PASS 就**无条件**清掉他的出牌显示」(不再依赖轮次判定)。
// 本测试**无头复现**该场景并断言。
// [2026-10-26] 必须先装 mock-wx, game.js 才有 ctx -> runAI 才会真跑。
//   否则 runAI 开头 `if (!ctx) return` 直接返回, 下面那条断言就是**空转**(一条 PASS 都没有)。
// [2026-10-26] **局面改成确定性的**: 之前手牌随机 + AI 在无头测试里同步抢跑
//   -> 断言随随机局面飘(同一份代码连跑三次得到 9/0、7/2、5/4 三种结果)。
//   现在手牌全部指定, 且 AI 只能过牌 -> 局面完全可复现。
var mock = require('./mock-wx.js');
var m = mock.install({});
var g = require('../game.js');
var { createNormalCard } = require('../src/card.js');
function C(suit, rank, deck) { return createNormalCard(suit, rank, deck); }
// AI 动作间隔设为 0(否则每步等 1 秒, 测试会跑很久)
g.__setAiDelay(0);

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function texts() { return g.__renderTexts(); }
function countBuChu(ts) {
  return ts.filter(function (t) { return t === '不出'; }).length;
}

// ===== 确定性局面 =====
// 甲 出 3(普通牌里最强, 只有 2 和王管得上) -> 乙丙丁戊 都过牌
// 乙丙丁戊 手上**都比 3 小**且**没有对子** -> 甲之后领出的「对9」也没人能管
// -> AI 只会过牌
var HANDS = {
  A: [C('S', 3, 'a0'), C('S', 9, 'a1'), C('H', 9, 'a2'), C('S', 8, 'a3')],
  B: [C('S', 4, 'b0'), C('S', 5, 'b1'), C('S', 6, 'b2')],
  C: [C('S', 7, 'c0'), C('S', 8, 'c1'), C('H', 5, 'c2')],
  D: [C('S', 10, 'd0'), C('S', 11, 'd1'), C('H', 6, 'd2')],
  E: [C('S', 12, 'e0'), C('S', 13, 'e1'), C('H', 7, 'e2')]
};
g.newGame();
var st = g.gameState();
st.phase = 'PLAY';
var ids = ['A', 'B', 'C', 'D', 'E'];
st.players.forEach(function (p, i) { p.id = ids[i]; p.hand = HANDS[ids[i]].slice(); });
st['主A'] = { suit: 'D', establishedBy: 'A', viaMethod: 'LIANG_A' };
st['反A'] = null;
st['次方'] = null;
st['次方公开'] = true;
st['底牌公开'] = true;
st.table = [];
st.passedPlayers = [];
st.lastPlayer = null;
// 注: human 固定为 D —— 否则 newGame 随机把真人定成 A, 而
//   advanceCurrentPlayer 里「轮到真人就清掉真人的旧出牌显示」会把 A 的记录清掉,
//   断言就变成了测「轮到真人」而不是测「过牌清牌」。
g.__setState(st, { currentPlayer: 'A', human: 'D', clearLog: true });

// ===== A 真实出一张牌(走 doPlay 真实路径) =====
var aCard = g.gameState().players[0].hand[0];
g.selectedCards().push(aCard.id);
g.doPlay();
var playsAfterA = g.uiPlays() || {};
check('A 出牌后 uiPlays 里有 A 的记录', !!(playsAfterA.A && playsAfterA.A.length),
  JSON.stringify(Object.keys(g.uiPlays() || {})));
var trick0 = g.uiTrickId();
var tkAfterA = JSON.parse(JSON.stringify(g.uiPlaysTrick() || {}));   // A 出牌当下的轮次标记(要拷贝: 返回的是活对象, 轮到他时会被清掉)

// ===== B/C/D/E 连续过牌(期间没人出牌) =====
// [2026-11-03] 轮回到真人时 game.js 会**清掉真人的「不出」**(轮到自己 = 重新出牌),
//   所以只能在**过牌当下**逐个断言, 不能等整圈跑完再看全表。
//   AI 延迟调大 -> AI 链异步跑, 断言时链条还没转回真人。
g.__setAiDelay(5000);
var pdSnap = {};
['B', 'C', 'D', 'E'].forEach(function (pid) {
  g.__setState(g.gameState(), { currentPlayer: pid, clearLog: false });
  g.doPass();
  pdSnap[pid] = !!(g.uiPassed() || {})[pid];
});
g.__setAiDelay(0);

var pd = g.uiPassed() || {};
check('4 个过牌的人都记上了「不出」',
  !!(pdSnap.B && pdSnap.C && pdSnap.D && pdSnap.E),
  JSON.stringify(pdSnap) + ' now=' + JSON.stringify(pd));

var ts = texts();
var n = countBuChu(ts);
// 4 个「不出」= 乙丙戊(AI 座位) + 丁(真人自己的座位, 2026-10-26 补上的)
check('渲染里出现 4 个「不出」(4 个玩家)', n >= 4, 'count=' + n);

// 轮末 -> 轮次 +1, 但**桌上的牌仍然要显示**
// [2026-10-26] 轮次断言已删除: uiTrickId 现在**只在轮末递增**, 而「不出」的判定
//   已改成「PASS 就无条件清掉他的出牌显示」, 不再依赖轮次 -> 这条断言没有意义了。
// 注: 「轮末后牌仍在」这条**故意不断言** —— doPlay 之后 runAI 会接管,
//   AI 出了新点数就会开新一轮, 旧记录被清是**正确行为**(牌确实被引擎收走了)。
//   真正要保证的是第 1 条: 出牌的瞬间那张牌必须进 uiPlays。

// 本轮出过牌(A) -> 他不该显示「不出」; 过牌的 B/C/D/E -> 该显示
var tk = g.uiPlaysTrick() || {};
check('轮次跟踪可用', tkAfterA.A !== undefined, JSON.stringify(tkAfterA));

// ===== 过牌后: **过牌的人**上一轮留下的出牌显示要清掉(不然会挡住他的「不出」文字) =====
// 注意: **没过牌的人**(比如出了牌但这轮没轮到的)他的牌**应该留在桌面上** ——
//       用户要看到「打出的牌」, 不能因为换轮就把别人的牌抹掉。
var psA = g.uiPlays() || {};
var tkA = g.uiPlaysTrick() || {};
var _passedIds = Object.keys(pd || {});
var _bad = _passedIds.filter(function (pid) {
  return psA[pid] && tkA[pid] !== g.uiTrickId();   // 过牌的人名下还挂着上一轮的牌
});
check('过牌的人: 上一轮留下的出牌显示已清掉',
  _bad.length === 0, 'bad=' + JSON.stringify(_bad) + ' passed=' + JSON.stringify(_passedIds) +
  ' uiPlays=' + JSON.stringify(Object.keys(psA)));
// [2026-11-03 用户] 「轮到AI玩家出牌时, 闹钟显示的时候要把他上一轮出的牌或者不出文字清掉」
//   -> 轮到谁就清掉他上一轮留下的出牌显示(轮末回到 A 时清)。
check('轮到谁 -> 上一手牌的显示被清掉(闹钟不跟旧牌打架)',
  !(psA.A && psA.A.length), 'uiPlays=' + JSON.stringify(Object.keys(psA)));

// ===== 源码级守卫: **AI 过牌路径**(applyAction)必须置位 uiPassed =====
// 背景: v0.27.0 只改了 doPlay(真人出牌), 漏了 applyAction(AI 出牌)那条路径 ->
//       AI 出牌时「不出」永远不显示(用户连报了好几轮)。
//       行为级断言容易受随机局面影响, 这里再加一条**直接守住那行代码**的守卫。
var _fs = require('fs');
var _path = require('path');
var _src = _fs.readFileSync(_path.join(__dirname, '..', 'game.js'), 'utf8');
check('源码: applyAction 的 PASS 分支置位了「不出」',
  /action\.type === ACTIONS\.PASS[\s\S]{0,600}_uiPassCleanup\(currentPlayer\)/.test(_src));
check('源码: _uiPassCleanup 里真正置位了 uiPassed',
  /function _uiPassCleanup[\s\S]{0,400}uiPassed\[pid\] = true/.test(_src));

// ===== 关键: **AI 过牌**路径也必须置位「不出」=====
// [2026-11-09 修 flaky] 原来这段: g.newGame() 拿**随机手牌** + 跑 AI 链 +
//   从**日志**里反推「谁最后动作是 PASS」-> 三个 flake 源:
//     ① 随机局面(AI 能管上就不过牌, 断言时有时无)
//     ② 新局后日志里还留着上一局的 PASS 行, 「最后动作」可能取自旧局
//     ③ AI 链是异步的(延迟跑), 断言时链条可能还没跑完/已经跑了
//   现在改成: **固定手牌 + 先出一张再逐个显式过牌**, 直接查 uiPassed(不猜、不靠日志)。
//   applyAction 那条**自动**过牌路径由上面的**源码级守卫**守住, 不用随机局面去撞。
g.newGame();
var st2 = g.gameState();
st2.phase = 'PLAY';
st2.players.forEach(function (p2, i2) { p2.id = ids[i2]; p2.hand = HANDS[ids[i2]].slice(); });
st2['主A'] = { suit: 'D', establishedBy: 'A', viaMethod: 'LIANG_A' };
st2['反A'] = null; st2['次方'] = null; st2['次方公开'] = true; st2['底牌公开'] = true;
st2.table = []; st2.passedPlayers = []; st2.lastPlayer = null;
g.__setState(st2, { currentPlayer: 'A', human: 'D', clearLog: true });
g.__setAiDelay(5000);                       // 别让 AI 链插进来
g.selectedCards().push(g.gameState().players[0].hand[0].id);
g.doPlay();                                 // 先出一张, 让后面的人能过牌
var pd3 = {};
['B', 'C', 'E'].forEach(function (pid) {
  g.__setState(g.gameState(), { currentPlayer: pid, clearLog: false });
  g.doPass();
  pd3[pid] = !!(g.uiPassed() || {})[pid];
});
g.__setAiDelay(0);
check('AI 座位过牌 -> 都有「不出」标记', !!(pd3.B && pd3.C && pd3.E), JSON.stringify(pd3));

console.log('test-ui-pass-display: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
