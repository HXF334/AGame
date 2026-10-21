// src/index.js — 规则引擎统一出口
// 第一阶段：牌组 + 发牌
// 第二阶段：阶段枚举 + 状态机（亮A + 强制排查）
// 后续阶段：反A、身份选择、首轮出牌权、牌型识别（§6 第一批）

module.exports = {
  ...require('./card.js'),
  ...require('./deal.js'),
  ...require('./phases.js'),
  ...require('./transition.js'),
  ...require('./hand-types.js'),
  // C-4 v3: 出牌/过牌 + 推风
  handlePlay: require('./play.js').handlePlay,
  handlePass: require('./play.js').handlePass,
  isRoundOver: require('./play.js').isRoundOver,
  pushWind: require('./push-wind.js').pushWind,
  // C-4 v5: 胜负判定 (统一从 index.js 取, 避免 game.js 直接 require 子模块)
  checkGameEnd: require('./win-loss.js').checkGameEnd
};
