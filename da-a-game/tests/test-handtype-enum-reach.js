// tests/test-handtype-enum-reach.js — 牌型表**枚举可达性**回归
//
// [为什么有这个文件]
//   识别层(hand-types.js) 与 枚举层(combos.js) 是**两层独立实现**。
//   识别层认得出的牌型, 枚举层若枚举不出来 -> 引擎逻辑正确但**玩家打不出**:
//   【提示】/ AI选牌 / doPlay组合回退 三条路径同时失效, 表现为「当前没有可用牌」。
//   历史上因此出 bug: 2026-10-27(双龙/连珠蛋漏)、2026-11-02(假八/三连假八漏)、
//   2026-11-03(A作低端漏 / 13 张最长龙被 MAX_SEQ 截断)。
//   本文件对 SKILL §6 牌型表**逐个牌型**断言「枚举层必须能枚举出来」,
//   把这类缺陷挡在回归里, 不再等用户报障。
//
// [与 audit-rules-vs-impl 的分工]
//   那个脚本做**规则↔实现全矩阵**对账(含跨型压制方向), 是深度体检;
//   本文件只锁「枚举可达性」这一条, 放进 tests/ 每次全量回归都跑。
//
// [跑法] node tests/test-handtype-enum-reach.js
var assert = require('assert');
var ht = require('../src/hand-types.js');
var combosMod = require('../src/combos.js');
var HAND_TYPES = ht.HAND_TYPES;

var passed = 0, failed = 0, failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}

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
function joker(big) {
  return {
    id: (big ? 'BJ' : 'SJ') + '-' + (++_seq),
    suit: null, rank: big ? 'BJ' : 'SJ',
    isBigJoker: !!big, isSmallJoker: !big,
    is主方大A: false, location: { type: 'hand' }
  };
}
function bigA(suit) { var c = card(suit, 14); c.is主方大A = true; return c; }
// 同点 n 张（轮换花色）
function sameRank(rank, n) {
  var suits = ['H', 'D', 'C', 'S'], out = [];
  for (var i = 0; i < n; i++) out.push(card(suits[i % 4], rank));
  return out;
}
// 连续点数各 k 张
function groups(ranks, k) {
  var out = [];
  ranks.forEach(function (r) { out = out.concat(sameRank(r, k)); });
  return out;
}

// 枚举层能否从 hand 里枚举出「长度 len 且识别层认这个牌型」的组合
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

// ---------- SKILL §6 牌型表逐个断言 ----------
console.log('=== SKILL §6 牌型表: 枚举层可达性 ===');

// 单张: 枚举层不产单张(枚举从 2 张起), 单张由 AI/UI 单独处理 -> 不在本文件范围
check('对子 PAIR (2 张同点)', enumReaches(sameRank(5, 2), 2, HAND_TYPES.PAIR));
check('蛋子 TRIPLE (3 张同点)', enumReaches(sameRank(5, 3), 3, HAND_TYPES.TRIPLE));
check('大蛋子 BIG_TRIPLE (4 张同点)', enumReaches(sameRank(5, 4), 4, HAND_TYPES.BIG_TRIPLE));
check('大蛋子 BIG_TRIPLE (6 张同点)', enumReaches(sameRank(5, 6), 6, HAND_TYPES.BIG_TRIPLE));
check('真七 TRUE_SEVEN (7 张同点)', enumReaches(sameRank(7, 7), 7, HAND_TYPES.TRUE_SEVEN));
check('真八 TRUE_EIGHT (8 张同点)', enumReaches(sameRank(8, 8), 8, HAND_TYPES.TRUE_EIGHT));

check('连张 STRAIGHT (3 张连续)', enumReaches([card('H', 5), card('D', 6), card('S', 7)], 3, HAND_TYPES.STRAIGHT));
check('连张 STRAIGHT (QKA, A 作高端)', enumReaches([card('H', 11), card('D', 12), card('S', 13), card('C', 14)], 4, HAND_TYPES.STRAIGHT));
check('连张 STRAIGHT (A23, A 作低端)', enumReaches([card('H', 14), card('D', 2), card('S', 3)], 3, HAND_TYPES.STRAIGHT));
check('连张 STRAIGHT (13 张最长龙 2..A)', enumReaches(
  [2,3,4,5,6,7,8,9,10,11,12,13,14].map(function (r) { return card('H', r); }), 13, HAND_TYPES.STRAIGHT));

check('双龙 DOUBLE_STRAIGHT (3 对连续)', enumReaches(groups([5, 6, 7], 2), 6, HAND_TYPES.DOUBLE_STRAIGHT));
check('连珠蛋 STRAIGHT_TRIPLE (3 组连续)', enumReaches(groups([5, 6, 7], 3), 9, HAND_TYPES.STRAIGHT_TRIPLE));
check('四连珠蛋 BIG_STRAIGHT_TRIPLE (4 组连续)', enumReaches(groups([5, 6, 7, 8], 3), 12, HAND_TYPES.BIG_STRAIGHT_TRIPLE));
check('假八 FAKE_EIGHT (2 组连续)', enumReaches(groups([5, 6], 4), 8, HAND_TYPES.FAKE_EIGHT));
check('三连假八 BIG_FAKE_EIGHT (3 组连续)', enumReaches(groups([5, 6, 7], 4), 12, HAND_TYPES.BIG_FAKE_EIGHT));

check('双王 DOUBLE_JOKER', enumReaches([joker(true), joker(true)], 2, HAND_TYPES.DOUBLE_JOKER));
check('三王 TRIPLE_JOKER', enumReaches([joker(true), joker(true), joker(false)], 3, HAND_TYPES.TRIPLE_JOKER));
check('四王 FOUR_JOKER', enumReaches([joker(true), joker(true), joker(false), joker(false)], 4, HAND_TYPES.FOUR_JOKER));

check('双大A DOUBLE_BIG_A (两张同花色大A)', enumReaches([bigA('H'), bigA('H')], 2, HAND_TYPES.DOUBLE_BIG_A));

// ---------- 枚举层不得产出识别层不认的组合 ----------
console.log('\n=== 枚举层产出的组合必须都被识别层认可 ===');
var mixed = groups([5, 6, 7], 3).concat([card('H', 14), card('D', 14)]);
var badOnes = [];
combosMod.candidateCombos(mixed).forEach(function (ids) {
  var cards = ids.map(function (id) {
    return mixed.filter(function (c) { return c.id === id; })[0];
  }).filter(Boolean);
  if (cards.length !== ids.length) return;
  if (ht.identifyHand(cards).type === HAND_TYPES.INVALID) {
    badOnes.push(ids.length + ' 张: ' + ids.join(','));
  }
});
check('枚举出的组合都被识别层认可 (无 INVALID)', badOnes.length === 0,
  badOnes.length ? badOnes.slice(0, 3).join(' ~ ') : '');

console.log('\ntest-handtype-enum-reach: ' + passed + ' passed, ' + failed + ' failed');
if (failures.length) {
  console.log('Failed tests:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed === 0 ? 0 : 1);
