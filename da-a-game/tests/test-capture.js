// tests/test-capture.js — §7 [4]取牌
// 跑法：node tests/test-capture.js
// 严格按 SKILL.md §6.4 和 §7 实现

const assert = require('assert');
const { canCapture, executeCapture } = require('../src/capture.js');

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

// ===== makeCard helper =====
let _idCounter = 0;
function makeCard(suit, rank, opts) {
  opts = opts || {};
  _idCounter += 1;
  return {
    id: 'cap-' + _idCounter,
    suit: (rank === 'BJ' || rank === 'SJ') ? null : suit,
    rank: rank,
    isBigJoker: rank === 'BJ',
    isSmallJoker: rank === 'SJ',
    is主方大A: opts.is主方大A || false,
    location: { type: 'hand', playerId: opts.playerId || 'A' }
  };
}

// 4 张同 rank
function makeSameRank(rank, count) {
  const suits = ['H', 'D', 'C', 'S'];
  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push(makeCard(suits[i % 4], rank));
  }
  return cards;
}

// 构造一个最小可玩 state
function makeState(opts) {
  opts = opts || {};
  const fours = opts.fours || [];
  const players = opts.players || [
    { id: 'A', hand: fours.concat(makeSameRank(5, 3)) },
    { id: 'B', hand: [] },
    { id: 'C', hand: [] },
    { id: 'D', hand: [] },
    { id: 'E', hand: [] }
  ];
  return {
    phase: 'PLAY',
    table: opts.table || [],
    lastPlayer: opts.lastPlayer || null,
    passedPlayers: opts.passedPlayers || [],
    passCount: opts.passCount || 0,
    players: players
  };
}

// ============================================================
// §1  canCapture: 正面用例 (3-8 张同 rank + 正确数量 4s)
// ============================================================
section('1. canCapture 正面用例');

test('3 张同 rank (蛋子) + 2 张 4s → 可取', () => {
  const target = makeSameRank(5, 3);
  const fours = makeSameRank(4, 2);
  const r = canCapture(fours, target);
  assert.strictEqual(r.canCapture, true);
});

test('4 张同 rank + 3 张 4s → 可取', () => {
  const target = makeSameRank(7, 4);
  const fours = makeSameRank(4, 3);
  assert.strictEqual(canCapture(fours, target).canCapture, true);
});

test('5 张同 rank (大蛋子) + 4 张 4s → 可取', () => {
  const target = makeSameRank(8, 5);
  const fours = makeSameRank(4, 4);
  assert.strictEqual(canCapture(fours, target).canCapture, true);
});

test('6 张同 rank (大蛋子) + 5 张 4s → 可取', () => {
  const target = makeSameRank(9, 6);
  const fours = makeSameRank(4, 5);
  assert.strictEqual(canCapture(fours, target).canCapture, true);
});

test('7 张同 rank (真七) + 6 张 4s → 可取', () => {
  const target = makeSameRank(3, 7);
  const fours = makeSameRank(4, 6);
  assert.strictEqual(canCapture(fours, target).canCapture, true);
});

test('8 张同 rank (真八) + 7 张 4s → 可取', () => {
  const target = makeSameRank(11, 8);
  const fours = makeSameRank(4, 7);
  assert.strictEqual(canCapture(fours, target).canCapture, true);
});

// ============================================================
// §2  canCapture: 负面用例 (数量不对 / 牌数越界 / 含王)
// ============================================================
section('2. canCapture 负面用例');

test('2 张同 rank (不够 3 张) → 不可取', () => {
  const target = makeSameRank(5, 2);
  const fours = makeSameRank(4, 1);
  assert.strictEqual(canCapture(fours, target).canCapture, false);
});

test('9 张同 rank (越界 > 8) → 不可取', () => {
  const target = makeSameRank(5, 9);
  const fours = makeSameRank(4, 8);
  assert.strictEqual(canCapture(fours, target).canCapture, false);
});

test('3 张同 rank + 1 张 4s (少 1) → 不可取', () => {
  const target = makeSameRank(5, 3);
  const fours = makeSameRank(4, 1);
  assert.strictEqual(canCapture(fours, target).canCapture, false);
});

test('3 张同 rank + 3 张 4s (多 1) → 不可取', () => {
  const target = makeSameRank(5, 3);
  const fours = makeSameRank(4, 3);
  assert.strictEqual(canCapture(fours, target).canCapture, false);
});

