// tests/test-ui-liang-countdown.js —— 亮A 阶段: 5 秒倒计时, 到点自动跳过亮A
//
// 用户原话(2026-10-27):
//   「亮A阶段的不亮按钮不要了, 换成5秒倒计时。
//     倒计时结束没人亮A的话自动跳过亮A进入强制排查阶段。」
//
// 跑法: node tests/test-ui-liang-countdown.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var { createNormalCard } = require('../src/card.js');
g.__setAiDelay(0);
function C(suit, rank, deck) { return createNormalCard(suit, rank, deck); }

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}

g.newGame();
var aS = C('S', 14, 's1');
// 注入亮A 闸门(走和生产流程同一条路 -> 会启动 5 秒倒计时)
g.__setGateChoice({ kind: 'LIANG_A', eligible: true, reason: '测试注入', cards: [aS] });

var dl = g.uiLiangDeadline();
check('亮A 闸门启动了倒计时', dl > 0, 'deadline=' + dl);
check('倒计时是 **5 秒**', Math.abs((dl - Date.now()) - 5000) < 800,
  '剩余=' + (dl - Date.now()) + 'ms');
check('倒计时期间闸门还在(等真人决定)', !!g.gateInfo().choice,
  JSON.stringify(g.gateInfo().choice));

setTimeout(function () {
  var gi = g.gateInfo();
  check('5 秒到点: 闸门被自动消费(不再等真人点)',
    !gi.choice || gi.choice.kind !== 'LIANG_A',
    'choice=' + JSON.stringify(gi.choice));
  check('5 秒到点: 流程继续往下走(阶段已推进)',
    gi.idx > 0 || (gi.choice && gi.choice.kind !== 'LIANG_A'),
    'idx=' + gi.idx + ' stage=' + gi.stage);
  var lg = g.logHistory().join(' || ');
  check('日志里有「倒计时结束」的记录', lg.indexOf('倒计时结束') >= 0, lg.slice(-160));

  console.log('test-ui-liang-countdown: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, 5600);
