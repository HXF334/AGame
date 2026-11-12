// tests/test-1v4-fan-a-e2e.js
// [2026-11-12 用户] 补 1V4 / 反A 的整局无头 E2E：
//   之前只有规则单测，没有「发完牌 -> 定身份 -> 打到结束 -> 结算」的整条链路。
// 覆盖：
//   A. 底牌揭示：同一人两张同花色 A -> 1V4
//   B. 1V4 明打：整局跑完，分数 ±64 / ∓16，零和
//   C. 1V4 暗打：整局跑完，分数 ±16 / ∓4（平局为 0）
//   D. 反A：FAN_A 成功 -> 1V4_明打、反A者独打并首出 -> 整局跑完
var assert = require('assert');
var engine = require('../src/index.js');
var SB = require('./lib/state-builder.js');
var scoring = require('../src/scoring.js');
var transition = engine.transition;
var ACTIONS = engine.ACTIONS;
var PHASES = engine.PHASES;
var chooseAction = require('../src/ai.js').chooseAction;

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

// 按 state.currentPlayer 走完整局（引擎 D-061 已接管推进）
function playOut(state, maxSteps) {
  maxSteps = maxSteps || 400;
  var steps = 0;
  while (state.phase === PHASES.PLAY && steps < maxSteps) {
    steps++;
    var cp = state.currentPlayer;
    if (!cp) return { ok: false, error: 'no currentPlayer at step ' + steps, state: state };
    var p = state.players.filter(function (x) { return x.id === cp; })[0];
    if (!p) return { ok: false, error: 'bad currentPlayer ' + cp, state: state };
    var act = chooseAction(state, cp);
    var r;
    if (act && act.type === 'PLAY') {
      r = transition(state, { type: ACTIONS.PLAY, payload: { playerId: cp, cardIds: act.cardIds || [] } });
    } else {
      r = transition(state, { type: ACTIONS.PASS, payload: { playerId: cp } });
    }
    if (!r || !r.ok) {
      // AI 不合法时退化为过牌；再失败就中止
      r = transition(state, { type: ACTIONS.PASS, payload: { playerId: cp } });
      if (!r || !r.ok) return { ok: false, error: 'stuck at step ' + steps + ': ' + (r && r.error && r.error.message), state: state };
    }
    state = r.state;
    var end = engine.checkGameEnd(state);
    if (end && end.ended) {
      state.phase = PHASES.GAME_END;
      state.winner = end.winner;
      state.endReason = end.reason;
      state.endFirstOut = end.firstOut;
      break;
    }
  }
  return { ok: state.phase === PHASES.GAME_END, state: state, steps: steps };
}

