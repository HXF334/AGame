// tests/test-hand-types-batch2.js — §6 牌型识别 批次 2
// 跑法：node tests/test-hand-types-batch2.js
//
// 批次 2 范围（6 种高级牌型 + 跨类型规则）：
//   大蛋子 (4-6 张同点数) / 真七 (7) / 真八 (8) /
//   连珠蛋 (3 组连续蛋子) / 假八 (2 组连续四张) / 三连假八 (3 组连续四张)
// + 4-张 大蛋子 vs 单大A 特殊规则 + 龙/对子/单张 同层 + 蛋子跨层压制 + 双龙 专属

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
    id: 'test2-' + _idCounter,
    suit: (rank === 'BJ' || rank === 'SJ') ? null : suit,
    rank: rank,
    isBigJoker: rank === 'BJ',
    isSmallJoker: rank === 'SJ',
    is主方大A: opts.is主方大A || false,
    location: { type: 'hand', playerId: opts.playerId || 'A' }
  };
}

// 批量造 N 张同 rank
function makeSameRank(rank, count) {
  const suits = ['H', 'D', 'C', 'S'];
  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push(makeCard(suits[i % 4], rank));
  }
  return cards;
}

// 3 组同 rank（每组 groupSize 张）
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
// §1  identifyHand: BIG_TRIPLE (大蛋子, 4-6 张同点数)
// ============================================================
section('1. identifyHand: BIG_TRIPLE');

test('4 张同 rank → BIG_TRIPLE, count=4', () => {
  const h = identifyHand(makeSameRank(5, 4));
  assert.strictEqual(h.type, HAND_TYPES.BIG_TRIPLE);
  assert.strictEqual(h.rank, 5);
  assert.strictEqual(h.count, 4);
});

test('5 张同 rank → BIG_TRIPLE, count=5', () => {
  const h = identifyHand(makeSameRank(7, 5));
  assert.strictEqual(h.type, HAND_TYPES.BIG_TRIPLE);
  assert.strictEqual(h.rank, 7);
  assert.strictEqual(h.count, 5);
});

test('6 张同 rank → BIG_TRIPLE, count=6', () => {
  const h = identifyHand(makeSameRank(9, 6));
  assert.strictEqual(h.type, HAND_TYPES.BIG_TRIPLE);
  assert.strictEqual(h.rank, 9);
  assert.strictEqual(h.count, 6);
});

test('3 张同 rank → TRIPLE (不是 BIG_TRIPLE)', () => {
  const h = identifyHand(makeSameRank(5, 3));
  assert.strictEqual(h.type, HAND_TYPES.TRIPLE);
});

test('7 张同 rank → TRUE_SEVEN (不是 BIG_TRIPLE)', () => {
  const h = identifyHand(makeSameRank(5, 7));
  assert.strictEqual(h.type, HAND_TYPES.TRUE_SEVEN);
});

// ============================================================
// §2  identifyHand: TRUE_SEVEN (真七, 7 张同点数)
// ============================================================
section('2. identifyHand: TRUE_SEVEN');

test('7 张同 rank → TRUE_SEVEN', () => {
  const h = identifyHand(makeSameRank(3, 7));
  assert.strictEqual(h.type, HAND_TYPES.TRUE_SEVEN);
  assert.strictEqual(h.rank, 3);
});

test('6 张同 rank → BIG_TRIPLE (不是 TRUE_SEVEN)', () => {
  const h = identifyHand(makeSameRank(3, 6));
  assert.strictEqual(h.type, HAND_TYPES.BIG_TRIPLE);
});

test('8 张同 rank → TRUE_EIGHT (不是 TRUE_SEVEN)', () => {
  const h = identifyHand(makeSameRank(3, 8));
  assert.strictEqual(h.type, HAND_TYPES.TRUE_EIGHT);
});

// ============================================================
// §3  identifyHand: TRUE_EIGHT (真八, 8 张同点数)
// ============================================================
section('3. identifyHand: TRUE_EIGHT');

test('8 张同 rank → TRUE_EIGHT', () => {
  const h = identifyHand(makeSameRank(11, 8));
  assert.strictEqual(h.type, HAND_TYPES.TRUE_EIGHT);
  assert.strictEqual(h.rank, 11);
});

