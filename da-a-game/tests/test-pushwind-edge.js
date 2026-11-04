// tests/test-pushwind-edge.js —— C7: 推风 / 收尾边界回归
//
// [用户 2026-11-04] 「C7 可以补回归」(之前手动测过没问题, 这里固化成断言)
//   1. 推风**连续两次**: 推风目标出完 -> 本轮结束 -> 再次推风, 目标是同阵营另一个没出完的人
//   2. 推风目标**立刻出完** -> 牌局正常结束(GAME_END), 且不留倒计时闹钟
//   3. 推风后当前玩家的回合显示被清干净(不跟闹钟打架)
//
// [注意] 本文件**不装 mock-wx**: ctx 保持 null -> game.js 的 runAI() 首行 `if (!ctx) return`
//   -> AI 不接管, 被测逻辑完全隔离(同 tests/test-pushwind-trigger.js 的做法)。
var g = require('../game.js');
var { createNormalCard } = require('../src/card.js');

var passed = 0, failed = 0, failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
var n = 0;
function C(suit, rank) { return createNormalCard(suit, rank, 'pw' + (++n)); }

function mkState(o) {
  o = o || {};
  var st = g.gameState();
  st.phase = 'PLAY';
  st.mode = '2V3_暗打';
  st['主A'] = { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' };
  st['次方'] = 'D'; st['次方公开'] = true;
  st['主方'] = ['A', 'D']; st['抓方'] = ['B', 'C', 'E'];
  st['底牌公开'] = true;
  st.table = []; st.discarded = []; st.passedPlayers = []; st.passCount = 0; st.lastPlayer = 'A';
  st.players.forEach(function (p) {
    p.hand = (o.hands && o.hands[p.id] ? o.hands[p.id] : [C('S', 9), C('H', 10)]).slice();
  });
  st['推风触发者'] = o.trigger || null;
  return st;
}
function player(id) { return g.gameState().players.filter(function (p) { return p.id === id; })[0]; }

// ============================================================
// 1. 连续两次推风
// ============================================================
section('1. 推风连续两次');
{
  var st = mkState({ hands: { B: [] }, trigger: 'B' });
  g.__setState(st, { currentPlayer: 'C', human: 'A', clearLog: true });
  g.doPushWind();
  var t1 = g.currentPlayer();
  check('1.1 第一次推风 -> 目标在抓方且还没出完',
    ['C', 'E'].indexOf(t1) >= 0, 'target=' + t1);
  // 目标出完 -> 本轮结束 -> 再次推风
  player(t1).hand = [];
  g.gameState()['推风触发者'] = t1;
  g.doPushWind();
  var t2 = g.currentPlayer();
  check('1.2 目标出完 -> 再次推风, 目标换成同阵营另一个没出完的人',
    ['C', 'E'].indexOf(t2) >= 0 && t2 !== t1, 'target=' + t2 + ' (上次=' + t1 + ')');
  check('1.3 再次推风后该玩家没有残留的「不出」标记',
    !g.uiPassed()[t2], JSON.stringify(g.uiPassed()));
}

// ============================================================
// 2. 推风目标立刻出完 -> 牌局结束
// ============================================================
section('2. 推风目标立刻出完');
{
  var st = mkState({ hands: { D: [], A: [C('S', 9)] }, trigger: 'D' });
  g.__setState(st, { currentPlayer: 'A', human: 'A', clearLog: true });
  g.doPushWind();
  check('2.1 推风把回合交给真人 A(同阵营最近未出完者)', g.currentPlayer() === 'A', 'cur=' + g.currentPlayer());
  var card = player('A').hand[0];
  g.selectedCards().push(card.id);
  g.doPlay();
  check('2.2 推风目标出完最后一张 -> 牌局结束',
    g.gameState().phase === 'GAME_END', 'phase=' + g.gameState().phase);
  check('2.3 牌局结束后不留倒计时闹钟', g.uiTurnInfo().deadline === 0, 'dl=' + g.uiTurnInfo().deadline);
  check('2.4 牌局结束后没有「不出」残留',
    !g.uiPassed()['A'], JSON.stringify(g.uiPassed()));
}

// ============================================================
// 3. 推风后当前玩家的回合显示被清干净
// ============================================================
section('3. 推风后的回合显示');
{
  var st = mkState({ hands: { B: [] }, trigger: 'B' });
  g.__setState(st, { currentPlayer: 'C', human: 'A', clearLog: true });
  // 人为给「上一轮」留下痕迹: C 出过牌 + 说过不出
  g.uiPlays()['C'] = [C('S', 9, 'old1'), C('H', 10, 'old2')];
  g.uiPassed()['C'] = true;
  g.doPushWind();
  var t = g.currentPlayer();
  check('3.1 推风目标自己的旧出牌显示被清掉', !g.uiPlays()[t], JSON.stringify(Object.keys(g.uiPlays() || {})));
  check('3.2 推风目标自己的「不出」被清掉', !g.uiPassed()[t], JSON.stringify(g.uiPassed()));
  check('3.3 别人的痕迹不该被误清', !!(g.uiPlays()['C'] || g.uiPassed()['C']) || t === 'C',
    'C 的痕迹=' + JSON.stringify(g.uiPassed()['C']));
}

console.log('\ntest-pushwind-edge: ' + passed + ' passed, ' + failed + ' failed');
if (failures.length) {
  console.log('Failed tests:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed === 0 ? 0 : 1);
