// src/win-loss.js — §10 胜负判定
// 严格按 SKILL.md §10 实现

// 判断玩家属于哪个阵营
//   主方 (含次方) 或 抓方
// [A 因量] 阵营判定的唯一真相源 = 主A.establishedBy (主方) + 次方 (主方)
// 注: state.主方/抓方 在 transition 过程中会丢失, 不可用
function getCamp(state, playerId) {
  if (!state || typeof state !== 'object' || !playerId) return null;
  var _mainA = state.主A && state.主A.establishedBy ? state.主A.establishedBy : null;
  var _ciFang = state.次方 || null;
  // 主路径: 主A 已确定 → 唯一真相源 (transition 不会丢它)
  if (_mainA) {
    if (playerId === _mainA || playerId === _ciFang) return '主方';
    return '抓方';
  }
  // 回退路径: 无 主A (测试构造 / 早期阶段) → 用 state.主方/抓方
  var _zf = state.主方 || [];
  if (_zf.indexOf(playerId) >= 0) return '主方';
  if (_ciFang && playerId === _ciFang) return '主方';
  var _gf = state.抓方 || [];
  if (_gf.indexOf(playerId) >= 0) return '抓方';
  return null;
}

function getCampLegacy(state, playerId) {
  if (!playerId) return null;
  if (state.主方 && state.主方.indexOf(playerId) >= 0) return '主方';
  if (state.次方 === playerId) return '主方';
  if (state.抓方 && state.抓方.indexOf(playerId) >= 0) return '抓方';
  return null;
}

// 判断一组玩家是否全部出完手牌
function isAllOut(state, players) {
  if (!players || players.length === 0) return false;
  return players.every(function (pid) {
    var p = state.players.find(function (x) { return x.id === pid; });
    return p && p.hand.length === 0;
  });
}

// 找出第一个出完牌的玩家
function getFirstOutPlayer(state) {
  if (!state.players) return null;
  for (var i = 0; i < state.players.length; i++) {
    if (state.players[i].hand.length === 0) return state.players[i].id;
  }
  return null;
}

// 判定游戏是否结束及胜负
// 返回 { ended: bool, winner: '主方' | '抓方' | 'draw', reason: string }
function checkGameEnd(state) {
  if (!state || !state.players) return { ended: false };

  var mode = state.mode;
  // [A 因量] 主方/抓方 字段会在 transition 中丢失 (只有 handleRevealBottom 设了), 不能依赖 state.主方/抓方
  // 改为从 主A.establishedBy + 次方 实时推导 (单一真相源 = 次方/主A)
  var ALL_IDS = ['A', 'B', 'C', 'D', 'E'];
  var _mainA = state.主A && state.主A.establishedBy ? state.主A.establishedBy : null;
  // [E 修正] 主A 未确定 = 无阵营信息, 不能判定胜负 (会误报抓方全空)
  var _ciFang = state.次方 || null;
  var 主方Arr, 抓方Arr;
  if (_mainA) {
    主方Arr = [_mainA];
    if (_ciFang && 主方Arr.indexOf(_ciFang) < 0) 主方Arr.push(_ciFang);
    抓方Arr = ALL_IDS.filter(function (i) { return 主方Arr.indexOf(i) < 0; });
  } else if ((state.主方 || []).length > 0) {
    主方Arr = (state.主方 || []).slice();
    if (_ciFang && 主方Arr.indexOf(_ciFang) < 0) 主方Arr.push(_ciFang);
    抓方Arr = (state.抓方 || []).slice();
  } else {
    return { ended: false, reason: '主A未确定' };
  }

  if (mode === '1V4_明打') {
    // §10.2: 先出完牌即结束, 先出完者所在阵营获胜
    // [C-4 v5] 优先用 state.头名 (按时间顺序), fallback 到 firstOut / getFirstOutPlayer
    var firstOut = state.头名 || state.firstOut || getFirstOutPlayer(state);
    if (firstOut) {
      return {
        ended: true,
        winner: getCamp(state, firstOut),
        reason: '1V4_明打_先出完',
        firstOut: firstOut
      };
    }
    return { ended: false };
  }

  if (mode === '1V4_暗打') {
    // §10.3: 三种情况
    // [C-4 v5] 优先用 state.头名 (按时间顺序)
    var firstOut = state.头名 || state.firstOut || getFirstOutPlayer(state);
    if (!firstOut) return { ended: false };

    // [B2 修正] 独打者不能用 state.主方[0] (该字段在 transition 中丢失)
    var 独打者 = _mainA || (state.主方 && state.主方[0]) || null;
    var 独打Out = false;
    if (独打者) {
      var p = state.players.find(function (x) { return x.id === 独打者; });
      if (p && p.hand.length === 0) 独打Out = true;
    }

    // 抓方是否全部出完
    var 抓方AllOut = isAllOut(state, 抓方Arr);

    if (独打Out) {
      // 独打者已出完
      if (firstOut === 独打者) {
        // 独打者先出完 → 独打者胜 (§10.3 第一种)
        return { ended: true, winner: '主方', reason: '1V4_暗打_独打者先出完' };
      }
      // 抓方有人先出完 (不是独打者), 独打者也出完了, 但仍有其他抓方未出完
      // 这种情况: 抓方还没全部出完
      if (!抓方AllOut) {
        return { ended: true, winner: 'draw', reason: '1V4_暗打_抓方先出+独打后出但有抓方未出完' };
      }
      // 抓方全部出完 → 抓方胜
      return { ended: true, winner: '抓方', reason: '1V4_暗打_4抓方全出完' };
    }

    // 独打者未出完
    if (抓方AllOut) {
      return { ended: true, winner: '抓方', reason: '1V4_暗打_4抓方全出完' };
    }

    return { ended: false };
  }

  if (mode === '2V3_明打' || mode === '2V3_暗打') {
    // §10.4 + §10.1: 按通用头末规则
    // 一个阵营全部出完 → 立即结束
    // 头名 (按时间顺序) vs 末名 (结束时对方阵营仍有牌者)
    if (isAllOut(state, 主方Arr)) {
      // 主方全空: 头名在主方 → 主方胜; 头名在抓方 → 平局
      var _h1 = state.头名 || state.firstOut || getFirstOutPlayer(state);
      if (_h1 && getCamp(state, _h1) === '主方') {
        return { ended: true, winner: '主方', reason: '2V3_主方全空_头名在主方', firstOut: _h1 };
      }
      return { ended: true, winner: 'draw', reason: '2V3_主方全空_头名在抓方(平局)', firstOut: _h1 };
    }
    if (isAllOut(state, 抓方Arr)) {
      // 抓方全空: 头名在抓方 → 抓方胜; 头名在主方 → 平局
      var _h2 = state.头名 || state.firstOut || getFirstOutPlayer(state);
      if (_h2 && getCamp(state, _h2) === '抓方') {
        return { ended: true, winner: '抓方', reason: '2V3_抓方全空_头名在抓方', firstOut: _h2 };
      }
      return { ended: true, winner: 'draw', reason: '2V3_抓方全空_头名在主方(平局)', firstOut: _h2 };
    }
    return { ended: false };
  }

  // 无 mode 或未知 mode: 不结束
  return { ended: false };
}

module.exports = {
  getCamp: getCamp,
  isAllOut: isAllOut,
  getFirstOutPlayer: getFirstOutPlayer,
  checkGameEnd: checkGameEnd
};
