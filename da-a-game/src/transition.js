// src/transition.js — 状态机 + 亮A + 强制排查
// 纯 JS、CommonJS；无 wx.* 依赖。
//
// 核心 API：
//   newGameState()                -> 初始空状态（GAME_START）
//   transition(state, action)     -> { ok:true, state:newState } | { ok:false, error:{type,message}, state:原state }
//
// 状态结构：
//   {
//     phase:           PHASES.X,
//     players:         [{ id, hand:[card], 底牌:card|null }, ...] (5 个)
//     startPlayerIndex: 0..4,
//     deck:            [card,...] (108),
//     dealOrder:       [0..4]*108,
//     主A:             null | { suit, establishedBy, viaMethod, viaCardId? },
//     actions:         [{ type, payload, atPhase }, ...]   // 成功动作历史
//   }
//
// 约束（按任务规范）：
//   - transition 是纯函数：失败时返回的 state 与入参 state 是同一引用
//   - 非法操作绝不修改 state
//   - 底牌是独立槽位，亮A / 强制排查只看 hand，绝不读底牌内容
//   - 不实现反A、底牌翻开、身份选择、出牌、牌型识别、AI、界面

const { dealGame } = require('./deal.js');
const playModule = require('./play.js');
const { pushWind } = require('./push-wind.js');
const { PHASES, ACTIONS, ERR } = require('./phases.js');

const PLAYER_NAMES = ['A', 'B', 'C', 'D', 'E'];
const NUM_PLAYERS = PLAYER_NAMES.length; // 5

// 强制排查花色检查顺序（§4.2：每个玩家按 ♥、♦、♣、♠ 顺序）
const SUIT_ORDER = ['H', 'D', 'C', 'S'];

// === 初始状态 ===
function newGameState() {
  return {
    phase: PHASES.GAME_START,
    players: [],
    startPlayerIndex: null,
    deck: [],
    dealOrder: [],
    主A: null,
    反A: null,        // §4.4：null 未反A；成功后 = { by, 旧主A }
    次方: null,        // §4.5：null 1V4 或未到本阶段；否则 = 'B'|'C'|'D'|'E'
    mode: null,        // 1V4_明打 / 1V4_暗打 / 2V3_明打 / 2V3_暗打 / null 未定
    底牌公开: false,   // §4.5：false 未翻开；true 底牌翻开后
    actions: [],
    discarded: []  // P0 修复: 已出完不再参与的牌 (旧 table / 取牌用掉的 4) - 牌张守恒 = hand + 底牌 + table + discarded = 108
  };
}

// === 内部工具 ===
function ok(state)   { return { ok: true,  state: state }; }
function err(type, message, state) {
  return { ok: false, error: { type: type, message: message }, state: state };
}

// 浅克隆玩家对象（保留 id 引用，替换 hand / 底牌）
function clonePlayer(p, newHand, new底牌) {
  return { id: p.id, hand: newHand, 底牌: new底牌 };
}

// 把所有匹配 suit+rank=14 的牌（包括 hand 和 底牌）的 is主方大A 置 true
// 返回新的 players 数组；不修改原数组
function markAllAcesAs主方大A(players, suit) {
  return players.map(function (p) {
    const newHand = p.hand.map(function (c) {
      if (c.suit === suit && c.rank === 14) {
        return Object.assign({}, c, { is主方大A: true });
      }
      return c;
    });
    let new底牌 = p.底牌;
    if (new底牌 && new底牌.suit === suit && new底牌.rank === 14) {
      new底牌 = Object.assign({}, new底牌, { is主方大A: true });
    }
    return clonePlayer(p, newHand, new底牌);
  });
}

// === 主入口：transition ===
// [A2 fix] state 补齐: handler 内部大量使用 state.X.Y 无守卫解引用
//   (actions.concat / state.table.map / state.主A.suit 等), 统一在入口补齐必需字段，不改每个 handler
var STATE_DEFAULTS = {
  phase: PHASES.GAME_START, players: [], startPlayerIndex: null,
  deck: [], dealOrder: [],
  主A: null, 反A: null, 次方: null, mode: null,
  主方: [], 抓方: [], 头名: null, 推风触发者: null,
  底牌公开: false, 次方公开: false,
  table: [], discarded: [], passedPlayers: [], passCount: 0, lastPlayer: null,
  actions: []
};
function ensureState(state) {
  if (!state || typeof state !== 'object') return Object.assign({}, STATE_DEFAULTS);
  var out = Object.assign({}, STATE_DEFAULTS, state);
  if (!Array.isArray(out.actions)) out.actions = [];
  if (!Array.isArray(out.table)) out.table = [];
  if (!Array.isArray(out.discarded)) out.discarded = [];
  if (!Array.isArray(out.passedPlayers)) out.passedPlayers = [];
  if (!Array.isArray(out.players)) out.players = [];
  return out;
}

