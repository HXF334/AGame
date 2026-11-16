// tests/test-hint-fallback.js
// [2026-11-16 用户] 提示先走常规排序；常规挑不出牌时，穷举所有引擎认可的合法出牌（含 4 取牌）。
var path = require('path');
var g = require(path.join(__dirname, '..', 'game.js'));
var SB = require('./lib/state-builder.js');

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

// 1) 上家 333，我 444：常规压不过，但可用 2 张 4 取牌
var fours = [SB.C('H', 4), SB.C('D', 4), SB.C('C', 4)];
var st = SB.build({ handMap: { B: fours }, table: [SB.C('S', 3), SB.C('H', 3), SB.C('D', 3)], lastPlayer: 'D' });
g.__setState(st, { human: 'B', currentPlayer: 'B', clearLog: true });
var cs = g.uiHintCandidates();
check('1.1 兜底枚举出取牌', cs.length >= 1, 'count=' + cs.length);
check('1.2 首选是 2 张 4 的取牌', !!cs[0] && cs[0].label.indexOf('取牌') === 0 && cs[0].len === 2, cs[0] && cs[0].label);
check('1.3 首选被标记为 first', !!cs[0] && cs[0].isFirst === true);

// SB.build 会把每手补到 22 张；把指定牌之外的多余牌移进 discarded，保持 108 守恒
function trimHand(state, id, keepCards) {
  var p = state.players.filter(function (x) { return x.id === id; })[0];
  var keepIds = {};
  keepCards.forEach(function (c) { keepIds[c.id] = 1; });
  var extra = p.hand.filter(function (c) { return !keepIds[c.id]; });
  state.discarded = state.discarded.concat(extra);
  p.hand = p.hand.filter(function (c) { return keepIds[c.id]; });
}

// 2) 上家单大A，我只有 5、6：压不过，也取不了（取牌要目标 3-8 张）
var bigA = SB.C('S', 14); bigA['is主方大A'] = true;
var five = SB.C('H', 5), six = SB.C('D', 6);
var st2 = SB.build({ handMap: { B: [five, six] }, table: [bigA], lastPlayer: 'D' });
trimHand(st2, 'B', [five, six]);
g.__setState(st2, { human: 'B', currentPlayer: 'B', clearLog: true });
var cs2 = g.uiHintCandidates();
check('2.1 真的无解时返回空', cs2.length === 0, 'count=' + cs2.length);

// 3) 上家 KKK，我 444 + 9：点提示应该真的选中 44（取牌），而不是报错
var f4 = [SB.C('H', 4), SB.C('D', 4), SB.C('C', 4)];
var k3 = [SB.C('S', 13), SB.C('H', 13), SB.C('D', 13)];
var st3 = SB.build({ handMap: { B: f4.concat([SB.C('S', 9)]) }, table: k3, lastPlayer: 'D' });
trimHand(st3, 'B', f4.concat([SB.C('S', 9)]));
g.__setState(st3, { human: 'B', currentPlayer: 'B', clearLog: true });
var cs3 = g.uiHintCandidates();
check('3.1 KKK 面前兜底出取牌', cs3.length >= 1 && cs3[0].label.indexOf('取牌') === 0, cs3[0] && cs3[0].label);
check('3.2 候选带 ids（点击不炸）', !!cs3[0] && Array.isArray(cs3[0].ids) && cs3[0].ids.length === 2);
var ok3 = g.uiHint();
var sel = g.__selected() || [];
var wantIds = {}; f4.forEach(function (c) { wantIds[c.id] = 1; });
check('3.3 点提示选中 2 张 4', ok3 === true && sel.length === 2 && sel.every(function (id) { return !!wantIds[id]; }),
  'ok=' + ok3 + ' sel=' + sel.join(','));

console.log('\ntest-hint-fallback: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
