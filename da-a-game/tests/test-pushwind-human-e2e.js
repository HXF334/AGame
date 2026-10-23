// tests/test-pushwind-human-e2e.js
// 端到端: 验证「玩家(人类)手动出完牌」时推风的行为, 以及规则 B 的语义
//
// 为什么需要这个测试:
//   B39/B40 修的是 doPlay 三条分支的「过期引用」, 已有单测(test-doplay-fallback)
//   与契约测试(test-state-immutability) 覆盖。但**真实对局**层面:
//     - AI 出完牌的推风: 有压测证据(每局约 2 次, 0 跨阵营)
//     - **人类出完牌的推风: 一直没有任何自动化证据**
//   而用户日志里恰恰出现过「3 人出完牌、推风 0 次」, 其中就有玩家。
//
// 【规则 B · 2026-10-23 19:36 用户裁定】
//   一轮内若有多人先后出完牌, **只有该轮最后一个出完的触发推风**。
//   SKILL §9 已同日补上该条款。断言方式: 顺序扫日志, 记录最近一次「X 出完牌」,
//   遇到「推风完成: 触发=Y」时断言 Y === 最近一次出完牌者 —— 直接编码语义,
//   不依赖具体局面。
//
// 【人类席位策略】
//   先尽量出牌(doPlay 内部会回退逐张), 真的一张都出不去才过牌。
//   桌面为空时**过牌是非法的**(CANNOT_PASS), 早期版本固定过牌导致死循环到 guard、
//   4/5 局卡死、推风 0 次(见 KNOWN_ISSUES E10)。
//
// 【踩过的坑, 均会导致本测试完全失效 —— 全部是实测出来的】
//   1. mock 必须在 require('../game.js') 之前安装: ctx 在 require 时一次性确定
//   2. human 必须是**真实玩家 id**(如 'A'), 不能填不存在的 'ZZZ':
//      那会让 runAI 判定「无人类」而自动打完整局, 断言读到后面某一轮的日志
//   3. 人类手牌若留随机牌, 探针打点发现甲抽到 ♦6 后每回合 CANNOT_BEAT,
//      永远出不完 —— 必须给**强牌**(§6.2 点数序 3>2>A>...>4, rank 3 最强)
//   4. 甲多余手牌「全推给乙」会造出 44 张手的怪物, 抓方永远出不完 -> 整局 0 次推风。
//      正确做法是送进**弃牌堆**(守恒)
//   5. 出牌后读 `st.players` 判断是否出牌成功 —— st 已被 gameState 替换成新对象,
//      读的是过期引用, 恒等于出牌前的手牌数, 于是每回合都多余地过牌。
//      (与 game.js B39/B40 同类错误, 只是这次在我自己的测试里)
var mock = require('./mock-wx.js');
mock.install({ width: 900, height: 500 });   // 必须在 require game.js 之前

var SB = require('./lib/state-builder.js');

var GAMES = parseInt(process.argv[2] || '6', 10);

