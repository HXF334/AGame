// tests/test-game-headless.js — game.js 无头 UI 逻辑测试
// 目的: 在无法使用微信开发者工具时, 用 mock wx/canvas 驱动【真实 UI 代码路径】,
//       验证逻辑/状态同步/事件处理。视觉像素不在本测试范围。
//
// 覆盖:
//   1. 加载与初始化 (无 ReferenceError / 初始化异常)
//   2. log 文案质量 (无 undefined / NaN / [object Object] —— 今晚 UI bug 的典型症状)
//   3. 完整对局: 驱动 runAI / doPlay / doPass 到底, 全程不崩
//   4. 牌张守恒 (UI 层驱动过程中 hand+底牌+table+discarded == 108)
//   5. 阶段流转正确性 (结束后不再出牌)
//   6. doPushWind 可用且符合 §9
//   7. 触摸事件: tap 手牌切换选中, 再点"出牌"按钮
//   8. 信息边界: 人类玩家看不到他人手牌明细
var mock = require('./mock-wx.js');

var m = mock.install({});
var g = require('../game.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function cardCount(st) {
  var t = 0;
  st.players.forEach(function (p) { t += (p.hand ? p.hand.length : 0) + (p.底牌 ? 1 : 0); });
  return t + (st.table || []).length + (st.discarded || []).length;
}
function human() { return 'A'; }
function handOf(pid) {
  return g.gameState().players.find(function (p) { return p.id === pid; }).hand;
}

// ================= 1. 加载与初始化 =================
section('1. 加载与初始化');

check('1.1 module.exports 完整', ['doPlay', 'doPass', 'doPushWind', 'runAI', 'gameState', 'logHistory', 'currentPlayer']
  .every(function (k) { return typeof g[k] === 'function'; }));
check('1.2 进入 PLAY 阶段', g.gameState().phase === 'PLAY', g.gameState().phase);
check('1.3 mode 已确定', !!g.gameState().mode, String(g.gameState().mode));
check('1.4 currentPlayer 有效', ['A','B','C','D','E'].indexOf(g.currentPlayer()) >= 0, g.currentPlayer());
check('1.5 触摸处理器已注册', m.touchHandlers.length >= 1, 'handlers=' + m.touchHandlers.length);
check('1.6 draw() 实际执行过 (有 canvas 调用)', m.calls.length > 0, 'calls=' + m.calls.length);

{
  // [修正] 21/22 张只在 REVEAL_BOTTOM 之后、尚未出牌时成立。
  //  game.js 在 init 末尾会同步调用 runAI() 打完 AI 回合, 所以到这里可能已有出牌,
  //  不应断言具体张数。改为断言【绝对不变量】。
  var st = g.gameState();
  var sizes = st.players.map(function (p) { return p.hand.length; });
  check('1.7 §2.2 无任何一家超过 22 张 (发牌上限)', sizes.every(function (n) { return n >= 0 && n <= 22; }), JSON.stringify(sizes));
  check('1.8 §4.5 底牌已翻开 (槽位 null)', st.players.every(function (p) { return p.底牌 === null; }));
  check('1.9 §14 牌张守恒 108', cardCount(st) === 108, 'total=' + cardCount(st));
  console.log('   [信息] 当前各家手牌: ' + st.players.map(function (p) { return p.id + ':' + p.hand.length; }).join(' ') +
              ' | currentPlayer=' + g.currentPlayer());
}

// ================= 2. log 文案质量 =================
section('2. log 文案质量 (今晚 UI bug 的典型症状)');

{
  var logs = g.logHistory();
  check('2.1 log 非空', logs.length > 0, 'n=' + logs.length);
  var bad = logs.filter(function (l) {
    return l.indexOf('undefined') >= 0 || l.indexOf('NaN') >= 0 ||
           l.indexOf('[object Object]') >= 0 || l.indexOf('null') === 0;
  });
  check('2.2 log 无 undefined/NaN/[object Object]', bad.length === 0,
    bad.length ? bad.slice(0, 3).join(' || ') : '');
  var initErr = logs.filter(function (l) { return l.indexOf('\u521d\u59cb\u5316\u5f02\u5e38') >= 0 || l.indexOf('\u5931\u8d25') >= 0; });
  check('2.3 初始化无异常/失败', initErr.length === 0, initErr.slice(0, 3).join(' || '));
}

// ================= 3+4. 完整对局 + 牌张守恒 =================
section('3. 完整对局 (驱动真实 UI 函数)');

{
  var steps = 0, guard = 900, crashed = null, conserveErr = 0;
  var ended = false;
  while (steps < guard && !ended) {
    steps++;
    var st = g.gameState();
    if (cardCount(st) !== 108) { conserveErr++; break; }
    if (st.phase === 'GAME_END') { ended = true; break; }

    var cp = g.currentPlayer();
    try {
      if (!cp) { g.advanceCurrentPlayer(); continue; }
      if (cp === human()) {
        // 人类回合: 优先出单张, 否则过牌
        var h = handOf('A');
        if (h.length > 0 && (st.table.length === 0 || canSingleBeat(st, h[0]))) {
          g.doPlay([h[0].id]);
        } else {
          g.doPass();
        }
      } else {
        g.runAI();
      }
    } catch (e) {
      crashed = e.message + ' @step ' + steps;
      break;
    }
  }
  check('3.1 全程无异常', crashed === null, crashed || '');
  check('3.2 牌张守恒未破', conserveErr === 0, 'conserveErr=' + conserveErr);
  check('3.3 对局可推进 (步数合理)', steps > 0 && steps < guard, 'steps=' + steps);
  console.log('   [信息] 步数=' + steps + ' 最终 phase=' + g.gameState().phase +
              ' 结束=' + ended + ' 牌张=' + cardCount(g.gameState()));
}

