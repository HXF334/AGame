// tests/test-combos-qkaa.js —— 「QKAA 优先带普通 A」枚举回归
//
// [2026-11-09 用户] QKAA(一手一个普通 A + 一个主方大 A):
//   QKA 龙**优先带普通 A**, 不是带大 A; 只有 QK + 一个大 A 时龙才带大 A。
//
// [2026-11-12 P1] 原实现只在「A 作低端」分支里对 **card id 字符串** 取
//   `.is主方大A` 排序 -> 比较恒等; 而且 QKA 是高端连张, 根本不走那个分支,
//   规则实际没生效。修复: 对 byRank[14] 用 card 对象做一次全局排序。
//
// 跑法: node tests/test-combos-qkaa.js
var { createNormalCard } = require('../src/card.js');
var { candidateCombos } = require('../src/combos.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function C(s, r, id) { return createNormalCard(s, r, id); }
function bigA(s, id) { var c = C(s, 14, id); c.is主方大A = true; return c; }

function R(ids, byId) {
  return ids.map(function (id) { return byId[id].rank; }).sort(function (a, b) { return a - b; }).join(',');
}

// ---- 1. QKA 高端龙: Q K + 一普通A + 一大A ----
var byId1 = {};
var hand1 = [bigA('S', 'b1'), C('S', 14, 'n1'), C('S', 12, 'q1'), C('S', 13, 'k1')];
hand1.forEach(function (c) { byId1[c.id] = c; });
var N1 = hand1[1].id, B1 = hand1[0].id;
var combos1 = candidateCombos(hand1);
var qka = combos1.filter(function (ids) { return ids.length === 3 && R(ids, byId1) === '12,13,14'; });
check('1.1 枚举出两条 QKA(分别带大A/普通A)', qka.length === 2, '实际 ' + qka.length + ' 条');
check('1.2 第一条 QKA 带普通 A', qka.length > 0 && qka[0].indexOf(N1) >= 0,
  qka.length ? qka[0].join(',') : '无');
check('1.3 第二条 QKA 带大 A', qka.length > 1 && qka[1].indexOf(B1) >= 0,
  qka.length > 1 ? qka[1].join(',') : '无');

// ---- 2. A 低端龙 (A23): 同样优先普通 A ----
var byId2 = {};
var hand2 = [bigA('H', 'b2'), C('H', 14, 'n2'), C('H', 2, 'two2'), C('H', 3, 'three2')];
hand2.forEach(function (c) { byId2[c.id] = c; });
var N2 = hand2[1].id;
var combos2 = candidateCombos(hand2);
var a23 = combos2.filter(function (ids) { return ids.length === 3 && R(ids, byId2) === '2,3,14'; });
check('2.1 枚举出 A23', a23.length === 2, '实际 ' + a23.length + ' 条');
check('2.2 第一条 A23 带普通 A', a23.length > 0 && a23[0].indexOf(N2) >= 0,
  a23.length ? a23[0].join(',') : '无');

// ---- 3. 只有大 A 时, 规则允许龙带大 A ----
var byId3 = {};
var hand3 = [bigA('D', 'b3'), C('D', 12, 'q3'), C('D', 13, 'k3')];
hand3.forEach(function (c) { byId3[c.id] = c; });
var B3 = hand3[0].id;
var combos3 = candidateCombos(hand3);
var onlyBig = combos3.filter(function (ids) { return ids.length === 3 && R(ids, byId3) === '12,13,14'; });
check('3.1 无普通A时仍枚举出带大A的 QKA', onlyBig.length === 1, '实际 ' + onlyBig.length + ' 条');
check('3.2 该 QKA 使用大 A', onlyBig.length > 0 && onlyBig[0].indexOf(B3) >= 0,
  onlyBig.length ? onlyBig[0].join(',') : '无');

console.log('\ntest-combos-qkaa: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
process.exit(0);
