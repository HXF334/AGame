// src/push-wind.js — §9 推风
// 严格按 SKILL.md §9 实现
// 触发条件: 玩家手牌全部出完后, 等当前局轮次结束时触发推风
// 推风目标: 顺时针方向最近且未出完的同阵营玩家 (次方已明)
//          或顺时针方向最近且未出完的非主A玩家 (次方未明)
// 推风效果: 改变下一次必须行动的玩家, 不是普通过牌, 不要求同牌型

// 借用 win-loss.js 的阵营判定与全空检查
const { getCamp, isAllOut } = require('./win-loss.js')
const { camps } = require('./util.js');;

// 推风核心函数
// 入参 state 必含字段: phase, mode, 主方, 抓方, 次方, 推风触发者, players
// 返回:
//   { ok: true, state, target, action: 'PUSH_WIND' } 找到目标
//   { ok: true, state, ended: true, winner, action: 'PUSH_WIND_END' } 立即结算
//   { ok: false, error: { type, message }, state } 错误
function pushWind(state) {
  // 1. 阶段校验
  if (!state || state.phase !== 'PLAY') {
    return {
      ok: false,
      error: { type: 'INVALID_PHASE', message: 'push wind only in PLAY phase' },
      state: state
    };
  }

  // 2. 触发者校验
  var trigger = state.推风触发者;
  if (!trigger) {
    return {
      ok: false,
      error: { type: 'NO_TRIGGER', message: 'no push-wind trigger set' },
      state: state
    };
  }
  var triggerPlayer = state.players.find(function (p) { return p.id === trigger; });
  if (!triggerPlayer) {
    return {
      ok: false,
      error: { type: 'PLAYER_NOT_FOUND', message: 'trigger player not found' },
      state: state
    };
  }
  if (triggerPlayer.hand.length > 0) {
    return {
      ok: false,
      error: { type: 'TRIGGER_NOT_OUT', message: 'trigger player still has cards' },
      state: state
    };
  }

  // 3. 阵营全空检查 (系统按真实阵营判定)
  // [B2 修正] 同 A: 从 主A.establishedBy + 次方 实时推导
  var ALL_IDS = ['A', 'B', 'C', 'D', 'E'];
  // [A refactor] camps(state) 内部已处理双路径 (主A 与次方 → 主方 与 抓方), 无需在这里重复
  var C = camps(state);
  var 主方Arr = C.main;
  var 抓方Arr = C.takers;

  if (isAllOut(state, 主方Arr)) {
    // 1V4 模式: 主方全空 = 独打者先出完 → 主方胜 (10.2/10.3 rule 1)
    // 2V3 模式: 主方全空 → 抓方胜 (10.4)
    var winner = (state.mode === '1V4_明打' || state.mode === '1V4_暗打') ? '主方' : '抓方';
    var reason = (state.mode === '1V4_明打' || state.mode === '1V4_暗打')
      ? '1V4_独打者先出完'
      : '2V3_主方全空';
    return {
      ok: true,
      state: state,
      ended: true,
      winner: winner,
      reason: reason,
      action: 'PUSH_WIND_END'
    };
  }
  if (isAllOut(state, 抓方Arr)) {
    // 1V4 模式: 抓方全空 + 独打者还在 = 抓方胜 (10.3 rule 2)
    // 2V3 模式: 抓方全空 = 主方胜 (10.4)
    var winner2 = (state.mode === '1V4_明打' || state.mode === '1V4_暗打') ? '抓方' : '主方';
    var reason2 = (state.mode === '1V4_明打' || state.mode === '1V4_暗打')
      ? '1V4_抓方全空_独打者仍在'
      : '2V3_抓方全空';
    return {
      ok: true,
      state: state,
      ended: true,
      winner: winner2,
      reason: reason2,
      action: 'PUSH_WIND_END'
    };
  }

  // 4. 寻找目标
  var order = state.players.map(function (p) { return p.id; });
  var triggerIdx = order.indexOf(trigger);
  var target = null;

  // [修复 P1] SKILL §9 分支依据是"次方身份是否已明确", 即 state.次方公开 === true。
  //   不能用 mode 判断: §4.5 / §7.3 规定次方打出大A公开身份后 mode 仍保持 2V3_暗打
  //   (只影响 §11 计分倍率, 不改 mode)。
  //   故 2V3_暗打 + 次方公开 也必须走同阵营分支，否则会推给不同阵营的玩家。
  var 次方明确 = (state.次方公开 === true) || (state.mode === '2V3_明打');
  if (次方明确) {
    for (var i = 1; i <= order.length; i++) {
      var idx = (triggerIdx + i) % order.length;
      var pid = order[idx];
      var p = state.players.find(function (x) { return x.id === pid; });
      if (!p) continue;
      if (p.hand.length === 0) continue;             // 跳过已出完
      if (getCamp(state, pid) !== getCamp(state, trigger)) continue;  // 跳过不同阵营
      target = pid;
      break;
    }
  } else {
    // §9.4: 次方身份未明确, 顺时针顺序搜寻目标, 只跳过主A (不跳次A)
    var 主AId2 = (state.主方 && state.主方[0]) || null;
    for (var j = 1; j <= order.length; j++) {
      var idx2 = (triggerIdx + j) % order.length;
      var pid2 = order[idx2];
      var p2 = state.players.find(function (x) { return x.id === pid2; });
      if (!p2) continue;
      if (p2.hand.length === 0) continue;            // 跳过已出完
      if (pid2 === 主AId2) continue;                 // 只跳过主A, 不跳次A
      target = pid2;
      break;
    }
  }

  if (!target) {
    return {
      ok: false,
      error: { type: 'NO_TARGET', message: 'no valid push-wind target' },
      state: state
    };
  }

  // 5. 构造新 state
  var newState = Object.assign({}, state, {
    currentPlayer: target,
    推风触发者: null
  });

  return {
    ok: true,
    state: newState,
    target: target,
    action: 'PUSH_WIND'
  };
}

module.exports = {
  pushWind: pushWind
};
