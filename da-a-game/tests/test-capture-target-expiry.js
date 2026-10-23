// tests/test-capture-target-expiry.js — §13.14 取牌目标失效 + 取牌后过牌重置
//
// 为什么补这个: T6 规则层对账发现 §13.14 **整条无断言**。
//   SKILL §13.14: 任何新有效出牌让旧取牌目标失效；全员过牌导致本轮结束时,
//                 未被取走目标失效；取牌后过牌状态重置。
// 全 51 个套件里 `目标.*失效` 命中 0 —— 一条都没有。
//
// 【实现现状】canCapture(fours, target) 的 target **就是 state.table**,
//   没有独立的「取牌资格」字段。故 §13.14 前两条是**结构性保证**
//   (新出牌替换 table / 轮结束清空 table), 第三条由 executeCapture 显式重置。
//   **行为已实现, 只是没有任何断言** —— 这正是 T6「有测试 != 有断言」的实例。
//
// 【为什么用引擎级 transition 而不是直接调 capture.js】
//   §13.14 管的是「轮次与目标的生命周期」, canCapture 只判断单次能否取。
//   只测 canCapture 覆盖不到「新出牌后旧目标失效」这种跨动作行为。
//
// 【踩过的坑 —— 前一版 5 项全红, 全是我 setup 写错, 不是产品 bug】
//   1. SB.build 的参数是 **handMap**, 没有 keyCards(k keyCards 是 test-doplay-fallback
//      的写法)。传错会被**静默忽略** -> 所有玩家的手牌被自动填充成 rank 5~13,
//      我指定的 5555/444 根本不在手里 -> 报 CARD_NOT_FOUND。
//   2. SB.build 的填充牌 rank 范围是 **5..13**(刻意避开 A/王/4)。
//      所以**按 rank 计数会被填充牌干扰** -> 必须按**卡牌 ID** 计数。
//      (与 test-doplay-fallback 当初踩的「填充牌含大小王」同源)
//   3. 桌面空时过牌是非法的(CANNOT_PASS)。上述 1 导致甲出牌失败 -> 桌面空
//      -> 后面 B 的过牌跟着失败 -> 级联报错。**先修根因, 别追级联症状**。
var assert = require('assert');
var transition = require('../src/transition.js').transition;
var ACTIONS = require('../src/phases.js').ACTIONS;
var SB = require('./lib/state-builder.js');
var canCapture = require('../src/capture.js').canCapture;

var passed = 0, failed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  FAIL  ' + name); console.log('        ' + (e && e.message ? e.message : e)); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function ids(cards) { return cards.map(function (c) { return c.id; }); }

// 按**卡牌 ID** 统计手牌里有多少张属于 cards —— 避开填充牌的 rank 干扰
function countIn(hand, cards) {
  var want = {};
  cards.forEach(function (c) { want[c.id] = 1; });
  return hand.filter(function (c) { return want[c.id]; }).length;
}

// 【§7.1 的 4 数量】取牌用的 4 比目标**少一张**: 3 张目标用 **2** 个 4,
//   4 张目标用 3 个 4。本文件所有场景都是 3 张目标, 故一律用 **2 个 4**。
//   [自查] 前一版这里写的是 3 个 4, 直接报 CANNOT_BEAT —— 这是我**第三次**
//   在这条规则上出错(§13.13 描述写反、commit 提「取出 5555...44 取蛋」时用错)。
//   §7.1 L198 原文:「3张目标用2个4，4张目标用3个4……8张目标用7个4」。
//   取对数量后, 失败原因才是唯一的(桌面没目标), 断言才有意义。
function twoFours() { return [SB.C('H', 4), SB.C('D', 4)]; }

