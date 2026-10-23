// tests/test-phase2.js — 第二阶段测试
// 纯 Node 脚本：node tests/test-phase2.js
// 不引入任何测试框架（assert 是 Node 内建）

const assert = require('assert');
const { PHASES, ACTIONS, ERR } = require('../src/phases.js');
const { transition, newGameState } = require('../src/transition.js');

// ===== 测试运行器 =====
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS  ' + name);
  } catch (e) {
    failed += 1;
    failures.push({ name: name, err: e });
    console.log('  FAIL  ' + name);
    console.log('        ' + (e && e.message ? e.message : e));
  }
}

function section(t) { console.log('\n=== ' + t + ' ==='); }

// ===== 构造器：绕过 dealGame 制造确定性的 game state =====
// spec: { startPlayerIndex, players: [ { hand:[cardSpec], 底牌:cardSpec|null }, ... ] }
//   - 5 个 player 必须都给
//   - cardSpec: { id, suit, rank, isBigJoker?, isSmallJoker? }
function makeTestState(spec) {
  const PLAYER_IDS = ['A', 'B', 'C', 'D', 'E'];
  const startPlayerIndex = (typeof spec.startPlayerIndex === 'number')
    ? spec.startPlayerIndex
    : 0;
  const players = [];
  const allCards = [];
  for (let i = 0; i < 5; i++) {
    const ps = spec.players[i];
    const hand = ps.hand.map(function (c) {
      return {
        id: c.id,
        suit: c.suit,
        rank: c.rank,
        isBigJoker: c.isBigJoker || false,
        isSmallJoker: c.isSmallJoker || false,
        is主方大A: false,
        location: { type: 'hand', playerId: PLAYER_IDS[i] }
      };
    });
    let bottom = null;
    if (ps.底牌) {
      const c = ps.底牌;
      bottom = {
        id: c.id,
        suit: c.suit,
        rank: c.rank,
        isBigJoker: c.isBigJoker || false,
        isSmallJoker: c.isSmallJoker || false,
        is主方大A: false,
        location: { type: '底牌', playerId: PLAYER_IDS[i] }
      };
    }
    players.push({ id: PLAYER_IDS[i], hand: hand, 底牌: bottom });
    allCards.push.apply(allCards, hand);
    if (bottom) allCards.push(bottom);
  }
  // dealOrder 在 transition 中不参与；仅占位以满足 state 形状
  const dealOrder = allCards.map(function (_, i) { return i % 5; });
  return {
    phase: PHASES.LIANG_A,
    players: players,
    startPlayerIndex: startPlayerIndex,
    deck: allCards,
    dealOrder: dealOrder,
    主A: null,
    actions: []
  };
}

function c(id, suit, rank) { return { id: id, suit: suit, rank: rank }; }

// =====================================================
// §0  枚举完整性
// =====================================================

section('0. PHASES / ACTIONS / ERR 枚举');

test('PHASES 包含本阶段必需值 + 占位未来阶段', () => {
  assert.strictEqual(PHASES.GAME_START, 'GAME_START');
  assert.strictEqual(PHASES.LIANG_A, 'LIANG_A');
  assert.strictEqual(PHASES.LIANG_A_RESOLVED, 'LIANG_A_RESOLVED');
  assert.strictEqual(PHASES.FAN_A, 'FAN_A');
  assert.strictEqual(PHASES.REVEAL_BOTTOM, 'REVEAL_BOTTOM');
  assert.strictEqual(PHASES.IDENTITY_CHOICE, 'IDENTITY_CHOICE');
  assert.strictEqual(PHASES.PLAY, 'PLAY');
  assert.strictEqual(PHASES.GAME_END, 'GAME_END');
  assert.strictEqual(PHASES.SCORING, 'SCORING');
});

test('ACTIONS 包含本阶段 4 个动作', () => {
  assert.strictEqual(ACTIONS.START_GAME, 'START_GAME');
  assert.strictEqual(ACTIONS.LIANG_A, 'LIANG_A');
  assert.strictEqual(ACTIONS.FORCED_CHECK, 'FORCED_CHECK');
  assert.strictEqual(ACTIONS.ADVANCE, 'ADVANCE');
});

test('ERR 包含本阶段所有错误类型', () => {
  const required = [
    'UNKNOWN_ACTION', 'ILLEGAL_ACTION', 'MISSING_PAYLOAD',
    'PLAYER_NOT_FOUND', 'CARD_NOT_FOUND', 'NOT_AN_ACE',
    'CARD_NOT_IN_HAND', 'LIANG_A_REJECTED',
    'FORCED_CHECK_REJECTED', 'NO_NEXT_PHASE'
  ];
  for (let i = 0; i < required.length; i++) {
    assert.ok(ERR[required[i]], 'ERR.' + required[i] + ' missing');
  }
});

