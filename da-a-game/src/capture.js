// src/capture.js — §7 [4]取牌
// 严格按 SKILL.md §6.4 和 §7 实现
//
// 提供两个纯函数：
//   canCapture(fours, target)  → { canCapture: bool, reason?: string }
//   executeCapture(state, playerId, fours)  → { ok, state, error? }

const { HAND_TYPES } = require('./hand-types.js');

// 判断 fours 是否能取 target
//   - 4s 必须是真正的 4 (rank === 4, 非王)
//   - target 长度 3-8, 全部同 rank, 不含王
//   - 4s 数量 = target.length - 1
function canCapture(fours, target) {
  if (!Array.isArray(fours) || fours.length === 0) {
    return { canCapture: false, reason: 'no 4s' };
  }
  if (!Array.isArray(target) || target.length === 0) {
    return { canCapture: false, reason: 'no target on table' };
  }
  if (target.length < 3 || target.length > 8) {
    return { canCapture: false, reason: 'target must be 3-8 cards' };
  }

  // 4s 不能含王且必须 rank=4
  for (const c of fours) {
    if (c.isBigJoker || c.isSmallJoker) {
      return { canCapture: false, reason: 'jokers cannot capture' };
    }
    if (c.rank !== 4) {
      return { canCapture: false, reason: 'only 4s can capture' };
    }
  }

  // target 不能含王, 必须同 rank
  const targetRank = target[0].rank;
  for (const c of target) {
    if (c.isBigJoker || c.isSmallJoker) {
      return { canCapture: false, reason: 'cannot capture jokers' };
    }
    if (c.rank !== targetRank) {
      return { canCapture: false, reason: 'target must be same rank' };
    }
  }

  // 4s 数量 = target.length - 1
  const required = target.length - 1;
  if (fours.length !== required) {
    return { canCapture: false, reason: 'need ' + required + ' fours, got ' + fours.length };
  }

  return { canCapture: true };
}

// 执行取牌: target 移入玩家手牌, 4s 移上桌
// state (含): phase, table, lastPlayer, passedPlayers, passCount, players
function executeCapture(state, playerId, fours) {
  const result = canCapture(fours, state.table);
  if (!result.canCapture) {
    return { ok: false, error: { type: 'CANNOT_CAPTURE', message: result.reason }, state: state };
  }

  const player = state.players.find(p => p.id === playerId);
  if (!player) {
    return { ok: false, error: { type: 'PLAYER_NOT_FOUND', message: 'player not found' }, state: state };
  }

  // 4s 从手牌移除 (按 id 匹配)
  const fourIds = new Set(fours.map(c => c.id));
  const newHand = player.hand.filter(c => !fourIds.has(c.id));
  // target 牌入玩家手牌, 标记 location
  // [C-4 v4] §7.3: 取牌成功后, 被取回牌组中的原大A 失去 is主方大A 标志
  // [A fix] table 为空时无可取目标 (避免 TypeError)
  if (!state.table || state.table.length === 0) {
    return { ok: false, error: { type: 'CANNOT_PASS', message: 'table empty, nothing to capture' }, state: state };
  }
  var captured = state.table.map(function (c) {
    // [2026-11-09 用户] 「4取牌后不是手牌变化, 是桌面上被取的牌变化」
    //   -> 原牌(留在受害者座位上的那手)打「被取走」标记: UI 画成半透明 50% + 飞向取牌者手牌。
    // [2026-11-09 用户] 「透明度不要了, 只在桌面上被取的牌的右下角标一个半透明的取字」
    //   -> 不再给牌对象打标记(牌对象是**共享引用**, 原地打标记会流到 UI 的出牌缓存, 把没被取的牌也标上);
    //      「哪些牌被取走」改成由 UI 从引擎状态反推(副本进了取牌者手牌, 带「取自」标记)。
    // [2026-11-08 22:40 用户] 「桌面上被4取牌的蛋子+加点标志」-> 被取走的牌打上标记,
    //   之后在手牌区/再次上桌时都带着, 一眼看出「这手是被4取走的」。
    var copy = Object.assign({}, c, { location: { type: 'hand', playerId: playerId }, 取自: playerId });
    if (copy.is主方大A) {
      return Object.assign({}, copy, { is主方大A: false });
    }
    return copy;
  });
  // 4s 上桌, 标记 location
  const foursOnTable = fours.map(c => Object.assign({}, c, {
    location: { type: 'table' }
  }));

  const newPlayers = state.players.map(p => {
    if (p.id !== playerId) return p;
    return Object.assign({}, p, { hand: newHand.concat(captured) });
  });

  return {
    ok: true,
    state: Object.assign({}, state, {
      table: foursOnTable,
      lastPlayer: playerId,
      passedPlayers: [],
      passCount: 0,
      players: newPlayers
    })
  };
}

module.exports = {
  canCapture: canCapture,
  executeCapture: executeCapture
};
