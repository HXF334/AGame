// tests/test-hand-types-batch3.js — §6 牌型识别 批次 3
// 跑法：node tests/test-hand-types-batch3.js
//
// 批次 3 范围（4 种特殊牌型）：
//   四连珠蛋 (4 组连续蛋子) / 三王 (3 张王) / 四王 (4 张王) / 双大A (2 张同花色大A)

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
    id: 'test3-' + _idCounter,
    suit: (rank === 'BJ' || rank === 'SJ') ? null : suit,
    rank: rank,
    isBigJoker: rank === 'BJ',
    isSmallJoker: rank === 'SJ',
    is主方大A: opts.is主方大A || false,
    location: { type: 'hand', playerId: opts.playerId || 'A' }
  };
}

// 4 张同 rank（同 rank 任意 4 张）
function makeSameRank(rank, count) {
  const suits = ['H', 'D', 'C', 'S'];
  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push(makeCard(suits[i % 4], rank));
  }
  return cards;
}

// 4 组同 rank（每组 groupSize 张）
function makeGroups(ranks, groupSize) {
  const suits = ['H', 'D', 'C', 'S'];
  const cards = [];
  for (const r of ranks) {
    for (let i = 0; i < groupSize; i++) {
      cards.push(makeCard(suits[i % 4], r));
    }
  }
  return cards;
}

// ============================================================
// §1  identifyHand: STRAIGHT_TRIPLE_LARGE (四连珠蛋, 4 组连续蛋子)
// ============================================================
section('1. identifyHand: STRAIGHT_TRIPLE_LARGE');

test('222-333-444-555 (12 张) → STRAIGHT_TRIPLE_LARGE, low=2', () => {
  const h = identifyHand(makeGroups([2, 3, 4, 5], 3));
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT_TRIPLE_LARGE);
  assert.strictEqual(h.low, 2);
});

test('AAA-222-333-444 (A 作低端, 12 张) → STRAIGHT_TRIPLE_LARGE, low=1', () => {
  const h = identifyHand(makeGroups([14, 2, 3, 4], 3));
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT_TRIPLE_LARGE);
  assert.strictEqual(h.low, 1);
});

test('333-444-555-666 (12 张) → STRAIGHT_TRIPLE_LARGE, low=3', () => {
  const h = identifyHand(makeGroups([3, 4, 5, 6], 3));
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT_TRIPLE_LARGE);
  assert.strictEqual(h.low, 3);
});

test('222-333-444 (9 张, 3 组) → STRAIGHT_TRIPLE (不是 LARGE)', () => {
  const h = identifyHand(makeGroups([2, 3, 4], 3));
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT_TRIPLE);
});

test('222-333-555 (12 张, 不连续) → INVALID', () => {
  const h = identifyHand(makeGroups([2, 3, 5, 6], 3));
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

test('222-333-444-555-666 (15 张, 5 组) → INVALID (固定 4 组)', () => {
  const h = identifyHand(makeGroups([2, 3, 4, 5, 6], 3));
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

// ============================================================
// §2  identifyHand: TRIPLE_JOKER (三王, 3 张王)
// ============================================================
section('2. identifyHand: TRIPLE_JOKER');

test('BJ + BJ + BJ → TRIPLE_JOKER, rank=3', () => {
  const h = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  assert.strictEqual(h.type, HAND_TYPES.TRIPLE_JOKER);
  assert.strictEqual(h.rank, 3);
});

test('BJ + BJ + SJ → TRIPLE_JOKER, rank=2', () => {
  const h = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'SJ')
  ]);
  assert.strictEqual(h.type, HAND_TYPES.TRIPLE_JOKER);
  assert.strictEqual(h.rank, 2);
});

test('BJ + SJ + SJ → TRIPLE_JOKER, rank=1', () => {
  const h = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'SJ'), makeCard(null, 'SJ')
  ]);
  assert.strictEqual(h.type, HAND_TYPES.TRIPLE_JOKER);
  assert.strictEqual(h.rank, 1);
});

test('SJ + SJ + SJ → TRIPLE_JOKER, rank=0', () => {
  const h = identifyHand([
    makeCard(null, 'SJ'), makeCard(null, 'SJ'), makeCard(null, 'SJ')
  ]);
  assert.strictEqual(h.type, HAND_TYPES.TRIPLE_JOKER);
  assert.strictEqual(h.rank, 0);
});

