// tests/test-hand-types.js — §6 牌型识别 第一批
// 跑法：node tests/test-hand-types.js
//
// 第一批范围（6 种核心 + 跨类型规则）：单张 / 对子 / 蛋子 / 龙 / 双龙 / 双王
// 严格按 SKILL.md §6.1 / §6.2 / §6.3 / §6.4 实现
// 跑测试时所有用例应红（stub 全 INVALID）

const assert = require('assert');
const { HAND_TYPES, identifyHand, compareHands, canBeat } = require('../src/hand-types.js');

// ===== 测试运行器 =====
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS  ' + name);
  } catch (e) {
    failed += 1;
    failures.push({ name: name, err: e });
    console.log('  FAIL  ' + name);
    console.log('        ' + (e && e.message ? e.message : e));
  }
}

function section(t) { console.log('\n=== ' + t + ' ==='); }

// ===== makeCard helper =====
let _idCounter = 0;
function makeCard(suit, rank, opts) {
  opts = opts || {};
  _idCounter += 1;
  return {
    id: 'test-' + _idCounter,
    suit: (rank === 'BJ' || rank === 'SJ') ? null : suit,
    rank: rank,
    isBigJoker: rank === 'BJ',
    isSmallJoker: rank === 'SJ',
    is主方大A: opts.is主方大A || false,
    location: { type: 'hand', playerId: opts.playerId || 'A' }
  };
}

// ============================================================
// §1  identifyHand: SINGLE
// ============================================================
section('1. identifyHand: SINGLE');

test('1 card (rank 5) → SINGLE', () => {
  const h = identifyHand([makeCard('H', 5)]);
  assert.strictEqual(h.type, HAND_TYPES.SINGLE);
});

test('Big Joker single → SINGLE', () => {
  const h = identifyHand([makeCard(null, 'BJ')]);
  assert.strictEqual(h.type, HAND_TYPES.SINGLE);
});

test('Small Joker single → SINGLE', () => {
  const h = identifyHand([makeCard(null, 'SJ')]);
  assert.strictEqual(h.type, HAND_TYPES.SINGLE);
});

test('普通 A single (is主方大A=false) → SINGLE', () => {
  const h = identifyHand([makeCard('H', 14)]);
  assert.strictEqual(h.type, HAND_TYPES.SINGLE);
  assert.strictEqual(h.rank, 15);  // A 普通 = 15
});

test('大A single (is主方大A=true) → SINGLE, rank=20', () => {
  const h = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.strictEqual(h.type, HAND_TYPES.SINGLE);
  assert.strictEqual(h.rank, 20);
});

// ============================================================
// §2  identifyHand: PAIR
// ============================================================
section('2. identifyHand: PAIR');

test('2 cards same rank different suit → PAIR', () => {
  const h = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.strictEqual(h.type, HAND_TYPES.PAIR);
  assert.strictEqual(h.rank, 7);
});

test('2 cards same rank same suit (不同副的同花色) → PAIR', () => {
  // 两副牌里 H-7 有 2 张，分别来自副 0 和副 1
  const c1 = makeCard('H', 7); c1.id = 'H-7-0';
  const c2 = makeCard('H', 7); c2.id = 'H-7-1';
  const h = identifyHand([c1, c2]);
  assert.strictEqual(h.type, HAND_TYPES.PAIR);
});