function transition(state, action) {
  if (!action || typeof action.type !== 'string') {
    return err(ERR.UNKNOWN_ACTION, 'action must have a string type', state);  // [A5 fix] 保留原 state 引用, 不调 ensureState
  }
  // [A4 fix] state 早退
  if (state === null || state === undefined) return err(ERR.ILLEGAL_ACTION, 'state required', null);
  if (typeof state !== 'object') return err(ERR.ILLEGAL_ACTION, 'state must be an object', null);
  // [A2/A3 fix] 低层字段统一补齐
  const origState = state;             // [A3 fix] 保留原引用, err 路径返回原对象
  state = ensureState(state);
  const payload = action.payload || {};
  // [A fix] handler 返回的是显式字段列表
  // 在出口统一 merge: handler 覆盖生效, 未覆盖从旧 state 继承
  var _r = dispatch(state, action.type, payload);
  if (_r && _r.ok) {
    _r.state = Object.assign({}, state, _r.state);
  } else if (_r && _r.ok === false) {
    _r.state = origState;               // [A3 fix] 错误路径: 返回原 state 引用
  }
  return _r;
}

// [A fix] 原 switch 提取为 dispatch (逻辑不变)
function dispatch(state, type, payload) {
  switch (type) {
    case ACTIONS.START_GAME:      return handleStartGame(state, payload);
    case ACTIONS.LIANG_A:         return handleLiangA(state, payload);
    case ACTIONS.FORCED_CHECK:    return handleForcedCheck(state, payload);
    case ACTIONS.FAN_A:           return handleFanA(state, payload);
    case ACTIONS.REVEAL_BOTTOM:   return handleRevealBottom(state, payload);
    case ACTIONS.CHOOSE_IDENTITY: return handleChooseIdentity(state, payload);
    case ACTIONS.ADVANCE:         return handleAdvance(state, payload);
    case ACTIONS.PLAY:            return handlePlayAction(state, payload);
    case ACTIONS.PASS:            return handlePassAction(state, payload);
    case ACTIONS.PUSH_WIND:       return handlePushWindAction(state, payload);
    default:
      return err(ERR.UNKNOWN_ACTION, 'unknown action type: ' + type, state);
  }
}

// === handler: START_GAME ===
// 唯一进入 LIANG_A 阶段的入口；调用 dealGame 做发牌，然后 phase = LIANG_A
function handleStartGame(state, payload) {
  if (state.phase !== PHASES.GAME_START) {
    return err(ERR.ILLEGAL_ACTION,
      'START_GAME only allowed in GAME_START, current=' + state.phase, state);
  }
  const startPlayerIndex = (typeof payload.startPlayerIndex === 'number')
    ? payload.startPlayerIndex
    : Math.floor(Math.random() * NUM_PLAYERS);
  const game = dealGame({ startPlayerIndex: startPlayerIndex });
  return ok({
    phase: PHASES.LIANG_A,
    players: game.players,
    startPlayerIndex: game.startPlayerIndex,
    deck: game.deck,
    dealOrder: game.dealOrder,
    主A: null,
    反A: state.反A ?? null,
    次方: state.次方 ?? null,
    mode: state.mode ?? null,
    底牌公开: state.底牌公开 ?? false,
    actions: [{ type: ACTIONS.START_GAME, payload: payload, atPhase: PHASES.LIANG_A }]
  });
}