function build(o) {
  o = o || {};
  return SB.build({
    handMap: o.handMap || {},          // ← 是 handMap, 不是 keyCards
    table: o.table || [],
    lastPlayer: o.lastPlayer === undefined ? null : o.lastPlayer,
    passedPlayers: o.passedPlayers || [],
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: true, 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_暗打'
  });
}
function handOf(st, id) { return st.players.filter(function (p) { return p.id === id; })[0]; }
function play(st, playerId, cards) {
  return transition(st, { type: ACTIONS.PLAY, payload: { playerId: playerId, cardIds: ids(cards) } });
}
function pass(st, playerId) {
  return transition(st, { type: ACTIONS.PASS, payload: { playerId: playerId } });
}

// ============================================================
// §13.14-1  任何新有效出牌让旧取牌目标失效
// ============================================================
section('1. §13.14-1 新有效出牌让旧取牌目标失效');

test('1.1 甲出 555 -> 乙压过 999: 桌面换为 999, 555 不再是目标', function () {
  var c555 = [SB.C('H', 5), SB.C('D', 5), SB.C('S', 5)];
  var c999 = [SB.C('H', 9), SB.C('D', 9), SB.C('S', 9)];
  var st = build({ handMap: { A: c555, B: c999 } });

  var r1 = play(st, 'A', c555);
  assert.strictEqual(r1.ok, true, '甲出 555 应成功: ' + JSON.stringify(r1.error));
  assert.strictEqual(r1.state.table.length, 3, '桌面应为 3 张');

  var r2 = play(r1.state, 'B', c999);        // 新有效出牌
  assert.strictEqual(r2.ok, true, '乙出 999 应成功: ' + JSON.stringify(r2.error));
  assert.strictEqual(r2.state.table.length, 3, '桌面应仍 3 张(旧牌被替换)');
  assert.strictEqual(countIn(r2.state.table, c999), 3, '桌面应为乙的 999');
  assert.strictEqual(countIn(r2.state.table, c555), 0, '桌面不应残留已失效的 555');
});

test('1.2 旧目标失效后: 丙取牌拿到的是**新**目标 999, 不是 555', function () {
  var c555 = [SB.C('H', 5), SB.C('D', 5), SB.C('S', 5)];
  var c999 = [SB.C('H', 9), SB.C('D', 9), SB.C('S', 9)];
  var fours = twoFours();                      // 3 张目标 -> 2 个 4
  var st = build({ handMap: { A: c555, B: c999, C: fours } });

  var r1 = play(st, 'A', c555);
  var r2 = play(r1.state, 'B', c999);
  var r3 = play(r2.state, 'C', fours);        // 用 444 取当前桌面(999)
  assert.strictEqual(r3.ok, true, '丙用 444 取 999 应成功: ' + JSON.stringify(r3.error));

  var cHand = handOf(r3.state, 'C').hand;
  assert.strictEqual(countIn(cHand, c999), 3, '丙应拿到 3 张 9 (当前目标)');
  assert.strictEqual(countIn(cHand, c555), 0, '丙**不应**拿到已失效的 555');
});

// ============================================================
// §13.14-2  全员过牌导致本轮结束时, 未被取走目标失效
// ============================================================
section('2. §13.14-2 全员过牌致轮结束, 未被取走目标失效');

test('2.1 甲出 555 -> 乙丙丁戊全过牌: 轮结束, 桌面清空(目标失效)', function () {
  var c555 = [SB.C('H', 5), SB.C('D', 5), SB.C('S', 5)];
  var st = build({ handMap: { A: c555 } });

  var r1 = play(st, 'A', c555);
  assert.strictEqual(r1.ok, true, '甲出牌应成功: ' + JSON.stringify(r1.error));
  assert.strictEqual(r1.state.table.length, 3, '出牌后桌上有目标');

  var s = r1.state;
  ['B', 'C', 'D', 'E'].forEach(function (id) {
    var rp = pass(s, id);
    assert.strictEqual(rp.ok, true, id + ' 过牌应成功: ' + JSON.stringify(rp.error));
    s = rp.state;
  });
  assert.strictEqual(s.table.length, 0, '全员过牌 -> 轮结束 -> 桌面清空, 目标失去取牌资格');
  assert.strictEqual(s.passedPlayers.length, 0, '轮结束后 passedPlayers 应重置');
  assert.strictEqual(s.passCount, 0, '轮结束后 passCount 应重置');
});