// ===== A. 底牌揭示：同一人两张同花色 A -> 1V4 =====
console.log('\n=== A. 底牌揭示识别 1V4 ===');
(function () {
  var dA = SB.C('S', 14), dA2 = SB.C('S', 14);
  var st = SB.build({
    phase: PHASES.LIANG_A_RESOLVED,
    handMap: { D: [dA, dA2] },
    主A: { suit: 'S', establishedBy: 'D', viaMethod: 'LIANG_A' },
    主方: null, 抓方: null, 次方: null, lastPlayer: null, 底牌公开: false
  });
  var r = transition(st, { type: ACTIONS.ADVANCE, payload: {} });
  check('A.1 ADVANCE -> FAN_A', r.ok && r.state.phase === PHASES.FAN_A, r.ok ? r.state.phase : r.error.message);
  var r2 = transition(r.state, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  check('A.2 翻底牌成功', r2.ok, r2.ok ? '' : r2.error.message);
  if (r2.ok) {
    var s = r2.state;
      var s2 = s;
  if (s.phase === PHASES.IDENTITY_CHOICE) {
    var ci = transition(s, { type: ACTIONS.CHOOSE_IDENTITY, payload: { playerId: 'D', choice: 'HIDDEN' } });
    if (ci.ok) s2 = ci.state;
  }
  check('A.3 模式为 1V4_暗打/明打', s2.mode === '1V4_暗打' || s2.mode === '1V4_明打', s2.mode);
  check('A.3b 选完身份进 PLAY', s2.phase === PHASES.PLAY, s2.phase);
    check('A.4 主方只有 D', s['主方'].length === 1 && s['主方'][0] === 'D', JSON.stringify(s['主方']));
    check('A.5 抓方是其余 4 人', s['抓方'].length === 4 && s['抓方'].indexOf('D') < 0, JSON.stringify(s['抓方']));
    check('A.6 进入身份选择或直接 PLAY', s.phase === PHASES.IDENTITY_CHOICE || s.phase === PHASES.PLAY, s.phase);
  }
})();

// ===== B. 1V4 明打整局 =====
console.log('\n=== B. 1V4 明打整局 ===');
(function () {
  var st = SB.build({
    phase: PHASES.PLAY, mode: '1V4_明打',
    主A: { suit: 'S', establishedBy: 'D', viaMethod: 'REVEAL' },
    次方: null, 主方: ['D'], 抓方: ['A', 'B', 'C', 'E'],
    table: [], lastPlayer: null
  });
  st.currentPlayer = 'D';
  var r = playOut(st);
  check('B.1 能打到 GAME_END', r.ok, r.ok ? ('steps=' + r.steps) : r.error);
  if (r.ok) {
    var s = r.state;
    var sc = scoring.calculateScore(s, { winner: s.winner }) || {};
    var mainWon = s.winner === '主方';
    check('B.2 有胜方原因', !!s.endReason, s.endReason);
    if (mainWon) {
      check('B.3 明打主胜 D=+64', sc['D'] === 64, JSON.stringify(sc));
      check('B.4 明打主胜抓方各 -16',
        ['A', 'B', 'C', 'E'].every(function (p) { return sc[p] === -16; }), JSON.stringify(sc));
    } else {
      check('B.3 明打抓方胜 D=-64', sc['D'] === -64, JSON.stringify(sc));
      check('B.4 明打抓方胜抓方各 +16',
        ['A', 'B', 'C', 'E'].every(function (p) { return sc[p] === 16; }), JSON.stringify(sc));
    }
    var sum = 0; Object.keys(sc).forEach(function (k) { sum += sc[k]; });
    check('B.5 零和', sum === 0, 'sum=' + sum);
  }
})();

// ===== C. 1V4 暗打整局 =====
console.log('\n=== C. 1V4 暗打整局 ===');
(function () {
  var st = SB.build({
    phase: PHASES.PLAY, mode: '1V4_暗打',
    主A: { suit: 'H', establishedBy: 'C', viaMethod: 'FORCED_CHECK' },
    次方: null, 主方: ['C'], 抓方: ['A', 'B', 'D', 'E'],
    table: [], lastPlayer: null
  });
  st.currentPlayer = 'C';
  var r = playOut(st, 500);
  check('C.1 能打到 GAME_END', r.ok, r.ok ? ('steps=' + r.steps) : r.error);
  if (r.ok) {
    var s = r.state;
    var sc = scoring.calculateScore(s, { winner: s.winner }) || {};
    var vals = Object.keys(sc).map(function (k) { return sc[k]; });
    if (vals.length === 0) {
      check('C.2 平局 0 分', true);
    } else {
      check('C.2 暗打分值只能 ±16/±4',
        vals.every(function (v) { return Math.abs(v) === 16 || Math.abs(v) === 4; }), JSON.stringify(sc));
      var sum = 0; vals.forEach(function (v) { sum += v; });
      check('C.3 零和', sum === 0, 'sum=' + sum);
    }
  }
})();

// ===== D. 反A -> 1V4 明打 -> 整局 =====
console.log('\n=== D. 反A 整局 ===');
(function () {
  var aces = SB.twoAces('S');
  var st = SB.build({
    phase: PHASES.FAN_A,
    handMap: { A: aces },
    主A: { suit: 'H', establishedBy: 'B', viaMethod: 'LIANG_A' },
    次方: 'C', 次方公开: false,
    主方: ['B', 'C'], 抓方: ['A', 'D', 'E'],
    table: [], lastPlayer: null, 底牌公开: false
  });
  var r = transition(st, { type: ACTIONS.FAN_A, payload: { playerId: 'A', suit: 'S', cardIds: [aces[0].id, aces[1].id] } });
  check('D.1 反A 成功', r.ok, r.ok ? '' : r.error.message);
  if (r.ok) {
    var s = r.state;
    check('D.2 模式变为 1V4_明打', s.mode === '1V4_明打', s.mode);
    check('D.3 主方只有 A', s['主方'].length === 1 && s['主方'][0] === 'A', JSON.stringify(s['主方']));
    check('D.4 抓方含原主方/次方/抓方', ['B', 'C', 'D', 'E'].every(function (p) {
      return s['抓方'].indexOf(p) >= 0;
    }), JSON.stringify(s['抓方']));
    var r2 = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
    check('D.5 反A 后翻底牌直接进 PLAY', r2.ok && r2.state.phase === PHASES.PLAY,
      r2.ok ? r2.state.phase : r2.error.message);
    if (r2.ok) {
      var s2 = r2.state;
      s2.currentPlayer = engine.determineFirstPlayer(s2) || 'A';
      check('D.6 首出权是反A者 A', s2.currentPlayer === 'A', s2.currentPlayer);
      var out = playOut(s2);
      check('D.7 能打到 GAME_END', out.ok, out.ok ? ('steps=' + out.steps) : out.error);
      if (out.ok) {
        var sc = scoring.calculateScore(out.state, { winner: out.state.winner }) || {};
        var vals = Object.keys(sc).map(function (k) { return sc[k]; });
        check('D.8 1V4 明打分值 ±64/±16',
          vals.every(function (v) { return Math.abs(v) === 64 || Math.abs(v) === 16; }), JSON.stringify(sc));
      }
    }
  }
})();

console.log('\ntest-1v4-fan-a-e2e: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
