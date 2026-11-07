// src/lead-choice.js — 起手选牌(AI 起手 + 【提示】共用同一来源)
//
// [2026-11-06 用户裁定]
//   「看最小的牌能组龙就出龙，能出对子就出对子，组不了就出单。」
//   「锚点能组龙包括双龙。」
//   「蛋子及以上排最后。」
//   「起手时 ≥2 张 4 全部排除出池(留给取牌)。」
//   「单4优先出」(手上只有 1 张 4 时它最没用 -> 最先出)
//
// 算法(逐张牌由小到大当锚点, 链 -> 对子 -> 单张):
//   锚点 s 的同点组 >= 3 张(蛋子及以上)时:
//     先看**含 s 的龙**(双龙优先) -> 有就出龙;
//     没有就**跳过 s**(蛋子留着整组, 不单出、不拆)。
//   同点组 < 3 张时:
//     含 s 的龙 -> 出龙;  该点数正好 2 张 -> 出对子(整组);  只有 1 张 -> 出单张。
//   「拆散同点组」(拿了组里的一部分)超过 1 组 -> 该龙淘汰。
//
// 用户例子:
//   王322kkk -> 22       (K 是 3 张组且组不成龙 -> 跳过; 下一张 2 -> 对子)
//   55567    -> 567      (5 组不成对子, 但能组龙 567)
//   45567    -> 4567
//   5666778  -> 5        (5678 要拆 66+77 两组 -> 淘汰)
//   556667788-> 55667788 (双龙, 只拆 666 一组)
//   5555/666/77 -> 77    (双龙/连张都要拆两组 -> 淘汰; 对7 不拆任何组)
//
// 本文件**纯逻辑**(不依赖 wx.*); 牌型判定全部来自 hand-types.js。

const { identifyHand, HAND_TYPES } = require('./hand-types.js');
const { candidateCombos } = require('./combos.js');

// 单张大小升序(§6.2: 4 < 5 < … < K < A < 2 < 3 < 王)——「最小的牌」用它
//   大王 180 > 小王 170 > 3 (160) > 2 (150) > A (140) > K (13) > … > 4 (4)
function sizeAsc(c) {
  if (c.isBigJoker) return 180;
  if (c.isSmallJoker) return 170;
  if (c.rank === 3) return 160;
  if (c.rank === 2) return 150;
  if (c.rank === 14) return 140;
  return (typeof c.rank === 'number') ? c.rank : 0;
}

function isFour(c) { return c.rank === 4 && !c.isBigJoker && !c.isSmallJoker; }

