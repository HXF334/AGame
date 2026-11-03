// tests/test-rules-alignment.js — 规则 ↔ 实现 对账回归 (B1/B2/B3/B4/B5)
// 2026-11-03 全面审查发现 5 处引擎与 SKILL 不符, 本文件把它们锁住。
//
// [测试纪律] 每条断言都必须**在旧实现上精确失败**(不是全挂), 否则说明它没测到点上。
//   变异验证: 退回 HEAD 版本 -> 跑本文件 -> 必须红 -> 恢复 -> 必须绿。
//
// [覆盖]
//   B1 三王/四王 按 §6.3 全局顺序压制 (原来用手写白名单)
//   B2 A23 (A 作低端) 可被枚举 (原来枚举层拼不出来)
//   B3 13 张最长龙 (2..A) 可被枚举 (原来 MAX_SEQ=12 截断)
//   B4 双大A 可管单大A (原来实现私设了 SKILL 里没有的规则)
//   B5 发牌起始玩家随机 (§2.2; 原来 game.js 写死 0)

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ht = require('../src/hand-types.js');
var combosMod = require('../src/combos.js');
var engine = require('../src/index.js');
var HAND_TYPES = ht.HAND_TYPES;

var passed = 0, failed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; failures.push(name + ' | ' + (e && e.message)); console.log('  FAIL  ' + name + ' | ' + (e && e.message)); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// ---------- 造牌 ----------
var _seq = 0;
function card(suit, rank, opts) {
  return Object.assign({
    id: (suit || 'X') + '-' + rank + '-' + (++_seq),
    suit: suit, rank: rank,
    isBigJoker: false, isSmallJoker: false, is主方大A: false,
    location: { type: 'hand' }
  }, opts || {});
}
function joker(big) {
  return {
    id: (big ? 'BJ' : 'SJ') + '-' + (++_seq),
    suit: null, rank: big ? 'BJ' : 'SJ',
    isBigJoker: !!big, isSmallJoker: !big,
    is主方大A: false, location: { type: 'hand' }
  };
}
function bigA(suit) { return card(suit, 14, { is主方大A: true }); }
function sameRank(rank, n) {
  var suits = ['H', 'D', 'C', 'S'], out = [];
  for (var i = 0; i < n; i++) out.push(card(suits[i % 4], rank));
  return out;
}
// 手牌 -> 枚举出的组合里, 有没有「指定长度且识别层认可」的
function enumerated(hand, len) {
  return combosMod.candidateCombos(hand).filter(function (ids) {
    if (ids.length !== len) return false;
    var cards = ids.map(function (id) {
      return hand.filter(function (c) { return c.id === id; })[0];
    }).filter(Boolean);
    if (cards.length !== ids.length) return false;
    return ht.identifyHand(cards).type !== HAND_TYPES.INVALID;
  }).length;
}

// ================= B1 =================
section('B1 三王/四王 按 §6.3 全局顺序压制');
// §6.3: 双大A > 四王 > 三连假八 > 四连珠蛋 > 三王 > 真八 > 真七 > 假八 > 连珠蛋 > 双王
var triJoker = [joker(true), joker(true), joker(false)];
var fourJoker = [joker(true), joker(true), joker(false), joker(false)];
var trueEight = sameRank(8, 8);
var trueSeven = sameRank(7, 7);
var fakeEight = sameRank(5, 4).concat(sameRank(6, 4));
var tripleFakeEight = sameRank(5, 4).concat(sameRank(6, 4), sameRank(7, 4));
var straightTriple = sameRank(5, 3).concat(sameRank(6, 3), sameRank(7, 3));
var fourStraightTriple = sameRank(5, 3).concat(sameRank(6, 3), sameRank(7, 3), sameRank(8, 3));
var dblJoker = [joker(true), joker(true)];
var dblBigA = [bigA('H'), bigA('H')];

test('B1.1 三王 压 真八 (§6.3 三王 > 真八)', function () {
  assert.ok(ht.canBeat(ht.identifyHand(triJoker), ht.identifyHand(trueEight)));
});
test('B1.2 三王 压 真七', function () {
  assert.ok(ht.canBeat(ht.identifyHand(triJoker), ht.identifyHand(trueSeven)));
});
test('B1.3 三王 压 假八', function () {
  assert.ok(ht.canBeat(ht.identifyHand(triJoker), ht.identifyHand(fakeEight)));
});
test('B1.4 三王 压 连珠蛋', function () {
  assert.ok(ht.canBeat(ht.identifyHand(triJoker), ht.identifyHand(straightTriple)));
});
test('B1.5 三王 压 双王', function () {
  assert.ok(ht.canBeat(ht.identifyHand(triJoker), ht.identifyHand(dblJoker)));
});
test('B1.6 三王 压不过 四王', function () {
  assert.ok(!ht.canBeat(ht.identifyHand(triJoker), ht.identifyHand(fourJoker)));
});
test('B1.7 四王 压 三连假八', function () {
  assert.ok(ht.canBeat(ht.identifyHand(fourJoker), ht.identifyHand(tripleFakeEight)));
});
test('B1.8 四王 压 四连珠蛋', function () {
  assert.ok(ht.canBeat(ht.identifyHand(fourJoker), ht.identifyHand(fourStraightTriple)));
});
test('B1.9 四王 压 真八', function () {
  assert.ok(ht.canBeat(ht.identifyHand(fourJoker), ht.identifyHand(trueEight)));
});
test('B1.10 四王 压 双王', function () {
  assert.ok(ht.canBeat(ht.identifyHand(fourJoker), ht.identifyHand(dblJoker)));
});
test('B1.11 四王 压不过 双大A (§6 表 双大A 最强)', function () {
  assert.ok(!ht.canBeat(ht.identifyHand(fourJoker), ht.identifyHand(dblBigA)));
});
test('B1.12 双王 压不过 真八 (§6.4 双王不能管真八)', function () {
  assert.ok(!ht.canBeat(ht.identifyHand(dblJoker), ht.identifyHand(trueEight)));
});
test('B1.13 双王 压不过 三王 (§6.4 双王不能管三王)', function () {
  assert.ok(!ht.canBeat(ht.identifyHand(dblJoker), ht.identifyHand(triJoker)));
});
test('B1.14 双王 压不过 双大A', function () {
  assert.ok(!ht.canBeat(ht.identifyHand(dblJoker), ht.identifyHand(dblBigA)));
});
test('B1.15 双王 能压 大蛋子 (§6.4 双王可管大蛋子)', function () {
  assert.ok(ht.canBeat(ht.identifyHand(dblJoker), ht.identifyHand(sameRank(5, 4))));
});

