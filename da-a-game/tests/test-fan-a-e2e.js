// tests/test-fan-a-e2e.js — G: 反A 完整流程 E2E 测试
// 跑法: node tests/test-fan-a-e2e.js

const assert = require('assert');
const { createNormalCard } = require('../src/card.js');
const { transition, PHASES, ACTIONS, checkGameEnd } = require('../src/index.js');

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  FAIL  ' + name + '\n        ' + (e && e.message)); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function C(s, r) { return createNormalCard(s, r); }
function mk(id, hand) { return { id: id, hand: hand, 底牌: null }; }

// ============================================================
// G.1 反A 资格 (SKILL §4.4)
// ============================================================
section('G.1 反A 资格 (§4.4)');

test('G.1.1 反A 必须持同花色 2 张 A', function () {
  const state = {
    phase: PHASES.FAN_A,
    mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null, 次方: 'B',
    players: [
      mk('A', [C('H', 14)]),
      mk('B', [C('D', 14), C('S', 14)]),
      mk('C', []), mk('D', []), mk('E', [])
    ],
    passedPlayers: [], passCount: 0, 头名: null,
    推风触发者: null, 次方公开: false, 底牌公开: true,
    table: [], discarded: [], startPlayerIndex: 0, deck: [], dealOrder: [], actions: []
  };
  const r = transition(state, {
    type: ACTIONS.FAN_A,
    payload: { playerId: 'B', suit: 'D', cardIds: ['D-A-undefined', 'S-A-undefined'] }
  });
  assert.strictEqual(r.ok, false, '不同花色 反A 应失败');
});

test('G.1.2 反A 成功后 mode = 1V4_明打 (强制)', function () {
  const state = {
    phase: PHASES.FAN_A,
    mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null, 次方: 'B',
    players: [
      mk('A', [C('H', 14)]),
      mk('B', [C('D', 14), C('D', 14)]),
      mk('C', []), mk('D', []), mk('E', [])
    ],
    passedPlayers: [], passCount: 0, 头名: null,
    推风触发者: null, 次方公开: false, 底牌公开: true,
    table: [], discarded: [], startPlayerIndex: 0, deck: [], dealOrder: [], actions: []
  };
  const r = transition(state, {
    type: ACTIONS.FAN_A,
    payload: { playerId: 'B', suit: 'D', cardIds: ['D-A-undefined', 'D-A-undefined'] }
  });
  assert.strictEqual(r.ok, true, '反A 应成功');
  assert.strictEqual(r.state.mode, '1V4_明打', '反A 后 mode 强制 1V4_明打');
});

test('G.1.3 反A 成功后 原主A + 次A 都转抓方阵营', function () {
  const state = {
    phase: PHASES.FAN_A,
    mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null, 次方: 'B',
    players: [
      mk('A', [C('H', 14)]),
      mk('B', [C('H', 14)]),
      mk('C', [C('D', 14), C('D', 14)]),
      mk('D', []), mk('E', [])
    ],
    主方: ['A'], 抓方: ['B', 'C', 'D', 'E'],  // [G 修] 反A 测试需明确设主方/抓方 (原 2V3 状态)
    passedPlayers: [], passCount: 0, 头名: null,
    推风触发者: null, 次方公开: false, 底牌公开: true,
    table: [], discarded: [], startPlayerIndex: 0, deck: [], dealOrder: [], actions: []
  };
  const r = transition(state, {
    type: ACTIONS.FAN_A,
    payload: { playerId: 'C', suit: 'D', cardIds: ['D-A-undefined', 'D-A-undefined'] }
  });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.state.主方, ['C'], '主方应为反A 者');
  assert.deepStrictEqual(r.state.抓方.sort(), ['A', 'B', 'D', 'E'], '原主A+次A 应转抓方');
});

test('G.1.4 反A 成功后 旧主A 花色 A 大A 标志撤销 (per-card)', function () {
  const A_H14 = C('H', 14); A_H14.is主方大A = true;
  const B_H14 = C('H', 14); B_H14.is主方大A = false;
  const state = {
    phase: PHASES.FAN_A,
    mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null, 次方: 'B',
    players: [
      { id: 'A', hand: [A_H14], 底牌: null },
      { id: 'B', hand: [B_H14, C('D', 14), C('D', 14)], 底牌: null },
      { id: 'C', hand: [], 底牌: null },
      { id: 'D', hand: [], 底牌: null },
      { id: 'E', hand: [], 底牌: null }
    ],
    passedPlayers: [], passCount: 0, 头名: null,
    推风触发者: null, 次方公开: false, 底牌公开: true,
    table: [], discarded: [], startPlayerIndex: 0, deck: [], dealOrder: [], actions: []
  };
  const r = transition(state, {
    type: ACTIONS.FAN_A,
    payload: { playerId: 'B', suit: 'D', cardIds: ['D-A-undefined', 'D-A-undefined'] }
  });
  assert.strictEqual(r.ok, true);
  let found = false;
  r.state.players.forEach(function (p) {
    if (p.hand) p.hand.forEach(function (c) {
      if (c.suit === 'H' && c.rank === 14 && c.id === A_H14.id) {
        assert.strictEqual(c.is主方大A, false, '原主A HA is主方大A 应撤销');
        found = true;
      }
    });
  });
  assert.ok(found, '应找到 A 的 HA');
});

