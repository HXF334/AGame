// tests/test-robustness.js — B: 健壮性覆盖
// 1. 新增守卫: REVEAL_BOTTOM 主A=null / executeCapture table 空
// 2. 全模块畸形 state 扫描: 任何模块都不应 throw
const assert = require('assert');
const {
  transition, PHASES, ACTIONS, checkGameEnd, determineFirstPlayer
} = require('../src/index.js');
const { handlePlay, handlePass, isRoundOver } = require('../src/play.js');
const { pushWind } = require('../src/push-wind.js');
const { calculateScore } = require('../src/scoring.js');
const { checkGameEnd: wlCheck, getCamp, isAllOut } = require('../src/win-loss.js');
const { canCapture, executeCapture } = require('../src/capture.js');
const { identifyHand, canBeat, compareHands } = require('../src/hand-types.js');
const { chooseAction } = require('../src/ai.js');
const { createNormalCard, createBigJoker, createSmallJoker } = require('../src/card.js');

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  FAIL  ' + name + '\n        ' + (e && e.message)); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function C(s, r) { return createNormalCard(s, r); }
function mk(id, hand) { return { id: id, hand: hand || [], 底牌: null }; }

// 一个"最小但合法"的 state
function baseState() {
  return {
    phase: PHASES.PLAY,
    mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null,
    次方: 'D',
    主方: ['A', 'D'],
    抓方: ['B', 'C', 'E'],
    头名: null,
    推风触发者: null,
    次方公开: false,
    底牌公开: true,
    table: [],
    discarded: [],
    passedPlayers: [],
    passCount: 0,
    lastPlayer: null,
    startPlayerIndex: 0,
    deck: [], dealOrder: [], actions: [],
    players: [
      mk('A', [C('H', 14), C('D', 5)]),
      mk('B', [C('S', 8)]),
      mk('C', [C('C', 9)]),
      mk('D', [C('H', 10)]),
      mk('E', [C('S', 12)])
    ]
  };
}

// ============================================================
// 1. 新增守卫 (A 任务修的 2 处)
// ============================================================
section('1. 新增守卫');

