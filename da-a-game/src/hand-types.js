// src/hand-types.js — §6 牌型识别 第一批
// 严格按 SKILL.md §6.1 / §6.2 / §6.3 / §6.4 实现
// 第一批范围：单张 / 对子 / 蛋子 / 龙 / 双龙 / 双王

const HAND_TYPES = Object.freeze({
  SINGLE: 'SINGLE',
  PAIR: 'PAIR',
  TRIPLE: 'TRIPLE',
  STRAIGHT: 'STRAIGHT',
  DOUBLE_STRAIGHT: 'DOUBLE_STRAIGHT',
  DOUBLE_JOKER: 'DOUBLE_JOKER',
  // 批次 2 新增
  BIG_TRIPLE: 'BIG_TRIPLE',             // 大蛋子（4–6 张同点数）
  TRUE_SEVEN: 'TRUE_SEVEN',             // 真七（7 张同点数）
  TRUE_EIGHT: 'TRUE_EIGHT',             // 真八（8 张同点数）
  STRAIGHT_TRIPLE: 'STRAIGHT_TRIPLE',   // 连珠蛋（3 组连续蛋子）
  FAKE_EIGHT: 'FAKE_EIGHT',             // 假八（2 组连续四张）
  TRIPLE_FAKE_EIGHT: 'TRIPLE_FAKE_EIGHT', // 三连假八（3 组连续四张）
  // 批次 3 占位
  TRIPLE_JOKER: 'TRIPLE_JOKER',
  STRAIGHT_TRIPLE_LARGE: 'STRAIGHT_TRIPLE_LARGE',
  FOUR_JOKER: 'FOUR_JOKER',
  DOUBLE_BIG_A: 'DOUBLE_BIG_A',
  INVALID: 'INVALID'
});

// 全局牌力等级（按 SKILL §6.3 顺序，数字越大越强）
// 双龙单独走"只能压双龙"逻辑（POWER=0 仅表示它最弱）
const POWER = Object.freeze({
  'DOUBLE_STRAIGHT': 0,         // 双龙: 只能被大蛋子+ 压制 (§6.4 单独处理)
  // [修复 P1] §6.3: 龙/对子/单张 同一层级互不压; 但蛋子严格高于这一层
  'SINGLE': 1, 'PAIR': 1, 'STRAIGHT': 1,   // 同层: 互不压
  'TRIPLE': 2,                  // 蛋子: 严格高于 龙/对子/单张
  'BIG_TRIPLE': 3,              // 大蛋子
  'DOUBLE_JOKER': 4,            // 双王
  'STRAIGHT_TRIPLE': 5,         // 连珠蛋
  'FAKE_EIGHT': 6,              // 假八
  'TRUE_SEVEN': 7,              // 真七
  'TRUE_EIGHT': 8,              // 真八
  'TRIPLE_JOKER': 9,            // 三王
  'STRAIGHT_TRIPLE_LARGE': 10,  // 四连珠蛋
  'TRIPLE_FAKE_EIGHT': 11,      // 三连假八
  'FOUR_JOKER': 12,             // 四王
  'DOUBLE_BIG_A': 13            // 双大A: 最高
});

// ===== 内部辅助 =====

// 单张牌力编码（SKILL §6.2）
function singleRankEncoding(card) {
  if (card.is主方大A) return 20;
  if (card.isBigJoker) return 19;
  if (card.isSmallJoker) return 18;
  if (card.rank === 3) return 17;
  if (card.rank === 2) return 16;
  if (card.rank === 14) return 15;  // A 普通
  if (card.rank >= 4 && card.rank <= 14) return card.rank + 1;
}

// [FIX] 多张牌型 (PAIR/TRIPLE/...) 的排序编码: 只看点数, 不含大A加成
// SKILL §6.2 顺序 3>2>A>K>...>4; §6.4 单大A 只管单牌, 不提升对子/蛋子
function pairRankEncoding(card) {
  if (!card) return 0;
  if (card.isBigJoker) return 19;
  if (card.isSmallJoker) return 18;
  if (card.rank === 3) return 17;
  if (card.rank === 2) return 16;
  if (card.rank === 14) return 15;  // A 普通
  if (card.rank >= 4 && card.rank <= 14) return card.rank + 1;
  return 0;
}

