// tests/test-menu.js
// [2026-11-16 用户] 左上角菜单：☰ 点开下拉，含「音乐 / 音效 / 退出游戏」三项；
//   再点 ☰ 收起；选项文本随开关状态变化；退出项存在。
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

// 1. 默认收起：没有下拉项
check('1.1 默认收起无下拉项', g.__menuItems().length === 0, String(g.__menuItems().length));

// 2. 打开菜单：四个下拉项（音乐/音效/战绩/退出游戏）
g.__setMenuOpen(true);
var items = g.__menuItems();
check('2.1 下拉共四项', items.length === 4, String(items.length));
var texts = g.__renderTexts();
function has(re) { return texts.some(function (t) { return re.test(t); }); }
check('2.2 含音乐项', has(/^音乐：/), texts.join(' | '));
check('2.3 含音效项', has(/^音效：/), texts.join(' | '));
check('2.4 含战绩项', has(/^战绩$/), texts.join(' | '));
check('2.5 含退出游戏项', has(/退出游戏/), texts.join(' | '));

// 3. 四项顺序：音乐 → 音效 → 战绩 → 退出
check('3.1 顺序为 音乐→音效→战绩→退出',
  items[0].y < items[1].y && items[1].y < items[2].y && items[2].y < items[3].y,
  items.map(function (i) { return i.id + '@' + Math.round(i.y); }).join(','));

// 4. 命中区都在画布内、互不重叠
var inside = items.every(function (i) { return i.x >= 0 && i.x + i.w <= 2000 && i.y >= 0; });
check('4.1 命中区在画布内', inside);
var overlap = false;
for (var a = 0; a < items.length; a++) {
  for (var b = a + 1; b < items.length; b++) {
    var A = items[a], B = items[b];
    if (A.y < B.y + B.h && B.y < A.y + A.h) overlap = true;
  }
}
check('4.2 下拉项互不重叠', !overlap);

// 5. 再次点 ☰ 收起
g.__setMenuOpen(false);
check('5.1 收起后无下拉项', g.__menuItems().length === 0);

console.log('\ntest-menu: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
