// src/flow.js
// [2026-11-16 P1] 流程层（第一步）：把「阶段闸门表」从 game.js 收口到这里。
//   - 纯数据 + 纯函数，不依赖 wx / DOM / 定时器；
//   - game.js 只负责按这张表跑定时器与 UI，流程顺序只在这里定义。
// 后续步骤（发牌推进、闸门自动/真人决策判定）会继续往这里搬。
var GATE_PLAN = [
  { id: 'DEAL',         label: '发牌' },
  { id: 'FORCED_CHECK', label: '强制排查' },
  { id: 'ADVANCE',      label: '进入反A阶段' },
  { id: 'REVEAL',       label: '翻开底牌' },
  { id: 'IDENTITY',     label: '次方身份选择' },
  { id: 'PLAY',         label: '正式出牌' }
];

var INDEX = {};
GATE_PLAN.forEach(function (s, i) { INDEX[s.id] = i; });

// 阶段 id -> 序号；未知返回 -1
function gateIndexOf(id) { return INDEX.hasOwnProperty(id) ? INDEX[id] : -1; }

// 序号 -> 阶段对象；越界返回 null
function stageAt(i) { return (i >= 0 && i < GATE_PLAN.length) ? GATE_PLAN[i] : null; }

// 下一个阶段对象；已是最后一档返回 null
function nextStage(id) { return stageAt(gateIndexOf(id) + 1); }

// 是否最后一档（PLAY）
function isFinalStage(id) { return gateIndexOf(id) === GATE_PLAN.length - 1; }

module.exports = {
  GATE_PLAN: GATE_PLAN,
  gateIndexOf: gateIndexOf,
  stageAt: stageAt,
  nextStage: nextStage,
  isFinalStage: isFinalStage
};
// ===== 发牌推进（P1 第二步 2026-11-16）=====
// 引擎只接受 START_GAME / DEAL_ROUND；这里把「怎么发」的细节收口成两三个调用，
// game.js 只负责定时器与 UI。
var transitionMod = require('./transition.js');

function startDeal(state) {
  return transitionMod.transition(state, { type: 'START_GAME', payload: { progressive: true } });
}

function dealRound(state) {
  return transitionMod.transition(state, { type: 'DEAL_ROUND', payload: {} });
}

function isDealing(state) {
  return !!state && state.phase === 'DEALING';
}

module.exports.startDeal = startDeal;
module.exports.dealRound = dealRound;
module.exports.isDealing = isDealing;