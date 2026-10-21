// tests/test-deal.js — 第一阶段测试
// 纯 Node 脚本：node tests/test-deal.js
// 不引入任何测试框架（assert 是 Node 内建）

const assert = require('assert');
const {
  createDeck,
  SUITS,
  NORMAL_RANKS
} = require('../src/card.js');
const {
  dealGame,
  createPlayer,
  shuffle,
  PLAYER_NAMES,
  NUM_PLAYERS
} = require('../src/deal.js');

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

// ---------- §13 测试用例 #1：108 张、无重复 ID、跨副可区分 ----------

section('1. 牌组基础');

test('createDeck returns exactly 108 cards', () => {
  const deck = createDeck();
  assert.strictEqual(deck.length, 108,
    'expected 108, got ' + deck.length);
});

test('all 108 card IDs are unique', () => {
  const deck = createDeck();
  const ids = new Set(deck.map(function (c) { return c.id; }));
  assert.strictEqual(ids.size, 108,
    'unique IDs = ' + ids.size + ' (expected 108)');
});

test('same suit+rank across two decks have different IDs', () => {
  const deck = createDeck();
  // 抽 A♥：应该有 2 张，ID 不同
  const ah = deck.filter(function (c) { return c.suit === 'H' && c.rank === 14; });
  assert.strictEqual(ah.length, 2, 'A# count = ' + ah.length);
  assert.notStrictEqual(ah[0].id, ah[1].id,
    'duplicate ID for A#: ' + ah[0].id);

  // 抽 5♣：同花色不同点数也要 2 张且 ID 不同
  const c5 = deck.filter(function (c) { return c.suit === 'C' && c.rank === 5; });
  assert.strictEqual(c5.length, 2);
  assert.notStrictEqual(c5[0].id, c5[1].id);
});

test('deck has 4 jokers (2 big + 2 small)', () => {
  const deck = createDeck();
  const bj = deck.filter(function (c) { return c.isBigJoker; });
  const sj = deck.filter(function (c) { return c.isSmallJoker; });
  assert.strictEqual(bj.length, 2, 'big jokers = ' + bj.length);
  assert.strictEqual(sj.length, 2, 'small jokers = ' + sj.length);
  for (const j of bj) {
    assert.strictEqual(j.suit, null, 'big joker must have null suit');
    assert.strictEqual(j.rank, 'BJ');
  }
  for (const j of sj) {
    assert.strictEqual(j.suit, null);
    assert.strictEqual(j.rank, 'SJ');
  }
});

test('shuffle returns the same deck (in-place), 108 cards', () => {
  const deck = createDeck();
  const ret = shuffle(deck);
  assert.strictEqual(ret, deck, 'shuffle must return same reference');
  assert.strictEqual(deck.length, 108);
});

// ---------- §13 测试用例 #1（续）：22/22/22/21/21 ----------

section('2. 发牌数量');

test('dealGame(start=0): per-player total cards = 22,22,22,21,21', () => {
  const game = dealGame({ startPlayerIndex: 0 });
  const counts = game.players.map(function (p) {
    return p.hand.length + (p.底牌 ? 1 : 0);
  });
  assert.deepStrictEqual(counts, [22, 22, 22, 21, 21],
    'counts = ' + JSON.stringify(counts));
});

test('dealGame(start=3): order becomes D,E,A,B,C; first 3 in order get 22', () => {
  // start=3 时，按逆时针发牌顺序是 D(3),E(4),A(0),B(1),C(2)
  // 所以 D/E/A 得 22，B/C 得 21
  const game = dealGame({ startPlayerIndex: 3 });
  const counts = game.players.map(function (p) {
    return p.hand.length + (p.底牌 ? 1 : 0);
  });
  // players[0]=A, [1]=B, [2]=C, [3]=D, [4]=E
  // A=22, B=21, C=21, D=22, E=22
  assert.deepStrictEqual(counts, [22, 21, 21, 22, 22],
    'counts = ' + JSON.stringify(counts));
});

// ---------- §13 测试用例 #1（续）+ #2：底牌 = 最后发到的 ----------

section('3. 底牌数据模型');