test('2 王 + 1 普通牌 → INVALID (本批要求全王)', () => {
  const h = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard('H', 5)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

// ============================================================
// §3  identifyHand: FOUR_JOKER (四王, 4 张王)
// ============================================================
section('3. identifyHand: FOUR_JOKER');

test('BJ + BJ + BJ + BJ → FOUR_JOKER, rank=4', () => {
  const h = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  assert.strictEqual(h.type, HAND_TYPES.FOUR_JOKER);
  assert.strictEqual(h.rank, 4);
});

test('3 BJ + 1 SJ → FOUR_JOKER, rank=3', () => {
  const h = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'SJ')
  ]);
  assert.strictEqual(h.type, HAND_TYPES.FOUR_JOKER);
  assert.strictEqual(h.rank, 3);
});

test('2 BJ + 2 SJ → FOUR_JOKER, rank=2', () => {
  const h = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'SJ'), makeCard(null, 'SJ')
  ]);
  assert.strictEqual(h.type, HAND_TYPES.FOUR_JOKER);
  assert.strictEqual(h.rank, 2);
});

test('1 BJ + 3 SJ → FOUR_JOKER, rank=1', () => {
  const h = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'SJ'),
    makeCard(null, 'SJ'), makeCard(null, 'SJ')
  ]);
  assert.strictEqual(h.type, HAND_TYPES.FOUR_JOKER);
  assert.strictEqual(h.rank, 1);
});

test('SJ + SJ + SJ + SJ → FOUR_JOKER, rank=0', () => {
  const h = identifyHand([
    makeCard(null, 'SJ'), makeCard(null, 'SJ'),
    makeCard(null, 'SJ'), makeCard(null, 'SJ')
  ]);
  assert.strictEqual(h.type, HAND_TYPES.FOUR_JOKER);
  assert.strictEqual(h.rank, 0);
});

test('3 王 + 1 普通牌 → INVALID', () => {
  const h = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard('H', 5)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

// ============================================================
// §4  identifyHand: DOUBLE_BIG_A (双大A, 2 张同花色大A)
// ============================================================
section('4. identifyHand: DOUBLE_BIG_A');

test('2 张 H-A (is主方大A) → DOUBLE_BIG_A, suit=H', () => {
  const h = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  assert.strictEqual(h.type, HAND_TYPES.DOUBLE_BIG_A);
  assert.strictEqual(h.suit, 'H');
});

test('2 张 D-A (is主方大A) → DOUBLE_BIG_A, suit=D', () => {
  const h = identifyHand([
    makeCard('D', 14, { is主方大A: true }),
    makeCard('D', 14, { is主方大A: true })
  ]);
  assert.strictEqual(h.type, HAND_TYPES.DOUBLE_BIG_A);
  assert.strictEqual(h.suit, 'D');
});

test('2 张 A 但 is主方大A=false → PAIR (普通 A 同 rank)', () => {
  const h = identifyHand([
    makeCard('H', 14), makeCard('H', 14)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.PAIR);
  assert.strictEqual(h.rank, 14);
});

test('2 张 不同花色 A 但 is主方大A=true → PAIR (双大A 需同花色, 这里不是)', () => {
  const h = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('D', 14, { is主方大A: true })
  ]);
  assert.strictEqual(h.type, HAND_TYPES.PAIR);
});

test('3 张 A (is主方大A=true) → TRIPLE (3 same rank, 不是双大A)', () => {
  const h = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  assert.strictEqual(h.type, HAND_TYPES.TRIPLE);
});

// ============================================================
// §5  compareHands: TRIPLE_JOKER (按大王数)
// ============================================================
section('5. compareHands: TRIPLE_JOKER');

test('3 BJ > 2 BJ + 1 SJ', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  assert.ok(compareHands(a, b) > 0);
});

test('1 BJ + 2 SJ > 3 SJ', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ'), makeCard(null, 'SJ')]);
  const b = identifyHand([makeCard(null, 'SJ'), makeCard(null, 'SJ'), makeCard(null, 'SJ')]);
  assert.ok(compareHands(a, b) > 0);
});

test('3 BJ > 3 SJ (跨级)', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand([makeCard(null, 'SJ'), makeCard(null, 'SJ'), makeCard(null, 'SJ')]);
  assert.ok(compareHands(a, b) > 0);
});

test('2 BJ + 1 SJ == 2 BJ + 1 SJ (相等)', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const b = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  assert.strictEqual(compareHands(a, b), 0);
});

// ============================================================
// §6  compareHands: FOUR_JOKER (按大王数)
// ============================================================
section('6. compareHands: FOUR_JOKER');

