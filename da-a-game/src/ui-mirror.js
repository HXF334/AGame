// src/ui-mirror.js — UI 镜像派生（纯函数，无 wx.*，无 DOM）
//
// 输入：引擎出牌流水 state.plays + 少量「显示意图」阈值
// 输出：渲染层需要的 uiPlays / uiPlaysTrick / uiTrickId / uiPassed / uiTakenPlay
//
// 流水条目（由 src/play.js 写入）：
//   PLAY/CAPTURE -> { playerId, cards, kind, beat? }  有牌要显示
//   PASS         -> { playerId, kind }                显示「不出」，清掉旧牌
//   CLEAR        -> { kind }                          一轮结束，trick +1
//
// 「显示意图」：
//   hiddenAt[pid]   流水长度阈值：此前的最后一手不显示（轮到他 / 被跳过 / 推风目标）
//   passHidden[pid] 流水长度阈值：此前的 PASS 不再显示「不出」
//   passResetAt     推风后的流水起点，之前的 PASS 一并隐藏
//   handOf[pid]     当前手牌数，用于「轮末清桌时已出完的人不显示牌」

'use strict';

function project(plays, opts) {
  opts = opts || {};
  var list = plays || [];
  var hiddenAt = opts.hiddenAt || {};
  var passHidden = opts.passHidden || {};
  var passResetAt = opts.passResetAt || 0;
  var handOf = opts.handOf || {};

  var trick = 0;
  var lastClear = -1;
  var shows = {};
  var trickAt = {};
  var passed = {};
  var taken = {};
  var lastIdx = {};

  for (var i = 0; i < list.length; i++) {
    var r = list[i] || {};
    if (r.kind === 'CLEAR') {
      trick += 1;
      lastClear = i;
      continue;
    }
    if (r.kind === 'PLAY' || r.kind === 'CAPTURE') {
      lastIdx[r.playerId] = i;
      if (r.cards && r.cards.length) {
        shows[r.playerId] = r.cards;
        trickAt[r.playerId] = trick;
      } else {
        delete shows[r.playerId];
        delete trickAt[r.playerId];
      }
      delete passed[r.playerId];
      delete taken[r.playerId];
      if (r.kind === 'CAPTURE' && r.beat) taken[r.beat] = true;
    } else if (r.kind === 'PASS') {
      lastIdx[r.playerId] = i;
      delete shows[r.playerId];
      delete trickAt[r.playerId];
      var ph = passHidden[r.playerId];
      if (i >= passResetAt && (ph == null || i >= ph)) passed[r.playerId] = true;
    }
  }

  var out = {};
  var outTrick = {};
  Object.keys(shows).forEach(function (pid) {
    var idx = lastIdx[pid];
    if (hiddenAt[pid] != null && idx < hiddenAt[pid]) return;
    // 轮末清桌（CLEAR）时，已出完的人桌面牌清掉 -> 渲染层显示贡字
    if (lastClear >= 0 && idx < lastClear && handOf[pid] === 0) return;
    out[pid] = shows[pid];
    outTrick[pid] = trickAt[pid];
  });

  return {
    plays: out,
    playsTrick: outTrick,
    trick: trick,
    passed: passed,
    taken: taken
  };
}

module.exports = {
  project: project
};
