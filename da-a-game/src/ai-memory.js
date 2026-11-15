// src/ai-memory.js —— AI 记牌（2026-11-15 用户 D-078）
//
// 口径（只允许使用**公开信息 + 自己手牌**，不偷看别人手牌）：
//   未见牌 = 全副 108 张 - 自己手牌 - 桌面 - 弃牌堆 - 出牌流水里出现过的牌
//   出牌流水（state.plays）自 D-064 起带 cards，属于公开信息。
//
// 提供:
//   remaining(state, viewerId)  -> { ranks:{2..14:剩余张数}, bigJoker, smallJoker, total }
//   highestSingle(state, viewerId) -> 剩余牌里最大的单张编码（大A>大王>小王>3>2>A>K>…>4）
//   canBeBeatenSingle(state, viewerId, card) -> 是否有未见牌能压过这张单张
//
// 纯逻辑，不依赖 wx.*，AI / 提示 / 测试共用。

var RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=J 12=Q 13=K 14=A

// 单张序（与 hand-types.singleRankEncoding 一致）:
//   大A 20 > 大王 19 > 小王 18 > 3 17 > 2 16 > A 15 > K 13 > … > 4
function singleEncoding(c) {
  if (c.is主方大A) return 20;
  if (c.isBigJoker) return 19;
  if (c.isSmallJoker) return 18;
  if (c.rank === 3) return 17;
  if (c.rank === 2) return 16;
  if (c.rank === 14) return 15;
  return c.rank;
}

function _eachSeen(state, viewerId, fn) {
  (state.table || []).forEach(fn);
  (state.discarded || []).forEach(fn);
  (state.plays || []).forEach(function (r) { (r.cards || []).forEach(fn); });
  (state.players || []).forEach(function (p) {
    if (p.id === viewerId) (p.hand || []).forEach(fn);
    if (p.底牌) fn(p.底牌);   // 底牌是公开翻开的
  });
}

function remaining(state, viewerId) {
  var ranks = {};
  RANKS.forEach(function (r) { ranks[r] = 8; });   // 两副牌, 每个点数 8 张
  var big = 2, small = 2;
  _eachSeen(state, viewerId, function (c) {
    if (!c) return;
    if (c.isBigJoker) { big = Math.max(0, big - 1); return; }
    if (c.isSmallJoker) { small = Math.max(0, small - 1); return; }
    if (ranks[c.rank] != null) ranks[c.rank] = Math.max(0, ranks[c.rank] - 1);
  });
  var total = big + small;
  RANKS.forEach(function (r) { total += ranks[r]; });
  return { ranks: ranks, bigJoker: big, smallJoker: small, total: total };
}

// 剩余牌里最大的单张编码（0 = 已经没牌）
function highestSingle(state, viewerId) {
  var m = remaining(state, viewerId);
  if (m.bigJoker > 0) return 19;
  if (m.smallJoker > 0) return 18;
  if (m.ranks[3] > 0) return 17;
  if (m.ranks[2] > 0) return 16;
  if (m.ranks[14] > 0) return 15;
  for (var r = 13; r >= 4; r--) { if (m.ranks[r] > 0) return r; }
  return 0;
}

// 这张单张是否"绝对最大"（没有未见牌能压它）
function canBeBeatenSingle(state, viewerId, card) {
  return singleEncoding(card) < highestSingle(state, viewerId);
}

module.exports = {
  remaining: remaining,
  highestSingle: highestSingle,
  canBeBeatenSingle: canBeBeatenSingle,
  singleEncoding: singleEncoding
};