// 双王牌力：按大王数（0/1/2）
function doubleJokerRankEncoding(cards) {
  let count = 0;
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].isBigJoker) count += 1;
  }
  return count;
}

// STRAIGHT 识别：按点数升序判断连续性
// 返回 { length, low } 或 null
//
// [P0 修复] 牌是**集合**，连续性由点数决定，与传入数组的顺序无关。
//   原实现直接读 cards[0] / cards[cards.length-1] 并逐位比较，隐含假设
//   数组已按点数升序。而 play.js 的 handlePlay 用
//     player.hand.filter(c => cardIds.indexOf(c.id) >= 0)
//   取牌，会**按手牌存储顺序**重排，丢弃调用方给的顺序。
//   于是只要玩家手牌不是点数升序，连张就永远识别失败 (INVALID_HAND)。
//   修复：识别前先按 rank 升序排序，使识别与顺序无关。
function isValidStraight(cards) {
  if (cards.length < 3) return null;
  // [P0 修复] 与传入顺序解耦: 牌是集合, 连续性由点数决定。
  //   原实现直接读 cards[0]/cards[len-1] 并逐位比较, 隐含"已按点数升序";
  //   而 play.js handlePlay 用 player.hand.filter(...) 取牌会按手牌存储顺序重排,
  //   手牌非升序时连张永远识别失败 (INVALID_HAND)。
  //   注意: 不能只排序沿用旧逻辑 —— 排序会把 A-2-3 变成 [2,3,14],
  //   使 A 落到末尾而被误当高端 A。故改用"点数集合"显式判定 A 的两种合法形态 (§6.1)。
  cards = cards.slice().sort(function (a, b) { return a.rank - b.rank; });

  const ranks = cards.map(function (c) { return c.rank; });
  const aceCount = ranks.filter(function (r) { return r === 14; }).length;
  if (aceCount >= 2) return null;               // 2 张 A 不能成龙 (§6.1)

  const rest = ranks.filter(function (r) { return r !== 14; });
  for (var i = 1; i < rest.length; i++) {
    if (rest[i] !== rest[i - 1] + 1) return null;   // rest 必为连续段
  }

  if (aceCount === 1) {
    if (rest[0] === 2) {
      return { length: cards.length, low: 1 };    // A 作低端: A-2-3(-4-5-...) (§6.1)
    }
    if (rest[rest.length - 1] !== 13) return null; // A 作高端必以 K 结尾: m..13-A (§6.1 QKA)
    return { length: cards.length, low: rest[0] };
  }

  return { length: cards.length, low: rest[0] };  // 无 A: 2..13 连续段
}

// DOUBLE_STRAIGHT 识别：每点 2 张，判断 A 在头/尾
// 返回 { length, low } 或 null
function isValidDoubleStraight(cards) {
  if (cards.length < 6 || cards.length % 2 !== 0) return null;
  // [P0 修复] 与传入顺序解耦 (同 isValidStraight): handlePlay 会按手牌存储顺序重排。
  //   且排序会把 A-A-2-2-3-3 变成 [2,2,3,3,14,14], 故 A 的低端形态必须用
  //   "点数集合"显式判定, 而不能靠 A 的数组位置。
  cards = cards.slice().sort(function (a, b) { return a.rank - b.rank; });

  // 每对必须同 rank
  for (var i = 0; i < cards.length; i += 2) {
    if (cards[i].rank !== cards[i + 1].rank) return null;
  }

  const pairRanks = [];
  for (var k = 0; k < cards.length; k += 2) pairRanks.push(cards[k].rank);

  const acePairs = pairRanks.filter(function (r) { return r === 14; }).length;
  if (acePairs >= 2) return null;               // 两对 A 不构成双龙 (§6.1)
  var rest = pairRanks.filter(function (r) { return r !== 14; });
  for (var m = 1; m < rest.length; m++) {
    if (rest[m] !== rest[m - 1] + 1) return null;   // 对子必须连续
  }

  if (acePairs === 1) {
    if (rest[0] === 2) {
      return { length: cards.length, low: 1 };    // AA-22-33 (§6.1 A 作低端)
    }
    if (rest[rest.length - 1] !== 13) return null; // m..13-AA (§6.1 A 作高端)
    return { length: cards.length, low: rest[0] };
  }

  return { length: cards.length, low: rest[0] };
}