test('4 BJ > 3 BJ + 1 SJ', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  const b = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'SJ')
  ]);
  assert.ok(compareHands(a, b) > 0);
});

test('3 BJ + 1 SJ > 2 BJ + 2 SJ', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'SJ')
  ]);
  const b = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'SJ'), makeCard(null, 'SJ')
  ]);
  assert.ok(compareHands(a, b) > 0);
});

test('4 BJ > 4 SJ (跨级)', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  const b = identifyHand([
    makeCard(null, 'SJ'), makeCard(null, 'SJ'),
    makeCard(null, 'SJ'), makeCard(null, 'SJ')
  ]);
  assert.ok(compareHands(a, b) > 0);
});

// ============================================================
// §7  compareHands: STRAIGHT_TRIPLE_LARGE (按 low)
// ============================================================
section('7. compareHands: STRAIGHT_TRIPLE_LARGE');

test('222-333-444-555 (low=2) < 333-444-555-666 (low=3)', () => {
  const a = identifyHand(makeGroups([2, 3, 4, 5], 3));
  const b = identifyHand(makeGroups([3, 4, 5, 6], 3));
  assert.ok(compareHands(a, b) < 0);
});

test('AAA-222-333-444 (low=1) < 222-333-444-555 (low=2)', () => {
  const a = identifyHand(makeGroups([14, 2, 3, 4], 3));
  const b = identifyHand(makeGroups([2, 3, 4, 5], 3));
  assert.ok(compareHands(a, b) < 0);
});

// ============================================================
// §8  compareHands: DOUBLE_BIG_A (按 SKILL 默认相等)
// ============================================================
section('8. compareHands: DOUBLE_BIG_A');

test('2 张 H-A == 2 张 D-A (默认相等)', () => {
  const a = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  const b = identifyHand([
    makeCard('D', 14, { is主方大A: true }),
    makeCard('D', 14, { is主方大A: true })
  ]);
  assert.strictEqual(compareHands(a, b), 0);
});

// ============================================================
// §9  compareHands: 不同类型不可比
// ============================================================
section('9. compareHands: 不同类型');

test('FOUR_JOKER vs DOUBLE_BIG_A → 0', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  const b = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  assert.strictEqual(compareHands(a, b), 0);
});

test('TRIPLE_JOKER vs FOUR_JOKER → 0', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  assert.strictEqual(compareHands(a, b), 0);
});

// ============================================================
// §10  canBeat: 三王 跨类型 (per §6.4 固定列表)
// ============================================================
section('10. canBeat: 三王');

test('三王 > 蛋子 (per §6.4 "可管...蛋子")', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand(makeSameRank(5, 3));
  assert.ok(canBeat(a, b));
});

test('三王 > 大蛋子 (per §6.4 "可管...大蛋子")', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand(makeSameRank(5, 4));
  assert.ok(canBeat(a, b));
});

test('三王 > 龙 (per §6.4 "可管...龙")', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  assert.ok(canBeat(a, b));
});

test('三王 > 对子', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.ok(canBeat(a, b));
});

test('三王 > 单张', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand([makeCard('H', 5)]);
  assert.ok(canBeat(a, b));
});

test('三王 > 双龙', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand(makeGroups([2, 3, 4, 5, 6], 2));
  assert.ok(canBeat(a, b));
});

test('三王 > 单大A (per §6.4 "可管...单大A")', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(canBeat(a, b));
});

test('三王 does NOT beat 连珠蛋 (per §6.4 "不能管连珠蛋")', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand(makeGroups([2, 3, 4], 3));
  assert.ok(!canBeat(a, b));
});

test('三王 does NOT beat 假八', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand(makeGroups([14, 13], 4));
  assert.ok(!canBeat(a, b));
});

test('三王 does NOT beat 真七', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand(makeSameRank(3, 7));
  assert.ok(!canBeat(a, b));
});

test('三王 does NOT beat 真八', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand(makeSameRank(3, 8));
  assert.ok(!canBeat(a, b));
});

test('三王 does NOT beat 四连珠蛋 (per §6.4 "不能管")', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand(makeGroups([2, 3, 4, 5], 3));
  assert.ok(!canBeat(a, b));
});

test('三王 does NOT beat 三连假八', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand(makeGroups([14, 13, 12], 4));
  assert.ok(!canBeat(a, b));
});

test('三王 < 四王 (per §6.3 全局等级)', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  assert.ok(!canBeat(a, b));
});

test('三王 < 双大A (per §6.3 全局等级)', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  const b = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  assert.ok(!canBeat(a, b));
});

