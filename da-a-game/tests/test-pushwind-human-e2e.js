// tests/test-pushwind-human-e2e.js
// 端到端: 验证**人类(玩家)手动出完牌**时推风确实触发, 且目标是同阵营
//
// 为什么需要这个测试:
//   B39/B40 修的是 doPlay 三条分支的「过期引用」, 已有单测(test-doplay-fallback)
//   与契约测试(test-state-immutability) 覆盖。但**真实对局**层面:
//     - AI 出完牌的推风: 有压测证据(每局约 2 次, 0 跨阵营)
//     - **人类出完牌的推风: 一直没有任何自动化证据**
//   而用户日志里恰恰出现过「3 人出完牌、推风 0 次」, 其中就有玩家。
//   本测试把「玩家出完牌 -> 轮次结束 -> 推风 -> 目标同阵营」跑成**可执行断言**。
//
// 【人类席位策略 —— 关键】
//   领先(桌面空)时出**多张**, 跟随时过牌。
//   出多张才能覆盖 B39 的**批量分支**; 只出单张只覆盖逐张分支。
//   注意: 桌面为空时**过牌是非法的**(CANNOT_PASS), 早期版本固定过牌导致
//   死循环到 guard、4/5 局卡死、推风 0 次(见 KNOWN_ISSUES E10)。
//
// 【踩过的坑, 均会导致本测试完全失效】
//   1. mock 必须在 require('../game.js') 之前安装 —— ctx 在 require 时一次性确定
//   2. human 必须是**真实玩家 id**(如 'A'), 不能填不存在的 'ZZZ':
//      那会让 runAI 判定"无人类"而自动打完整局, 断言读到后面某一轮的日志
var mock = require('./mock-wx.js');
mock.install({ width: 900, height: 500 });   // 必须在 require game.js 之前

var SB = require('./lib/state-builder.js');

var GAMES = parseInt(process.argv[2] || '6', 10);

// 【场景】给人类一副 2 张的小手牌。
//   初版用全量 22 张, 实测 6 局人类最多只出到 7 张 —— AI 抢先跑完,
//   人类根本没机会出完, 于是「人类出完牌触发推风」这条路径永远测不到。
//   把甲多余���挪给乙: **108 张守恒不变**, 局面仍然合法。
function mkSmallHumanState(humanCards) {
  var st = SB.build({
    handMap: {}, table: [], lastPlayer: 'C',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: true, 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_暗打'
  });
  var A = st.players.filter(function (p) { return p.id === 'A'; })[0];
  var B = st.players.filter(function (p) { return p.id === 'B'; })[0];
  // §6.2 点数强弱: 3 > 2 > A > K > ... > 4 (rank 3 最强, 仅次大A)
  var WANT = [3, 2, 14];
  // 甲手里若没有强牌, 从乙调一张(后���只保留强牌, 乙少一张)
  var got = 0;
  for (var w = 0; w < WANT.length && got < humanCards; w++) {
    for (var i = A.hand.length - 1; i >= 0 && got < humanCards; i--) {
      if (!A.hand[i].isBigJoker && !A.hand[i].isSmallJoker && A.hand[i].rank === WANT[w]) {
        var _c = A.hand.splice(i, 1)[0];
        st.discarded.push(_c);
        got++;
      }
    }
  }
  for (var w2 = 0; w2 < WANT.length && got < humanCards; w2++) {
    for (var j = B.hand.length - 1; j >= 0 && got < humanCards; j--) {
      if (!B.hand[j].isBigJoker && !B.hand[j].isSmallJoker && B.hand[j].rank === WANT[w2]) {
        A.hand.push(B.hand.splice(j, 1)[0]);
        got++;
      }
    }
  }
  // 甲多余的手牌 -> 弃牌堆(**不喂给任何玩家**)。
  //   初版把它们全推给乙, 乙变成 44 张手的怪物 -> 抓方永远出不完 -> 整局 0 次推风。
  while (A.hand.length > humanCards) st.discarded.push(A.hand.pop());
  // 极端兜底: 连强牌都凑不出, 从乙拿一张普通牌
  while (A.hand.length < humanCards && B.hand.length > 0) {
    var _pk = B.hand.pop();
    if (!_pk.isBigJoker && !_pk.isSmallJoker) A.hand.push(_pk);
    else st.discarded.push(_pk);
  }
  var total = st.players.reduce(function (a, p) { return a + p.hand.length; }, 0)
    + (st.table || []).length + (st.discarded || []).length;
  if (total !== 108) throw new Error('牌张不守恒: ' + total);
  return st;
}

