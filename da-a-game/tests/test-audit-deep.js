// tests/audit-deep.js — 自主审查: 计分 / 胜负 / 取牌 / 状态完整性
var engine = require('../src/index.js');
var { transition } = require('../src/transition.js');
var { ACTIONS, PHASES } = require('../src/phases.js');
var { createNormalCard, createBigJoker, createSmallJoker } = require('../src/card.js');
var { identifyHand, canBeat, HAND_TYPES, compareHands } = require('../src/hand-types.js');
var { canCapture, executeCapture } = require('../src/capture.js');
var { checkGameEnd } = require('../src/win-loss.js');
var { camps } = require('../src/util.js');
var scoring = require('../src/scoring.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var uid = 0;
function C(s, r) { uid++; return createNormalCard(s, r, 'c' + uid); }
function BJ() { uid++; return createBigJoker('j' + uid); }
function SJ() { uid++; return createSmallJoker('s' + uid); }
function BigA(s) { var c = createNormalCard(s, 14, 'b' + (++uid)); c.is主方大A = true; return c; }
function H(cards) { return identifyHand(cards); }

function mkState(opts) {
  var base = {
    phase: PHASES.PLAY, mode: '2V3_暗打',
    主A: { suit: 'C', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    反A: null, 次方: 'D', 次方公开: false, 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    底牌公开: true, table: [], discarded: [], passedPlayers: [], passCount: 0,
    lastPlayer: null, 推风触发者: null, 头名: null,
    players: [], actions: [], deck: [], dealOrder: []
  };
  if (opts) Object.assign(base, opts);
  return base;
}
function mkPlayers(spec) {
  var ids = ['A', 'B', 'C', 'D', 'E'];
  return ids.map(function (id) {
    var n = spec[id] || 0;
    var hand = [];
    for (var i = 0; i < n; i++) hand.push(C('H', (i % 10) + 4));
    return { id: id, hand: hand, 底牌: null };
  });
}

// ================= 1. 计分 (§11) =================
section('1. 计分规则 SKILL §11');

check('scoring 导出函数', typeof scoring === 'object');
var scKeys = Object.keys(scoring);
check('scoring 有可调用入口', scKeys.length > 0, JSON.stringify(scKeys));

// 尝试找到计分入口
var fnNames = scKeys.filter(function (k) { return typeof scoring[k] === 'function'; });
check('scoring 有函数', fnNames.length > 0, JSON.stringify(fnNames));
fnNames.forEach(function (fn) { console.log('    scoring.' + fn + '(' + scoring[fn].length + ' args)'); });

// ================= 2. 胜负 (§10) =================
section('2. 胜负判定 SKILL §10');

// 2.1 2V3: 一个阵营全空 → 立即结束
{
  var st = mkState({
    主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    players: [
      { id: 'A', hand: [], 底牌: null },
      { id: 'B', hand: [C('H', 5)], 底牌: null },
      { id: 'C', hand: [C('H', 6)], 底牌: null },
      { id: 'D', hand: [], 底牌: null },   // 主方全空
      { id: 'E', hand: [C('H', 7)], 底牌: null }
    ]
  });
  var r = checkGameEnd(st);
  check('2.1 主方全空 → 结束', r.ended === true, JSON.stringify(r));
  check('2.1 胜方=主方(2V3 主方全空则抓方胜? 按§10.4用通用规则)', !!r.winner, JSON.stringify(r));
}

{
  var st = mkState({
    主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    players: [
      { id: 'A', hand: [C('H', 5)], 底牌: null },
      { id: 'B', hand: [], 底牌: null },
      { id: 'C', hand: [], 底牌: null },
      { id: 'D', hand: [C('H', 6)], 底牌: null },
      { id: 'E', hand: [], 底牌: null }    // 抓方全空
    ]
  });
  var r = checkGameEnd(st);
  check('2.2 抓方全空 → 结束', r.ended === true, JSON.stringify(r));
}

// 2.3 1V4明打: 第一个人先出完即结束
{
  var st = mkState({
    mode: '1V4_明打', 主方: ['A'], 抓方: ['B', 'C', 'D', 'E'], 次方: null,
    players: [
      { id: 'A', hand: [], 底牌: null },   // 独打者先出完
      { id: 'B', hand: [C('H', 5)], 底牌: null },
      { id: 'C', hand: [C('H', 6)], 底牌: null },
      { id: 'D', hand: [C('H', 7)], 底牌: null },
      { id: 'E', hand: [C('H', 8)], 底牌: null }
    ]
  });
  var r = checkGameEnd(st);
  check('2.3 1V4明打 独打者先出完 → 结束且胜', r.ended === true && r.winner === '主方', JSON.stringify(r));
}

{
  var st = mkState({
    mode: '1V4_暗打', 主方: ['A'], 抓方: ['B', 'C', 'D', 'E'], 次方: null,
    players: [
      { id: 'A', hand: [], 底牌: null },
      { id: 'B', hand: [], 底牌: null },
      { id: 'C', hand: [C('H', 6)], 底牌: null },
      { id: 'D', hand: [C('H', 7)], 底牌: null },
      { id: 'E', hand: [C('H', 8)], 底牌: null }
    ]
  });
  var r = checkGameEnd(st);
  check('2.4 1V4暗打 抓方全空而独打者已空 → 结束', r.ended === true, JSON.stringify(r));
}

// ================= 3. 取牌 (§7) =================
section('3. 4取牌 SKILL §7');

// canCapture(fours, target) — 纯函数, 不接 state
{
  var t3 = [C('H', 5), C('D', 5), C('C', 5)];
  check('3.1 2个4 取 3 张目标 → 可取', canCapture([C('H', 4), C('D', 4)], t3).canCapture === true);
  check('3.2 1个4 取 3 张目标 → 不可取', canCapture([C('H', 4)], t3).canCapture === false);
  check('3.3 王为目标 → 不可取', canCapture([C('H', 4), C('D', 4)], [BJ(), BJ(), SJ()]).canCapture === false);
  check('3.4 用王取 → 不可取', canCapture([BJ(), BJ()], t3).canCapture === false);
  check('3.5 非4取 → 不可取', canCapture([C('H', 6), C('D', 6)], t3).canCapture === false);
  check('3.6 目标非同点数 → 不可取', canCapture([C('H', 4), C('D', 4)], [C('H', 5), C('D', 6), C('C', 7)]).canCapture === false);
  check('3.7 4 张目标需 3 个 4', canCapture([C('H', 4), C('D', 4), C('C', 4)], [C('H', 5), C('D', 5), C('C', 5), C('S', 5)]).canCapture === true);
  check('3.8 2 张目标不能被取 (需 3-8)', canCapture([C('H', 4)], [C('H', 5), C('D', 5)]).canCapture === false);

  // 3.9 executeCapture: 4 上桌, target 入手, 大A 失身份 (§7.3)
  var bigA = BigA('C');
  var st9 = mkState({
    table: [bigA, C('C', 14), C('C', 14)],
    lastPlayer: 'A',
    players: [
      { id: 'A', hand: [], 底牌: null },
      { id: 'B', hand: [C('H', 4), C('D', 4)], 底牌: null },
      { id: 'C', hand: [], 底牌: null },
      { id: 'D', hand: [], 底牌: null },
      { id: 'E', hand: [], 底牌: null }
    ]
  });
  var cap = executeCapture(st9, 'B', st9.players[1].hand);
  check('3.9 取牌成功', cap.ok === true, JSON.stringify(cap.error));
  if (cap.ok) {
    check('3.9 2 个 4 上桌', cap.state.table.length === 2);
    check('3.9 target 入 B 手牌 (3张)', cap.state.players.find(function (p) { return p.id === 'B'; }).hand.length === 3);
    var capturedBigA = cap.state.players.find(function (p) { return p.id === 'B'; }).hand.filter(function (c) { return c.id === bigA.id; })[0];
    check('3.9 §7.3 被取回大A 失身份', capturedBigA && capturedBigA.is主方大A === false);
    check('3.9 过牌重置', cap.state.passedPlayers.length === 0 && cap.state.passCount === 0);
  }
}

// ================= 4. 状态完整性 (§14) =================
section('4. 状态完整性 / 失败不改状态');

{
  var st = mkState({ players: mkPlayers({ A: 5, B: 5, C: 5, D: 5, E: 5 }) });
  var snapshot = JSON.stringify(st);
  var r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: ['nonexistent'] } });
  check('4.1 无效 cardIds → 拒绝', r.ok === false, JSON.stringify(r.error));
  check('4.2 失败后 state 未变', r.state === st || JSON.stringify(r.state) === snapshot);
}

