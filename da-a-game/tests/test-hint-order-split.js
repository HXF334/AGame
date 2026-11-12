// test-hint-order-split.js
// [2026-11-12 用户] 「我有 JJQ2, 上家出 9, 点提示第一次 Q, 第二次 J, 第三次 2。
//   第二次应该选中 2, 第三次选中 J 才对。」
// 根因: 提示排序只有 ai.splitPenalty(同点家族), 缺托管 split 键(拆对子也算拆组),
//   于是 J(拆 JJ) 与 2(不拆) 都算不罚, 再按 value 升序 -> J 抢到 2 前面。
// 断言: 候选顺序为 Q → 2 → J; 托管第一手也是 Q(提示首手 = 托管)。
var path = require('path');
var g = require(path.join(__dirname, '..', 'game.js'));
var SB = require('./lib/state-builder.js');
var ai = require(path.join(__dirname, '..', 'src', 'ai.js'));

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

var j1 = SB.C('S', 11), j2 = SB.C('H', 11), q = SB.C('D', 12), two = SB.C('C', 2);
var st = {
  phase: 'PLAY', mode: '2V3_暗打',
  主A: { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
  次方: 'C', 次方公开: false, 主方: ['B', 'C'], 抓方: ['A', 'D', 'E'], 底牌公开: true,
  头名: null, 推风触发者: null,
  table: [SB.C('S', 9)], discarded: [], passedPlayers: [], passCount: 0,
  lastPlayer: 'E', plays: [], actions: [],
  players: [
    { id: 'A', hand: [j1, j2, q, two] },
    { id: 'B', hand: [] }, { id: 'C', hand: [] }, { id: 'D', hand: [] }, { id: 'E', hand: [] }
  ]
};
g.__setState(st, { human: 'A', currentPlayer: 'A', clearLog: true });

var cands = g.uiHintCandidates();
var labels = cands.map(function (c) { return c.label; }).join(' / ');
function idxOf(rank) {
  return cands.findIndex(function (c) { return c.cards.length === 1 && c.cards[0].rank === rank; });
}

console.log('\n=== 1. JJQ2 打单 9 的提示顺序 ===');
check('1.1 第一手是 Q', cands[0] && cands[0].cards.length === 1 && cands[0].cards[0].rank === 12, labels);
check('1.2 2 排在 J 前面', idxOf(2) >= 0 && idxOf(11) >= 0 && idxOf(2) < idxOf(11),
  'i2=' + idxOf(2) + ' iJ=' + idxOf(11) + ' | ' + labels);
check('1.3 顺序为 Q → 2 → J', idxOf(12) === 0 && idxOf(2) === 1 && idxOf(11) === 2,
  'iQ=' + idxOf(12) + ' i2=' + idxOf(2) + ' iJ=' + idxOf(11));

console.log('\n=== 2. 与托管同源 ===');
var act = ai.chooseAction(st, 'A');
check('2.1 托管也出 Q(不拆 JJ)', act && act.type === 'PLAY' && act.cardIds.length === 1 &&
  act.cardIds[0] === q.id, act && JSON.stringify(act.cardIds));
check('2.2 提示首手 = 托管那一手', cands[0].ids.join(',') === act.cardIds.join(','));

console.log('\n=== 3. 拆组标记 ===');
var singleJ = cands.filter(function (c) { return c.cards.length === 1 && c.cards[0].rank === 11; })[0];
var single2 = cands.filter(function (c) { return c.cards.length === 1 && c.cards[0].rank === 2; })[0];
// [2026-11-12 用户] 拆对子权重 2(拆龙权重 1), 这里 J 拆的是对子 -> 2
check('3.1 单张 J 标记为拆组', singleJ && singleJ.splitGroup === 2, singleJ && String(singleJ.splitGroup));
check('3.2 单张 2 不算拆组', single2 && single2.splitGroup === 0, single2 && String(single2.splitGroup));

console.log('\ntest-hint-order-split: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
