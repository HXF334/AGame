// tests/test-hint-matches-autoplay.js
// [2026-11-16 用户] 三例：①亮A后首出 556+双王，提示选王、托管出 55；②上家单 6，单大A+双王，
//   提示选王、托管出大A；③上家单大A，AAAAA999999，托管出 999999、应出 AAAAA。
// 统一口径：提示第一手必须等于托管那一手；跟单大A/单王时 5 张大蛋子优先于 6 张。
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
function trim(st, keepByPlayer) {
  st.players.forEach(function (p) {
    var keep = keepByPlayer[p.id];
    if (!keep) { st.discarded = st.discarded.concat(p.hand); p.hand = []; return; }
    var ids = {}; keep.forEach(function (c) { ids[c.id] = 1; });
    var extra = p.hand.filter(function (c) { return !ids[c.id]; });
    st.discarded = st.discarded.concat(extra);
    p.hand = p.hand.filter(function (c) { return ids[c.id]; });
  });
}
function hintFirst() { var h = g.uiHintCandidates(); return h[0]; }
function same(a, b) { return a && b && a.slice().sort().join(',') === b.slice().sort().join(','); }

// ① 首出 556 + 双王（全场 5 张）
var five = [SB.C('H', 5), SB.C('D', 5), SB.C('C', 6), card.createBigJoker('bj1'), card.createSmallJoker('sj1')];
var st1 = SB.build({ handMap: { B: five }, table: [], lastPlayer: 'E' });
trim(st1, { B: five });
g.__setState(st1, { human: 'B', currentPlayer: 'B', clearLog: true });
var a1 = ai.chooseAction(st1, 'B', { endgame: true });
var h1 = hintFirst();
check('1.1 提示首手 = 托管那一手', h1 && same(h1.ids, a1.cardIds), h1 && h1.label);
check('1.2 首手是对子 55（不是王）', h1 && h1.cards.length === 2 && h1.cards.every(function (c) { return c.rank === 5; }), h1 && h1.label);

// ② 上家单 6；手牌 单大A + 双王
var bigA = card.createNormalCard('S', 14); bigA['is主方大A'] = true;
var three = [bigA, card.createBigJoker('bj2'), card.createSmallJoker('sj2')];
var st2 = SB.build({ handMap: { B: three }, table: [SB.C('D', 6)], lastPlayer: 'D' });
trim(st2, { B: three });
g.__setState(st2, { human: 'B', currentPlayer: 'B', clearLog: true });
var a2 = ai.chooseAction(st2, 'B', { endgame: true });
var h2 = hintFirst();
check('2.1 提示首手 = 托管那一手', h2 && same(h2.ids, a2.cardIds), h2 && h2.label);
check('2.2 首手是单大A（不是王）', h2 && h2.cards.length === 1 && !!h2.cards[0]['is主方大A'], h2 && h2.label);

// ③ 上家单大A；手牌 AAAAA + 999999
var tA = card.createNormalCard('S', 14); tA['is主方大A'] = true;
var hA = card.createNormalCard('S', 14); hA['is主方大A'] = true;
var hand3 = [hA,
  card.createNormalCard('H', 14), card.createNormalCard('D', 14), card.createNormalCard('C', 14), card.createNormalCard('H', 14)];
for (var i = 0; i < 6; i++) hand3.push(card.createNormalCard(['H', 'D', 'C', 'S'][i % 4], 9, 'n' + i));
var st3 = SB.build({ handMap: { B: hand3 }, table: [tA], lastPlayer: 'D',
  '主A': { suit: 'S', establishedBy: 'D', viaMethod: 'FORCE' },
  '主方': ['D'], '抓方': ['A', 'B', 'C', 'E'], mode: '1V4_暗打', '次方': null });
trim(st3, { B: hand3 });
g.__setState(st3, { human: 'B', currentPlayer: 'B', clearLog: true });
var a3 = ai.chooseAction(st3, 'B', { endgame: true });
var h3 = hintFirst();
check('3.1 跟单大A：提示首手 = 托管那一手', h3 && same(h3.ids, a3.cardIds), h3 && h3.label);
check('3.2 先出 5 张 A 蛋（不是 6 张 9 蛋）', h3 && h3.cards.length === 5 && h3.cards.every(function (c) { return c.rank === 14; }), h3 && h3.label);

console.log('\ntest-hint-matches-autoplay: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