{
  // 4.3 对局结束后不能再出牌
  var st = mkState({ phase: 'GAME_END', players: mkPlayers({ A: 2, B: 2, C: 2, D: 2, E: 2 }) });
  var r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: [] } });
  check('4.3 GAME_END 阶段出牌 → 拒绝', r.ok === false, JSON.stringify(r.error || r.ok));
}

{
  // 4.4 牌张守恒: 出牌后 hand 减少, table 增加, discarded 承接旧 table
  var hand = [C('H', 5), C('D', 6), C('C', 7)];
  var st = mkState({
    table: [C('S', 4)],
    players: [
      { id: 'A', hand: hand.slice(), 底牌: null },
      { id: 'B', hand: [C('H', 8)], 底牌: null },
      { id: 'C', hand: [C('H', 8)], 底牌: null },
      { id: 'D', hand: [C('H', 8)], 底牌: null },
      { id: 'E', hand: [C('H', 8)], 底牌: null }
    ]
  });
  var before = st.players[0].hand.length;
  // 出比桌牌更大的单张 (10 > 9)
  var r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: [hand[2].id] } });
  check('4.4 出牌成功', r.ok === true, JSON.stringify(r.error));
  if (r.ok) {
    check('4.4 hand 减 1', r.state.players[0].hand.length === before - 1);
    check('4.4 table = 出的牌', r.state.table.length === 1);
    check('4.4 旧 table 进 discarded', r.state.discarded.length === 1);
  }
}

// ================= 5. 阵营 camps() =================
section('5. 阵营推导 camps()');

{
  var st = mkState({ 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'] });
  var c = camps(st);
  check('5.1 camps 返回 main/takers', c && c.main && c.takers, JSON.stringify(c));
  check('5.2 main 长度正确', c.main.length === 2, JSON.stringify(c.main));
  check('5.3 takers 长度正确', c.takers.length === 3, JSON.stringify(c.takers));
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);