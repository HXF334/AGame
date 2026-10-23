// tests/test-ui-phase-gate.js — 阶段闸门 / 统一按钮 / 结算画面 / UI 日志 / 出牌失败提示
//
// 覆盖需求三、五、六、七、八、十、十一、十二 与 二、四 的 UI 侧行为。
// [测试纪律] 本文件只覆盖**本次新增/改动的代码路径**, 不重复验证引擎规则
//   (引擎规则由 test-capture / test-play / test-scoring 等各自负责)。
//   跑法: node tests/test-ui-phase-gate.js
var mock = require('./mock-wx.js');
var m = mock.install({});
var g = require('../game.js');

var passed = 0, failed = 0, failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
function logStr() { return g.logHistory().join('\n'); }
function texts() {
  return (m.calls || []).filter(function (c) { return c && c.fn === 'fillText'; })
    .map(function (c) { return String(c.args && c.args[0] !== undefined ? c.args[0] : ''); });
}

// ============================================================
// 1. 真人默认丁位
// ============================================================
section('1. 真人默认丁位');
check('1.1 默认真人是丁(D)', g.getHumanPlayer() === 'D', g.getHumanPlayer());
check('1.2 defaultHuman 也是 D', g.defaultHuman() === 'D', g.defaultHuman());
check('1.3 座位表 D=丁', g.getHumanPlayer() === 'D' && g.logHistory().join('').indexOf('丁(真人)') >= 0);

// ============================================================
// 2. 发牌后阶段拆分 + 【下】推进
// ============================================================
section('2. 阶段拆分与【下】推进');
var gi = g.gateInfo();
check('2.1 发牌后停在 LIANG_A', g.gameState().phase === 'LIANG_A', g.gameState().phase);
check('2.2 闸门共 6 档', gi.total === 6, 'total=' + gi.total);
check('2.3 下一步是强制排查', gi.stage === 'FORCED_CHECK', gi.stage);
check('2.4 有待决策(亮A)', !!gi.choice, JSON.stringify(gi.choice));
check('2.5 决策类型是亮A', gi.choice && gi.choice.kind === 'LIANG_A', JSON.stringify(gi.choice));
check('2.6 资格由引擎判定(带 reason)', !!(gi.choice && gi.choice.reason), JSON.stringify(gi.choice));

// 【下】在**有待决策且资格具备**时必须被拒绝
var blocked = g.gateNext();
if (gi.choice && gi.choice.eligible) {
  check('2.7 有资格时【下】被阻止(不许跳过真人决策)', blocked === false, 'blocked=' + blocked);
  check('2.8 阶段未推进', g.gameState().phase === 'LIANG_A', g.gameState().phase);
} else {
  check('2.7 无资格时【下】可推进', blocked === true, 'blocked=' + blocked);
}

// 做完决策后【下】才放行
if (gi.choice && gi.choice.eligible) {
  g.humanLiangA(false);
  check('2.9 决策被消费后 gateChoice 清空', !g.gateInfo().choice, JSON.stringify(g.gateInfo().choice));
  check('2.10 日志含「不亮A」', logStr().indexOf('不亮A') >= 0);
  var moved = g.gateNext();
  check('2.11 决策完成后【下】放行', moved === true, 'moved=' + moved);
  check('2.12 阶段已推进', g.gameState().phase !== 'LIANG_A', g.gameState().phase);
}

// ============================================================
// 3. 逐档推进到 PLAY
// ============================================================
section('3. 逐档推进到出牌阶段');
var drive = g.__driveGateToPlay({});
check('3.1 最终进入 PLAY', g.gameState().phase === 'PLAY', g.gameState().phase);
check('3.2 闸门全部跑完', g.gateInfo().idx === g.gateInfo().total, JSON.stringify(g.gateInfo()));
check('3.3 currentPlayer 已设', !!drive.currentPlayer, String(drive.currentPlayer));
check('3.4 mode 已确定', !!g.gameState().mode, String(g.gameState().mode));
check('3.5 日志含阶段进出', logStr().indexOf('【阶段】') >= 0);
check('3.6 日志含资格判定', /资格: (有|无)/.test(logStr()));

// ============================================================
// 4. 出牌阶段按钮
// ============================================================
section('4. 出牌阶段按钮');
var btns = g.uiButtons();
var ids = btns.map(function (b) { return b.id; });
check('4.1 出牌阶段有 play/pass', ids.indexOf('play') >= 0 && ids.indexOf('pass') >= 0, ids.join(','));
check('4.2 出牌阶段无阶段选择按钮',
  ids.indexOf('liangA') < 0 && ids.indexOf('fanA') < 0 && ids.indexOf('next') < 0, ids.join(','));
check('4.3 play 的可用性随轮到谁变化',
  btns.filter(function (b) { return b.id === 'play'; })[0].enabled === (g.currentPlayer() === g.getHumanPlayer()));

// ============================================================
// 5. 统一按钮模型 + 触摸命中
// ============================================================
section('5. 统一按钮模型与命中');
g.draw();
var stage = g.btnStage();
check('5.1 btnStage 有坐标', stage.length > 0 && stage[0].x !== undefined, 'n=' + stage.length);
var b0 = stage[0];
var hit = g.uiButtonAt(b0.x + b0.w / 2, b0.y + b0.h / 2);
check('5.2 按钮中心可命中', !!hit, JSON.stringify(hit && hit.id));
check('5.3 命中的就是它自己', hit && hit.id === b0.id, JSON.stringify(hit && hit.id));
check('5.4 空白处不命中', !g.uiButtonAt(-50, -50));
var dis = stage.filter(function (b) { return !b.enabled; })[0];
if (dis) {
  check('5.5 禁用按钮不可命中',
    !g.uiButtonAt(dis.x + dis.w / 2, dis.y + dis.h / 2), dis.id);
}

