// tests/test-edge-cases.js — E: 游戏边界场景集成测试
// 跑法: node tests/test-edge-cases.js
const assert = require('assert');
const { createNormalCard, createBigJoker, createSmallJoker, createDeck } = require('../src/card.js');
const { dealGame } = require('../src/deal.js');
const { transition, PHASES, ACTIONS, checkGameEnd } = require('../src/index.js');
const { chooseAction } = require('../src/ai.js');

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  FAIL  ' + name + '\n        ' + (e && e.message)); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function C(s, r) { return createNormalCard(s, r); }
function BJ() { return createBigJoker(); }
function SJ() { return createSmallJoker(); }
function mk(id, hand) { return { id: id, hand: hand, 底牌: null }; }

function mkState(mode, players, extra) {
  const s = {
    phase: PHASES.PLAY, mode: mode,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null, 次方: null,
    lastPlayer: null, passedPlayers: [], passCount: 0,
    头名: null, 推风触发者: null, 次方公开: true, 底牌公开: true,
    table: [], discarded: [],
    startPlayerIndex: 0, deck: [], dealOrder: [], actions: [],
    players: players
  };
  return Object.assign(s, extra || {});
}

function nextPlayer(state, cur) {
  const order = ['A', 'B', 'C', 'D', 'E'];
  const i = order.indexOf(cur);
  for (let k = 1; k <= 5; k++) {
    const n = order[(i + k) % 5];
    const p = state.players.find(function (x) { return x.id === n; });
    if (p && p.hand.length > 0) return n;
  }
  return cur;
}

section('E.1 牌张守恒: 完整对局全程 108 张');

test('E.1.1 完整对局跑完后, hand+底牌+table+discarded = 108', function () {
  for (let seed = 0; seed < 10; seed++) {
    const deck = createDeck();
    const dealt = dealGame(deck);
    let state = { phase: PHASES.GAME_START, players: dealt.players, deck: deck, dealOrder: dealt.dealOrder };
    let r = transition(state, { type: ACTIONS.START_GAME, payload: { startPlayerIndex: seed % 5 } });
    if (!r.ok) continue;
    r = transition(r.state, { type: ACTIONS.FORCED_CHECK, payload: {} });
    if (!r.ok) continue;
    r = transition(r.state, { type: ACTIONS.ADVANCE, payload: {} });
    if (!r.ok) continue;
    r = transition(r.state, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
    if (!r.ok) continue;
    state = r.state;
    if (state.phase === PHASES.IDENTITY_CHOICE) {
      const chooser = state.次方 || (state.主A && state.主A.establishedBy);
      r = transition(state, { type: ACTIONS.CHOOSE_IDENTITY, payload: { playerId: chooser, choice: 'HIDDEN' } });
      if (r.ok) state = r.state;
    }
    if (state.phase !== PHASES.PLAY) continue;

    let cp = state.主A.establishedBy;
    for (let step = 0; step < 200 && state.phase === PHASES.PLAY; step++) {
      const act = chooseAction(state, cp);
      if (!act || !act.type) break;
      let ar = act.type === 'PLAY'
        ? transition(state, { type: ACTIONS.PLAY, payload: { playerId: cp, cardIds: act.cardIds } })
        : transition(state, { type: ACTIONS.PASS, payload: { playerId: cp } });
      if (!ar || !ar.ok) {
        ar = transition(state, { type: ACTIONS.PASS, payload: { playerId: cp } });
        if (!ar || !ar.ok) break;
        state = ar.state;
      } else state = ar.state;
      const end = checkGameEnd(state);
      if (end.ended) break;
      cp = nextPlayer(state, cp);
    }
    let total = 0;
    state.players.forEach(function (p) { total += p.hand.length; if (p.底牌) total += 1; });
    total += (state.table || []).length + (state.discarded || []).length;
    assert.strictEqual(total, 108, 'seed ' + seed + ' 牌张数应为 108, 实际 ' + total);
  }
});

section('E.2 多个玩家同时出完');

test('E.2.1 2V3 主方两人同时空 + 头名在主方 → 主方胜', function () {
  const s = mkState('2V3_明打', [
    mk('A', []), mk('B', []), mk('C', [C('D', 5)]), mk('D', []), mk('E', [C('D', 6)])
  ], { 次方: 'B', 头名: 'A' });
  const r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '主方');
});

test('E.2.2 2V3 抓方三人同时空 + 头名在抓方 → 抓方胜', function () {
  const s = mkState('2V3_暗打', [
    mk('A', [C('D', 5)]), mk('B', [C('D', 6)]), mk('C', []), mk('D', []), mk('E', [])
  ], { 次方: 'B', 头名: 'C' });
  const r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '抓方');
});

section('E.3 最后一个出完决定胜负');

test('E.3.1 1V4 明打 独打者最后出完 (头名是抓方) → 抓方胜', function () {
  const s = mkState('1V4_明打', [
    mk('A', [C('D', 5)]), mk('B', []), mk('C', [C('D', 6)]), mk('D', [C('D', 7)]), mk('E', [C('D', 8)])
  ], { 头名: 'B' });
  const r = checkGameEnd(s);
  assert.strictEqual(r.ended, true, '1V4 明打第一个人出完即结束');
  assert.strictEqual(r.winner, '抓方', '头名 B 在抓方 → 抓方胜');
});

