// tests/test-reveal-bottom.js — C-2 阶段：§4.5 底牌翻开 + 身份选择 测试
// 跑法：node tests/test-reveal-bottom.js

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

// ===== 构造器（比 test-phase2 多了 主A/反A/次方/mode/底牌公开 字段） =====
function makeTestState(spec) {
  const PLAYER_IDS = ['A', 'B', 'C', 'D', 'E'];
  const startPlayerIndex = (typeof spec.startPlayerIndex === 'number')
    ? spec.startPlayerIndex : 0;
  const players = [];
  const allCards = [];
  for (let i = 0; i < 5; i++) {
    const ps = spec.players[i];
    const hand = ps.hand.map(function (c) {
      return {
        id: c.id, suit: c.suit, rank: c.rank,
        isBigJoker: c.isBigJoker || false, isSmallJoker: c.isSmallJoker || false,
        is主方大A: c.is主方大A || false,
        location: { type: 'hand', playerId: PLAYER_IDS[i] }
      };
    });
    let bottom = null;
    if (ps.底牌) {
      const c = ps.底牌;
      bottom = {
        id: c.id, suit: c.suit, rank: c.rank,
        isBigJoker: c.isBigJoker || false, isSmallJoker: c.isSmallJoker || false,
        is主方大A: c.is主方大A || false,
        location: { type: '底牌', playerId: PLAYER_IDS[i] }
      };
    }
    players.push({ id: PLAYER_IDS[i], hand: hand, 底牌: bottom });
    allCards.push.apply(allCards, hand);
    if (bottom) allCards.push(bottom);
  }
  const dealOrder = allCards.map(function (_, i) { return i % 5; });
  return {
    phase: spec.phase || PHASES.LIANG_A,
    players: players,
    startPlayerIndex: startPlayerIndex,
    deck: allCards,
    dealOrder: dealOrder,
    主A: spec.主A === undefined ? null : spec.主A,
    反A: spec.反A === undefined ? null : spec.反A,
    次方: spec.次方 === undefined ? null : spec.次方,
    mode: spec.mode === undefined ? null : spec.mode,
    底牌公开: spec.底牌公开 === undefined ? false : spec.底牌公开,
    actions: spec.actions || []
  };
}

function c(id, suit, rank) { return { id: id, suit: suit, rank: rank }; }

// 1V4 场景：A 持有两张 H-A（一张手牌 + 一张底牌）
function make1V4State() {
  return makeTestState({
    phase: PHASES.FAN_A_RESOLVED,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    players: [
      { hand: [
        { id: 'H-A-0', suit: 'H', rank: 14, is主方大A: true },
        { id: '5-C-0', suit: 'C', rank: 5 }
      ], 底牌: { id: 'H-A-1', suit: 'H', rank: 14, is主方大A: true } },
      { hand: [{ id: 'K-D-0', suit: 'D', rank: 13 }], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
}

// 2V3 场景：A 持 H-A-0，B 持 H-A-1
function make2V3State() {
  return makeTestState({
    phase: PHASES.FAN_A_RESOLVED,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    players: [
      { hand: [{ id: 'H-A-0', suit: 'H', rank: 14, is主方大A: true }], 底牌: null },
      { hand: [{ id: 'H-A-1', suit: 'H', rank: 14, is主方大A: true }], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
}

// 反A 后场景：B 用 D-A-0 + D-A-1 反A 成功
function makeAfterFanAState() {
  return makeTestState({
    phase: PHASES.FAN_A_RESOLVED,
    主A: { suit: 'D', establishedBy: 'B', viaMethod: 'FAN_A', viaCardIds: ['D-A-0','D-A-1'] },
    反A: { by: 'B', 旧主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' } },
    mode: '1V4_明打',
    players: [
      { hand: [{ id: 'H-A-0', suit: 'H', rank: 14 }], 底牌: null },  // A 失去 大A
      { hand: [
        { id: 'D-A-0', suit: 'D', rank: 14, is主方大A: true },
        { id: 'D-A-1', suit: 'D', rank: 14, is主方大A: true }
      ], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null },
      { hand: [], 底牌: null }
    ]
  });
}

// =====================================================
// §1  REVEAL_BOTTOM：1V4 路径
// =====================================================

section('1. REVEAL_BOTTOM 1V4 路径');

test('1V4：REVEAL_BOTTOM → IDENTITY_CHOICE, mode=null, 次方=null, 底牌公开=true', () => {
  const s = make1V4State();
  const r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.phase, PHASES.IDENTITY_CHOICE);
  assert.strictEqual(r.state.mode, null);
  assert.strictEqual(r.state.次方, null);
  assert.strictEqual(r.state.底牌公开, true);
  assert.strictEqual(r.state.主A.suit, 'H');  // 主A 不变
});

test('1V4：主方选 PUBLIC → 1V4_明打, phase=PLAY', () => {
  let s = make1V4State();
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  const r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'A', choice: 'PUBLIC' }
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.phase, PHASES.PLAY);
  assert.strictEqual(r.state.mode, '1V4_明打');
});

test('1V4：主方选 HIDDEN → 1V4_暗打, phase=PLAY', () => {
  let s = make1V4State();
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  const r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'A', choice: 'HIDDEN' }
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.phase, PHASES.PLAY);
  assert.strictEqual(r.state.mode, '1V4_暗打');
});

// =====================================================
// §2  REVEAL_BOTTOM：2V3 路径
// =====================================================

section('2. REVEAL_BOTTOM 2V3 路径');

test('2V3：REVEAL_BOTTOM → IDENTITY_CHOICE, 次方=B, mode=null', () => {
  const s = make2V3State();
  const r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.phase, PHASES.IDENTITY_CHOICE);
  assert.strictEqual(r.state.次方, 'B');
  assert.strictEqual(r.state.mode, null);
  assert.strictEqual(r.state.底牌公开, true);
});

test('2V3：次方 B 选 PUBLIC → 2V3_明打, phase=PLAY', () => {
  let s = make2V3State();
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  const r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'B', choice: 'PUBLIC' }
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.phase, PHASES.PLAY);
  assert.strictEqual(r.state.mode, '2V3_明打');
  assert.strictEqual(r.state.次方, 'B');
});

test('2V3：次方 B 选 HIDDEN → 2V3_暗打, phase=PLAY', () => {
  let s = make2V3State();
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  const r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'B', choice: 'HIDDEN' }
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.phase, PHASES.PLAY);
  assert.strictEqual(r.state.mode, '2V3_暗打');
});

