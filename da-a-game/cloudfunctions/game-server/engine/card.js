// src/card.js — 牌与牌组定义
// 纯 JS、CommonJS；无 wx.* 依赖；Node 和微信小游戏均可 require。
//
// 数据模型参考 SKILL.md §2.1：
//   "每张牌至少记录：
//    - 唯一实体 ID / deck ID；
//    - 花色（♥、♦、♣、♠；王牌无花色）；
//    - 点数；
//    - 是否大王/小王；
//    - 是否当前局的主方标识大A；
//    - 目前归属玩家、桌面或弃置区等位置。"

// 花色用单字母存储（避免在 JSON/网络/日志里出现 Unicode 多字节处理麻烦）
// H=♥(hearts)  D=♦(diamonds)  C=♣(clubs)  S=♠(spades)；null 表示王牌
const SUITS = ['H', 'D', 'C', 'S'];

// 普通牌点数 2..14，其中 11=J, 12=Q, 13=K, 14=A
const NORMAL_RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

// 王的点数用字符串 'BJ' / 'SJ' 区分
const RANK_BIG_JOKER = 'BJ';
const RANK_SMALL_JOKER = 'SJ';

function rankToCode(rank) {
  // 11..14 → J/Q/K/A，便于生成可读 ID
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

function createNormalCard(suit, rank, deckIndex) {
  if (!SUITS.includes(suit)) {
    throw new Error('invalid suit: ' + suit);
  }
  if (!NORMAL_RANKS.includes(rank)) {
    throw new Error('invalid normal rank: ' + rank);
  }
  return {
    id: suit + '-' + rankToCode(rank) + '-' + deckIndex,
    suit: suit,
    rank: rank,
    isBigJoker: false,
    isSmallJoker: false,
    is主方大A: false,         // 在主A花色确定后由后续阶段设置
    location: { type: 'deck' } // 初始在牌堆；发牌后改为 hand / 底牌 / table / discard
  };
}

function createBigJoker(deckIndex) {
  return {
    id: 'BJ-' + deckIndex,
    suit: null,
    rank: RANK_BIG_JOKER,
    isBigJoker: true,
    isSmallJoker: false,
    is主方大A: false,
    location: { type: 'deck' }
  };
}

function createSmallJoker(deckIndex) {
  return {
    id: 'SJ-' + deckIndex,
    suit: null,
    rank: RANK_SMALL_JOKER,
    isBigJoker: false,
    isSmallJoker: true,
    is主方大A: false,
    location: { type: 'deck' }
  };
}

// 生成一副 108 张牌（两副标准扑克）
// 数量校验：2 × (4 suits × 13 ranks + 2 jokers) = 2 × 54 = 108
function createDeck() {
  const cards = [];
  for (let d = 0; d < 2; d++) {
    for (let i = 0; i < SUITS.length; i++) {
      const s = SUITS[i];
      for (let j = 0; j < NORMAL_RANKS.length; j++) {
        const r = NORMAL_RANKS[j];
        cards.push(createNormalCard(s, r, d));
      }
    }
    cards.push(createBigJoker(d));
    cards.push(createSmallJoker(d));
  }
  return cards;
}

module.exports = {
  SUITS: SUITS,
  NORMAL_RANKS: NORMAL_RANKS,
  RANK_BIG_JOKER: RANK_BIG_JOKER,
  RANK_SMALL_JOKER: RANK_SMALL_JOKER,
  createNormalCard: createNormalCard,
  createBigJoker: createBigJoker,
  createSmallJoker: createSmallJoker,
  createDeck: createDeck
};