// =====================================================
// §1  初始状态
// =====================================================

section('1. newGameState 初始状态');

test('newGameState = GAME_START, players=[], 主A=null', () => {
  const s = newGameState();
  assert.strictEqual(s.phase, PHASES.GAME_START);
  assert.deepStrictEqual(s.players, []);
  assert.strictEqual(s.主A, null);
  assert.deepStrictEqual(s.actions, []);
  assert.strictEqual(s.startPlayerIndex, null);
});

// =====================================================
// §2  transition 基础错误处理
// =====================================================

section('2. transition 基础错误处理');

test('transition(null) → UNKNOWN_ACTION, state 引用相同', () => {
  const s = newGameState();
  const r = transition(s, null);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.UNKNOWN_ACTION);
  assert.strictEqual(r.state, s);
});

test('transition(无 type 字段) → UNKNOWN_ACTION', () => {
  const s = newGameState();
  const r = transition(s, { payload: {} });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.UNKNOWN_ACTION);
  assert.strictEqual(r.state, s);
});

test('transition(未知 type) → UNKNOWN_ACTION', () => {
  const s = newGameState();
  const r = transition(s, { type: 'BOGUS', payload: {} });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.UNKNOWN_ACTION);
  assert.strictEqual(r.state, s);
});

// =====================================================
// §3  START_GAME
// =====================================================

section('3. START_GAME');

test('START_GAME 从 GAME_START 成功：phase→LIANG_A, 5 名玩家', () => {
  const s = newGameState();
  const r = transition(s, { type: ACTIONS.START_GAME, payload: { startPlayerIndex: 0 } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.phase, PHASES.LIANG_A);
  assert.strictEqual(r.state.主A, null);
  assert.strictEqual(r.state.players.length, 5);
  assert.strictEqual(r.state.startPlayerIndex, 0);
  assert.strictEqual(r.state.actions.length, 1);
  assert.strictEqual(r.state.actions[0].type, ACTIONS.START_GAME);
});

test('START_GAME 不在 GAME_START → ILLEGAL_ACTION, state 引用相同', () => {
  const r1 = transition(newGameState(),
    { type: ACTIONS.START_GAME, payload: { startPlayerIndex: 0 } });
  assert.strictEqual(r1.ok, true);
  const s = r1.state;
  const r2 = transition(s, { type: ACTIONS.START_GAME, payload: {} });
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.error.type, ERR.ILLEGAL_ACTION);
  assert.strictEqual(r2.state, s);
});

