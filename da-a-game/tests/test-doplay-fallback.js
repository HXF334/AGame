// tests/test-doplay-fallback.js
// 回归: doPlay 的三段回退链 —— 批量选中 / 回退逐张 / 全都不可用
//
// 为什么补这个: game.js 690 行里, doPlay 的回退链是最后一块无覆盖区域。
//   今天 IDE 日志里已三次见到它在工作:
//     选中 3 张不合法: INVALID_HAND 3 cards not same rank and not straight -> 回退逐张试
//     选中 2 张不合法: INVALID_HAND 2 cards invalid -> 回退逐张试
//     甲 失败: 压不过桌面(单张与组合均已尝试). 最后: CANNOT_BEAT
//   但零自动化覆盖 —— 正是今天 T4 教训(审查要看调用点而非模块)的最后一块。
//
// 【三个踩过的坑, 均会导致本测试完全失效】
//  1. mock 必须在 require('../game.js') 之前安装: ctx 在 require 时一次性确定,
//     否则 runAI 首行 `if (!ctx) return` 永不执行真实路径。
//  2. human **绝不能**填不存在的 id(如 'ZZZ'): runAI 会判定"无人类"而自动打完整局,
//     断言读到的是后面某一轮的日志 —— 2026-10-23 曾据此误判"引擎跳阵营"。
//  3. doPlay() 不接受参数, 出牌取模块级 selectedCards, 必须 g.selectedCards().push(id)。
//
// 另外: doPlay 末尾会调 runAI()。若 human 是当前玩家, advance 之后 runAI 会接管
//   并把其余 4 家全打完。故 human 设为**下一个**玩家, runAI 立刻停下。
var mock = require('./mock-wx.js');
mock.install({ width: 900, height: 500 });   // 必须在 require game.js 之前

var SB = require('./lib/state-builder.js');
var g = require('../game.js');

