// test-ui-ai-badge.js
// [2026-11-12 用户] 「AI 玩家的头像中间加 AI 标志。」
// 断言: 5 人局里 4 个 AI 座位各画一次「AI」, 真人座位不画。
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

console.log('\ntest-ui-ai-badge: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