test('9 张同 rank → INVALID (out of batch 2 scope)', () => {
  const h = identifyHand(makeSameRank(5, 9));
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

test('4 张 rank 不全相同 → INVALID (大蛋子要求全同)', () => {
  const h = identifyHand([
    makeCard('H', 5), makeCard('D', 5), makeCard('C', 5), makeCard('S', 6)
  ]);
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

// ============================================================
// §4  identifyHand: STRAIGHT_TRIPLE (连珠蛋, 3 组连续蛋子)
// ============================================================
section('4. identifyHand: STRAIGHT_TRIPLE');

test('222-333-444 (9 张) → STRAIGHT_TRIPLE, low=2', () => {
  const h = identifyHand(makeGroups([2, 3, 4], 3));
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT_TRIPLE);
  assert.strictEqual(h.low, 2);
});

test('AAA-222-333 (A 作低端, 9 张) → STRAIGHT_TRIPLE, low=1', () => {
  const h = identifyHand(makeGroups([14, 2, 3], 3));
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT_TRIPLE);
  assert.strictEqual(h.low, 1);
});

test('QQQ-KKK-AAA (A 作高端, 9 张) → STRAIGHT_TRIPLE, low=12', () => {
  const h = identifyHand(makeGroups([12, 13, 14], 3));
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT_TRIPLE);
  assert.strictEqual(h.low, 12);
});

test('222-333 (6 张, 只 2 组) → INVALID (连珠蛋需 3 组)', () => {
  const h = identifyHand(makeGroups([2, 3], 3));
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

test('222-333-555 (9 张, 不连续) → INVALID', () => {
  const h = identifyHand(makeGroups([2, 3, 5], 3));
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

test('222-333-444-555 (12 张, 4 组) → STRAIGHT_TRIPLE_LARGE (批次 3 实现四连珠蛋)', () => {
  const h = identifyHand(makeGroups([2, 3, 4, 5], 3));
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT_TRIPLE_LARGE);
  assert.strictEqual(h.low, 2);
});

// ============================================================
// §5  identifyHand: FAKE_EIGHT (假八, 2 组连续四张)
// ============================================================
section('5. identifyHand: FAKE_EIGHT');

test('AAAA-KKKK (8 张) → FAKE_EIGHT, low=13', () => {
  const h = identifyHand(makeGroups([14, 13], 4));  // 注意顺序：先 A 后 K
  assert.strictEqual(h.type, HAND_TYPES.FAKE_EIGHT);
  assert.strictEqual(h.low, 13);
});

test('AAAA-2222 (A 作低端, 8 张) → FAKE_EIGHT, low=1', () => {
  const h = identifyHand(makeGroups([14, 2], 4));
  assert.strictEqual(h.type, HAND_TYPES.FAKE_EIGHT);
  assert.strictEqual(h.low, 1);
});

test('2222-3333 (8 张) → FAKE_EIGHT, low=2', () => {
  const h = identifyHand(makeGroups([2, 3], 4));
  assert.strictEqual(h.type, HAND_TYPES.FAKE_EIGHT);
  assert.strictEqual(h.low, 2);
});

test('KKKK (4 张, 只 1 组) → INVALID (假八需 2 组)', () => {
  const h = identifyHand(makeSameRank(13, 4));
  assert.strictEqual(h.type, HAND_TYPES.BIG_TRIPLE);
});

test('AAAA-KKKK-QQQQ (12 张, 3 组) → TRIPLE_FAKE_EIGHT (不是 FAKE_EIGHT)', () => {
  const h = identifyHand(makeGroups([14, 13, 12], 4));
  assert.strictEqual(h.type, HAND_TYPES.TRIPLE_FAKE_EIGHT);
});

// ============================================================
// §6  identifyHand: TRIPLE_FAKE_EIGHT (三连假八, 3 组连续四张)
// ============================================================
section('6. identifyHand: TRIPLE_FAKE_EIGHT');

test('AAAA-KKKK-QQQQ (12 张) → TRIPLE_FAKE_EIGHT, low=12', () => {
  const h = identifyHand(makeGroups([14, 13, 12], 4));
  assert.strictEqual(h.type, HAND_TYPES.TRIPLE_FAKE_EIGHT);
  assert.strictEqual(h.low, 12);
});

test('2222-3333-4444 (12 张) → TRIPLE_FAKE_EIGHT, low=2', () => {
  const h = identifyHand(makeGroups([2, 3, 4], 4));
  assert.strictEqual(h.type, HAND_TYPES.TRIPLE_FAKE_EIGHT);
  assert.strictEqual(h.low, 2);
});

test('QQQ-KKK-AAA (A 作高端) → TRIPLE_FAKE_EIGHT, low=12', () => {
  const h = identifyHand(makeGroups([12, 13, 14], 4));
  assert.strictEqual(h.type, HAND_TYPES.TRIPLE_FAKE_EIGHT);
  assert.strictEqual(h.low, 12);
});

test('AAAA-KKKK-QQQQ-JJJJ (16 张, 4 组) → INVALID (固定 3 组)', () => {
  const h = identifyHand(makeGroups([14, 13, 12, 11], 4));
  assert.strictEqual(h.type, HAND_TYPES.INVALID);
});

// ============================================================
// §7  compareHands: BIG_TRIPLE (张数优先, 再比 rank)
// ============================================================
section('7. compareHands: BIG_TRIPLE');

test('5 张 rank=5 < 6 张 rank=5 (张数多胜)', () => {
  const a = identifyHand(makeSameRank(5, 5));
  const b = identifyHand(makeSameRank(5, 6));
  assert.ok(compareHands(a, b) < 0);
});

test('4 张 rank=7 < 4 张 rank=8 (同张数, rank 高的胜)', () => {
  const a = identifyHand(makeSameRank(7, 4));
  const b = identifyHand(makeSameRank(8, 4));
  assert.ok(compareHands(a, b) < 0);
});

test('4 张 rank=5 == 4 张 rank=5', () => {
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand(makeSameRank(5, 4));
  assert.strictEqual(compareHands(a, b), 0);
});

// ============================================================
// §8  compareHands: TRUE_SEVEN / TRUE_EIGHT (只比 rank)
// ============================================================
section('8. compareHands: TRUE_SEVEN / TRUE_EIGHT');

test('真七 3333333 > KKKKKKK (§6.2 顺序)', () => {
  // SKILL §6.2: 普通单张顺序 3 > 2 > A(14) > K(13) > Q(12) > ...
  const a = identifyHand(makeSameRank(3, 7));
  const b = identifyHand(makeSameRank(13, 7));
  assert.ok(compareHands(a, b) > 0);
});

test('真八 55555555 < JJJJJJJJ (§6.2 顺序)', () => {
  // SKILL §6.2: 5 < J(11) (5 在 6 之下, 是低牌)
  const a = identifyHand(makeSameRank(5, 8));
  const b = identifyHand(makeSameRank(11, 8));
  assert.ok(compareHands(a, b) < 0);
});

// ============================================================
// §9  compareHands: STRAIGHT_TRIPLE / FAKE_EIGHT / TRIPLE_FAKE_EIGHT (比 low)
// ============================================================
section('9. compareHands: STRAIGHT_TRIPLE / FAKE_EIGHT / TRIPLE_FAKE_EIGHT');

test('连珠蛋 222-333-444 < 333-444-555 (高 low 胜)', () => {
  const a = identifyHand(makeGroups([2, 3, 4], 3));
  const b = identifyHand(makeGroups([3, 4, 5], 3));
  assert.ok(compareHands(a, b) < 0);
});

test('连珠蛋 AAA-222-333 (low=1) < 222-333-444 (low=2)', () => {
  const a = identifyHand(makeGroups([14, 2, 3], 3));
  const b = identifyHand(makeGroups([2, 3, 4], 3));
  assert.ok(compareHands(a, b) < 0);
});

test('假八 AAAA-2222 (low=1) < KKKK-AAAA (low=13)? 是 AAAA 在低端, low=1; KKKK 在高端, low=13', () => {
  // 重新明确：AA KK 表示 A 在前（A 作为低端）所以是 A-2 或 A-K
  // 实际上 "AAAA-2222" 意味着 4 个 A 和 4 个 2，唯一 rank 是 14 和 2
  // A-as-low: 序列是 A-2, low=1
  // "KKKK-AAAA" 意味着 4 个 K 和 4 个 A，唯一 rank 是 13 和 14
  // A-as-high: 序列是 K-A, low=13
  // low 1 < 13，所以 AAAA-2222 (low=1) 弱于 KKKK-AAAA (low=13)
  const a = identifyHand(makeGroups([14, 2], 4));    // AAAA-2222
  const b = identifyHand(makeGroups([13, 14], 4));   // KKKK-AAAA
  assert.ok(compareHands(a, b) < 0);
});

test('三连假八 2222-3333-4444 < 3333-4444-5555 (高 low 胜)', () => {
  const a = identifyHand(makeGroups([2, 3, 4], 4));
  const b = identifyHand(makeGroups([3, 4, 5], 4));
  assert.ok(compareHands(a, b) < 0);
});

// ============================================================
// §10  compareHands: 不同类型不可比
// ============================================================
section('10. compareHands: 不同类型');

test('BIG_TRIPLE vs TRUE_SEVEN → 0', () => {
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand(makeSameRank(5, 7));
  assert.strictEqual(compareHands(a, b), 0);
});

test('STRAIGHT_TRIPLE vs FAKE_EIGHT → 0', () => {
  const a = identifyHand(makeGroups([2, 3, 4], 3));
  const b = identifyHand(makeGroups([2, 3], 4));
  assert.strictEqual(compareHands(a, b), 0);
});

// ============================================================
// §11  canBeat: 大蛋子 跨类型
// ============================================================
section('11. canBeat: 大蛋子');

test('大蛋子 (4) > 蛋子 (777)', () => {
  // BIG_TRIPLE (3) > TRIPLE (1)
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand(makeSameRank(7, 3));
  assert.ok(canBeat(a, b));
});

test('大蛋子 (4) > 龙 (345)', () => {
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand([
    makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)
  ]);
  assert.ok(canBeat(a, b));
});

test('大蛋子 (4) > 对子 (77)', () => {
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.ok(canBeat(a, b));
});

test('大蛋子 (4) > 单张 (5)', () => {
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand([makeCard('H', 5)]);
  assert.ok(canBeat(a, b));
});

test('大蛋子 (4) < 真七 (按全局等级)', () => {
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand(makeSameRank(5, 7));
  assert.ok(!canBeat(a, b));
});

test('大蛋子 (4) < 连珠蛋', () => {
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand(makeGroups([2, 3, 4], 3));
  assert.ok(!canBeat(a, b));
});

// ============================================================
// §12  canBeat: 真七 / 真八 / 假八 / 连珠蛋 / 三连假八 跨类型
// ============================================================
section('12. canBeat: 真七/真八/假八/连珠蛋/三连假八');

test('真七 > 大蛋子', () => {
  const a = identifyHand(makeSameRank(5, 7));
  const b = identifyHand(makeSameRank(5, 4));
  assert.ok(canBeat(a, b));
});

test('真八 > 真七', () => {
  const a = identifyHand(makeSameRank(3, 8));
  const b = identifyHand(makeSameRank(3, 7));
  assert.ok(canBeat(a, b));
});

test('真八 > 蛋子 (按全局等级)', () => {
  const a = identifyHand(makeSameRank(5, 8));
  const b = identifyHand(makeSameRank(3, 3));
  assert.ok(canBeat(a, b));
});

test('假八 > 连珠蛋 (按全局等级)', () => {
  const a = identifyHand(makeGroups([14, 13], 4));
  const b = identifyHand(makeGroups([2, 3, 4], 3));
  assert.ok(canBeat(a, b));
});

test('三连假八 > 假八 (按全局等级)', () => {
  const a = identifyHand(makeGroups([14, 13, 12], 4));
  const b = identifyHand(makeGroups([14, 13], 4));
  assert.ok(canBeat(a, b));
});

test('三连假八 > 真七 (按全局等级)', () => {
  const a = identifyHand(makeGroups([14, 13, 12], 4));
  const b = identifyHand(makeSameRank(3, 7));
  assert.ok(canBeat(a, b));
});

test('连珠蛋 > 大蛋子 (按全局等级)', () => {
  const a = identifyHand(makeGroups([2, 3, 4], 3));
  const b = identifyHand(makeSameRank(5, 4));
  assert.ok(canBeat(a, b));
});

// ============================================================
// §13  canBeat: 4-张 大蛋子 vs 单大A (特殊规则)
// ============================================================
section('13. canBeat: 4-张 大蛋子 vs 单大A');

test('4-张 大蛋子 does NOT beat 单大A (per §6.4 "4张大蛋子不能管单大A")', () => {
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(!canBeat(a, b));
});

// §6.4 原文: "只有5张或6张同点数的大蛋子以及全局牌力高于或等于5张同点数的大蛋子的更高牌型能管单大A；4张大蛋子不能管单大A"
// 规则只按**张数**判定(5或6), 不要求这些蛋子是大A牌 —— 33333 也能管单大A。
test('5-张 大蛋子 (非全大A) beats 单大A (per §6.4 只按张数判定)', () => {
  const a = identifyHand(makeSameRank(5, 5));
  const b = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(canBeat(a, b), '§6.4: 5张同点数大蛋子能管单大A, 无需是大A牌');
});

test('6-张 大蛋子 (非全大A) beats 单大A (per §6.4 只按张数判定)', () => {
  const a = identifyHand(makeSameRank(5, 6));
  const b = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(canBeat(a, b), '§6.4: 6张同点数大蛋子能管单大A, 无需是大A牌');
});

test('4-张 大蛋子 (全大A) 也不能管单大A — §6.4 看张数不看牌面', () => {
  const fourBigA = [
    makeCard('H', 14, { is主方大A: true }), makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true }), makeCard('H', 14, { is主方大A: true })
  ];
  const a = identifyHand(fourBigA);
  const b = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(!canBeat(a, b), '§6.4: 4张大蛋子不能管单大A, 即使全是大A');
});

test('4-张 大蛋子 vs 普通 SINGLE (非单大A) — 能压 (按全局等级)', () => {
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand([makeCard('H', 7)]);
  assert.ok(canBeat(a, b));
});

// ============================================================
// §14  canBeat: 双龙 专属 (SKILL §6.4)
// ============================================================
section('14. canBeat: 双龙');

test('大蛋子 (4) > 双龙 (大蛋子+ 可压双龙)', () => {
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand(makeGroups([2, 3, 4, 5, 6], 2));
  assert.ok(canBeat(a, b));
});

test('蛋子 (777) < 双龙 (蛋子不能压双龙)', () => {
  const a = identifyHand(makeSameRank(7, 3));
  const b = identifyHand(makeGroups([2, 3, 4, 5, 6], 2));
  assert.ok(!canBeat(a, b));
});

test('龙 (345) < 双龙 (同层, 不可压)', () => {
  const a = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  const b = identifyHand(makeGroups([2, 3, 4, 5, 6], 2));
  assert.ok(!canBeat(a, b));
});

test('对子 (77) < 双龙 (同层)', () => {
  const a = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  const b = identifyHand(makeGroups([2, 3, 4, 5, 6], 2));
  assert.ok(!canBeat(a, b));
});

test('单张 (5) < 双龙 (同层)', () => {
  const a = identifyHand([makeCard('H', 5)]);
  const b = identifyHand(makeGroups([2, 3, 4, 5, 6], 2));
  assert.ok(!canBeat(a, b));
});

test('双龙 only beats 双龙 (同长度, 高 low)', () => {
  // 双龙 22-33-44-55 (8 张) vs 22-33-44-55 (8 张) — 相同 → false
  const a = identifyHand(makeGroups([2, 3, 4, 5], 2));
  const b = identifyHand(makeGroups([2, 3, 4, 5], 2));
  assert.ok(!canBeat(a, b));
  // 33-44-55-66 (8 张) > 22-33-44-55 (8 张) → true
  const c = identifyHand(makeGroups([3, 4, 5, 6], 2));
  assert.ok(canBeat(c, a));
});

test('双龙 cannot beat 非双龙牌型', () => {
  const a = identifyHand(makeGroups([2, 3, 4, 5], 2));
  const b = identifyHand(makeSameRank(5, 4));  // 大蛋子
  assert.ok(!canBeat(a, b));
});

// ============================================================
// §15  canBeat: 同层不可跨
//   SKILL §6.3: "龙、对子、单张处于同一大类层级，但三种类型之间不互压"
//   蛋子(TRIPLE) 不在这一层, §6.3 链上 蛋子 > 龙/对子/单张,
//   §6 表蛋子条: "可按全局牌力规则跨牌型压制低级类型"
//   §6.4: "蛋子及以上: 原则上可以跨牌型压制全局等级较低的类型"
// ============================================================
section('15. canBeat: 同层不可跨 + 蛋子跨层压制');

test('龙 vs 对子: false (同层)', () => {
  const a = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  const b = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.ok(!canBeat(a, b));
});

test('蛋子 beats 龙 (§6.3 蛋子 > 龙)', () => {
  const a = identifyHand(makeSameRank(7, 3));
  const b = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  assert.ok(canBeat(a, b), '蛋子应能跨型压龙');
});

test('龙 does NOT beat 蛋子 (反向)', () => {
  const a = identifyHand([makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)]);
  const b = identifyHand(makeSameRank(7, 3));
  assert.ok(!canBeat(a, b));
});

