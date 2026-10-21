// src/play.js — §8 出牌轮次与过牌
// 严格按 SKILL.md §8 实现
//
// 提供两个 action handler：
//   handlePlay(state, payload)  → { ok, state, error? }
//   handlePass(state, payload) → { ok, state, error? }
//
// 还提供 isRoundOver(state) 用于判断轮是否结束。
//
// 重要约束 (C-4 v3 修复):
//   - handler 返回的 state 必须保留所有其它字段 (主A, 次方, mode, 推风触发者, 底牌公开, 反A, dealOrder, deck, actions, ...)
//   - 只覆盖本次操作实际改变的字段
//   - 用 Object.assign({}, state, { ...overrides }) 模式

const { HAND_TYPES, identifyHand, canBeat } = require('./hand-types.js');
const { canCapture, executeCapture } = require('./capture.js');

// 处理出牌
// payload: { playerId, cardIds }
function handlePlay(state, payload) {
  if (!state || !state.players) {
    return { ok: false, error: { type: 'MISSING_PAYLOAD', message: 'state.players required' }, state: state };
  }
  if (!payload || !payload.playerId || !Array.isArray(payload.cardIds)) {
    return { ok: false, error: { type: 'MISSING_PAYLOAD', message: 'payload needs { playerId, cardIds }' }, state: state };
  }
  const { playerId, cardIds } = payload;

  const player = state.players.find(p => p.id === playerId);
  if (!player) {
    return { ok: false, error: { type: 'PLAYER_NOT_FOUND', message: 'player ' + playerId + ' not found' }, state: state };
  }
  // [A3 fix] player.hand 可能缺失 (异常 state)
  if (!Array.isArray(player.hand)) {
    return { ok: false, error: { type: 'INVALID_HAND', message: 'player hand is not an array' }, state: state };
  }

  // 找到对应的牌
  const playCards = player.hand.filter(c => cardIds.indexOf(c.id) >= 0);
  if (playCards.length !== cardIds.length) {
    return { ok: false, error: { type: 'CARD_NOT_FOUND', message: 'one or more cardIds not in player hand' }, state: state };
  }

  // 全部是 4s: 优先尝试取牌 (SKILL §7), 失败则回退到普通单张 (SKILL §6)
  //   SKILL §6.1/§6.2: 4 是合法普通单张 (排序最低)
  //   SKILL §7: 4 也可以用于取牌 (特殊路径)
  const allFours = playCards.every(c => c.rank === 4 && !c.isBigJoker && !c.isSmallJoker);
  if (allFours) {
    const captureResult = executeCapture(state, playerId, playCards);
    if (captureResult.ok) return captureResult;
    // capture 不可用 (桌上无可取目标 / 4s 数量不足), 回退到普通出牌路径
  }

  // 普通出牌: 识别牌型
  const hand = identifyHand(playCards);
  if (hand.type === HAND_TYPES.INVALID) {
    return { ok: false, error: { type: 'INVALID_HAND', message: hand.reason || 'not a valid hand' }, state: state };
  }

  // 检查能否压当前 (若 table 非空)
  if (state.table && state.table.length > 0) {
    const currentHand = identifyHand(state.table);
    if (!canBeat(hand, currentHand)) {
      return { ok: false, error: { type: 'CANNOT_BEAT', message: 'cannot beat current hand' }, state: state };
    }
  }

  // 更新 state: 从手牌移除
  const newHand = player.hand.filter(c => cardIds.indexOf(c.id) < 0);
  const newPlayers = state.players.map(p => {
    if (p.id !== playerId) return p;
    return Object.assign({}, p, { hand: newHand });
  });

  // P0 修复: 旧 table 牌 → discarded (新 PLAY 覆盖了旧响应)
  const newDiscarded = (state.discarded || []).concat(state.table || []);
  // 保留全 state, 只覆盖本次改变的字段
  return {
    ok: true,
    state: Object.assign({}, state, {
      table: playCards.slice(),
      discarded: newDiscarded,
      lastPlayer: playerId,
      passedPlayers: [],
      passCount: 0,
      players: newPlayers
    })
  };
}

// 处理过牌
// payload: { playerId }
function handlePass(state, payload) {
  if (!state || !state.players) {
    return { ok: false, error: { type: 'MISSING_PAYLOAD', message: 'state.players required' }, state: state };
  }
  if (!payload || !payload.playerId) {
    return { ok: false, error: { type: 'MISSING_PAYLOAD', message: 'payload needs { playerId }' }, state: state };
  }
  const { playerId } = payload;

  const player = state.players.find(p => p.id === playerId);
  if (!player) {
    return { ok: false, error: { type: 'PLAYER_NOT_FOUND', message: 'player ' + playerId + ' not found' }, state: state };
  }
  if (!Array.isArray(player.hand)) {
    return { ok: false, error: { type: 'INVALID_HAND', message: 'player hand is not an array' }, state: state };
  }

  // 无当前手牌
  if (!state.table || state.table.length === 0) {
    return { ok: false, error: { type: 'CANNOT_PASS', message: 'no active hand to pass' }, state: state };
  }

  // lastPlayer 不能过自己的牌
  if (playerId === state.lastPlayer) {
    return { ok: false, error: { type: 'CANNOT_PASS', message: 'lastPlayer cannot pass' }, state: state };
  }

  // 已过牌
  if (state.passedPlayers && state.passedPlayers.indexOf(playerId) >= 0) {
    return { ok: false, error: { type: 'ALREADY_PASSED', message: 'already passed' }, state: state };
  }

  const newPassedPlayers = (state.passedPlayers || []).concat([playerId]);
  const newPassCount = (state.passCount || 0) + 1;

  // SKILL §8: "本轮所有尚未出完的玩家都过牌" → 排除已出完的 (hand.length === 0)
  // 需过牌 = 还活着的 (有手牌) 且不是 lastPlayer
  const aliveOthers = state.players.filter(function (p) {
    return p.hand.length > 0 && p.id !== state.lastPlayer;
  });
  const allPassed = newPassCount >= aliveOthers.length;

  if (allPassed) {
    // 轮结束: 清桌, 清 passedPlayers, 旧 table 牌 → discarded
    const newDiscarded = (state.discarded || []).concat(state.table || []);
    return {
      ok: true,
      state: Object.assign({}, state, {
        table: [],
        discarded: newDiscarded,
        lastPlayer: state.lastPlayer,
        passedPlayers: [],
        passCount: 0
      })
    };
  }

  return {
    ok: true,
    state: Object.assign({}, state, {
      table: state.table,
      lastPlayer: state.lastPlayer,
      passedPlayers: newPassedPlayers,
      passCount: newPassCount
    })
  };
}

// 判断轮是否结束
function isRoundOver(state) {
  if (!state.table || state.table.length === 0) return true;
  const otherPlayersCount = state.players.length - 1;
  return (state.passCount || 0) >= otherPlayersCount;
}

module.exports = {
  handlePlay: handlePlay,
  handlePass: handlePass,
  isRoundOver: isRoundOver
};
