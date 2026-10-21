// src/ai.js — §12 AI 行动选择
// 严格按 SKILL.md §12 实现
// 简化版: try capture → try press → pass

const { identifyHand, canBeat } = require('./hand-types.js');
const { canCapture } = require('./capture.js');

// AI 选择行动: { type: 'PLAY' | 'PASS' | 'CHOOSE_IDENTITY', playerId, cardIds? / choice? }
function chooseAction(state, playerId) {
  // [A2 fix] state 或 players 缺失时安全返回 PASS (不 crash)
  if (!state || !state.players || !Array.isArray(state.players)) {
    return { type: 'PASS', playerId: playerId };
  }
  // [P2] CHOOSE_IDENTITY 阶段: AI 选 HIDDEN (隐藏身份, 避免暴露)
  if (state.phase === 'IDENTITY_CHOICE') {
    return { type: 'CHOOSE_IDENTITY', playerId: playerId, choice: 'HIDDEN' };
  }

  var player = state.players.find(function (p) { return p.id === playerId; });
  if (!player || !Array.isArray(player.hand) || player.hand.length === 0) {
    // 简化: 手牌空就 pass (推风场景下应跳过, 批次 1 简化为 pass)
    return { type: 'PASS', playerId: playerId };
  }

  // table 空: 新一轮, 出第一张牌
  // [任务 4] 排序: 单牌大小 (按 SKILL §6.2 编码: 4 < 5 < ... < K(13) < 普通A(14) < 2(15) < 3(16) < 小王(17) < 大王(18))
  function cardPowerAsc(c) {
    if (c.isBigJoker) return 180;
    if (c.isSmallJoker) return 170;
    if (c.rank === 3) return 160;
    if (c.rank === 2) return 150;
    if (c.rank === 14) return 140;
    return c.rank || 0;
  }
  function sortedAsc(cards) { return cards.slice().sort(function (a, b) { return cardPowerAsc(a) - cardPowerAsc(b); }); }
  var nonFoursSorted = sortedAsc(player.hand.filter(function (c) { return !(c.rank === 4 && !c.isBigJoker && !c.isSmallJoker); }));

  // [D 优化] 大牌保护: 这些牌力面最大 (§6.2), 不用来起手
  // isBigJoker/大压/小压/小王/大王/普通A/大A(3)/2 = 大牌
  function isBigPower(c) {
    if (c.isBigJoker || c.isSmallJoker) return true;   // 王
    if (c.is主方大A) return true;            // 大A (可压任何单牌)
    if (c.rank === 2 || c.rank === 3) return true;      // 2/3 靠近最大
    if (c.rank === 14) return true;                    // 普通A 也比较大
    return false;
  }
  // 安全牌 (非大牌, 非 4): 4 < 5 < ... < K
  var safeSorted = nonFoursSorted.filter(function (c) { return !isBigPower(c); });

  if (!state.table || state.table.length === 0) {
    // 桌空: 优先出安全牌起手, 没有安全牌才用大牌
    // [E 修正] 手牌全是 4 时 nonFoursSorted 为空, 需先尝试 capture (桌不可能为空时才用 4 起手)
    if (nonFoursSorted.length === 0) {
      var onlyFours = player.hand.filter(function (c) { return c.rank === 4 && !c.isBigJoker && !c.isSmallJoker; });
      if (onlyFours.length > 0) return { type: 'PLAY', playerId: playerId, cardIds: [onlyFours[0].id] };
      return { type: 'PASS', playerId: playerId };
    }
    var openCard = (safeSorted.length > 0) ? safeSorted[0] : nonFoursSorted[0];
    return { type: 'PLAY', playerId: playerId, cardIds: [openCard.id] };
  }

  // 1. 优先 capture: 用 4s 取牌
  var fours = player.hand.filter(function (c) {
    return c.rank === 4 && !c.isBigJoker && !c.isSmallJoker;
  });
  // 试从最少 2 张到所有 4s (受 target 长度限制)
  for (var n = 2; n <= fours.length && n <= 8; n++) {
    var subset = fours.slice(0, n);
    if (canCapture(subset, state.table).canCapture) {
      return { type: 'PLAY', playerId: playerId, cardIds: subset.map(function (c) { return c.id; }) };
    }
  }

  // 2. press: 按小→大 找能压 current 的最小单张
  // [D 优化] 优先小牌; 如果只能用大牌压, 仍允许 (规则上合法)
  //   但优先使用安全牌, 大牌留给关键轮次
  var pressOrder = safeSorted.concat(nonFoursSorted.filter(function (c) { return isBigPower(c); }));
  for (var j = 0; j < pressOrder.length; j++) {
    var card = pressOrder[j];
    var hand = identifyHand([card]);
    if (hand.type === 'INVALID') continue;
    if (canBeat(hand, identifyHand(state.table))) {
      return { type: 'PLAY', playerId: playerId, cardIds: [card.id] };
    }
  }

  // 3. 不能 capture 也不能 press: pass
  // [C] AI 压对子: 桌是对子时, 尝试最小能压的对子 (SKILL §6.2 对子只能对对子压)
  var tableHandPair = identifyHand(state.table);
  if (state.table.length === 2 && tableHandPair && tableHandPair.type === 'PAIR') {
    var byRank = {};
    for (var pi = 0; pi < player.hand.length; pi++) {
      var pc = player.hand[pi];
      if (pc.isBigJoker || pc.isSmallJoker) continue;
      if (pc.rank === 4) continue;
      if (!byRank[pc.rank]) byRank[pc.rank] = [];
      byRank[pc.rank].push(pc);
    }
    var rankKeys = Object.keys(byRank).map(Number);
    rankKeys.sort(function (a, b) { return cardPowerAsc({ rank: a }) - cardPowerAsc({ rank: b }); });
    for (var ri = 0; ri < rankKeys.length; ri++) {
      var grp = byRank[rankKeys[ri]];
      if (grp.length < 2) continue;
      var pairHand = identifyHand([grp[0], grp[1]]);
      if (pairHand.type === 'INVALID') continue;
      if (canBeat(pairHand, tableHandPair)) {
        return { type: 'PLAY', playerId: playerId, cardIds: [grp[0].id, grp[1].id] };
      }
    }
  }
  return { type: 'PASS', playerId: playerId };
}

module.exports = {
  chooseAction: chooseAction
};
