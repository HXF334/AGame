// tests/test-pair-bigA-not-boost.js
// 回归: 多张牌型 (PAIR/TRIPLE/BIG_TRIPLE/...) 含大A 不应提升牌力
// Bug (2026-10-20): compareHands PAIR 分支用 singleRankEncoding, 该函数对 is主方大A
//                   返回 20, 导致 [大A, 普通A] 对A 的编码 20 > 对3 的 17,
//                   对A 错误地压过了对3。
// 依据 SKILL §6.2 (单张顺序含大A) vs §6 表 (对子只与对子互压) + §6.4 (单大A 只管单张)
// 修复: 新增 pairRankEncoding (纯点数, 不含大A加成) 供多张牌型使用。
var assert = require('assert');
var { createNormalCard, createBigJoker, createSmallJoker } = require('../src/card.js');
var { identifyHand, canBeat, HAND_TYPES } = require('../src/hand-types.js');

function C(s, r) { return createNormalCard(s, r); }
// createNormalCard 第 3 参是 id 而非 opts, 大A 必须手动标 flag
function BigA(s) { var c = createNormalCard(s, 14); c.is主方大A = true; return c; }
function H(cards) { return identifyHand(cards); }

var passed = 0, failed = 0;
var failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  FAIL  ' + name + '\n        ' + (e && e.message)); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

section('0. 构造前提');

test('0.1 BigA() 带 is主方大A=true', function () {
  assert.strictEqual(BigA('H').is主方大A, true);
});

test('0.2 C() 不带大A', function () {
  assert.strictEqual(C('H', 14).is主方大A, false);
});

section('1. 核心回归: 对A 含大A 不能压对3 (用户报的 bug)');

test('1.1 [大A-H, 普通A-D] 不能压 [3-S, 3-H]', function () {
  var pairA = H([BigA('H'), C('D', 14)]);
  var pair3 = H([C('S', 3), C('H', 3)]);
  assert.strictEqual(pairA.type, HAND_TYPES.PAIR);
  assert.strictEqual(canBeat(pairA, pair3), false, '对A(含大A) 不该压对3');
});

test('1.2 对3 能压 对A(含大A) — 3 > A', function () {
  var pairA = H([BigA('H'), C('D', 14)]);
  var pair3 = H([C('S', 3), C('H', 3)]);
  assert.strictEqual(canBeat(pair3, pairA), true, '对3 应该压对A');
});

test('1.3 大A 在第 2 张也不提升 (顺序无关)', function () {
  var pairA = H([C('D', 14), BigA('H')]);
  var pair3 = H([C('S', 3), C('H', 3)]);
  assert.strictEqual(canBeat(pairA, pair3), false, '大A 位置不影响');
});

test('1.4 两张都是大A 的对A 也不能压对3', function () {
  var c1 = BigA('H'); c1.id = 'H1';
  var c2 = BigA('C'); c2.id = 'C1';
  var pairA = H([c1, c2]);
  var pair3 = H([C('S', 3), C('H', 3)]);
  assert.strictEqual(canBeat(pairA, pair3), false, '对A 无论几张大A 都不该压对3');
});

test('1.5 对2 能压 对A(含大A) — 2 > A', function () {
  var pairA = H([BigA('H'), C('D', 14)]);
  var pair2 = H([C('S', 2), C('C', 2)]);
  assert.strictEqual(canBeat(pair2, pairA), true, '对2 应该压对A');
});

test('1.6 对A 含大A 仍按 A>K>Q (SKILL §6.2, 非扑克直觉)', function () {
  var pairA = H([BigA('H'), C('D', 14)]);
  // SKILL §6.2: 3 > 2 > A > K > Q —— A 比 K 大, 与扑克牌直觉相反
  assert.strictEqual(canBeat(pairA, H([C('S', 13), C('C', 13)])), true, 'A > K, 对A 能压对K');
  assert.strictEqual(canBeat(pairA, H([C('S', 12), C('C', 12)])), true, 'A > Q');
  assert.strictEqual(canBeat(pairA, H([C('S', 2), C('C', 2)])), false, '2 > A, 对A 压不了对2');
  assert.strictEqual(canBeat(pairA, H([C('S', 3), C('C', 3)])), false, '3 > A, 对A 压不了对3');
});