// === handler: LIANG_A（§4.1 主动亮A） ===
// 校验：phase=LIANG_A，主A 未确立，payload 完整，玩家存在，
//       牌在玩家 hand 中（不在 底牌），牌是 A（rank=14）
// 通过：phase=LIANG_A_RESOLVED，主A.suit=亮出牌花色，establishedBy=玩家，viaMethod='LIANG_A'
//       所有同花色 A 标记 is主方大A=true（hand + 底牌 都标，但底牌内容仍隐藏）
function handleLiangA(state, payload) {
  // 业务级拒绝优先级最高：主A 已确立时，不管 phase 是什么都拒绝亮A
  if (state.主A !== null) {
    return err(ERR.LIANG_A_REJECTED,
      '主A already established by ' + state.主A.establishedBy, state);
  }
  if (state.phase !== PHASES.LIANG_A) {
    return err(ERR.ILLEGAL_ACTION,
      'LIANG_A only allowed in LIANG_A, current=' + state.phase, state);
  }
  if (!payload || typeof payload.playerId !== 'string' || typeof payload.cardId !== 'string') {
    return err(ERR.MISSING_PAYLOAD,
      'LIANG_A requires payload { playerId, cardId }', state);
  }

  const player = state.players.find(function (p) { return p.id === payload.playerId; });
  if (!player) {
    return err(ERR.PLAYER_NOT_FOUND,
      'no player with id ' + payload.playerId, state);
  }

  // 先看是不是底牌（明确拒绝底牌亮出）
  if (player.底牌 && player.底牌.id === payload.cardId) {
    return err(ERR.CARD_NOT_IN_HAND,
      'cannot 亮A from 底牌: ' + payload.cardId, state);
  }
  // 在 hand 中找
  const handIdx = player.hand.findIndex(function (c) { return c.id === payload.cardId; });
  if (handIdx < 0) {
    return err(ERR.CARD_NOT_FOUND,
      'card ' + payload.cardId + ' not in player ' + payload.playerId + ' hand', state);
  }
  const card = player.hand[handIdx];
  if (card.rank !== 14) {
    return err(ERR.NOT_AN_ACE,
      'card ' + payload.cardId + ' is not an Ace (rank=' + card.rank + ')', state);
  }

  const newPlayers = markAllAcesAs主方大A(state.players, card.suit);
  return ok({
    phase: PHASES.LIANG_A_RESOLVED,
    players: newPlayers,
    startPlayerIndex: state.startPlayerIndex,
    deck: state.deck,
    dealOrder: state.dealOrder,
    主A: {
      suit: card.suit,
      establishedBy: payload.playerId,
      viaMethod: 'LIANG_A',
      viaCardId: card.id
    },
    反A: state.反A ?? null,
    次方: state.次方 ?? null,
    mode: state.mode ?? null,
    底牌公开: state.底牌公开 ?? false,
    actions: state.actions.concat([{
      type: ACTIONS.LIANG_A, payload: payload, atPhase: PHASES.LIANG_A_RESOLVED
    }])
  });
}

// === handler: FORCED_CHECK（§4.2 强制排查） ===
// 校验：phase=LIANG_A，主A 未确立
// 执行：从 startPlayerIndex 起逆时针遍历玩家，每个玩家按 H→D→C→S 顺序检查
//   - 手中该花色 A 数量 == 0 → 继续下一花色
//   - 手中该花色 A 数量 == 2 → 跳过该花色（同一玩家持双A不算"单A可排查"），继续该玩家下一花色
//   - 手中该花色 A 数量 == 1 → 命中；确立主A
//   - 全部 5 玩家 × 4 花色 都查不到 → 红桃A 兜底为主A
// 强制排查只看 hand，不读 底牌（§4.2 最后一条）
function handleForcedCheck(state, payload) {
  // 业务级拒绝优先级最高：主A 已确立时不能再跑强制排查
  if (state.主A !== null) {
    return err(ERR.FORCED_CHECK_REJECTED,
      '主A already established by ' + state.主A.establishedBy, state);
  }
  if (state.phase !== PHASES.LIANG_A) {
    return err(ERR.ILLEGAL_ACTION,
      'FORCED_CHECK only allowed in LIANG_A, current=' + state.phase, state);
  }

  const result = runForcedCheck(state); // 纯函数，返回 { suit, establishedBy, viaMethod }
  const newPlayers = markAllAcesAs主方大A(state.players, result.suit);

  return ok({
    phase: PHASES.LIANG_A_RESOLVED,
    players: newPlayers,
    startPlayerIndex: state.startPlayerIndex,
    deck: state.deck,
    dealOrder: state.dealOrder,
    主A: {
      suit: result.suit,
      establishedBy: result.establishedBy,
      viaMethod: result.viaMethod
    },
    反A: state.反A ?? null,
    次方: state.次方 ?? null,
    mode: state.mode ?? null,
    底牌公开: state.底牌公开 ?? false,
    actions: state.actions.concat([{
      type: ACTIONS.FORCED_CHECK, payload: payload, atPhase: PHASES.LIANG_A_RESOLVED
    }])
  });
}