var passed = 0, failed = 0, fail = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  [OK] ' + name); }
  else { failed++; fail.push(name + (detail ? ' | ' + detail : '')); console.log('  [FAIL] ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var PUSH_RE = /触发=([甲乙丙丁戊]).*?同阵营=(主方|抓方)\[([^\]]*)\].*?目标=([甲乙丙丁戊])/;
// 【非空断言防护】初版 OUT_RE 要求行**以玩家名开头**, 但实际日志行形如
//   "  → 戊 AI 出完牌 (待轮次结束触发推风)" / "  -> 甲 出完牌∈待轮次结束可能触发推风"
//   —— 都带缩进与箭头 -> 正则永远不匹配 -> _lastOut 恒 null
//   -> 规则 B 断言**从未真正执行**, 属于空断言(恒真)。
//   正则改为在行内找「玩家名 + 出完牌」; 并加 outEvents > 0 的断言,
//   确保这条检查真的被驱动到了(否则又是一次 T5)。
var OUT_RE = /([甲乙丙丁戊])\s*(?:AI)?\s*出完牌/;
var TRIGGER_RE = /推风完成: 触发=([甲乙丙丁戊])/;

// 给人类 1 张强牌; 甲多余的手牌 -> 弃牌堆(不喂给任何玩家); 108 张守恒
function mkSmallHumanState(humanCards) {
  var st = SB.build({
    handMap: {}, table: [], lastPlayer: 'C',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: true, 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_暗打'
  });
  var A = st.players.filter(function (p) { return p.id === 'A'; })[0];
  var B = st.players.filter(function (p) { return p.id === 'B'; })[0];

  var WANT = [3, 2, 14];       // §6.2 点数强弱
  var got = 0;
  for (var w = 0; w < WANT.length && got < humanCards; w++) {
    for (var i = A.hand.length - 1; i >= 0 && got < humanCards; i--) {
      if (!A.hand[i].isBigJoker && !A.hand[i].isSmallJoker && A.hand[i].rank === WANT[w]) {
        st.discarded.push(A.hand.splice(i, 1)[0]);
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
  while (A.hand.length > humanCards) st.discarded.push(A.hand.pop());
  while (A.hand.length < humanCards && B.hand.length > 0) {
    var pk = B.hand.pop();
    if (!pk.isBigJoker && !pk.isSmallJoker) A.hand.push(pk);
    else st.discarded.push(pk);
  }

  var total = st.players.reduce(function (a, p) { return a + p.hand.length; }, 0)
    + (st.table || []).length + (st.discarded || []).length;
  if (total !== 108) throw new Error('牌张不守恒: ' + total);
  return st;
}

function runGame(seed) {
  delete require.cache[require.resolve('../game.js')];
  var g = require('../game.js');
  g.__setState(mkSmallHumanState(1), { currentPlayer: 'A', human: 'A', clearLog: true });

  var st = g.gameState();
  var HUMAN = 'A';
  var guard = 0;
  var humanEmptiedFlag = false;

  while (st.phase !== 'GAME_END' && guard++ < 600) {
    var cur = g.currentPlayer();
    if (cur === HUMAN) {
      var p = st.players.filter(function (x) { return x.id === HUMAN; })[0];
      if (!p || p.hand.length === 0) break;
      var h0 = g.gameState().players.filter(function (x) { return x.id === HUMAN; })[0].hand.length;
      g.doPlay();
      var after = g.gameState().players.filter(function (x) { return x.id === HUMAN; })[0].hand.length;
      if (after === h0) g.doPass();                 // 真的一张都出不去 -> 过牌
      var p3 = g.gameState().players.filter(function (x) { return x.id === HUMAN; })[0];
      if (p3 && p3.hand.length === 0) humanEmptiedFlag = true;
    } else {
      var before = g.currentPlayer();
      g.runAI();
      if (g.currentPlayer() === before) break;      // AI 未推进 -> 本局作废
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
    emptiedBy: [],
    outEvents: 0,
    ruleBViolations: []
  };

  var lastOut = null;
  g.logHistory().forEach(function (l) {
    var m0 = OUT_RE.exec(l);
    if (m0) { lastOut = m0[1]; res.emptiedBy.push(m0[1]); res.outEvents++; }

    var m1 = TRIGGER_RE.exec(l);
    if (m1 && lastOut && m1[1] !== lastOut) {
      res.ruleBViolations.push('触发=' + m1[1] + ' 但本轮最后出完者是 ' + lastOut);
    }

    var m = PUSH_RE.exec(l);
    if (m) {
      res.pushWinds.push({
        trigger: m[1], campKind: m[2],
        camp: m[3].split(',').filter(Boolean), target: m[4], line: l
      });
    }
  });

  if (res.emptiedBy.indexOf('甲') >= 0) res.humanEmptied = true;
  if (humanEmptiedFlag) res.humanEmptied = true;
  return res;
}

console.log('=== 端到端: 人类出完牌与规则 B 验证 (' + GAMES + ' 局) ===');

var all = [];
for (var i = 0; i < GAMES; i++) {
  var r = runGame(i);
  all.push(r);
  console.log('  [局 ' + (i + 1) + '] 完局=' + r.ended + ' 甲余牌=' + r.humanHand
    + ' 推风=' + r.pushWinds.length + ' 甲出完=' + r.humanEmptied
    + ' 出完者=[' + r.emptiedBy.join(',') + ']');
}

var allPush = [].concat.apply([], all.map(function (r) { return r.pushWinds; }));
var humanTrig = allPush.filter(function (p) { return p.trigger === '甲'; });
var allViol = [].concat.apply([], all.map(function (r) { return r.ruleBViolations || []; }));

section('1. 基础健壮性');
check('1.1 全部对局都结束', all.every(function (r) { return r.ended; }),
  all.filter(function (r) { return !r.ended; }).length + ' 局未结束');
check('1.2 无卡死(AI 未推进导致停滞)', all.every(function (r) { return !r.guardHit; }),
  all.filter(function (r) { return r.guardHit; }).length + ' 局卡死');

section('2. 推风触发');
check('2.1 至少触发过一次推风', allPush.length > 0, '总数=' + allPush.length);
check('2.2 过半对局触发了推风',
  all.filter(function (r) { return r.pushWinds.length > 0; }).length * 2 >= GAMES,
  all.filter(function (r) { return r.pushWinds.length === 0; }).map(function (r) { return r.seed + 1; }).join(',')
  + ' 局为 0 (可能无人出完即结束, 属正常)');

section('3. §9.3 目标必须同阵营(所有推风)');
var wrong = allPush.filter(function (p) { return p.camp.indexOf(p.target) < 0; });
check('3.1 无跨阵营推风', wrong.length === 0, wrong.length ? wrong[0].line : '');

section('4. 人类出完牌 与 规则 B');
check('4.1 人类席位确实出完过牌',
  all.some(function (r) { return r.humanEmptied; }),
  all.map(function (r) { return (r.seed + 1) + ':' + r.humanEmptied; }).join(' '));
check('4.1b **出完牌事件被成功识别**(否则 4.2 是空断言)',
  all.every(function (r) { return r.outEvents > 0; }),
  all.map(function (r) { return (r.seed + 1) + ':' + r.outEvents; }).join(' '));
check('4.2 推风触发者 === 本轮最后一个出完牌者 (规则 B)',
  allViol.length === 0, allViol.slice(0, 3).join(' | '));
check('4.3 人类触发的推风, 目标也在同阵营(有样本时)',
  humanTrig.filter(function (p) { return p.camp.indexOf(p.target) < 0; }).length === 0,
  humanTrig.length ? humanTrig[0].line : '本轮无人类触发的样本');
console.log('  [诊断] 人类触发推风次数 = ' + humanTrig.length + ' / 总推风 = ' + allPush.length
  + '  (规则 B 下, 人类若非本轮最后出完者则不应触发)');

console.log('\n=== 取证明细 ===');
all.forEach(function (r) {
  console.log('  局' + (r.seed + 1) + ': 出完顺序=[' + r.emptiedBy.join(',') + ']');
  r.pushWinds.forEach(function (p) {
    console.log('    触发=' + p.trigger + ' ' + p.campKind + '[' + p.camp.join(',') + '] 目标=' + p.target);
  });
});

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
console.log('局数=' + GAMES + ' | 推风总数=' + allPush.length + ' | 其中人类触发=' + humanTrig.length);
if (failed > 0) { console.log('\nFAILED:'); fail.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed > 0 ? 1 : 0);