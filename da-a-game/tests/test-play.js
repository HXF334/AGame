// tests/test-play.js — §8 出牌轮次与过牌
// 跑法：node tests/test-play.js

const assert = require('assert');
const { handlePlay, handlePass, isRoundOver } = require('../src/play.js');

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
    id: 'play-' + _idCounter,
    suit: (rank === 'BJ' || rank === 'SJ') ? null : suit,
    rank: rank,
    isBigJoker: rank === 'BJ',
    isSmallJoker: rank === 'SJ',
    is主方大A: opts.is主方大A || false,
    location: { type: 'hand', playerId: opts.playerId || 'A' }
  };
}

function makeSameRank(rank, count) {
  const suits = ['H', 'D', 'C', 'S'];
  const cards = [];
  for (let i = 0; i < count; i++) cards.push(makeCard(suits[i % 4], rank));
  return cards;
}

// 构造 play 状态: 指定每个玩家的手牌
function makeState(opts) {
  opts = opts || {};
  const handA = opts.handA || [];
  const handB = opts.handB || [];
  const handC = opts.handC || [];
  const handD = opts.handD || [];
  const handE = opts.handE || [];
  return {
    phase: 'PLAY',
    table: opts.table || [],
    lastPlayer: opts.lastPlayer || null,
    passedPlayers: opts.passedPlayers || [],
    passCount: opts.passCount || 0,
    players: [
      { id: 'A', hand: handA },
      { id: 'B', hand: handB },
      { id: 'C', hand: handC },
      { id: 'D', hand: handD },
      { id: 'E', hand: handE }
    ]
  };
}

// ============================================================
// §1  handlePlay: 正面用例
// ============================================================
section('1. handlePlay 正面用例');

