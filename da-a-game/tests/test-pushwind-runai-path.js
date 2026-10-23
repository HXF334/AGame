// tests/test-pushwind-runai-path.js
// 回归: runAI 的「手牌空 -> 强制过牌」分支必须把真实轮次结束标志传给
//       doPushWindIfPending, 否则推风永不触发。
//
// 背景 —— 这是 4798e4a 那个 bug 的**唯一有效防线**:
//   修复前 runAI 里 6 处调用点全是硬编码 doPushWindIfPending(false)。
//   函数 doPushWindIfPending 本身完全正确, 所以任何只测它单测的用例
//   (含 test-pushwind-trigger.js 的 14 项)都会照样全绿, 抓不到传参错误。
//   本测试必须真的驱动 runAI。
//
// 为什么专挑「手牌空」分支 (而非让 AI 主动过牌):
//   1) 该分支直接 transition(PASS), 不经 chooseAction, **确定性**。
//      早期版本想靠 AI 自己选择过牌, 但它会硬凑牌型出牌
//      (桌面 ♠3 是第二大牌, AI 仍出 3 张), 9 项里 6 项失败。
//   2) 它正是用户 2026-10-23 日志里出问题的路径。
//   另: handlePlay 从不清桌(出牌不结束一局), 故 AI 出牌分支的轮次标志
//      结构上恒为 false, 无法用于触发推风, 只验证 lastEmptiedPlayer 被赋值。
//
// 隔离手法 (踩过的坑):
//   - mock 必须在 require('../game.js') 之前安装: ctx 在 require 时一次性确定,
//     先 require 再 install 会让 ctx 恒 null -> runAI 首行直接 return(初版 6 项失败)。
//   - human 设成下一个玩家, 使 while 循环只执行当前这一个 AI 动作就停。
//     绝不能用 human:'ZZZ': 那会让 runAI 打完整局, 读到的日志来自后面某一轮,
//     曾据此误判"引擎跳阵营"。
var mock = require('./mock-wx.js');
mock.install({ width: 900, height: 500 });   // 必须在 require game.js 之前

var SB = require('./lib/state-builder.js');
var g = require('../game.js');

var passed = 0, failed = 0, fail = [];
function check(name, cond, detail) {
  if (cond) passed++; else { failed++; fail.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
function logStr() { return g.logHistory().join(' || '); }
function pushSeg(key) {
  var segs = logStr().split('||').filter(function (l) { return l.indexOf(key) >= 0; });
  return segs.length ? segs[segs.length - 1].trim() : '';
}
function target() {
  var m = pushSeg('推风完成').match(/目标=([甲乙丙丁戊])/);
  return m ? m[1] : '';
}

// 主方=[甲,丁] 抓方=[乙,丙,戊]
function build(o) {
  var st = SB.build({
    handMap: {}, table: o.table || [], lastPlayer: o.lastPlayer || 'A',
    passedPlayers: o.passedPlayers || [],
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: true, 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_暗打'
  });
  var sizes = o.sizes || {};
  Object.keys(sizes).forEach(function (pid) {
    var p = st.players.filter(function (x) { return x.id === pid; })[0];
    p.hand = p.hand.slice(0, sizes[pid]);
  });
  return st;
}

// ============ 1. AI 手牌空 -> 强制过牌收桌 -> 必须触发推风 ============
section('1. runAI 手牌空分支过牌收桌 -> 推风必须触发, 目标同阵营');
{
  // 丙(抓方) 已出完且是 lastPlayer; 甲乙丁已过牌; 轮到戊(抓方, 手牌空) 强制过牌收桌
  var st = build({
    table: [SB.C('S', 3)],
    lastPlayer: 'C',
    passedPlayers: ['A', 'B'],
    sizes: { C: 0, E: 0 }
  });
  g.__setState(st, { currentPlayer: 'E', human: 'D', lastEmptiedPlayer: 'C', clearLog: true });
  check('1.0 前置: currentPlayer=戊', g.currentPlayer() === 'E', String(g.currentPlayer()));

  g.runAI();   // 戊走「手牌空」分支强制过牌; human=丁 故只走一步

  var lg = logStr();
  check('1.1 戊执行了 PASS', lg.indexOf('PASS') >= 0, lg.slice(-150));
  check('1.2 出现「推风触发」(runAI 传了真实标志而非 false)', lg.indexOf('推风触发') >= 0, lg.slice(-170));
  check('1.3 未出现「推风失败」', lg.indexOf('推风失败') < 0, lg.slice(-170));

  var s = pushSeg('推风完成');
  check('1.4 出现「推风完成」', !!s, lg.slice(-170));
  if (s) {
    check('1.5 触发者=丙', s.indexOf('触发=丙') >= 0, s);
    check('1.6 标注抓方阵营', s.indexOf('抓方') >= 0, s);
    // 丙属抓方[乙,丙,戊]; 丙戊均已空 -> 只剩乙
    check('1.7 目标=乙(同阵营唯一未空者)', target() === '乙', 'target=' + target() + ' | ' + s);
  }
  console.log('   [取证] ' + lg.split('||').slice(-4).join(' | '));
}

// ============ 2. AI 手牌空 -> 强制过牌但轮次未结束 -> 不触发 ============
section('2. runAI 手牌空分支过牌但轮次未结束 -> 不应触发');
{
  // 甲乙丁 只有甲乙过牌, 丁未过 -> 戊过牌后轮次没结束
  var st = build({
    table: [SB.C('S', 3)],
    lastPlayer: 'C',
    passedPlayers: ['A'],
    sizes: { C: 0, E: 0 }
  });
  g.__setState(st, { currentPlayer: 'E', human: 'D', lastEmptiedPlayer: 'C', clearLog: true });
  g.runAI();

  var lg = logStr();
  check('2.1 戊执行了 PASS', lg.indexOf('PASS') >= 0, lg.slice(-150));
  check('2.2 轮次未结束 -> 未触发推风', lg.indexOf('推风触发') < 0, lg.slice(-170));
  console.log('   [取证] ' + lg.split('||').slice(-4).join(' | '));
}

// ============ 3. AI 出牌出完 -> lastEmptiedPlayer 必须被赋值 ============
section('3. runAI 出牌出完 -> lastEmptiedPlayer 必须被赋值(后续推风的前提)');
{
  // 桌面为空, 戊手里 1 张 -> 只能出牌, 出完即为推风触发者
  var st = build({ table: [], lastPlayer: 'C', passedPlayers: [], sizes: { C: 0 } });
  st.players.filter(function (p) { return p.id === 'E'; })[0].hand = [SB.C('S', 4)];

  g.__setState(st, { currentPlayer: 'E', human: 'D', clearLog: true });
  g.runAI();

  var lg = logStr();
  check('3.1 戊执行了 PLAY', lg.indexOf('戊 PLAY') >= 0, lg.slice(-150));
  check('3.2 戊已出完牌并记录', lg.indexOf('出完牌') >= 0, lg.slice(-150));
  var e = g.gameState().players.filter(function (p) { return p.id === 'E'; })[0];
  check('3.3 戊手牌确为 0', e && e.hand.length === 0, e ? 'len=' + e.hand.length : 'no player');
  console.log('   [取证] ' + lg.split('||').slice(-4).join(' | '));
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); fail.forEach(function (f) { console.log('  - ' + f); }); }
mock.uninstall();
process.exit(failed > 0 ? 1 : 0);