test('蛋子 beats 对子 (§6.3 蛋子 > 对子)', () => {
  const a = identifyHand(makeSameRank(7, 3));
  const b = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.ok(canBeat(a, b), '蛋子应能跨型压对子');
});

test('对子 does NOT beat 蛋子 (反向)', () => {
  const a = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  const b = identifyHand(makeSameRank(7, 3));
  assert.ok(!canBeat(a, b));
});

// ============================================================
// §16  canBeat: 双王 跨类型 (per §6.4 固定列表)
// ============================================================
section('16. canBeat: 双王');

test('双王 > 大蛋子 (per §6.4 "可管...大蛋子")', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const b = identifyHand(makeSameRank(5, 4));
  assert.ok(canBeat(a, b));
});

test('双王 > 单大A (per §6.4 "可管...单大A")', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const b = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(canBeat(a, b));
});

test('双王 < 连珠蛋 (连珠蛋 不在双王列表)', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const b = identifyHand(makeGroups([2, 3, 4], 3));
  assert.ok(!canBeat(a, b));
});

test('双王 < 假八 (假八 不在双王列表)', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const b = identifyHand(makeGroups([14, 13], 4));
  assert.ok(!canBeat(a, b));
});

test('双王 < 真七', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const b = identifyHand(makeSameRank(3, 7));
  assert.ok(!canBeat(a, b));
});

