// tests/audit-integration.js — 自主审查: 全模式完整对局 + 牌张守恒 + 无死循环
// 覆盖 SKILL §13.20 (随机完整对局) + §13.19 (结算只一次) + §10 (胜负) + §11 (计分)
var engine = require('../src/index.js');
var { transition, determineFirstPlayer } = require('../src/transition.js');
var { ACTIONS, PHASES } = require('../src/phases.js');
var { chooseAction } = require('../src/ai.js');
var { checkGameEnd, camps } = require('../src/win-loss.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// ---------- 牌张守恒 ----------
function countCards(state) {
  var total = 0;
  state.players.forEach(function (p) {
    total += (p.hand ? p.hand.length : 0);
    if (p.底牌) total += 1;
  });
  total += (state.table || []).length;
  total += (state.discarded || []).length;
  return total;
}

function allCardIds(state) {
  var ids = {};
  state.players.forEach(function (p) {
    (p.hand || []).forEach(function (c) { ids[c.id] = (ids[c.id] || 0) + 1; });
    if (p.底牌) ids[p.底牌.id] = (ids[p.底牌.id] || 0) + 1;
  });
  (state.table || []).forEach(function (c) { ids[c.id] = (ids[c.id] || 0) + 1; });
  (state.discarded || []).forEach(function (c) { ids[c.id] = (ids[c.id] || 0) + 1; });
  return ids;
}

// ---------- 跑一整局 ----------
function runFullGame(choice, seed) {
  var state = engine.newGameState();
  var log = [];

  function step(action) {
    var r = transition(state, action);
    if (r.ok) { state = r.state; }
    log.push(r.ok ? 'OK' : 'ERR:' + (r.error && r.error.type));
    return r;
  }

  step({ type: ACTIONS.START_GAME, payload: { startPlayerIndex: seed % 5 } });
  step({ type: ACTIONS.FORCED_CHECK, payload: {} });
  step({ type: ACTIONS.ADVANCE, payload: {} });
  step({ type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  if (state.phase === PHASES.IDENTITY_CHOICE) {
    var chooser = state['次方'] || (state['主A'] && state['主A'].establishedBy);
    step({ type: ACTIONS.CHOOSE_IDENTITY, payload: { playerId: chooser, choice: choice } });
  }

  if (state.phase !== PHASES.PLAY) {
    return { state: state, error: 'not PLAY after init: ' + state.phase, log: log };
  }

  // 检查底牌已转入手牌
  var 底牌残留 = state.players.filter(function (p) { return p.底牌 !== null && p.底牌 !== undefined; }).length;

  var guard = 0;
  var currentPlayer = determineFirstPlayer(state) || 'A';
  var endInfo = null;

  while (state.phase === PHASES.PLAY && guard++ < 800) {
    var player = state.players.find(function (p) { return p.id === currentPlayer; });

    if (!player || player.hand.length === 0) {
      // 已出完, 推风或跳过
      var pw = transition(state, { type: ACTIONS.PUSH_WIND, payload: { trigger: currentPlayer } });
      if (pw.ok) {
        state = pw.state;
        if (state.currentPlayer) { currentPlayer = state.currentPlayer; continue; }
      }
      // 推不了, 标记过牌继续
      var pr = transition(state, { type: ACTIONS.PASS, payload: { playerId: currentPlayer } });
      if (pr.ok) { state = pr.state; } else { break; }
      currentPlayer = nextPlayer(state, currentPlayer);
      continue;
    }

    var action = chooseAction(state, currentPlayer);
    if (!action) {
      var pr2 = transition(state, { type: ACTIONS.PASS, payload: { playerId: currentPlayer } });
      if (pr2.ok) { state = pr2.state; } else { break; }
      currentPlayer = nextPlayer(state, currentPlayer);
      continue;
    }

    // 包 payload
    var wrapped = { type: action.type, payload: {} };
    if (action.playerId !== undefined) wrapped.payload.playerId = action.playerId;
    if (action.cardIds !== undefined) wrapped.payload.cardIds = action.cardIds;
    if (action.choice !== undefined) wrapped.payload.choice = action.choice;

    var r = transition(state, wrapped);
    if (r.ok) {
      state = r.state;
      var ec = checkGameEnd(state);
      if (ec.ended) { endInfo = ec; state.phase = 'GAME_END'; break; }
      currentPlayer = nextPlayer(state, currentPlayer);
    } else {
      // AI 非法动作, 强制过牌
      var fp = transition(state, { type: ACTIONS.PASS, payload: { playerId: currentPlayer } });
      if (fp.ok) { state = fp.state; currentPlayer = nextPlayer(state, currentPlayer); }
      else {
        // 推风目标不能过牌且动作非法 -> 死局
        return { state: state, error: 'stuck: ' + currentPlayer + ' ' + (r.error && r.error.type), log: log };
      }
    }
  }

  return { state: state, endInfo: endInfo, guard: guard, 底牌残留: 底牌残留, log: log, error: null };
}

function nextPlayer(state, cur) {
  var ids = ['A', 'B', 'C', 'D', 'E'];
  var idx = ids.indexOf(cur);
  for (var i = 1; i <= 5; i++) {
    var nx = ids[(idx + i) % 5];
    var p = state.players.find(function (x) { return x.id === nx; });
    if (p && p.hand.length > 0) return nx;
  }
  return cur;
}

// ================= 开始 =================
section('1. 全模式完整对局 (20 局 x 4 模式)');

var modes = ['HIDDEN', 'PUBLIC'];
var gamesRun = 0;
var gameErrors = [];

modes.forEach(function (choice) {
  for (var seed = 0; seed < 20; seed++) {
    gamesRun++;
    var res;
    try { res = runFullGame(choice, seed); }
    catch (e) { check('game ' + choice + '/' + seed + ' 抛异常', false, e.message); continue; }

    if (res.error) {
      gameErrors.push(choice + '/' + seed + ': ' + res.error);
      check('game ' + choice + '/' + seed + ' 无卡死', false, res.error);
      continue;
    }
    check('game ' + choice + '/' + seed + ' 正常结束', res.state.phase === 'GAME_END',
      'phase=' + res.state.phase + ' guard=' + res.guard);
  }
});

console.log('games run: ' + gamesRun + ', errors: ' + gameErrors.length);
if (gameErrors.length) { gameErrors.slice(0, 8).forEach(function (e) { console.log('  ! ' + e); }); }

section('2. 牌张守恒 (108 张)');

for (var s2 = 0; s2 < 12; s2++) {
  var r2 = runFullGame('HIDDEN', s2);
  if (r2.error) continue;
  var cnt = countCards(r2.state);
  check('seed ' + s2 + ' 牌张总数=108', cnt === 108, 'actual=' + cnt);
  var ids = allCardIds(r2.state);
  var dupes = Object.keys(ids).filter(function (k) { return ids[k] > 1; });
  check('seed ' + s2 + ' 无重复实体ID', dupes.length === 0, 'dupes=' + dupes.length);
  check('seed ' + s2 + ' 底牌已清空', r2.底牌残留 === 0, '残留=' + r2.底牌残留);
}

section('3. 无死循环 (guard 未爆)');

for (var s3 = 0; s3 < 12; s3++) {
  var r3 = runFullGame('PUBLIC', s3);
  if (r3.error) continue;
  check('seed ' + s3 + ' 步数合理', r3.guard < 800, 'guard=' + r3.guard);
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);