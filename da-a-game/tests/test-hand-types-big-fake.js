// tests/test-hand-types-big-fake.js —— 大连珠蛋 / 大假八 牌型专项回归
//
// [用户 2026-11-04 裁定]
//   大连珠蛋: 4组及以上连续蛋子 (每组3张, 组数 4..7)
//   大假八:   连续点数组, **各组张数必须相同**(Q3=B), 满足:
//             (a) 每组>=4张 且 总张数>=12  -> 3组及以上
//             (b) 特例: 2组及以上, 每组>=5张, 总张数>=10  -> 最短 2组x5 = 10张
//   假八(2组x4=8张) / 连珠蛋(3组x3=9张) 保持独立不变。
//   同型比较: 张数优先, 张数相同再比连续起点(low)。
//   大连珠蛋 <-> 大假八 交叉: 优先比较张数, 张数相同则大假八更大。
//
// 跑法: node tests/test-hand-types-big-fake.js
var ht = require('../src/hand-types.js');
var combos = require('../src/combos.js');
var { createNormalCard } = require('../src/card.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var seq = 0;
function C(suit, rank) { return createNormalCard(suit, rank, 'bf' + (++seq)); }

// 每点 n 张, 点数从 start 连续 count 个
function groups(start, count, n) {
  var out = [];
  for (var g = 0; g < count; g++)
    for (var i = 0; i < n; i++) out.push(C(['S','H','D','C'][g % 4], start + g));
  return out;
}
function typeOf(cards) { return ht.identifyHand(cards); }

// 枚举可达: 手里有这些牌时, 枚举层能排出这个组合
function enumReaches(hand, len, wantType) {
  var cands = combos.candidateCombos(hand);
  for (var i = 0; i < cands.length; i++) {
    if (cands[i].length !== len) continue;
    var cards = cands[i].map(function (id) {
      return hand.filter(function (c) { return c.id === id; })[0];
    }).filter(Boolean);
    if (cards.length !== len) continue;
    if (typeOf(cards).type === wantType) return true;
  }
  return false;
}

section('1. 大连珠蛋 (4组及以上连续蛋子, 每组3张)');
{
  var h4 = typeOf(groups(2, 4, 3));
  check('1.1 4组x3张(12张) -> 大连珠蛋', h4.type === ht.HAND_TYPES.BIG_STRAIGHT_TRIPLE, h4.type + ' ' + (h4.reason || ''));
  var h5 = typeOf(groups(2, 5, 3));
  check('1.2 5组x3张(15张) -> 大连珠蛋', h5.type === ht.HAND_TYPES.BIG_STRAIGHT_TRIPLE, h5.type);
  var h7 = typeOf(groups(2, 7, 3));
  check('1.3 7组x3张(21张, 手牌上限) -> 大连珠蛋', h7.type === ht.HAND_TYPES.BIG_STRAIGHT_TRIPLE, h7.type);
  var h3 = typeOf(groups(2, 3, 3));
  check('1.4 3组x3张(9张) 仍是 连珠蛋(不变)', h3.type === ht.HAND_TYPES.STRAIGHT_TRIPLE, h3.type);
  var h2 = typeOf(groups(2, 2, 3));
  check('1.5 2组x3张(6张) 不是牌型', h2.type === ht.HAND_TYPES.INVALID, h2.type);
  var ace = groups(2, 6, 3);
  ace.unshift(C('S',14), C('H',14), C('D',14));
  var ha = typeOf(ace);
  check('1.6 用户例子 AAA+222+333+444+555+666 -> 大连珠蛋', ha.type === ht.HAND_TYPES.BIG_STRAIGHT_TRIPLE, ha.type + ' low=' + ha.low);
}

section('2. 大假八 (各组张数相同; 3组+ 每组4张; 特例 2组+ 每组5张且总>=10)');
{
  var f3 = typeOf(groups(10, 3, 4));
  check('2.1 3组x4张(12张) -> 大假八', f3.type === ht.HAND_TYPES.BIG_FAKE_EIGHT, f3.type + ' ' + (f3.reason || ''));
  var f4 = typeOf(groups(9, 4, 4));
  check('2.2 4组x4张(16张) -> 大假八', f4.type === ht.HAND_TYPES.BIG_FAKE_EIGHT, f4.type);
  var f5 = typeOf(groups(6, 2, 5));
  check('2.3 特例 2组x5张(10张) -> 大假八', f5.type === ht.HAND_TYPES.BIG_FAKE_EIGHT, f5.type + ' ' + (f5.reason || ''));
  var f6 = typeOf(groups(4, 2, 6));
  check('2.4 2组x6张(12张) -> 大假八', f6.type === ht.HAND_TYPES.BIG_FAKE_EIGHT, f6.type);
  var f8 = typeOf(groups(2, 2, 8));
  check('2.5 2组x8张(16张, 用户例子 22222222+33333333) -> 大假八', f8.type === ht.HAND_TYPES.BIG_FAKE_EIGHT, f8.type);
  var f7 = typeOf(groups(3, 3, 7));
  check('2.6 3组x7张(21张) -> 大假八', f7.type === ht.HAND_TYPES.BIG_FAKE_EIGHT, f7.type);
  var mixed = groups(6, 2, 5);
  mixed.push(C('C', 8));
  var fm = typeOf(mixed);
  check('2.7 各组张数不同 -> 不是大假八', fm.type !== ht.HAND_TYPES.BIG_FAKE_EIGHT, fm.type);
  var fa = typeOf(groups(11, 2, 4));
  check('2.8 假八(2组x4张) 仍是 假八(不变)', fa.type === ht.HAND_TYPES.FAKE_EIGHT, fa.type);
  var one = typeOf(groups(6, 1, 5));
  check('2.9 单组5张(5张) -> 大蛋子(不是大假八)', one.type === ht.HAND_TYPES.BIG_TRIPLE, one.type);
}

section('3. 同型比较: 张数优先, 张数相同再比连续起点');
{
  var a12 = typeOf(groups(2, 4, 3));
  var a15 = typeOf(groups(2, 5, 3));
  var b12 = typeOf(groups(7, 4, 3));
  check('3.1 15张大连珠蛋 > 12张大连珠蛋', ht.compareHands(a15, a12) > 0, String(ht.compareHands(a15, a12)));
  check('3.2 12张大连珠蛋 < 15张大连珠蛋', ht.compareHands(a12, a15) < 0, String(ht.compareHands(a12, a15)));
  check('3.3 同张数(12)比连续起点: low7 > low2', ht.compareHands(b12, a12) > 0, String(ht.compareHands(b12, a12)));
  var f10 = typeOf(groups(6, 2, 5));
  var f12 = typeOf(groups(9, 3, 4));
  check('3.4 12张大假八 > 10张大假八', ht.compareHands(f12, f10) > 0, String(ht.compareHands(f12, f10)));
}

section('4. 交叉比较: 大连珠蛋 <-> 大假八 优先比张数, 相同则大假八更大');
{
  var dz12 = typeOf(groups(2, 4, 3));
  var fj12 = typeOf(groups(9, 3, 4));
  var dz15 = typeOf(groups(2, 5, 3));
  var fj16 = typeOf(groups(2, 4, 4));
  check('4.1 12张大假八 > 12张大连珠蛋(同张数, 大假八大)', ht.canBeat(fj12, dz12) === true);
  check('4.2 12张大连珠蛋 < 12张大假八', ht.canBeat(dz12, fj12) === false);
  check('4.3 15张大连珠蛋 > 12张大假八(按张数)', ht.canBeat(dz15, fj12) === true);
  check('4.4 12张大连珠蛋 < 16张大假八(按张数)', ht.canBeat(dz12, fj16) === false);
}

section('5. 枚举层可达 (识别层认得出, 枚举层必须出得来)');
{
  check('5.1 大连珠蛋 4组x3张(12张) 可枚举', enumReaches(groups(2, 4, 3), 12, ht.HAND_TYPES.BIG_STRAIGHT_TRIPLE));
  check('5.2 大连珠蛋 5组x3张(15张) 可枚举', enumReaches(groups(2, 5, 3), 15, ht.HAND_TYPES.BIG_STRAIGHT_TRIPLE));
  check('5.3 大连珠蛋 7组x3张(21张) 可枚举', enumReaches(groups(2, 7, 3), 21, ht.HAND_TYPES.BIG_STRAIGHT_TRIPLE));
  check('5.4 大假八 3组x4张(12张) 可枚举', enumReaches(groups(10, 3, 4), 12, ht.HAND_TYPES.BIG_FAKE_EIGHT));
  check('5.5 大假八 2组x5张(10张) 可枚举', enumReaches(groups(6, 2, 5), 10, ht.HAND_TYPES.BIG_FAKE_EIGHT));
  check('5.6 大假八 2组x6张(12张) 可枚举', enumReaches(groups(4, 2, 6), 12, ht.HAND_TYPES.BIG_FAKE_EIGHT));
  check('5.7 大假八 2组x8张(16张) 可枚举', enumReaches(groups(2, 2, 8), 16, ht.HAND_TYPES.BIG_FAKE_EIGHT));
}

section('6. 顺带修: 7对以上的双龙枚举层也要出得来 (用户裁定一起修)');
{
  var dbl = groups(2, 7, 2);
  var td = typeOf(dbl);
  check('6.1 识别层: 7对连续 -> 双龙', td.type === ht.HAND_TYPES.DOUBLE_STRAIGHT, td.type + ' ' + (td.reason || ''));
  check('6.2 枚举层: 7对(14张) 可枚举(原来被 MAX_SEQ=13 卡掉)', enumReaches(dbl, 14, ht.HAND_TYPES.DOUBLE_STRAIGHT));
}

console.log('\ntest-hand-types-big-fake: ' + pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('Failed tests:');
  process.exit(1);
}
process.exit(0);
