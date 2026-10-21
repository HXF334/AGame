// tests/test-first-player.js — §5 首轮出牌权 测试
// 跑法：node tests/test-first-player.js
//
// §5 规则（SKILL §5）：
//   1. 成功反A 的玩家，或直接亮双大A 独打的玩家
//   2. 若为 2V3 明打，由次方先出
//   3. 若次方暗打，由亮A主方先出
//   4. 无人亮A、强制排查确定主A 时，无独立次A时由主方首出

const assert = require('assert');
const { PHASES } = require('../src/phases.js');
const { determineFirstPlayer, newGameState } = require('../src/transition.js');

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

// 构造给定 state 的辅助函数
function makeStateWith(spec) {
  return {
    phase: spec.phase || PHASES.PLAY,
    players: [],
    startPlayerIndex: 0,
    deck: [],
    dealOrder: [],
    主A: spec.主A === undefined ? null : spec.主A,
    反A: spec.反A === undefined ? null : spec.反A,
    次方: spec.次方 === undefined ? null : spec.次方,
    mode: spec.mode === undefined ? null : spec.mode,
    底牌公开: spec.底牌公开 === undefined ? true : spec.底牌公开,
    actions: []
  };
}

// =====================================================
// §1  优先级 1：反A 成功者优先
// =====================================================

section('1. 反A 成功者优先（1V4_明打 / 2V3_明打 / 2V3_暗打 反A 触发）');

test('1V4_明打（反A 触发）→ 首出 = 反A 玩家（=主方）', () => {
  const s = makeStateWith({
    主A: { suit: 'D', establishedBy: 'B', viaMethod: 'FAN_A' },  // B 反A → B 是主A.establishedBy
    反A: { by: 'B', 旧主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' } },
    mode: '1V4_明打',
    次方: null
  });
  const r = determineFirstPlayer(s);
  assert.strictEqual(r, 'B');  // 反A 玩家 = B
});

test('2V3 明打（假设由反A 触发 1V4_明打 后）→ 首出 = 反A 玩家（=主方）', () => {
  // 注：反A 成功后一定是 1V4_明打，不可能直接是 2V3_明打。
  // 本测试验证：若 state.mode 标记为 2V3_明打 但 反A 已发生，首出仍按反A 玩家。
  // 这是 §5 优先级 1 覆盖 优先级 2 的边界用例。
  const s = makeStateWith({
    主A: { suit: 'D', establishedBy: 'B', viaMethod: 'FAN_A' },
    反A: { by: 'B', 旧主A: {} },
    mode: '2V3_明打',  // 不一致，但反A 优先级最高
    次方: 'C'
  });
  const r = determineFirstPlayer(s);
  assert.strictEqual(r, 'B');  // 反A 玩家优先于 次方
});

// =====================================================
// §2  优先级 2：2V3 明打 → 次方
// =====================================================

section('2. 2V3 明打 → 次方');

test('2V3_明打（无反A）→ 首出 = 次方', () => {
  const s = makeStateWith({
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null,
    次方: 'B',
    mode: '2V3_明打'
  });
  const r = determineFirstPlayer(s);
  assert.strictEqual(r, 'B');  // 次方先出
});

test('2V3_明打，次方是 E → 首出 = E', () => {
  const s = makeStateWith({
    主A: { suit: 'D', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    反A: null,
    次方: 'E',
    mode: '2V3_明打'
  });
  const r = determineFirstPlayer(s);
  assert.strictEqual(r, 'E');
});

// =====================================================
// §3  优先级 3：主方（1V4 各种 / 2V3 暗打）
// =====================================================

section('3. 主方（1V4 各种 / 2V3 暗打）');

test('1V4_明打（直接亮双大A）→ 首出 = 主方', () => {
  // 直接亮双大A 在当前 C-2 实现里没显式 action，但 mode=1V4_明打 + 无反A 表示这条路径
  const s = makeStateWith({
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'DIRECT_DOUBLE' },
    反A: null,
    次方: null,
    mode: '1V4_明打'
  });
  const r = determineFirstPlayer(s);
  assert.strictEqual(r, 'A');  // 主方 = A
});

test('1V4_暗打 → 首出 = 主方', () => {
  const s = makeStateWith({
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null,
    次方: null,
    mode: '1V4_暗打'
  });
  const r = determineFirstPlayer(s);
  assert.strictEqual(r, 'A');
});

test('1V4（mode=null，强制排查）→ 首出 = 主方', () => {
  // 强制排查默认 mode=null
  const s = makeStateWith({
    主A: { suit: 'D', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    反A: null,
    次方: null,
    mode: null
  });
  const r = determineFirstPlayer(s);
  assert.strictEqual(r, 'A');
});

test('2V3_暗打 → 首出 = 主方（不是次方）', () => {
  const s = makeStateWith({
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null,
    次方: 'B',  // 次方存在，但暗打
    mode: '2V3_暗打'
  });
  const r = determineFirstPlayer(s);
  assert.strictEqual(r, 'A');  // §5 规则 3：次方暗打 → 主方先出
});

test('2V3_暗打，次方是 E，主方是 A → 首出 = A（不是 E）', () => {
  // 这正是你 C-4 v2 截屏里看到的：主A=D by A, 次方=E, 2V3_暗打 → 首出应是 A
  const s = makeStateWith({
    主A: { suit: 'D', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    反A: null,
    次方: 'E',
    mode: '2V3_暗打'
  });
  const r = determineFirstPlayer(s);
  assert.strictEqual(r, 'A');
});

// =====================================================
// §4  边界：主A 未确立
// =====================================================

section('4. 边界');

test('主A=null → 返回 null（防御）', () => {
  const s = makeStateWith({ 主A: null });
  const r = determineFirstPlayer(s);
  assert.strictEqual(r, null);
});

test('newGameState() → 返回 null', () => {
  const s = newGameState();
  const r = determineFirstPlayer(s);
  assert.strictEqual(r, null);
});

test('determineFirstPlayer(null) → 返回 null（不抛错）', () => {
  const r = determineFirstPlayer(null);
  assert.strictEqual(r, null);
});

test('determineFirstPlayer(undefined) → 返回 null（不抛错）', () => {
  const r = determineFirstPlayer(undefined);
  assert.strictEqual(r, null);
});

// =====================================================
// §5  与游戏实际场景的对应
// =====================================================

section('5. 真实场景对照');

test('你 C-4 v2 截屏里的实际场景：主A=D by A, 次方=E, 2V3_暗打 → 首出 = A', () => {
  const s = makeStateWith({
    主A: { suit: 'D', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    反A: null,
    次方: 'E',
    mode: '2V3_暗打',
    底牌公开: true
  });
  const r = determineFirstPlayer(s);
  assert.strictEqual(r, 'A');  // §5 规则 3
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
