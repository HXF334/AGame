// tests/test-ui-ai-delay.js —— AI 出牌停顿: 真机/开发者工具模拟器 = 1 秒, node 无头 = 0
//
// 用户原话(2026-11-01): 「AI 出牌增加 1 秒等待, 包括测试环境」
//   2026-11-02 用户澄清: 「测试环境」具体指 **微信开发者工具模拟器**
//
// 改前: game.js 用 _uiTestMode() 判断 —— 它在 platform==='devtools' 时为真,
//   于是开发者工具模拟器里恰好是 0 毫秒(用户要的恰恰是这个环境),
//   而真机是 1000 毫秒 -> 模拟器与真机行为不一致。
// 改后: 纯函数 _computeAiDelay(wx):
//   - 没有 wx            -> 0    (node 无头, 根本没 ctx, AI 不跑)
//   - wx.__isMock 为真   -> 0    (tests/mock-wx.js 注入的假运行时; 65 个套件不能被拖慢)
//   - 其它(真机/模拟器)  -> 1000
//
// 跑法: node tests/test-ui-ai-delay.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}

// ===== 1) 纯函数的取值(不同环境) =====
var f = g.__computeAiDelay;
check('1.1 _computeAiDelay 存在且是函数', typeof f === 'function', typeof f);
check('1.2 没有 wx -> 0 毫秒(node 无头)', f(null) === 0, String(f(null)));
check('1.3 wx.__isMock -> 0 毫秒(node 无头 mock)', f({ __isMock: true }) === 0, String(f({ __isMock: true })));
var devtoolsWx = { getSystemInfoSync: function () { return { platform: 'devtools' }; } };
var iosWx = { getSystemInfoSync: function () { return { platform: 'ios' }; } };
check('1.4 开发者工具模拟器(真实 wx, platform=devtools) -> 1000 毫秒', f(devtoolsWx) === 1000, String(f(devtoolsWx)));
check('1.5 真机(platform=ios) -> 1000 毫秒', f(iosWx) === 1000, String(f(iosWx)));

// ===== 2) 当前进程(装了 mock-wx)的实际取值必须是 0, 否则 65 个套件会被拖慢 =====
check('2.1 本进程(mock-wx)的 AI 停顿是 0 毫秒', g.__aiDelay() === 0, String(g.__aiDelay()));

// ===== 3) 源码级守卫: 判定逻辑不能再挂在 _uiTestMode 上 =====
var _fs = require('fs');
var _path = require('path');
var _src = _fs.readFileSync(_path.join(__dirname, '..', 'game.js'), 'utf8');
var _assignAt = _src.indexOf('var AI_STEP_DELAY =');
var _assignLine = _assignAt >= 0 ? _src.slice(_assignAt, _assignAt + 160) : '';
check('3.1 源码: AI_STEP_DELAY 由 _computeAiDelay 决定',
  _assignLine.indexOf('_computeAiDelay(') >= 0, _assignLine.slice(0, 120));
check('3.2 源码: 停顿判定不再用 _uiTestMode(它在 devtools 下为真 -> 模拟器会变 0)',
  _assignLine.indexOf('_uiTestMode') < 0, _assignLine.slice(0, 120));
check('3.3 源码: mock 标记参与判定', _src.indexOf('__isMock') >= 0);

// ===== 4) mock-wx 必须打上这个标记(否则无头测试会被当成模拟器 -> 等 1 秒 -> 全套件变慢) =====
var _msrc = _fs.readFileSync(_path.join(__dirname, 'mock-wx.js'), 'utf8');
check('4.1 mock-wx 设置了 __isMock 标记', _msrc.indexOf('__isMock: true') >= 0);

console.log('test-ui-ai-delay: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