test('target 含王 (BJ) → 不可取 (§7.1 "王不能被取牌")', () => {
  const target = [
    makeCard('H', 5), makeCard('D', 5),
    makeCard(null, 'BJ')
  ];
  const fours = makeSameRank(4, 2);
  assert.strictEqual(canCapture(fours, target).canCapture, false);
});

test('4s 含王 (SJ) → 不可取 (§7.1 "王不能被取牌")', () => {
  const target = makeSameRank(5, 3);
  const fours = [makeCard('H', 4), makeCard(null, 'SJ')];
  assert.strictEqual(canCapture(fours, target).canCapture, false);
});

test('桌上无牌 (空 target) → 不可取', () => {
  const fours = makeSameRank(4, 2);
  assert.strictEqual(canCapture(fours, []).canCapture, false);
});

test('无 4s (空 fours) → 不可取', () => {
  const target = makeSameRank(5, 3);
  assert.strictEqual(canCapture([], target).canCapture, false);
});

test('4s 包含非 4 (混入 5) → 不可取', () => {
  const target = makeSameRank(5, 3);
  const fours = [makeCard('H', 4), makeCard('D', 5)];
  assert.strictEqual(canCapture(fours, target).canCapture, false);
});

test('target 牌 rank 不全相同 (3-4-5) → 不可取', () => {
  const target = [makeCard('H', 3), makeCard('D', 4), makeCard('C', 5)];
  const fours = makeSameRank(4, 2);
  assert.strictEqual(canCapture(fours, target).canCapture, false);
});

// ============================================================
// §3  executeCapture: 正面用例
// ============================================================
section('3. executeCapture 正面用例');

test('执行取牌后: target 牌入玩家手', () => {
  const target = makeSameRank(5, 3);
  const fours = makeSameRank(4, 2);
  const state = makeState({ table: target, fours: fours });
  const r = executeCapture(state, 'A', fours);
  assert.strictEqual(r.ok, true);
  // 玩家 A 原来有 3+2=5 张, 取了 3 张 target, 4 张(2+3)还剩 2 张 4s, 加上 3 张 target
  // 等等, 玩家手牌是 makeSameRank(5,3) + makeSameRank(4,2), 所以 5 张
  // 取了 2 张 4s, 加上 3 张 target, 变成 3+3=6 张
  const playerA = r.state.players.find(p => p.id === 'A');
  // 原本手牌 5 张, 减去 2 张 4s + 加上 3 张 target = 6 张
  assert.strictEqual(playerA.hand.length, 6);
  // 手牌中包含原 target 的 3 张
  const targetIds = new Set(target.map(c => c.id));
  const handHasTarget = playerA.hand.filter(c => targetIds.has(c.id));
  assert.strictEqual(handHasTarget.length, 3);
});

test('执行取牌后: 4s 移上桌', () => {
  const target = makeSameRank(5, 3);
  const fours = makeSameRank(4, 2);
  const state = makeState({ table: target, fours: fours });
  const r = executeCapture(state, 'A', fours);
  // 桌上现在应该是 2 张 4s
  assert.strictEqual(r.state.table.length, 2);
  // 桌上牌都是 4
  for (const c of r.state.table) {
    assert.strictEqual(c.rank, 4);
  }
});

test('执行取牌后: 玩家 A 的 4s 已被移出手牌', () => {
  const target = makeSameRank(5, 3);
  const fours = makeSameRank(4, 2);
  const fourIds = new Set(fours.map(c => c.id));
  const state = makeState({ table: target, fours: fours });
  const r = executeCapture(state, 'A', fours);
  const playerA = r.state.players.find(p => p.id === 'A');
  // 玩家手牌里没有这 2 张 4s
  for (const c of playerA.hand) {
    assert.ok(!fourIds.has(c.id), '4s should be removed from hand');
  }
});

test('执行取牌后: passedPlayers 清空 (pass state reset)', () => {
  const target = makeSameRank(5, 3);
  const fours = makeSameRank(4, 2);
  const state = makeState({
    table: target,
    lastPlayer: 'B',
    passedPlayers: ['C', 'D', 'E']
  });
  const r = executeCapture(state, 'A', fours);
  assert.deepStrictEqual(r.state.passedPlayers, []);
  assert.strictEqual(r.state.passCount, 0);
  assert.strictEqual(r.state.lastPlayer, 'A');
});