test('2 cards different rank → INVALID', () => {
  const h = identifyHand([makeCard('H', 7), makeCard('D', 8)]);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

// ============================================================
// §3  identifyHand: TRIPLE
// ============================================================
section('3. identifyHand: TRIPLE');

test('3 cards same rank → TRIPLE', () => {
  const h = identifyHand([
    makeCard('H', 9), makeCard('D', 9), makeCard('C', 9)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.TRIPLE);
  assert.strictEqual(h.rank, 9);
});

test('3 cards consecutive (3-4-5) → STRAIGHT 不是 TRIPLE', () => {
  const h = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT);
});

test('3 cards different rank non-consecutive → INVALID', () => {
  const h = identifyHand([
    makeCard('H', 3), makeCard('D', 5), makeCard('C', 8)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

// ============================================================
// §4  identifyHand: STRAIGHT
// ============================================================
section('4. identifyHand: STRAIGHT');

test('A-2-3 (A 作低端) → STRAIGHT, low=1, length=3', () => {
  const h = identifyHand([
    makeCard('H', 14), makeCard('D', 2), makeCard('C', 3)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT);
  assert.strictEqual(h.low, 1);
  assert.strictEqual(h.length, 3);
});

test('2-3-4 → STRAIGHT, low=2', () => {
  const h = identifyHand([
    makeCard('H', 2), makeCard('D', 3), makeCard('C', 4)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT);
  assert.strictEqual(h.low, 2);
});

test('Q-K-A (A 作高端) → STRAIGHT, low=12, length=3', () => {
  const h = identifyHand([
    makeCard('H', 12), makeCard('D', 13), makeCard('C', 14)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT);
  assert.strictEqual(h.low, 12);
});

test('K-A-2 (SKILL 明确禁止) → INVALID', () => {
  const h = identifyHand([
    makeCard('H', 13), makeCard('D', 14), makeCard('C', 2)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

test('10-J-Q-K-A (5 张) → STRAIGHT, low=10, length=5', () => {
  const h = identifyHand([
    makeCard('H', 10), makeCard('D', 11), makeCard('C', 12),
    makeCard('H', 13), makeCard('D', 14)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT);
  assert.strictEqual(h.low, 10);
  assert.strictEqual(h.length, 5);
});

test('A-2-3-4-5-6-7-8-9-10-J-Q-K-A (13 张满) → STRAIGHT, low=1, length=13', () => {
  const ranks = [14, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const cards = ranks.map((r, i) => makeCard(i % 2 === 0 ? 'H' : 'D', r));
  const h = identifyHand(cards);
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT);
  assert.strictEqual(h.low, 1);
  assert.strictEqual(h.length, 13);
});

test('3-3-4-5 (有重复点数) → INVALID', () => {
  const h = identifyHand([
    makeCard('H', 3), makeCard('D', 3), makeCard('C', 4), makeCard('H', 5)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

test('A 在中间 (4-A-5) → INVALID', () => {
  const h = identifyHand([
    makeCard('H', 4), makeCard('D', 14), makeCard('C', 5)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

test('4-5-6-7-8-9-10-J-Q-K-A (10 张) → STRAIGHT, low=4, length=10', () => {
  const h = identifyHand([
    makeCard('H', 4), makeCard('D', 5), makeCard('C', 6), makeCard('S', 7),
    makeCard('H', 8), makeCard('D', 9), makeCard('C', 10), makeCard('S', 11),
    makeCard('H', 12), makeCard('D', 13)
  ]);
  // 这只是 4-5-6-7-8-9-10-J-Q-K, 10 张，A 在第 11 张但没有，low=4
  // 等等让我数一下: 4,5,6,7,8,9,10,11,12,13 = 10 张
  // 是合法的 STRAIGHT, low=4
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT);
  assert.strictEqual(h.low, 4);
  assert.strictEqual(h.length, 10);
});

// ============================================================
// §5  identifyHand: DOUBLE_STRAIGHT
// ============================================================
section('5. identifyHand: DOUBLE_STRAIGHT');

test('2-2 3-3 4-4 (6 张 3 对) → DOUBLE_STRAIGHT, low=2, length=6', () => {
  const h = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3),
    makeCard('H', 4), makeCard('D', 4)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.DOUBLE_STRAIGHT);
  assert.strictEqual(h.low, 2);
  assert.strictEqual(h.length, 6);
});

test('A-A 2-2 3-3 (6 张) → DOUBLE_STRAIGHT, low=1', () => {
  const h = identifyHand([
    makeCard('H', 14), makeCard('D', 14),
    makeCard('C', 2), makeCard('S', 2),
    makeCard('H', 3), makeCard('D', 3)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.DOUBLE_STRAIGHT);
  assert.strictEqual(h.low, 1);
});

test('Q-Q K-K A-A (6 张) → DOUBLE_STRAIGHT, low=12', () => {
  const h = identifyHand([
    makeCard('H', 12), makeCard('D', 12),
    makeCard('C', 13), makeCard('S', 13),
    makeCard('H', 14), makeCard('D', 14)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.DOUBLE_STRAIGHT);
  assert.strictEqual(h.low, 12);
});

test('2-2 3-3 (4 张 2 对) → INVALID (至少 3 对)', () => {
  const h = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

test('2-2 3-3 5-5 (不连续) → INVALID', () => {
  const h = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3),
    makeCard('H', 5), makeCard('D', 5)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

test('2-2 3-3 4 (1 张 4) → INVALID (每对必须 2 张)', () => {
  const h = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3),
    makeCard('H', 4)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

// ============================================================
// §6  identifyHand: DOUBLE_JOKER
// ============================================================
section('6. identifyHand: DOUBLE_JOKER');

test('BJ + BJ → DOUBLE_JOKER, rank=2 (2 张大王)', () => {
  const h = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  assert.strictEqual(h.type, HAND_TYPES.DOUBLE_JOKER);
  assert.strictEqual(h.rank, 2);
});

test('BJ + SJ → DOUBLE_JOKER, rank=1', () => {
  const h = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'SJ')
  ]);
  assert.strictEqual(h.type, HAND_TYPES.DOUBLE_JOKER);
  assert.strictEqual(h.rank, 1);
});

test('SJ + SJ → DOUBLE_JOKER, rank=0 (2 张小王)', () => {
  const h = identifyHand([
    makeCard(null, 'SJ'), makeCard(null, 'SJ')
  ]);
  assert.strictEqual(h.type, HAND_TYPES.DOUBLE_JOKER);
  assert.strictEqual(h.rank, 0);
});

test('BJ 单张 → SINGLE (不是 DOUBLE_JOKER)', () => {
  const h = identifyHand([makeCard(null, 'BJ')]);
  assert.strictEqual(h.type, HAND_TYPES.SINGLE);
});

test('3 张 joker → TRIPLE_JOKER (批次 3 实现)', () => {
  const h = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'SJ'), makeCard(null, 'SJ')
  ]);
  assert.strictEqual(h.type, HAND_TYPES.TRIPLE_JOKER);
  assert.strictEqual(h.rank, 1);
});

// ============================================================
// §7  identifyHand: INVALID
// ============================================================
section('7. identifyHand: INVALID');

test('空数组 → INVALID', () => {
  const h = identifyHand([]);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

test('null → INVALID', () => {
  const h = identifyHand(null);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

test('4 张同点数 (大蛋子，批次 2 实现) → BIG_TRIPLE', () => {
  const h = identifyHand([
    makeCard('H', 5), makeCard('D', 5),
    makeCard('C', 5), makeCard('S', 5)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.BIG_TRIPLE);
  assert.strictEqual(h.count, 4);
  assert.strictEqual(h.rank, 5);
});

test('1 joker + 1 普通牌 → INVALID (本批范围外)', () => {
  const h = identifyHand([
    makeCard(null, 'BJ'), makeCard('H', 5)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

// ============================================================
// §8  compareHands: SINGLE
// ============================================================
section('8. compareHands: SINGLE (按 SKILL §6.2 牌力顺序)');

test('大A > 大王', () => {
  const a = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const b = identifyHand([makeCard(null, 'BJ')]);
  assert.ok(compareHands(a, b) > 0);
});

test('大王 > 小王', () => {
  const a = identifyHand([makeCard(null, 'BJ')]);
  const b = identifyHand([makeCard(null, 'SJ')]);
  assert.ok(compareHands(a, b) > 0);
});

test('小王 > 3', () => {
  const a = identifyHand([makeCard(null, 'SJ')]);
  const b = identifyHand([makeCard('H', 3)]);
  assert.ok(compareHands(a, b) > 0);
});

test('3 > 2', () => {
  assert.ok(compareHands(identifyHand([makeCard('H', 3)]),
                         identifyHand([makeCard('H', 2)])) > 0);
});

test('2 > 普通 A', () => {
  assert.ok(compareHands(identifyHand([makeCard('H', 2)]),
                         identifyHand([makeCard('H', 14)])) > 0);
});

test('A > K', () => {
  assert.ok(compareHands(identifyHand([makeCard('H', 14)]),
                         identifyHand([makeCard('H', 13)])) > 0);
});

test('K > Q', () => {
  assert.ok(compareHands(identifyHand([makeCard('H', 13)]),
                         identifyHand([makeCard('H', 12)])) > 0);
});

test('Q > J', () => {
  assert.ok(compareHands(identifyHand([makeCard('H', 12)]),
                         identifyHand([makeCard('H', 11)])) > 0);
});

test('J > 10', () => {
  assert.ok(compareHands(identifyHand([makeCard('H', 11)]),
                         identifyHand([makeCard('H', 10)])) > 0);
});

test('10 > 4', () => {
  assert.ok(compareHands(identifyHand([makeCard('H', 10)]),
                         identifyHand([makeCard('H', 4)])) > 0);
});

test('5 == 5 (相等)', () => {
  assert.strictEqual(
    compareHands(identifyHand([makeCard('H', 5)]), identifyHand([makeCard('D', 5)])),
    0
  );
});

// ============================================================
// §9  compareHands: PAIR
// ============================================================
section('9. compareHands: PAIR');

test('AA > KK', () => {
  const a = identifyHand([makeCard('H', 14), makeCard('D', 14)]);
  const b = identifyHand([makeCard('H', 13), makeCard('D', 13)]);
  assert.ok(compareHands(a, b) > 0);
});

test('22 < 33', () => {
  const a = identifyHand([makeCard('H', 2), makeCard('D', 2)]);
  const b = identifyHand([makeCard('H', 3), makeCard('D', 3)]);
  assert.ok(compareHands(a, b) < 0);
});

test('44 == 44 (同 rank)', () => {
  const a = identifyHand([makeCard('H', 4), makeCard('D', 4)]);
  const b = identifyHand([makeCard('C', 4), makeCard('S', 4)]);
  assert.strictEqual(compareHands(a, b), 0);
});

// ============================================================
// §10  compareHands: TRIPLE
// ============================================================
section('10. compareHands: TRIPLE');

test('777 > 666', () => {
  const a = identifyHand([makeCard('H', 7), makeCard('D', 7), makeCard('C', 7)]);
  const b = identifyHand([makeCard('H', 6), makeCard('D', 6), makeCard('C', 6)]);
  assert.ok(compareHands(a, b) > 0);
});

test('AAA > KKK', () => {
  const a = identifyHand([makeCard('H', 14), makeCard('D', 14), makeCard('C', 14)]);
  const b = identifyHand([makeCard('H', 13), makeCard('D', 13), makeCard('C', 13)]);
  assert.ok(compareHands(a, b) > 0);
});

test('222 < 333', () => {
  const a = identifyHand([makeCard('H', 2), makeCard('D', 2), makeCard('C', 2)]);
  const b = identifyHand([makeCard('H', 3), makeCard('D', 3), makeCard('C', 3)]);
  assert.ok(compareHands(a, b) < 0);
});

// ============================================================
// §11  compareHands: STRAIGHT (长度优先，再比 low)
// ============================================================
section('11. compareHands: STRAIGHT');

test('A23 (3 张) < 234 (3 张同长度，高 low)', () => {
  const a = identifyHand([makeCard('H', 14), makeCard('D', 2), makeCard('C', 3)]);
  const b = identifyHand([makeCard('H', 2), makeCard('D', 3), makeCard('C', 4)]);
  assert.ok(compareHands(a, b) < 0);
});

test('234 < QKA (3 张同长度，QKA 高 low)', () => {
  const a = identifyHand([makeCard('H', 2), makeCard('D', 3), makeCard('C', 4)]);
  const b = identifyHand([makeCard('H', 12), makeCard('D', 13), makeCard('C', 14)]);
  assert.ok(compareHands(a, b) < 0);
});

test('A23 < QKA (3 张同长度)', () => {
  const a = identifyHand([makeCard('H', 14), makeCard('D', 2), makeCard('C', 3)]);
  const b = identifyHand([makeCard('H', 12), makeCard('D', 13), makeCard('C', 14)]);
  assert.ok(compareHands(a, b) < 0);
});

test('234 (3 张) vs 2345 (4 张) → 0 (不同长度不可比，按 SKILL §6.4)', () => {
  const a = identifyHand([makeCard('H', 2), makeCard('D', 3), makeCard('C', 4)]);
  const b = identifyHand([
    makeCard('H', 2), makeCard('D', 3), makeCard('C', 4), makeCard('S', 5)
  ]);
  assert.strictEqual(compareHands(a, b), 0);
});

test('2345 (4 张) < 3456 (4 张同长度，高 low)', () => {
  const a = identifyHand([
    makeCard('H', 2), makeCard('D', 3), makeCard('C', 4), makeCard('S', 5)
  ]);
  const b = identifyHand([
    makeCard('H', 3), makeCard('D', 4), makeCard('C', 5), makeCard('S', 6)
  ]);
  assert.ok(compareHands(a, b) < 0);
});

test('234 (3 张) vs 2345 (4 张) → 0 (长度不同，不可比)', () => {
  const a = identifyHand([makeCard('H', 2), makeCard('D', 3), makeCard('C', 4)]);
  const b = identifyHand([
    makeCard('H', 2), makeCard('D', 3), makeCard('C', 4), makeCard('S', 5)
  ]);
  assert.strictEqual(compareHands(a, b), 0);
});

test('QKA (3 张) vs 10JQKA (5 张) → 0 (长度不同)', () => {
  const a = identifyHand([makeCard('H', 12), makeCard('D', 13), makeCard('C', 14)]);
  const b = identifyHand([
    makeCard('H', 10), makeCard('D', 11), makeCard('C', 12),
    makeCard('H', 13), makeCard('D', 14)
  ]);
  assert.strictEqual(compareHands(a, b), 0);
});

// ============================================================
// §12  compareHands: DOUBLE_STRAIGHT
// ============================================================
section('12. compareHands: DOUBLE_STRAIGHT');

test('22-33-44 (6 张) < 33-44-55 (6 张同长度，高 low)', () => {
  const a = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3),
    makeCard('H', 4), makeCard('D', 4)
  ]);
  const b = identifyHand([
    makeCard('H', 3), makeCard('D', 3),
    makeCard('C', 4), makeCard('S', 4),
    makeCard('H', 5), makeCard('D', 5)
  ]);
  assert.ok(compareHands(a, b) < 0);
});

test('22-33-44 (6 张) vs 22-33-44-55 (8 张) → 0 (不同长度不可比，按 SKILL §6.4)', () => {
  const a = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3),
    makeCard('H', 4), makeCard('D', 4)
  ]);
  const b = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3),
    makeCard('H', 4), makeCard('D', 4),
    makeCard('C', 5), makeCard('S', 5)
  ]);
  assert.strictEqual(compareHands(a, b), 0);
});

test('AA-22-33 (6 张) < 22-33-44 (6 张，low 1 < low 2)', () => {
  const a = identifyHand([
    makeCard('H', 14), makeCard('D', 14),
    makeCard('C', 2), makeCard('S', 2),
    makeCard('H', 3), makeCard('D', 3)
  ]);
  const b = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3),
    makeCard('H', 4), makeCard('D', 4)
  ]);
  assert.ok(compareHands(a, b) < 0);
});

// ============================================================
// §13  compareHands: DOUBLE_JOKER
// ============================================================
section('13. compareHands: DOUBLE_JOKER (按大王数排)');

test('2BJ > 1BJ+1SJ', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  assert.ok(compareHands(a, b) > 0);
});

test('1BJ+1SJ > 2SJ', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const b = identifyHand([makeCard(null, 'SJ'), makeCard(null, 'SJ')]);
  assert.ok(compareHands(a, b) > 0);
});

test('2BJ > 2SJ', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand([makeCard(null, 'SJ'), makeCard(null, 'SJ')]);
  assert.ok(compareHands(a, b) > 0);
});

test('2BJ == 2BJ', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  assert.strictEqual(compareHands(a, b), 0);
});

// ============================================================
// §14  compareHands: 不同类（不可比）
// ============================================================
section('14. compareHands: 不同类型不可比');

test('SINGLE vs PAIR → 0', () => {
  const a = identifyHand([makeCard('H', 10)]);
  const b = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.strictEqual(compareHands(a, b), 0);
});

test('STRAIGHT vs PAIR → 0', () => {
  const a = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  const b = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.strictEqual(compareHands(a, b), 0);
});

test('DOUBLE_JOKER vs SINGLE → 0', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const b = identifyHand([makeCard('H', 10)]);
  assert.strictEqual(compareHands(a, b), 0);
});

// ============================================================
// §15  canBeat: 双王跨类型
// ============================================================
section('15. canBeat: DOUBLE_JOKER 跨类型 (SKILL §6.4)');

test('双王 beats 普通 SINGLE', () => {
  const play = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const cur = identifyHand([makeCard('H', 5)]);
  assert.ok(canBeat(play, cur));
});

test('双王 beats 单大A (SINGLE with is主方大A=true)', () => {
  const play = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const cur = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(canBeat(play, cur));
});

test('双王 beats PAIR', () => {
  const play = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const cur = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.ok(canBeat(play, cur));
});

test('双王 beats TRIPLE', () => {
  const play = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const cur = identifyHand([makeCard('H', 9), makeCard('D', 9), makeCard('C', 9)]);
  assert.ok(canBeat(play, cur));
});

test('双王 beats STRAIGHT', () => {
  const play = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const cur = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  assert.ok(canBeat(play, cur));
});

test('双王 beats DOUBLE_STRAIGHT', () => {
  const play = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const cur = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3),
    makeCard('H', 4), makeCard('D', 4)
  ]);
  assert.ok(canBeat(play, cur));
});

test('2SJ 双王 does NOT beat 2BJ 双王 (低 rank vs 高 rank)', () => {
  const play = identifyHand([makeCard(null, 'SJ'), makeCard(null, 'SJ')]);
  const cur = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  assert.ok(!canBeat(play, cur));
});

test('2BJ 双王 beats 2SJ 双王', () => {
  const play = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const cur = identifyHand([makeCard(null, 'SJ'), makeCard(null, 'SJ')]);
  assert.ok(canBeat(play, cur));
});

// ============================================================
// §16  canBeat: 单大A 规则
// ============================================================
section('16. canBeat: 单大A (SKILL §6.4)');

test('单大A beats 普通 SINGLE (低 rank)', () => {
  const play = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const cur = identifyHand([makeCard('H', 5)]);
  assert.ok(canBeat(play, cur));
});

test('单大A beats 3 (低 rank)', () => {
  const play = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const cur = identifyHand([makeCard('H', 3)]);
  assert.ok(canBeat(play, cur));
});

test('单大A beats 大王 single', () => {
  const play = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const cur = identifyHand([makeCard(null, 'BJ')]);
  assert.ok(canBeat(play, cur));
});

test('单大A beats 小王 single', () => {
  const play = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const cur = identifyHand([makeCard(null, 'SJ')]);
  assert.ok(canBeat(play, cur));
});

test('单大A does NOT beat PAIR (组合)', () => {
  const play = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const cur = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.ok(!canBeat(play, cur));
});

test('单大A does NOT beat TRIPLE (组合)', () => {
  const play = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const cur = identifyHand([makeCard('H', 9), makeCard('D', 9), makeCard('C', 9)]);
  assert.ok(!canBeat(play, cur));
});

test('单大A does NOT beat STRAIGHT (组合)', () => {
  const play = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const cur = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  assert.ok(!canBeat(play, cur));
});

test('单大A does NOT beat DOUBLE_JOKER (组合)', () => {
  const play = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const cur = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  assert.ok(!canBeat(play, cur));
});

test('单大A can be beaten by DOUBLE_JOKER (反向)', () => {
  const play = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const cur = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(canBeat(play, cur));
});

// ============================================================
// §17  canBeat: 同类型比较
// ============================================================
section('17. canBeat: 同类型');

test('SINGLE 高 beats SINGLE 低', () => {
  assert.ok(canBeat(
    identifyHand([makeCard('H', 10)]),
    identifyHand([makeCard('H', 5)])
  ));
});

test('SINGLE 相同 → 不压', () => {
  assert.ok(!canBeat(
    identifyHand([makeCard('H', 7)]),
    identifyHand([makeCard('D', 7)])
  ));
});

test('PAIR 高 beats PAIR 低', () => {
  assert.ok(canBeat(
    identifyHand([makeCard('H', 14), makeCard('D', 14)]),
    identifyHand([makeCard('H', 7), makeCard('D', 7)])
  ));
});

test('TRIPLE 高 beats TRIPLE 低', () => {
  assert.ok(canBeat(
    identifyHand([makeCard('H', 14), makeCard('D', 14), makeCard('C', 14)]),
    identifyHand([makeCard('H', 7), makeCard('D', 7), makeCard('C', 7)])
  ));
});

test('STRAIGHT 同长度 高 low beats 低 low', () => {
  assert.ok(canBeat(
    identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]),
    identifyHand([makeCard('H', 2), makeCard('D', 3), makeCard('C', 4)])
  ));
});

test('STRAIGHT 不同长度 → 不压', () => {
  assert.ok(!canBeat(
    identifyHand([makeCard('H', 2), makeCard('D', 3), makeCard('C', 4), makeCard('S', 5)]),
    identifyHand([makeCard('H', 2), makeCard('D', 3), makeCard('C', 4)])
  ));
});

test('STRAIGHT 同长度 同 low → 不压', () => {
  assert.ok(!canBeat(
    identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]),
    identifyHand([makeCard('D', 3), makeCard('C', 4), makeCard('S', 5)])
  ));
});

test('DOUBLE_STRAIGHT 同长度 高 low beats 低 low', () => {
  assert.ok(canBeat(
    identifyHand([
      makeCard('H', 3), makeCard('D', 3),
      makeCard('C', 4), makeCard('S', 4),
      makeCard('H', 5), makeCard('D', 5)
    ]),
    identifyHand([
      makeCard('H', 2), makeCard('D', 2),
      makeCard('C', 3), makeCard('S', 3),
      makeCard('H', 4), makeCard('D', 4)
    ])
  ));
});

test('DOUBLE_STRAIGHT 不同长度 → 不压', () => {
  assert.ok(!canBeat(
    identifyHand([
      makeCard('H', 2), makeCard('D', 2),
      makeCard('C', 3), makeCard('S', 3),
      makeCard('H', 4), makeCard('D', 4),
      makeCard('C', 5), makeCard('S', 5)
    ]),
    identifyHand([
      makeCard('H', 2), makeCard('D', 2),
      makeCard('C', 3), makeCard('S', 3),
      makeCard('H', 4), makeCard('D', 4)
    ])
  ));
});

// ============================================================
// §18  canBeat: 同层不可跨 (SKILL §6.3)
// ============================================================
section('18. canBeat: 龙/对子/单张 同一层不可跨');

test('STRAIGHT does NOT beat SINGLE', () => {
  const play = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  const cur = identifyHand([makeCard('H', 10)]);
  assert.ok(!canBeat(play, cur));
});

test('STRAIGHT does NOT beat PAIR', () => {
  const play = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  const cur = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.ok(!canBeat(play, cur));
});

test('STRAIGHT does NOT beat TRIPLE', () => {
  const play = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  const cur = identifyHand([makeCard('H', 9), makeCard('D', 9), makeCard('C', 9)]);
  assert.ok(!canBeat(play, cur));
});

test('PAIR does NOT beat SINGLE', () => {
  const play = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  const cur = identifyHand([makeCard('H', 10)]);
  assert.ok(!canBeat(play, cur));
});

test('SINGLE does NOT beat PAIR', () => {
  const play = identifyHand([makeCard('H', 10)]);
  const cur = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.ok(!canBeat(play, cur));
});

test('SINGLE does NOT beat TRIPLE', () => {
  const play = identifyHand([makeCard('H', 10)]);
  const cur = identifyHand([makeCard('H', 9), makeCard('D', 9), makeCard('C', 9)]);
  assert.ok(!canBeat(play, cur));
});

// SKILL §6.3: 蛋子(TRIPLE) 严格高于 龙/对子/单张 这一层
//   §6 表 蛋子条: "可按全局牌力规则跨牌型压制低级类型"
//   §6.4: "蛋子及以上: 原则上可以跨牌型压制全局等级较低的类型"
// 而 §6.3 的"同层不互压"只针对 龙/对子/单张 三者本身。
test('TRIPLE beats PAIR (§6.3 蛋子 > 对子)', () => {
  const play = identifyHand([makeCard('H', 9), makeCard('D', 9), makeCard('C', 9)]);
  const cur = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.ok(canBeat(play, cur), '蛋子应能跨型压对子 (§6.3)');
});

test('PAIR does NOT beat TRIPLE (反向)', () => {
  const play = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  const cur = identifyHand([makeCard('H', 9), makeCard('D', 9), makeCard('C', 9)]);
  assert.ok(!canBeat(play, cur));
});

// ============================================================
// §19  canBeat: 双龙专属规则 (SKILL §6.4)
// ============================================================
section('19. canBeat: DOUBLE_STRAIGHT 专属');

test('DOUBLE_STRAIGHT does NOT beat STRAIGHT (同层不可跨)', () => {
  const play = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3),
    makeCard('H', 4), makeCard('D', 4)
  ]);
  const cur = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  assert.ok(!canBeat(play, cur));
});

test('DOUBLE_STRAIGHT does NOT beat PAIR', () => {
  const play = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3),
    makeCard('H', 4), makeCard('D', 4)
  ]);
  const cur = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.ok(!canBeat(play, cur));
});

