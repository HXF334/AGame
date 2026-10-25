// tests/test-ui-v14.js — v0.14.0 UI 契约测试
// 覆盖: 座位环形规则 / 牌组构成 / 记牌器统计 / 大A 淡黄判定 / 敌友标记 / 牌面无角标 / 安全区
//
// [2026-10-25] 全部断言**不依赖随机牌局**:
//   记牌器的大A 栏从**实际状态**推导(主A 确立与否取决于随机发牌, 写死数字就会 flaky)。
var fs = require('fs');
var path = require('path');
var G = path.join(__dirname, '..');
var uiRender = require(path.join(G, 'ui-render.js'));
var engine = require(path.join(G, 'src', 'index.js'));

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// ---------- 1. 座位环形规则 ----------
section('1. 座位按逆时针环排(以真人为起点)');
// [用户 2026-10-25] 真人=丙 -> 左甲乙 / 右丁戊; 真人=丁 -> 左乙丙 / 右戊甲
var so = uiRender.seatOrder('C');
check('1.1 真人=丙: 左上=甲 左下=乙 右上=戊 右下=丁',
  so.L1 === 'A' && so.L2 === 'B' && so.R1 === 'E' && so.R2 === 'D', JSON.stringify(so));
var so2 = uiRender.seatOrder('D');
check('1.2 真人=丁: 左上=乙 左下=丙 右上=甲 右下=戊',
  so2.L1 === 'B' && so2.L2 === 'C' && so2.R1 === 'A' && so2.R2 === 'E', JSON.stringify(so2));
var so3 = uiRender.seatOrder('B');
check('1.3 真人=乙: 左上=戊 左下=甲 右上=丁 右下=丙',
  so3.L1 === 'E' && so3.L2 === 'A' && so3.R1 === 'D' && so3.R2 === 'C', JSON.stringify(so3));
var IDS = ['A', 'B', 'C', 'D', 'E'];
IDS.forEach(function (h) {
  var s = uiRender.seatOrder(h);
  var arr = [s.L1, s.L2, s.R1, s.R2];
  var uniq = arr.filter(function (v, i) { return arr.indexOf(v) === i; });
  check('1.4 真人=' + h + ' 时 4 个位置是其余 4 人且不重复',
    uniq.length === 4 && arr.indexOf(h) < 0, arr.join(','));
});
check('1.5 环序连续(左下=真人前驱1, 右上=真人后继2)', (function () {
  var s = uiRender.seatOrder('C');
  var i = IDS.indexOf('C');
  return s.L2 === IDS[(i - 1 + 5) % 5] && s.R1 === IDS[(i + 2) % 5];
})());

// ---------- 2. 牌组构成(两副牌) ----------
section('2. 牌组构成: 两副牌, 每点数 8 张, 大小王各 2 张, 每花色的 A 只有 2 张');
var deck = (engine.createDeck ? engine.createDeck() : require(path.join(G, 'src', 'card.js')).createDeck());
var byRank = {}, bigJ = 0, smallJ = 0, suitA = {};
deck.forEach(function (c) {
  if (c.isBigJoker) { bigJ++; return; }
  if (c.isSmallJoker) { smallJ++; return; }
  byRank[c.rank] = (byRank[c.rank] || 0) + 1;
  if (c.rank === 14) suitA[c.suit] = (suitA[c.suit] || 0) + 1;
});
check('2.1 总牌数 108', deck.length === 108, 'n=' + deck.length);
check('2.2 大王 2 张 小王 2 张', bigJ === 2 && smallJ === 2, 'big=' + bigJ + ' small=' + smallJ);
check('2.3 每个点数 8 张(2副 x 4花色)',
  Object.keys(byRank).every(function (r) { return byRank[r] === 8; }), JSON.stringify(byRank));
check('2.4 A 共 8 张(不是 16)', byRank[14] === 8, 'A=' + byRank[14]);
check('2.5 每花色的 A 只有 2 张 -> 所以"大A 最多两张"成立',
  Object.keys(suitA).every(function (s) { return suitA[s] === 2; }), JSON.stringify(suitA));

// ---------- 3. 记牌器统计 ----------
section('3. 记牌器: 还没打出的牌, 大A 单独统计');
var g = require(path.join(G, 'game.js'));
// 尽量让主A 确立(失败也无妨: 下面的断言从实际状态推导)
try {
  var _gi = g.gateInfo();
  if (_gi && _gi.choice && _gi.choice.kind === 'LIANG_A' && _gi.choice.eligible) g.humanLiangA(true);
} catch (e) { /* 忽略 */ }
var memo = g.uiMemoItems ? g.uiMemoItems() : null;
check('3.0 game.js 导出 uiMemoItems', !!memo);
if (memo) {
  var map = {};
  memo.forEach(function (it) { map[it.label] = it.value; });
  check('3.1 顺序 = 大A 大王 小王 3 2 A K Q J 10 9 8 7 6 5 4',
    memo.map(function (i2) { return i2.label; }).join(',') === '大A,大王,小王,3,2,A,K,Q,J,10,9,8,7,6,5,4',
    memo.map(function (i2) { return i2.label; }).join(','));
  check('3.2 大王=2 小王=2', map['大王'] === 2 && map['小王'] === 2, 'big=' + map['大王'] + ' small=' + map['小王']);
  check('3.3 A=8(含大A)', map['A'] === 8, 'A=' + map['A']);
  check('3.4 其他点数=8', map['3'] === 8 && map['4'] === 8 && map['10'] === 8,
    '3=' + map['3'] + ' 4=' + map['4'] + ' 10=' + map['10']);
  // 大A 栏: 从实际状态推导(主A 确立与否取决于随机发牌)
  var bigAceInState = 0;
  (g.gameState().players || []).forEach(function (p) {
    (p.hand || []).forEach(function (c) { if (g.uiIsMainAce(c)) bigAceInState++; });
    if (p['底牌'] && g.uiIsMainAce(p['底牌'])) bigAceInState++;
  });
  check('3.5 大A 栏 = 还没打出的 is主方大A 数(0 或 2)',
    map['大A'] === bigAceInState && (map['大A'] === 0 || map['大A'] === 2),
    'bigA=' + map['大A'] + ' state=' + bigAceInState);
  check('3.6 A 栏含大A: A - 大A = 普通A(6)', map['A'] - map['大A'] === 6,
    'A=' + map['A'] + ' bigA=' + map['大A']);
  var sum = memo.reduce(function (a, b) { return a + b.value; }, 0);
  check('3.7 记牌器总和 = 108 + 大A 栏(口径性重复计)', sum === 108 + map['大A'],
    'sum=' + sum + ' bigA=' + map['大A']);
}