var passed = 0, failed = 0, fail = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; fail.push(name + (detail ? ' | ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var PUSH_RE = /触发=([甲乙丙丁戊]).*?同阵营=(主方|抓方)\[([^\]]*)\].*?目标=([甲乙丙丁戊])/;

function runGame(seed) {
  delete require.cache[require.resolve('../game.js')];
  var g = require('../game.js');
  // 注入小手牌场景; human 设为真实玩家 'A', runAI 才会停在甲的回合
  // 【为何只给 1 张】主方=[甲,丁]。给 2 张时实测 6 局全部是「丁先出完(推风给他) ->
  //   甲随后出完 -> 主方全空 -> 牌局直接结束」, 甲永远是压轴那个, 牌局结束不需要推风,
  //   于是永远测不到「人类出完牌触发推风」。给 1 张让甲首回合即出完, 此时丁仍有大量牌,
  //   牌局继续 -> 甲出完 + 本轮结束 -> 推风应触发, 目标=主方最近未出完者(丁)。
  g.__setState(mkSmallHumanState(1), { currentPlayer: 'A', human: 'A', clearLog: true });
  var st = g.gameState();
  var HUMAN = 'A';
  var guard = 0;
  // res 在循环**之后**才组装, 故循环内用本地标志, 循环后搬运。
  var humanEmptiedFlag = false;

  while (st.phase !== 'GAME_END' && guard++ < 600) {
    var cur = g.currentPlayer();
    if (cur === HUMAN) {
      var p = st.players.filter(function (x) { return x.id === HUMAN; })[0];
      if (!p || p.hand.length === 0) break;
      // 【策略修正】初版只在「领先(桌面空)」时出多张, 其余一律过牌 ——
      //   实测 6 局: 人类最多只出到 15 张, **从未出完**, 于是根本没有机会触发
      //   「人类出完牌」这条路径, 4.2 自然失败。
      //   改为: 先尽量出牌(doPlay 内部会回退逐张, 出不去就记失败不改状态),
      //   只有真的一張都出不去才过牌。这样人类能尽快出完。
      // 【修】初版用 `st.players` 读出牌后的手牌数, 但 doPlay() 已把 gameState
      //   换成新对象, st 是**过期引用** —— 读出来的手牌数永远等于出牌前的值,
      //   于是「一张都出不去才过牌」退化成「每回合都过牌」, 人类反而出不完。
      //   (与 game.js 里 B39/B40 同类错误, 只是这次在我自己的测试里。)
      var _h0 = g.gameState().players.filter(function (x) { return x.id === HUMAN; })[0].hand.length;
      g.doPlay();
      var _after = g.gameState().players.filter(function (x) { return x.id === HUMAN; })[0].hand.length;
      if (_after === _h0) g.doPass();              // 真的一张都出不去 -> 过牌
      var _p3 = g.gameState().players.filter(function (x) { return x.id === HUMAN; })[0];
      if (_p3 && _p3.hand.length === 0) humanEmptiedFlag = true;
    } else {
      var before = g.currentPlayer();
      g.runAI();
      if (g.currentPlayer() === before) break;   // AI 未推进 -> 本局作废
    }
    st = g.gameState();
  }

  var res = {
    seed: seed,
    ended: st.phase === 'GAME_END',
    guardHit: guard >= 600,
    humanHand: (st.players.filter(function (x) { return x.id === HUMAN; })[0] || {}).hand.length,
    pushWinds: [],
    humanEmptied: false,
    emptiedBy: []
  };

  g.logHistory().forEach(function (l) {
    // 【检测修正】初版用 l.indexOf('甲') >= 0 判定「人类出完」, 会被
    //   主方=[甲,丙] 这类行误命中(实测出现「甲出完=true 但甲余牌=15」的矛盾)。
    //   改为只认两种真证据: 手牌数归零, 或日志明确记「X 出完牌」。
    var m0 = l.match(/^(甲|乙|丙|丁|戊) AI? ?出完牌/);
    if (m0) res.emptiedBy.push(m0[1]);
    var m = PUSH_RE.exec(l);
    if (m) {
      res.pushWinds.push({
        trigger: m[1],
        campKind: m[2],
        camp: m[3].split(',').filter(Boolean),
        target: m[4],
        line: l
      });
    }
  });
  if (res.emptiedBy.indexOf('甲') >= 0) res.humanEmptied = true;
  if (humanEmptiedFlag) res.humanEmptied = true;
  return res;
}

console.log('=== 端到端: 人类出完牌触发推风 (' + GAMES + ' 局) ===');

var results = [];
for (var i = 0; i < GAMES; i++) {
  var r = runGame(i);
  results.push(r);
  console.log('  [局 ' + (i + 1) + '] 完局=' + r.ended + ' 甲余牌=' + r.humanHand
    + ' 推风=' + r.pushWinds.length + ' 甲出完=' + r.humanEmptied);
}

var all = results;
var allPush = [].concat.apply([], all.map(function (r) { return r.pushWinds; }));
var humanTrig = allPush.filter(function (p) { return p.trigger === '甲'; });

section('1. 基础健壮性');
check('1.1 全部对局都结束',
  all.every(function (r) { return r.ended; }),
  all.filter(function (r) { return !r.ended; }).length + ' 局未结束');
check('1.2 无卡死(AI 未推进导致停滞)',
  all.every(function (r) { return !r.guardHit; }),
  all.filter(function (r) { return r.guardHit; }).length + ' 局卡死');

section('2. 推风触发');
check('2.1 至少触发过一次推风', allPush.length > 0, '总数=' + allPush.length);
check('2.2 **过半对局触发了推风**',
  all.filter(function (r) { return r.pushWinds.length > 0; }).length * 2 >= GAMES,
  all.filter(function (r) { return r.pushWinds.length === 0; }).map(function (r) { return r.seed + 1; }).join(',')
  + ' 局为 0 (局可能无人出完即结束, 属正常)');

section('3. §9.3 目标必须同阵营(所有推风)');
var wrong = allPush.filter(function (p) { return p.camp.indexOf(p.target) < 0; });
check('3.1 无跨阵营推风', wrong.length === 0,
  wrong.length ? wrong[0].line : '');

section('4. 人类出完牌触发的推风(本测试的核心)');
check('4.1 人类席位确实出完过牌',
  all.some(function (r) { return r.humanEmptied; }),
  all.map(function (r) { return r.seed + ':' + r.humanEmptied; }).join(' '));
// [规则空白 2026-10-23] 4.2 **不做硬断言** —— 待用户裁定后再固化。
//   事实: 人类(甲)确实出完了牌(4.1 通过), 但多局的推风**全部**由 AI 触发。
//   原因: SKILL §9 原文为「玩家手牌全部出完后, 等其他手牌非空玩家都过牌且
//         当前轮次结束时触发推风」—— 写的是**单数玩家**。当同一轮内甲与戊先后出完,
//         lastEmptiedPlayer 被戊覆盖, 甲的推风便不再发生。
//   SKILL 未规定「一轮内多人出完」该如何处理(§4.5 / §6.4 已有两处同类空白)。
//   属**规则空白**而非代码 bug —— 不得自行选定语义, 已报用户裁定。
console.log('  [诊断] 人类触发推风次数 = ' + humanTrig.length + ' / 总推风 = ' + allPush.length + '  (规则空白, 暂不断言)');
check('4.3 人类触发的推风, 目标也在同阵营(有样本时)',
  humanTrig.filter(function (p) { return p.camp.indexOf(p.target) < 0; }).length === 0,
  humanTrig.length ? humanTrig[0].line : '无');

console.log('\n=== 取证明细 ===');
all.forEach(function (r) {
  console.log('  局' + (r.seed + 1) + ':');
  r.pushWinds.forEach(function (p) {
    console.log('    触发=' + p.trigger + ' (' + (p.trigger === '甲' ? '人类' : 'AI') + ')'
      + ' ' + p.campKind + '[' + p.camp.join(',') + '] 目标=' + p.target);
  });
});

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
console.log('局数=' + GAMES + ' | 推风总数=' + allPush.length
  + ' | 其中人类触发=' + humanTrig.length);
if (failed > 0) { console.log('\nFAILED:'); fail.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed > 0 ? 1 : 0);