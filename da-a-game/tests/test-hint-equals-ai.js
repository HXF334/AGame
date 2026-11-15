// tests/test-hint-equals-ai.js
// [2026-11-16 用户] 提示逻辑 = 托管逻辑，唯一区别是「提示不看阵营」。
//   - 提示第一手 == chooseAction(..., {ignoreCamp:true})；
//   - 上家标成「友」后，托管因「不压同阵营重手」且这手出不完 -> PASS；提示仍按牌理出大A；
//   - 提示候选顺序与托管同一套 comparePicks（跟牌时）。
var path = require('path');
var g = require(path.join(__dirname, '..', 'game.js'));
var SB = require('./lib/state-builder.js');
var ai = require(path.join(__dirname, '..', 'src', 'ai.js'));
var card = require(path.join(__dirname, '..', 'src', 'card.js'));

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function same(a, b) { return !!a && !!b && a.slice().sort().join(',') === b.slice().sort().join(','); }

// B 只留指定牌，其余进弃牌堆；其他玩家不动（保证总牌数 >10，残局搜索不介入）
function trimToB(st, keep, pid) {
  st.players.forEach(function (p) {
    if (p.id !== pid) return;
    var ids = {};
    keep.forEach(function (c) { ids[c.id] = 1; });
    st.discarded = st.discarded.concat(p.hand.filter(function (c) { return !ids[c.id]; }));
    p.hand = p.hand.filter(function (c) { return ids[c.id]; });
  });
}

var bigA = card.createNormalCard('S', 14);
bigA['is主方大A'] = true;
var four = SB.C('H', 4);

// 上家出单 10；B 只有「大A + 4」：4 压不住 10，只能动大A（且出不完 -> 不触发同阵营例外）
var st = SB.build({ handMap: { B: [bigA, four] }, table: [SB.C('H', 10)], lastPlayer: 'D' });
trimToB(st, [bigA, four], 'B');
g.__setState(st, { human: 'B', currentPlayer: 'B', clearLog: true });

var hint = g.uiHintCandidates();
var hintFirst = hint[0];
var aiIgnore = ai.chooseAction(g.gameState(), 'B', { endgame: true, ignoreCamp: true });
check('1.1 提示首手 = chooseAction(ignoreCamp)', hintFirst && same(hintFirst.ids, aiIgnore.cardIds), hintFirst && hintFirst.label);
check('1.2 首手是单张大A', hintFirst && hintFirst.cards.length === 1 && !!hintFirst.cards[0]['is主方大A'], hintFirst && hintFirst.label);

// 同上，但把上家标成「友」：带阵营的托管 PASS；提示忽略阵营，仍出大A
var st2 = SB.build({ handMap: { B: [bigA, four] }, table: [SB.C('H', 10)], lastPlayer: 'D' });
trimToB(st2, [bigA, four], 'B');
g.__setState(st2, { human: 'B', currentPlayer: 'B', clearLog: true });
g.uiMarks().B = { D: 'friend' };
var hint2 = g.uiHintCandidates();
var aiCamp = ai.chooseAction(g.gameState(), 'B', { endgame: true });
check('2.1 带阵营的托管 PASS（不压同阵营重手）', aiCamp.type === 'PASS', aiCamp.type);
check('2.2 提示仍给出大A（忽略阵营）',
  hint2[0] && hint2[0].cards.length === 1 && !!hint2[0].cards[0]['is主方大A'], hint2[0] && hint2[0].label);

console.log('\ntest-hint-equals-ai: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
