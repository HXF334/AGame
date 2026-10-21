// tests/test-win-loss.js — §10 胜负判定
// 跑法：node tests/test-win-loss.js

const assert = require('assert');
const { checkGameEnd, getCamp, isAllOut } = require('../src/win-loss.js');

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

// makeCard helper
let _idCounter = 0;
function makeCard(suit, rank) {
  _idCounter += 1;
  return {
    id: 'wl-' + _idCounter,
    suit: (rank === 'BJ' || rank === 'SJ') ? null : suit,
    rank: rank,
    isBigJoker: rank === 'BJ',
    isSmallJoker: rank === 'SJ',
    is主方大A: false,
    location: { type: 'hand' }
  };
}

// 构造状态: 每个玩家有 hand 数组
function makeState(opts) {
  opts = opts || {};
  const players = ['A', 'B', 'C', 'D', 'E'].map((id, i) => ({
    id,
    hand: (opts.hands && opts.hands[i]) || []
  }));
  return {
    phase: 'PLAY',
    mode: opts.mode,
    主方: opts.主方,
    次方: opts.次方,
    抓方: opts.抓方,
    头名: opts.头名,
    次方公开: opts.次方公开,
    players
  };
}

// ============================================================
// §1  getCamp / isAllOut (辅助函数)
// ============================================================
section('1. 辅助函数');

test('getCamp: 主方数组中 → 主方', () => {
  const state = makeState({ 主方: ['A'], 次方: 'B', 抓方: ['C', 'D', 'E'] });
  assert.strictEqual(getCamp(state, 'A'), '主方');
});

test('getCamp: 次方 → 主方', () => {
  const state = makeState({ 主方: ['A'], 次方: 'B', 抓方: ['C', 'D', 'E'] });
  assert.strictEqual(getCamp(state, 'B'), '主方');
});

test('getCamp: 抓方数组中 → 抓方', () => {
  const state = makeState({ 主方: ['A'], 次方: 'B', 抓方: ['C', 'D', 'E'] });
  assert.strictEqual(getCamp(state, 'C'), '抓方');
});

test('getCamp: 未知玩家 → null', () => {
  const state = makeState({ 主方: ['A'], 次方: 'B', 抓方: ['C', 'D', 'E'] });
  assert.strictEqual(getCamp(state, 'X'), null);
});

test('isAllOut: 全空手 → true', () => {
  const state = makeState({ 主方: ['A'] });
  assert.strictEqual(isAllOut(state, ['A']), true);
});

test('isAllOut: 有一人非空 → false', () => {
  const state = makeState({ 主方: ['A'] });
  state.players[0].hand = [makeCard('H', 5)];
  assert.strictEqual(isAllOut(state, ['A']), false);
});

test('isAllOut: 空数组 → false (边界)', () => {
  const state = makeState({ 主方: ['A'] });
  assert.strictEqual(isAllOut(state, []), false);
});

// ============================================================
// §2  1V4 明打 (per §10.2)
// ============================================================
section('2. 1V4 明打 (per §10.2)');

test('主方先出完 → 主方胜 (A 主方, B 抓方 A 空了 B 还有牌)', () => {
  const hands = [
    [],                              // A (主方) 空了
    [makeCard('H', 5), makeCard('D', 5)],  // B 还有
    [makeCard('H', 7)],               // C
    [makeCard('H', 8)],               // D
    [makeCard('H', 9)]                // E
  ];
  const state = makeState({
    mode: '1V4_明打',
    主方: ['A'],
    次方: null,
    抓方: ['B', 'C', 'D', 'E'],
    hands
  });
  const r = checkGameEnd(state);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '主方');
});

test('抓方先出完 → 抓方胜 (B 抓方 空了 A 还有牌)', () => {
  const hands = [
    [makeCard('H', 5)],               // A (主方) 还有
    [],                              // B (抓方) 空了
    [makeCard('H', 7)],               // C
    [makeCard('H', 8)],               // D
    [makeCard('H', 9)]                // E
  ];
  const state = makeState({
    mode: '1V4_明打',
    主方: ['A'],
    次方: null,
    抓方: ['B', 'C', 'D', 'E'],
    hands
  });
  const r = checkGameEnd(state);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '抓方');
});

test('没人出完 → 轮未结束', () => {
  const hands = [
    [makeCard('H', 5)],               // A 还有
    [makeCard('H', 6)],               // B 还有
    [makeCard('H', 7)],               // C
    [makeCard('H', 8)],               // D
    [makeCard('H', 9)]                // E
  ];
  const state = makeState({
    mode: '1V4_明打',
    主方: ['A'],
    次方: null,
    抓方: ['B', 'C', 'D', 'E'],
    hands
  });
  const r = checkGameEnd(state);
  assert.strictEqual(r.ended, false);
});

// ============================================================
// §3  1V4 暗打 (per §10.3)
// ============================================================
section('3. 1V4 暗打 (per §10.3)');

test('独打者先出完 → 主方胜 (A 主方 空了, 4 抓方还有牌)', () => {
  const hands = [
    [],                              // A (主方/独打) 空了
    [makeCard('H', 5)],               // B 还有
    [makeCard('H', 7)],               // C
    [makeCard('H', 8)],               // D
    [makeCard('H', 9)]                // E
  ];
  const state = makeState({
    mode: '1V4_暗打',
    主方: ['A'],
    次方: null,
    抓方: ['B', 'C', 'D', 'E'],
    hands
  });
  const r = checkGameEnd(state);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '主方');
});

