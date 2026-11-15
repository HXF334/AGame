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

console.log('\ntest-hint-fallback: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
