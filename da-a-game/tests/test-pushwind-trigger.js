// tests/test-pushwind-trigger.js
// 单元回归: doPushWindIfPending 的触发判定 (用户 2026-10-23 日志实证的 BUG)
//
// 为什么用单元测试而不是整局集成测试:
//   整局测试要走 doPlay -> runAI 链式接管 -> doPass, human/AI 分支交织,
//   很难精确构造「XX 恰好剩 1 张并正好该他收桌」的场景 —— 我为此失败过两次
//   (CANNOT_BEAT 单张压不过桌面 / SB.build 补牌把手牌又填满)。
//   而本次修复的核心就是**这一个函数**的入参判定, 直接测它最精确、最稳。
//
// 覆盖 (主方=[甲,丁] 抓方=[乙,丙,戊]):
//   1. 轮次未结束            -> 不触发
//   2. 轮次结束但无人出完     -> 不触发
//   3. 触发者仍有牌          -> 不触发(防陈旧 lastEmptiedPlayer)
//   4. 抓方出完              -> 触发, 目标必须是抓方且仍持牌
//   5. 主方出完              -> 触发, 目标必须是主方(§9.3 同阵营)
//   6. 触发者非本轮 lastPlayer -> 不触发
//   2) 出完牌那张必须**能压过桌面**, 否则 CANNOT_BEAT。
//
// 【关键踩坑】本测试最初装了 mock-wx (提供 canvas), 且 __setState 传了 human:'ZZZ'
//   (不存在的玩家) —— 于是 runAI() 判定「无人类玩家」而**自动打完整局**,
//   后续读到的「推风完成」来自后面某一轮, 而非本场景, 导致误判引擎跳阵营。
//   修法: **不装 mock**, ctx 保持 null -> runAI() 首行 `if (!ctx) return` 直接返回,
//   AI 不会接管, 被测逻辑完全隔离。
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
  var s = pushSeg('推风完成');
  var m = s.match(/目标=([甲乙丙丁戊])/);
  return m ? m[1] : '';
}

// 精确控制手牌: sizes 给每人手牌张数, table 桌面, lastPlayer 本轮最后出牌者
function build(o) {
  var st = SB.build({
    handMap: {}, table: o.table || [], lastPlayer: o.lastPlayer || 'A',
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
// 不装 mock-wx: ctx 保持 null, runAI() 首行直接 return, AI 不会自动接管
function setup(st, cur, emptied) {
  g.__setState(st, { currentPlayer: cur, human: 'ZZZ', lastEmptiedPlayer: emptied, clearLog: true });
}

// ---------- 1. 轮次未结束 -> 不触发 ----------
section('1. roundJustEnded=false -> 不触发');
{
  setup(build({ table: [SB.C('S', 9)], lastPlayer: 'E', sizes: { E: 0 } }), 'D', 'E');
  g.doPushWindIfPending(false);
  check('1.1 未触发', logStr().indexOf('推风触发') < 0, logStr().slice(-90));
  check('1.2 无推风完成', logStr().indexOf('推风完成') < 0, logStr().slice(-90));
}

// ---------- 2. 轮次结束但本轮无人出完 ----------
section('2. 轮次结束但 lastEmptiedPlayer=null -> 不触发');
{
  setup(build({ table: [], lastPlayer: 'A' }), 'B', null);
  g.doPushWindIfPending(true);
  check('2.1 未触发', logStr().indexOf('推风触发') < 0, logStr().slice(-90));
}

// ---------- 3. 触发者仍有牌(陈旧 lastEmptiedPlayer) ----------
section('3. 触发者手上仍有牌 -> 不触发');
{
  // 戊名义上是触发者但手牌没空(陈旧值)
  setup(build({ table: [], lastPlayer: 'E', sizes: { E: 5 } }), 'D', 'E');
  g.doPushWindIfPending(true);
  check('3.1 未触发', logStr().indexOf('推风触发') < 0, logStr().slice(-90));
}

// ---------- 4. 抓方出完 -> 目标是抓方 ----------
section('4. 抓方(戊)出完 -> 触发且目标是抓方[乙,丙]');
{
  // 戊已空(手牌 0), 抓方还有牌的只有乙丙; 主方甲丁有牌
  setup(build({ table: [], lastPlayer: 'E', sizes: { E: 0 } }), 'D', 'E');
  g.doPushWindIfPending(true);
  var lg = logStr();
  check('4.1 出现推风触发', lg.indexOf('推风触发') >= 0, lg.slice(-120));
  check('4.2 出现推风完成', lg.indexOf('推风完成') >= 0, lg.slice(-120));
  var s = pushSeg('推风完成');
  check('4.3 触发者=戊', s.indexOf('触发=戊') >= 0, s);
  check('4.4 标注抓方', s.indexOf('抓方') >= 0, s);
  check('4.5 目标∈抓方且仍持牌[乙,丙]', target() === '乙' || target() === '丙',
    'target=' + target() + ' | ' + s);
  console.log('   [取证] ' + s);
}

// ---------- 5. 主方出完 -> 目标是主方(同阵营) ----------
section('5. 主方(丁)出完 -> 触发且目标=甲(同阵营唯一未空主方)');
{
  // 丁已空; 主方剩甲有牌; 抓方乙丙戊全有牌 —— 错按普通轮转会推给抓方
  setup(build({ table: [], lastPlayer: 'D', sizes: { D: 0 } }), 'B', 'D');
  g.doPushWindIfPending(true);
  var lg = logStr();
  check('5.1 出现推风触发', lg.indexOf('推风触发') >= 0, lg.slice(-120));
  var s = pushSeg('推风完成');
  check('5.2 触发者=丁', s.indexOf('触发=丁') >= 0, s);
  check('5.3 标注主方', s.indexOf('主方') >= 0, s);
  check('5.4 目标=甲(§9.3 同阵营, 非抓方)', target() === '甲', 'target=' + target() + ' | ' + s);
  console.log('   [取证] ' + s);
}

// ---------- 6. 触发者不是本轮 lastPlayer -> 不触发 ----------
section('6. 触发者 != lastPlayer -> 不触发(陈旧值防护)');
{
  // lastPlayer 是甲, 但 lastEmptiedPlayer 却是戊(戊上一轮就出完了)
  setup(build({ table: [], lastPlayer: 'A', sizes: { E: 0 } }), 'D', 'E');
  g.doPushWindIfPending(true);
  check('6.1 未触发', logStr().indexOf('推风触发') < 0, logStr().slice(-120));
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); fail.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed > 0 ? 1 : 0);