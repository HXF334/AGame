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
function mkState(humanCards) {
  var st = SB.build({
    handMap: {}, table: [], lastPlayer: 'C',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: true, 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_暗打'
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

function runGame(seed, humanCards) {
  delete require.cache[require.resolve('../game.js')];
  var g = require('../game.js');
  g.__setState(mkState(humanCards), { currentPlayer: 'A', human: 'A', clearLog: true });

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
      if (camp.indexOf(m[4]) < 0) res.campViolations.push(l);
      res.pushWinds.push({ trigger: m[1], camp: camp, target: m[4] });
    }
  });
  return res;
}

// 每局人类手牌张数轮换(1 / 2 / 3 / 全量 22), 覆盖不同出完时机
function humanCardsFor(seed) {
  return [1, 2, 3, 22][seed % 4];
}

var results = [];
for (var i = 0; i < GAMES; i++) {
  results.push(runGame(i, humanCardsFor(i)));
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
out.push('跨阵营推风  : ' + campV.length + (campV.length ? '  ✗ ' + campV[0] : '  ✓'));
out.push('规则B违规   : ' + ruleV.length + (ruleV.length ? '  ✗ ' + ruleV[0] : '  ✓'));

var problems = [];
if (ended !== GAMES) problems.push('未 100% 完局');
if (stuck > 0) problems.push('有卡死局');
if (allPush.length === 0) problems.push('推风一次都没触发');
if (campV.length > 0) problems.push('存在跨阵营推风 (§9.3 违规)');
if (ruleV.length > 0) problems.push('推风触发者非本轮最后出完者 (规则 B 违规)');
out.push('');
out.push('=== 判定 ===');
out.push(problems.length === 0
  ? '✓ 全部通过: 100% 完局 / 无卡死 / 推风正常 / 无跨阵营 / 规则 B 成立'
  : '✗ ' + problems.join('; '));

var text = out.join('\n');
fs.writeFileSync(OUT, text, 'utf8');
console.log(text);
console.log('');
console.log('(结果已写入 ' + OUT + ')');
process.exit(problems.length === 0 ? 0 : 1);