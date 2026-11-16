// tests/test-ui-history.js
// [2026-11-16 战绩页] 面板渲染：标题/汇总/行文本/关闭按钮命中区；空列表与错误态文案。
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

// 1. 默认不显示
check('1.1 默认不显示面板', g.__historyOpen() === false);

// 2. 有数据：标题、汇总、三行内容
g.__setHistory([
  { time: '11-16 13:00', mode: '2V3暗打', result: '主胜', delta: '+6' },
  { time: '11-15 09:00', mode: '1V4明打', result: '抓胜', delta: '-4' }
], 'ok', '最近 2 局：1 胜 1 负 0 平');
var texts = g.__renderTexts();
function has(re) { return texts.some(function (t) { return re.test(t); }); }
check('2.1 面板已打开', g.__historyOpen() === true);
check('2.2 标题', has(/^最近战绩$/), texts.join(' | '));
check('2.3 汇总行', has(/最近 2 局：1 胜 1 负 0 平/));
check('2.4 模式文本', has(/^2V3暗打$/));
check('2.5 结果文本', has(/^主胜$/));
check('2.6 得分 +6', has(/^\+6$/));
check('2.7 得分 -4', has(/^-4$/));
check('2.8 关闭按钮', has(/^关闭$/));

// 3. 空列表
g.__setHistory([], 'ok', '最近 0 局：0 胜 0 负 0 平');
texts = g.__renderTexts();
check('3.1 空列表提示', texts.some(function (t) { return /还没有战绩/.test(t); }), texts.join(' | '));

// 4. 错误态
g.__setHistory([], 'err', '');
check('4.1 错误提示', g.__renderTexts().some(function (t) { return /读取失败/.test(t); }));

// 5. 关闭按钮不盖住标题，且在画布内
var close = g.__historyClose ? g.__historyClose() : null;
check('5.1 关闭命中区存在', !!close);
if (close) {
  check('5.2 命中区在画布内', close.x >= 0 && close.y >= 0 && close.x + close.w <= 2000 && close.y + close.h <= 2000);
}
console.log('\ntest-ui-history: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