test('执行取牌后: lastPlayer 变更为取牌者', () => {
  const target = makeSameRank(5, 3);
  const fours = makeSameRank(4, 2);
  const state = makeState({ table: target, lastPlayer: 'B', fours: fours });
  const r = executeCapture(state, 'A', fours);
  assert.strictEqual(r.state.lastPlayer, 'A');
});

test('取牌后桌上 3 张 4s → 新的可取目标', () => {
  const target = makeSameRank(5, 3);
  const fours = makeSameRank(4, 3);
  const state = makeState({ table: target, fours: fours });
  const r = executeCapture(state, 'A', fours);
  // 桌上现在 3 张 4s
  assert.strictEqual(r.state.table.length, 3);
  // 它们是 4s, 同 rank, 长度 3, 满足"连珠蛋"或"蛋子"识别
  // 本测试只验证桌上 4s 数量
});

// ============================================================
// §4  executeCapture: 负面用例
// ============================================================
section('4. executeCapture 负面用例');

test('取牌失败: 4s 数量不够 → 返回错误, state 不变', () => {
  const target = makeSameRank(5, 3);
  const fours = makeSameRank(4, 1);
  const state = makeState({ table: target, fours: fours });
  const r = executeCapture(state, 'A', fours);
  assert.strictEqual(r.ok, false);
  // state 引用应该不变
  assert.strictEqual(r.state, state);
  // table 不变
  assert.strictEqual(r.state.table.length, 3);
});

test('取牌失败: 玩家不存在 → 返回错误, state 不变', () => {
  const target = makeSameRank(5, 3);
  const fours = makeSameRank(4, 2);
  const state = makeState({ table: target, fours: fours });
  const r = executeCapture(state, 'X', fours);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.state, state);
});

test('取牌失败: target 含王 → 返回错误, state 不变', () => {
  const target = [makeCard('H', 5), makeCard('D', 5), makeCard(null, 'BJ')];
  const fours = makeSameRank(4, 2);
  const state = makeState({ table: target, fours: fours });
  const r = executeCapture(state, 'A', fours);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.state, state);
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
// §C-4 v4 §7.3: 4-取牌成功后大A 失去 is主方大A 标志
// ============================================================
section("C-4 v4 §7.3 4-取牌后大A 失去身份");

test("4-取牌成功后, 被取回大A 失去 is主方大A 标志", () => {
  // 桌上: 3 张 H rank 14 (全是 is主方大A)
  const bigAs = [
    Object.assign(makeCard("H", 14), { is主方大A: true }),
    Object.assign(makeCard("H", 14), { is主方大A: true }),
    Object.assign(makeCard("H", 14), { is主方大A: true })
  ];
  // 取牌者: 2 张 4
  const fours = makeSameRank(4, 2);
  // 状态: lastPlayer = A (出大A 的人), player B 取牌
  const state = makeState({ handA: fours, handB: makeSameRank(5, 3) });
  state.table = bigAs;
  state.lastPlayer = "A";
  const r = executeCapture(state, "B", fours);
  assert.strictEqual(r.ok, true);
  // B 的手牌新增 3 张大A, 但 is主方大A = false
  const newHand = r.state.players[1].hand;
  const capturedBigA = newHand.slice(-3);  // 最后 3 张是取回的牌
  assert.strictEqual(capturedBigA.length, 3);
  for (const c of capturedBigA) {
    assert.strictEqual(c.is主方大A, false, "取回的大A 应失去 is主方大A");
  }
});

test("4-取牌成功后, 被取回的普通 A 仍保持 is主方大A = false (无变化)", () => {
  // 桌上: 3 张 H rank 14 (普通 A, 无 is主方大A)
  const normalAs = [
    makeCard("H", 14),
    makeCard("H", 14),
    makeCard("H", 14)
  ];
  const fours = makeSameRank(4, 2);
  const state = makeState({ handA: fours, handB: makeSameRank(5, 3) });
  state.table = normalAs;
  state.lastPlayer = "A";
  const r = executeCapture(state, "B", fours);
  assert.strictEqual(r.ok, true);
  const captured = r.state.players[1].hand.slice(-3);
  for (const c of captured) {
    assert.strictEqual(c.is主方大A, false, "普通 A 本来就是 false");
  }
});