test('each player has a 底牌 (not null) and it equals their last dealt card', () => {
  const game = dealGame({ startPlayerIndex: 0 });
  for (let pIdx = 0; pIdx < NUM_PLAYERS; pIdx++) {
    const player = game.players[pIdx];

    // 1) 底牌必须存在
    assert.ok(player.底牌, 'player ' + player.id + ' missing 底牌');

    // 2) 找该玩家在 dealOrder 中最后一次出现的索引
    let lastDealIdx = -1;
    for (let i = 0; i < game.dealOrder.length; i++) {
      if (game.dealOrder[i] === pIdx) lastDealIdx = i;
    }
    const expected = game.deck[lastDealIdx];

    // 3) 底牌必须等于该牌
    assert.strictEqual(player.底牌, expected,
      'player ' + player.id + ' 底牌 != last dealt card');

    // 4) 底牌的 location 必须标记为 type=底牌, playerId 正确
    assert.strictEqual(player.底牌.location.type, '底牌');
    assert.strictEqual(player.底牌.location.playerId, player.id);
  }
});

test('底牌 is NOT in player.hand (separated storage)', () => {
  const game = dealGame({ startPlayerIndex: 0 });
  for (const p of game.players) {
    assert.ok(p.底牌, 'player ' + p.id + ' missing 底牌');
    const idx = p.hand.indexOf(p.底牌);
    assert.strictEqual(idx, -1,
      'player ' + p.id + ' has 底牌 inside hand array');
  }
});

// ---------- §13 测试用例 #6：牌张唯一归属、无丢失/重复 ----------

section('4. 全局唯一性');

test('all 108 cards in exactly one place, no loss/dup', () => {
  const game = dealGame({ startPlayerIndex: 0 });
  const seen = new Set();
  for (const p of game.players) {
    for (const c of p.hand) {
      assert.ok(!seen.has(c.id),
        'duplicate in hand: ' + c.id + ' (player ' + p.id + ')');
      seen.add(c.id);
    }
    if (p.底牌) {
      assert.ok(!seen.has(p.底牌.id),
        'duplicate 底牌: ' + p.底牌.id + ' (player ' + p.id + ')');
      seen.add(p.底牌.id);
    }
  }
  // 原始牌组里的每一张都应该在某个位置
  for (const c of game.deck) {
    assert.ok(seen.has(c.id), 'lost card: ' + c.id);
  }
  assert.strictEqual(seen.size, 108, 'unique cards placed = ' + seen.size);
});

test('every hand card has location.type=hand and correct playerId', () => {
  const game = dealGame({ startPlayerIndex: 0 });
  for (const p of game.players) {
    for (const c of p.hand) {
      assert.strictEqual(c.location.type, 'hand',
        'card ' + c.id + ' location.type = ' + c.location.type);
      assert.strictEqual(c.location.playerId, p.id);
    }
  }
});

// ---------- §13 测试用例 #7：可重复执行 ----------

section('5. 可重复执行');

test('dealGame can be run 20 times with mixed startPlayerIndex, all valid', () => {
  for (let i = 0; i < 20; i++) {
    const start = i % NUM_PLAYERS;
    const game = dealGame({ startPlayerIndex: start });
    const counts = game.players.map(function (p) {
      return p.hand.length + (p.底牌 ? 1 : 0);
    });
    const total = counts.reduce(function (a, b) { return a + b; }, 0);
    assert.strictEqual(total, 108,
      'iter ' + i + ' (start=' + start + '): total = ' + total);

    // 还要保证每人都有底牌且是最后发到的那张
    for (let pIdx = 0; pIdx < NUM_PLAYERS; pIdx++) {
      assert.ok(game.players[pIdx].底牌, 'iter ' + i + ' missing 底牌');
      let lastDealIdx = -1;
      for (let j = 0; j < game.dealOrder.length; j++) {
        if (game.dealOrder[j] === pIdx) lastDealIdx = j;
      }
      assert.strictEqual(game.players[pIdx].底牌, game.deck[lastDealIdx],
        'iter ' + i + ' player ' + pIdx + ' 底牌 mismatch');
    }
  }
});

// ---------- 汇总 ----------

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