// ============================================================
// §11  canBeat: 四王 跨类型 (per §6.4 固定列表)
// ============================================================
section('11. canBeat: 四王');

test('四王 > 三王 (per §6.4 "可管...三王")', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  const b = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  assert.ok(canBeat(a, b));
});

test('四王 > 真七 (per §6.4 "可管...真七")', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  const b = identifyHand(makeSameRank(3, 7));
  assert.ok(canBeat(a, b));
});

test('四王 > 假八 (per §6.4 "可管...假八")', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  const b = identifyHand(makeGroups([14, 13], 4));
  assert.ok(canBeat(a, b));
});

test('四王 > 连珠蛋 (per §6.4 "可管...连珠蛋")', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  const b = identifyHand(makeGroups([2, 3, 4], 3));
  assert.ok(canBeat(a, b));
});

test('四王 > 蛋子', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  const b = identifyHand(makeSameRank(5, 3));
  assert.ok(canBeat(a, b));
});

test('四王 > 大蛋子', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  const b = identifyHand(makeSameRank(5, 4));
  assert.ok(canBeat(a, b));
});

test('四王 does NOT beat 真八 (per §6.4 "不能管真八")', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  const b = identifyHand(makeSameRank(3, 8));
  assert.ok(!canBeat(a, b));
});

test('四王 does NOT beat 三连假八', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  const b = identifyHand(makeGroups([14, 13, 12], 4));
  assert.ok(!canBeat(a, b));
});

test('四王 does NOT beat 四连珠蛋', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  const b = identifyHand(makeGroups([2, 3, 4, 5], 3));
  assert.ok(!canBeat(a, b));
});

test('四王 < 双大A (per §6.4 "不能管双大A")', () => {
  const a = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  const b = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  assert.ok(!canBeat(a, b));
});

// ============================================================
// §12  canBeat: 双大A (无敌)
// ============================================================
section('12. canBeat: 双大A (无敌)');

test('双大A > 四王 (per §6.4 "独立无敌")', () => {
  const a = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  const b = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  assert.ok(canBeat(a, b));
});

test('双大A > 三王', () => {
  const a = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  const b = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'BJ'), makeCard(null, 'BJ')]);
  assert.ok(canBeat(a, b));
});

test('双大A > 三连假八 (per §6.3 全局等级最高)', () => {
  const a = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  const b = identifyHand(makeGroups([14, 13, 12], 4));
  assert.ok(canBeat(a, b));
});

test('双大A > 四连珠蛋', () => {
  const a = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  const b = identifyHand(makeGroups([2, 3, 4, 5], 3));
  assert.ok(canBeat(a, b));
});

test('双大A > 蛋子', () => {
  const a = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  const b = identifyHand(makeSameRank(5, 3));
  assert.ok(canBeat(a, b));
});

test('双大A > 双王 (per 全局等级, 双大A 最高)', () => {
  const a = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  const b = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  assert.ok(canBeat(a, b));
});

// ============================================================
// §13  canBat: 四连珠蛋
// ============================================================
section('13. canBeat: 四连珠蛋');

test('四连珠蛋 > 真八 (per §6.3)', () => {
  const a = identifyHand(makeGroups([2, 3, 4, 5], 3));
  const b = identifyHand(makeSameRank(3, 8));
  assert.ok(canBeat(a, b));
});

test('四连珠蛋 > 真七', () => {
  const a = identifyHand(makeGroups([2, 3, 4, 5], 3));
  const b = identifyHand(makeSameRank(3, 7));
  assert.ok(canBeat(a, b));
});

test('四连珠蛋 < 四王 (per §6.3)', () => {
  const a = identifyHand(makeGroups([2, 3, 4, 5], 3));
  const b = identifyHand([
    makeCard(null, 'BJ'), makeCard(null, 'BJ'),
    makeCard(null, 'BJ'), makeCard(null, 'BJ')
  ]);
  assert.ok(!canBeat(a, b));
});

test('四连珠蛋 < 双大A (per §6.3)', () => {
  const a = identifyHand(makeGroups([2, 3, 4, 5], 3));
  const b = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  assert.ok(!canBeat(a, b));
});

// ============================================================
// §14  canBat: 不可变性
// ============================================================
section('14. canBeat: 不可变性');

test('失败的 canBeat 返回 state 引用相同', () => {
  const a = identifyHand([makeCard('H', 5)]);
  const b = identifyHand(makeSameRank(5, 4));
  const r = canBeat(a, b);
  assert.strictEqual(r, false);
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
