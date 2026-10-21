// tests/audit-identity.js — 自主审查: 强制排查 §4.2 / 反A §4.4 / 底牌转移 §4.5 / 牌型边界 §6 / 推风 §9
var engine = require('../src/index.js');
var { transition, _runForcedCheck } = require('../src/transition.js');
var { ACTIONS, PHASES } = require('../src/phases.js');
var { createNormalCard, createBigJoker, createSmallJoker } = require('../src/card.js');
var { identifyHand, canBeat, HAND_TYPES } = require('../src/hand-types.js');
var { pushWind } = require('../src/push-wind.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var uid = 0;
function C(s, r) { return createNormalCard(s, r, 'c' + (++uid)); }
function A(s) { return createNormalCard(s, 14, 'a' + (++uid)); }
function BigA(s) { var c = createNormalCard(s, 14, 'b' + (++uid)); c.is主方大A = true; return c; }
function H(cards) { return identifyHand(cards); }

// ================= 1. 强制排查 §4.2 =================
section('1. 强制排查 §4.2');

function mkForced(spec) {
  // spec: { playerId: { suit: count } }  只含 A 牌
  var ids = ['A', 'B', 'C', 'D', 'E'];
  return {
    phase: PHASES.FORCED_CHECK,
    主A: null, 反A: null, 次方: null, mode: null,
    主方: [], 抓方: [], 底牌公开: false, 次方公开: false,
    table: [], discarded: [], passedPlayers: [], passCount: 0, lastPlayer: null,
    推风触发者: null, 头名: null, startPlayerIndex: 0, dealOrder: [], deck: [], actions: [],
    players: ids.map(function (id) {
      var arr = [];
      var cfg = spec[id] || {};
      Object.keys(cfg).forEach(function (s) {
        for (var i = 0; i < cfg[s]; i++) arr.push(A(s));
      });
      return { id: id, hand: arr, 底牌: null };
    })
  };
}

// _runForcedCheck(state) 直接返回 { suit, establishedBy, viaMethod }（不是包在 state.主A 里）
var FC = function (spec, startIdx) {
  var st = mkForced(spec);
  st.startPlayerIndex = startIdx === undefined ? 0 : startIdx;
  return _runForcedCheck(st);
};

// 1.1 遍历顺序: 先按玩家(从 startPlayerIndex 起), 再按花色 ♥♦♣♠
//  spec: B 有 ♦A, C 有 ♥A → 先查到 B 的 ♦A, 不会跳到 C 的 ♥A
{
  var r = FC({ B: { D: 1 }, C: { H: 1 } });
  check('1.1 玩家序优先于花色序 (B 的♦A 先于 C 的♥A)',
    r && r.suit === 'D' && r.establishedBy === 'B', JSON.stringify(r));
}

// 1.2 同花色两张 A 在同一玩家 → 跳过该花色
{
  var r = FC({ A: { C: 2, H: 1 } });
  check('1.2 己手 ♣A×2 → 跳过♣, 取 ♥A',
    r && r.suit === 'H' && r.establishedBy === 'A', JSON.stringify(r));
}

// 1.3 每玩家内花色序 ♥♦♣♠
{
  var r = FC({ A: { S: 1, D: 1 } });
  check('1.3 同时有 ♦A 和 ♠A → 先 ♦',
    r && r.suit === 'D', JSON.stringify(r));
}

// 1.4 无可排查单 A → 红桃 A 兜底
{
  var r = FC({ A: { H: 2 }, B: { D: 2 } });
  check('1.4 全部同花色两张 → 红桃A 兜底',
    r && r.suit === 'H' && r.viaMethod === 'DEFAULT_HEART', JSON.stringify(r));
}

// 1.5 玩家顺序优先于花色全局顺序
{
  var r = FC({ A: { D: 1 }, C: { H: 1 } });
  check('1.5 玩家优先 (A 的♦A 先于 C 的♥A)',
    r && r.suit === 'D' && r.establishedBy === 'A', JSON.stringify(r));
}

// 1.6 startPlayerIndex 决定遍历起点
{
  var r = FC({ A: { H: 1 }, B: { D: 1 } }, 1);
  check('1.6 startIdx=1 → 先查 B 的 ♦A',
    r && r.suit === 'D' && r.establishedBy === 'B', JSON.stringify(r));
}

// 1.7 底牌里的 A 不参与排查 (§4.2)
{
  var st = mkForced({ B: { D: 1 } });
  st.startPlayerIndex = 0;
  // A 的底牌放一张 ♥A
  st.players[0].底牌 = A('H');
  var r = _runForcedCheck(st);
  check('1.7 底牌 A 不参与排查', r && r.suit === 'D' && r.establishedBy === 'B', JSON.stringify(r));
}

// ================= 2. 牌型边界 §6 =================
section('2. 牌型边界 §6');

check('2.1 单张顺序 大A>大王>小王>3>2>A>K',
  canBeat(H([BigA('H')]), H([createBigJoker()])) === true &&
  canBeat(H([createBigJoker()]), H([createSmallJoker()])) === true &&
  canBeat(H([createSmallJoker()]), H([C('H', 3)])) === true &&
  canBeat(H([C('H', 3)]), H([C('H', 2)])) === true &&
  canBeat(H([C('H', 2)]), H([C('H', 14)])) === true &&
  canBeat(H([C('H', 14)]), H([C('H', 13)])) === true,
  '§6.2 单张顺序');

check('2.2 QKA 最大, A23 最小 (§6.1)',
  canBeat(H([C('S', 12), C('D', 13), C('C', 14)]), H([C('S', 10), C('D', 11), C('C', 12)])) === true,
  'QKA > QKQ');

check('2.3 K-A-2 不合法 (§6.1)',
  H([C('S', 13), C('D', 14), C('C', 2)]).type === HAND_TYPES.INVALID,
  H([C('S', 13), C('D', 14), C('C', 2)]).type);

check('2.4 龙只能同张数互压 (§13.10)',
  canBeat(H([C('S', 4), C('D', 5)]), H([C('S', 4), C('D', 5), C('C', 6)])) === false,
  '2张龙压不了3张龙(应为 INVALID 而非 false, 但不得为 true)');

check('2.5 对子不能压龙 (§6 表)',
  canBeat(H([C('S', 14), C('D', 14)]), H([C('S', 10), C('D', 11), C('C', 12)])) === false);

check('2.6 龙不能压对子 (§6 表)',
  canBeat(H([C('S', 10), C('D', 11), C('C', 12)]), H([C('S', 14), C('D', 14)])) === false);

check('2.7 单张不能压对子 (§6 表)',
  canBeat(H([C('S', 14)]), H([C('S', 4), C('D', 4)])) === false);

// §6.3: 龙 / 对子 / 单张 同一层级, 三者之间不互压; 蛋子在其上一层, 可跨型压
check('2.8 蛋子可跨型压单张 (§6.3 全局牌力)',
  canBeat(H([C('S', 4), C('D', 4), C('C', 4)]), H([C('S', 14)])) === true);

check('2.8b 蛋子可跨型压对子 (§6.3 蛋子 > 龙/对子/单张)',
  canBeat(H([C('S', 4), C('D', 4), C('C', 4)]), H([C('S', 14), C('D', 14)])) === true);

check('2.8c 反向: 对子压不了蛋子',
  canBeat(H([C('S', 14), C('D', 14)]), H([C('S', 4), C('D', 4), C('C', 4)])) === false);

check('2.8d 大蛋子可压对子 (§6.3 大蛋子 > 蛋子 > 龙/对子/单张)',
  canBeat(H([C('S', 4), C('D', 4), C('C', 4), C('H', 4)]), H([C('S', 14), C('D', 14)])) === true);

check('2.8e 同层不互压: 对子 vs 单张 vs 龙',
  canBeat(H([C('S', 14), C('D', 14)]), H([C('S', 9)])) === false &&
  canBeat(H([C('S', 9)]), H([C('S', 14), C('D', 14)])) === false &&
  canBeat(H([C('S', 10), C('D', 11), C('C', 12)]), H([C('S', 14), C('D', 14)])) === false);

check('2.9 3张A(含大A)= 普通蛋子, 非双大A (§6 表)',
  H([BigA('H'), C('S', 14), C('D', 14)]).type === HAND_TYPES.TRIPLE);

check('2.10 双大A 混入第3张 → 不再无双 (§6.4)',
  H([BigA('H'), BigA('H'), C('S', 14)]).type !== HAND_TYPES.DOUBLE_BIG_A);

check('2.11 非同花色大A 对 = 普通对子 (§2.1 v5)',
  H([BigA('H'), BigA('C')]).type === HAND_TYPES.PAIR);

check('2.12 双龙: 普通蛋子压不了 (§6.4)',
  canBeat(H([C('S', 4), C('D', 4), C('C', 4)]), H([C('S', 4), C('D', 4), C('S', 5), C('D', 5), C('S', 6), C('D', 6)])) === false);

check('2.13 双王可管对子 (§6.4)',
  canBeat(H([createBigJoker(), createSmallJoker()]), H([C('S', 14), C('D', 14)])) === true);

check('2.14 双王压不了双大A (§6.4)',
  canBeat(H([createBigJoker(), createSmallJoker()]), H([BigA('H'), BigA('H')])) === false);

check('2.15 同点数异花色无大小 (§6.2)',
  canBeat(H([C('S', 4), C('D', 4)]), H([C('C', 4), C('H', 4)])) === false);

// ================= 3. 推风 §9 =================
section('3. 推风 §9');

function mkPush(handSpec, opts) {
  var o = opts || {};
  var ids = ['A', 'B', 'C', 'D', 'E'];
  return {
    phase: PHASES.PLAY, mode: o.mode || '2V3_暗打',
    主A: { suit: 'H', establishedBy: o.establishedBy || 'A', viaMethod: 'FORCED_CHECK' },
    次方: o.次方 !== undefined ? o.次方 : null,
    次方公开: !!o.次方公开,
    主方: o.主方 || ['A'], 抓方: o.抓方 || ['B', 'C', 'D', 'E'],
    推风触发者: o.trigger,
    table: [], discarded: [], passedPlayers: [], passCount: 0, lastPlayer: null, currentPlayer: null,
    players: ids.map(function (id) {
      var n = (handSpec && handSpec[id] !== undefined) ? handSpec[id] : 5;
      var h = [];
      for (var i = 0; i < n; i++) h.push(C('H', (i % 10) + 4));
      return { id: id, hand: h, 底牌: null };
    })
  };
}

// 3.1 触发者已出完才允许推风
{
  var st = mkPush({ A: 3, B: 5, C: 5, D: 5, E: 5 }, { trigger: 'A' });
  var r = pushWind(st);
  check('3.1 触发者未出完 → 拒绝', r.ok === false && r.error.type === 'TRIGGER_NOT_OUT',
    JSON.stringify(r.error));
}

// 3.2 无触发者 → 拒绝
{
  var st = mkPush({ A: 0, B: 5, C: 5, D: 5, E: 5 }, { trigger: null });
  var r = pushWind(st);
  check('3.2 无触发者 → 拒绝', r.ok === false && r.error.type === 'NO_TRIGGER', JSON.stringify(r.error));
}

// 3.3 非 PLAY 阶段 → 拒绝
{
  var st = mkPush({ A: 0, B: 5, C: 5, D: 5, E: 5 }, { trigger: 'A' });
  st.phase = 'GAME_END';
  var r = pushWind(st);
  check('3.3 非 PLAY → 拒绝', r.ok === false && r.error.type === 'INVALID_PHASE', JSON.stringify(r.error));
}

// 3.4 阵营全空 → 立即结算
{
  var st = mkPush({ A: 0, D: 0, B: 5, C: 5, E: 5 },
    { trigger: 'A', mode: '2V3_暗打', 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', establishedBy: 'A' });
  var r = pushWind(st);
  check('3.4 主方全空 → ended', r.ok === true && r.ended === true && r.action === 'PUSH_WIND_END',
    JSON.stringify({ ok: r.ok, ended: r.ended, winner: r.winner, reason: r.reason }));
}

// 3.5 跳过已出完玩家
{
  var st = mkPush({ A: 0, B: 0, C: 5, D: 5, E: 5 },
    { trigger: 'A', mode: '2V3_暗打', 主方: ['A'], 抓方: ['B', 'C', 'D', 'E'], 次方: null, establishedBy: 'A' });
  var r = pushWind(st);
  check('3.5 跳过已出完的 B', r.ok === true && r.target !== 'B', 'target=' + r.target);
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);