test('2V3：次方在身份选择阶段公开 → 倍率信息（验证 mode 而非分数）', () => {
  // 2V3 明打 mode = '2V3_明打'，倍率 2（SKILL §11）
  // 2V3 暗打 mode = '2V3_暗打'，倍率 1
  // 本阶段只验证 mode 名称，不算分（计分是后续阶段）
  let s = make2V3State();
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  const r1 = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'B', choice: 'PUBLIC' }
  });
  assert.strictEqual(r1.state.mode, '2V3_明打');
  const r2 = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'B', choice: 'HIDDEN' }
  });
  assert.strictEqual(r2.state.mode, '2V3_暗打');
});

// =====================================================
// §3  REVEAL_BOTTOM：反A 后直接 PLAY（1V4_明打已锁定）
// =====================================================

section('3. REVEAL_BOTTOM 反A 后');

test('反A 后 REVEAL_BOTTOM → 直接 PLAY，跳过 IDENTITY_CHOICE', () => {
  const s = makeAfterFanAState();
  const r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.phase, PHASES.PLAY);
  assert.strictEqual(r.state.mode, '1V4_明打');
  assert.strictEqual(r.state.次方, null);
  assert.strictEqual(r.state.底牌公开, true);
});

// =====================================================
// §4  REVEAL_BOTTOM 拒绝
// =====================================================

section('4. REVEAL_BOTTOM 拒绝');

test('REVEAL_BOTTOM 拒：phase=LIANG_A (ILLEGAL_ACTION)', () => {
  const s = make1V4State();
  s.phase = PHASES.LIANG_A;
  const r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.ILLEGAL_ACTION);
});

test('REVEAL_BOTTOM 拒：phase=GAME_START (ILLEGAL_ACTION)', () => {
  const s = newGameState();
  const r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.ILLEGAL_ACTION);
});

test('REVEAL_BOTTOM 拒：主A=null (ILLEGAL_ACTION)', () => {
  const s = make1V4State();
  s.主A = null;
  const r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.ILLEGAL_ACTION);
});

test('REVEAL_BOTTOM 拒：重复翻开 (REVEAL_BOTTOM_REJECTED)', () => {
  let s = make1V4State();
  const r1 = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r1.ok, true);
  // 再次调用应被拒
  const r2 = transition(r1.state, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.error.type, ERR.REVEAL_BOTTOM_REJECTED);
});

// =====================================================
// §5  CHOOSE_IDENTITY 拒绝
// =====================================================

section('5. CHOOSE_IDENTITY 拒绝');

test('CHOOSE_IDENTITY 拒：1V4 时非主方玩家选 (IDENTITY_NOT_AUTHORIZED)', () => {
  let s = make1V4State();
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  // D 试图选
  const r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'D', choice: 'PUBLIC' }
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.IDENTITY_NOT_AUTHORIZED);
});