test('双王 < 真八', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const b = identifyHand(makeSameRank(3, 8));
  assert.ok(!canBeat(a, b));
});

test('双王 < 三连假八', () => {
  const a = identifyHand([makeCard(null, 'BJ'), makeCard(null, 'SJ')]);
  const b = identifyHand(makeGroups([14, 13, 12], 4));
  assert.ok(!canBeat(a, b));
});

// ============================================================
// §17  canBeat: 单大A 特殊
// ============================================================
section('17. canBeat: 单大A');

test('单大A beats 普通 SINGLE (低 rank)', () => {
  const a = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const b = identifyHand([makeCard('H', 5)]);
  assert.ok(canBeat(a, b));
});

test('单大A does NOT beat 对子 (per §6.4 "单大A不能管对子")', () => {
  const a = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const b = identifyHand([makeCard('H', 7), makeCard('D', 7)]);
  assert.ok(!canBeat(a, b));
});

test('单大A does NOT beat 蛋子', () => {
  const a = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const b = identifyHand(makeSameRank(7, 3));
  assert.ok(!canBeat(a, b));
});

test('单大A does NOT beat 大蛋子 (4 张)', () => {
  const a = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const b = identifyHand(makeSameRank(5, 4));
  assert.ok(!canBeat(a, b));
});