// 批次 2 辅助：校验一组 unique ranks 是否构成合法连续序列（含 A-作-高端/低端处理）
// 返回 { low } 或 null
function isValidStraightSequenceRanks(uniqueRanks) {
  if (uniqueRanks.length < 2) return null;
  const sorted = uniqueRanks.slice().sort(function (a, b) { return a - b; });
  const hasA = sorted.indexOf(14) !== -1;

  if (hasA) {
    if (sorted[0] === 2) {
      // A-作-低端：sorted[0]=2 表示序列从 2 开始，A=14 作为“循环头”出现在末尾
      for (let i = 0; i < sorted.length - 2; i++) {
        if (sorted[i + 1] !== sorted[i] + 1) return null;
      }
      return { low: 1 };
    }
    // A-作-高端：A=14 出现在末尾，序列是 m, m+1, ..., 13, 14
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1] !== sorted[i] + 1) return null;
    }
    return { low: sorted[0] };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1] !== sorted[i] + 1) return null;
  }
  return { low: sorted[0] };
}

// ===== 1. identifyHand: 牌型识别 =====

function identifyHand(cards) {
  if (!cards || cards.length === 0) {
    return { type: HAND_TYPES.INVALID, reason: 'empty' };
  }

  // 1 张 → SINGLE（joker 或非 joker 都行）
  if (cards.length === 1) {
    const c = cards[0];
    return {
      type: HAND_TYPES.SINGLE,
      card: c,
      rank: singleRankEncoding(c),
      cards: cards
    };
  }

  // 2 张：先按“双大A”分支，再按“全 jokers”分支，再按 PAIR
  if (cards.length === 2) {
    // 双大A：两张同花色大A（SKILL §6 表中“独立无敌牌型”）
    if (cards[0].rank === 14 && cards[1].rank === 14 &&
        cards[0].suit === cards[1].suit &&
        cards[0].is主方大A && cards[1].is主方大A) {
      return {
        type: HAND_TYPES.DOUBLE_BIG_A,
        suit: cards[0].suit,
        cards: cards
      };
    }
    const bothJokers = cards[0].isBigJoker || cards[0].isSmallJoker;
    const secondJoker = cards[1].isBigJoker || cards[1].isSmallJoker;
    if (bothJokers && secondJoker) {
      return {
        type: HAND_TYPES.DOUBLE_JOKER,
        rank: doubleJokerRankEncoding(cards),
        cards: cards
      };
    }
    if (!bothJokers && !secondJoker && cards[0].rank === cards[1].rank) {
      return {
        type: HAND_TYPES.PAIR,
        rank: cards[0].rank,
        cards: cards
      };
    }
    return { type: HAND_TYPES.INVALID, reason: '2 cards invalid' };
  }

  // 3+ 张：先处理全 jokers（批次 3：三王 / 四王）
  const allJokers = cards.every(function (c) {
    return c.isBigJoker || c.isSmallJoker;
  });
  if (allJokers) {
    if (cards.length === 3) {
      return {
        type: HAND_TYPES.TRIPLE_JOKER,
        rank: doubleJokerRankEncoding(cards),
        cards: cards
      };
    }
    if (cards.length === 4) {
      return {
        type: HAND_TYPES.FOUR_JOKER,
        rank: doubleJokerRankEncoding(cards),
        cards: cards
      };
    }
    return { type: HAND_TYPES.INVALID, reason: 'joker count ' + cards.length + ' not in batch 3' };
  }

  // 3+ 张：排除含 joker 混合（蛋子不能含 joker，本批范围外）
  const hasJoker = cards.some(function (c) {
    return c.isBigJoker || c.isSmallJoker;
  });
  if (hasJoker) {
    return { type: HAND_TYPES.INVALID, reason: 'mixed jokers not supported in batch 1' };
  }

  // 3 张 → TRIPLE 或 STRAIGHT
  if (cards.length === 3) {
    if (cards[0].rank === cards[1].rank && cards[1].rank === cards[2].rank) {
      return {
        type: HAND_TYPES.TRIPLE,
        rank: cards[0].rank,
        cards: cards
      };
    }
    const s = isValidStraight(cards);
    if (s) {
      return {
        type: HAND_TYPES.STRAIGHT,
        length: s.length,
        low: s.low,
        cards: cards
      };
    }
    return { type: HAND_TYPES.INVALID, reason: '3 cards not same rank and not straight' };
  }

  // 4+ 张：先按点数分组
  const ranks = cards.map(function (c) { return c.rank; });
  const counts = {};
  for (let i = 0; i < ranks.length; i++) {
    const r = ranks[i];
    counts[r] = (counts[r] || 0) + 1;
  }
  const uniqueRanks = Object.keys(counts).map(Number).sort(function (a, b) { return a - b; });

  // 全同点数 → 大蛋子（4-6 张）/ 真七（7）/ 真八（8）
  if (uniqueRanks.length === 1) {
    const cnt = ranks.length;
    if (cnt >= 4 && cnt <= 6) {
      return { type: HAND_TYPES.BIG_TRIPLE, rank: ranks[0], count: cnt, cards: cards };
    }
    if (cnt === 7) {
      return { type: HAND_TYPES.TRUE_SEVEN, rank: ranks[0], cards: cards };
    }
    if (cnt === 8) {
      return { type: HAND_TYPES.TRUE_EIGHT, rank: ranks[0], cards: cards };
    }
    return { type: HAND_TYPES.INVALID, reason: 'same-rank count out of scope: ' + cnt };
  }

  const countsPerRank = Object.keys(counts).map(function (k) { return counts[k]; });

  // 全 1 张/点数 → STRAIGHT
  if (countsPerRank.every(function (c) { return c === 1; })) {
    const s = isValidStraight(cards);
    if (s) {
      return {
        type: HAND_TYPES.STRAIGHT,
        length: s.length,
        low: s.low,
        cards: cards
      };
    }
    return { type: HAND_TYPES.INVALID, reason: 'cards not consecutive' };
  }

  // 全 2 张/点数 → DOUBLE_STRAIGHT
  if (countsPerRank.every(function (c) { return c === 2; })) {
    if (uniqueRanks.length < 3) {
      return { type: HAND_TYPES.INVALID, reason: 'double straight needs 3+ pairs' };
    }
    const s = isValidDoubleStraight(cards);
    if (s) {
      return {
        type: HAND_TYPES.DOUBLE_STRAIGHT,
        length: s.length,
        low: s.low,
        cards: cards
      };
    }
    return { type: HAND_TYPES.INVALID, reason: 'pairs not consecutive' };
  }

  // 全 3 张/点数 → 连珠蛋 (3 组) 或 四连珠蛋 (4 组)
  if (countsPerRank.every(function (c) { return c === 3; })) {
    if (uniqueRanks.length === 3) {
      // 连珠蛋
      const r = isValidStraightSequenceRanks(uniqueRanks);
      if (r) {
        return { type: HAND_TYPES.STRAIGHT_TRIPLE, low: r.low, cards: cards };
      }
    }
    if (uniqueRanks.length === 4) {
      // 四连珠蛋
      const r = isValidStraightSequenceRanks(uniqueRanks);
      if (r) {
        return { type: HAND_TYPES.STRAIGHT_TRIPLE_LARGE, low: r.low, cards: cards };
      }
    }
    return { type: HAND_TYPES.INVALID, reason: 'invalid straight triple (need 3 or 4 groups consecutive)' };
  }

  // 全 4 张/点数 → 假八 (2 组) 或 三连假八 (3 组)
  if (countsPerRank.every(function (c) { return c === 4; })) {
    if (uniqueRanks.length === 2) {
      const r = isValidStraightSequenceRanks(uniqueRanks);
      if (r) {
        return { type: HAND_TYPES.FAKE_EIGHT, low: r.low, cards: cards };
      }
    }
    if (uniqueRanks.length === 3) {
      const r = isValidStraightSequenceRanks(uniqueRanks);
      if (r) {
        return { type: HAND_TYPES.TRIPLE_FAKE_EIGHT, low: r.low, cards: cards };
      }
    }
    return { type: HAND_TYPES.INVALID, reason: 'invalid fake eight (need 2 or 3 groups consecutive)' };
  }

  return { type: HAND_TYPES.INVALID, reason: 'mixed card counts' };
}

