// tests/test-straight-low-ace.js — 回归: A 作**低端的连续段**（SKILL §6.1 放宽）
//
// [背景] 2026-11-03 用户裁定把 §6.1 从「只点名 A23」放宽为「A 作低端的连续段」
//   （A 后面紧接 2：A23 / A234 / A2345… / 最长 A-2-3-…-K 共 13 张）。
//   放宽前, 识别层 isValidStraight 其实**已经**接受这些更长形态（比 SKILL 宽），
//   枚举层 (combos.js 的 b2 分支) 也**已经**能枚举出来 —— 本次是把规则文本对齐到既有实现。
//   本文件锁住放宽后的口径, 防止将来有人把识别层收窄回去（那会让玩家打不出 A234）。
//
// [与其它测试的分工]
//   test-handtype-enum-reach.js —— 逐个牌型的**枚举可达性**（广度）
//   本文件 —— 「A 作低端连续段」这一条规则的**边界与大小关系**（深度）
//
// [跑法] node tests/test-straight-low-ace.js
var assert = require('assert');
var ht = require('../src/hand-types.js');
var combosMod = require('../src/combos.js');
var HAND_TYPES = ht.HAND_TYPES;

var passed = 0, failed = 0, failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// ---------- 造牌 ----------
var _seq = 0;
function card(suit, rank) {
  return {
    id: (suit || 'X') + '-' + rank + '-' + (++_seq),
    suit: suit, rank: rank,
    isBigJoker: false, isSmallJoker: false, is主方大A: false,
    location: { type: 'hand' }
  };
}
// 点数序列 -> 手牌
function seq(ranks) {
  return ranks.map(function (r, i) { return card('HDS'[i % 3], r); });
}
// A 作低端: A 后面紧接 2,3,4,...  (A=14)
function lowAce(startRank, count) {
  var out = [card('S', 14)];
  for (var i = 0; i < count; i++) out.push(card('HDS'[i % 3], startRank + i));
  return out;
}
// A 作高端: A 前面紧接 K (=13)
function highAce(count) {
  var out = [];
  for (var i = 0; i < count; i++) out.push(card('HDS'[i % 3], 13 - count + 1 + i));
  out.push(card('S', 14));
  return out;
}
// 枚举层能否从 hand 里枚举出「指定长度且识别层认这个牌型」的组合
function enumReaches(hand, len, type) {
  var combos = combosMod.candidateCombos(hand);
  for (var i = 0; i < combos.length; i++) {
    if (combos[i].length !== len) continue;
    var cards = combos[i].map(function (id) {
      return hand.filter(function (c) { return c.id === id; })[0];
    }).filter(Boolean);
    if (cards.length !== len) continue;
    if (ht.identifyHand(cards).type === type) return true;
  }
  return false;
}

// ============================================================
// 1. 识别层：A 作低端的连续段一律是 STRAIGHT, low=1
// ============================================================
section('1. 识别层：A 作低端的连续段 -> STRAIGHT (low=1)');

var LOW_CASES = [
  { name: 'A23 (3 张)',  ranks: [14, 2, 3],          len: 3 },
  { name: 'A234 (4 张)', ranks: [14, 2, 3, 4],       len: 4 },
  { name: 'A2345 (5 张)',ranks: [14, 2, 3, 4, 5],    len: 5 },
  { name: 'A-2-3-…-K (13 张)', ranks: [14].concat([2,3,4,5,6,7,8,9,10,11,12,13]), len: 13 }
];
LOW_CASES.forEach(function (cs) {
  var h = ht.identifyHand(seq(cs.ranks));
  check(cs.name + ' 识别为 STRAIGHT', h.type === HAND_TYPES.STRAIGHT, 'got ' + h.type);
  check(cs.name + ' length=' + cs.len, h.length === cs.len, 'got ' + h.length);
  check(cs.name + ' low=1 (A 在最低端)', h.low === 1, 'got ' + h.low);
});

// A 作高端的连续段同样成立（对称口径, 原有行为）
section('1b. 识别层：A 作高端的连续段 -> STRAIGHT');
var HIGH_CASES = [
  { name: 'QKA (3 张)',      ranks: [12, 13, 14],          len: 3 },
  { name: 'JQKA (4 张)',     ranks: [11, 12, 13, 14],       len: 4 },
  { name: '10-J-Q-K-A (5 张)', ranks: [10, 11, 12, 13, 14], len: 5 }
];
HIGH_CASES.forEach(function (cs) {
  var h = ht.identifyHand(seq(cs.ranks));
  check(cs.name + ' 识别为 STRAIGHT', h.type === HAND_TYPES.STRAIGHT, 'got ' + h.type);
  check(cs.name + ' length=' + cs.len, h.length === cs.len, 'got ' + h.length);
  check(cs.name + ' low=' + (cs.ranks[0]), h.low === cs.ranks[0], 'got ' + h.low);
});

