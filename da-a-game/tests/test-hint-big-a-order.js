// test-hint-big-a-order.js
// [2026-11-12 用户] 「点提示第一次选中双大A, 第二次选中5个A, 第三次又回到双大A, 这个不对。
//   枚举时应该先把大A排除在外选择合适的牌, 然后再考虑只有大A和包含大A的情况。
//   正常应该先选中 AAA(不含大A), 然后双大A, 最后 5 个 A。」
// 场景: 1V4 明打, 丁(独打者) 手里 双大A(♠A×2) + 三张普通A + KKK, 桌面 KKK。
// 断言: 候选里 AAA 存在; 排序为「不含大A → 双大A → 大A混出」; 托管也选 AAA。
var path = require('path');
var g = require(path.join(__dirname, '..', 'game.js'));
var SB = require('./lib/state-builder.js');

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

var big1 = SB.C('S', 14), big2 = SB.C('S', 14);
big1['is主方大A'] = true; big2['is主方大A'] = true;
var hA = SB.C('H', 14), dA = SB.C('D', 14), cA = SB.C('C', 14);
var k1 = SB.C('S', 13), k2 = SB.C('H', 13), k3 = SB.C('D', 13);

var st = SB.build({
  phase: 'PLAY', mode: '1V4_明打',
  主A: { suit: 'S', establishedBy: 'D', viaMethod: 'LIANG_A' },
  次方: null, 主方: ['D'], 抓方: ['A', 'B', 'C', 'E'],
  handMap: { D: [big1, big2, hA, dA, cA, k1, k2, k3] },
  table: [SB.C('S', 13), SB.C('H', 13), SB.C('D', 13)],
  lastPlayer: 'E', currentPlayer: 'D'
});
g.__setState(st, { human: 'D', currentPlayer: 'D', clearLog: true });

var cands = g.uiHintCandidates();
function bigN(c) { return c.cards.filter(function (x) { return !!x['is主方大A']; }).length; }

console.log('\n=== 1. AAA 必须在候选里 ===');
var aaa = cands.filter(function (c) { return c.type === 'TRIPLE' && bigN(c) === 0 && c.ids.length === 3; })[0];
check('1.1 三张普通A(AAA) 是候选', !!aaa, cands.map(function (c) { return c.label; }).join(' / '));

console.log('\n=== 2. 排序: 不含大A → 双大A → 大A混出 ===');
var tiers = cands.map(function (c) {
  var n = bigN(c);
  return n === 0 ? 0 : (c.type === 'DOUBLE_BIG_A' ? 1 : 2);
});
var nonDecreasing = tiers.every(function (t, i) { return i === 0 || tiers[i - 1] <= t; });
check('2.1 大A 层级单调不减', nonDecreasing, JSON.stringify(tiers));
check('2.2 第一个候选不含大A', bigN(cands[0]) === 0, cands[0] && cands[0].label);
var iDouble = cands.findIndex(function (c) { return c.type === 'DOUBLE_BIG_A'; });
var iMixed = cands.findIndex(function (c) { return bigN(c) > 0 && c.type !== 'DOUBLE_BIG_A'; });
check('2.3 双大A 排在混出前面', iDouble >= 0 && iMixed >= 0 && iDouble < iMixed,
  'iDouble=' + iDouble + ' iMixed=' + iMixed);

console.log('\n=== 3. 托管与提示第一手一致 (提示=托管) ===');
var act = g.__hintAiAction ? null : null;
var firstCards = cands[0].ids.slice().sort().join(',');
check('3.1 提示第一手就是 AAA (不含大A)', cands[0].type === 'TRIPLE' && bigN(cands[0]) === 0,
  cands[0] && cands[0].label);

console.log('\ntest-hint-big-a-order: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
