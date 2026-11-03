// skills/audit-rules-vs-impl/scripts/audit.js — 规则 ↔ 实现 三向对账（只读）
//
// 用途: 见同目录 ../SKILL.md。本脚本**只读**——不修改 src/、不修改测试、不写任何文件。
// 跑法: node skills/audit-rules-vs-impl/scripts/audit.js
//
// [为什么独立于 tools/] tools/audit-skill-tests.js 对账的是 SKILL §13「必测用例」
//   在测试里的覆盖线索; 本脚本对账的是**规则 → 识别层 → 枚举层**三者的一致性。
//   两者锚点不同, 职责不重叠。

var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');   // -> da-a-game/

var ht = require(path.join(ROOT, 'src', 'hand-types.js'));
var combos = require(path.join(ROOT, 'src', 'combos.js'));

var HAND_TYPES = ht.HAND_TYPES;
var POWER = null;

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
// 同点 n 张（用不同花色, 最多 4 张同花色 -> 再加第二副牌）
function sameRank(rank, n) {
  var suits = ['H', 'D', 'C', 'S'];
  var out = [];
  for (var i = 0; i < n; i++) out.push(card(suits[i % 4], rank));
  return out;
}
function bigA(suit) {
  var c = card(suit, 14);
  c.is主方大A = true;
  return c;
}

// ---------- 1. 枚举可达性 ----------
// 每项: SKILL §6 牌型 -> 最小可构成手牌 + 期望枚举出的长度
var ENUM_CASES = [
  { name: '对子(PAIR)',        hand: sameRank(5, 2),  len: 2 },
  { name: '蛋子(TRIPLE)',      hand: sameRank(5, 3),  len: 3 },
  { name: '大蛋子(BIG_TRIPLE)',hand: sameRank(5, 4),  len: 4 },
  { name: '真七(TRUE_SEVEN)',  hand: sameRank(7, 7),  len: 7 },
  { name: '真八(TRUE_EIGHT)',  hand: sameRank(8, 8),  len: 8 },
  { name: '连张 A23(低端A)',   hand: [card('H', 14), card('D', 2), card('S', 3)], len: 3 },
  { name: '连张 A234(低端A连续段)', hand: [card('H', 14), card('D', 2), card('S', 3), card('C', 4)], len: 4 },
  { name: '连张 A2345(低端A连续段)', hand: [card('H', 14), card('D', 2), card('S', 3), card('C', 4), card('H', 5)], len: 5 },
  { name: '连张 QKA(高端A)',   hand: [card('H', 11), card('D', 12), card('S', 13), card('C', 14)], len: 4 },
  { name: '连张 2..A(最长龙)', hand: [2,3,4,5,6,7,8,9,10,11,12,13,14].map(function (r) { return card('H', r); }), len: 13 },
  { name: '双龙(DOUBLE_STRAIGHT)', hand: sameRank(5,2).concat(sameRank(6,2), sameRank(7,2)), len: 6 },
  { name: '连珠蛋(STRAIGHT_TRIPLE)', hand: sameRank(5,3).concat(sameRank(6,3), sameRank(7,3)), len: 9 },
  { name: '四连珠蛋(STRAIGHT_TRIPLE_LARGE)', hand: sameRank(5,3).concat(sameRank(6,3), sameRank(7,3), sameRank(8,3)), len: 12 },
  { name: '假八(FAKE_EIGHT)',  hand: sameRank(5,4).concat(sameRank(6,4)), len: 8 },
  { name: '三连假八(TRIPLE_FAKE_EIGHT)', hand: sameRank(5,4).concat(sameRank(6,4), sameRank(7,4)), len: 12 },
  { name: '双王(DOUBLE_JOKER)', hand: [joker(true), joker(true)], len: 2 },
  { name: '三王(TRIPLE_JOKER)', hand: [joker(true), joker(true), joker(false)], len: 3 },
  { name: '四王(FOUR_JOKER)',  hand: [joker(true), joker(true), joker(false), joker(false)], len: 4 }
];