test('CHOOSE_IDENTITY 拒：2V3 时主方（非次方）选 (IDENTITY_NOT_AUTHORIZED)', () => {
  let s = make2V3State();
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  // A 是主方但不是次方，A 试图选
  const r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'A', choice: 'PUBLIC' }
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.IDENTITY_NOT_AUTHORIZED);
});

test('CHOOSE_IDENTITY 拒：phase=FAN_A_RESOLVED (ILLEGAL_ACTION)', () => {
  const s = make1V4State();  // phase=FAN_A_RESOLVED
  const r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'A', choice: 'PUBLIC' }
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.ILLEGAL_ACTION);
});

test('CHOOSE_IDENTITY 拒：choice=OTHER (INVALID_CHOICE)', () => {
  let s = make1V4State();
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  const r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'A', choice: 'MAYBE' }
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.INVALID_CHOICE);
});

test('CHOOSE_IDENTITY 拒：missing choice (MISSING_PAYLOAD)', () => {
  let s = make1V4State();
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  const r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'A' }
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.MISSING_PAYLOAD);
});

test('CHOOSE_IDENTITY 拒：missing playerId (MISSING_PAYLOAD)', () => {
  let s = make1V4State();
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  const r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { choice: 'PUBLIC' }
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.MISSING_PAYLOAD);
});

// =====================================================
// §6  不可变性
// =====================================================

section('6. 不可变性');

test('失败的 REVEAL_BOTTOM 返回 state 引用相同', () => {
  const s = make1V4State();
  s.phase = PHASES.GAME_START;  // wrong phase
  const r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.state, s);
});

test('成功的 REVEAL_BOTTOM 返回新 state，原 state 不变', () => {
  const s = make1V4State();
  const r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.notStrictEqual(r.state, s);
  // 原 state 保持 phase=FAN_A_RESOLVED, 底牌公开=false
  assert.strictEqual(s.phase, PHASES.FAN_A_RESOLVED);
  assert.strictEqual(s.底牌公开, false);
});

test('失败的 CHOOSE_IDENTITY 不追加 actions', () => {
  let s = make1V4State();
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  const before = s.actions.length;
  const r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'D', choice: 'PUBLIC' }
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(s.actions.length, before);
});

// =====================================================
// §7  完整流程
// =====================================================

section('7. 完整流程');

test('1V4 完整流程：REVEAL_BOTTOM → 主方选 HIDDEN → 1V4_暗打', () => {
  let s = make1V4State();
  let r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.ok, true);
  s = r.state;
  r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'A', choice: 'HIDDEN' }
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.mode, '1V4_暗打');
  assert.strictEqual(r.state.phase, PHASES.PLAY);
  assert.strictEqual(r.state.底牌公开, true);
});

test('2V3 完整流程：REVEAL_BOTTOM → 次方 B 选 PUBLIC → 2V3_明打', () => {
  let s = make2V3State();
  let r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  s = r.state;
  r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'B', choice: 'PUBLIC' }
  });
  assert.strictEqual(r.state.mode, '2V3_明打');
  assert.strictEqual(r.state.phase, PHASES.PLAY);
  // 次方身份公开 → 系统记录次方=B（不影响计分，只记 mode）
  assert.strictEqual(r.state.次方, 'B');
});

test('反A 后完整流程：REVEAL_BOTTOM → 直接 PLAY，mode=1V4_明打', () => {
  const s = makeAfterFanAState();
  const r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.state.phase, PHASES.PLAY);
  assert.strictEqual(r.state.mode, '1V4_明打');
  // 不需要 CHOOSE_IDENTITY
});

// C-4 v2 反馈发现：phase=FAN_A（无反A）也应该能翻底牌
test('REVEAL_BOTTOM 从 FAN_A（无反A）→ IDENTITY_CHOICE', () => {
  // 构造 phase=FAN_A（不是 FAN_A_RESOLVED），模拟 demo 流程里 ADVANCE 后无人反A 的场景
  const s = make1V4State();
  s.phase = PHASES.FAN_A;
  s.反A = null;  // 明确无反A
  const r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.phase, PHASES.IDENTITY_CHOICE);
  assert.strictEqual(r.state.mode, null);
  assert.strictEqual(r.state.次方, null);
  assert.strictEqual(r.state.底牌公开, true);
});

test('REVEAL_BOTTOM 从 FAN_A 2V3（无反A）→ IDENTITY_CHOICE, 次方=B', () => {
  const s = make2V3State();
  s.phase = PHASES.FAN_A;
  s.反A = null;
  const r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.phase, PHASES.IDENTITY_CHOICE);
  assert.strictEqual(r.state.次方, 'B');
  assert.strictEqual(r.state.mode, null);
});