// ============================================================
// 2. 非法形态必须仍被拒
// ============================================================
section('2. 放宽不等于放宽到 K-A-2 / 跳号 / 2 张');

check('K-A-2 (3 张) 不是连张 -> INVALID',
  ht.identifyHand(seq([13, 14, 2])).type === HAND_TYPES.INVALID,
  'got ' + ht.identifyHand(seq([13, 14, 2])).type);
check('Q-K-A-2 (4 张, 含 K-A-2) 不是连张 -> INVALID',
  ht.identifyHand(seq([12, 13, 14, 2])).type === HAND_TYPES.INVALID,
  'got ' + ht.identifyHand(seq([12, 13, 14, 2])).type);
check('A-2-4 (跳号) 不是连张 -> INVALID',
  ht.identifyHand(seq([14, 2, 4])).type === HAND_TYPES.INVALID,
  'got ' + ht.identifyHand(seq([14, 2, 4])).type);
check('A-2 (2 张) 不是连张 -> INVALID',
  ht.identifyHand(seq([14, 2])).type === HAND_TYPES.INVALID,
  'got ' + ht.identifyHand(seq([14, 2])).type);
check('两张 A 不能组成连张 -> INVALID',
  ht.identifyHand(seq([14, 14, 2, 3])).type === HAND_TYPES.INVALID,
  'got ' + ht.identifyHand(seq([14, 14, 2, 3])).type);

// ============================================================
// 3. 枚举层可达性（放宽后玩家要能真的打出来）
// ============================================================
section('3. 枚举层可达性：A 作低端的连续段必须枚举得出来');

check('枚举层能枚举出 A23',
  enumReaches(lowAce(2, 2), 3, HAND_TYPES.STRAIGHT));
check('枚举层能枚举出 A234',
  enumReaches(lowAce(2, 3), 4, HAND_TYPES.STRAIGHT));
check('枚举层能枚举出 A2345',
  enumReaches(lowAce(2, 4), 5, HAND_TYPES.STRAIGHT));
check('枚举层能枚举出 13 张最长龙 A-2-3-…-K',
  enumReaches(lowAce(2, 12), 13, HAND_TYPES.STRAIGHT));
check('枚举层能枚举出 13 张最长龙 2-3-…-K-A',
  enumReaches(highAce(12), 13, HAND_TYPES.STRAIGHT));
check('枚举层能枚举出 10-J-Q-K-A (A 作高端 5 张)',
  enumReaches(highAce(4), 5, HAND_TYPES.STRAIGHT));

// ============================================================
// 4. 大小关系（§6.1: 相同长度时连续段越大越强; QKA最大, A23最小）
// ============================================================
section('4. 大小关系');

var a23 = ht.identifyHand(seq([14, 2, 3]));
var t234 = ht.identifyHand(seq([2, 3, 4]));
var qka = ht.identifyHand(seq([12, 13, 14]));
var a234 = ht.identifyHand(seq([14, 2, 3, 4]));
var t2345 = ht.identifyHand(seq([2, 3, 4, 5]));

check('A23 < 234 (同长度, A 在低端更小)', ht.compareHands(a23, t234) < 0);
check('A23 < QKA (同长度, QKA 最大)', ht.compareHands(a23, qka) < 0);
check('234 < QKA', ht.compareHands(t234, qka) < 0);
check('A234 < 2345 (放宽后的低端段同样排最前)', ht.compareHands(a234, t2345) < 0);
check('同长度同 low -> 不分大小', ht.compareHands(a23, ht.identifyHand(seq([14, 2, 3]))) === 0);
check('不同长度 -> 不可比 (返回 0)', ht.compareHands(a23, ht.identifyHand(seq([2, 3, 4, 5]))) === 0);

// canBeat: 同张数才能互压
check('A234 不能压 2345 (连续段更小)', ht.canBeat(a234, t2345) === false);
check('2345 能压 A234', ht.canBeat(t2345, a234) === true);
check('A23 不能压 QKA', ht.canBeat(a23, qka) === false);
check('QKA 能压 A23', ht.canBeat(qka, a23) === true);

console.log('\ntest-straight-low-ace: ' + passed + ' passed, ' + failed + ' failed');
if (failures.length) {
  console.log('Failed tests:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed === 0 ? 0 : 1);