// 强制排查纯函数：返回第一个满足"手中有单A"的 (player, suit)；找不到则兜底红桃A
function runForcedCheck(state) {
  const startIdx = state.startPlayerIndex;
  for (let round = 0; round < NUM_PLAYERS; round++) {
    const playerIdx = (startIdx + round) % NUM_PLAYERS;
    const player = state.players[playerIdx];
    for (let s = 0; s < SUIT_ORDER.length; s++) {
      const suit = SUIT_ORDER[s];
      const acesInHand = player.hand.filter(function (c) {
        return c.suit === suit && c.rank === 14;
      });
      if (acesInHand.length === 1) {
        // 命中：玩家手中有且仅有一张该花色 A
        return {
          suit: suit,
          establishedBy: player.id,
          viaMethod: 'FORCED_CHECK'
        };
      }
      // length===0 → 继续下一花色
      // length===2 → 跳过该花色，继续下一花色（§4.2）
      // 其它（不可能有 length>2，因为只有两副牌）
    }
  }
  // 全部查不到，兜底红桃A
  return {
    suit: 'H',
    establishedBy: 'DEFAULT_HEART',
    viaMethod: 'DEFAULT_HEART'
  };
}

// === handler: ADVANCE ===
// C-1 阶段：LIANG_A_RESOLVED → FAN_A 已打通
// FAN_A_RESOLVED → REVEAL_BOTTOM 仍未实现
function handleAdvance(state, payload) {
  if (state.phase === PHASES.LIANG_A_RESOLVED) {
    return ok({
      phase: PHASES.FAN_A,
      players: state.players,
      startPlayerIndex: state.startPlayerIndex,
      deck: state.deck,
      dealOrder: state.dealOrder,
      主A: state.主A,
      反A: state.反A ?? null,
      次方: state.次方 ?? null,
      mode: state.mode ?? null,
      底牌公开: state.底牌公开 ?? false,
      actions: state.actions.concat([{
        type: ACTIONS.ADVANCE, payload: payload, atPhase: PHASES.FAN_A
      }])
    });
  }
  if (state.phase === PHASES.FAN_A_RESOLVED) {
    return err(ERR.NO_NEXT_PHASE,
      'FAN_A_RESOLVED → REVEAL_BOTTOM uses REVEAL_BOTTOM action, not ADVANCE; cannot ADVANCE here', state);
  }
  return err(ERR.ILLEGAL_ACTION,
    'ADVANCE not allowed in phase ' + state.phase, state);
}