// 【层次说明】2.1 已在引擎层证明了「全员过牌 -> 轮结束 -> 桌面清空」。
//   2.2 只断言剩下的那一层: **桌面无目标时判定不可取**(canCapture 单次判定)。
//   前一版试图用引擎路径再证一遍, 但轮结束后桌面为空、引擎按轮次顺序强制下一个
//   必须行动的玩家「出牌」而非「取牌」, 硬凑会测到别的东西 -> 改为单元层断言。
//   [自查] 前一版还漏让乙过牌(['C','D','E'] 少了 'B'), 轮次根本没结束,

test('2.2 目标失效(桌面为空)时, canCapture 判定不可取', function () {
  var r = canCapture(twoFours(), []);        // 目标为空
  assert.strictEqual(r.canCapture, false, '桌面无目标时不可取');
  assert.ok(r.reason, '应给出原因');
});

// ============================================================
// §13.14-3  取牌后过牌状态重置
// ============================================================
section('3. §13.14-3 取牌后过牌状态重置');

test('3.1 甲出 555 -> 乙过牌 -> 丙用 2 个 4 取走: passedPlayers/passCount 归零', function () {
  var c555 = [SB.C('H', 5), SB.C('D', 5), SB.C('S', 5)];
  var fours = twoFours();
  var st = build({ handMap: { A: c555, C: fours } });

  var r1 = play(st, 'A', c555);
  var r2 = pass(r1.state, 'B');
  assert.strictEqual(r2.ok, true, '乙过牌应成功: ' + JSON.stringify(r2.error));
  assert.strictEqual(r2.state.passedPlayers.length, 1, '过牌后应有 1 人已过');
  assert.strictEqual(r2.state.passCount, 1, '过牌后 passCount 应为 1');

  var r3 = play(r2.state, 'C', fours);        // 取牌
  assert.strictEqual(r3.ok, true, '丙用 444 取牌应成功: ' + JSON.stringify(r3.error));
  assert.strictEqual(r3.state.passedPlayers.length, 0, '取牌后过牌状态应重置(§13.14)');
  assert.strictEqual(r3.state.passCount, 0, '取牌后 passCount 应重置(§13.14)');
  assert.strictEqual(r3.state.lastPlayer, 'C', '取牌后 lastPlayer 应为取牌者');
  assert.strictEqual(countIn(r3.state.table, fours), 2, '桌面应为丙打出的 2 个 4');
});

test('3.2 取牌后: 被取走的目标进手牌, 4 留桌面, 牌张守恒(§7.2)', function () {
  var c555 = [SB.C('H', 5), SB.C('D', 5), SB.C('S', 5)];
  var fours = twoFours();
  var st = build({ handMap: { A: c555, C: fours } });
  var s = pass(play(st, 'A', c555).state, 'B').state;
  var r = play(s, 'C', fours);
  assert.strictEqual(r.ok, true, '取牌应成功: ' + JSON.stringify(r.error));

  var cHand = handOf(r.state, 'C').hand;
  assert.strictEqual(countIn(cHand, c555), 3, '被取走的 555 应在丙手牌里');
  assert.strictEqual(countIn(cHand, fours), 0, '打出的 444 不应留在手牌里');
  assert.strictEqual(r.state.table.length, 2, '4 应留在桌面');
  assert.strictEqual(countIn(r.state.table, fours), 2, '桌面应为丙的 44');
  assert.strictEqual(countIn(r.state.table, fours), 2, '桌面应为丙打出的 2 个 4');

  // 取牌只是转移位置, 不凭空增减
  assert.strictEqual(SB.countAll(r.state), 108,
    '取牌后牌张仍应守恒 108, 实际 ' + SB.countAll(r.state));
});

console.log('\n=== 总结 ===');
console.log('passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('FAILED:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed > 0 ? 1 : 0);