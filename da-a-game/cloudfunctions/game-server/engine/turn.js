// src/turn.js — 轮次推进（D-061 2026-11-12，方案 A：引擎完全接管推进）
//
// 纯函数、CommonJS、无 wx.* 依赖。
// transition 在「出牌 / 取牌 / 过牌」成功后调用这里，把下一行动者写入
// state.currentPlayer；game.js 只负责把该值镜像到 UI 快变量。
//
// 规则：
//   - 行动者之后按座位顺序找下一个「手牌非空」的人（出完的人自动跳过）。
//   - 全员过牌清桌后，由 lastPlayer 重新领出；lastPlayer 已出完则顺延。
//   - 若场上已无人有牌（终局），保持 currentPlayer 不变，交给 checkGameEnd。
function playersOf(state) {
  return (state && Array.isArray(state.players)) ? state.players : [];
}

function isAlive(p) {
  return !!(p && Array.isArray(p.hand) && p.hand.length > 0);
}

function indexOfPlayer(players, id) {
  for (var i = 0; i < players.length; i++) {
    if (players[i].id === id) return i;
  }
  return -1;
}

function nextAliveId(state, fromId) {
  var players = playersOf(state);
  if (!players.length) return null;
  var idx = indexOfPlayer(players, fromId);
  // fromId 不在座次里时，从「第一个座位之前」开始找，等价于从 0 号开始轮询。
  for (var step = 1; step <= players.length; step++) {
    var p = players[(idx + step + players.length) % players.length];
    if (isAlive(p)) return p.id;
  }
  return null;
}

function withTurn(state, nextId) {
  if (!nextId || state.currentPlayer === nextId) return state;
  return Object.assign({}, state, { currentPlayer: nextId });
}

// 出牌 / 取牌成功后：下一位有手牌的行动者
function advanceAfterPlay(state, actorId) {
  return withTurn(state, nextAliveId(state, actorId));
}

// 过牌成功后：
//   - 桌未清空 -> 下一位有手牌者
//   - 桌已清空（全员过牌） -> lastPlayer 本人重新领出（已出完则顺延）
function advanceAfterPass(state, actorId) {
  var players = playersOf(state);
  var cleared = Array.isArray(state.table) && state.table.length === 0;
  if (cleared) {
    var lp = state.lastPlayer;
    var lpAlive = players.some(function (p) { return p.id === lp && isAlive(p); });
    return withTurn(state, lpAlive ? lp : nextAliveId(state, lp || actorId));
  }
  return withTurn(state, nextAliveId(state, actorId));
}

module.exports = { nextAliveId: nextAliveId, advanceAfterPlay: advanceAfterPlay, advanceAfterPass: advanceAfterPass };