// ---------- 4. 大A 淡黄判定 ----------
section('4. 大A 判定(引擎 is主方大A 标记)');
check('4.0 game.js 导出 uiIsMainAce', typeof g.uiIsMainAce === 'function');
if (typeof g.uiIsMainAce === 'function') {
  check('4.1 普通牌不是大A', g.uiIsMainAce({ rank: 3, suit: 'H' }) === false);
  check('4.2 打了标记的是大A', g.uiIsMainAce({ rank: 14, suit: 'H', 'is主方大A': true }) === true);
  check('4.3 标记失效后不是大A(反A/被4取回)', g.uiIsMainAce({ rank: 14, suit: 'H', 'is主方大A': false }) === false);
}

// ---------- 5. 敌友标记 ----------
section('5. 敌友标记: 三态循环, 每人一套, 新对局重置');
check('5.0 game.js 导出 uiMarks / uiMarkCycle', typeof g.uiMarks === 'function' && typeof g.uiMarkCycle === 'function');
if (typeof g.uiMarkCycle === 'function') {
  g.setHumanPlayer('B');
  var s1 = g.uiMarkCycle('C');
  var s2 = g.uiMarkCycle('C');
  var s3 = g.uiMarkCycle('C');
  check('5.1 三态循环 ? -> 友 -> 敌 -> ?',
    s1 === 'friend' && s2 === 'enemy' && (s3 === null || s3 === undefined),
    [s1, s2, s3].join('/'));
  // 重新标一次(B 标 C = 友), 再让 D 标 C = 敌 -> 两边不同
  g.setHumanPlayer('B');
  g.uiMarkCycle('C');
  g.setHumanPlayer('D');
  g.uiMarkCycle('C');
  g.uiMarkCycle('C');
  var mineB = g.uiMarks()['B'] || {};
  var mineD = g.uiMarks()['D'] || {};
  check('5.2 每人一套互不影响(B 标友 / D 标敌)',
    mineB['C'] === 'friend' && mineD['C'] === 'enemy',
    'B->C=' + mineB['C'] + ' D->C=' + mineD['C']);
  check('5.3 圆钮不含自己(不给自己标)', !mineB['B'], JSON.stringify(mineB));
  g.newGame();
  check('5.4 新对局重置标记', Object.keys(g.uiMarks() || {}).length === 0, JSON.stringify(g.uiMarks()));
}

// ---------- 6. 牌面无角标 ----------
section('6. 牌面: 无左上角小角标 / JOKER 竖排');
var src = fs.readFileSync(path.join(G, 'ui-render.js'), 'utf8');
var iCard = src.indexOf('function drawCard(');
var iBack = src.indexOf('function drawCardBack(');
var drawCardSrc = src.slice(iCard, iBack);
check('6.1 drawCard 里没有"角标/左上角"的小字绘制',
  drawCardSrc.indexOf('角标') < 0 && drawCardSrc.indexOf('左上角') < 0);
check('6.2 牌面只画 1 个点数 + 1 个花色',
  (drawCardSrc.match(/rankDesc\(card\)/g) || []).length === 1 &&
  (drawCardSrc.match(/SUIT_CHAR\[card\.suit\]/g) || []).length === 1);
check('6.3 大小王用英文 JOKER 竖排',
  drawCardSrc.indexOf("'JOKER'") >= 0 && /letters\[li\]/.test(drawCardSrc),
  '未找到 JOKER 竖排实现');
check('6.4 大A 用淡黄底', drawCardSrc.indexOf('#fdf3c8') >= 0);
check('6.5 牌背存在(深色底+图案)', src.indexOf('function drawCardBack(') >= 0 && src.indexOf('#1f3a63') >= 0);

// ---------- 7. 布局安全区 ----------
section('7. 刘海屏安全区: 左右各 6% 不放文字');
var lay = uiRender.layout(844, 390);
check('7.1 左右安全区 = 6%',
  Math.abs(lay.safeL / lay.vw - 0.06) < 0.001 && Math.abs(lay.safeR / lay.vw - 0.06) < 0.001,
  'L=' + lay.safeL + ' R=' + lay.safeR);
check('7.2 左侧座位在安全区之外', lay.seats[0].x > lay.safeL, 'x=' + lay.seats[0].x);
check('7.3 右侧座位在安全区之外', lay.seats[2].x < lay.vw - lay.safeR, 'x=' + lay.seats[2].x);
check('7.4 倒计时在按钮行中央正上方',
  Math.abs(lay.turn.x - lay.vw / 2) < 1 && lay.turn.y < lay.btn.y,
  'turn=' + lay.turn.x + ',' + lay.turn.y + ' btn=' + lay.btn.y);

console.log('\n' + '='.repeat(50));
console.log('test-ui-v14: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);