// 起手候选(按优先级排好): 双龙 > 连张 > 对子 > 单张
// 返回 [{ cards, type }]; 空手牌返回 []
function leadCandidates(hand) {
  if (!hand || !hand.length) return [];
  const fours = hand.filter(isFour);
  // ≥2 张 4 -> 全部排除出池(留给取牌); 只有 1 张 4 -> 保留(它最没用, 最先出)
  const pool = fours.length >= 2 ? hand.filter(function (c) { return !isFour(c); }) : hand.slice();
  if (!pool.length) {
    // [2026-11-07 23:22 用户] 「AI 最后剩对4, 有任意出牌权, 却单出了一个 4, 应该一起打出」
    //   -> 手上只剩 4(>=2 张)时整组出(对子/大蛋子), 别单出一张。
    const _all = hand.slice();
    const _ah = identifyHand(_all);
    return [{ cards: _all, type: _ah ? _ah.type : HAND_TYPES.PAIR }];
  }
  const groups = {};
  pool.forEach(function (c) { (groups[c.rank] = groups[c.rank] || []).push(c); });
  const groupOf = function (c) { return groups[c.rank] || [c]; };
  // [2026-11-06 用户] 「起手时双大A不主动整手打出」-> 两张同花色主A整组跳过
  //   (双大A整手留给**正常压制**场景, 见 src/ai.js)
  function _isDoubleBigA(cards) {
    return cards.length === 2 && cards.every(function (c) { return !!c.is主方大A; })
      && cards[0].suit === cards[1].suit;
  }
  // 「拆散同点组」: 拿了组里的一部分、没拿全
  function splitCount(cards) {
    const used = {};
    cards.forEach(function (c) { used[c.rank] = (used[c.rank] || 0) + 1; });
    let n = 0;
    for (const rk in groups) {
      if (used[rk] && used[rk] < groups[rk].length) n++;
    }
    return n;
  }
  // 所有合法龙(含双龙), 预先算好
  let combos = [];
  try { combos = candidateCombos(pool) || []; } catch (e) { combos = []; }
  const chains = [];
  combos.forEach(function (ids) {
    if (!ids || ids.length < 2) return;
    const cs = ids.map(function (id) { return pool.find(function (c) { return c.id === id; }); }).filter(Boolean);
    if (cs.length !== ids.length) return;
    const h = identifyHand(cs);
    if (!h || (h.type !== HAND_TYPES.STRAIGHT && h.type !== HAND_TYPES.DOUBLE_STRAIGHT)) return;
    if (splitCount(cs) > 1) return;                       // 拆散超过 1 组 -> 淘汰
    // [2026-11-06 23:54 用户] 「单张大A不加在龙里出, 单张普通A可以加在龙里出」
    //   -> 链里**任何**大A 都不能带(不管手里有几张); 双大A/双王也不能拆开带
    var _bigAIds = pool.filter(function (c) { return !!c.is主方大A; }).map(function (c) { return c.id; });
    var _jokerIds = pool.filter(function (c) { return c.isBigJoker || c.isSmallJoker; }).map(function (c) { return c.id; });
    var _inBig = cs.filter(function (c) { return _bigAIds.indexOf(c.id) >= 0; }).length;
    if (_inBig > 0) return;
    var _inJk = cs.filter(function (c) { return _jokerIds.indexOf(c.id) >= 0; }).length;
    if (_jokerIds.length >= 2 && _inJk > 0 && _inJk < _jokerIds.length) return;
    chains.push({ cards: cs, type: h.type, splits: splitCount(cs),
      minRank: Math.min.apply(null, cs.map(function (c) { return c.rank; })) });
  });
  // 逐张牌(由小到大)当锚点
  const sorted = pool.slice().sort(function (a, b) { return sizeAsc(a) - sizeAsc(b); });
  // 兜底: 手上**只剩蛋子及以上**(每组 >= 3 张, 组不成龙) -> 出整组(蛋子排最后, 但只剩它时必须出)
  var _fallback = null;
  for (const anchor of sorted) {
    const grp = groupOf(anchor);
    // [2026-11-06 用户] 龙要**带上能接上的牌**: 手牌 3456 -> 出 3456(不能只出 456 把 3 漏下);
    //   单张的 A/2/3 也要进龙。规则: **含锚点** + **取最长**(最长链自然把相邻的都带上)。
    //   [2026-11-04 用户] 链里可以带高端 A(例 9 10 10 JQKA -> 出 6 张) —— 最长链满足这条。
    let best = null;
    chains.forEach(function (ch) {
      if (ch.cards.indexOf(anchor) < 0) return;                 // 必须含锚点
      if (!best) { best = ch; return; }
      // [2026-11-07 23:22 用户] 「22 在 34 无法组成龙的时候才会拆 22」/「3456 能组成龙, 就不用非得拆 22」
      //   -> 优先**不拆同点组**的龙; 都不拆时才比长短(拆 1 组的龙只当备选)。
      if (ch.splits !== best.splits) { if (ch.splits < best.splits) best = ch; return; }
      if (ch.cards.length > best.cards.length
          || (ch.cards.length === best.cards.length
              && ch.type === HAND_TYPES.DOUBLE_STRAIGHT && best.type !== HAND_TYPES.DOUBLE_STRAIGHT)) {
        best = ch;
      }
    });
    if (best) return [{ cards: best.cards, type: best.type }];
    // 该点数是 3 张以上(蛋子及以上) -> 留着整组, 跳过(留到最后兜底)
    if (grp.length >= 3) {
      if (!_fallback && !_isDoubleBigA(grp)) _fallback = grp;
      continue;
    }
    // [2026-11-06 用户] 双大A(两张同花色主A)起手**不整手打出**
    if (_isDoubleBigA(grp)) continue;
    if (grp.length === 2) {
      var _gh = identifyHand(grp);
      return [{ cards: grp, type: _gh ? _gh.type : HAND_TYPES.PAIR }];
    }
    var _sh = identifyHand([anchor]);
    return [{ cards: [anchor], type: _sh ? _sh.type : HAND_TYPES.SINGLE }];
  }
  // 只剩蛋子及以上 -> 出整组(§: 蛋子及以上是可出的)
  if (_fallback) {
    var _fh = identifyHand(_fallback);
    return [{ cards: _fallback, type: _fh ? _fh.type : HAND_TYPES.TRIPLE }];
  }
  return [];
}

// AI 起手: 取第一个候选
function pickLead(hand) {
  const cands = leadCandidates(hand);
  return cands.length ? cands[0] : null;
}

module.exports = { leadCandidates, pickLead, sizeAsc, isFour };