test('4 抓方全部出完, 独打者未出完 → 抓方胜', () => {
  const hands = [
    [makeCard('H', 5)],               // A (独打) 还有
    [],                              // B (抓方) 空了
    [],                              // C 空了
    [],                              // D 空了
    []                               // E 空了
  ];
  const state = makeState({
    mode: '1V4_暗打',
    主方: ['A'],
    次方: null,
    抓方: ['B', 'C', 'D', 'E'],
    hands
  });
  const r = checkGameEnd(state);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '抓方');
});

test('抓方有人先出完, 独打者也出完, 但仍有抓方未出完 → 平局', () => {
  const hands = [
    [],                              // A (独打) 也出完了
    [],                              // B (抓方) 空了 (先出完)
    [],                              // C 空了
    [makeCard('H', 5)],               // D 还有
    [makeCard('H', 6)]                // E 还有
  ];
  const state = makeState({
    mode: '1V4_暗打',
    主方: ['A'],
    次方: null,
    抓方: ['B', 'C', 'D', 'E'],
    hands
  });
  // 显式指定 B 是先出完的 (§10.3 第三种情况)
  state.firstOut = 'B';
  const r = checkGameEnd(state);
  // 抓方还有 D, E 没出完, 独打者也出完了
  // 按 §10.3 "抓方有人先出完, 独打者也出完, 但仍有其他抓方未出完 → 平局"
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, 'draw');
});

// ============================================================
// §4  2V3 (per §10.4, 用 §10.1 通用规则)
// ============================================================
section('4. 2V3 (per §10.4)');

test('主方全部出完, 头名 A (主方) → 主方胜 (§10.1)', () => {
  const hands = [
    [],                              // A (主方) 空
    [],                              // B (次方) 空
    [makeCard('H', 5)],               // C (抓方) 还有
    [makeCard('H', 6)],               // D 还有
    [makeCard('H', 7)]                // E 还有
  ];
  const state = makeState({
    mode: '2V3_明打',
    主方: ['A'],
    次方: 'B',
    抓方: ['C', 'D', 'E'],
    头名: 'A',  // [C-4 v5] A 先出完
    hands
  });
  const r = checkGameEnd(state);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '主方');  // [C-4 v5] 头名 A (主方) → 主方胜
});

test('抓方全部出完, 头名 C (抓方) → 抓方胜 (§10.1)', () => {
  const hands = [
    [makeCard('H', 5)],               // A (主方) 还有
    [makeCard('H', 6)],               // B (次方) 还有
    [],                              // C (抓方) 空
    [],                              // D 空
    []                               // E 空
  ];
  const state = makeState({
    mode: '2V3_明打',
    主方: ['A'],
    次方: 'B',
    抓方: ['C', 'D', 'E'],
    头名: 'C',  // [C-4 v5] C 先出完 (头名在抓方)
    hands
  });
  const r = checkGameEnd(state);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '抓方');
});

test('都没出完 → 轮未结束', () => {
  const hands = [
    [makeCard('H', 5)],               // A 还有
    [makeCard('H', 6)],               // B 还有
    [makeCard('H', 7)],               // C 还有
    [makeCard('H', 8)],               // D 还有
    [makeCard('H', 9)]                // E 还有
  ];
  const state = makeState({
    mode: '2V3_明打',
    主方: ['A'],
    次方: 'B',
    抓方: ['C', 'D', 'E'],
    hands
  });
  const r = checkGameEnd(state);
  assert.strictEqual(r.ended, false);
});

// ============================================================
// §5  通用边界
// ============================================================
section('5. 边界');

test('无 mode 设置 → 轮未结束 (不会 crash)', () => {
  const hands = [[], [], [], [], []];  // 全空
  const state = makeState({ hands });
  const r = checkGameEnd(state);
  assert.strictEqual(r.ended, false);
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
// §C-4 v5 §10.1 平局场景 (新规则: 头名与末名同阵营 → 平局)
// ============================================================
section("C-4 v5 §10.1 平局场景");

test("主方全部出完, 头名 E (抓方) → 平局 (头名末名同阵营)", () => {
  const hands = [
    [],                              // A (主方) 空
    [],                              // B (次方) 空
    [makeCard('H', 5)],               // C (抓方) 还有
    [makeCard('H', 6)],               // D 还有
    []                               // E 先出完 (头名=抓方)
  ];
  const state = makeState({
    mode: '2V3_明打',
    主方: ['A'],
    次方: 'B',
    抓方: ['C', 'D', 'E'],
    头名: 'E',  // E 先出完 (头名在抓方)
    hands
  });
  const r = checkGameEnd(state);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, 'draw');
});

test("抓方全部出完, 头名 A (主方) → 平局 (头名末名同阵营)", () => {
  const hands = [
    [makeCard('H', 5)],               // A (主方) 还有 (但先出了1张大A)
    [makeCard('H', 6)],               // B (次方) 还有
    [],                              // C 空
    [],                              // D 空
    []                               // E 空
  ];
  const state = makeState({
    mode: '2V3_明打',
    主方: ['A'],
    次方: 'B',
    抓方: ['C', 'D', 'E'],
    头名: 'A',  // 头名在主方
    hands
  });
  const r = checkGameEnd(state);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, 'draw');
});