function checkEnumReachability() {
  var bad = [];
  ENUM_CASES.forEach(function (cs) {
    var combos = combosMod.candidateCombos(cs.hand);
    var hit = combos.some(function (ids) {
      if (ids.length !== cs.len) return false;
      var cards = ids.map(function (id) {
        return cs.hand.filter(function (c) { return c.id === id; })[0];
      }).filter(Boolean);
      if (cards.length !== ids.length) return false;
      return ht.identifyHand(cards).type !== HAND_TYPES.INVALID;
    });
    if (!hit) {
      bad.push({ name: cs.name, want: cs.len + ' 张', got: '未找到该长度的合法组合（候选共 ' + combos.length + ' 个）' });
    }
  });
  return bad;
}

// ---------- 2. 跨型矩阵 ----------
// §6.3 全局链 (高 -> 低)。双龙单独处理, 不在链上。
var CHAIN = [
  { key: 'DOUBLE_BIG_A',       hand: (function () { var a = bigA('H'), b = bigA('H'); return [a, b]; })() },
  { key: 'FOUR_JOKER',         hand: [joker(true), joker(true), joker(false), joker(false)] },
  { key: 'TRIPLE_FAKE_EIGHT',  hand: sameRank(5,4).concat(sameRank(6,4), sameRank(7,4)) },
  { key: 'STRAIGHT_TRIPLE_LARGE', hand: sameRank(5,3).concat(sameRank(6,3), sameRank(7,3), sameRank(8,3)) },
  { key: 'TRIPLE_JOKER',       hand: [joker(true), joker(true), joker(false)] },
  { key: 'TRUE_EIGHT',         hand: sameRank(8,8) },
  { key: 'TRUE_SEVEN',         hand: sameRank(7,7) },
  { key: 'FAKE_EIGHT',         hand: sameRank(5,4).concat(sameRank(6,4)) },
  { key: 'STRAIGHT_TRIPLE',    hand: sameRank(5,3).concat(sameRank(6,3), sameRank(7,3)) },
  { key: 'DOUBLE_JOKER',       hand: [joker(true), joker(true)] },
  { key: 'BIG_TRIPLE',         hand: sameRank(5,4) },
  { key: 'TRIPLE',             hand: sameRank(5,3) },
  { key: 'STRAIGHT',           hand: [card('H',5), card('D',6), card('S',7)] },
  { key: 'PAIR',               hand: sameRank(5,2) },
  { key: 'SINGLE',             hand: [card('H',5)] }
];

// §6.3 全局链判定（高 -> 低）:
//   - 链上更高的能压更低的
//   - 例外: 龙 / 对子 / 单张 是**同一层级**, 三者之间互不压
//   - 双龙 (§6.4) 不在链上, 单独处理
// [修正] 上一版只判了「非底层三兄弟就 expect true」, 没看链上的**相对顺序**,
//   于是「弱牌压强牌」也被当成应该 true -> 大量误报。
var BOTTOM_TIER = { SINGLE: 1, PAIR: 1, STRAIGHT: 1 };
function checkCrossMatrix() {
  var bad = [];
  var i, j;
  for (i = 0; i < CHAIN.length; i++) {
    for (j = 0; j < CHAIN.length; j++) {
      if (i === j) continue;
      var hi = CHAIN[i], lo = CHAIN[j];
      var a = ht.identifyHand(hi.hand), b = ht.identifyHand(lo.hand);
      if (a.type === HAND_TYPES.INVALID || b.type === HAND_TYPES.INVALID) continue;
      var got = ht.canBeat(a, b);
      // i < j => hi 在链上更高
      var expect;
      if (i < j) {
        // hi 更高: 只有「底层三兄弟互压」这一条例外
        expect = !(BOTTOM_TIER[hi.key] && BOTTOM_TIER[lo.key]);
      } else {
        expect = false;   // hi 更弱: 压不过
      }
      if (got !== expect) {
        bad.push({ from: hi.key, to: lo.key, expect: expect, got: got });
      }
    }
  }
  return bad;
}

