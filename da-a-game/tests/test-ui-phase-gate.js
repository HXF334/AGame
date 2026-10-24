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
// [2026-10-24 用户修改] 真人座位**开局随机**, 不再固定丁位
check('1.1 真人在 A~E 之间(开局随机)', ['A','B','C','D','E'].indexOf(g.getHumanPlayer()) >= 0, g.getHumanPlayer());
check('1.2 defaultHuman 与当前真人一致', g.defaultHuman() === g.getHumanPlayer(), g.defaultHuman());
check('1.3 座位表里标出了真人', g.logHistory().join('').indexOf('(真人)') >= 0, g.getHumanPlayer());

// ============================================================
// 2. 发牌后阶段拆分 + 自动推进
// ============================================================
section('2. 阶段拆分与自动推进');
// [2026-10-24 用户修改] 真人座位**随机**, 未必手里有 A;
//   没有 A 时按需求 4: AI 亮A -> 自动推进到 PLAY(不再停在 LIANG_A)。
//   本节要测「真人做亮A决策」, 所以换个座位重开直到真人手里有 A(消除随机性)。
//   注意退出条件必须是 kind==='LIANG_A': 只是「有 choice」不够 ——
//   真人没 A 时 AI 会亮A, 闸门可能停在**反A**决策上, 那时 phase 不是 LIANG_A。
for (var _try = 0; _try < 60; _try++) {
  var _gi = g.gateInfo();
  if (_gi && _gi.choice && _gi.choice.kind === 'LIANG_A') break;
  g.newGame();
}
var gi = g.gateInfo();
check('2.1 发牌后停在 LIANG_A', g.gameState().phase === 'LIANG_A', g.gameState().phase);
check('2.2 闸门共 6 档', gi.total === 6, 'total=' + gi.total);
check('2.3 下一步是强制排查', gi.stage === 'FORCED_CHECK', gi.stage);
check('2.4 有待决策(亮A)', !!gi.choice, JSON.stringify(gi.choice));
check('2.5 决策类型是亮A', gi.choice && gi.choice.kind === 'LIANG_A', JSON.stringify(gi.choice));
check('2.6 资格由引擎判定(带 reason)', !!(gi.choice && gi.choice.reason), JSON.stringify(gi.choice));

// 自动推进在**有待决策且资格具备**时必须停下(不许跳过真人决策)
var blocked = g.gateAutoAdvance();
if (gi.choice && gi.choice.eligible) {
check('2.7 有资格时自动推进被阻止(不许跳过真人决策)', blocked === false, 'blocked=' + blocked);
  check('2.8 阶段未推进', g.gameState().phase === 'LIANG_A', g.gameState().phase);
} else {
check('2.7b 无资格时自动推进', blocked === true, 'blocked=' + blocked);
}