// ================= B2 =================
section('B2 A23 (A 作低端) 可被枚举');
test('B2.1 识别层认 A23 为连张 (§6.1 允许A作为低端的A23)', function () {
  var h = ht.identifyHand([card('H', 14), card('D', 2), card('S', 3)]);
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT);
  assert.strictEqual(h.low, 1);
});
test('B2.2 枚举层能枚举出 A23 (原来一张都出不来)', function () {
  var hand = [card('H', 14), card('D', 2), card('S', 3)];
  assert.ok(enumerated(hand, 3) > 0, 'A23 未被枚举出来');
});
test('B2.3 A23 不与其它 3 张组合混淆', function () {
  var hand = [card('H', 14), card('D', 2), card('S', 3)];
  var found = combosMod.candidateCombos(hand).filter(function (ids) { return ids.length === 3; });
  var isA23 = found.some(function (ids) {
    var ranks = ids.map(function (id) {
      return hand.filter(function (c) { return c.id === id; })[0].rank;
    }).sort(function (a, b) { return a - b; });
    return ranks[0] === 2 && ranks[1] === 3 && ranks[2] === 14;
  });
  assert.ok(isA23, '枚举出的 3 张组合里没有 A23');
});

// ================= B3 =================
section('B3 13 张最长龙 (2..A) 可被枚举');
test('B3.1 识别层认 13 张 2..A 为连张', function () {
  var hand = [];
  for (var r = 2; r <= 14; r++) hand.push(card('H', r));
  var h = ht.identifyHand(hand);
  assert.strictEqual(h.type, HAND_TYPES.STRAIGHT);
  assert.strictEqual(h.length, 13);
});
test('B3.2 枚举层能枚举出 13 张连张 (原来 MAX_SEQ=12 截断)', function () {
  var hand = [];
  for (var r = 2; r <= 14; r++) hand.push(card('H', r));
  assert.ok(enumerated(hand, 13) > 0, '13 张连张未被枚举出来');
});
test('B3.3 枚举层仍能枚举出 12 张连张 (没被改坏)', function () {
  var hand = [];
  for (var r = 3; r <= 14; r++) hand.push(card('H', r));
  assert.ok(enumerated(hand, 12) > 0, '12 张连张未被枚举出来');
});

// ================= B4 =================
section('B4 双大A 可管单大A (§6 表 双大A 无敌)');
test('B4.1 双大A 压 单大A', function () {
  var one = bigA('D');
  assert.ok(ht.canBeat(ht.identifyHand(dblBigA), ht.identifyHand([one])));
});
test('B4.2 单大A 压 普通单张 (不变)', function () {
  assert.ok(ht.canBeat(ht.identifyHand([bigA('H')]), ht.identifyHand([card('S', 5)])));
});
test('B4.3 4 张大蛋子 压不过 单大A (§6.4 4张不能管)', function () {
  assert.ok(!ht.canBeat(ht.identifyHand(sameRank(5, 4)), ht.identifyHand([bigA('H')])));
});
test('B4.4 5 张大蛋子 能压 单大A (§6.4 5/6张能管)', function () {
  assert.ok(ht.canBeat(ht.identifyHand(sameRank(5, 5)), ht.identifyHand([bigA('H')])));
});
test('B4.5 双大A 与 单大A 是不同牌型', function () {
  assert.strictEqual(ht.identifyHand(dblBigA).type, HAND_TYPES.DOUBLE_BIG_A);
  assert.strictEqual(ht.identifyHand([bigA('D')]).type, HAND_TYPES.SINGLE);
});

// ================= B5 =================
section('B5 发牌起始玩家随机 (§2.2)');
test('B5.1 引擎不传 startPlayerIndex 时起始玩家随机', function () {
  var seen = {};
  for (var i = 0; i < 40; i++) {
    var r = engine.transition(engine.newGameState(), { type: 'START_GAME', payload: {} });
    assert.ok(r.ok, 'START_GAME 失败: ' + (r.error && r.error.message));
    seen[r.state.startPlayerIndex] = true;
  }
  assert.ok(Object.keys(seen).length > 1, '40 次发牌起始玩家始终相同: ' + JSON.stringify(Object.keys(seen)));
});
test('B5.2 game.js 不再写死 startPlayerIndex: 0', function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  // 去掉行注释再查 —— 注释里会引用旧代码原文, 否则会误匹配自己写的说明
  var code = src.split('\n').filter(function (l) { return l.trim().indexOf('//') !== 0; }).join('\n');
  assert.ok(!/startPlayerIndex:\s*0/.test(code), 'game.js 里仍有 startPlayerIndex: 0');
});

// ================= 汇总 =================
console.log('\n========================================================');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failures.length) {
  console.log('失败项:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed === 0 ? 0 : 1);