var passed = 0, failed = 0, fail = [];
function check(name, cond, detail) {
  if (cond) passed++; else { failed++; fail.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
function logStr() { return g.logHistory().join(' || '); }
function tail(n) { return logStr().split('||').slice(-n).join(' | '); }
function handOf(id) {
  return g.gameState().players.filter(function (p) { return p.id === id; })[0];
}

// 建局后精确裁剪手牌; keyCards 保证被保留的第一张是指定的关键牌
function build(o) {
  var st = SB.build({
    handMap: {}, table: o.table || [], lastPlayer: o.lastPlayer || 'A',
    passedPlayers: o.passedPlayers || [],
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: true, 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_暗打'
  });
  var sizes = o.sizes || {}, keys = o.keyCards || {};
  Object.keys(sizes).forEach(function (pid) {
    var p = st.players.filter(function (x) { return x.id === pid; })[0];
    var kc = keys[pid] || [];
    p.hand = kc.concat(p.hand.slice(kc.length)).slice(0, sizes[pid]);
  });
  return st;
}
// human 设为下一个玩家, 让 doPlay 末尾的 runAI 立刻停下
function setup(st, cur) {
  g.__setState(st, { currentPlayer: cur, human: 'B', clearLog: true });
}

// ============ 1. 有选中且合法 → 整批打出 ============
section('1. 选中合法牌型 → 整批打出, selectedCards 被清空');
{
  var st = build({
    table: [],
    sizes: { A: 4 },
    keyCards: { A: [SB.C('H', 9), SB.C('D', 9)] }
  });
  setup(st, 'A');
  var sel = g.selectedCards();
  sel.push(handOf('A').hand[0].id, handOf('A').hand[1].id);
  check('1.0 前置: 已选 2 张', sel.length === 2, 'sel=' + sel.length);

  var before = handOf('A').hand.length;
  g.doPlay();

  var lg = logStr();
  check('1.1 无「不合法」日志', lg.indexOf('不合法') < 0, tail(4));
  check('1.2 手牌恰减 2 张', handOf('A').hand.length === before - 2,
    'before=' + before + ' now=' + handOf('A').hand.length);
  check('1.3 selectedCards 已清空', g.selectedCards().length === 0, 'sel=' + g.selectedCards().length);
  check('1.4 回合已推进到乙', g.currentPlayer() === 'B', g.currentPlayer());
  console.log('   [取证] ' + tail(3));
}

// ============ 2. 选中不合法 → 提示, 不自动换牌 ============
// [2026-10-23 23:43 用户裁定] 行为契约已变:
//   「选了但牌型非法 → 不再自动换牌, 改为提示」
//   原契约是「回退逐张试出」(自动换成别的牌), 该回退链已从 doPlay 拆掉。
//   需求同时要求「保留当前有效手牌和必要的选牌状态」-> selectedCards 保留。
section('2. 选中不合法 → 必须提示, 不得自动换成别的牌');
{
  // 手牌一对9; 强行选 3 张非同点数非同连 -> INVALID_HAND
  var st = build({
    table: [],
    sizes: { A: 4 },
    keyCards: { A: [SB.C('H', 9), SB.C('D', 9), SB.C('S', 7)] }
  });
  setup(st, 'A');
  var sel = g.selectedCards();
  var h = handOf('A').hand;
  sel.push(h[0].id, h[1].id, h[2].id);      // 对9 + 单7 -> 非法 3 张
  check('2.0 前置: 已选 3 张', sel.length === 3, 'sel=' + sel.length);

  var before = handOf('A').hand.length;
  g.doPlay();

  var lg = logStr();
  check('2.1 出现「选中 3 张不合法」', lg.indexOf('选中 3 张不合法') >= 0, tail(4));
  check('2.2 出现提示「当前没有可用牌」', lg.indexOf('当前没有可用牌') >= 0, tail(4));
  check('2.2b **不得**再出现「回退逐张试」(自动换牌已拆)',
    lg.indexOf('回退逐张试') < 0, tail(4));
  check('2.3 **没有**自动出牌(手牌未减少)', handOf('A').hand.length === before,
    'before=' + before + ' now=' + handOf('A').hand.length);
  check('2.4 selectedCards **保留**(供真人自行调整)', g.selectedCards().length === 3,
    'sel=' + g.selectedCards().length);
  check('2.5 回合未被推进(仍在甲)', g.currentPlayer() === 'A', g.currentPlayer());
  console.log('   [取证] ' + tail(3));
}

// ============ 3. 未选中 → 直接逐张试 ============
section('3. 未选中牌 → 直接逐张试出第一张可出的');
{
  var st = build({
    table: [],
    sizes: { A: 4 },
    keyCards: { A: [SB.C('S', 6)] }
  });
  setup(st, 'A');
  check('3.0 前置: 未选中', g.selectedCards().length === 0, 'sel=' + g.selectedCards().length);

  var before = handOf('A').hand.length;
  g.doPlay();

  var lg = logStr();
  check('3.1 无「不合法」日志', lg.indexOf('不合法') < 0, tail(4));
  check('3.2 出掉 1 张', handOf('A').hand.length === before - 1,
    'before=' + before + ' now=' + handOf('A').hand.length);
  console.log('   [取证] ' + tail(3));
}

// ============ 4. 全都压不过 → 失败分支 ============
section('4. 桌面 ♠3(第二大牌), 手上只有4 → 全都不可用, 必须报失败且不改状态');
{
  // 打大A 中 3 > 2 > A > K > ... > 4, 故单张4 压不过单张3
  var st = build({
    table: [SB.C('S', 3)],
    sizes: { A: 2 },
    keyCards: { A: [SB.C('S', 4), SB.C('D', 4)] }
  });
  setup(st, 'A');
  var before = handOf('A').hand.length;
  var tableBefore = g.gameState().table.length;

  g.doPlay();

  var lg = logStr();
  // [2026-10-23 文案变更] 原断言「出现『手牌都不可用』」，随 P3 修正而改为更如实��措辞。
  //   P3 依据: 该行在**组合回退也失败之后**才打(组合回退块在 doPlay 内, 成功即 return)，
  //   而「最后: <err>」来自组合尝试 -> 原措辞把「单张扫描」与「组合尝试」混成一句，
  //   读起来像「一张都出不了」。故改为「压不过桌面(单张与组合均已尝试)」。
  check('4.1 出现「压不过桌面」', lg.indexOf('压不过桌面') >= 0, tail(4));
  check('4.1b 明确说明单张与组合均已尝试',
    lg.indexOf('单张与组合均已尝试') >= 0, tail(4));
  check('4.2 报出最后的错误类型', /CANNOT_BEAT|INVALID_HAND/.test(lg), tail(4));
  check('4.3 手牌未减少', handOf('A').hand.length === before,
    'before=' + before + ' now=' + handOf('A').hand.length);
  check('4.4 桌面未变', g.gameState().table.length === tableBefore,
    'table=' + g.gameState().table.length);
  check('4.5 回合未被推进(仍在甲)', g.currentPlayer() === 'A', g.currentPlayer());
  console.log('   [取证] ' + tail(3));
}

// ============ 5. 出最后一张 → lastEmptiedPlayer 必须被赋值 ============
section('5. 出完最后一张 → lastEmptiedPlayer 被赋值(后续推风的前提)');
{
  var st = build({
    table: [],
    sizes: { A: 1 },
    keyCards: { A: [SB.C('S', 6)] }
  });
  setup(st, 'A');
  var sel = g.selectedCards();
  sel.push(handOf('A').hand[0].id);

  g.doPlay();

  var lg = logStr();
  check('5.1 手牌归零', handOf('A').hand.length === 0, 'len=' + handOf('A').hand.length);
  check('5.2 出现「出完牌」日志', lg.indexOf('出完牌') >= 0, tail(4));
  console.log('   [取证] ' + tail(3));
}

// ============ 6. 组合回退成功后**不得**再打失败日志 ============
// [2026-10-23 20:19 用户实测] 只点一次出牌, 却出来两条日志:
//   甲 出 ♥5 ♠5 ♦5 ♣5 (组合回退)
//   甲 失败: 压不过桌面(单张与组合均已尝试). 最后: …
// 根因: 组合回退块的 `return` 写在 IIFE **内部**, **只退出 IIFE 自己**,
//   doPlay 继续往下走到末尾的失败日志 —— 而此时牌已经打出、回合已推进、AI 已行动。
//   我一度把它误判为「两次点击」, 用户纠正: 只有一次点击。是我臆测。
//
// 本用例在**修复前必然失败**, 修复后通过 —— 即变异测试有效性。
section('6. 单张压不过但组合能压 → 成功打出, 且不得再打失败日志');
{
  var st = build({
    table: [SB.C('S', 3)],   // 桌面 ♠3: 打大A 中 3 次大(§6.2), 单张压不过
    sizes: { A: 6 },
    // 四张 5 = 蛋, 能压过单张; 另两张 4 是单张废牌, 用来坐实「逐张全败」
    keyCards: { A: [SB.C('H', 5), SB.C('S', 5), SB.C('D', 5), SB.C('C', 5), SB.C('H', 4), SB.C('S', 4)] }
  });
  setup(st, 'A');
  var before = handOf('A').hand.length;

  g.doPlay();

  var lg = logStr();
  check('6.1 组合回退打出了牌', lg.indexOf('(组合回退)') >= 0, tail(5));
  check('6.2 手牌确实减少', handOf('A').hand.length < before,
    'before=' + before + ' now=' + handOf('A').hand.length);
  check('6.3 **成功后不得出现「失败」日志**(IIFE return 只退出了 IIFE 的老 bug)',
    lg.indexOf('失败') < 0, tail(6));
  console.log('   [取证] ' + tail(5));
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); fail.forEach(function (f) { console.log('  - ' + f); }); }
mock.uninstall();
process.exit(failed > 0 ? 1 : 0);