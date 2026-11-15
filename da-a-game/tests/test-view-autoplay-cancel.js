// tests/test-view-autoplay-cancel.js
// [2026-11-16 用户]
//   ① 观战视角不跨局：上一局切到某人，下一局必须回到真人自己；
//   ② 托管中轮到真人时取消托管，出牌/不出/提示三个按钮必须立刻回来。
var path = require('path');
var g = require(path.join(__dirname, '..', 'game.js'));
var SB = require('./lib/state-builder.js');

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

var st = SB.build({ handMap: { B: [SB.C('H', 5), SB.C('H', 6)] }, table: [SB.C('D', 9)], lastPlayer: 'C' });
g.__setState(st, { human: 'B', currentPlayer: 'B', clearLog: true });

// ① 视角跨局重置
g.__setObserver('C');
check('1.1 切换观察视角生效', g.__observer() === 'C', g.__observer());
g.newGame();
check('1.2 新局后视角回到真人自己', g.__observer() === null, String(g.__observer()));

// ② 取消托管后按钮回来
var st2 = SB.build({ handMap: { B: [SB.C('H', 5), SB.C('H', 6)] }, table: [SB.C('D', 9)], lastPlayer: 'C' });
g.__setState(st2, { human: 'B', currentPlayer: 'B', clearLog: true });
g.__setAutoPlay(true);
check('2.1 托管中三个按钮隐藏',
  g.uiButtons().filter(function (b) { return ['play', 'pass', 'hint'].indexOf(b.id) >= 0; }).length === 0,
  g.uiButtons().map(function (b) { return b.id; }).join(','));
g.__setAutoPlay(false);
check('2.2 取消托管后三个按钮立刻回来',
  g.uiButtons().filter(function (b) { return ['play', 'pass', 'hint'].indexOf(b.id) >= 0; }).length === 3,
  g.uiButtons().map(function (b) { return b.id; }).join(','));

console.log('\ntest-view-autoplay-cancel: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
