// tools/stress-pushwind.js —— 打大A 无头对局压测 (常规诊断工具)
//
// 用途: 把「批量完整对局」变成一条**可靠、可重复、可落盘**的命令。
//   它一次性覆盖: 完局率 / 卡死 / 推风触发次数 / §9.3 跨阵营 / 规则 B(最后一个出完者触发)
//   今天三次 bug(推风 x2 + 日志静默) 若有这种常态化压测, 至少一半会在提交前暴露。
//
// 用法:
//   node tools/stress-pushwind.js [局数]        默认 50
//   node tools/stress-pushwind.js 200           跑 200 局
//
// 结果同时写到 tools/stress_result.txt (落盘, 便于 exec 被切断后仍能读到)。
//
// 【为什么单独放 tools/ 而不是 tests/】
//   tests/test-*.js 会进 51 套件的常规回归。本压测**随机、耗时**, 放进去会拖慢
//   每次回归(今天已因 exec 超时丢过三轮)。故独立成工具, 按需手动跑。
//
// 【踩过的坑, 全部写在这里】
//   1. mock 必须在 require('../game.js') 之前安装 —— ctx 在 require 时一次性确定
//   2. human 必须是真实玩家 id; 若填 'ZZZ' 会让 runAI 判定"无人类"而自动打完整局
//   3. 人类席位固定过牌 -> 桌面为空时过牌非法(CANNOT_PASS) -> 不推进 currentPlayer
//      -> 死循环到 guard -> 4/5 局卡死 -> 推风 0 次(假象: 看着像修复失效)
//   4. 出牌后读 st.players 判断是否出牌成功 —— st 已被 gameState 替换, 是**过期引用**,
//      恒等于出牌前的手牌数 -> 每回合都多余地过牌
//   5. 甲方手牌若留随机牌, 会卡在废牌出不完(探针实测 CANNOT_BEAT)
//   6. 甲多余手牌若「全推给乙」会造出 44 张手怪物, 抓方永远出不完 -> 整局 0 次推风
//   7. 结果文件用**独特名字**: 后台 exec 会连带清掉同目录的临时脚本(今天丢过三轮回归)
var mock = require('../tests/mock-wx.js');
var fs = require('fs');
mock.install({ width: 900, height: 500 });   // 必须在 require game.js 之前

var SB = require('../tests/lib/state-builder.js');
var path = require('path');

var GAMES = parseInt(process.argv[2] || '50', 10);
var OUT = path.join(__dirname, 'stress_result.txt');

var PUSH_RE = /触发=([甲乙丙丁戊]).*?同阵营=(主方|抓方)\[([^\]]*)\].*?目标=([甲乙丙丁戊])/;
var OUT_RE = /([甲乙丙丁戊])\s*(?:AI)?\s*出完牌/;
var TRIGGER_RE = /推风完成: 触发=([甲乙丙丁戊])/;