// ============================================================
// 6. 出牌失败提示（需求十二）
// ============================================================
section('6. 出牌失败提示');
// 造一个「桌上压不过」的场面: 用 state-builder 塞一手大牌, 桌面放更大的
var SB = require('./lib/state-builder.js');
var big = [SB.C('H', 14), SB.C('D', 14), SB.C('S', 14), SB.C('C', 14)];
var st = SB.build({
  handMap: { D: [SB.C('H', 3), SB.C('D', 3), SB.C('S', 3), SB.C('C', 3)] },
  table: [SB.C('H', 13), SB.C('D', 13), SB.C('S', 13), SB.C('C', 13), SB.C('H', 12)],
  lastPlayer: 'A', 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
  mode: '2V3_暗打'
});
g.__setState(st, { human: 'D', currentPlayer: 'D', clearLog: true });
g.selectedCards().push(g.gameState().players.filter(function (p) { return p.id === 'D'; })[0].hand[0].id);
var handBefore = g.gameState().players.filter(function (p) { return p.id === 'D'; })[0].hand.length;
g.doPlay();
check('6.1 非法选择后出现提示【当前没有可用牌】', logStr().indexOf('当前没有可用牌') >= 0);
check('6.2 不再出现「回退逐张试」', logStr().indexOf('回退逐张试') < 0);
check('6.3 没有自动换牌出手(手牌未减少)',
  g.gameState().players.filter(function (p) { return p.id === 'D'; })[0].hand.length === handBefore,
  'before=' + handBefore);
check('6.4 选牌状态被保留', g.selectedCards().length === 1, 'sel=' + g.selectedCards().length);

// ============================================================
// 7. UI 日志 + 【Log】开关（需求十一）
// ============================================================
section('7. UI 日志与 Log 开关');
g.draw();
var lb = g.btnLog();
check('7.1 Log 按钮有坐标', !!lb && lb.x !== undefined, JSON.stringify(lb));
check('7.2 默认隐藏', g.uiLogVisible() === false);
var n0 = g.logHistory().length;
g.toggleUiLog();
check('7.3 切换后显示', g.uiLogVisible() === true);
check('7.4 切换不影响日志记录', g.logHistory().length >= n0, n0 + '->' + g.logHistory().length);
var beforeTxt = texts().length;
g.draw();
var afterTxt = texts().length;
check('7.5 打开后画出更多文字(面板内容)', afterTxt > beforeTxt, beforeTxt + '->' + afterTxt);
g.toggleUiLog();
check('7.6 可再次隐藏', g.uiLogVisible() === false);
var b2 = texts().length;
g.draw();
check('7.7 隐藏后不再画面板', texts().length - b2 < afterTxt - beforeTxt, 'delta=' + (texts().length - b2));

// ============================================================
// 8. 结算画面（需求十）
// ============================================================
section('8. 结算画面');
var stEnd = SB.build({
  handMap: { A: [], B: [], C: [], D: [], E: [] },
  table: [], lastPlayer: 'A', 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
  mode: '2V3_暗打'
});
g.__setState(stEnd, { clearLog: true, human: 'D' });
g.gameState().phase = 'GAME_END';
g.draw();
var sd = g.settlementData();
check('8.1 结算数据可取', !!sd && !!sd.res, JSON.stringify(sd && sd.res));
var tt = texts().join('|');
check('8.2 画出「本局结束」', tt.indexOf('本局结束') >= 0, tt.slice(0, 120));
check('8.3 画出五人', ['甲', '乙', '丙', '丁', '戊'].every(function (n) { return tt.indexOf(n) >= 0; }),
  tt.slice(0, 160));
check('8.4 结算阶段按钮是「下一局」',
  g.uiButtons().map(function (b) { return b.id; }).indexOf('newGame') >= 0,
  g.uiButtons().map(function (b) { return b.id; }).join(','));

// ============================================================
// 9. 【下一局】重置
// ============================================================
section('9. 下一局重置');
g.setHumanPlayer('B');
g.selectedCards().push('x');
g.newGame();
check('9.1 真人重置回丁位', g.getHumanPlayer() === 'D', g.getHumanPlayer());
check('9.2 选牌已清空', g.selectedCards().length === 0, 'sel=' + g.selectedCards().length);
check('9.3 回到发牌阶段', g.gameState().phase === 'LIANG_A', g.gameState().phase);
check('9.4 日志已重置并重新记录', g.logHistory().length > 0 && g.logHistory()[0].indexOf('对局初始化') >= 0,
  g.logHistory()[0]);
// [fix] 原断言漏算了**底牌**: 5 人各 21 张 = 105, 另有 3 张底牌才凑齐 108。
//   用 SB.countAll (它含 p.底牌) 而不是自己求和。
check('9.5 牌张守恒 108', SB.countAll(g.gameState()) === 108, 'count=' + SB.countAll(g.gameState()));

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('FAILED:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed > 0 ? 1 : 0);