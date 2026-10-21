// src/scoring.js — SKILL §11 积分结算
// 严格按 SKILL.md §11 实现
const { camps } = require('./util.js');

// [B] SKILL §11.2 N 自动推导 (2V3 专用)
//   主方胜: N = 主方第二名出完牌时, 抓方未出完牌人数
//   主方败: 查表 (主A 是否出完, 次A 是否出完) -> {2,1,3}
//   1V4 不用 N (本身在代码里沉默为 1)
function autoDeriveN(state, winner) {
  if (!state || !state.mode || state.mode.indexOf('2V3') < 0) return 1;
  var C = camps(state);
  var 主A = state.主A && state.主A.establishedBy ? state.主A.establishedBy : C.main[0];
  var 次A = state.次方 || C.main[1];
  if (!主A || !次A) return 1;
  var 主AEmpty = false, 次AEmpty = false;
  if (Array.isArray(state.players)) {
    state.players.forEach(function (p) {
      if (p.id === 主A && p.hand.length === 0) 主AEmpty = true;
      if (p.id === 次A && p.hand.length === 0) 次AEmpty = true;
    });
  }
  if (winner === '主方') {
    // 主方胜 → 主A + 次A 都应出完; N = 抓方未出完人数
    var n = 0;
    C.takers.forEach(function (pid) {
      var p = Array.isArray(state.players) ? state.players.find(function (x) { return x.id === pid; }) : null;
      if (p && p.hand && p.hand.length > 0) n++;
    });
    return n;
  } else {
    // 主方败 → 查表
    if (!主AEmpty && 次AEmpty) return 2;   // 主A 未出完, 次A 已出完 → N=2
    if (主AEmpty && !次AEmpty) return 1;   // 主A 已出完, 次A 未出完 → N=1
    if (!主AEmpty && !次AEmpty) return 3; // 主A 未出完, 次A 未出完 → N=3
    return 1;
  }
}
//
// calculateScore(state, result, n)
//   state.mode: '1V4_明打' | '1V4_暗打' | '2V3_明打' | '2V3_暗打'
//   state.主方: [主A, ...] (1V4: 只有独打者, 2V3: [主A, 次A])
//   state.次方: playerId (2V3 only)
//   state.抓方: [playerId, ...]
//   result: { winner: '主方' | '抓方' | 'draw' }
//   n: 2V3 时 N 的取值 (主方第二名出完者出完时仍未出完的抓方人数, 默认 1)
//   平局返回 {}

function calculateScore(state, result, n) {
  if (!state || !state.mode) return {};
  const mode = state.mode;
  const r = result || {};
  const winner = r.winner;

  // [B 自动推导] SKILL §11.2: 2V3 时 n 可选, 未传则从 state 实时推导
  if (typeof n !== 'number') {
    n = autoDeriveN(state, winner);
  }

  if (mode === '1V4_明打') {
    // 1V4 明打: 倍率=4
    if (winner === '主方') {
      const changes = {};
      const C = camps(state);
      const 独打者 = C.main[0];
      if (独打者) changes[独打者] = 64;
      for (const pid of C.takers) changes[pid] = -16;
      return changes;
    }
    if (winner === '抓方') {
      const changes = {};
      const C = camps(state);
      const 独打者 = C.main[0];
      if (独打者) changes[独打者] = -64;
      for (const pid of C.takers) changes[pid] = 16;
      return changes;
    }
    return {};  // draw
  }

  if (mode === '1V4_暗打') {
    // 1V4 暗打: 倍率=2
    if (winner === '主方') {
      const changes = {};
      const C = camps(state);
      const 独打者 = C.main[0];
      if (独打者) changes[独打者] = 32;
      for (const pid of C.takers) changes[pid] = -8;
      return changes;
    }
    if (winner === '抓方') {
      const changes = {};
      const C = camps(state);
      const 独打者 = C.main[0];
      if (独打者) changes[独打者] = -32;
      for (const pid of C.takers) changes[pid] = 8;
      return changes;
    }
    return {};
  }

  if (mode === '2V3_明打' || mode === '2V3_暗打') {
    // 2V3: 倍率=2 (明打) 或 1 (暗打)
    const 倍率 = mode === '2V3_明打' ? 2 : 1;
    const N = (typeof n === 'number') ? n : 1;
    if (winner === '主方') {
      const changes = {};
      const C = camps(state);
      const 主A = C.main[0];
      const 次A = state.次方;
      if (主A) changes[主A] = 2 * N * 倍率;
      if (次A) changes[次A] = N * 倍率;
      for (const pid of C.takers) changes[pid] = -N * 倍率;
      return changes;
    }
    if (winner === '抓方') {
      const changes = {};
      const C = camps(state);
      const 主A = C.main[0];
      const 次A = state.次方;
      if (主A) changes[主A] = -2 * N * 倍率;
      if (次A) changes[次A] = -N * 倍率;
      for (const pid of C.takers) changes[pid] = N * 倍率;
      return changes;
    }
    return {};
  }

  return {};
}

module.exports = {
  calculateScore: calculateScore
};