test('E.3.2 1V4 明打 全员都出完 → 仍按头名判', function () {
  const s = mkState('1V4_明打', [
    mk('A', []), mk('B', []), mk('C', []), mk('D', []), mk('E', [])
  ], { 头名: 'A' });
  const r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '主方', '头名 A (独打者) → 主方胜');
});

section('E.4 mode 缺失 / 未知 mode');

test('E.4.1 mode = null → 不结束', function () {
  const s = mkState(null, [mk('A', []), mk('B', []), mk('C', [C('D', 5)]), mk('D', [C('D', 6)]), mk('E', [C('D', 7)])], { 头名: 'A' });
  const r = checkGameEnd(s);
  assert.strictEqual(r.ended, false, 'mode 未定时不该结束');
});

test('E.4.2 mode = 未知字符串 → 不结束', function () {
  const s = mkState('WEIRD_MODE', [mk('A', []), mk('B', []), mk('C', []), mk('D', []), mk('E', [])], { 头名: 'A' });
  const r = checkGameEnd(s);
  assert.strictEqual(r.ended, false, '未知 mode 不该结束');
});

section('E.5 state.主方/抓方 字段丢失时仍能正确判定');

test('E.5.1 2V3 无 state.主方/抓方 但主A+次方 齐全 → 正确判定', function () {
  // 模拟 transition 丢字段场景; 头名='B' (次方, 在主方阵营)
  const s = mkState('2V3_暗打', [
    mk('A', []), mk('B', []), mk('C', [C('D', 5)]), mk('D', []), mk('E', [C('D', 6)])
  ], { 次方: 'B', 头名: 'B' });
  delete s.主方; delete s.抓方;
  const r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '主方', '主方 A+B 全空 + 头名 B (次方) 在主方 → 主方胜');
});

test('E.5.2 无 state.主方/抓方, 抓方全空 → 抓方胜', function () {
  // 抓方 = C/D/E, 全空; 头名 C 在抓方 → 抓方胜
  const s = mkState('2V3_明打', [
    mk('A', [C('D', 5)]), mk('B', [C('D', 6)]), mk('C', []), mk('D', []), mk('E', [])
  ], { 次方: 'B', 头名: 'C' });
  delete s.主方; delete s.抓方;
  const r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '抓方', '抓方 C/D/E 全空 + 头名 C 在抓方 → 抓方胜');
});

section('E.6 主A 未确定');

test('E.6.1 主A = null → 不结束 (无阵营信息)', function () {
  const s = mkState('2V3_明打', [mk('A', []), mk('B', []), mk('C', []), mk('D', []), mk('E', [])], { 主A: null, 头名: 'A' });
  const r = checkGameEnd(s);
  assert.strictEqual(r.ended, false, '主A 未确定不该结束');
});

section('E.7 反A 后的阵营');

test('E.7.1 反A 后 mode=1V4_明打, 反A 者先出完 → 主方胜', function () {
  const s = mkState('1V4_明打', [
    mk('A', []), mk('B', [C('D', 5)]), mk('C', [C('D', 6)]), mk('D', [C('D', 7)]), mk('E', [C('D', 8)])
  ], { 主A: { suit: 'S', establishedBy: 'A', viaMethod: 'FAN_A' }, 反A: { by: 'A' }, 头名: 'A' });
  const r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '主方');
});

test('E.7.2 反A 后抓方先出完 → 抓方胜', function () {
  const s = mkState('1V4_明打', [
    mk('A', [C('D', 5)]), mk('B', []), mk('C', [C('D', 6)]), mk('D', [C('D', 7)]), mk('E', [C('D', 8)])
  ], { 主A: { suit: 'S', establishedBy: 'A', viaMethod: 'FAN_A' }, 反A: { by: 'A' }, 头名: 'B' });
  const r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '抓方');
});

section('E.8 AI 在极端牌局不崩');

test('E.8.1 AI 手牌全是大牌 (无安全牌) 也能行动', function () {
  const s = mkState('2V3_暗打', [
    mk('A', [C('H', 14)]), mk('B', [BJ(), SJ(), C('H', 3), C('D', 2)]), mk('C', [C('S', 5)]), mk('D', [C('C', 6)]), mk('E', [C('S', 7)])
  ]);
  const a = chooseAction(s, 'B');
  assert.ok(['PLAY', 'PASS'].indexOf(a.type) >= 0, '应返回有效 action, got ' + JSON.stringify(a));
});

test('E.8.2 AI 手牌全是 4 → 尝试 capture 或 PASS', function () {
  const s = mkState('2V3_暗打', [
    mk('A', [C('H', 14)]), mk('B', [C('D', 4), C('C', 4)]), mk('C', [C('S', 5)]), mk('D', [C('S', 6)]), mk('E', [C('S', 7)])
  ]);
  const a = chooseAction(s, 'B');
  assert.ok(['PLAY', 'PASS'].indexOf(a.type) >= 0, '全 4 也应返回有效 action');
});

test('E.8.3 AI 在 IDENTITY_CHOICE 且手牌空 → 仍返回 CHOOSE_IDENTITY', function () {
  const s = mkState('2V3_明打', [mk('A', []), mk('B', []), mk('C', []), mk('D', []), mk('E', [])], { phase: PHASES.IDENTITY_CHOICE });
  const a = chooseAction(s, 'B');
  assert.strictEqual(a.type, 'CHOOSE_IDENTITY', 'IDENTITY_CHOICE 优先于手牌空判断');
});

console.log('\n=== 总结 ===');
console.log('total: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed > 0 ? 1 : 0);
