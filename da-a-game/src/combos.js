// src/combos.js — 手牌候选组合枚举
// 纯函数: 只枚举"可能构成合法牌型"的实体卡组合, 不做任何合法性判断。
// 合法性一律由规则引擎 (transition / identifyHand / canBeat) 裁决 (§14)。
//
// 枚举两类:
//   (a) 同点数组: 同一点数 2..8 张 (对子/蛋子/大蛋子/真七/真八)
//   (b) 连续点数组: 连续点数各取 1 张, 3..12 张 (连张); 每点数多张时按张数展开
//
// 排序: 张数多者优先; 同张数按首张点数高者优先 (让引擎更容易接受, 减少无效尝试)
//
// 纯 JS / CommonJS, 无 wx.* 依赖。

var MIN_SAME_RANK = 2;   // 同点数组最小张数 (2 = 对子)
var MAX_SAME_RANK = 8;   // 同点数组最大张数 (8 = 真八)
var MIN_SEQ = 3;         // 连张最小张数 (§6.1: 3 张及以上)
var MAX_SEQ = 12;        // 连张最大张数 (两副牌最多 4 张/点数, 12 为安全上界)

// 枚举单张以外的候选组合 (cardIds 数组的数组)
function candidateCombos(hand) {
  if (!Array.isArray(hand) || hand.length === 0) return [];
  var out = [];
  var i;

  // ---- (a) 同点数组 ----
  var groups = {};
  for (i = 0; i < hand.length; i++) {
    var c = hand[i];
    if (c.isBigJoker || c.isSmallJoker) continue;   // 王不参与同点数组
    var k = c.rank;
    if (!groups[k]) groups[k] = [];
    groups[k].push(c.id);
  }
  var ranks = Object.keys(groups);
  for (i = 0; i < ranks.length; i++) {
    var g = groups[ranks[i]];
    for (var n2 = MIN_SAME_RANK; n2 <= MAX_SAME_RANK && n2 <= g.length; n2++) {
      out.push(g.slice(0, n2));
    }
  }

  // ---- (b) 连续点数组 (连张) ----
  // A 不参与连张 (A 仅能作为 A23 / QKA 的端点, 交由引擎判定)
  var byRank = {};
  for (i = 0; i < hand.length; i++) {
    var cc = hand[i];
    if (cc.isBigJoker || cc.isSmallJoker) continue;
    if (cc.rank < 2 || cc.rank > 13) continue;      // 2..13 连续段
    if (!byRank[cc.rank]) byRank[cc.rank] = [];
    byRank[cc.rank].push(cc.id);
  }
  var present = Object.keys(byRank).map(Number).sort(function (a, b) { return a - b; });
  for (i = 0; i < present.length; i++) {
    var seq = [];
    for (var j = i; j < present.length; j++) {
      if (j > i && present[j] !== present[j - 1] + 1) break;   // 断点
      seq = seq.concat(byRank[present[j]]);
      if (seq.length >= MIN_SEQ && seq.length <= MAX_SEQ) out.push(seq.slice());
    }
  }

  // ---- 排序: 张数多者优先; 同张数按首张点数高者优先 ----
  var rankById = {};
  for (i = 0; i < hand.length; i++) rankById[hand[i].id] = hand[i].rank;
  out.sort(function (a, b) {
    if (b.length !== a.length) return b.length - a.length;
    return (rankById[b[0]] || 0) - (rankById[a[0]] || 0);
  });

  return out;
}

module.exports = {
  candidateCombos: candidateCombos,
  MIN_SAME_RANK: MIN_SAME_RANK,
  MAX_SAME_RANK: MAX_SAME_RANK,
  MIN_SEQ: MIN_SEQ,
  MAX_SEQ: MAX_SEQ
};