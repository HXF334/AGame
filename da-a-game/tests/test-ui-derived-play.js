// test-ui-derived-play.js
// [P2 2026-11-12 D-064] UI 镜像收敛: 「各家最新出牌 / 不出 / 取 / 轮次」必须由
//   引擎出牌流水(gameState.plays)派生, 不再由 game.js 各自维护一份。
//   这里直接注入流水 + draw(), 断言派生结果, 防止以后又长回手工镜像。
var path = require('path');
var g = require(path.join(__dirname, '..', 'game.js'));
var SB = require('./lib/state-builder.js');

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

function st(plays) {
  var s = SB.build({});
  s.phase = 'PLAY';
  s.plays = plays || [];
  return s;
}

console.log('\n=== 1. PLAY 流水 -> uiPlays ===');
var cards = [SB.C('S', 9), SB.C('H', 9)];
g.__setState(st([{ playerId: 'B', kind: 'PLAY', type: 'PAIR', count: 2, cards: cards }]),
  { human: 'A', currentPlayer: 'A', clearLog: true });
g.draw();
check('1.1 流水里的 PLAY 出现在 uiPlays', !!(g.uiPlays().B && g.uiPlays().B.length === 2),
  JSON.stringify(Object.keys(g.uiPlays())));
check('1.2 出牌轮次 = 当前轮', g.uiPlaysTrick().B === g.uiTrickId(),
  'playTrick=' + g.uiPlaysTrick().B + ' cur=' + g.uiTrickId());

console.log('\n=== 2. PASS 流水 -> 清牌 + 「不出」 ===');
g.__setState(st([
  { playerId: 'B', kind: 'PLAY', type: 'PAIR', count: 2, cards: cards },
  { playerId: 'B', kind: 'PASS', type: 'PASS', count: 0 }
]), { human: 'A', currentPlayer: 'A', clearLog: true });
g.draw();
check('2.1 PASS 后该玩家出牌显示被清掉', !g.uiPlays().B, JSON.stringify(Object.keys(g.uiPlays())));
check('2.2 PASS 后「不出」为真', g.uiPassed().B === true, JSON.stringify(g.uiPassed()));

console.log('\n=== 3. CAPTURE 流水 -> 「取」标志 ===');
g.__setState(st([
  { playerId: 'E', kind: 'PLAY', type: 'TRIPLE', count: 3, cards: [SB.C('S', 5), SB.C('H', 5), SB.C('D', 5)] },
  { playerId: 'A', kind: 'CAPTURE', type: 'BIG_TRIPLE', count: 4, beat: 'E',
    useFours: 4, cards: [SB.C('S', 4), SB.C('H', 4), SB.C('D', 4), SB.C('C', 4)] }
]), { human: 'A', currentPlayer: 'A', clearLog: true });
g.draw();
check('3.1 被取那手牌的主人被标记', g.__uiState().uiTakenPlay.E === true, JSON.stringify(g.__uiState().uiTakenPlay));
check('3.2 取牌者自己不被标记', !g.__uiState().uiTakenPlay.A, JSON.stringify(g.__uiState().uiTakenPlay));
check('3.3 取牌者打出的 4 显示在桌面', !!(g.uiPlays().A && g.uiPlays().A.length === 4),
  JSON.stringify(Object.keys(g.uiPlays())));

console.log('\n=== 4. CLEAR 流水 -> 轮次 +1, 未出完的人保留旧牌 ===');
g.__setState(st([
  { playerId: 'B', kind: 'PLAY', type: 'PAIR', count: 2, cards: cards },
  { playerId: 'C', kind: 'PASS', type: 'PASS', count: 0 },
  { playerId: 'B', kind: 'CLEAR', type: 'CLEAR', count: 0 }
]), { human: 'A', currentPlayer: 'A', clearLog: true });
g.draw();
check('4.1 CLEAR 后轮次 +1', g.uiTrickId() === 1, 'trick=' + g.uiTrickId());
check('4.2 未出完的人旧牌仍显示', !!(g.uiPlays().B && g.uiPlays().B.length === 2),
  JSON.stringify(Object.keys(g.uiPlays())));

console.log('\n=== 5. 注入局面重置派生状态 ===');
g.__setState(st([]), { human: 'A', currentPlayer: 'A', clearLog: true });
g.draw();
check('5.1 空流水 -> uiPlays/uiTakenPlay/uiPassed 全空',
  Object.keys(g.uiPlays()).length === 0 && Object.keys(g.__uiState().uiTakenPlay).length === 0 && Object.keys(g.uiPassed()).length === 0,
  JSON.stringify({ p: Object.keys(g.uiPlays()), t: Object.keys(g.__uiState().uiTakenPlay), s: Object.keys(g.uiPassed()) }));

console.log('\ntest-ui-derived-play: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
