// tests/test-autoplay-pushwind.js —— 托管出完牌 -> 轮末推风 回归
//
// [2026-11-12 P0] 背景:
//   game.js 的 _autoPlayDoPlay 曾经在 `if (手牌空) lastEmptiedPlayer = humanPlayer;`
//   的**下一行**无条件写 `lastEmptiedPlayer = null;`, 于是托管(真人)打出最后一手时,
//   「最后出完者」刚记下就被清掉 -> 该轮结束时 doPushWindIfPending 拿不到 trigger,
//   推风 0 次(违背 D-013「托管出完牌必须触发推风」)。
//   手动出完走的是 doPlay, 那条路径不写这句, 所以手动测试测不出来。
//
// 本用例固化三件事:
//   1. 托管打出最后一手 -> lastEmptiedPlayer 必须保留为真人席位;
//   2. 同一局面轮末调用 doPushWindIfPending(true) -> 推风到同阵营最近未出完者;
//   3. 推风后 trigger 被消费, 日志出现「推风完成: 触发=甲」。
//
// 跑法: node tests/test-autoplay-pushwind.js
// 无头: **不安装 mock-wx** -> game.js 的 ctx 为 null, runAI()/draw() 自动空转,
//   托管出完最后一手后状态停在同一回合, 便于精确断言「最后出完者」是否被保留。
//   (若装了 mock, enterPlayIfNeeded -> runAI 会把后续 AI 回合一口气打完。)
var SB = require('./lib/state-builder.js');
var GAME = require('../game.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}

// 2V3 暗打: 甲=主A(真人), 丁=次方(未公开); 甲手里只留 1 张, 其余牌进弃牌堆(108 守恒)
function mkState() {
  var st = SB.build({
    handMap: { A: [SB.C('H', 3)] },
    table: [], lastPlayer: 'C',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: false,
    主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_暗打'
  });
  var A = st.players.filter(function (p) { return p.id === 'A'; })[0];
  while (A.hand.length > 1) st.discarded.push(A.hand.pop());
  var total = SB.countAll(st);
  if (total !== 108) throw new Error('牌张不守恒: ' + total);
  return st;
}

GAME.__setState(mkState(), { currentPlayer: 'A', human: 'A', clearLog: true });
GAME.__setAutoPlay(true);

var tookOver = GAME.__autoPlayStep();
check('1 托管接管真人回合', tookOver === true, String(tookOver));

var st1 = GAME.gameState();
var me = st1.players.filter(function (p) { return p.id === 'A'; })[0];
check('2 真人最后一手已经打出', me.hand.length === 0, '剩 ' + me.hand.length + ' 张');
check('3 最后一手留在桌面', (st1.table || []).length === 1, 'table=' + (st1.table || []).length);
check('4 最后出完者被记录(不被清空)', GAME.__lastEmptiedPlayer() === 'A',
  'lastEmptiedPlayer=' + String(GAME.__lastEmptiedPlayer()));

// 轮末: 引擎在「最后一手被全场过牌」后以 roundJustEnded=true 调用该函数
GAME.doPushWindIfPending(true);

var st2 = GAME.gameState();
// §9.4: 次方未明确时, 顺时针找最近未出完的「非主A」玩家(不跳次A、不按阵营过滤)
check('5 推风目标 = 顺时针最近的非主A未出完者(乙)',
  GAME.currentPlayer() === 'B', 'currentPlayer=' + String(GAME.currentPlayer()));
check('6 推风触发者已被消费', st2['推风触发者'] === null, String(st2['推风触发者']));
check('7 日志记录推风完成且触发者是甲',
  GAME.logHistory().some(function (l) { return l.indexOf('推风完成: 触发=甲') >= 0; }),
  GAME.logHistory().filter(function (l) { return l.indexOf('推风') >= 0; }).join(' | '));

console.log('\ntest-autoplay-pushwind: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
process.exit(0);