// --- 1.1 REVEAL_BOTTOM 在 主A=null 时应拒绝, 不 throw ---
test('1.1 REVEAL_BOTTOM 主A=null → 拒绝, 不 crash', function () {
  const st = baseState();
  st.phase = PHASES.FAN_A;
  st.主A = null;
  st.次方 = null;
  const r = transition(st, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.ok(r, '应返回结果对象, 不应 throw');
  assert.strictEqual(r.ok, false, '主A=null 应被拒绝');
  assert.ok(r.error && r.error.message, '应带错误信息');
});

test('1.2 REVEAL_BOTTOM 主A 存在但无 establishedBy → 拒绝', function () {
  const st = baseState();
  st.phase = PHASES.FAN_A;
  st.主A = { suit: 'H' };   // 缺 establishedBy
  st.次方 = null;
  const r = transition(st, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.ok, false, 'establishedBy 缺失应被拒绝');
});

test('1.3 REVEAL_BOTTOM 不应 crash (任何 phase)', function () {
  const st = baseState();
  const r = transition(st, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.ok(r, '应返回结果');
  assert.strictEqual(typeof r.ok, 'boolean');
});

// --- 1.4 executeCapture 在 table 为空/缺失时不 throw ---
test('1.4 executeCapture table=[] → 拒绝, 不 crash', function () {
  const st = baseState();
  st.table = [];
  const r = executeCapture(st, 'A', [C('D', 4), C('C', 4)]);
  assert.ok(r, '应返回结果对象');
  assert.strictEqual(r.ok, false, 'table 空应被拒绝');
});

test('1.5 executeCapture table 字段缺失(undefined) → 不 crash', function () {
  const st = baseState();
  delete st.table;
  const r = executeCapture(st, 'A', [C('D', 4), C('C', 4)]);
  assert.ok(r, '应返回结果对象, 不应 throw');
  assert.strictEqual(r.ok, false);
});

test('1.6 canCapture table 空 → 不 crash', function () {
  const r = canCapture([C('D', 4), C('C', 4)], []);
  assert.strictEqual(r.canCapture, false, '空 table 不可取');
});

// ============================================================
// 2. 全模块畸形 state 扫描 (不应 throw)
// ============================================================
section('2. 畸形 state 扫描');

// 各种畸形 state
const MALFORMED = [
  ['null', null],
  ['undefined', undefined],
  ['空对象', {}],
  ['无 players', { mode: '1V4_明打' }],
  ['players 空数组', { mode: '1V4_明打', players: [] }],
  ['players 有但无 hand', { mode: '1V4_明打', players: [{ id: 'A' }] }],
  ['主A=null', { mode: '1V4_明打', 主A: null, 次方: null, 主方: ['A'], 抓方: ['B'], players: [mk('A'), mk('B'), mk('C'), mk('D'), mk('E')] }],
  ['mode=null', { mode: null, 主A: { suit: 'H', establishedBy: 'A' }, 次方: null, players: [mk('A'), mk('B'), mk('C'), mk('D'), mk('E')] }],
  ['无 主A 字段', { mode: '2V3_暗打', 次方: 'D', 主方: ['A','D'], 抓方: ['B','C','E'], players: [mk('A'), mk('B'), mk('C'), mk('D'), mk('E')] }],
  ['table 缺失', { mode: '2V3_暗打', 主A: { suit: 'H', establishedBy: 'A' }, 次方: 'D', 主方: ['A','D'], 抓方: ['B','C','E'], players: [mk('A'), mk('B'), mk('C'), mk('D'), mk('E')] }],
  ['discarded 缺失', { mode: '2V3_暗打', 主A: { suit: 'H', establishedBy: 'A' }, 次方: 'D', 主方: ['A','D'], 抓方: ['B','C','E'], table: [], players: [mk('A'), mk('B'), mk('C'), mk('D'), mk('E')] }],
  ['抓方 引用不存在玩家', { mode: '2V3_暗打', 主A: { suit: 'H', establishedBy: 'A' }, 次方: 'D', 主方: ['A','D'], 抓方: ['Z'], table: [], passedPlayers: [], players: [mk('A'), mk('B'), mk('C'), mk('D'), mk('E')] }],
];

const CALLS = [
  ['checkGameEnd', s => checkGameEnd(s)],
  ['win-loss.getCamp', s => getCamp(s, 'A')],
  ['win-loss.isAllOut', s => isAllOut(s, ['A', 'B'])],
  ['determineFirstPlayer', s => determineFirstPlayer(s)],
  ['calculateScore', s => calculateScore(s, { winner: '主方' }, 2)],
  ['calculateScore(抓方胜)', s => calculateScore(s, { winner: '抓方' }, 2)],
  ['isRoundOver', s => isRoundOver(s)],
  ['handlePass', s => handlePass(s, { playerId: 'B' })],
  ['pushWind', s => pushWind(s, { trigger: 'A' })],
  ['handlePlay', s => handlePlay(s, { playerId: 'A', cardIds: [C('D', 5).id] })],
  ['ai.chooseAction', s => chooseAction(s, 'A')],
  ['capture.canCapture', s => canCapture([C('D', 4)], s && s.table ? s.table : [])],
];

test('2.1 checkGameEnd 不 throw (13 种畸形 state)', function () {
  MALFORMED.forEach(([name, st]) => {
    let out;
    assert.doesNotThrow(() => { out = checkGameEnd(st); }, name + ' crash');
    assert.ok(out && typeof out === 'object' && 'ended' in out, name + ' 应返回 {ended:...}');
  });
});

test('2.2 getCamp 不 throw (13 种畸形 state)', function () {
  MALFORMED.forEach(([name, st]) => {
    assert.doesNotThrow(() => getCamp(st, 'A'), name + ' crash');
  });
});

test('2.3 determineFirstPlayer 不 throw (13 种畸形 state)', function () {
  MALFORMED.forEach(([name, st]) => {
    assert.doesNotThrow(() => determineFirstPlayer(st), name + ' crash');
  });
});

test('2.4 calculateScore 不 throw (13 种畸形 state, 主方胜 + 抓方胜)', function () {
  MALFORMED.forEach(([name, st]) => {
    assert.doesNotThrow(() => calculateScore(st, { winner: '主方' }, 2), name + ' 主方胜 crash');
    assert.doesNotThrow(() => calculateScore(st, { winner: '抓方' }, 2), name + ' 抓方胜 crash');
  });
});

test('2.5 play/pushWind/ai 不 throw (13 种畸形 state)', function () {
  MALFORMED.forEach(([name, st]) => {
    assert.doesNotThrow(() => handlePass(st, { playerId: 'B' }), name + ' handlePass crash');
    assert.doesNotThrow(() => pushWind(st, { trigger: 'A' }), name + ' pushWind crash');
    assert.doesNotThrow(() => chooseAction(st, 'A'), name + ' chooseAction crash');
  });
});

test('2.6 handlePlay 不 throw (13 种畸形 state)', function () {
  MALFORMED.forEach(([name, st]) => {
    assert.doesNotThrow(() => handlePlay(st, { playerId: 'A', cardIds: [C('D', 5).id] }), name + ' crash');
  });
});

test('2.7 transition 不 throw (13 种畸形 state × 全部 action)', function () {
  const acts = [ACTIONS.START_GAME, ACTIONS.LIANG_A, ACTIONS.FORCED_CHECK, ACTIONS.FAN_A,
                ACTIONS.REVEAL_BOTTOM, ACTIONS.CHOOSE_IDENTITY, ACTIONS.ADVANCE,
                ACTIONS.PLAY, ACTIONS.PASS, ACTIONS.PUSH_WIND];
  MALFORMED.forEach(([name, st]) => {
    acts.forEach(a => {
      assert.doesNotThrow(() => {
        transition(st, { type: a, payload: { playerId: 'A', suit: 'D', cardIds: [], choice: 'HIDDEN', trigger: 'A', startPlayerIndex: 0 } });
      }, name + ' + ' + a + ' crash');
    });
  });
});

test('2.8 transition 对畸形 state 必返回 ok:boolean', function () {
  const st = baseState();
  const r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: [] } });
  assert.ok(typeof r.ok === 'boolean', '应返回 ok 布尔');
  assert.ok(r.state, '应返回 state');
});