// 做完决策后【下】才放行
if (gi.choice && gi.choice.eligible) {
  var idxBefore = gi.idx;
  g.humanLiangA(false);
// [2026-10-24 契约变更] 决策后**自动推进**到下一档(可能又出现新决策),
//   所以 gateChoice 不再是 null, 但档位必须前进。
check('2.9 决策被消费后已自动推进(档位前进)', g.gateInfo().idx > idxBefore,
  'before=' + idxBefore + ' now=' + g.gateInfo().idx);
  check('2.10 日志含「不亮A」', logStr().indexOf('不亮A') >= 0);
var moved = g.gateAutoAdvance();
// 自动推进停在下一个决策点是**正常**的(那就是要真人再决策一次)
check('2.11 自动推进到下一决策点或结束', g.gateInfo().idx >= idxBefore, 'idx=' + g.gateInfo().idx);
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
check('4.1b **【下】按钮已删除**(各阶段自动推进)',
  g.uiButtons().every(function (b) { return b.id !== 'next'; }),
  g.uiButtons().map(function (b) { return b.id; }).join(','));
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
// [2026-10-24 用户要求] **删掉 Log 按钮 + 日志面板**
//   原因: 它压住了微信右上角的胶囊按钮。logHistory 仍在记(控制台可看), 只是不再上屏。
//   所以原第 7 节(测面板显隐)的前提**已不存在** —— 换成锁住新契约: 画面上不得再有 Log。
section('7. Log 按钮已移除');
g.draw();
var allTxt7 = texts().join('|');
check('7.1 画面上不再出现 Log 文字', allTxt7.indexOf('Log') < 0, allTxt7.slice(0, 120));
check('7.2 按钮列表里没有 log', g.uiButtons().map(function (b) { return b.id; }).indexOf('log') < 0,
  g.uiButtons().map(function (b) { return b.id; }).join(','));
check('7.3 日志仍然在记录(只是不上屏)', g.logHistory().length > 0, 'n=' + g.logHistory().length);

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
// [2026-10-24 用户修改] 新局重置真人座位(随机), 仍在 A~E
check('9.1 新局重置后真人座位合法', ['A','B','C','D','E'].indexOf(g.getHumanPlayer()) >= 0, g.getHumanPlayer());
check('9.2 选牌已清空', g.selectedCards().length === 0, 'sel=' + g.selectedCards().length);
// [2026-10-24] 各阶段**自动推进**: 真人手里有 A -> 停在 LIANG_A 等真人决策;
//   没有 A -> AI 依次亮A -> 继续推进到后续阶段。所以「发牌阶段」**不是唯一落点**,
//   断言固定 phase 就会随机翻车(这正是 9.3 flaky 的原因)。
//   真实不变量: **新局重新发牌(阶段链从头开始)**, 且不是上一局的残留。
var log9 = g.logHistory().join('\n');
check('9.3 新局重新发牌(阶段链从头开始, 非上一局残留)',
  log9.indexOf('发牌完成') >= 0 && g.gameState().phase !== 'GAME_END',
  'phase=' + g.gameState().phase);
check('9.4 日志已重置并重新记录', g.logHistory().length > 0 && g.logHistory()[0].indexOf('对局初始化') >= 0,
  g.logHistory()[0]);
// [fix] 原断言漏算了**底牌**: 5 人各 21 张 = 105, 另有 3 张底牌才凑齐 108。
//   用 SB.countAll (它含 p.底牌) 而不是自己求和。
check('9.5 牌张守恒 108', SB.countAll(g.gameState()) === 108, 'count=' + SB.countAll(g.gameState()));

// ============================================================
// 10. 回归: 「phase=PLAY 但 currentPlayer=null」死锁
//    [P0 2026-10-24 00:09 用户实测] 引擎在 IDENTITY 阶段结束就把 phase 变成 PLAY,
//    而 currentPlayer 只在 PLAY 档设置; 同时 PLAY 阶段【下】按钮消失 ->
//    PLAY 档永远到不了 -> 按钮全灰 + AI 不出手 + 切到谁都不能出。
//    本节用**独立 module 实例**跑, 避免与前面的用例互相污染状态。
// ============================================================
section('10. 出牌阶段死锁回归');
(function () {
  // 清掉模块缓存 -> 拿到一个全新的 game 实例(mock 已装, 故 ctx 存在, AI 会真的出手)
  delete require.cache[require.resolve('../game.js')];
  var g2 = require('../game.js');
  g2.setHumanPlayer('D');

  var gi2 = g2.gateInfo();
  if (gi2.choice && gi2.choice.kind === 'LIANG_A' && gi2.choice.eligible) {
    g2.humanLiangA(false);      // 真人选择不亮A -> 强制排查由别人被动亮牌
  }
// [fix 2026-10-24] 原来用裸 gateNext() 循环, 但它在有待决策时会返回 false
  //   (需求四: 不许【下】跳过真人决策)。canFanA 改成「任意花色都可以」后,
  //   真人持双大A时反A决策会正确出现 -> 裸循环卡死。改用 drive 助手(它处理决策)。
  var drv = g2.__driveGateToPlay({});

  check('10.1 能进入 PLAY', g2.gameState().phase === 'PLAY', g2.gameState().phase);
  check('10.2 currentPlayer 非 null(死锁核心)', !!g2.currentPlayer(), String(g2.currentPlayer()));
  check('10.3 闸门已跑完', g2.gateInfo().idx === g2.gateInfo().total, JSON.stringify(g2.gateInfo()));
  check('10.4 首出权日志已出', g2.logHistory().join('').indexOf('首出权') >= 0);
  // [fix] 不能断言「AI 一定出手」: 若真人自己就是主A(强制排查到真人),
  //   determineFirstPlayer 直接返回真人 -> 真人先手, AI 还没轮到, 日志里自然没有 AI 动作。
  //   真正要锁的不变量: **要么 AI 已出手, 要么已轮到真人**(两者都说明没卡死)。
  var logs2 = g2.logHistory().join('\n');
  var aiActed = /AI /.test(logs2);
  var humanTurn = g2.currentPlayer() === g2.getHumanPlayer();
  check('10.5 AI 已出手 或 已轮到真人(两者都说明没卡死)',
    aiActed || humanTurn, 'cp=' + g2.currentPlayer() + ' aiActed=' + aiActed);

  g2.draw();
  var bs = g2.uiButtons();
  var pb = bs.filter(function (b) { return b.id === 'play'; })[0];
  var qb = bs.filter(function (b) { return b.id === 'pass'; })[0];
  check('10.6 有出牌按钮', !!pb, JSON.stringify(bs.map(function (b) { return b.id; })));
  check('10.7 有过牌按钮', !!qb);
  var onTurn = g2.currentPlayer() === g2.getHumanPlayer();
  check('10.8 轮到真人时出牌可用', pb && pb.enabled === onTurn,
    'cp=' + g2.currentPlayer() + ' human=' + g2.getHumanPlayer() + ' enabled=' + (pb && pb.enabled));
  check('10.9 轮到真人时过牌可用', qb && qb.enabled === onTurn);

  // 切到非当前行动者 -> 按钮应禁用(证明可用性确实随 currentPlayer 变)
  if (g2.currentPlayer() && g2.currentPlayer() !== 'A') {
    g2.setHumanPlayer('A');
    var pb2 = g2.uiButtons().filter(function (b) { return b.id === 'play'; })[0];
    check('10.10 切到非行动者后按钮禁用', pb2 && pb2.enabled === false,
      'cp=' + g2.currentPlayer() + ' enabled=' + (pb2 && pb2.enabled));
  }
})();

// ============================================================
// 11. 回归: 「phase=PLAY ⟹ currentPlayer 非 null」不变量 (跨多局)
//     覆盖两条进入 PLAY 的路径: 真人选次方身份 / 授权者自动选身份。
//     2026-10-24 用户实测: 走「真人选次方身份」那条路的局卡死了。
// ============================================================
section('11. phase=PLAY 不变量');
(function () {
  var N = 8;
  var bad = [], humanChose = 0;
  for (var it = 0; it < N; it++) {
    delete require.cache[require.resolve('../game.js')];
    var gi = require('../game.js');
    gi.setHumanPlayer('D');
    var ginfo = gi.gateInfo();
    if (ginfo.choice && ginfo.choice.kind === 'LIANG_A' && ginfo.choice.eligible) {
      gi.humanLiangA(false);
    }
    var gr = gi.__driveGateToPlay({});
    if (gi.gameState().phase === 'PLAY' && !gi.currentPlayer()) {
      bad.push('iter' + it + ' phase=PLAY 但 currentPlayer=null');
    }
    if (gi.logHistory().join('').indexOf('首出权') < 0) {
      bad.push('iter' + it + ' 缺「首出权」日志(PLAY 档没跑)');
    }
  }
  check('11.1 多局均满足 phase=PLAY ⟹ currentPlayer 非 null', bad.length === 0,
    bad.slice(0, 3).join(' ;; '));
  check('11.2 多局均已设首出权(PLAY 档都跑到)', bad.length === 0);
})();

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('FAILED:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed > 0 ? 1 : 0);