// === handler: FAN_A（§4.4 反A） ===
// 资格：玩家必须持有同一花色两张 A（任意花色），底牌不参与判断
// 多人都符合时：最先收到的有效操作成功，后续被 FAN_A_REJECTED
// 成功后：原主A 标记撤销，反A 花色的两张 A 标记 is主方大A，state.mode = '1V4_明打'（§4.4 强制）
function handleFanA(state, payload) {
  // [C-4 v5] §4.4 helper: 反A 成功后, 新抓方阵营 = 原主方 + 原次方 + 原抓方, 去掉反A 玩家
  function buildNewTakers(s, fanABy) {
    var t = [];
    (s.主方 || []).forEach(function (pid) { if (pid !== fanABy && t.indexOf(pid) < 0) t.push(pid); });
    if (s.次方 && s.次方 !== fanABy && t.indexOf(s.次方) < 0) t.push(s.次方);
    (s.抓方 || []).forEach(function (pid) { if (pid !== fanABy && t.indexOf(pid) < 0) t.push(pid); });
    return t;
  }
  // 业务级检查优先：反A 只能发生一次
  if (state.反A !== null && state.反A !== undefined) {
    return err(ERR.FAN_A_REJECTED,
      '反A already occurred by player ' + state.反A.by, state);
  }
  if (state.phase !== PHASES.FAN_A) {
    return err(ERR.ILLEGAL_ACTION,
      'FAN_A only allowed in FAN_A, current=' + state.phase, state);
  }
  if (state.主A === null) {
    return err(ERR.ILLEGAL_ACTION,
      'FAN_A requires 主A already established', state);
  }
  if (!payload ||
      typeof payload.playerId !== 'string' ||
      typeof payload.suit !== 'string' ||
      !Array.isArray(payload.cardIds) ||
      payload.cardIds.length !== 2) {
    return err(ERR.MISSING_PAYLOAD,
      'FAN_A requires { playerId, suit, cardIds: [id1, id2] }', state);
  }

  const player = state.players.find(function (p) { return p.id === payload.playerId; });
  if (!player) {
    return err(ERR.PLAYER_NOT_FOUND,
      'no player with id ' + payload.playerId, state);
  }

  // 两张牌都必须在 hand 里（底牌不参与反A资格判断）
  for (let i = 0; i < payload.cardIds.length; i++) {
    const id = payload.cardIds[i];
    if (player.底牌 && player.底牌.id === id) {
      return err(ERR.CARD_NOT_IN_HAND,
        'cannot use 底牌 for 反A: ' + id, state);
    }
  }
  const cards = payload.cardIds.map(function (id) {
    return player.hand.find(function (c) { return c.id === id; });
  });
  if (cards.some(function (c) { return !c; })) {
    return err(ERR.CARD_NOT_FOUND,
      'one or more cardIds not in player ' + payload.playerId + ' hand', state);
  }

  // 两张都必须是 A
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].rank !== 14) {
      return err(ERR.NOT_AN_ACE,
        'card ' + cards[i].id + ' is not an Ace', state);
    }
  }
  // 两张都必须是 payload.suit
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].suit !== payload.suit) {
      return err(ERR.SUIT_MISMATCH,
        'card ' + cards[i].id + ' suit=' + cards[i].suit +
        ' does not match payload.suit=' + payload.suit, state);
    }
  }
  // 手牌中该花色 A 数量必须 ≥ 2（两副牌最多 2 张，够了）
  // 严格说：手牌里该花色 A 数量 == 2（不能从别人那里 "拿"）
  const acesInHandOfSuit = player.hand.filter(function (c) {
    return c.suit === payload.suit && c.rank === 14;
  }).length;
  if (acesInHandOfSuit < 2) {
    return err(ERR.DOUBLE_A_REQUIRED,
      'player ' + payload.playerId + ' has only ' + acesInHandOfSuit +
      ' Ace(s) of suit ' + payload.suit + ' in hand; 反A requires 2', state);
  }

  // 全部通过：撤销旧主A 标记，标记新主A
  const oldSuit = state.主A.suit;
  const newSuit = payload.suit;

  const newPlayers = state.players.map(function (p) {
    const newHand = p.hand.map(function (c) {
      let is大A = c.is主方大A;
      if (c.suit === oldSuit && c.rank === 14) is大A = false;
      if (c.suit === newSuit && c.rank === 14) is大A = true;
      if (is大A !== c.is主方大A) {
        return Object.assign({}, c, { is主方大A: is大A });
      }
      return c;
    });
    let new底牌 = p.底牌;
    if (new底牌) {
      let is大A = new底牌.is主方大A;
      if (new底牌.suit === oldSuit && new底牌.rank === 14) is大A = false;
      if (new底牌.suit === newSuit && new底牌.rank === 14) is大A = true;
      if (is大A !== new底牌.is主方大A) {
        new底牌 = Object.assign({}, new底牌, { is主方大A: is大A });
      }
    }
    return clonePlayer(p, newHand, new底牌);
  });

  return ok({
    phase: PHASES.FAN_A_RESOLVED,
    players: newPlayers,
    // [G 修] SKILL §5: 反A 成功者拥有首轮出牌权
    startPlayerIndex: ['A','B','C','D','E'].indexOf(payload.playerId),
    deck: state.deck,
    dealOrder: state.dealOrder,
    主A: {
      suit: newSuit,
      establishedBy: payload.playerId,
      viaMethod: 'FAN_A',
      viaCardIds: payload.cardIds.slice()
    },
    反A: {
      by: payload.playerId,
      旧主A: {
        suit: oldSuit,
        establishedBy: state.主A.establishedBy,
        viaMethod: state.主A.viaMethod
      }
    },
    次方: null,
    // [C-4 v5] §4.4: 反A 成功后, 原主方 + 原次方 玩家均转为抓方阵营
    主方: [payload.playerId],
    抓方: buildNewTakers(state, payload.playerId),
    mode: '1V4_明打',  // §4.4 强制：反A 后自动 1V4 独打明打
    底牌公开: state.底牌公开 ?? false,
    actions: state.actions.concat([{
      type: ACTIONS.FAN_A, payload: payload, atPhase: PHASES.FAN_A_RESOLVED
    }])
  });
}

