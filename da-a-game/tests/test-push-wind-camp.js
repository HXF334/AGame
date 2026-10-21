// tests/test-push-wind-camp.js — 回归: 推风必须同阵营 (§9)
// Bug (2026-10-21): push-wind.js 用 state.mode === '2V3_明打' 判断"次方身份是否明确",
//   但 §4.5/§7.3 规定次方打出大A公开身份后 mode 仍为 2V3_暗打。
//   导致 2V3_暗打 + 次方公开 时落入 else 分支(只跳主A, 不校验阵营) → 跨阵营推送。
var { pushWind } = require('../src/push-wind.js');
var { createNormalCard } = require('../src/card.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var n = 0;
function C() { n++; return { id: 'c' + n, suit: 'H', rank: 5, isBigJoker: false, isSmallJoker: false, is主方大A: false }; }

// 手牌张数: { playerId: 剩余张数 }, 0 = 已出完
function mk(handSpec, opts) {
  var o = opts || {};
  var ids = ['A', 'B', 'C', 'D', 'E'];
  return {
    phase: 'PLAY', mode: o.mode || '2V3_暗打',
    主A: { suit: 'H', establishedBy: o.establishedBy || 'B', viaMethod: 'FORCED_CHECK' },
    次方: o.次方 !== undefined ? o.次方 : 'C',
    次方公开: !!o.次方公开,
    主方: o.主方 || ['B', 'C'], 抓方: o.抓方 || ['A', 'D', 'E'],
    推风触发者: o.trigger,
    table: [], discarded: [], passedPlayers: [], passCount: 0, lastPlayer: null, currentPlayer: null,
    players: ids.map(function (id) {
      var cnt = handSpec[id] === undefined ? 5 : handSpec[id];
      var h = [];
      for (var i = 0; i < cnt; i++) h.push(C());
      return { id: id, hand: h, 底牌: null };
    })
  };
}

// ================= 1. 用户报告的实际场景 =================
section('1. 用户报告场景: 2V3_暗打 + 次方公开, 甲(抓方)出完');

{
  // 主A=乙, 次方=丙(公开) → 主方{乙,丙} 抓方{甲,丁,戊}
  // 甲(抓方,0张)出完; 丁(抓方)也出完; 戊(抓方)剩1张
  // 期望: 推给戊(同阵营), 绝不推给乙(主方)
  var st = mk({ A: 0, B: 5, C: 5, D: 0, E: 1 }, {
    mode: '2V3_暗打', establishedBy: 'B', 次方: 'C', 次方公开: true,
    主方: ['B', 'C'], 抓方: ['A', 'D', 'E'], trigger: 'A'
  });
  var r = pushWind(st);
  check('1.1 推风成功', r.ok === true, JSON.stringify(r.error));
  if (r.ok) {
    check('1.2 目标 = 戊 (同阵营最近未出完)', r.target === 'E', 'actual=' + r.target);
    check('1.3 绝不推给乙 (主方)', r.target !== 'B', 'actual=' + r.target);
    check('1.4 跳过已出完的丁', r.target !== 'D', 'actual=' + r.target);
  }
}

// ================= 2. 同阵营约束矩阵 =================
section('2. 任何情况下不得跨阵营推送');

[
  { name: '2.1 抓方触发, 目标仍在抓方', spec: { A: 0, B: 5, C: 5, D: 3, E: 4 }, trig: 'A', camp: 'A', expect: 'D' },
  { name: '2.2 主方触发, 目标在主方', spec: { A: 5, B: 0, C: 5, D: 3, E: 4 }, trig: 'B', camp: 'B', expect: 'C' },
  { name: '2.3 主方次方触发', spec: { A: 5, B: 5, C: 0, D: 3, E: 4 }, trig: 'C', camp: 'C', expect: 'B' }
].forEach(function (t) {
  var st = mk(t.spec, {
    mode: '2V3_暗打', establishedBy: 'B', 次方: 'C', 次方公开: true,
    主方: ['B', 'C'], 抓方: ['A', 'D', 'E'], trigger: t.trig
  });
  var r = pushWind(st);
  check(t.name, r.ok === true && r.target === t.expect,
    r.ok ? ('target=' + r.target + ' expected=' + t.expect) : JSON.stringify(r.error));
});

// ================= 3. 各 mode 组合 =================
section('3. 各 mode / 次方公开 组合下都守同阵营');

// SKILL §9 分为两个分支, 不能混用:
//   §9.3 次方身份已明确 → 推给**同阵营**逆时针最近未出完玩家
//   §9.4 次方身份未明确 → 只跳过主A 玩家; §9.4 原文明确"2V3 暗打次方=另一玩家可作为目标"
//         故次方未公开时, 推给次方(丙) 是规则正确行为, 不受同阵营约束
[
  { mode: '2V3_暗打', pub: false, expect: 'C', note: '次方未公开 → 走 §9.4, 次方可作目标' },
  { mode: '2V3_暗打', pub: true, expect: 'E', note: '次方已公开 → 走 §9.3 同阵营 (原 bug 场景)' },
  { mode: '2V3_明打', pub: true, expect: 'E', note: '2V3 明打 → 同阵营' }
].forEach(function (m, i) {
  var st = mk({ A: 0, B: 5, C: 5, D: 0, E: 1 }, {
    mode: m.mode, establishedBy: 'B', 次方: 'C', 次方公开: m.pub,
    主方: ['B', 'C'], 抓方: ['A', 'D', 'E'], trigger: 'A'
  });
  var r = pushWind(st);
  check('3.' + (i + 1) + ' ' + m.mode + ' 次方公开=' + m.pub + ' → ' + m.note,
    r.ok === true && r.target === m.expect,
    r.ok ? ('target=' + r.target + ' expected=' + m.expect) : JSON.stringify(r.error));
});

check('3.4 §9.4 次方未公开时不得推给主A 玩家',
  (function () {
    var st = mk({ A: 0, B: 5, C: 5, D: 0, E: 1 }, {
      mode: '2V3_暗打', establishedBy: 'B', 次方: 'C', 次方公开: false,
      主方: ['B', 'C'], 抓方: ['A', 'D', 'E'], trigger: 'A'
    });
    var r = pushWind(st);
    return r.ok === true && r.target !== 'B';
  })(), '目标不得为主A');

// ================= 4. 1V4 分支不受影响 =================
section('4. 1V4 分支 (次方为 null)');

{
  // 1V4: 主A=乙 独打, 次方=null, 甲出完 → 跳过主A乙
  var st = mk({ A: 0, B: 5, C: 5, D: 5, E: 5 }, {
    mode: '1V4_暗打', establishedBy: 'B', 次方: null, 次方公开: false,
    主方: ['B'], 抓方: ['A', 'C', 'D', 'E'], trigger: 'A'
  });
  var r = pushWind(st);
  check('4.1 1V4 甲触发 → 跳过主A乙, 推给丙', r.ok === true && r.target === 'C',
    r.ok ? 'target=' + r.target : JSON.stringify(r.error));
}

{
  // 1V4 明打 + 次方公开=true 不应误触发同阵营分支
  var st = mk({ A: 0, B: 5, C: 5, D: 5, E: 5 }, {
    mode: '1V4_暗打', establishedBy: 'B', 次方: null, 次方公开: false,
    主方: ['B'], 抓方: ['A', 'C', 'D', 'E'], trigger: 'A'
  });
  st.次方 = null;
  var r = pushWind(st);
  check('4.2 次方为 null 时不因抓方判定混乱', r.ok === true && r.target !== 'B',
    r.ok ? 'target=' + r.target : JSON.stringify(r.error));
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);