test('CHOOSE_IDENTITY 拒：从 FAN_A（未翻底牌）尝试选身份', () => {
  // 补充边界：CHOOSE_IDENTITY 需要先翻底牌
  const s = make1V4State();
  s.phase = PHASES.FAN_A;  // 还没翻底牌
  s.反A = null;
  const r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'A', choice: 'PUBLIC' }
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, ERR.ILLEGAL_ACTION);
});

test('actions 历史记录正确：1V4 完整流程有 2 条新 actions', () => {
  let s = make1V4State();
  const before = s.actions.length;
  let r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  s = r.state;
  r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'A', choice: 'PUBLIC' }
  });
  // 加 2 条
  assert.strictEqual(r.state.actions.length, before + 2);
  assert.strictEqual(r.state.actions[before].type, ACTIONS.REVEAL_BOTTOM);
  assert.strictEqual(r.state.actions[before + 1].type, ACTIONS.CHOOSE_IDENTITY);
});

// =====================================================
// §8  状态字段传播
// =====================================================

section('8. 状态字段传播');

test('REVEAL_BOTTOM 后 state.次方 / state.底牌公开 正确传播', () => {
  const s = make1V4State();
  const r = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  assert.strictEqual(r.state.次方, null);
  assert.strictEqual(r.state.底牌公开, true);
  // 反A / 主A / mode 不变（这次 mode 还是 null）
  assert.strictEqual(r.state.反A, null);
  assert.strictEqual(r.state.主A.suit, 'H');
  assert.strictEqual(r.state.mode, null);
});

test('CHOOSE_IDENTITY 后所有字段保持一致', () => {
  let s = make1V4State();
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  const r = transition(s, {
    type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'A', choice: 'PUBLIC' }
  });
  // 主A 不变
  assert.strictEqual(r.state.主A.suit, 'H');
  assert.strictEqual(r.state.主A.establishedBy, 'A');
  // 次方 还是 null
  assert.strictEqual(r.state.次方, null);
  // 反A 仍是 null
  assert.strictEqual(r.state.反A, null);
  // 底牌公开 保持 true
  assert.strictEqual(r.state.底牌公开, true);
  // mode 变了
  assert.strictEqual(r.state.mode, '1V4_明打');
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


// ============================================================
// C-4 v4 底牌 transfer (SKILL §2.2/§4.5 新增)
// ============================================================
section("C-4 v4 底牌转入手牌");

test("REVEAL_BOTTOM 后, 每名玩家底牌 → 手牌 (手牌 +1, 底牌 = null)", () => {
  const before = makeState({ handA: makeSameRank(5, 21) });
  before.players[0].底牌 = makeCard("H", 3);
  let s = transition(before, { type: ACTIONS.START_GAME, payload: { startPlayerIndex: 0 } }).state;
  s = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} }).state;
  s = transition(s, { type: ACTIONS.ADVANCE, payload: {} }).state;
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  // A: 手牌 22, 底牌 null
  assert.strictEqual(s.players[0].hand.length, 22);
  assert.strictEqual(s.players[0].底牌, null);
  // 其它 4 玩家: 21+1 也合并
  for (let i = 1; i < 5; i++) {
    assert.strictEqual(s.players[i].hand.length, 22);
    assert.strictEqual(s.players[i].底牌, null);
  }
  assert.strictEqual(s.底牌公开, true);
});

test("REVEAL_BOTTOM 后, 底牌的 A 进入手牌参与大A 判定", () => {
  const before = makeState({ handA: makeSameRank(5, 20), handB: makeSameRank(6, 20) });
  before.players[0].底牌 = makeCard("H", 14);  // A 底牌 = H 大A
  before.players[1].底牌 = makeCard("S", 14);  // B 底牌 = S A (非主A花色)
  before.主A = { suit: "H", establishedBy: "A", viaMethod: "FORCED_CHECK" };
  let s = transition(before, { type: ACTIONS.START_GAME, payload: { startPlayerIndex: 0 } }).state;
  s = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} }).state;
  s = transition(s, { type: ACTIONS.ADVANCE, payload: {} }).state;
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  // A 手牌 21 (20+1 大A), 底牌 null
  assert.strictEqual(s.players[0].hand.length, 21);
  assert.strictEqual(s.players[0].底牌, null);
  // 底牌公开 = true
  assert.strictEqual(s.底牌公开, true);
  // 阵营判定: 1V4 (只有 A 有主A花色大A, B 的 S A 不算)
  // SKILL §4.5: 1 个大A 不足以定 1V4 → 走 IDENTITY_CHOICE
  // 这里只验证 transfer 成功
  assert.ok(s.phase === PHASES.IDENTITY_CHOICE || s.phase === PHASES.PLAY);
});