// 给人类 1 张强牌; 甲多余手牌 -> 弃牌堆(不喂给任何玩家); 108 张守恒
// 对局模式轮换: 覆盖 2V3 明打/暗打 与 1V4 明打/暗打 四条分支
//   1V4 的主方只有独打者一人, 次方为 null (§4.5 空白: 实现按「无次方概念」处理,
//   见 test-play.js L469 注释) —— 这条分支此前无任何压测证据。
// 抓方必须**显式**给出: 早前一版只写主方/次方而省略抓方, SB.build 推导出
//   垃圾(抓方=[A,D,E] 含主方成员且缺两人), 由此报出的「跳阵营推风」是
//   **工具构造的假局面**, 不是产品 bug。教训同 KNOWN_ISSUES E10。
var MODES = [
  { mode: '2V3_暗打', 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', 次方公开: false },
  { mode: '2V3_明打', 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', 次方公开: true },
  { mode: '1V4_明打', 主方: ['A'], 抓方: ['B', 'C', 'D', 'E'], 次方: null, 次方公开: false },
  { mode: '1V4_暗打', 主方: ['A'], 抓方: ['B', 'C', 'D', 'E'], 次方: null, 次方公开: false }
];

// 日志用中文名(甲乙丙丁戊), state.players[].id 用 ASCII(A..E)。取证时必须先映射,
//   否则永远查不到玩家(初版就踩了, 输出一律 hand=-1, 等于取证失效)。
var NAME2ID = { '甲': 'A', '乙': 'B', '丙': 'C', '丁': 'D', '戊': 'E' };
var ID2NAME = { A: '甲', B: '乙', C: '丙', D: '丁', E: '戊' };
function toIds(list) {
  return (list || []).map(function (n) { return NAME2ID[n] || n; });
}

function mkState(humanCards, modeSpec) {
  var st = SB.build({
    handMap: {}, table: [], lastPlayer: 'C',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: modeSpec.次方, 次方公开: modeSpec.次方公开,
    主方: modeSpec.主方, 抓方: modeSpec.抓方,
    mode: modeSpec.mode
  });
  var A = st.players.filter(function (p) { return p.id === 'A'; })[0];
  var B = st.players.filter(function (p) { return p.id === 'B'; })[0];
  var WANT = [3, 2, 14];
  var got = 0;
  for (var w = 0; w < WANT.length && got < humanCards; w++) {
    for (var i = A.hand.length - 1; i >= 0 && got < humanCards; i--) {
      if (!A.hand[i].isBigJoker && !A.hand[i].isSmallJoker && A.hand[i].rank === WANT[w]) {
        st.discarded.push(A.hand.splice(i, 1)[0]); got++;
      }
    }
  }
  for (var w2 = 0; w2 < WANT.length && got < humanCards; w2++) {
    for (var j = B.hand.length - 1; j >= 0 && got < humanCards; j--) {
      if (!B.hand[j].isBigJoker && !B.hand[j].isSmallJoker && B.hand[j].rank === WANT[w2]) {
        A.hand.push(B.hand.splice(j, 1)[0]); got++;
      }
    }
  }
  while (A.hand.length > humanCards) st.discarded.push(A.hand.pop());
  while (A.hand.length < humanCards && B.hand.length > 0) {
    var pk = B.hand.pop();
    if (!pk.isBigJoker && !pk.isSmallJoker) A.hand.push(pk); else st.discarded.push(pk);
  }
  var total = st.players.reduce(function (a, p) { return a + p.hand.length; }, 0)
    + (st.table || []).length + (st.discarded || []).length;
  if (total !== 108) throw new Error('牌张不守恒: ' + total);
  return st;
}

function runGame(seed, humanCards, modeSpec) {
  delete require.cache[require.resolve('../game.js')];
  var g = require('../game.js');
  g.__setState(mkState(humanCards, modeSpec), { currentPlayer: 'A', human: 'A', clearLog: true });

  var st = g.gameState();
  var HUMAN = 'A';
  var guard = 0;
  var humanEmptied = false;

  while (st.phase !== 'GAME_END' && guard++ < 600) {
    if (g.currentPlayer() === HUMAN) {
      var p = st.players.filter(function (x) { return x.id === HUMAN; })[0];
      if (!p || p.hand.length === 0) break;
      var h0 = g.gameState().players.filter(function (x) { return x.id === HUMAN; })[0].hand.length;
      g.doPlay();
      var after = g.gameState().players.filter(function (x) { return x.id === HUMAN; })[0].hand.length;
      if (after === h0) g.doPass();
      var p3 = g.gameState().players.filter(function (x) { return x.id === HUMAN; })[0];
      if (p3 && p3.hand.length === 0) humanEmptied = true;
    } else {
      var before = g.currentPlayer();
      g.runAI();
      if (g.currentPlayer() === before) break;
    }
    st = g.gameState();
  }

  var res = { seed: seed, ended: st.phase === 'GAME_END', guardHit: guard >= 600,
    humanEmptied: humanEmptied, pushWinds: [], campViolations: [], ruleBViolations: [] };

  var lastOut = null;
  g.logHistory().forEach(function (l) {
    var m0 = OUT_RE.exec(l);
    if (m0) lastOut = m0[1];
    var m1 = TRIGGER_RE.exec(l);
    if (m1 && lastOut && m1[1] !== lastOut) {
      res.ruleBViolations.push('触发=' + m1[1] + ' 但本轮最后出完者是 ' + lastOut);
    }
    var m = PUSH_RE.exec(l);
    if (m) {
      var camp = m[3].split(',').filter(Boolean);
      if (camp.indexOf(m[4]) < 0) {
        // 【取证】跨阵营时把上下文一并记下, 否则无法判断是产品 bug 还是场景构造问题:
        //   - 目标是否已出完(§9: 已出完必须跳过)
        //   - 声明的同阵营列表 vs 真实主方/抓方
        var _st = g.gameState();
        var _tid = NAME2ID[m[4]];
        var _tp = _st.players.filter(function (p) { return p.id === _tid; })[0];
        var _tHand = _tp ? _tp.hand.length : -1;
        var _主方 = (_st['主方'] || []).join(',');
        var _抓方 = (_st['抓方'] || []).join(',');
        res.campViolations.push(l
          + ' || [取证] 目标' + m[4] + '(id=' + _tid + ')手牌=' + _tHand
          + ' 真实主方=[' + _主方 + '] 抓方=[' + _抓方 + ']'
          + ' 声明同阵营(id)=[' + toIds(camp).join(',') + ']'
          + ' 目标在主方=' + ((_st['主方'] || []).indexOf(_tid) >= 0)
          + ' 在抓方=' + ((_st['抓方'] || []).indexOf(_tid) >= 0)
          + ' mode=' + _st.mode + ' 次方=' + ID2NAME[_st['次方']] + ' 次方公开=' + _st['次方公开']);
      }
      res.pushWinds.push({ trigger: m[1], camp: camp, target: m[4] });
    }
  });
  return res;
}

// 人类手牌张数轮换(1 / 2 / 3 / 全量), 覆盖不同出完时机与 doPlay 三条分支
function humanCardsFor(seed) {
  return [1, 2, 3, 22][seed % 4];
}

var results = [];
var perMode = {};
for (var i = 0; i < GAMES; i++) {
  var ms = MODES[i % MODES.length];
  var r = runGame(i, humanCardsFor(i), ms);
  r.mode = ms.mode;
  results.push(r);
  if (!perMode[ms.mode]) perMode[ms.mode] = { games: 0, ended: 0, stuck: 0, push: 0, camp: 0, ruleB: 0 };
  var pm = perMode[ms.mode];
  pm.games++;
  if (r.ended) pm.ended++;
  if (r.guardHit) pm.stuck++;
  pm.push += r.pushWinds.length;
  pm.camp += r.campViolations.length;
  pm.ruleB += r.ruleBViolations.length;
  if ((i + 1) % 10 === 0) process.stderr.write('  ... ' + (i + 1) + '/' + GAMES + '\n');
}

var allPush = [].concat.apply([], results.map(function (r) { return r.pushWinds; }));
var ended = results.filter(function (r) { return r.ended; }).length;
var stuck = results.filter(function (r) { return r.guardHit; }).length;
var zeroPush = results.filter(function (r) { return r.pushWinds.length === 0; }).length;
var humanTrig = allPush.filter(function (p) { return p.trigger === '甲'; }).length;
var campV = [].concat.apply([], results.map(function (r) { return r.campViolations; }));
var ruleV = [].concat.apply([], results.map(function (r) { return r.ruleBViolations; }));
var humanEmptiedGames = results.filter(function (r) { return r.humanEmptied; }).length;

var out = [];
out.push('=== 打大A 无头对局压测: ' + GAMES + ' 局 ===');
out.push('完局        : ' + ended + '/' + GAMES + '  (' + (ended / GAMES * 100).toFixed(1) + '%)');
out.push('卡死        : ' + stuck);
out.push('推风总次数  : ' + allPush.length + '   平均每局 ' + (allPush.length / GAMES).toFixed(2));
out.push('零推风局数  : ' + zeroPush);
out.push('人类触发推风: ' + humanTrig);
out.push('人类出完牌局: ' + humanEmptiedGames + '/' + GAMES);
out.push('跨阵营推风  : ' + campV.length + (campV.length ? '  ✗' : '  ✓'));
if (campV.length) {
  out.push('');
  out.push('--- 跨阵营取证 ---');
  campV.slice(0, 4).forEach(function (c) { out.push('  ' + c); });
}
out.push('规则B违规   : ' + ruleV.length + (ruleV.length ? '  ✗ ' + ruleV[0] : '  ✓'));

out.push('');
out.push('=== 分模式 ===');
Object.keys(perMode).forEach(function (m) {
  var p = perMode[m];
  out.push('  ' + m + ': 局数=' + p.games + ' 完局=' + p.ended + ' 卡死=' + p.stuck
    + ' 推风=' + p.push + ' 跨阵营=' + p.camp + ' 规则B违规=' + p.ruleB);
});

var problems = [];
Object.keys(perMode).forEach(function (m) {
  var p = perMode[m];
  if (p.ended !== p.games) problems.push(m + ' 未 100% 完局');
  if (p.stuck > 0) problems.push(m + ' 有卡死局');
  // §10.2: 1V4明打「第一个人先出完牌即结束」-> 牌局当场终止, 不会有下一轮需要推风。
  //   故该模式下「推风 0 次」是**预期行为**, 不能当问题。
  if (p.push === 0 && m !== '1V4_明打') problems.push(m + ' 推风一次都没触发');
  if (p.push === 0 && m === '1V4_明打') out.push('  (1V4_明打 推风 0 次属预期: §10.2 第一个人出完即结束)');
  if (p.camp > 0) problems.push(m + ' 存在跨阵营推风 (§9.3 违规)');
  if (p.ruleB > 0) problems.push(m + ' 推风触发者非本轮最后出完者 (规则 B 违规)');
});
out.push('');
out.push('=== 判定 ===');
out.push(problems.length === 0
  ? '✓ 全部通过: 四种模式各自 100% 完局 / 无卡死 / 推风正常 / 无跨阵营 / 规则 B 成立'
  : '✗ ' + problems.join('; '));

var text = out.join('\n');
fs.writeFileSync(OUT, text, 'utf8');
console.log(text);
console.log('');
console.log('(结果已写入 ' + OUT + ')');
process.exit(problems.length === 0 ? 0 : 1);