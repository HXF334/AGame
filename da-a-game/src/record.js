// src/record.js
// [2026-11-16 P3] 战绩记录：把一局结束时的**公开信息**整理成可上报的纯数据。
//   约束：不包含任何人的手牌/底牌；只含阵营、得分、模式、胜负原因等公开信息。
var SCHEMA_VERSION = 1;

function campsOf(state) {
  var main = [], takers = [];
  try {
    var util = require('./util.js');
    var c = util.camps(state) || {};
    main = (c.main || []).slice();
    takers = (c.takers || []).slice();
  } catch (e) { /* 数据不全时留空 */ }
  return { main: main, takers: takers };
}

function buildRecord(state, view, extra) {
  extra = extra || {};
  var res = (view && view.res) || { winner: 'draw', reason: '' };
  var scores = (view && view.scores) || {};
  var camps = campsOf(state);
  var players = (state && state.players || []).map(function (p) {
    var camp = camps.main.indexOf(p.id) >= 0 ? 'main' : (camps.takers.indexOf(p.id) >= 0 ? 'taker' : 'unknown');
    return {
      id: p.id,
      name: p.name || p.id,
      camp: camp,
      score: scores[p.id] || 0
    };
  });
  var total = players.reduce(function (s, p) { return s + p.score; }, 0);
  var mainA = (state && state['主A']) || null;
  var plays = (state && state.plays) || [];
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: (state && state.mode) || '',
    winner: res.winner || 'draw',
    reason: res.reason || '',
    mainSuit: mainA ? mainA.suit : null,
    mainBy: mainA ? mainA.establishedBy : null,
    firstOut: (state && state['头名']) || null,
    // [2026-11-16 战绩页] 记录本局真人座位，历史列表据此显示「我这局得分」
    humanId: (view && view.humanId) || null,
    players: players,
    totalScore: total,
    playsCount: plays.length,
    createdAt: new Date().toISOString()
  };
}

module.exports = { SCHEMA_VERSION: SCHEMA_VERSION, buildRecord: buildRecord };
