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

// [2026-11-04] **逐轮发牌原语**（发牌过程中可亮A，用户裁定）
//   dealGame 与 DEAL_ROUND handler **共用同一套洗牌/发牌顺序/底牌归属规则** ——
//   不写两份规则（AGENTS.md §15：规则只有一处实现）。
//   一轮 = 沿 dealOrder 顺序发 5 张（每家1张），最后 1 轮只发 3 张。
//   dealOrder 布局：21 轮 × 5 张 = 105（每人21张）+ 1 轮 × 3 张 = 108。
//   底牌 = 该玩家在 dealOrder 里**最后一次出现**的那张（§2.2）。
function dealRoundsCount() {
  return FULL_ROUNDS + 1;   // 21 轮满 + 最后 1 轮(3 张) = 22 轮
}

// 第 roundIdx 轮：谁拿 deck 的第几张
function roundAssignments(dealOrder, roundIdx) {
  var out = [];
  var base = roundIdx * NUM_PLAYERS;
  for (var i = 0; i < NUM_PLAYERS; i++) {
    var idx = base + i;
    if (idx >= dealOrder.length) break;
    out.push({ playerIndex: dealOrder[idx], deckIndex: idx });
  }
  return out;
}

// 该玩家在 dealOrder 里最后一次出现的下标 -> 他的底牌在 deck 里的位置
function bottomDeckIndex(dealOrder, playerIndex) {
  var last = -1;
  for (var i = 0; i < dealOrder.length; i++) {
    if (dealOrder[i] === playerIndex) last = i;
  }
  return last;
}

// 发一轮：这一轮的牌进对应玩家的 hand（或底牌槽），返回新的 players 数组
//   底牌**直接进底牌槽，永不在 hand 里** -> §4.2「底牌不可用于亮A/反A」天然成立
function dealRound(players, deck, dealOrder, roundIdx) {
  var assigns = roundAssignments(dealOrder, roundIdx);
  if (!assigns.length) return players;
  var newPlayers = players.map(function (p) {
    return { id: p.id, hand: p.hand.slice(), 底牌: p.底牌 };
  });
  assigns.forEach(function (a) {
    var pl = newPlayers[a.playerIndex];
    if (!pl) return;
    var card = deck[a.deckIndex];
    if (bottomDeckIndex(dealOrder, a.playerIndex) === a.deckIndex) {
      card.location = { type: '底牌', playerId: pl.id };
      pl.底牌 = card;
    } else {
      card.location = { type: 'hand', playerId: pl.id };
      pl.hand.push(card);
    }
  });
  return newPlayers;
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
  dealRoundsCount: dealRoundsCount,
  roundAssignments: roundAssignments,
  bottomDeckIndex: bottomDeckIndex,
  dealRound: dealRound,
  dealGame: dealGame
};