// === handler: REVEAL_BOTTOM（§4.5 底牌翻开 + 1V4/2V3 判定） ===
// FAN_A_RESOLVED → 翻开底牌 → 判定阵营模式 → IDENTITY_CHOICE 或 PLAY
// 判定规则：
//   - 找所有 主A 花色的大A（手牌 + 底牌），看分布在几个玩家手里
//   - 1 个玩家 → 1V4：
//     - 已 反A 或 mode 已为 1V4_明打 → 直接 PLAY（不需选择）
//     - 否则 → IDENTITY_CHOICE（等主方选明/暗）
//   - 2 个玩家 → 2V3：另一张大A持有者 = 次方 → IDENTITY_CHOICE（等次方选公开/隐藏）
function handleRevealBottom(state, payload) {
  // 业务级优先：底牌只能翻一次（不管 phase 是 IDENTITY_CHOICE/PLAY，都拒绝重复 REVEAL_BOTTOM）
  if (state.底牌公开 === true) {
    return err(ERR.REVEAL_BOTTOM_REJECTED, '底牌 already revealed', state);
  }
  // SKILL §3：反A 阶段从 FAN_A 开始，反A 成功进 FAN_A_RESOLVED；两种情况都可翻底牌
  if (state.phase !== PHASES.FAN_A && state.phase !== PHASES.FAN_A_RESOLVED) {
    return err(ERR.ILLEGAL_ACTION,
      'REVEAL_BOTTOM only allowed in FAN_A or FAN_A_RESOLVED, current=' + state.phase, state);
  }
  if (state.主A === null) {
    return err(ERR.ILLEGAL_ACTION, 'REVEAL_BOTTOM requires 主A already established', state);
  }

  // [C-4 v4 新增] SKILL §4.5: 反A 阶段结束后**先**将各玩家底牌转入普通手牌
  //   合并到底牌 → hand 数组, 底牌槽位置 null, 避免重复计数
  //   转移完成后, 后续所有判断 (出牌/胜负/计分) 均基于最终手牌数量
  var transferredPlayers = state.players.map(function (p) {
    if (p.底牌) {
      return Object.assign({}, p, {
        hand: p.hand.concat([p.底牌]),
        底牌: null
      });
    }
    return p;
  });

  // [A fix] 主A 未确定时不能解引用 (否则抛 TypeError)
  if (!state.主A || !state.主A.establishedBy) {
    return err(ERR.ILLEGAL_ACTION, 'REVEAL_BOTTOM requires 主A established', state);
  }
  const 主ASuit = state.主A.suit;
  const 主APlayer = state.主A.establishedBy;

  // 找所有 主A 花色的大A（手牌 + 底牌）
  const ownersSet = new Set();
  for (let i = 0; i < transferredPlayers.length; i++) {
    const p = transferredPlayers[i];
    for (let j = 0; j < p.hand.length; j++) {
      if (p.hand[j].suit === 主ASuit && p.hand[j].rank === 14) {
        ownersSet.add(p.id);
      }
    }
    if (p.底牌 && p.底牌.suit === 主ASuit && p.底牌.rank === 14) {
      ownersSet.add(p.id);
    }
  }

  let nextPhase, nextMode, 次方 = null;
  const 反A已发生 = (state.反A !== null && state.反A !== undefined);

  if (ownersSet.size === 1) {
    // 1V4：两个大A 同属一人
    if (反A已发生 || state.mode === '1V4_明打') {
      // §4.5: 反A 成功 / 直接亮双大A 宣告独打 → 1V4 明打已锁定
      nextPhase = PHASES.PLAY;
      nextMode = '1V4_明打';
    } else {
      // §4.5: 该玩家在首轮出牌前可以选择明打或暗打
      nextPhase = PHASES.IDENTITY_CHOICE;
      nextMode = null;
    }
  } else if (ownersSet.size === 2) {
    // 2V3：两个大A 分属两人；次方 = 不是主方的那位
    for (const pid of ownersSet) {
      if (pid !== 主APlayer) {
        次方 = pid;
        break;
      }
    }
    nextPhase = PHASES.IDENTITY_CHOICE;
    nextMode = null;
  } else {
    return err(ERR.ILLEGAL_ACTION,
      'unexpected 大A owner count: ' + ownersSet.size +
      ' (expected 1 or 2)', state);
  }

  return ok({
    phase: nextPhase,
    players: transferredPlayers,
    startPlayerIndex: state.startPlayerIndex,
    deck: state.deck,
    dealOrder: state.dealOrder,
    主A: state.主A,
    反A: state.反A ?? null,
    次方: 次方,
    mode: nextMode,
    底牌公开: true,
    // [SKILL §10.4] 主方定义: 2V3 = [主A, 次A] (2 人), 1V4 = [主A] (1 人)
    主方: (function () { const list = [state.主A.establishedBy]; if (次方) list.push(次方); return list; })(),
    抓方: (function () { const ids = ['A', 'B', 'C', 'D', 'E']; return ids.filter(function (i) { return i !== state.主A.establishedBy && i !== (次方 || null); }); })(),
    actions: state.actions.concat([{
      type: ACTIONS.REVEAL_BOTTOM, payload: payload, atPhase: nextPhase
    }])
  });
}