test('DOUBLE_STRAIGHT does NOT beat SINGLE', () => {
  const play = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3),
    makeCard('H', 4), makeCard('D', 4)
  ]);
  const cur = identifyHand([makeCard('H', 10)]);
  assert.ok(!canBeat(play, cur));
});

test('STRAIGHT does NOT beat DOUBLE_STRAIGHT', () => {
  const play = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  const cur = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3),
    makeCard('H', 4), makeCard('D', 4)
  ]);
  assert.ok(!canBeat(play, cur));
});

test('DOUBLE_STRAIGHT 同长度 高 low beats 低 low (唯一可压的对方)', () => {
  const play = identifyHand([
    makeCard('H', 3), makeCard('D', 3),
    makeCard('C', 4), makeCard('S', 4),
    makeCard('H', 5), makeCard('D', 5)
  ]);
  const cur = identifyHand([
    makeCard('H', 2), makeCard('D', 2),
    makeCard('C', 3), makeCard('S', 3),
    makeCard('H', 4), makeCard('D', 4)
  ]);
  assert.ok(canBeat(play, cur));
});

test('DOUBLE_STRAIGHT 同长度 同 low → 不压', () => {
  const play = identifyHand([
    makeCard('H', 3), makeCard('D', 3),
    makeCard('C', 4), makeCard('S', 4),
    makeCard('H', 5), makeCard('D', 5)
  ]);
  const cur = identifyHand([
    makeCard('H', 3), makeCard('D', 3),
    makeCard('C', 4), makeCard('S', 4),
    makeCard('H', 5), makeCard('D', 5)
  ]);
  assert.ok(!canBeat(play, cur));
});

// ============================================================
// §20  canBeat: 边界
// ============================================================
section('20. canBeat: 边界');

test('canBeat(null, null) → false', () => {
  assert.ok(!canBeat(null, null));
});

test('canBeat(invalid_hand, valid_hand) → false', () => {
  const play = { type: HAND_TYPES.INVALID, cards: [] };
  const cur = identifyHand([makeCard('H', 5)]);
  assert.ok(!canBeat(play, cur));
});

test('canBeat(valid_hand, invalid_hand) → false', () => {
  const play = identifyHand([makeCard('H', 10)]);
  const cur = { type: HAND_TYPES.INVALID, cards: [] };
  assert.ok(!canBeat(play, cur));
});

// ===== 汇总 =====
console.log('\n=== ' + passed + ' passed, ' + failed + ' failed ===');
if (failed > 0) {
  console.log('Failed tests:');
  for (const f of failures) {
    console.log('  - ' + f.name);
    console.log('    ' + (f.err && f.err.message ? f.err.message : f.err));
  }
  process.exit(1);
}
process.exit(0);
