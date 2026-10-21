// tests/test-ai.js — §12 AI 行动选择
// 跑法：node tests/test-ai.js

const assert = require('assert');
const { chooseAction } = require('../src/ai.js');

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
function makeCard(suit, rank) {
  _idCounter += 1;
  return {
    id: 'ai-' + _idCounter,
    suit: (rank === 'BJ' || rank === 'SJ') ? null : suit,
    rank: rank,
    isBigJoker: rank === 'BJ',
    isSmallJoker: rank === 'SJ',
    is主方大A: false,
    location: { type: 'hand' }
  };
}

function makeSameRank(rank, count) {
  const suits = ['H', 'D', 'C', 'S'];
  const cards = [];
  for (let i = 0; i < count; i++) cards.push(makeCard(suits[i % 4], rank));
  return cards;
}

function makeState(opts) {
  opts = opts || {};
  return {
    mode: opts.mode || '1V4_明打',
    主方: opts.主方 || ['A'],
    次方: opts.次方 || null,
    抓方: opts.抓方 || ['B', 'C', 'D', 'E'],
    table: opts.table || [],
    players: opts.players || [{ id: 'A', hand: opts.handA || [] }]
  };
}

// ============================================================
// §1  capture (4s) 优先
// ============================================================
section('1. capture (4s) 优先');

test('AI 用 2 张 4 取牌 (target 3 张 5)', () => {
  const fours = makeSameRank(4, 2);
  const target = makeSameRank(5, 3);
  const state = makeState({
    handA: fours,
    table: target,
    lastPlayer: 'B'
  });
  const action = chooseAction(state, 'A');
  assert.strictEqual(action.type, 'PLAY');
  // 应该是出 2 张 4
  assert.strictEqual(action.cardIds.length, 2);
  // 这 2 张都应该是 4s
  for (const id of action.cardIds) {
    const card = fours.find(c => c.id === id);
    assert.ok(card, 'card should be a 4');
  }
});

test('AI 优先 capture 而非 press (有 4s 可取, 也有单张可压)', () => {
  // target 3 张 5, AI 手牌: 2 张 4 + 1 张 6
  // 2 张 4 可 capture, 1 张 6 可 press (rank 高)
  // AI 应该优先 capture
  const fours = makeSameRank(4, 2);
  const six = makeSameRank(6, 1);
  const target = makeSameRank(5, 3);
  const state = makeState({
    handA: fours.concat(six),
    table: target,
    lastPlayer: 'B'
  });
  const action = chooseAction(state, 'A');
  assert.strictEqual(action.type, 'PLAY');
  // 应该是 2 张 4s
  assert.strictEqual(action.cardIds.length, 2);
});

test('AI 4s 数量不足, 单张压不了蛋子 (同层不互压), PASS', () => {
  // target 3 张 5 (蛋子), AI 手牌: 1 张 4 (capture 失败) + 1 张 6
  // SKILL §6.3: SINGLE/PAIR/TRIPLE 同层不互压, 单张 6 压不了蛋子 5
  const four = makeSameRank(4, 1);
  const six = makeSameRank(6, 1);
  const target = makeSameRank(5, 3);
  const state = makeState({
    handA: four.concat(six),
    table: target,
    lastPlayer: 'B'
  });
  const action = chooseAction(state, 'A');
  assert.strictEqual(action.type, 'PASS');
});

// ============================================================
// §1.5  capture 实际成功
// ============================================================
section('1.5 capture 实际成功');

test('AI 2 张 4 + 1 张 6, capture 成功 (target 3 张 5, 2 张 4 可取)', () => {
  const fours = makeSameRank(4, 2);
  const six = makeSameRank(6, 1);
  const target = makeSameRank(5, 3);
  const state = makeState({
    handA: fours.concat(six),
    table: target,
    lastPlayer: 'B'
  });
  const action = chooseAction(state, 'A');
  assert.strictEqual(action.type, 'PLAY');
  assert.strictEqual(action.cardIds.length, 2);
  for (const id of action.cardIds) {
    const card = fours.find(c => c.id === id);
    assert.ok(card, 'card should be a 4');
  }
});

// ============================================================
// §2  press (有牌可压)
// ============================================================
section('2. press (有牌可压)');

test('AI 1 张单牌压蛋子 (同层不互压), PASS', () => {
  // target 3 张 5 (蛋子), AI 手牌: 1 张 6
  // SKILL §6.3: SINGLE/PAIR/TRIPLE POWER 都=1, 同层不互压
  const six = makeSameRank(6, 1);
  const target = makeSameRank(5, 3);
  const state = makeState({
    handA: six,
    table: target,
    lastPlayer: 'B'
  });
  const action = chooseAction(state, 'A');
  assert.strictEqual(action.type, 'PASS');
});

test('AI 用对子 press target 单张 (同类型跨张数不能跨, 应失败)', () => {
  // target 3 张 5 (蛋子), AI 对子 (7) 跨类型且跨张数, 不能压
  // 应该 PASS
  const pair = [makeCard('H', 7), makeCard('D', 7)];
  const target = makeSameRank(5, 3);
  const state = makeState({
    handA: pair,
    table: target,
    lastPlayer: 'B'
  });
  const action = chooseAction(state, 'A');
  assert.strictEqual(action.type, 'PASS');
});

// ============================================================
// §3  pass (无牌可压)
// ============================================================
section('3. pass');

test('AI 手牌都压不了, 返回 PASS', () => {
  // target 3 张 6, AI 手牌: 1 张 5 (rank 低, 压不了)
  const five = makeSameRank(5, 1);
  const target = makeSameRank(6, 3);
  const state = makeState({
    handA: five,
    table: target,
    lastPlayer: 'B'
  });
  const action = chooseAction(state, 'A');
  assert.strictEqual(action.type, 'PASS');
});

test('AI 手牌为空 → PASS (推风简化, 实际可跳)', () => {
  const state = makeState({
    handA: [],
    table: makeSameRank(5, 3),
    lastPlayer: 'B'
  });
  const action = chooseAction(state, 'A');
  assert.strictEqual(action.type, 'PASS');
});

// ============================================================
// §4  新的一轮 (table 空)
// ============================================================
section('4. 新的一轮 (table 空)');

test('table 空时 AI 出任意合法单牌 (新的一轮第一手)', () => {
  const hand = makeSameRank(5, 1);
  const state = makeState({
    handA: hand,
    table: [],
    lastPlayer: null
  });
  const action = chooseAction(state, 'A');
  assert.strictEqual(action.type, 'PLAY');
  assert.strictEqual(action.cardIds.length, 1);
  assert.strictEqual(action.cardIds[0], hand[0].id);
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
