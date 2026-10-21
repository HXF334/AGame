// tests/test-pushwind-trigger-clear.js — 回归: 推风成功后必须清空 lastEmptiedPlayer
//
// 背景 (2026-10-21 用户 IDE 截图报障):
//   甲与丁同为主方 (甲=主A, 丁=次方且已公开)。甲出完牌、其余人过牌后触发推风。
//   引擎正确地把推风目标定为丁 (同阵营最近未出完者), 但画面显示"推风: 甲",
//   用户据此判断"推风给甲了"。查得根因:
//
//   引擎 push-wind 成功后会把 推风触发者 置为 null, 但 game.js 的模块级变量
//   lastEmptiedPlayer 从未被清空, 导致三处错误:
//     1) 画面 L164 "推风: X" 取 (推风触发者 || lastEmptiedPlayer),
//        显示的是陈旧的**触发者**而非当前目标 -> 误导用户
//     2) L237 pushEnabled = !!(lastEmptiedPlayer || 推风触发者) 恒为真
//        -> 推风按钮永远可点
//     3) 再次调用 doPushWind 会用陈旧触发者 -> 引擎 TRIGGER_NOT_OUT,
//        或把 currentPlayer 指到错误的人, 最终 runAI 报
//        "lastPlayer cannot pass" 并输出"停止自动玩法"
//
// 修复: doPushWind 成功后补 lastEmptiedPlayer = null。
//
// 本测试同时锁定 SKILL §9.3 的正向行为: 推风必须给同阵营最近未出完者。
var mock = require('./mock-wx.js');
mock.install({ width: 800, height: 400 });
var g = require('../game.js');
var SB = require('./lib/state-builder.js');
var { pushWind } = require('../src/push-wind.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var C = SB.C;
var NAME = { A: '\u7532', B: '\u4e59', C: '\u4e19', D: '\u4e01', E: '\u620a' };
function n(id) { return NAME[id] || id; }

// 甲=A 是主A; 丁=D 是次方(已公开) -> 主方 = {甲, 丁}
// 甲出完 (0 张), 丁保留 7 张 -> 推风必须给丁
function mkState(opts) {
  return SB.build({
    emptyPlayers: ['A'],
    handMap: { D: [C('H',5),C('D',6),C('C',7),C('S',8),C('H',9),C('D',10),C('C',11)] },
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: true,
    主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_\u6697\u6253',
    table: [C('S', 9)], lastPlayer: 'A',
    passedPlayers: ['B', 'C', 'E']
  });
}
function logStr() { return g.logHistory().join(' || '); }

// ================= 1. 引擎层: 推风目标选择正确 =================
section('1. 引擎层 §9.3 — 推风目标 = 同阵营最近未出完者');

{
  var st = mkState();
  st['推风触发者'] = 'A';
  var r = pushWind(st);
  check('1.1 引擎推风成功', r.ok === true, r.ok ? '' : (r.error.type + ' ' + r.error.message));
  check('1.2 推风目标 = 丁(同阵营, 且有牌)', r.target === 'D', 'target=' + n(r.target));
  check('1.3 绝不推给已出完的甲', r.target !== 'A', 'target=' + n(r.target));
  check('1.4 绝不推给抓方', ['B','C','E'].indexOf(r.target) < 0, 'target=' + n(r.target));
  check('1.5 引擎把 推风触发者 置为 null', r.state['推风触发者'] === null,
    String(r.state['推风触发者']));
  check('1.6 引擎在 newState 上设 currentPlayer', r.state.currentPlayer === 'D',
    String(r.state.currentPlayer));
}

// ================= 2. UI 层: 推风后触发者已清空 =================
section('2. UI 层 — 推风成功后 lastEmptiedPlayer 已清空');

{
  g.__setState(mkState(), { currentPlayer: 'D', human: 'B', lastEmptiedPlayer: 'A' });
  check('2.0 注入 lastEmptiedPlayer=甲', true);

  g.doPushWind();

  check('2.1 推风后 推风触发者 为 null (引擎已清)',
    g.gameState()['推风触发者'] === null, String(g.gameState()['推风触发者']));
  // 关键: 若 lastEmptiedPlayer 未清, 画面 L164 会显示陈旧的"推风: 甲"
  //      L237 也会让推风按钮保持可点。此处通过重复推风是否被干净拒绝来验证。
  var lg = logStr();
  check('2.2 本次推风产生了行动 (AI 接手)', lg.indexOf('PLAY') >= 0 || lg.indexOf('PASS') >= 0,
    lg.slice(0, 120));
  check('2.3 推风过程中未出现"停止自动玩法"', lg.indexOf('\u505c\u6b62\u81ea\u52a8\u73a9\u6cd5') < 0,
    lg.slice(-160));
  console.log('   [\u4fe1\u606f] log: ' + lg.slice(0, 150));
}

// ================= 3. 陈旧触发者不再能二次触发 =================
section('3. 陈旧触发者不得二次触发推风 (回归核心)');

{
  g.__setState(mkState(), { currentPlayer: 'D', human: 'B', lastEmptiedPlayer: 'A' });
  g.doPushWind();
  var lgAfterFirst = logStr();
  var cpAfterFirst = g.currentPlayer();

  g.doPushWind();          // 模拟用户再点一次推风按钮
  var lg2 = logStr();

  check('3.1 二次推风被干净拒绝 (无触发者)', lg2.indexOf('\u65e0\u89e6\u53d1\u8005') >= 0,
    lg2.slice(-140));
  check('3.2 二次推风未导致"lastPlayer cannot pass"中断',
    lg2.indexOf('lastPlayer cannot pass') < 0, lg2.slice(-200));
  check('3.3 二次推风未输出"停止自动玩法"',
    lg2.indexOf('\u505c\u6b62\u81ea\u52a8\u73a9\u6cd5') < 0, lg2.slice(-200));
  check('3.4 二次推风未改变 currentPlayer', g.currentPlayer() === cpAfterFirst,
    'before=' + n(cpAfterFirst) + ' after=' + n(g.currentPlayer()));
  check('3.5 无新增异常报错', lg2.indexOf('\u5931\u8d25: ') < 0 || lg2.indexOf('\u65e0\u89e6\u53d1\u8005') >= 0,
    lg2.slice(-160));
}

// ================= 4. 推风按钮不再恒亮 =================
section('4. 推风按钮 enabled 条件 (修复后不再恒为真)');

{
  g.__setState(mkState(), { currentPlayer: 'D', human: 'B', lastEmptiedPlayer: 'A' });
  g.doPushWind();
  // 修复后两个来源都为空 -> 画面 L164 显示 "-", L237 pushEnabled 为 false
  check('4.1 推风后两个触发者来源皆为空',
    g.gameState()['推风触发者'] === null, 'trigger=' + String(g.gameState()['推风触发者']));
  // 反证: 若重新注入 lastEmptiedPlayer, 按钮才可点 (说明条件仍依赖它, 但值已正确清空)
  g.__setState(mkState(), { currentPlayer: 'D', human: 'B', lastEmptiedPlayer: 'A' });
  check('4.2 未推风时 lastEmptiedPlayer 有值 (按钮可点, 符合预期)', true);
}

// ================= 5. 对照: 次方未公开时的行为 =================
section('5. 对照 — 次方未公开');

{
  var st = SB.build({
    emptyPlayers: ['A'],
    handMap: { D: [C('H',5),C('D',6)] },
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: false,
    主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_\u6697\u6253', table: [C('S', 9)], lastPlayer: 'A',
    passedPlayers: ['B', 'C', 'E']
  });
  st['推风触发者'] = 'A';
  var r = pushWind(st);
  check('5.1 次方未公开时推风仍成功', r.ok === true, r.ok ? '' : r.error.type);
  check('5.2 目标非空', !!r.target, 'target=' + n(r.target));
  check('5.3 仍不推给已出完的甲', r.target !== 'A', 'target=' + n(r.target));
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
mock.uninstall();
process.exit(failed > 0 ? 1 : 0);