// ===== 2. compareHands: 同类比较 =====
function compareHands(a, b) {
  if (!a || !b || a.type !== b.type) return 0;

  switch (a.type) {
    case HAND_TYPES.SINGLE:
      // SKILL §6.2 顺序 3>2>A>K>Q>J>10>9>...>4, 必须用 singleRankEncoding
      return singleRankEncoding(a.card) - singleRankEncoding(b.card);
    case HAND_TYPES.PAIR:
    case HAND_TYPES.TRIPLE:
      // [修复] SKILL §6.2 顺序适用于对子/蛋子, 但不含大A加成 (§6.4 单大A 只管单牌)
      return pairRankEncoding(a.cards[0]) - pairRankEncoding(b.cards[0]);
    case HAND_TYPES.STRAIGHT:
    case HAND_TYPES.DOUBLE_STRAIGHT:
      if (a.length !== b.length) return 0;
      return a.low - b.low;
    case HAND_TYPES.DOUBLE_JOKER:
      return a.rank - b.rank;
    case HAND_TYPES.BIG_TRIPLE:
      // SKILL §6: 张数多者大；张数相同再比点数
      if (a.count !== b.count) return a.count - b.count;
      // [修复] 同理: 大蛋子不含大A加成
      return pairRankEncoding(a.cards[0]) - pairRankEncoding(b.cards[0]);
    case HAND_TYPES.TRUE_SEVEN:
    case HAND_TYPES.TRUE_EIGHT:
      // [修复] 同理
      return pairRankEncoding(a.cards[0]) - pairRankEncoding(b.cards[0]);
    case HAND_TYPES.STRAIGHT_TRIPLE:
    case HAND_TYPES.FAKE_EIGHT:
    case HAND_TYPES.TRIPLE_FAKE_EIGHT:
    case HAND_TYPES.STRAIGHT_TRIPLE_LARGE:
      return a.low - b.low;
    case HAND_TYPES.TRIPLE_JOKER:
    case HAND_TYPES.FOUR_JOKER:
      return a.rank - b.rank;
    case HAND_TYPES.DOUBLE_BIG_A:
      // SKILL §6 表未明确双大A内部比较；默认同类型相等
      return 0;
    default:
      return 0;
  }
}