section('2. 含大A 的对子排序 = 普通对子');

test('2.1 对A(含大A) vs 对A(普通) → 互不压制', function () {
  var a1 = H([BigA('H'), C('D', 14)]);
  var a2 = H([C('C', 14), C('S', 14)]);
  assert.strictEqual(canBeat(a1, a2), false);
  assert.strictEqual(canBeat(a2, a1), false);
});

section('3. 大蛋子 / 真七 / 真八 跨牌型 (SKILL §6.3 全局牌力)');

test('3.1 大蛋子(4张A) 能压对子 — 全局牌力 大蛋子 > 对子', function () {
  var big4 = H([BigA('H'), C('D', 14), C('S', 14), C('C', 14)]);
  var pair3 = H([C('S', 3), C('H', 3)]);
  assert.strictEqual(big4.type, HAND_TYPES.BIG_TRIPLE, '应为 BIG_TRIPLE');
  assert.strictEqual(canBeat(big4, pair3), true, 'SKILL §6.3: 大蛋子 > 对子');
});

test('3.2 对子压不了大蛋子 (方向相反)', function () {
  var big4 = H([C('H', 5), C('D', 5), C('S', 5), C('C', 5)]);
  var pair10 = H([C('S', 10), C('C', 10)]);
  assert.strictEqual(canBeat(pair10, big4), false, '对子 压不了 大蛋子');
});

section('4. 单大A 特殊规则 (SKILL §6.4)');

test('4.1 单大A 不能管对子', function () {
  assert.strictEqual(canBeat(H([BigA('H')]), H([C('D', 5), C('S', 5)])), false);
});

test('4.2 单大A 能管普通单牌 (含大王/小王, §6.4 明列)', function () {
  assert.strictEqual(canBeat(H([BigA('H')]), H([C('D', 13)])), true, '管K');
  assert.strictEqual(canBeat(H([BigA('H')]), H([C('D', 3)])), true, '管3');
  assert.strictEqual(canBeat(H([BigA('H')]), H([createSmallJoker()])), true, '管小王');
  assert.strictEqual(canBeat(H([BigA('H')]), H([createBigJoker()])), true, '管大王');
});

test('4.3 4张大蛋子管不了单大A (§6.4: 只有5/6张才行)', function () {
  var four = H([BigA('H'), BigA('C'), C('D', 14), C('S', 14)]);
  assert.strictEqual(canBeat(four, H([BigA('H')])), false, '4张大A 压不了单大A');
});

test('4.5 双大A 不能管单大A (§6.4 明确)', function () {
  var c1 = BigA('H'); c1.id = 'H1';
  var c2 = BigA('H'); c2.id = 'H2';
  assert.strictEqual(canBeat(H([c1, c2]), H([BigA('H')])), false, '双大A 管不了单大A');
});

section('5. 双大A 独立牌型');

test('5.1 两张同花色大A → DOUBLE_BIG_A', function () {
  var c1 = BigA('H'); c1.id = 'H1';
  var c2 = BigA('H'); c2.id = 'H2';
  assert.strictEqual(H([c1, c2]).type, HAND_TYPES.DOUBLE_BIG_A);
});

test('5.2 双大A 能压对3', function () {
  var c1 = BigA('H'); c1.id = 'H1';
  var c2 = BigA('H'); c2.id = 'H2';
  assert.strictEqual(canBeat(H([c1, c2]), H([C('S', 3), C('H', 3)])), true);
});

test('5.3 不同花色大A 对 = 普通 PAIR (§6 表)', function () {
  assert.strictEqual(H([BigA('H'), C('S', 14)]).type, HAND_TYPES.PAIR);
  assert.strictEqual(H([C('H', 14), BigA('S')]).type, HAND_TYPES.PAIR);
});

test('5.4 一张普通A 混入 → 不再是双大A (§6.4)', function () {
  var c1 = BigA('H'); c1.id = 'H1';
  var c2 = BigA('H'); c2.id = 'H2';
  assert.strictEqual(H([c1, c2, C('D', 14)]).type !== HAND_TYPES.DOUBLE_BIG_A, true,
    '混入第三张后不应算双大A');
});

console.log('\n=== 总结 ===');
console.log('total: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed > 0 ? 1 : 0);
