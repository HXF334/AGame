// tests/test-ai-memory.js —— AI 记牌（D-078）
// 只锁性质: 剩余张数守恒、最大单张判定、残局领出"绝对最大"单张。
var assert = require('assert');
var SB = require('./lib/state-builder.js');
var ai = require('../src/ai.js');
var memory = require('../src/ai-memory.js');
var card = require('../src/card.js');
var { identifyHand } = require('../src/hand-types.js');

var pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + ' :: ' + e.message); }
}

function baseState(handRanks) {
  var suits = ['H', 'D', 'C', 'S'];
  var cards = handRanks.map(function (r, i) { return SB.C(suits[i % 4], r); });
  var st = SB.build({
    handMap: { B: cards }, phase: 'PLAY', mode: '2V3_暗打',
    table: [], lastPlayer: 'E', currentPlayer: 'B',
    '主A': { suit: 'S', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
    '次方': 'C', '次方公开': false, '主方': ['B', 'C'], '抓方': ['A', 'D', 'E']
  });
  st.players.forEach(function (p) { if (p.id === 'B') p.hand = cards.slice(); });
  return { st: st, cards: cards };
}

// 把"比 3 大的所有单张"（A/2/王/其余 3）塞进公开的弃牌堆
function markBiggerSeen(st, ownThreeCount) {
  var suits = ['H', 'D', 'C', 'S'];
  var seen = [];
  suits.forEach(function (s) { for (var i = 0; i < 2; i++) seen.push(SB.C(s, 14)); });  // 8 张 A
  suits.forEach(function (s) { for (var i = 0; i < 2; i++) seen.push(SB.C(s, 2)); });   // 8 张 2
  for (var i = 0; i < 8 - ownThreeCount; i++) seen.push(SB.C(suits[i % 4], 3));         // 其余 3
  seen.push(card.createBigJoker(90), card.createBigJoker(91));
  seen.push(card.createSmallJoker(92), card.createSmallJoker(93));
  st.discarded = st.discarded.concat(seen);
}

function handCard(st, id) {
  return st.players.find(function (p) { return p.id === 'B'; })
    .hand.find(function (c) { return c.id === id; });
}

// ---- 1. 剩余张数 ----
ok('1.1 剩余总张数 = 108 - 已见牌', function () {
  var b = baseState([3, 5, 6]);
  var m = memory.remaining(b.st, 'B');
  var seen = b.st.table.length + b.st.discarded.length;
  b.st.players.forEach(function (p) { if (p.id === 'B') seen += p.hand.length; });
  assert.strictEqual(m.total, 108 - seen);
});

ok('1.2 自己手里的 3 计入已见', function () {
  var b = baseState([3]);
  var m = memory.remaining(b.st, 'B');
  assert.strictEqual(m.ranks[3], 7, '还有 7 张 3');
});

// ---- 2. 最大单张 ----
ok('2.1 大王未见 -> 最大单张=大王', function () {
  var b = baseState([3, 5]);
  assert.strictEqual(memory.highestSingle(b.st, 'B'), 19);
});

ok('2.2 所有更大的牌都见过了 -> 3 是最大单张', function () {
  var b = baseState([3, 5, 6, 7, 8, 9]);
  markBiggerSeen(b.st, 1);
  var m = memory.remaining(b.st, 'B');
  assert.strictEqual(m.ranks[3], 0);
  assert.strictEqual(m.ranks[2], 0);
  assert.strictEqual(m.ranks[14], 0);
  assert.ok(memory.highestSingle(b.st, 'B') <= 13, '3 以上只剩 4..K');
});

// ---- 3. 残局领出绝对最大单张 ----
ok('3.1 手牌 <=6 且 3 绝对最大 -> 先出 3 而不是最小牌', function () {
  var b = baseState([3, 5, 7, 9, 11]);
  markBiggerSeen(b.st, 1);
  var act = ai.chooseAction(b.st, 'B', {});
  assert.strictEqual(act.type, 'PLAY');
  assert.strictEqual(act.cardIds.length, 1, '应领出单张');
  assert.strictEqual(handCard(b.st, act.cardIds[0]).rank, 3, '应出 3');
});

ok('3.2 手牌 >6 时不启用该偏好', function () {
  var b = baseState([3, 5, 7, 9, 11, 13, 10]);
  markBiggerSeen(b.st, 1);
  var act = ai.chooseAction(b.st, 'B', {});
  var cards = act.cardIds.map(function (id) { return handCard(b.st, id); });
  assert.ok(identifyHand(cards), '应仍能正常出牌');
});

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