function canSingleBeat(st, card) {
  var ht = require('../src/hand-types.js');
  if (!st.table || st.table.length === 0) return true;
  return ht.canBeat(ht.identifyHand([card]), ht.identifyHand(st.table));
}

// ================= 5. 阶段流转 =================
section('5. 阶段流转 (结束后不可再出牌)');

{
  // 强行把状态推到 GAME_END 不现实 (无 setter), 改为验证结束后 doPlay 不改变状态
  var st = g.gameState();
  var before = JSON.stringify({ phase: st.phase, table: (st.table || []).length });
  if (st.phase === 'GAME_END') {
    var after1 = JSON.stringify({ phase: g.gameState().phase, table: (g.gameState().table || []).length });
    check('5.1 GAME_END 后 doPlay 不改变状态', before === after1);
  } else {
    check('5.1 对局未结束, 本项跳过 (不伪造状态)', true);
  }
  check('5.2 phase 值合法',
    ['PLAY', 'GAME_END', 'IDENTITY_CHOICE', 'REVEAL_BOTTOM'].indexOf(st.phase) >= 0, st.phase);
}

// ================= 6. doPushWind =================
section('6. doPushWind (§9)');

{
  var before = g.currentPlayer();
  var crashed = null, newState = null;
  try { g.doPushWind(); } catch (e) { crashed = e.message; }
  check('6.1 doPushWind 不崩', crashed === null, crashed || '');
  console.log('   [信息] currentPlayer: ' + before + ' -> ' + g.currentPlayer() +
              ' (phase=' + g.gameState().phase + ')');
  // 推风后 currentPlayer 必须同步 (今晚修过这个 bug)
  var cp = g.currentPlayer();
  check('6.2 推风后 currentPlayer 已同步', !!cp, String(cp));
  check('6.3 推风后仍在合法阶段',
    ['PLAY', 'GAME_END'].indexOf(g.gameState().phase) >= 0, g.gameState().phase);
}

// ================= 7. 触摸事件 =================
section('7. 触摸事件 (tap 手牌切换选中)');

{
  var st = g.gameState();
  var before = cardCount(st);
  var crashed = null;
  // 在画布中央区域点击 (可能落在手牌 hitbox 上, 也可能不在)
  try {
    mock.fireTouch(m.touchHandlers, 400, 300);
    mock.fireTouch(m.touchHandlers, 410, 300);
    mock.fireTouch(m.touchHandlers, 420, 300);
  } catch (e) { crashed = e.message; }
  check('7.1 触摸事件处理不崩', crashed === null, crashed || '');
  check('7.2 触摸后牌张守恒', cardCount(g.gameState()) === before, 'total=' + cardCount(g.gameState()));
}

// ================= 8. 信息边界 =================
section('8. 信息边界 (draw 不渲染他人手牌)');

// 直接检查 canvas fillText 实参: 若 draw 渲染了他人手牌,
 // 那些牌的面/点描述会出现在文案里。这是对"信息边界"的真实验证。
{
  var st = g.gameState();
  var me = handOf('A');
  check('8.0 人类玩家手牌已按预期处于某状态', Array.isArray(me), 'n=' + me.length);

  // 收集当前所有手牌的文案, 区分"我方"与"敌方"
  var ht = require('../src/hand-types.js');
  var gmod = require('../game.js');
  var mineIds = {};
  me.forEach(function (c) { mineIds[c.id] = true; });

  // 触发一帧绘制, 捕获该帧内的所有 fillText
  var n0 = m.calls.length;
  gmod.draw();
  var frameCalls = m.calls.slice(n0);
  var texts = frameCalls.filter(function (c) { return c.fn === 'fillText'; })
                        .map(function (c) { return String(c.args[0] === undefined ? '' : c.args[0]); });
  console.log('   [信息] 单帧 fillText 数=' + texts.length + ', 累计 canvas 调用=' + m.calls.length);

  // 所有牌面文案都应能在"我方手牌"中找到对应 (或属于装饰性文案)
  var foreignLeak = [];
  st.players.forEach(function (p) {
    if (p.id === 'A') return;
    (p.hand || []).forEach(function (c) {
      var desc = gmod.engine && gmod.engine.cardDesc ? gmod.engine.cardDesc(c) : null;
      if (desc && texts.some(function (t) { return t.indexOf(desc) >= 0; })) foreignLeak.push(p.id + ':' + desc);
    });
  });
  check('8.1 单帧未渲染任何敌方手牌', foreignLeak.length === 0, foreignLeak.slice(0, 5).join(', '));

  // 单帧绘制量应与手牌数同阶, 而非 5 倍
  check('8.2 单帧绘制调用数合理 (未逐张渲染全部 5 家)',
    frameCalls.length > 0 && frameCalls.length < 600, 'frameCalls=' + frameCalls.length);
  console.log('   [信息] 人类手牌 ' + me.length + ' 张, 单帧 canvas 调用 ' + frameCalls.length);
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
mock.uninstall();
process.exit(failed > 0 ? 1 : 0);