// ============================================================
// 3. AI 在畸形 state 下不 crash
// ============================================================
section('3. AI 边界');

test('3.1 AI 对 null state 不 crash', function () {
  assert.doesNotThrow(() => chooseAction(null, 'A'));
});

test('3.2 AI 对不存在的 playerId → PASS', function () {
  const st = baseState();
  const a = chooseAction(st, 'Z');
  assert.ok(a && a.type === 'PASS', '不存在玩家应 PASS');
});

test('3.3 AI 对 hand 为 undefined 的玩家 → PASS', function () {
  const st = baseState();
  st.players[1] = { id: 'B' };   // 无 hand 字段
  const a = chooseAction(st, 'B');
  assert.ok(a && a.type === 'PASS', '无 hand 应 PASS');
});

test('3.4 AI 对手牌全 4 → 返回有效 action', function () {
  const st = baseState();
  st.table = [];
  st.players[1] = mk('B', [C('D', 4), C('C', 4)]);
  const a = chooseAction(st, 'B');
  assert.ok(['PLAY', 'PASS'].indexOf(a.type) >= 0, '应返回有效 action');
});

test('3.5 AI 在 IDENTITY_CHOICE + 无 players → 不 crash', function () {
  const st = { phase: PHASES.IDENTITY_CHOICE };
  assert.doesNotThrow(() => chooseAction(st, 'A'));
});

// ============================================================
// 4. transition 出口 merge 不变量
// ============================================================
section('4. transition merge 不变量');

test('4.1 transition 成功后旧字段全部保留', function () {
  const st = baseState();
  st.customField = 'SHOULD_SURVIVE';
  st.nested = { a: 1 };
  const r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: [C('D', 5).id] } });
  if (r.ok) {
    assert.strictEqual(r.state.customField, 'SHOULD_SURVIVE', '自定义字段应保留');
    assert.deepStrictEqual(r.state.nested, { a: 1 });
  }
});

test('4.2 transition 失败时返回原 state (引用相同)', function () {
  const st = baseState();
  const r = transition(st, { type: ACTIONS.START_GAME, payload: {} });  // PLAY 阶段不能 START_GAME
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.state, st, '失败时应返回原 state 引用');
});

test('4.3 transition 未知 action type → UNKNOWN_ACTION, 不 crash', function () {
  const st = baseState();
  const r = transition(st, { type: 'NOT_A_REAL_ACTION', payload: {} });
  assert.strictEqual(r.ok, false);
  assert.ok(r.error && r.error.type, '应带 error.type');
});

test('4.4 transition 无 type → 拒绝, 不 crash', function () {
  const st = baseState();
  assert.doesNotThrow(() => transition(st, {}));
  assert.doesNotThrow(() => transition(st, null));
  assert.doesNotThrow(() => transition(st, { payload: {} }));
});

console.log('\n=== 总结 ===');
console.log('total: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(failed > 0 ? 1 : 0);