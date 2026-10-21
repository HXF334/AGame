// src/deal.js — 洗牌 + 玩家 + 发牌 + 底牌提取
// 纯 JS、CommonJS；无 wx.* 依赖。
//
// 发牌规则严格遵循 SKILL.md §2.2：
//   - 5 名玩家 A/B/C/D/E，按逆时针方向
//   - 每局随机选择发牌起始玩家
//   - 按发牌顺序，前三名玩家各 22 张，后两名玩家各 21 张，共 108 张
//   - 每个玩家最后发到的一张牌为"底牌"
//   - 底牌在亮A、反A资格判断时不可见
//
// 实现：把 108 张发牌序列展开成 dealOrder[0..107] = playerIdx(0..4)
//   21 轮 × 5 张 = 105  (每人都拿到 21 张)
//   + 1 轮 × 3 张       (按顺序再给前 3 名各 1 张)  →  22 / 22 / 22 / 21 / 21
//   合计 108 张 ✓
//
// 底牌数据模型：player.hand 与 player.底牌 **分离存储**。
//   理由：后续 §4.2 / §4.4 要求亮A、反A时"底牌不可用"，
//   把底牌从手牌数组里拎出来，规则引擎遍历 player.hand 时自动忽略底牌，
//   不需要额外的"这是不是底牌"判断分支。

const cardMod = require('./card.js');
const createDeck = cardMod.createDeck;

const PLAYER_NAMES = ['A', 'B', 'C', 'D', 'E'];
const NUM_PLAYERS = PLAYER_NAMES.length; // 5
const FULL_ROUNDS = 21;                 // 每人先拿 21 张
const EXTRA_CARDS = 3;                  // 再给按顺序前 3 名各 +1

// Fisher–Yates 原地洗牌；返回同一引用
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

function createPlayer(id) {
  return {
    id: id,
    hand: [],       // 20 或 21 张，亮A/反A/出牌的评估集
    底牌: null      // 1 张，初始隐藏（§4.2/§4.4 规定其不参与资格判断）
  };
}

// 构建 dealOrder：长度为 108 的数组，元素是 0..4 的玩家索引
function buildDealOrder(startPlayerIndex) {
  const order = [];
  for (let round = 0; round < FULL_ROUNDS; round++) {
    for (let p = 0; p < NUM_PLAYERS; p++) {
      order.push((startPlayerIndex + p) % NUM_PLAYERS);
    }
  }
  for (let p = 0; p < EXTRA_CARDS; p++) {
    order.push((startPlayerIndex + p) % NUM_PLAYERS);
  }
  return order;
}

// dealGame 一次完成：建牌 → 洗牌 → 选起始 → 发牌 → 提底牌
// 入参可指定 startPlayerIndex（测试用），不指定则随机
function dealGame(opts) {
  opts = opts || {};
  const startPlayerIndex = (typeof opts.startPlayerIndex === 'number')
    ? opts.startPlayerIndex
    : Math.floor(Math.random() * NUM_PLAYERS);

  const deck = shuffle(createDeck());
  const dealOrder = buildDealOrder(startPlayerIndex);

  const players = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    players.push(createPlayer(PLAYER_NAMES[i]));
  }

  // 按 dealOrder 依次发牌
  for (let i = 0; i < dealOrder.length; i++) {
    const playerIdx = dealOrder[i];
    const card = deck[i];
    card.location = { type: 'hand', playerId: players[playerIdx].id };
    players[playerIdx].hand.push(card);
  }

  // 对每个玩家：找其在 dealOrder 里最后一次出现的索引，
  // deck[lastIdx] 就是他的底牌；从 hand 中移除并放入 player.底牌
  for (let playerIdx = 0; playerIdx < NUM_PLAYERS; playerIdx++) {
    let lastDealIdx = -1;
    for (let i = 0; i < dealOrder.length; i++) {
      if (dealOrder[i] === playerIdx) lastDealIdx = i;
    }
    if (lastDealIdx < 0) {
      // 理论上不会发生（每人都会出现在 dealOrder 里）
      continue;
    }
    const bottom = deck[lastDealIdx];
    const handIdx = players[playerIdx].hand.indexOf(bottom);
    if (handIdx >= 0) {
      players[playerIdx].hand.splice(handIdx, 1);
    }
    players[playerIdx].底牌 = bottom;
    bottom.location = { type: '底牌', playerId: players[playerIdx].id };
  }

  return {
    players: players,
    startPlayerIndex: startPlayerIndex,
    deck: deck,
    dealOrder: dealOrder
  };
}

module.exports = {
  PLAYER_NAMES: PLAYER_NAMES,
  NUM_PLAYERS: NUM_PLAYERS,
  shuffle: shuffle,
  createPlayer: createPlayer,
  buildDealOrder: buildDealOrder,
  dealGame: dealGame
};
