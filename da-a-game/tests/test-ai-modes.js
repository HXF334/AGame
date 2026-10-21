// tests/test-ai-modes.js — C: AI 在 1V4 明打/暗打 模式下的行为测试
// 跑法: node tests/test-ai-modes.js
const assert = require('assert');
const { createNormalCard, createBigJoker, createSmallJoker } = require('../src/card.js');
const { PHASES } = require('../src/phases.js');
const { chooseAction } = require('../src/ai.js');

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  FAIL  ' + name + '  ' + (e && e.message)); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// 用真实 createNormalCard 保证 ID 与引擎一致
function C(suit, rank) { return createNormalCard(suit, rank); }
function BJ() { return createBigJoker(); }
function SJ() { return createSmallJoker(); }

function mk(id, hand) { return { id: id, hand: hand, 底牌: null }; }

function mk1V4(mode) {
  return {
    phase: PHASES.PLAY,
    mode: mode,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    反A: null,
    次方: null,
    lastPlayer: null,
    passedPlayers: [],
    passCount: 0,
    头名: null,
    推风触发者: null,
    次方公开: true,
    底牌公开: true,
    table: [],
    discarded: [],
    startPlayerIndex: 0, deck: [], dealOrder: [], actions: [],
    players: [
      mk('A', [C('H', 14), C('D', 5), C('S', 6)]),
      mk('B', [C('H', 3), C('D', 7)]),
      mk('C', [C('S', 8), C('C', 9)]),
      mk('D', [C('H', 10), C('D', 11)]),
      mk('E', [C('S', 12), C('C', 13)])
    ]
  };
}

section('C.1 AI 在 1V4 明打 下的行为');

test('C.1.1 AI 能正常选动作 (返回 PLAY 或 PASS)', function () {
  const s = mk1V4('1V4_明打');
  const a = chooseAction(s, 'B');
  assert.ok(a, '应返回 action');
  assert.ok(['PLAY', 'PASS'].indexOf(a.type) >= 0, 'type 应是 PLAY 或 PASS, got ' + a.type);
});

test('C.1.2 桌空时 AI 出最小牌 (SKILL §6.2: 7 < 3, 所以出 D7)', function () {
  const s = mk1V4('1V4_明打');
  // SKILL §6.2 顺序: ... > 8 > 7 > 6 > 5 > 4, 且 3 接近最大
  // B 手牌 H3 D7 → 7 比 3 小 → 应出 D7
  const a = chooseAction(s, 'B');
  assert.strictEqual(a.type, 'PLAY', '桌空应 PLAY');
  assert.strictEqual(a.cardIds.length, 1, '应出 1 张');
  assert.strictEqual(a.cardIds[0], C('D', 7).id, '应出最小 D7 (7 < 3 per §6.2)');
});

test('C.1.3 桌空时 AI 不出 4 (4 留给取牌)', function () {
  const s = mk1V4('1V4_明打');
  s.players[1].hand = [C('H', 4), C('D', 7)];
  const a = chooseAction(s, 'B');
  assert.strictEqual(a.cardIds[0], C('D', 7).id, '桌空应出 D7 而非 H4 (4 留给 capture)');
});

test('C.1.4 桌上大王时 AI 压不了 → PASS', function () {
  const s = mk1V4('1V4_明打');
  s.table = [BJ()];
  s.lastPlayer = 'A';
  // B 手牌 H3 D7 都压不了大王
  const a = chooseAction(s, 'B');
  assert.strictEqual(a.type, 'PASS', '压不了大王就该 PASS');
});

test('C.1.5 桌上小王时 AI 出大王压 (最小可压)', function () {
  const s = mk1V4('1V4_明打');
  s.table = [SJ()];
  s.lastPlayer = 'A';
  s.players[1].hand = [C('H', 3), BJ()];
  const a = chooseAction(s, 'B');
  assert.strictEqual(a.type, 'PLAY', '大王能压小王');
  assert.strictEqual(a.cardIds[0], BJ().id, '应出大王');
});

test('C.1.6 SKILL §6.2: 3 能压 5, 但小→大应先出更小的能压牌', function () {
  const s = mk1V4('1V4_明打');
  s.table = [C('C', 5)];
  s.lastPlayer = 'A';
  // canBeat(H3,C5)=true, canBeat(D7,C5)=true; 7 < 3 → 先出 D7
  const a = chooseAction(s, 'B');
  assert.strictEqual(a.type, 'PLAY', '能压就 PLAY');
  assert.strictEqual(a.cardIds[0], C('D', 7).id, '小→大: 先出更小的 D7');
});

section('C.2 AI 在 1V4 暗打 下的行为');

test('C.2.1 AI 能正常选动作 (1V4_暗打)', function () {
  const s = mk1V4('1V4_暗打');
  const a = chooseAction(s, 'B');
  assert.ok(['PLAY', 'PASS'].indexOf(a.type) >= 0);
});