// ============================================================
// G.2 反A 后的 mode + CHOOSE_IDENTITY
// ============================================================
section('G.2 反A 后 CHOOSE_IDENTITY (§4.5)');

test('G.2.1 反A 后 phase = FAN_A_RESOLVED', function () {
  const state = {
    phase: PHASES.FAN_A,
    mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null, 次方: 'B',
    players: [
      mk('A', []), mk('B', [C('D', 14), C('D', 14)]), mk('C', []), mk('D', []), mk('E', [])
    ],
    主方: ['A'], 抓方: ['B', 'C', 'D', 'E'],  // [G 修] 显式设主方/抓方
    passedPlayers: [], passCount: 0, 头名: null,
    推风触发者: null, 次方公开: false, 底牌公开: true,
    table: [], discarded: [], startPlayerIndex: 0, deck: [], dealOrder: [], actions: []
  };
  const r1 = transition(state, {
    type: ACTIONS.FAN_A,
    payload: { playerId: 'B', suit: 'D', cardIds: ['D-A-undefined', 'D-A-undefined'] }
  });
  assert.strictEqual(r1.state.phase, PHASES.FAN_A_RESOLVED);
});

test('G.2.2 [G fix] FAN_A + REVEAL_BOTTOM -> PLAY (1V4 跳过 IDENTITY_CHOICE)', function () {
  const C2 = createNormalCard;
  const state = {
    phase: PHASES.FAN_A, mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null, 次方: 'B',
    主方: ['A'], 抓方: ['B','C','D','E'],
    players: [
      { id:'A', hand:[], 底牌:null },
      { id:'B', hand:[C2('D',14),C2('D',14)], 底牌:null },
      { id:'C', hand:[], 底牌:null },
      { id:'D', hand:[], 底牌:null },
      { id:'E', hand:[], 底牌:null }
    ],
    passedPlayers:[], passCount:0, 头名:null,
    推风触发者:null, 次方公开:false, 底牌公开:false,
    table:[], discarded:[], startPlayerIndex:0, deck:[], dealOrder:[], actions:[]
  };
  const r1 = transition(state, { type: ACTIONS.FAN_A, payload: { playerId:'B', suit:'D', cardIds:['D-A-undefined','D-A-undefined'] }});
  assert.strictEqual(r1.ok, true);
  const r2 = transition(r1.state, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r2.state.phase, PHASES.PLAY, 'REVEAL_BOTTOM 后 phase=PLAY');
  assert.strictEqual(r2.state.mode, '1V4_明打');
});
test('G.3.1 [G fix] FAN_A + REVEAL_BOTTOM -> startPlayerIndex = B (反A 者)', function () {
  const C3 = createNormalCard;
  const state = {
    phase: PHASES.FAN_A, mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null, 次方: 'B',
    主方: ['A'], 抓方: ['B','C','D','E'],
    players: [
      { id:'A', hand:[], 底牌:null },
      { id:'B', hand:[C3('D',14),C3('D',14)], 底牌:null },
      { id:'C', hand:[], 底牌:null },
      { id:'D', hand:[], 底牌:null },
      { id:'E', hand:[], 底牌:null }
    ],
    passedPlayers:[], passCount:0, 头名:null,
    推风触发者:null, 次方公开:false, 底牌公开:false,
    table:[], discarded:[], startPlayerIndex:0, deck:[], dealOrder:[], actions:[]
  };
  const r1 = transition(state, { type: ACTIONS.FAN_A, payload: { playerId:'B', suit:'D', cardIds:['D-A-undefined','D-A-undefined'] }});
  const r2 = transition(r1.state, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r2.state.startPlayerIndex, 1, 'startPlayerIndex 应为 B (反A 者) 的索引 1');
});
test('G.4.1 反A 者先出完手牌 → 主方胜 (1V4_明打 §10.2)', function () {
  const state = {
    phase: PHASES.PLAY,
    mode: '1V4_明打',
    主A: { suit: 'D', establishedBy: 'B', viaMethod: 'FAN_A' },
    反A: { by: 'B', 旧主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' } },
    次方: null,
    头名: null, 推风触发者: null, 次方公开: false, 底牌公开: true,
    table: [], discarded: [],
    startPlayerIndex: 1,
    deck: [], dealOrder: [], actions: [],
    主方: ['B'],
    抓方: ['A', 'C', 'D', 'E'],
    players: [
      mk('A', [C('S', 5), C('H', 6)]),
      mk('B', [C('D', 5)]),
      mk('C', [C('H', 7), C('S', 8)]),
      mk('D', [C('H', 9), C('C', 10)]),
      mk('E', [C('S', 11), C('D', 12)])
    ]
  };
  const r = transition(state, {
    type: ACTIONS.PLAY,
    payload: { playerId: 'B', cardIds: ['D-5-undefined'] }
  });
  assert.strictEqual(r.ok, true);
  const end = checkGameEnd(r.state);
  assert.strictEqual(end.ended, true);
  assert.strictEqual(end.winner, '主方', 'B (反A 者/主方) 先出完 → 主方胜');
});

test('G.4.2 反A 后 4 抓方先出完 → 抓方胜', function () {
  const state = {
    phase: PHASES.PLAY,
    mode: '1V4_明打',
    主A: { suit: 'D', establishedBy: 'B', viaMethod: 'FAN_A' },
    反A: { by: 'B' },
    次方: null,
    头名: 'A',
    推风触发者: null, 次方公开: false, 底牌公开: true,
    table: [], discarded: [],
    startPlayerIndex: 0,
    deck: [], dealOrder: [], actions: [],
    主方: ['B'],
    抓方: ['A', 'C', 'D', 'E'],
    players: [
      mk('A', []),
      mk('B', [C('D', 5), C('D', 6)]),
      mk('C', []), mk('D', []), mk('E', [])
    ]
  };
  const end = checkGameEnd(state);
  assert.strictEqual(end.ended, true);
  assert.strictEqual(end.winner, '抓方', '4 抓方全空 → 抓方胜');
});

test('G.4.3 反A 后 计分正确 (主方胜 +64J, 4 抓方各 -16J)', function () {
  const { calculateScore } = require('../src/scoring.js');
  const state = {
    phase: PHASES.GAME_END,
    mode: '1V4_明打',
    主A: { suit: 'D', establishedBy: 'B', viaMethod: 'FAN_A' },
    反A: { by: 'B' },
    次方: null, 头名: 'B', 推风触发者: null, 次方公开: false, 底牌公开: true,
    table: [], discarded: [],
    startPlayerIndex: 0, deck: [], dealOrder: [], actions: [],
    主方: ['B'],
    抓方: ['A', 'C', 'D', 'E'],
    players: [
      mk('A', [C('H', 5)]), mk('B', []), mk('C', [C('H', 6)]), mk('D', [C('H', 7)]), mk('E', [C('H', 8)])
    ]
  };
  const changes = calculateScore(state, { winner: '主方' });
  assert.strictEqual(changes['B'], 64, 'B (主方/反A) 应得 +64J');
  ['A', 'C', 'D', 'E'].forEach(function (p) {
    assert.strictEqual(changes[p], -16, p + ' (抓方) 应扣 -16J');
  });
});

// ============================================================
// G.5 反A 取消/失败场景
// ============================================================
section('G.5 反A 边界与失败');

test('G.5.1 反A 资格不够 (只有 1 张 A) 应失败', function () {
  const state = {
    phase: PHASES.FAN_A,
    mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null, 次方: 'B',
    players: [
      mk('A', [C('H', 14)]),
      mk('B', [C('D', 14)]),
      mk('C', []), mk('D', []), mk('E', [])
    ],
    passedPlayers: [], passCount: 0, 头名: null,
    推风触发者: null, 次方公开: false, 底牌公开: true,
    table: [], discarded: [], startPlayerIndex: 0, deck: [], dealOrder: [], actions: []
  };
  const r = transition(state, {
    type: ACTIONS.FAN_A,
    payload: { playerId: 'B', suit: 'D', cardIds: ['D-A-undefined'] }
  });
  assert.strictEqual(r.ok, false, '1 张 A 反A 应失败');
});

test('G.5.2 主A 未确立时 (主A=null) 反A 应被拒', function () {
  const state = {
    phase: PHASES.FAN_A,
    mode: null,
    主A: null,
    反A: null, 次方: null,
    players: [
      mk('A', []), mk('B', [C('D', 14), C('D', 14)]), mk('C', []), mk('D', []), mk('E', [])
    ],
    passedPlayers: [], passCount: 0, 头名: null,
    推风触发者: null, 次方公开: false, 底牌公开: true,
    table: [], discarded: [], startPlayerIndex: 0, deck: [], dealOrder: [], actions: []
  };
  const r = transition(state, {
    type: ACTIONS.FAN_A,
    payload: { playerId: 'B', suit: 'D', cardIds: ['D-A-undefined', 'D-A-undefined'] }
  });
  assert.strictEqual(r.ok, false, '主A=null 时反A 应失败');
});

test('G.5.3 同一花色 A 必须在 hand 里, 不能从 底牌 取', function () {
  const state = {
    phase: PHASES.FAN_A,
    mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null, 次方: 'B',
    players: [
      mk('A', [C('H', 14)]),
      { id: 'B', hand: [], 底牌: C('D', 14) },
      mk('C', []), mk('D', []), mk('E', [])
    ],
    passedPlayers: [], passCount: 0, 头名: null,
    推风触发者: null, 次方公开: false, 底牌公开: false,
    table: [], discarded: [], startPlayerIndex: 0, deck: [], dealOrder: [], actions: []
  };
  const r = transition(state, {
    type: ACTIONS.FAN_A,
    payload: { playerId: 'B', suit: 'D', cardIds: [state.players[1].底牌.id] }
  });
  assert.strictEqual(r.ok, false, '用 底牌 反A 应被拒 (底牌不参与资格判断)');
});

console.log('\n=== 总结 ===');
console.log('total: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed > 0 ? 1 : 0);