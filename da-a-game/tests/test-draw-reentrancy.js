// test-draw-reentrancy.js
// [2026-11-16] 单机局终偶发 "Maximum call stack size exceeded"（RangeError）。
// 断言: 渲染过程中若被重入 draw()，第二次调用必须直接返回，不递归、不抛异常。
var path = require('path');
var g = require(path.join(__dirname, '..', 'game.js'));
var uiRender = require(path.join(__dirname, '..', 'ui-render.js'));
var SB = require('./lib/state-builder.js');

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

var st = SB.build({ handMap: { A: [SB.C('S', 5), SB.C('H', 6)] }, table: [SB.C('S', 9)], lastPlayer: 'E' });
g.__setState(st, { human: 'A', currentPlayer: 'A', clearLog: true });

console.log('\n=== 1. draw 重入保护 ===');
var origRender = uiRender.render;
var renderCalls = 0;
var nestedReturned = false;
uiRender.render = function () {
  renderCalls++;
  if (!nestedReturned) {
    nestedReturned = true;
    // 模拟「渲染帧内被重入」: 若不设保护, 这里会无限递归直到爆栈
    try { g.draw(); } catch (e) { check('1.1 重入不抛异常', false, e && e.message); }
  }
  return origRender.apply(this, arguments);
};

var threw = null;
try { g.draw(); } catch (e) { threw = e; }
uiRender.render = origRender;

check('1.1 重入 draw 不抛异常', !threw, threw && threw.message);
check('1.2 外层渲染只跑一次', renderCalls === 1, 'renderCalls=' + renderCalls);
check('1.3 重入已发生', nestedReturned === true);

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
