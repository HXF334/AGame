// tests/test-eligibility-rules.js — 引擎资格判定纯函数（canLiangA / canFanA / canChooseIdentity）
//
// [为什么单独成文件] 这些函数是 UI 决定按钮可用性的**唯一依据**
//   (需求: 资格必须由规则引擎判断, 不能只看 UI 中是否存在两张 A)。
//   2026-10-24 用户实测抓到我把 canFanA 的花色写窄了 —— 规则允许**任意花色**,
//   我却限定成主A的花色, 导致玩家持别的花色双大A时被判「无反A资格」。
//   这类「判据抄错规则」的 bug 最需要专门锁住。
var engine = require('../src/index.js');
var PHASES = engine.PHASES;

var passed = 0, failed = 0, failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function A(id, suit, rank) { return { id: id, suit: suit, rank: rank }; }

// 造一个最小 state
function mk(opts) {
  var o = opts || {};
  return {
    phase: o.phase || PHASES.LIANG_A,
    主A: o.主A === undefined ? null : o.主A,
    次方: o.次方 === undefined ? null : o.次方,
    反A: o.反A === undefined ? null : o.反A,
    mode: o.mode || null,
    players: o.players || []
  };
}

// ============================================================
section('1. canLiangA 亮A资格');
var st1 = mk({ phase: PHASES.LIANG_A, players: [{ id: 'D', hand: [A('a1', 'H', 14), A('a2', 'S', 5)] }] });
var r1 = engine.canLiangA(st1, 'D');
check('1.1 手中有 A -> 有资格', r1.ok === true, JSON.stringify(r1));
check('1.2 返回可用 A 的数量', r1.cards && r1.cards.length === 1, JSON.stringify(r1.cards));

var st2 = mk({ phase: PHASES.LIANG_A, players: [{ id: 'D', hand: [A('a1', 'H', 5)] }] });
check('1.3 手中无 A -> 无资格', engine.canLiangA(st2, 'D').ok === false);

var st3 = mk({ phase: PHASES.LIANG_A, 主A: { suit: 'H', establishedBy: 'A' }, players: [{ id: 'D', hand: [A('a1', 'H', 14)] }] });
check('1.4 主A 已确立 -> 无资格', engine.canLiangA(st3, 'D').ok === false);

var st4 = mk({ phase: PHASES.FAN_A, players: [{ id: 'D', hand: [A('a1', 'H', 14)] }] });
check('1.5 阶段不对 -> 无资格', engine.canLiangA(st4, 'D').ok === false);

// ============================================================
section('2. canFanA 反A资格（SKILL §4.4：任意花色都可以）');
// §4.4 原文: 「玩家必须持有同一花色的两张A。任意花色都可以；不要求与当前主A花色相同。」
var fanSt = function (hand, suit) {
  return mk({
    phase: PHASES.FAN_A,
    主A: { suit: suit || 'H', establishedBy: 'A' },
    players: [{ id: 'D', hand: hand }]
  });
};

var f1 = engine.canFanA(fanSt([A('x1', 'S', 14), A('x2', 'S', 14)], 'H'), 'D');
check('2.1 主A=红桃, 玩家持两张黑桃A -> **有资格**(任意花色都可以)',
  f1.ok === true, JSON.stringify(f1));
check('2.2 返回的花色是玩家自己的花色', f1.suit === 'S', String(f1.suit));
check('2.3 返回两张A', f1.cards && f1.cards.length === 2, JSON.stringify(f1.cards));

var f2 = engine.canFanA(fanSt([A('x1', 'H', 14), A('x2', 'H', 14)], 'H'), 'D');
check('2.4 主A=红桃, 玩家持两张红桃A -> 有资格', f2.ok === true, JSON.stringify(f2));

var f3 = engine.canFanA(fanSt([A('x1', 'S', 14), A('x2', 'C', 14)], 'H'), 'D');
check('2.5 两张A花色不同 -> 无资格(必须同一花色)', f3.ok === false, JSON.stringify(f3));

var f4 = engine.canFanA(fanSt([A('x1', 'S', 14)], 'H'), 'D');
check('2.6 只有一张A -> 无资格', f4.ok === false);

var f5 = engine.canFanA(fanSt([A('x1', 'S', 14), A('x2', 'S', 14)], 'H'), 'D');
check('2.7 反A未发生时可判资格', f5.ok === true);

var st6 = fanSt([A('x1', 'S', 14), A('x2', 'S', 14)], 'H');
st6.反A = { by: 'B' };
check('2.8 反A已发生 -> 无资格', engine.canFanA(st6, 'D').ok === false);

var st7 = fanSt([A('x1', 'S', 14), A('x2', 'S', 14)], 'H');
st7.phase = PHASES.PLAY;
check('2.9 阶段不对 -> 无资格', engine.canFanA(st7, 'D').ok === false);

var st8 = fanSt([A('x1', 'S', 14), A('x2', 'S', 14)], 'H');
st8.主A = null;
check('2.10 主A未确立 -> 无资格', engine.canFanA(st8, 'D').ok === false);

// 底牌不参与反A资格判断（§4.4 第2条）: 底牌在 p.底牌, 不在 hand
var st9 = fanSt([A('x1', 'S', 14)], 'H');
st9.players[0].底牌 = A('x2', 'S', 14);
check('2.11 底牌不参与反A资格判断(手牌只1张仍无资格)',
  engine.canFanA(st9, 'D').ok === false, JSON.stringify(engine.canFanA(st9, 'D')));

// ============================================================
section('3. canChooseIdentity / identityChooser 次方身份资格');
var i1 = mk({ phase: PHASES.IDENTITY_CHOICE, 主A: { suit: 'H', establishedBy: 'A' }, 次方: 'D' });
check('3.1 次方本人 -> 有资格', engine.canChooseIdentity(i1, 'D').ok === true);
check('3.2 非次方 -> 无资格', engine.canChooseIdentity(i1, 'B').ok === false);
check('3.3 授权人是次方', engine.identityChooser(i1) === 'D', String(engine.identityChooser(i1)));

var i2 = mk({ phase: PHASES.IDENTITY_CHOICE, 主A: { suit: 'H', establishedBy: 'A' }, 次方: null });
check('3.4 无次方时授权人是主A确立者', engine.identityChooser(i2) === 'A', String(engine.identityChooser(i2)));
check('3.5 主A确立者 -> 有资格', engine.canChooseIdentity(i2, 'A').ok === true);
check('3.6 其他人 -> 无资格', engine.canChooseIdentity(i2, 'D').ok === false);

var i3 = mk({ phase: PHASES.PLAY, 主A: { suit: 'H', establishedBy: 'A' }, 次方: 'D' });
check('3.7 阶段不对 -> 无资格', engine.canChooseIdentity(i3, 'D').ok === false);

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('FAILED:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed > 0 ? 1 : 0);