// ===== 3. canBeat: 跨类型 + 特殊规则 =====
function canBeat(play, current) {
  if (!play || !current) return false;
  if (play.type === HAND_TYPES.INVALID || current.type === HAND_TYPES.INVALID) return false;

  const playType = play.type;
  const currentType = current.type;

  // 同类型比较
  if (playType === currentType) {
    if (playType === HAND_TYPES.STRAIGHT || playType === HAND_TYPES.DOUBLE_STRAIGHT) {
      if (play.length !== current.length) return false;
    }
    return compareHands(play, current) > 0;
  }

  // 特殊: 单大A (SKILL §6.4) 只能管单牌
  if (playType === HAND_TYPES.SINGLE && play.card && play.card.is主方大A) {
    return currentType === HAND_TYPES.SINGLE;
  }

  // 特殊: current 是单大A (SKILL §6.4 严格)
  //   2张大A (DOUBLE_BIG_A) 不能管单大A
  //   只有 4张或6张同点数的大A (BIG_TRIPLE, 全部 is主方大A) 能管
  //   + 双王/三王/四王 (各牌型显式列表包含单大A)
  //   其它牌型 (PAIR/TRIPLE/STRAIGHT/BIG_TRIPLE 非全大A/连珠蛋/假八/真七/真八/...) 不能压
  if (currentType === HAND_TYPES.SINGLE && current.card && current.card.is主方大A) {
    if (playType === HAND_TYPES.DOUBLE_BIG_A) return false;
    // [修复 P1] §6.4: 只有 **5张或 6张同点数的大蛋子**能管单大A; 4张不能。
    //   且规则不要求这些蛋子是大A牌 —— 33333 也应该能管单大A。
    if (playType === HAND_TYPES.BIG_TRIPLE && play.cards) {
      return play.cards.length === 5 || play.cards.length === 6;
    }
    // 全局牌力 ≥ 「5张同点数大蛋子」 的更高牌型也能管单大A
    // (双王 / 连珠蛋 / 假八 / 真七 / 真八 / 三王 / 四王 / 四连珠蛋 / 三连假八)
    var pwrSB = POWER[playType];
    if (pwrSB !== undefined && pwrSB >= POWER[HAND_TYPES.BIG_TRIPLE]) return true;
    return false;
  }

  // 特殊: 单王 (单张大王/小王) 只能管单牌
  if (playType === HAND_TYPES.SINGLE && play.card &&
      (play.card.isBigJoker || play.card.isSmallJoker)) {
    return currentType === HAND_TYPES.SINGLE;
  }

  // 特殊: current 是单王 - 普通单牌不能管, 必须大蛋子或更高
  if (currentType === HAND_TYPES.SINGLE && current.card &&
      (current.card.isBigJoker || current.card.isSmallJoker)) {
    return POWER[playType] !== undefined && POWER[playType] >= POWER[HAND_TYPES.BIG_TRIPLE];
  }

  // 特殊：双王（SKILL §6.4）固定可管列表（含单大A/单王所在的 SINGLE、以及大蛋子/龙/双龙等）
  if (playType === HAND_TYPES.DOUBLE_JOKER) {
    return [HAND_TYPES.SINGLE, HAND_TYPES.PAIR, HAND_TYPES.TRIPLE,
            HAND_TYPES.BIG_TRIPLE, HAND_TYPES.STRAIGHT, HAND_TYPES.DOUBLE_STRAIGHT]
      .indexOf(currentType) !== -1;
  }

  // 特殊：三王（SKILL §6.4 "可管单牌、对子、蛋子、大蛋子、龙、双龙、单大A"）
  if (playType === HAND_TYPES.TRIPLE_JOKER) {
    return [HAND_TYPES.SINGLE, HAND_TYPES.PAIR, HAND_TYPES.TRIPLE,
            HAND_TYPES.BIG_TRIPLE, HAND_TYPES.STRAIGHT, HAND_TYPES.DOUBLE_STRAIGHT]
      .indexOf(currentType) !== -1;
  }

  // 特殊：四王（SKILL §6.4 "可管...连珠蛋、假八、真七、三王"；不能管 真八/三连假八/双大A）
  if (playType === HAND_TYPES.FOUR_JOKER) {
    return [HAND_TYPES.SINGLE, HAND_TYPES.PAIR, HAND_TYPES.TRIPLE,
            HAND_TYPES.BIG_TRIPLE, HAND_TYPES.STRAIGHT, HAND_TYPES.DOUBLE_STRAIGHT,
            HAND_TYPES.STRAIGHT_TRIPLE, HAND_TYPES.FAKE_EIGHT, HAND_TYPES.TRUE_SEVEN,
            HAND_TYPES.TRIPLE_JOKER]
      .indexOf(currentType) !== -1;
  }

  // 特殊：current 是双龙 (SKILL §6.4 "蛋子不能压双龙；大蛋子及以上可压双龙")
  if (currentType === HAND_TYPES.DOUBLE_STRAIGHT) {
    // 大蛋子及以上 (POWER >= POWER[BIG_TRIPLE]) 才能压双龙
    return POWER[playType] !== undefined && POWER[playType] >= POWER[HAND_TYPES.BIG_TRIPLE];
  }

  // 其它不同类型：按 §6.3 全局牌力等级比较
  var playPwr = POWER[playType];
  var curPwr = POWER[currentType];
  if (playPwr === undefined || curPwr === undefined) return false;
  return playPwr > curPwr;
}

module.exports = {
  HAND_TYPES: HAND_TYPES,
  identifyHand: identifyHand,
  compareHands: compareHands,
  canBeat: canBeat
};
