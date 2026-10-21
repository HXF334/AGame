// src/util.js — 共享工具: camps(state) 阵营推导
//
// 用途: 替代 3 处重复实现 (win-loss.js / push-wind.js / scoring.js)
// 规则 (SKILL §4.5, §10):
//   - 2V3: 主方 = [主A 玩家, 次A 玩家] (2 个)
//   - 1V4: 主方 = [主A 玩家] (1 个, 独打者)
//   - 抓方 = 其余 3 / 4 个
//
// 推导优先级:
//   1. 主路径 = 主A.establishedBy + 次方 (transition 不会丢, 唯一真来源)
//   2. 回退 = state.主方 / state.抓方 (早期阶段 / 测试构造)
//
// 返回: { main: ['A', 'D'], takers: ['B', 'C', 'E'] }

const ALL_PLAYER_IDS = ['A', 'B', 'C', 'D', 'E'];

function camps(state) {
  if (!state || typeof state !== 'object') {
    return { main: [], takers: ALL_PLAYER_IDS.slice() };
  }

  var mainA = (state.主A && state.主A.establishedBy) || null;
  var ci = state.次方 || null;

  if (mainA) {
    var main = [mainA];
    if (ci && main.indexOf(ci) < 0) main.push(ci);
    return {
      main: main,
      takers: ALL_PLAYER_IDS.filter(function (i) { return main.indexOf(i) < 0; })
    };
  }

  // 回退: 测试构造 / 早期阶段
  var main2 = (state.主方 || []).slice();
  if (ci && main2.indexOf(ci) < 0) main2.push(ci);
  return {
    main: main2,
    takers: (state.抓方 || []).slice()
  };
}

module.exports = {
  ALL_PLAYER_IDS: ALL_PLAYER_IDS,
  camps: camps
};