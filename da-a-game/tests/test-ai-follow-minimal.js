// tests/test-ai-follow-minimal.js — 回归: 跟牌时 AI 必须选能压过桌面的最小手牌
//
// 背景 (2026-10-21 用户 IDE 截图报障):
//   桌上有对4 时, AI 却直接出了 2222。
//   2222 确实压得过对4, 但把 2 全打光极不划算, 用户原话:
//   "2222 确实比对4大, 但也应该从合适的手牌中由小往大出"。
//
// 根因: ai.js 候选排序一律用 "张数多者优先" (return b.length - a.length)。
//   该策略原本是为把 AI 从"16种牌型只出单张"救到 9/16 覆盖而设,
//   但用在跟牌场景就会优先甩大牌型。
//
// 修复: 分场景排序
//   跟牌 (table 非空) -> 张数少者优先, 选最小可压制手牌
//   首出 (table 为空) -> 保持张数多者优先 (否则覆盖度崩盘)
//
// 测试方法说明 (重要):
//   SB.build 会把玩家手牌填充到 §2.2 的法定张数, 凭空多出若干对子。
//   因此本测试**不写死"应出哪张"**, 而是验证**原则**:
//     (a) 出的牌是合法牌型
//     (b) 能压过桌面
//     (c) 在所有可压制的候选中, 张数最少
//     (d) 同张数时, 保留价值最低 (即"由小往大出")
//   这比写死具体牌更贴合真实意图, 也避免被填充牌干扰。
var SB = require('./lib/state-builder.js');
var { chooseAction } = require('../src/ai.js');
var { candidateCombos } = require('../src/combos.js');
var { identifyHand, canBeat } = require('../src/hand-types.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var C = SB.C;

function mkState(handMap, table, opts) {
  return SB.build({
    handMap: handMap,
    table: table || [],
    lastPlayer: (opts && opts.lastPlayer) || 'B',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: true,
    主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_\u6697\u6253'
  });
}
function handOf(st, pid) {
  return st.players.find(function (p) { return p.id === pid; }).hand;
}
function desc(cards) {
  return cards.map(function (c) { return c.rank; }).join(',');
}
// 枚举手牌里所有能压过桌面的候选 (排除 4 取牌路径)
function allBeatingCombos(hand, tableCards) {
  var th = identifyHand(tableCards);
  var cands = candidateCombos(hand).slice();
  hand.forEach(function (c) { cands.push([c.id]); });
  var out = [];
  cands.forEach(function (combo) {
    var cards = combo.map(function (id) {
      return hand.filter(function (c) { return c.id === id; })[0];
    }).filter(Boolean);
    if (cards.length !== combo.length) return;
    if (cards.some(function (c) { return c.rank === 4 && !c.isBigJoker && !c.isSmallJoker; })) return;
    var hh = identifyHand(cards);
    if (hh.type === 'INVALID') return;
    if (canBeat(hh, th)) out.push(cards);
  });
  return out;
}


function kvOf(cards) {
  return Math.max.apply(null, cards.map(function (c) {
    if (c.isBigJoker) return 1000;
    if (c.isSmallJoker) return 900;
    if (c.is主方大A) return 800;
    if (c.rank === 3) return 700;
    if (c.rank === 2) return 600;
    if (c.rank === 14) return 500;
    if (c.rank === 4) return 50;
    return (c.rank || 0) * 10;
  }));
}

// ================= 1. 核心场景: 桌上有对4, 不应直接甩 2222 =================
section('1. 跟牌 — 桌上有对4, 应选最小可压制手牌而非 2222');

{
  var handD = [C('H',7), C('D',7), C('S',2), C('H',2), C('D',2), C('C',2), C('S',13), C('H',5), C('D',9), C('C',3)];
  var table4 = [C('S',4), C('H',4)];
  var st = mkState({ D: handD }, table4);
  var realHand = handOf(st, 'D');
  var act = chooseAction(st, 'D');

  check('1.1 AI 出牌', act && act.type === 'PLAY', act ? act.type : 'null');
  if (act && act.type === 'PLAY') {
    var played = act.cardIds.map(function (id) {
      return realHand.filter(function (c) { return c.id === id; })[0];
    }).filter(Boolean);
    var ph = identifyHand(played);
    var th = identifyHand(st.table);

    check('1.2 出的是合法牌型', ph.type !== 'INVALID', ph.type);
    check('1.3 确实能压过桌面对4', canBeat(ph, th) === true, ph.type + ' vs ' + th.type);
    check('1.4 不是 2222 (未一次甩 4 张)', !(played.length === 4 && played.every(function (c) { return c.rank === 2; })),
      desc(played));

    // 原则验证: 在所有可压制候选中, 张数最少
    var winners = allBeatingCombos(realHand, st.table);
    var minLen = Math.min.apply(null, winners.map(function (w) { return w.length; }));
    check('1.5 张数 = 所有可压制候选中的最小值', played.length === minLen,
      'played=' + played.length + ' min=' + minLen);
    console.log('   [\u4fe1\u606f] \u5b9e\u9645\u51fa ' + desc(played) + ' (' + played.length +
                '\u5f20, ' + ph.type + ') | \u6700\u5c0f\u53ef\u538b\u5236\u5f20\u6570=' + minLen);
  }
}

// ================= 2. 明确含 2222 时也不该优先甩它 =================
section('2. 跟牌 — 手上有 2222 但有更小可压制组合时, 不选 2222');

{
  // 桌面是对9。手牌有 2222(能压) 与 三条10(能压)。最小应选三条10(3张)。
  var handD = [C('S',2), C('H',2), C('D',2), C('C',2),      // 2222
               C('S',10), C('H',10), C('D',10),             // 三条10
               C('S',13), C('H',5), C('D',6), C('C',3)];
  var table9 = [C('S',9), C('H',9)];
  var st = mkState({ D: handD }, table9);
  var realHand = handOf(st, 'D');
  var act = chooseAction(st, 'D');

  check('2.1 AI 出牌', act && act.type === 'PLAY', act ? act.type : 'null');
  if (act && act.type === 'PLAY') {
    var played = act.cardIds.map(function (id) {
      return realHand.filter(function (c) { return c.id === id; })[0];
    }).filter(Boolean);
    var isBigTriple = played.length === 4 && played.every(function (c) { return c.rank === 2; });
    check('2.2 未选择 2222', !isBigTriple, desc(played));

    var winners = allBeatingCombos(realHand, st.table);
    // [2026-10-21 改] 排序主键已从"张数"改为"保留价值"(keepValue 升序),
    //   张数仅作同价值时的次键。"由小往大出"指的是保留价值, 不是张数。
    var minKv = Math.min.apply(null, winners.map(function (w) { return kvOf(w); }));
    check('2.3 保留价值 = 最低可压制保留价值', kvOf(played) === minKv,
      'played kv=' + kvOf(played) + ' min kv=' + minKv);
    console.log('   [信息] 实际出 ' + desc(played) + ' (' + played.length +
                '张) | 最低保留价值=' + minKv);
    console.log('   [\u4fe1\u606f] \u5b9e\u9645\u51fa ' + desc(played) + ' (' + played.length +
                '\u5f20) | \u6700\u5c0f\u53ef\u538b\u5236\u5f20\u6570=' + minLen);
  }
}

// ================= 3. 首出仍应偏好多张 (防止覆盖度崩盘) =================
section('3. 首出 — 保持张数多者优先 (不可退化)');

{
  var handD = [C('S',5), C('H',5), C('D',5), C('C',5), C('S',6), C('H',6), C('D',6), C('C',6), C('S',7)];
  var st = mkState({ D: handD }, []);
  var act = chooseAction(st, 'D');
  check('3.1 首出有行动', !!act, act ? act.type : 'null');
  if (act && act.type === 'PLAY') {
    var played = act.cardIds.map(function (id) {
      return handOf(st, 'D').filter(function (c) { return c.id === id; })[0];
    }).filter(Boolean);
    console.log('   [\u4fe1\u606f] \u9996\u51fa\u5b9e\u9645\u51fa\u724c ' + played.length + ' \u5f20');
    check('3.2 首出不只出 1 张 (覆盖度不退化)', played.length >= 3, 'n=' + played.length);
  }
}

// ================= 4. 无可压制时必须过牌 =================
section('4. 跟牌 — 无可压制组合时 PASS');

{
  // 桌上是四条2 (大蛋子), 丁手牌无大蛋子/连珠蛋/顺子 -> 应 PASS
  var handD = [C('S',3), C('H',4), C('D',5), C('C',6), C('S',7), C('H',8), C('D',9), C('C',10)];
  var bigTriple = [C('C',2), C('S',2), C('D',2), C('H',2)];
  var st = mkState({ D: handD }, bigTriple);
  var realHand = handOf(st, 'D');
  var winners = allBeatingCombos(realHand, st.table);
  var act = chooseAction(st, 'D');
  console.log('   [\u4fe1\u606f] \u53ef\u538b\u5236\u5019\u9009\u6570=' + winners.length +
              ' | \u884c\u52a8=' + (act ? act.type : 'null'));
  if (winners.length === 0) {
    check('4.1 无可压制时过牌', act && act.type === 'PASS', act ? act.type : 'null');
  } else {
    check('4.1 存在可压制组合时应出牌', act && act.type === 'PLAY', act ? act.type : 'null');
  }
}

console.log('\n=== \u603b\u7ed3 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);