test('C.2.2 桌空时 AI 出最小牌 (1V4_暗打, 7 < 3 per §6.2)', function () {
  const s = mk1V4('1V4_暗打');
  const a = chooseAction(s, 'B');
  assert.strictEqual(a.cardIds[0], C('D', 7).id, '应出最小 D7');
});

test('C.2.3 手牌空时 AI PASS', function () {
  const s = mk1V4('1V4_暗打');
  s.players[1].hand = [];
  const a = chooseAction(s, 'B');
  assert.strictEqual(a.type, 'PASS', '手牌空应 PASS');
});

test('C.2.4 有 4s 且目标合法时 AI 优先 capture', function () {
  const s = mk1V4('1V4_暗打');
  // 目标是 3 张同点数 (SKILL §7: 3-8 张同点数才能被取)
  s.table = [C('H', 9), C('D', 9), C('S', 9)];
  s.lastPlayer = 'A';
  // 3 张目标用 2 个 4 取
  s.players[1].hand = [C('H', 4), C('D', 4), C('S', 2)];
  const a = chooseAction(s, 'B');
  assert.strictEqual(a.type, 'PLAY', '能 capture 就 PLAY');
  assert.strictEqual(a.cardIds.length, 2, '3 张目标用 2 个 4');
});

test('C.2.5 王不能被取 (目标含王则 capture 失败)', function () {
  const s = mk1V4('1V4_暗打');
  // 目标含大王 → 不可取
  s.table = [C('H', 9), C('D', 9), BJ()];
  s.lastPlayer = 'A';
  s.players[1].hand = [C('H', 4), C('D', 4), C('S', 7)];
  const a = chooseAction(s, 'B');
  // capture 不可用 → 应回退普通出牌 (S7 单张能压桌面混合牌型? 桌面是 9 9 大王, 不构成合法牌型, 不能压 → PASS)
  assert.strictEqual(a.type, 'PASS', '目标含王且不是合法牌型 → PASS');
});

section('C.3 AI 在 IDENTITY_CHOICE 阶段');

test('C.3.1 IDENTITY_CHOICE 阶段 AI 返回 CHOOSE_IDENTITY/HIDDEN', function () {
  const s = mk1V4('1V4_暗打');
  s.phase = PHASES.IDENTITY_CHOICE;
  const a = chooseAction(s, 'A');
  assert.strictEqual(a.type, 'CHOOSE_IDENTITY', '应返回 CHOOSE_IDENTITY');
  assert.strictEqual(a.choice, 'HIDDEN', 'AI 默认选 HIDDEN');
});

section('C.4 AI 排序逻辑验证 (小→大)');

test('C.4.1 全手牌排序: 出绝对最小 (大王>小王>3>2>A>K>...>5>4)', function () {
  const s = mk1V4('1V4_暗打');
  // 桌空, B 手牌含大王/小王/3/2/A/K/5/4 → 最小是 4, 但 4 留给 capture, 应出 5
  s.players[1].hand = [BJ(), SJ(), C('H', 3), C('D', 2), C('S', 14), C('C', 13), C('H', 5), C('D', 4)];
  const a = chooseAction(s, 'B');
  assert.strictEqual(a.cardIds[0], C('H', 5).id, '4 留给 capture, 应出次小的 5');
});

test('C.4.2 无 4 时出绝对最小', function () {
  const s = mk1V4('1V4_暗打');
  s.players[1].hand = [BJ(), SJ(), C('H', 3), C('D', 2), C('S', 14), C('C', 13), C('H', 5)];
  const a = chooseAction(s, 'B');
  assert.strictEqual(a.cardIds[0], C('H', 5).id, '无 4, 应出最小 5');
});

test('C.4.3 capture 时 4s 数量从小到大尝试', function () {
  const s = mk1V4('1V4_暗打');
  // 目标是 3 张同点数, B 有 4 个 4 → 应用最小可用数 (2 个)
  s.table = [C('H', 9), C('D', 9), C('S', 9)];
  s.lastPlayer = 'A';
  s.players[1].hand = [C('H', 4), C('D', 4), C('C', 4), C('S', 4)];
  const a = chooseAction(s, 'B');
  assert.strictEqual(a.type, 'PLAY');
  assert.strictEqual(a.cardIds.length, 2, '3 张目标用 2 个 4 即可, 不该用 4 个');
});

test('C.4.4 王的排序: 大王最大, 小王次大', function () {
  const s = mk1V4('1V4_暗打');
  // 桌上大王, B 只有大王和小王 → 出大王
  s.table = [BJ()];
  s.lastPlayer = 'A';
  s.players[1].hand = [SJ(), BJ()];
  const a = chooseAction(s, 'B');
  assert.strictEqual(a.type, 'PASS', '小王和大王都压不了表上大王 (同牌不互压)');
});

console.log('\n=== 总结 ===');
console.log('total: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed > 0 ? 1 : 0);
