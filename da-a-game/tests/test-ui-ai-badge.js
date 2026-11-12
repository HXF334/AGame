// test-ui-ai-badge.js
// [2026-11-12 用户] 「AI 玩家的头像中间加 AI 标志。」
// 断言: 5 人局里 4 个 AI 座位各画一次「AI」, 真人座位不画。
// [2026-11-12 用户] 「我切换的时候真人应该跟随。」-> 切到 AI 视角时,
//   底部被观察的 AI 也要显示 AI; 真正拿手机的人仍然不显示。
var path = require('path');
var g = require(path.join(__dirname, '..', 'game.js'));
var SB = require('./lib/state-builder.js');

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

var st = SB.build({ handMap: { A: [SB.C('S', 5), SB.C('H', 6)] }, table: [SB.C('S', 9)], lastPlayer: 'E' });
g.__setState(st, { human: 'A', currentPlayer: 'A', clearLog: true });

var texts = g.__renderTexts();
var aiCount = texts.filter(function (t) { return t === 'AI'; }).length;

console.log('\n=== 1. AI 座位标志 ===');
check('1.1 5 人局有 4 个 AI 座位标志', aiCount === 4, 'aiCount=' + aiCount);
check('1.2 真人座位不画 AI 标志', aiCount === 4, 'aiCount=' + aiCount);

// 换真人座位再验一次, 数量仍应是 4
var st2 = SB.build({ handMap: { C: [SB.C('D', 5)] }, table: [SB.C('D', 9)], lastPlayer: 'E' });
g.__setState(st2, { human: 'C', currentPlayer: 'C', clearLog: true });
var aiCount2 = g.__renderTexts().filter(function (t) { return t === 'AI'; }).length;
check('1.3 换真人座位后仍是 4 个', aiCount2 === 4, 'aiCount=' + aiCount2);

// [2026-11-12 用户] 切换观察视角: 标志跟随真实真人, 而不是跟随底部座位
console.log('\n=== 2. 切换视角后 AI 标志跟随真人 ===');
g.__setState(st2, { human: 'C', currentPlayer: 'C', clearLog: true });
var m = g.uiLayout();
var meX = m.me.x, meY = m.me.y;

g.__setObserver(null);
var atSelf = g.__renderTextsAt().filter(function (t) { return t.text === 'AI'; });
check('2.1 自己视角 4 个 AI, 底部不画', atSelf.length === 4 &&
  !atSelf.some(function (t) { return Math.abs(t.x - meX) < 1 && Math.abs(t.y - meY) < 1; }),
  'count=' + atSelf.length);

g.__setObserver('A');   // 切到 AI「甲」的视角
var atObs = g.__renderTextsAt().filter(function (t) { return t.text === 'AI'; });
check('2.2 观察 AI 视角仍是 4 个 AI', atObs.length === 4, 'count=' + atObs.length);
check('2.3 底部被观察的 AI 显示 AI', atObs.some(function (t) {
  return Math.abs(t.x - meX) < 1 && Math.abs(t.y - meY) < 1;
}), 'atMe=' + atObs.filter(function (t) {
  return Math.abs(t.x - meX) < 1 && Math.abs(t.y - meY) < 1;
}).length);

g.__setObserver(null);

console.log('\ntest-ui-ai-badge: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
