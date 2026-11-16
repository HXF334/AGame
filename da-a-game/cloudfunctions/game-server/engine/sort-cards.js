// src/sort-cards.js — 桌面出牌显示顺序(§6.1 链序)
//
// [2026-11-06 用户] 「打出的手牌排序时按龙的顺序排序而不是按单张大小」
//   例: 桌面出 10-J-Q-K-A -> 显示成 10 J Q K A(链序),
//       按单张大小排会变成 K Q J 10 A(单张序里 A 最大, 3 比 4 大)。
//
// 本文件**纯逻辑**(不依赖 wx.*), 只做"这手牌是不是龙 + 龙里的先后顺序"。
// 合法性/牌型判定全部来自 hand-types.js(引擎), 这里不自行判定。

const { identifyHand, HAND_TYPES } = require('./hand-types.js');

// 「龙」类牌型: 内部有连续点数顺序 -> 显示要按链序
const CHAIN_TYPES = [
  HAND_TYPES.STRAIGHT,          // 连张
  HAND_TYPES.DOUBLE_STRAIGHT,    // 双龙
  HAND_TYPES.STRAIGHT_TRIPLE,    // 连珠蛋
  HAND_TYPES.BIG_STRAIGHT_TRIPLE,// 大连珠蛋
  HAND_TYPES.FAKE_EIGHT,         // 假八
  HAND_TYPES.BIG_FAKE_EIGHT      // 大假八
];

// A 作链低端时(§6.1 A-2-3 / AA-22-33), A 排在链的最前;
// 否则 A 在链的末端(...-K-A)。identifyHand 的 low===1 表示低端 A。
function chainKey(rank, aceLow) {
  if (rank === 14) return aceLow ? -1 : 1000;   // A
  return rank;                                  // 2..13
}

// 按链序排一手牌; 不是龙型返回 null(调用方走原来的单张大小排序)
function sortByChain(cards) {
  if (!cards || cards.length < 2) return null;
  let h = null;
  try { h = identifyHand(cards); } catch (e) { return null; }
  if (!h || CHAIN_TYPES.indexOf(h.type) < 0) return null;
  const aceLow = (h.low === 1);
  return cards.slice().sort(function (a, b) {
    return chainKey(a.rank, aceLow) - chainKey(b.rank, aceLow);
  });
}

module.exports = { sortByChain, CHAIN_TYPES };