test('出牌: A 打出 3 张 5 (蛋子), table 设置, lastPlayer = A', () => {
  const hand = makeSameRank(5, 3);
  const state = makeState({ handA: hand });
  const r = handlePlay(state, { playerId: 'A', cardIds: hand.map(c => c.id) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.table.length, 3);
  assert.strictEqual(r.state.lastPlayer, 'A');
  assert.deepStrictEqual(r.state.passedPlayers, []);
  assert.strictEqual(r.state.players[0].hand.length, 0);  // A 出手牌后手牌空
});

test('table 空时出牌 OK (新的一轮第一手)', () => {
  const hand = makeSameRank(7, 3);
  const state = makeState({ handA: hand });
  // 没有上轮牌
  assert.strictEqual(state.table.length, 0);
  const r = handlePlay(state, { playerId: 'A', cardIds: hand.map(c => c.id) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.table.length, 3);
});

test('A 出 3 张 5, B 跟 3 张 6 (蛋子压蛋子, rank 高胜): table 更新为 B 的牌, lastPlayer = B, passedPlayers 清空', () => {
  const hand5 = makeSameRank(5, 3);
  const hand6 = makeSameRank(6, 3);
  let state = makeState({ handA: hand5, handB: hand6 });
  // A 出 5
  let r = handlePlay(state, { playerId: 'A', cardIds: hand5.map(c => c.id) });
  assert.strictEqual(r.ok, true);
  state = r.state;
  // B 跟 6
  r = handlePlay(state, { playerId: 'B', cardIds: hand6.map(c => c.id) });
  assert.strictEqual(r.ok, true);
  state = r.state;
  assert.strictEqual(state.lastPlayer, 'B');
  assert.strictEqual(state.table.length, 3);
  // 桌上应该是 6 不是 5
  assert.strictEqual(state.table[0].rank, 6);
});

test('A 出 3 张 5, B 跟 3 张 4 (蛋子 rank 低, 不能压) → 错误', () => {
  const hand5 = makeSameRank(5, 3);
  const hand4 = makeSameRank(4, 3);
  let state = makeState({ handA: hand5, handB: hand4 });
  let r = handlePlay(state, { playerId: 'A', cardIds: hand5.map(c => c.id) });
  state = r.state;
  r = handlePlay(state, { playerId: 'B', cardIds: hand4.map(c => c.id) });
  assert.strictEqual(r.ok, false);
  // state 应不变
  assert.strictEqual(state, r.state);
});

test('不同张数的蛋子 (3 vs 4) 能互压 (大蛋子>蛋子 per §6.3)', () => {
  // A 3 张 5 (蛋子), B 4 张 5 (大蛋子). 大蛋子能压蛋子.
  const handA = makeSameRank(5, 3);
  const handB = makeSameRank(5, 4);
  let state = makeState({ handA: handA, handB: handB });
  let r = handlePlay(state, { playerId: 'A', cardIds: handA.map(c => c.id) });
  state = r.state;
  r = handlePlay(state, { playerId: 'B', cardIds: handB.map(c => c.id) });
  assert.strictEqual(r.ok, true);  // 大蛋子(4) > 蛋子(3) per §6.3
});

// ============================================================
// §2  handlePlay: 取牌 (4s 攻取)
// ============================================================
section('2. handlePlay 取牌');

test('A 出 2 张 4 取 B 的 3 张 5 (capture): target 移入 A 手, 4s 上桌', () => {
  const target = makeSameRank(5, 3);
  const fours = makeSameRank(4, 2);
  let state = makeState({ handA: fours.concat(makeSameRank(9, 5)) });
  // 先让 A 出 4 张 4 (假八), B 过牌, A 取 B 的 4 张 4
  // 简化: 直接让 A 第一次出 3 张 5, B 过, A 第二次取
  // 更简化: 让 A 第一次直接取 (table 已有 B 的 3 张 5)
  state.table = target;
  state.lastPlayer = 'B';
  const r = handlePlay(state, { playerId: 'A', cardIds: fours.map(c => c.id) });
  assert.strictEqual(r.ok, true);
  // A 手牌: 原 2 张 4s 移上桌, 加 3 张 target, 原本 5 张 9 仍在
  // 所以 A 手牌 = 5 张 9 + 3 张 5 = 8 张
  const playerA = r.state.players.find(p => p.id === 'A');
  assert.strictEqual(playerA.hand.length, 8);
  // 桌上: 2 张 4s
  assert.strictEqual(r.state.table.length, 2);
  assert.strictEqual(r.state.table[0].rank, 4);
  assert.strictEqual(r.state.table[1].rank, 4);
  // lastPlayer 变成 A
  assert.strictEqual(r.state.lastPlayer, 'A');
});

test('A 出 2 张 4 取, 但只有 1 张 4 在手牌 → 错误, state 不变', () => {
  const target = makeSameRank(5, 3);
  const fours = makeSameRank(4, 2);
  const oneFour = [fours[0]];
  const state = makeState({
    handA: oneFour.concat(makeSameRank(9, 5)),
    table: target,
    lastPlayer: 'B'
  });
  const before = state;
  const r = handlePlay(state, { playerId: 'A', cardIds: fours.map(c => c.id) });
  assert.strictEqual(r.ok, false);
  // state 引用应不变
  assert.strictEqual(r.state, before);
});

// ============================================================
// §3  handlePlay: 负面用例
// ============================================================
section('3. handlePlay 负面用例');

test('玩家不存在 → 错误', () => {
  const hand = makeSameRank(5, 3);
  const state = makeState({ handA: hand });
  const r = handlePlay(state, { playerId: 'X', cardIds: hand.map(c => c.id) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.state, state);
});

test('出的牌不在手牌 → 错误', () => {
  const handInState = makeSameRank(5, 3);
  const fakeCard = makeCard('H', 5);  // 不在 state 中
  const state = makeState({ handA: handInState });
  const r = handlePlay(state, { playerId: 'A', cardIds: [fakeCard.id] });
  assert.strictEqual(r.ok, false);
});

test('出的牌型不合法 (杂牌) → 错误', () => {
  const hand = [makeCard('H', 5), makeCard('D', 8), makeCard('C', 10)];  // 杂
  const state = makeState({ handA: hand });
  const r = handlePlay(state, { playerId: 'A', cardIds: hand.map(c => c.id) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.state, state);
});

test('出 1 张 5 (SINGLE) 是合法的, 牌数与 cardIds 一致', () => {
  const hand = makeSameRank(5, 3);
  const state = makeState({ handA: hand });
  const r = handlePlay(state, { playerId: 'A', cardIds: [hand[0].id] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.table.length, 1);
});

// ============================================================
// §4  handlePass: 正面用例
// ============================================================
section('4. handlePass 正面用例');

test('A 出牌后 B 过牌: passedPlayers += [B], passCount = 1', () => {
  const hand = makeSameRank(5, 3);
  let state = makeState({ handA: hand, handB: makeSameRank(6, 3), handC: makeSameRank(7, 3), handD: makeSameRank(8, 3), handE: makeSameRank(9, 3) });
  let r = handlePlay(state, { playerId: 'A', cardIds: hand.map(c => c.id) });
  state = r.state;
  r = handlePass(state, { playerId: 'B' });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.state.passedPlayers, ['B']);
  assert.strictEqual(r.state.passCount, 1);
  // lastPlayer 应不变 (还是 A)
  assert.strictEqual(r.state.lastPlayer, 'A');
});

test('A 出牌, B, C, D, E 全部过, round 结束: lastPlayer = A, table 清空, passCount 重置为 0', () => {
  const hand = makeSameRank(5, 3);
  // B/C/D/E 各有手牌 (按 SKILL §8 "尚未出完" 含义, 它们都还需过牌)
  let state = makeState({ handA: hand, handB: makeSameRank(6, 3), handC: makeSameRank(7, 3), handD: makeSameRank(8, 3), handE: makeSameRank(9, 3) });
  let r = handlePlay(state, { playerId: 'A', cardIds: hand.map(c => c.id) });
  state = r.state;
  // B, C, D, E 都过 (4 人, A 是 lastPlayer, 所以 B/C/D/E 4 人过才算全部过)
  r = handlePass(state, { playerId: 'B' });
  state = r.state;
  assert.strictEqual(state.passCount, 1);
  assert.deepStrictEqual(state.passedPlayers, ['B']);
  r = handlePass(state, { playerId: 'C' });
  state = r.state;
  assert.strictEqual(state.passCount, 2);
  r = handlePass(state, { playerId: 'D' });
  state = r.state;
  assert.strictEqual(state.passCount, 3);
  r = handlePass(state, { playerId: 'E' });
  state = r.state;
  // 4 人全部过牌, 轮结束
  assert.strictEqual(r.ok, true);
  // table 清空
  assert.strictEqual(state.table.length, 0);
  // lastPlayer 不变 (新轮由 A 开始)
  assert.strictEqual(state.lastPlayer, 'A');
  // passedPlayers 清空, passCount 重置为 0
  assert.deepStrictEqual(state.passedPlayers, []);
  assert.strictEqual(state.passCount, 0);
});

// ============================================================
// §5  handlePass: 负面用例
// ============================================================
section('5. handlePass 负面用例');

test('玩家不存在 → 错误', () => {
  const hand = makeSameRank(5, 3);
  const state = makeState({ handA: hand });
  const r = handlePass(state, { playerId: 'X' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.state, state);
});

test('table 空 (无当前手牌) → 不能过牌', () => {
  const state = makeState();
  const r = handlePass(state, { playerId: 'B' });
  assert.strictEqual(r.ok, false);
});

test('lastPlayer (出牌者) 自己不能过牌', () => {
  const hand = makeSameRank(5, 3);
  let state = makeState({ handA: hand });
  let r = handlePlay(state, { playerId: 'A', cardIds: hand.map(c => c.id) });
  state = r.state;
  // A 是 lastPlayer, A 不能过牌
  r = handlePass(state, { playerId: 'A' });
  assert.strictEqual(r.ok, false);
});

test('已过牌的玩家不能再次过牌', () => {
  const hand = makeSameRank(5, 3);
  let state = makeState({ handA: hand, handB: makeSameRank(6, 3) });
  let r = handlePlay(state, { playerId: 'A', cardIds: hand.map(c => c.id) });
  state = r.state;
  r = handlePass(state, { playerId: 'B' });
  state = r.state;
  r = handlePass(state, { playerId: 'B' });
  assert.strictEqual(r.ok, false);
});

// ============================================================
// §6  isRoundOver
// ============================================================
section('6. isRoundOver');

test('无人过牌, table 非空 → 轮未结束', () => {
  const hand = makeSameRank(5, 3);
  const state = makeState({ handA: hand });
  // 设置 table 非空 (需要先有出牌)
  state.table = hand;
  state.lastPlayer = 'A';
  assert.strictEqual(isRoundOver(state), false);
});

test('所有非 lastPlayer 都过牌 → 轮结束', () => {
  const hand = makeSameRank(5, 3);
  let state = makeState({ handA: hand, handB: [], handC: [], handD: [], handE: [] });
  let r = handlePlay(state, { playerId: 'A', cardIds: hand.map(c => c.id) });
  state = r.state;
  state = handlePass(state, { playerId: 'B' }).state;
  state = handlePass(state, { playerId: 'C' }).state;
  state = handlePass(state, { playerId: 'D' }).state;
  state = handlePass(state, { playerId: 'E' }).state;
  assert.strictEqual(isRoundOver(state), true);
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
// §6.1 SKILL §8: 已出完玩家不计入"需过牌" (修复 handlePass)
// ============================================================
section('6.1 SKILL §8: 已出完玩家不计入需过牌');

test('A 出完牌 (0 张), B 出, C/D/E 三人过牌 → 轮结束 (排除 A)', () => {
  // 初始: A 只有 1 张 (出完就 0), B/C/D/E 各有牌
  const aHand = makeSameRank(5, 1);  // A 1 张
  const bHand = makeSameRank(7, 3);
  const cHand = makeSameRank(8, 3);
  const dHand = makeSameRank(9, 3);
  const eHand = makeSameRank(10, 3);
  let state = makeState({ handA: aHand, handB: bHand, handC: cHand, handD: dHand, handE: eHand });
  // 1) A 出 1 张, A 出完 (0 张)
  let r = handlePlay(state, { playerId: 'A', cardIds: aHand.map(function (c) { return c.id; }) });
  assert.strictEqual(r.ok, true);
  state = r.state;
  assert.strictEqual(state.players[0].hand.length, 0, 'A 应为 0 张');
  assert.strictEqual(state.lastPlayer, 'A');
  // 2) B 出 3 张 7 (比 A 的 5 大)
  r = handlePlay(state, { playerId: 'B', cardIds: bHand.map(function (c) { return c.id; }) });
  assert.strictEqual(r.ok, true);
  state = r.state;
  assert.strictEqual(state.lastPlayer, 'B');
  assert.strictEqual(state.table.length, 3);
  // 3) C 过牌
  r = handlePass(state, { playerId: 'C' });
  assert.strictEqual(r.ok, true);
  state = r.state;
  assert.strictEqual(state.table.length, 3, 'C 过牌后桌牌不变');
  assert.strictEqual(state.passedPlayers.length, 1);
  // 4) D 过牌 (passCount=2)
  r = handlePass(state, { playerId: 'D' });
  state = r.state;
  assert.strictEqual(state.table.length, 3, 'D 过牌后桌牌不变');
  assert.strictEqual(state.passedPlayers.length, 2);
  // 5) E 过牌 (passCount=3, 排除 A 后活玩家非 lastPlayer 有 3 个: C/D/E, 都过完)
  r = handlePass(state, { playerId: 'E' });
  assert.strictEqual(r.ok, true);
  state = r.state;
  // 轮应结束: table 清空, passCount=0, lastPlayer 保持 B
  assert.strictEqual(state.table.length, 0, '3 次过牌后桌牌应清空 (排除 A)');
  assert.strictEqual(state.passCount, 0);
  assert.strictEqual(state.passedPlayers.length, 0);
  assert.strictEqual(state.lastPlayer, 'B', 'lastPlayer 保持 B, 下一轮 B 先出');
});

test('A 出完, B 出, 只有 C/D 过牌 (E 还没过) → 轮未结束', () => {
  // 仅 2 次过牌 < 3 个活非 lastPlayer, 轮不该结束
  const aHand = makeSameRank(5, 1);
  const bHand = makeSameRank(7, 3);
  let state = makeState({ handA: aHand, handB: bHand, handC: makeSameRank(8, 3), handD: makeSameRank(9, 3), handE: makeSameRank(10, 3) });
  let r = handlePlay(state, { playerId: 'A', cardIds: aHand.map(function (c) { return c.id; }) });
  state = r.state;
  r = handlePlay(state, { playerId: 'B', cardIds: bHand.map(function (c) { return c.id; }) });
  state = r.state;
  r = handlePass(state, { playerId: 'C' });
  state = r.state;
  r = handlePass(state, { playerId: 'D' });
  state = r.state;
  // 此时仅 2 次过牌, 还差 E 一次, 轮未结束
  assert.strictEqual(state.table.length, 3, 'D 过完桌牌仍 3 张, 等 E');
  assert.strictEqual(state.passedPlayers.length, 2);
});


// ============================================================
// §C-4 v4 §7.3: 2V3 暗打次方出大A → 次方公开 (mode 不变)
// ============================================================
section("C-4 v4 §7.3 次方出大A → 次方公开");

test("2V3 暗打: 次方 C 打出大A → state.次方公开 = true, mode 仍 2V3_暗打", () => {
  // 大A 在 C 手牌 (H rank 14, is主方大A = true)
  const bigA = makeCard("H", 14);
  bigA.is主方大A = true;
  // 其它手牌 (rank 5)
  const filler = makeSameRank(5, 3);
  // 状态: phase=PLAY, mode=2V3_暗打, 次方=C, C 手牌 [bigA, ...filler]
  const state = makeState({
    handA: makeSameRank(5, 3),
    handB: makeSameRank(6, 3),
    handC: [bigA].concat(filler),
    handD: makeSameRank(8, 3),
    handE: makeSameRank(9, 3)
  });
  state.phase = "PLAY";
  state.mode = "2V3_暗打";
  state.次方 = "C";
  state.次方公开 = false;
  // 用完整 transition 调 PLAY
  const r = transition(state, { type: "PLAY", payload: { playerId: "C", cardIds: [bigA.id] } });
  assert.strictEqual(r.ok, true);
  // 验证: 次方公开 = true, mode 不变
  assert.strictEqual(r.state.次方公开, true);
  assert.strictEqual(r.state.mode, "2V3_暗打");
  // 桌上有大A
  assert.strictEqual(r.state.table.length, 1);
  assert.strictEqual(r.state.table[0].is主方大A, true);
});

test("2V3 暗打: 非次方 A 打出大A → state.次方公开 不变", () => {
  const bigA = makeCard("H", 14);
  bigA.is主方大A = true;
  const filler = makeSameRank(5, 3);
  const state = makeState({
    handA: [bigA].concat(filler),
    handB: makeSameRank(6, 3),
    handC: makeSameRank(7, 3),
    handD: makeSameRank(8, 3),
    handE: makeSameRank(9, 3)
  });
  state.phase = "PLAY";
  state.mode = "2V3_暗打";
  state.次方 = "C";
  state.次方公开 = false;
  const r = transition(state, { type: "PLAY", payload: { playerId: "A", cardIds: [bigA.id] } });
  assert.strictEqual(r.ok, true);
  // A 是主A 玩家 (出大A), 但不是次方, 次方公开 不应触发
  assert.strictEqual(r.state.次方公开, false);
});

test("1V4 暗打: 主A A 打出大A → state.次方公开 不变 (无次方概念)", () => {
  const bigA = makeCard("H", 14);
  bigA.is主方大A = true;
  const filler = makeSameRank(5, 3);
  const state = makeState({
    handA: [bigA].concat(filler),
    handB: makeSameRank(6, 3),
    handC: makeSameRank(7, 3),
    handD: makeSameRank(8, 3),
    handE: makeSameRank(9, 3)
  });
  state.phase = "PLAY";
  state.mode = "1V4_暗打";
  state.次方 = null;
  state.次方公开 = false;
  const r = transition(state, { type: "PLAY", payload: { playerId: "A", cardIds: [bigA.id] } });
  assert.strictEqual(r.ok, true);
  // 1V4 没有次方, 次方公开 保持 false
  assert.strictEqual(r.state.次方公开, false);
});
