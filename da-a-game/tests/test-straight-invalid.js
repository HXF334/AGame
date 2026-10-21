// tests/test-straight-invalid.js — 回归: 非连张不能识别为 STRAIGHT (2026-10-20 bug)
const assert = require('assert');
const { createNormalCard } = require('../src/card.js');
const { identifyHand } = require('../src/hand-types.js');

function C(s, r) { return createNormalCard(s, r); }

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  FAIL  ' + name + '\n        ' + (e && e.message)); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

section('1. 重复点数不能识别为连张 (核心回归)');

test('1.1 4-4-5 不是连张 → INVALID (原 bug: 误判为 STRAIGHT)', function () {
  const id = identifyHand([C('D', 4), C('S', 4), C('H', 5)]);
  assert.notStrictEqual(id.type, 'STRAIGHT',
    '445 不可能是连张, 却识别为 ' + id.type);
});

test('1.2 5-4-5 不是连张 → INVALID', function () {
  const id = identifyHand([C('D', 5), C('S', 4), C('H', 5)]);
  assert.notStrictEqual(id.type, 'STRAIGHT', '545 不可能是连张');
});

test('1.3 4-5-4 不是连张 → INVALID', function () {
  const id = identifyHand([C('D', 4), C('S', 5), C('H', 4)]);
  assert.notStrictEqual(id.type, 'STRAIGHT', '454 不可能是连张');
});

test('1.4 6-6-7 不是连张 → INVALID', function () {
  const id = identifyHand([C('D', 6), C('S', 6), C('H', 7)]);
  assert.notStrictEqual(id.type, 'STRAIGHT', '667 不可能是连张');
});

section('2. 真正的连张仍要识别为 STRAIGHT');

test('2.1 4-5-6 是连张 → STRAIGHT', function () {
  const id = identifyHand([C('D', 4), C('S', 5), C('H', 6)]);
  assert.strictEqual(id.type, 'STRAIGHT');
});

test('2.2 5-6-7-8 是连张 → STRAIGHT', function () {
  const id = identifyHand([C('D', 5), C('S', 6), C('H', 7), C('C', 8)]);
  assert.strictEqual(id.type, 'STRAIGHT');
  assert.strictEqual(id.length, 4);
});

test('2.3 A-2-3 (低端 A) 是连张 → STRAIGHT', function () {
  const id = identifyHand([C('D', 14), C('S', 2), C('H', 3)]);
  assert.strictEqual(id.type, 'STRAIGHT');
});

test('2.4 J-Q-K-A (高端 A) 是连张 → STRAIGHT', function () {
  const id = identifyHand([C('D', 11), C('S', 12), C('H', 13), C('C', 14)]);
  assert.strictEqual(id.type, 'STRAIGHT');
});

section('3. 长度不足不能是连张');

test('3.1 两张 4-5 不能是连张', function () {
  const id = identifyHand([C('D', 4), C('S', 5)]);
  assert.notStrictEqual(id.type, 'STRAIGHT', '2 张不能是连张');
});

test('3.2 单张不能是连张', function () {
  const id = identifyHand([C('D', 4)]);
  assert.strictEqual(id.type, 'SINGLE');
});

section('4. 间隔不连续不能是连张');

test('4.1 4-6-7 跳了 5 → 不能是连张', function () {
  const id = identifyHand([C('D', 4), C('S', 6), C('H', 7)]);
  assert.notStrictEqual(id.type, 'STRAIGHT', '467 跳了 5');
});

test('4.2 3-5-7 跳号 → 不能是连张', function () {
  const id = identifyHand([C('D', 3), C('S', 5), C('H', 7)]);
  assert.notStrictEqual(id.type, 'STRAIGHT', '357 跳号');
});

section('5. 同点数 3 张仍是蛋子不是连张');

test('5.1 4-4-4 是蛋子 → TRIPLE', function () {
  const id = identifyHand([C('D', 4), C('S', 4), C('H', 4)]);
  assert.strictEqual(id.type, 'TRIPLE');
});

test('5.2 K-K-K 是蛋子 → TRIPLE', function () {
  const id = identifyHand([C('D', 13), C('S', 13), C('H', 13)]);
  assert.strictEqual(id.type, 'TRIPLE');
});

section('6. 双龙 (每点 2 张) 不受此 bug 影响');

test('6.1 4-4-5-5-6-6 是双龙 → DOUBLE_STRAIGHT', function () {
  const id = identifyHand([
    C('D', 4), C('S', 4), C('H', 5), C('C', 5), C('D', 6), C('S', 6)
  ]);
  assert.strictEqual(id.type, 'DOUBLE_STRAIGHT');
});

test('6.2 4-4-5-5-6-7 (末尾不成对) 不是双龙', function () {
  const id = identifyHand([
    C('D', 4), C('S', 4), C('H', 5), C('C', 5), C('D', 6), C('S', 7)
  ]);
  assert.notStrictEqual(id.type, 'DOUBLE_STRAIGHT', '末尾不成对');
});

console.log('\n=== 总结 ===');
console.log('total: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(failed > 0 ? 1 : 0);