// src/ai.js — §12 AI 行动选择
// 严格按 SKILL.md §12 实现
//
// 设计原则 (§12 / §14):
//   AI **不自行判定牌型合法性**。所有候选组合交由规则引擎裁决
//   (canBeat / canCapture), AI 只负责"从合法集合里挑一个"。
//   这样 AI 与真人玩家走完全同一套校验, 不存在 AI 绕过规则的路径。
//
// 策略 (第一版, 只求合法 + 不浪费大牌):
//   1. [4]取牌 优先 (§7)
//   2. 压制: 从候选组合中挑"最小可用的一手" (张数少者优先, 同张数按牌力低者优先)
//   3. 无合法行动 -> 过牌
//   4. 新一轮起手: 出安全牌 (非 2/3/A/王/大A), 保留大牌

const { identifyHand, canBeat } = require('./hand-types.js');
const { canCapture } = require('./capture.js');
const { candidateCombos } = require('./combos.js');

// 牌的"保留价值"(越大越该留着)。仅用于 AI 排序, 不参与任何合法性判断。
function keepValue(c) {
  if (c.isBigJoker) return 1000;
  if (c.isSmallJoker) return 900;
  if (c.is主方大A) return 800;
  if (c.rank === 3) return 700;
  if (c.rank === 2) return 600;
  if (c.rank === 14) return 500;
  if (c.rank === 4) return 50;   // 4 有取牌用途, 轻度保留
  return (c.rank || 0) * 10;
}

// 单张出牌顺序 (§6.2: 4 < 5 < ... < K), 供起手选安全牌
function cardPowerAsc(c) {
  if (c.isBigJoker) return 180;
  if (c.isSmallJoker) return 170;
  if (c.rank === 3) return 160;
  if (c.rank === 2) return 150;
  if (c.rank === 14) return 140;
  return c.rank || 0;
}
function isFour(c) { return c.rank === 4 && !c.isBigJoker && !c.isSmallJoker; }

// AI 选择行动: { type: 'PLAY' | 'PASS' | 'CHOOSE_IDENTITY', playerId, cardIds? / choice? }
function chooseAction(state, playerId) {
  // [A2 fix] state 或 players 缺失时安全返回 PASS (不 crash)
  if (!state || !state.players || !Array.isArray(state.players)) {
    return { type: 'PASS', playerId: playerId };
  }
  // §12: IDENTITY_CHOICE 阶段 AI 选 HIDDEN (隐藏身份, 避免暴露)
  if (state.phase === 'IDENTITY_CHOICE') {
    return { type: 'CHOOSE_IDENTITY', playerId: playerId, choice: 'HIDDEN' };
  }

  var player = state.players.find(function (p) { return p.id === playerId; });
  if (!player || !Array.isArray(player.hand) || player.hand.length === 0) {
    // 手牌空 (推风场景应由引擎处理推风) -> 安全过牌
    return { type: 'PASS', playerId: playerId };
  }

  var hand = player.hand;
  var table = Array.isArray(state.table) ? state.table : [];
  var currentHand = table.length > 0 ? identifyHand(table) : null;

  // ================= 新一轮起手 (§5) =================
  if (table.length === 0) {
    var playable = hand.filter(function (c) { return !isFour(c) || hand.every(isFour); });
    if (playable.length === 0) {
      var onlyFours = hand.filter(isFour);
      if (onlyFours.length > 0) return { type: 'PLAY', playerId: playerId, cardIds: [onlyFours[0].id] };
      return { type: 'PASS', playerId: playerId };
    }
    // [新增] 起手可打"廉价组合"(>=3 张且不含大牌)。
    // 原因: §6.3 龙/对子/单张同层级互不压, 连张只能压等长连张。
    //   若起手永远只出单张, 桌上永远不会出现连张, AI 就永远打不出连张 (结构性死锁)。
    //   故允许用不含大牌的组合起手, 既减少手牌, 也让连张/双龙路径可达。
    var leadCands = candidateCombos(hand).filter(function (c) {
      if (c.length < 3) return false;
      var cards = c.map(function (id) { return hand.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean);
      if (!cards.length || cards.some(isFour)) return false;      // 不用 4 起手 (留给取牌)
      if (identifyHand(cards).type === 'INVALID') return false;
      return cards.every(function (x) { return keepValue(x) < 500; });   // 不含王/大A/2/3/A
    });
    if (leadCands.length > 0) {
      var best = leadCands[0];   // candidateCombos 已按张数多者优先排序
      return { type: 'PLAY', playerId: playerId, cardIds: best.slice() };
    }
    // 起手出安全牌 (保留 2/3/A/王/大A)
    var safe = playable.filter(function (c) { return keepValue(c) < 500; });
    var openCard = (safe.length > 0 ? safe : playable)
      .slice()
      .sort(function (a, b) { return cardPowerAsc(a) - cardPowerAsc(b); })[0];
    return { type: 'PLAY', playerId: playerId, cardIds: [openCard.id] };
  }

  // ================= 1. [4]取牌 优先 (§7) =================
  var fours = hand.filter(isFour);
  for (var n = 2; n <= fours.length && n <= 8; n++) {
    var subset = fours.slice(0, n);
    if (canCapture(subset, table).canCapture) {
      return { type: 'PLAY', playerId: playerId, cardIds: subset.map(function (c) { return c.id; }) };
    }
  }

  // ================= 2. 压制: 候选组合交引擎裁决 =================
  // candidateCombos 覆盖 对子/蛋子/大蛋子/真七/真八/连张/双龙 等;
  // 单张不在其中, 需单独补 (1 张不属于任何组合枚举)。
  // candidateCombos 只产出 2 张及以上的组合; 单张需单独补入
  var cands = candidateCombos(hand).slice();
  hand.forEach(function (c) { cands.push([c.id]); });

  // 排序: 张数多者优先 (尽快减少手牌, 避免永远只出单张导致牌局拖沓),
  // 同张数按保留价值低者优先 (尽量不用大牌)。合法性已由 canBeat 裁决, 排序只是策略。
  var byId = {};
  hand.forEach(function (c) { byId[c.id] = c; });
  var uniq = {};
  var dedup = [];
  cands.forEach(function (c) {
    var key = c.slice().sort().join('|');
    if (!uniq[key]) { uniq[key] = true; dedup.push(c); }
  });
  dedup.sort(function (a, b) {
    if (a.length !== b.length) return b.length - a.length;   // 张数多者优先
    var va = Math.max.apply(null, a.map(function (id) { return keepValue(byId[id] || {}); }));
    var vb = Math.max.apply(null, b.map(function (id) { return keepValue(byId[id] || {}); }));
    if (va !== vb) return va - vb;                            // 保留价值低者优先
    return a[0] < b[0] ? -1 : 1;
  });

  for (var i = 0; i < dedup.length; i++) {
    var combo = dedup[i];
    var comboCards = combo.map(function (id) { return byId[id]; }).filter(Boolean);
    if (!comboCards.length) continue;
    var h = identifyHand(comboCards);
    if (h.type === 'INVALID') continue;                        // 枚举出的组合不合法, 跳过
    if (canBeat(h, currentHand)) {
      return { type: 'PLAY', playerId: playerId, cardIds: combo.slice() };
    }
  }

  // ================= 3. 无合法行动 -> 过牌 =================
  return { type: 'PASS', playerId: playerId };
}

module.exports = {
  chooseAction: chooseAction
};