test('START_GAME 显式 startPlayerIndex=3 → 起始玩家=3', () => {
  const s = newGameState();
  const r = transition(s, { type: ACTIONS.START_GAME, payload: { startPlayerIndex: 3 } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.startPlayerIndex, 3);
});

// =====================================================
// §4  LIANG_A 成功路径
// =====================================================

section('4. LIANG_A 成功');

test('LIANG_A 成功：手中 H-A，phase→LIANG_A_RESOLVED, 主A.suit=H', () => {
  const s = makeTestState({
    startPlayerIndex: 0,
    players: [
      { hand: [c('H-A-0', 'H', 14), c('5-C-0', 'C', 5)], 底牌: c('K-D-0', 'D', 13) },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: 'H-A-0' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.phase, PHASES.LIANG_A_RESOLVED);
  assert.strictEqual(r.state.主A.suit, 'H');
  assert.strictEqual(r.state.主A.establishedBy, 'A');
  assert.strictEqual(r.state.主A.viaMethod, 'LIANG_A');
  assert.strictEqual(r.state.主A.viaCardId, 'H-A-0');
});

test('LIANG_A 成功后两张同花色 A 都标记 is主方大A（含另一玩家手牌）', () => {
  const s = makeTestState({
    startPlayerIndex: 0,
    players: [
      { hand: [c('H-A-0', 'H', 14), c('5-C-0', 'C', 5)], 底牌: c('K-D-0', 'D', 13) },
      { hand: [c('H-A-1', 'H', 14), c('3-S-0', 'S', 3)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: 'H-A-0' } });
  assert.strictEqual(r.ok, true);
  const aH = r.state.players[0].hand.find(function (x) { return x.id === 'H-A-0'; });
  assert.strictEqual(aH.is主方大A, true);
  const bH = r.state.players[1].hand.find(function (x) { return x.id === 'H-A-1'; });
  assert.strictEqual(bH.is主方大A, true);
  // B 手里的 3-S-0 不应该被波及
  const b3 = r.state.players[1].hand.find(function (x) { return x.id === '3-S-0'; });
  assert.strictEqual(b3.is主方大A, false);
});

test('LIANG_A 成功后 actions 追加 1 条', () => {
  const s = makeTestState({
    players: [
      { hand: [c('H-A-0', 'H', 14)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: 'H-A-0' } });
  assert.strictEqual(r.state.actions.length, 1);
  assert.strictEqual(r.state.actions[0].type, ACTIONS.LIANG_A);
  assert.strictEqual(r.state.actions[0].atPhase, PHASES.LIANG_A_RESOLVED);
});

// =====================================================
// §5  LIANG_A 拒绝路径
// =====================================================

section('5. LIANG_A 拒绝');

test('LIANG_A 拒：牌在 底牌（CARD_NOT_IN_HAND）', () => {
  const s = makeTestState({
    players: [
      { hand: [c('5-C-0', 'C', 5)], 底牌: c('H-A-0', 'H', 14) },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: 'H-A-0' } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.CARD_NOT_IN_HAND);
  assert.strictEqual(r.state, s);
});

test('LIANG_A 拒：牌根本不存在（CARD_NOT_FOUND）', () => {
  const s = makeTestState({
    players: [
      { hand: [c('5-C-0', 'C', 5)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: 'XX-X-0' } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.CARD_NOT_FOUND);
});

test('LIANG_A 拒：不是 A（NOT_AN_ACE）', () => {
  const s = makeTestState({
    players: [
      { hand: [c('5-C-0', 'C', 5)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: '5-C-0' } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.NOT_AN_ACE);
});

test('LIANG_A 拒：缺 payload（MISSING_PAYLOAD）', () => {
  const s = makeTestState({
    players: [
      { hand: [c('H-A-0', 'H', 14)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A' } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.MISSING_PAYLOAD);
});

test('LIANG_A 拒：玩家不存在（PLAYER_NOT_FOUND）', () => {
  const s = makeTestState({
    players: [
      { hand: [c('H-A-0', 'H', 14)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'Z', cardId: 'H-A-0' } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.PLAYER_NOT_FOUND);
});

test('LIANG_A 拒：主A 已确立（LIANG_A_REJECTED）', () => {
  const s = makeTestState({
    players: [
      { hand: [c('H-A-0', 'H', 14)], 底牌: null },
      { hand: [c('D-A-0', 'D', 14)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r1 = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: 'H-A-0' } });
  assert.strictEqual(r1.ok, true);
  const r2 = transition(r1.state, { type: ACTIONS.LIANG_A, payload: { playerId: 'B', cardId: 'D-A-0' } });
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.error.type, ERR.LIANG_A_REJECTED);
  assert.strictEqual(r2.state, r1.state);
});

test('LIANG_A 拒：phase=GAME_START（ILLEGAL_ACTION）', () => {
  const s = newGameState();
  const r = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: 'X' } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.ILLEGAL_ACTION);
});

// =====================================================
// §6  FORCED_CHECK
// =====================================================

section('6. FORCED_CHECK 行为');

test('FORCED_CHECK 基础：A 手 H-A → suit=H, establishedBy=A, viaMethod=FORCED_CHECK', () => {
  const s = makeTestState({
    startPlayerIndex: 0,
    players: [
      { hand: [c('H-A-0', 'H', 14)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.主A.suit, 'H');
  assert.strictEqual(r.state.主A.establishedBy, 'A');
  assert.strictEqual(r.state.主A.viaMethod, 'FORCED_CHECK');
  assert.strictEqual(r.state.phase, PHASES.LIANG_A_RESOLVED);
});

test('FORCED_CHECK 遵循发牌顺序：A 无 A → 跳到 B', () => {
  const s = makeTestState({
    startPlayerIndex: 0,
    players: [
      { hand: [c('5-C-0', 'C', 5)], 底牌: null },
      { hand: [c('H-A-0', 'H', 14)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.主A.establishedBy, 'B');
});

test('FORCED_CHECK 遵循花色顺序 H→D→C→S：A 仅有 S-A → 命中 S', () => {
  const s = makeTestState({
    startPlayerIndex: 0,
    players: [
      { hand: [c('S-A-0', 'S', 14)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.主A.suit, 'S');
});

test('FORCED_CHECK 跳过持双 A 的花色：A 双 H-A + D-A → 命中 D', () => {
  const s = makeTestState({
    startPlayerIndex: 0,
    players: [
      { hand: [c('H-A-0', 'H', 14), c('H-A-1', 'H', 14), c('D-A-0', 'D', 14)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.主A.suit, 'D');
  assert.strictEqual(r.state.主A.establishedBy, 'A');
});

test('FORCED_CHECK 不读 底牌：A 手 H-A + A 底牌 H-A → 命中 H（手数=1）', () => {
  const s = makeTestState({
    startPlayerIndex: 0,
    players: [
      { hand: [c('H-A-0', 'H', 14)], 底牌: c('H-A-1', 'H', 14) },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.主A.suit, 'H');
  assert.strictEqual(r.state.主A.establishedBy, 'A');
  // 底牌也被标记 is主方大A
  assert.strictEqual(r.state.players[0].底牌.is主方大A, true);
});

test('FORCED_CHECK 全部查不到时兜底红桃A', () => {
  // A 双 H-A（不算"单A"），其它 A 全部在 底牌
  // 5 名玩家手牌中均无"单A"
  const s = makeTestState({
    startPlayerIndex: 0,
    players: [
      { hand: [c('H-A-0', 'H', 14), c('H-A-1', 'H', 14)], 底牌: c('D-A-0', 'D', 14) },
      { hand: [c('5-C-0', 'C', 5)], 底牌: c('S-A-0', 'S', 14) },
      { hand: [], 底牌: c('C-A-0', 'C', 14) },
      { hand: [], 底牌: c('D-A-1', 'D', 14) },
      { hand: [], 底牌: c('S-A-1', 'S', 14) }
    ]
  });
  const r = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.主A.suit, 'H');
  // [2026-10-23 修正] 原断言为 DEFAULT_HEART（花色名当玩家ID，导致
  //   currentPlayer 非法 -> PLAYER_NOT_FOUND -> 双大A 无法选牌/出牌。现兑底返回实际持有红桃A的玩家（本例 A）。
  assert.strictEqual(r.state.主A.establishedBy, 'A');
  assert.strictEqual(r.state.主A.viaMethod, 'FORCED_CHECK');
});

test('FORCED_CHECK 拒：主A 已确立（FORCED_CHECK_REJECTED）', () => {
  const s = makeTestState({
    players: [
      { hand: [c('H-A-0', 'H', 14)], 底牌: null },
      { hand: [c('D-A-0', 'D', 14)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r1 = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: 'H-A-0' } });
  assert.strictEqual(r1.ok, true);
  const r2 = transition(r1.state, { type: ACTIONS.FORCED_CHECK, payload: {} });
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.error.type, ERR.FORCED_CHECK_REJECTED);
  assert.strictEqual(r2.state, r1.state);
});

test('FORCED_CHECK 拒：phase=GAME_START（ILLEGAL_ACTION）', () => {
  const s = newGameState();
  const r = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.ILLEGAL_ACTION);
});

test('FORCED_CHECK 不改 底牌 内容（非 A 的底牌保持原样）', () => {
  const s = makeTestState({
    startPlayerIndex: 0,
    players: [
      { hand: [c('H-A-0', 'H', 14)], 底牌: c('5-C-0', 'C', 5) },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} });
  assert.strictEqual(r.ok, true);
  const bottom = r.state.players[0].底牌;
  assert.strictEqual(bottom.id, '5-C-0');
  assert.strictEqual(bottom.suit, 'C');
  assert.strictEqual(bottom.rank, 5);
  assert.strictEqual(bottom.is主方大A, false);
});

test('FORCED_CHECK 起始玩家 = startPlayerIndex（从 D 起）', () => {
  const s = makeTestState({
    startPlayerIndex: 3,  // D
    players: [
      { hand: [], 底牌: null },  // A 无 A
      { hand: [c('H-A-0', 'H', 14)], 底牌: null },  // B 有
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },  // D 无
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} });
  assert.strictEqual(r.ok, true);
  // 从 D(3) 起逆时针：D(3) → E(4) → A(0) → B(1) → C(2)
  // D/E/A 无 A，B 有 H-A → 命中 B
  assert.strictEqual(r.state.主A.establishedBy, 'B');
});

// =====================================================
// §7  ADVANCE
// =====================================================

section('7. ADVANCE');

test('ADVANCE from LIANG_A_RESOLVED → FAN_A（C-1 阶段实现）', () => {
  const s = makeTestState({
    players: [
      { hand: [c('H-A-0', 'H', 14)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r1 = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: 'H-A-0' } });
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.state.phase, PHASES.LIANG_A_RESOLVED);
  const r2 = transition(r1.state, { type: ACTIONS.ADVANCE, payload: {} });
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r2.state.phase, PHASES.FAN_A);
  assert.strictEqual(r2.state.主A.suit, 'H');  // 主A 不变
  assert.strictEqual(r2.state.反A, null);       // 未反A
  assert.strictEqual(r2.state.mode, null);      // mode 未定
});

test('ADVANCE from LIANG_A（未亮A）→ ILLEGAL_ACTION', () => {
  const s = makeTestState({
    players: [
      { hand: [c('H-A-0', 'H', 14)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.ADVANCE, payload: {} });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.ILLEGAL_ACTION);
});

// =====================================================
// §8  不可变性
// =====================================================

section('8. 不可变性');

test('失败的 transition 返回的 state 与入参是同一引用', () => {
  const s = makeTestState({
    players: [
      { hand: [c('5-C-0', 'C', 5)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: '5-C-0' } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.state, s, 'state 引用必须相同');
});

test('成功的 transition 返回的 state 是新对象，原 state 不变', () => {
  const s = makeTestState({
    players: [
      { hand: [c('H-A-0', 'H', 14)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: 'H-A-0' } });
  assert.strictEqual(r.ok, true);
  assert.notStrictEqual(r.state, s, '新 state 应是新对象');
  // 原 state 保持 phase=LIANG_A, 主A=null
  assert.strictEqual(s.phase, PHASES.LIANG_A);
  assert.strictEqual(s.主A, null);
});

test('失败不追加 actions', () => {
  const s = makeTestState({
    players: [
      { hand: [c('5-C-0', 'C', 5)], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
  const r = transition(s, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: '5-C-0' } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.state.actions.length, 0);
});

// =====================================================
// §9  跨测试：完整流程
// =====================================================

section('9. 完整流程');

test('完整一局：START_GAME → 强制排查 → ADVANCE → FAN_A', () => {
  let s = newGameState();
  let r = transition(s, { type: ACTIONS.START_GAME, payload: { startPlayerIndex: 0 } });
  assert.strictEqual(r.ok, true);
  s = r.state;
  r = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} });
  assert.strictEqual(r.ok, true);
  s = r.state;
  assert.strictEqual(s.phase, PHASES.LIANG_A_RESOLVED);
  assert.ok(s.主A, '主A 应已确立');
  // ADVANCE 现在能进 FAN_A（C-1 实现）
  r = transition(s, { type: ACTIONS.ADVANCE, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.phase, PHASES.FAN_A);
  assert.strictEqual(r.state.反A, null);
  assert.strictEqual(r.state.mode, null);
});

test('完整一局：START_GAME → FORCED_CHECK 全部查不到 → 红桃A兜底', () => {
  // 这里需要构造：手牌中无"单A"
  // startPlayerIndex=0 走 dealGame 即可（随机的牌局一般会有单A）
  // 所以这里改用 makeTestState 构造特定状态
  const s = makeTestState({
    startPlayerIndex: 0,
    players: [
      { hand: [c('H-A-0', 'H', 14), c('H-A-1', 'H', 14), c('5-C-0', 'C', 5)], 底牌: c('D-A-0', 'D', 14) },
      { hand: [c('K-S-0', 'S', 13), c('9-D-0', 'D', 9)], 底牌: c('S-A-0', 'S', 14) },
      { hand: [], 底牌: c('C-A-0', 'C', 14) },
      { hand: [], 底牌: c('D-A-1', 'D', 14) },
      { hand: [], 底牌: c('S-A-1', 'S', 14) }
    ]
  });
  const r = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.主A.suit, 'H');
  // [2026-10-23 修正] 同上: 兑底归实际持有红桃A 的玩家。
  assert.strictEqual(r.state.主A.establishedBy, 'A');
  // 兜底情况下，A 手里的 H-A-0 和 H-A-1 也被标记 is主方大A
  const aH0 = r.state.players[0].hand.find(function (x) { return x.id === 'H-A-0'; });
  const aH1 = r.state.players[0].hand.find(function (x) { return x.id === 'H-A-1'; });
  assert.strictEqual(aH0.is主方大A, true);
  assert.strictEqual(aH1.is主方大A, true);
});

// ===== 汇总 =====
console.log('\n=== ' + passed + ' passed, ' + failed + ' failed ===');
if (failed > 0) {
  console.log('Failed tests:');
  for (const f of failures) {
    console.log('  - ' + f.name);
    console.log('    ' + (f.err && f.err.message ? f.err.message : f.err));
  }
  process.exit(1);
}
process.exit(0);