// === handler: CHOOSE_IDENTITY（§4.5 身份选择） ===
// 1V4（次方=null）→ 主方选 PUBLIC/HIDDEN
// 2V3（次方=某玩家）→ 次方选 PUBLIC/HIDDEN
// 公开 → 明打（倍率提升）；隐藏 → 暗打（倍率默认）
// 选完后 phase = PLAY
function handleChooseIdentity(state, payload) {
  if (state.phase !== PHASES.IDENTITY_CHOICE) {
    return err(ERR.ILLEGAL_ACTION,
      'CHOOSE_IDENTITY only allowed in IDENTITY_CHOICE, current=' + state.phase, state);
  }
  if (!payload ||
      typeof payload.playerId !== 'string' ||
      typeof payload.choice !== 'string') {
    return err(ERR.MISSING_PAYLOAD,
      'CHOOSE_IDENTITY requires { playerId, choice: "PUBLIC"|"HIDDEN" }', state);
  }
  if (payload.choice !== 'PUBLIC' && payload.choice !== 'HIDDEN') {
    return err(ERR.INVALID_CHOICE,
      'choice must be PUBLIC or HIDDEN, got ' + payload.choice, state);
  }
  if (state.主A === null) {
    return err(ERR.ILLEGAL_ACTION, 'CHOOSE_IDENTITY requires 主A', state);
  }

  let authorizedPlayer, newMode;

  if (state.次方 !== null) {
    // 2V3：只有 次方 能选
    authorizedPlayer = state.次方;
    if (payload.playerId !== state.次方) {
      return err(ERR.IDENTITY_NOT_AUTHORIZED,
        'only 次方 (' + state.次方 + ') can choose identity in 2V3; got ' + payload.playerId, state);
    }
    newMode = payload.choice === 'PUBLIC' ? '2V3_明打' : '2V3_暗打';
  } else {
    // 1V4：只有 主方 能选
    authorizedPlayer = state.主A.establishedBy;
    if (payload.playerId !== state.主A.establishedBy) {
      return err(ERR.IDENTITY_NOT_AUTHORIZED,
        'only 主方 (' + state.主A.establishedBy + ') can choose identity in 1V4; got ' + payload.playerId, state);
    }
    newMode = payload.choice === 'PUBLIC' ? '1V4_明打' : '1V4_暗打';
  }

  return ok({
    phase: PHASES.PLAY,
    players: state.players,
    startPlayerIndex: state.startPlayerIndex,
    deck: state.deck,
    dealOrder: state.dealOrder,
    主A: state.主A,
    反A: state.反A ?? null,
    次方: state.次方,
    mode: newMode,
    底牌公开: true,
    actions: state.actions.concat([{
      type: ACTIONS.CHOOSE_IDENTITY, payload: payload, atPhase: PHASES.PLAY
    }])
  });
}