// ---------- 3. 识别 ↔ 枚举 一致 ----------
function checkEnumIdentifyAgree() {
  var bad = [];
  // 构造一副"什么都有"的手牌, 把枚举出的组合都过一遍识别层
  var hand = [];
  [2,3,4,5,6,7,8].forEach(function (r) { hand = hand.concat(sameRank(r, 4)); });
  hand = hand.concat([card('H', 14), card('D', 14), card('C', 14), card('S', 14)]);
  hand = hand.concat([joker(true), joker(true), joker(false), joker(false)]);
  combosMod.candidateCombos(hand).forEach(function (ids) {
    var cards = ids.map(function (id) {
      return hand.filter(function (c) { return c.id === id; })[0];
    }).filter(Boolean);
    if (cards.length !== ids.length) return;
    var h = ht.identifyHand(cards);
    if (h.type === HAND_TYPES.INVALID) {
      bad.push({ len: ids.length, ids: ids.slice(0, 4).join(',') });
    }
  });
  return bad;
}

// ---------- 4. 排列对称性 ----------
function checkPermutationSymmetry() {
  var bad = [];
  var cases = [
    { ranks: [4, 4, 5], expectStraight: false },
    { ranks: [4, 5, 5], expectStraight: false },
    { ranks: [5, 6, 7], expectStraight: true },
    { ranks: [14, 2, 3], expectStraight: true }
  ];
  cases.forEach(function (cs) {
    var results = [];
    // 枚举排列
    function perm(arr) {
      if (arr.length <= 1) return [arr];
      var out = [];
      arr.forEach(function (v, i) {
        var rest = arr.slice(0, i).concat(arr.slice(i + 1));
        perm(rest).forEach(function (p) { out.push([v].concat(p)); });
      });
      return out;
    }
    perm(cs.ranks).forEach(function (p) {
      var cards = p.map(function (r) { return card('H', r); });
      var h = ht.identifyHand(cards);
      var isStraight = h.type === HAND_TYPES.STRAIGHT;
      results.push(isStraight);
      if (isStraight !== cs.expectStraight) {
        bad.push({ perm: p.join(','), expect: cs.expectStraight, got: isStraight });
      }
    });
    // 同一组点数, 不同排列 -> 结论必须一致
    var first = results[0];
    results.forEach(function (r, i) {
      if (r !== first) bad.push({ perm: 'perm#' + i, expect: first, got: r, note: '排列不一致' });
    });
  });
  return bad;
}

// ---------- 输出 ----------
var combosMod = combos;
var sections = [
  { title: '1. 枚举可达性（识别层认得出的, 枚举层出不出得来）', rows: checkEnumReachability(), fmt: function (r) {
      return '  ' + r.name + ': 期望枚举出 ' + r.want + ' 的组合 -> 实际 ' + r.got;
    } },
  { title: '2. 跨型矩阵（§6.3 全局链, 两方向）', rows: checkCrossMatrix(), fmt: function (r) {
      return '  ' + r.from + ' 压 ' + r.to + ': 期望 ' + r.expect + ' -> 实际 ' + r.got;
    } },
  { title: '3. 识别 ↔ 枚举 一致（枚举出的组合不该被判 INVALID）', rows: checkEnumIdentifyAgree(), fmt: function (r) {
      return '  ' + r.len + ' 张组合被识别层判 INVALID (ids: ' + r.ids + ')';
    } },
  { title: '4. 排列对称性（同一组点数不同排列结论必须一致）', rows: checkPermutationSymmetry(), fmt: function (r) {
      return '  ' + (r.perm || '') + ' 期望 ' + r.expect + ' -> 实际 ' + r.got + (r.note ? ' (' + r.note + ')' : '');
    } }
];

var total = 0;
sections.forEach(function (s) {
  console.log('\n=== ' + s.title + ' ===');
  if (!s.rows.length) {
    console.log('  OK  未发现问题');
  } else {
    total += s.rows.length;
    s.rows.forEach(function (r) { console.log(s.fmt(r)); });
  }
});
console.log('\n========================================================');
console.log(total === 0
  ? 'audit-rules-vs-impl: 4 组对账全部通过'
  : 'audit-rules-vs-impl: 发现 ' + total + ' 处可疑（是排查清单, 需人读断言定论）');
process.exit(total === 0 ? 0 : 1);
