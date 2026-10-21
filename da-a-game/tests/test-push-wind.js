// tests/test-push-wind.js — §9 推风 测试 (v2)
// 严格按 SKILL.md §9 + §10 实现
const test = require('node:test');
const assert = require('node:assert');
const { pushWind } = require('../src/push-wind.js');

let _id = 0;
function card() {
  _id += 1;
  return {
    id: 'c' + _id, suit: 'H', rank: 5,
    isBigJoker: false, isSmallJoker: false, is主方大A: false
  };
}

function mkPlayer(id, handSize) {
  const hand = [];
  for (let i = 0; i < handSize; i++) hand.push(card());
  return { id, hand };
}

function mkState(opts) {
  const base = {
    phase: 'PLAY',
    mode: '1V4_暗打',
    主方: ['A'],
    抓方: ['B', 'C', 'D', 'E'],
    次方: null,
    推风触发者: null,
    currentPlayer: null,
    table: [],
    players: []
  };
  if (opts) Object.assign(base, opts);
  return base;
}

// 玩家数组构造器
function mkPlayers(spec) {
  return Object.keys(spec).map(function (id) {
    return mkPlayer(id, spec[id]);
  });
}

// ============================================================
// §1 2V3 暗打, A 触发 (主方), B(次方,同阵营) 有牌 → 推给 B
// ============================================================
test('1. 2V3 暗打, A 触发, 次方身份未明 → 跳过主A, 推给 B (次A)', () => {
  const state = mkState({
    mode: '2V3_暗打',
    主方: ['A'],
    抓方: ['C', 'D', 'E'],
    次方: 'B',
    推风触发者: 'A',
    currentPlayer: 'A',
    players: mkPlayers({ A: 0, B: 3, C: 5, D: 4, E: 6 })
  });
  const r = pushWind(state);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.action, 'PUSH_WIND');
  assert.strictEqual(r.target, 'B');
  assert.strictEqual(r.state.currentPlayer, 'B');
});

// ============================================================
// §2 1V4 暗打, B 触发 (抓方), C/D 空 → 跳过 A(主A, 次方未明), 推给 E
// ============================================================
test('2. 1V4 暗打, B 触发 (抓方), 次方未明, C/D 空 → 跳过 C/D, 跳过 A, 推给 E', () => {
  const state = mkState({
    mode: '1V4_暗打',
    主方: ['A'],
    抓方: ['B', 'C', 'D', 'E'],
    次方: null,
    推风触发者: 'B',
    currentPlayer: 'B',
    players: mkPlayers({ A: 3, B: 0, C: 0, D: 0, E: 6 })
  });
  const r = pushWind(state);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.target, 'E');
});

// ============================================================
// §3 1V4 暗打, 抓方 B 触发, 主A A 还在, 抓方全空 → 抓方胜 (10.3 rule 2)
// ============================================================
test('3. 1V4 暗打, B 触发, 抓方全空, 主A 还在 → 抓方胜', () => {
  const state = mkState({
    mode: '1V4_暗打',
    主方: ['A'],
    抓方: ['B', 'C', 'D', 'E'],
    次方: null,
    推风触发者: 'B',
    currentPlayer: 'B',
    players: mkPlayers({ A: 3, B: 0, C: 0, D: 0, E: 0 })
  });
  const r = pushWind(state);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '抓方');
});

// ============================================================
// §4 2V3 暗打, A 触发, 主方 A+B 都空 → 抓方胜 (10.4)
// ============================================================
test('4. 2V3 暗打, A 触发, 主方 A+B 全空, 抓方还在 → 抓方胜', () => {
  const state = mkState({
    mode: '2V3_暗打',
    主方: ['A'],
    抓方: ['C', 'D', 'E'],
    次方: 'B',
    推风触发者: 'A',
    currentPlayer: 'A',
    players: mkPlayers({ A: 0, B: 0, C: 5, D: 4, E: 6 })
  });
  const r = pushWind(state);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '抓方');
});

// ============================================================
// §5 2V3 暗打, D 触发 (抓方), E 有牌 → 推给同阵营 E
// ============================================================
test('5. 2V3 暗打, D 触发 (抓方), 次方身份未明, E 有牌 → 跳过主方, 推给 E', () => {
  const state = mkState({
    mode: '2V3_暗打',
    主方: ['A'],
    抓方: ['C', 'D', 'E'],
    次方: 'B',
    推风触发者: 'D',
    currentPlayer: 'D',
    players: mkPlayers({ A: 3, B: 5, C: 4, D: 0, E: 6 })
  });
  const r = pushWind(state);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.target, 'E');
});

// ============================================================
// §6 2V3 暗打, D 触发, E 空 → 跳过 A/B(主方), 推给 C
// ============================================================
test('6. 2V3 暗打, D 触发, E 空, A/B 还在 → 跳过 A(主A), 推给 B (次A)', () => {
  const state = mkState({
    mode: '2V3_暗打',
    主方: ['A'],
    抓方: ['C', 'D', 'E'],
    次方: 'B',
    推风触发者: 'D',
    currentPlayer: 'D',
    players: mkPlayers({ A: 3, B: 5, C: 4, D: 0, E: 0 })
  });
  const r = pushWind(state);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.target, 'B');
});

// ============================================================
// §7 推风: action=PUSH_WIND (不是普通 PLAY, 不要求同牌型)
// ============================================================
test('7. 推风: action=PUSH_WIND, table 不变 (不要求同牌型)', () => {
  const state = mkState({
    推风触发者: 'B',
    currentPlayer: 'B',
    table: [{ id: 'x', suit: 'H', rank: 5, isBigJoker: false, isSmallJoker: false, is主方大A: false }],
    players: mkPlayers({ A: 3, B: 0, C: 5, D: 4, E: 6 })
  });
  const r = pushWind(state);
  assert.strictEqual(r.action, 'PUSH_WIND');
  // table 不被清空 (推风不是过牌)
  assert.strictEqual(r.state.table.length, 1);
});

// ============================================================
// §8 错误: 非 PLAY 阶段
// ============================================================
test('8. 错误: 推风只能在 PLAY 阶段', () => {
  const state = mkState({
    phase: 'DEAL',
    推风触发者: 'A',
    currentPlayer: 'A',
    players: mkPlayers({ A: 0, B: 3, C: 5, D: 4, E: 6 })
  });
  const r = pushWind(state);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, 'INVALID_PHASE');
});

// ============================================================
// §9 错误: 触发玩家未出完牌
// ============================================================
test('9. 错误: 触发玩家手牌未空', () => {
  const state = mkState({
    推风触发者: 'A',
    currentPlayer: 'A',
    players: mkPlayers({ A: 3, B: 3, C: 5, D: 4, E: 6 })
  });
  const r = pushWind(state);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, 'TRIGGER_NOT_OUT');
});