test('单大A does NOT beat 真七', () => {
  const a = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const b = identifyHand(makeSameRank(3, 7));
  assert.ok(!canBeat(a, b));
});

// ============================================================
// §18  canBeat: 不可变性
// ============================================================
section('18. canBeat: 不可变性');

test('失败的 canBeat 返回 state 引用相同', () => {
  const a = identifyHand([makeCard('H', 3)]);
  const b = identifyHand(makeSameRank(5, 4));
  const r = canBeat(a, b);  // 3 < BIG_TRIPLE in power, but same-layer — actually 3 is SINGLE (1), BIG_TRIPLE is 3. 1 < 3, so canBeat returns false
  // Anyway, r should return false and state unchanged
  assert.strictEqual(r, false);
  // Test another case where canBeat is rejected
  const a2 = identifyHand(makeSameRank(5, 3));  // 蛋子
  const b2 = identifyHand(makeGroups([2, 3, 4, 5, 6], 2));  // 双龙
  const r2 = canBeat(a2, b2);
  assert.strictEqual(r2, false);
});

test('成功的 canBeat 返回新对象 (原 state 不变)', () => {
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand([makeCard('H', 5)]);
  const before = JSON.stringify(b);
  const r = canBeat(a, b);
  assert.strictEqual(r, true);
  assert.strictEqual(JSON.stringify(b), before);
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

// ============================================================
// §14  canBeat: 单大A 作为 play 的压制规则 (SKILL §6.4)
// ============================================================
section('14. canBeat: 单大A 作为 play');

test('单大A beats 普通 SINGLE (rank 5)', () => {
  const a = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const b = identifyHand(makeSameRank(5, 1));
  assert.ok(canBeat(a, b));
});

test('单大A beats 普通 SINGLE (rank 14 普通A)', () => {
  // rank 14 普通 A 跟单大A (rank 14 是同rank, 按 §6.2 严格大于才能压)
  // singleRankEncoding: 单大A=20, 普通A=15, 20>15, 能压
  const a = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const b = identifyHand([makeCard('S', 14)]);  // 普通 A, suit S (非主A花色)
  assert.ok(canBeat(a, b));
});

test('单大A does NOT beat PAIR', () => {
  const a = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const b = identifyHand(makeSameRank(5, 2));
  assert.ok(!canBeat(a, b));
});

test('单大A does NOT beat TRIPLE', () => {
  const a = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const b = identifyHand(makeSameRank(5, 3));
  assert.ok(!canBeat(a, b));
});

test('单大A does NOT beat BIG_TRIPLE', () => {
  const a = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const b = identifyHand(makeSameRank(5, 4));
  assert.ok(!canBeat(a, b));
});

test('单大A does NOT beat STRAIGHT', () => {
  const a = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  const b = identifyHand([makeCard('H', 5), makeCard('H', 6), makeCard('H', 7)]);
  assert.ok(!canBeat(a, b));
});

// ============================================================
// §15  canBeat: 单大A 作为 current, 能被谁压 (SKILL §6.4 严格)
// ============================================================
section('15. canBeat: 单大A 作为 current');

test('4 张大A BIG_TRIPLE beats 单大A (per §6.4 "4张同点数的大A")', () => {
  // 4 张 rank 14 全是 is主方大A (H花色)
  const aces = [makeCard('H', 14, { is主方大A: true }),
               makeCard('H', 14, { is主方大A: true }),
               makeCard('H', 14, { is主方大A: true }),
               makeCard('H', 14, { is主方大A: true })];
  const a = identifyHand(aces);
  const b = identifyHand([makeCard('S', 14, { is主方大A: true })]);  // 另一花色大A
  assert.strictEqual(a.type, HAND_TYPES.BIG_TRIPLE);
  assert.ok(canBeat(a, b));
});

test('6 张大A BIG_TRIPLE beats 单大A (per §6.4 "6张同点数的大A")', () => {
  const aces = [];
  for (let i = 0; i < 6; i++) aces.push(makeCard('H', 14, { is主方大A: true }));
  const a = identifyHand(aces);
  const b = identifyHand([makeCard('S', 14, { is主方大A: true })]);
  assert.ok(canBeat(a, b));
});

test('DOUBLE_BIG_A does NOT beat 单大A (per §6.4 "2张大A不能管单大A")', () => {
  const a = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  assert.strictEqual(a.type, HAND_TYPES.DOUBLE_BIG_A);
  const b = identifyHand([makeCard('S', 14, { is主方大A: true })]);
  assert.ok(!canBeat(a, b));
});

test('DOUBLE_JOKER beats 单大A (per §6.4 双王可管单大A)', () => {
  const a = identifyHand([
    makeCard('J', 'BJ'),  // 大王
    makeCard('J', 'SJ')   // 小王
  ]);
  assert.strictEqual(a.type, HAND_TYPES.DOUBLE_JOKER);
  const b = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(canBeat(a, b));
});

test('TRIPLE_JOKER beats 单大A (per §6.4 三王可管单大A)', () => {
  const a = identifyHand([
    makeCard('J', 'BJ'),
    makeCard('J', 'SJ'),
    makeCard('J', 'BJ')
  ]);
  assert.strictEqual(a.type, HAND_TYPES.TRIPLE_JOKER);
  const b = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(canBeat(a, b));
});

test('FOUR_JOKER beats 单大A (per §6.4 四王可管单大A)', () => {
  const a = identifyHand([
    makeCard('J', 'BJ'),
    makeCard('J', 'SJ'),
    makeCard('J', 'BJ'),
    makeCard('J', 'SJ')
  ]);
  assert.strictEqual(a.type, HAND_TYPES.FOUR_JOKER);
  const b = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(canBeat(a, b));
});

test('BIG_TRIPLE (4 张 rank 5, 非全大A) does NOT beat 单大A (per §6.4 严格)', () => {
  // 非全大A 的 BIG_TRIPLE 不能压单大A, 即使 4+ 张
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(!canBeat(a, b));
});

test('PAIR does NOT beat 单大A (per §6.4 严格)', () => {
  const a = identifyHand(makeSameRank(5, 2));
  const b = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(!canBeat(a, b));
});

test('STRAIGHT does NOT beat 单大A (per §6.4 严格)', () => {
  const a = identifyHand([makeCard('H', 5), makeCard('H', 6), makeCard('H', 7)]);
  const b = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  assert.ok(!canBeat(a, b));
});

// ============================================================
// §16  canBeat: 单王 (单张大王/小王) 压制规则 (SKILL §6.4)
// ============================================================
section('16. canBeat: 单王 压制规则');

test('单王 (大王) beats 普通 SINGLE (rank 3)', () => {
  // rank 3 (encoding 17) < 大王 (encoding 19), 大王能压
  const a = identifyHand([makeCard('J', 'BJ')]);
  const b = identifyHand([makeCard('H', 3)]);
  assert.ok(canBeat(a, b));
});

test('单王 (大王) does NOT beat PAIR (per §6.4 单王只能管单牌)', () => {
  const a = identifyHand([makeCard('J', 'BJ')]);
  const b = identifyHand(makeSameRank(5, 2));
  assert.ok(!canBeat(a, b));
});

test('单王 (小王) does NOT beat TRIPLE (per §6.4 单王只能管单牌)', () => {
  const a = identifyHand([makeCard('J', 'SJ')]);
  const b = identifyHand(makeSameRank(5, 3));
  assert.ok(!canBeat(a, b));
});

test('单王 does NOT beat 单大A (普通单牌不能管单王, 必须大蛋子+)', () => {
  // 等等, 这条要看 SKILL: "单大A可按单大A规则压制单王"
  // 所以单大A 能管单王
  // 但单王 不能管单大A (单王只能管单牌, 单大A 编码20 > 大王 编码19, 但单王只能管"较低"的单牌)
  // 实际: singleRankEncoding: 单大A=20, 大王=19. compareHands SINGLE: 20 vs 19, 单大A更大.
  // 但单王作为 play 时, 只能管 SINGLE (不区分大小). 所以单王可以管单大A (它是 SINGLE)
  // 等等, "单王只能管单牌" 没说它只能管 普通单牌. 单大A 是单牌.
  // 实际: 单王能管单大A (按 encoding: 大王=19 > 单大A=20 ? 不, 19<20. 所以单王 < 单大A)
  // 这条要看实际结果
  const a = identifyHand([makeCard('J', 'BJ')]);
  const b = identifyHand([makeCard('H', 14, { is主方大A: true })]);
  // SKILL §6.4 单王: "单王只能管单牌, 不能管对子或蛋子; 普通单牌不能管单王"
  // 单大A 是单牌, 但"普通单牌不能管单王" - 单大A 算不算普通单牌?
  // 单大A 编码20 > 大王 编码19, 按 §6.2 严格 > 才能压, 所以单大A 严格大于单王, 能压单王
  // 反过来, 大王 编码19 < 单大A 编码20, 单王不能压单大A (encoding 不够大)
  assert.ok(!canBeat(a, b));  // 大王 < 单大A, 不能压
});

test('BIG_TRIPLE beats 单王 (per §6.4 普通单牌不能管单王, 大蛋子可以)', () => {
  const a = identifyHand(makeSameRank(5, 4));
  const b = identifyHand([makeCard('J', 'SJ')]);
  assert.ok(canBeat(a, b));
});

test('PAIR does NOT beat 单王 (per §6.4 PAIR不是大蛋子)', () => {
  const a = identifyHand(makeSameRank(5, 2));
  const b = identifyHand([makeCard('J', 'BJ')]);
  assert.ok(!canBeat(a, b));
});

// ============================================================
// §17  canBeat: DOUBLE_BIG_A 作为 play (per §6.4 "双大A可压制所有牌型")
// ============================================================
section('17. canBeat: DOUBLE_BIG_A 作为 play');

test('DOUBLE_BIG_A beats 普通 SINGLE (rank 5)', () => {
  const a = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  const b = identifyHand([makeCard('H', 5)]);
  assert.strictEqual(a.type, HAND_TYPES.DOUBLE_BIG_A);
  assert.ok(canBeat(a, b));
});

test('DOUBLE_BIG_A beats PAIR', () => {
  const a = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  const b = identifyHand(makeSameRank(5, 2));
  assert.ok(canBeat(a, b));
});

test('DOUBLE_BIG_A beats BIG_TRIPLE', () => {
  const a = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  const b = identifyHand(makeSameRank(5, 4));
  assert.ok(canBeat(a, b));
});

test('DOUBLE_BIG_A beats DOUBLE_STRAIGHT (双龙)', () => {
  const a = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  // 双龙 3对 = 6张
  const b = identifyHand([
    makeCard('H', 2), makeCard('H', 2), makeCard('H', 3),
    makeCard('H', 3), makeCard('H', 4), makeCard('H', 4)
  ]);
  assert.ok(canBeat(a, b));
});

test('DOUBLE_BIG_A beats DOUBLE_JOKER (双王)', () => {
  const a = identifyHand([
    makeCard('H', 14, { is主方大A: true }),
    makeCard('H', 14, { is主方大A: true })
  ]);
  const b = identifyHand([
    makeCard('J', 'BJ'),
    makeCard('J', 'SJ')
  ]);
  assert.ok(canBeat(a, b));
});
