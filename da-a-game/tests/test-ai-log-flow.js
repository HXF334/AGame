// tests/test-ai-log-flow.js —— 控制台日志口径 + 托管/推风流程(无头回归)
//
// 覆盖 UI 验收清单里最后 3 项「日志/流程」类(原来只能人眼看控制台):
//   E26 暗打一局  -> 控制台 [AI决策] 里「推定次方=<名字>」+ 托管日志带出具体牌
//   E27 托管中同阵营推风 -> 推风把回合交给真人后, 托管的 AI 立刻替他出牌(回合不停住)
//   E30 任意对局  -> AI 自己出牌不再每手都打 [AI决策]; 托管那一行含牌名+决策
//
// [断言纪律] 只锁**性质**, 不写死具体牌:
//   - 「推定次方=」后面必须是玩家名(甲乙丙丁戊), 不能是 id(A-E)
//   - 托管行必须带出牌面(花色+点数 / 王), 不能只写张数
//   - AI 自己的出牌行一律不得含 [AI决策]; 托管那一行必须含 [AI决策]
//
// 跑法: node tests/test-ai-log-flow.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var SB = require('./lib/state-builder.js');
var card = require('../src/card.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log(''); console.log('=== ' + t + ' ==='); }
function C(s, r, id) { return card.createNormalCard(s, r, id); }
function logs() { return g.logHistory(); }
// 牌面 token: 花色+点数 / 大王 / 小王 —— 「带出了具体牌」的判据
function cardTokens(line) {
  return (line.match(/[♠♥♣♦](?:[2-9]|10|[JQKA])|大王|小王/g) || []);
}
function managedLine() {
  return logs().filter(function (l) { return l.indexOf('托管: AI 代打') >= 0; })[0] || '';
}
function handN(pid) {
  var p = g.gameState().players.filter(function (x) { return x.id === pid; })[0];
  return p ? p.hand.length : -1;
}

// 暗打 + 桌面有牌 + 托管真人: 逼 AI 走「压制」分支(才有 camp/推定次方)
function darkState() {
  return SB.build({
    handMap: { D: [C('S', 5, 'd1')] },
    table: [C('S', 4, 't1')],
    lastPlayer: 'E',
    '主A': { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
    '次方': 'C', '次方公开': false,
    '主方': ['B', 'C'], '抓方': ['A', 'D', 'E'],
    mode: '2V3_暗打',
    // 公开信息: 甲累计两次用蛋子压制了身份未明的戊 -> 推定次方=甲
    plays: [ { playerId: 'A', type: 'TRIPLE', count: 3, beat: 'E' },
             { playerId: 'A', type: 'TRIPLE', count: 3, beat: 'E' } ]
  });
}

section('1. E26 暗打一局: 推定次方打名字 + 托管日志带出具体牌');
{
  g.__setState(darkState(), { human: 'D', currentPlayer: 'D', clearLog: true });
  g.__setAutoPlay(true);
  g.__autoPlayStep();
  var ml = managedLine();
  check('E26.1 托管那一行存在(托管代打出牌)', ml.length > 0, ml.slice(0, 80));
  check('E26.2 托管行带出具体牌面(不是只写张数)', cardTokens(ml).length > 0, ml.slice(0, 120));
  var all = logs().join('\n');
  check('E26.3 [AI决策] 里「推定次方=」后面是玩家名', /推定次方=[甲乙丙丁戊]/.test(all), '');
  check('E26.4 「推定次方=」后面不是玩家 id', !/推定次方=[A-E](\W|$)/.test(all), '');
}

section('2. E30 任意对局: AI 出牌不打 [AI决策]; 托管那一行含牌名+决策');
{
  g.__setAutoPlay(false);
  g.__setState(SB.build({
    lastPlayer: 'B',
    '主A': { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
    '次方': 'C', '次方公开': false,
    '主方': ['B', 'C'], '抓方': ['A', 'D', 'E'], mode: '2V3_暗打'
  }), { human: 'E', currentPlayer: 'A', clearLog: true });
  g.runAI();
  var aiPlays = logs().filter(function (l) { return /^AI .*PLAY/.test(l); });
  var aiWithTrace = aiPlays.filter(function (l) { return l.indexOf('[AI决策]') >= 0; });
  check('E30.1 AI 自己出了牌(有样本)', aiPlays.length > 0, 'aiPlays=' + aiPlays.length);
  check('E30.2 AI 的出牌行一律不含 [AI决策]', aiWithTrace.length === 0,
        aiWithTrace.length ? aiWithTrace[0].slice(0, 100) : '');
  // 接着真人回合开托管 -> 托管那一行必须「牌名 + 决策」
  g.__setState(darkState(), { human: 'D', currentPlayer: 'D', clearLog: false });
  g.__setAutoPlay(true);
  g.__autoPlayStep();
  var ml2 = managedLine();
  check('E30.3 托管那一行含 [AI决策]', ml2.indexOf('[AI决策]') >= 0, ml2.slice(0, 100));
  check('E30.4 托管那一行含牌名', cardTokens(ml2).length > 0, ml2.slice(0, 120));
  var traceLines = logs().filter(function (l) { return l.indexOf('[AI决策]') >= 0; });
  check('E30.5 不是每手都打决策轨迹(轨迹行数 < 出牌行数)', traceLines.length < aiPlays.length,
        'trace=' + traceLines.length + ' aiPlays=' + aiPlays.length);
}

section('3. E27 托管中同阵营推风: 回合交给真人后托管 AI 立刻代打');
var e27 = { armed: false };
{
  g.__setAutoPlay(false);
  // 甲出完牌 -> 推风; 次方已公开 -> 推风走「同阵营最近未出完者」-> 目标=丁(真人)
  g.__setState(SB.build({
    emptyPlayers: ['A'], '推风触发者': 'A',
    '主A': { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
    '次方': 'C', '次方公开': true,
    '主方': ['B', 'C'], '抓方': ['A', 'D', 'E'],
    mode: '2V3_暗打', lastPlayer: 'A'
  }), { human: 'D', currentPlayer: 'A', clearLog: true });
  g.__setAutoPlay(true);
  var before = handN('D');
  g.doPushWind();
  check('E27.1 推风把回合交给了真人', g.currentPlayer() === 'D', String(g.currentPlayer()));
  check('E27.2 推风日志写了目标=真人', logs().join('\n').indexOf('推风完成') >= 0, '');
  e27 = { before: before, armed: true };
}

// 托管接管是**定时器**驱动的(真机 700ms) -> 等它到点再断言
setTimeout(function () {
  section('3b. E27 推风后托管 AI 确实替他出了牌(回合没停住)');
  var ml3 = managedLine();
  check('E27.3 托管 AI 接管并出了牌', ml3.length > 0, ml3.slice(0, 100));
  check('E27.4 真人的手牌少了(牌真的被打出去)', handN('D') < e27.before,
        'before=' + e27.before + ' after=' + handN('D'));
  console.log('');
  console.log('test-ai-log-flow: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, 1500);