// === handler: PLAY（§7 + §8 委托给 play.js） ===
function handlePlayAction(state, payload) {
  if (state.phase !== PHASES.PLAY) {
    return err(ERR.NOT_PLAY_PHASE,
      'PLAY only allowed in PLAY phase, current=' + state.phase, state);
  }
  var result = playModule.handlePlay(state, payload);
  if (!result.ok) return result;

  // [C-4 v4] 追踪头名 (第一个出完手牌的玩家, SKILL §10.1)
  var _player = result.state.players.find(function (p) { return p.id === payload.playerId; });
  if (_player && _player.hand.length === 0 && !result.state.头名) {
    result.state.头名 = payload.playerId;
  }

  // [C-4 v4] SKILL §7.3: 次方身份公开
  // - 2V3_暗打: 次方打出大A → 公开
  // - 2V3_明打: 次方已选 PUBLIC, 始终公开 (无需再触发)
  // - 1V4 (明/暗): 独打者 (主A) 打出**所有**大A → 第2张大A 公开, 次方公开=true
  if (result.state.mode === '2V3_暗打' && result.state.次方 === payload.playerId) {
    var hasBigA = false;
    for (var i = 0; i < result.state.table.length; i++) {
      if (result.state.table[i].is主方大A) { hasBigA = true; break; }
    }
    if (hasBigA) {
      result.state.次方公开 = true;
    }
  }
  // 1V4: 主方 玩家打出大A 后, 检查手牌还有没有大A
  if (result.state.mode && (result.state.mode === '1V4_明打' || result.state.mode === '1V4_暗打')) {
    var _主方Id = result.state.主方 && result.state.主方[0];
    if (_主方Id === payload.playerId && _player) {
      var _playedBigA = result.state.table.some(function (c) { return c.is主方大A; });
      if (_playedBigA) {
        var _hasMoreBigA = _player.hand.some(function (c) { return c.is主方大A; });
        if (!_hasMoreBigA) {
          result.state.次方公开 = true;  // 所有大A 都已出 → 第2张大A (次方) 公开
        }
      }
    }
  }

  // [Bug fix] 防御性: 即使 handlePlay 没显式复制 头名, 这里也确保 result.state.头名 存在
  if (result.state.头名 === undefined && state.头名 !== undefined) {
    result.state.头名 = state.头名;
  }
  return result;
}

// === handler: PASS（§8 委托给 play.js） ===
function handlePassAction(state, payload) {
  if (state.phase !== PHASES.PLAY) {
    return err(ERR.NOT_PLAY_PHASE,
      'PASS only allowed in PLAY phase, current=' + state.phase, state);
  }
  return playModule.handlePass(state, payload);
}

// === handler: PUSH_WIND（§9 委托给 push-wind.js） ===
// payload.trigger (optional): 指定推风触发者
// 不传则用 state.推风触发者
function handlePushWindAction(state, payload) {
  if (state.phase !== PHASES.PLAY) {
    return err(ERR.NOT_PLAY_PHASE,
      'PUSH_WIND only allowed in PLAY phase, current=' + state.phase, state);
  }
  var trigger = (payload && payload.trigger) || state.推风触发者;
  var stateWithTrigger = trigger ? Object.assign({}, state, { 推风触发者: trigger }) : state;
  return pushWind(stateWithTrigger);
}

module.exports = {
  newGameState: newGameState,
  transition: transition,
  // §5：纯函数 首轮出牌权 判定（与 transition 解耦，不动 state）
  determineFirstPlayer: determineFirstPlayer,
  // 暴露内部工具，便于测试
  _runForcedCheck: runForcedCheck
};

// === §5 首轮出牌权 纯函数（纯只读，不改 state） ===
// 优先级（SKILL §5）：
//   1. 反A 成功者（§4.4：反A 成功者拥有首轮出牌权）
//   2. 2V3 明打：次方先出
//   3. 1V4（任何途径：反A 后 / 直接亮双A / 强制排查 / 1V4 暗打）
//   4. 2V3 暗打：主方（亮A 那个）先出
// 返回：玩家 ID 'A'..'E'，或 null（主A 未确立）
function determineFirstPlayer(state) {
  if (!state || !state.主A) {
    return null;
  }
  // 1) 反A 成功者（覆盖 1V4_明打 / 2V3 由反A 触发的情况）
  if (state.反A !== null && state.反A !== undefined) {
    return state.反A.by;
  }
  // 2) 2V3 明打：次方先出
  if (state.mode === '2V3_明打' && state.次方) {
    return state.次方;
  }
  // 3) 默认：主方（覆盖 1V4 各种、2V3 暗打、直接亮双A）
  return state.主A.establishedBy;
}
