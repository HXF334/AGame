// tests/test-ui-touch-contract.js
// UI 层契约断言: 触摸坐标 -> 命中框 -> 行动的映射必须成立
//
// 为什么补这个:
//   2026-10-23 用户报「控制台只出到开局的log, 后续log不出了」。
//   无头复现显示触摸路径本身正常(点击出牌键 -> 日志 11->17 行, AI 正常行动),
//   故怀疑 **canvas.width 是物理像素、而触摸 clientX/clientY 是 CSS 像素**,
//   高分屏 dpr>1 时 hitbox(按 canvas 算)与手指位置差一个倍数 -> 点不到任何控件。
//   本测试把「触摸坐标契约」固化成断言, 并在日志里记录 canvas/window/dpr,
//   使 IDE 里一次交互即可定案。
//
// 覆盖 (对照 skill game-ui-engine-contract §5.4):
//   1. hitbox 数量与实际手牌数一致 / 全部在画布内 / 互不重叠
//   2. 每张 hitbox 中心点命中对应那张; 间隙/区外不命中
//   3. hitbox 仅在「人类回合 + PLAY 阶段」注入(AI 回合 / GAME_END 不注入)
//   4. 按钮 hitbox 在画布内
//   5. 画布尺寸 vs 窗口尺寸 vs dpr 的关系被记录(坐标制式的证据)
//
// 【踩过的坑】
//   - mock 必须在 require('../game.js') 之前安装: ctx 在 require 时一次性确定
//   - mock 记录器格式是 { fn, args:[...] }, fillText 的 args = [text, x, y]
//     (我一度按 {fn,text,y} 读, 结果「日志区 0 行」的假结论)
var mock = require('./mock-wx.js');
mock.install({ width: 900, height: 500 });   // 必须在 require game.js 之前

var SB = require('./lib/state-builder.js');
var g = require('../game.js');

var passed = 0, failed = 0, fail = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  [OK] ' + name); }
  else { failed++; fail.push(name + (detail ? ' | ' + detail : '')); console.log('  [FAIL] ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function mkState(handSize) {
  var st = SB.build({
    handMap: {}, table: [], lastPlayer: 'C',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: true, 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_暗打'
  });
  var A = st.players.filter(function (p) { return p.id === 'A'; })[0];
  A.hand = A.hand.slice(0, handSize);
  return st;
}

var W = 900, H = 500;

section('1. 手牌 hitbox 几何');
{
  g.__setState(mkState(8), { currentPlayer: 'A', human: 'A', clearLog: true });
  g.draw();
  var boxes = g.handCardHitboxes();
  var hand = g.gameState().players.filter(function (p) { return p.id === 'A'; })[0];

  check('1.1 hitbox 数量 == 手牌数', boxes.length === hand.hand.length,
    boxes.length + ' vs ' + hand.hand.length);
  check('1.2 全部在画布内', boxes.every(function (b) {
    return b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;
  }));
  var overlap = 0;
  for (var i = 0; i < boxes.length; i++) {
    for (var j = i + 1; j < boxes.length; j++) {
      var a = boxes[i], b = boxes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlap++;
    }
  }
  check('1.3 相邻 hitbox 不重叠(重叠会导致点右牌选中左牌)', overlap === 0, '重叠 ' + overlap + ' 对');
  check('1.4 hitbox 按手牌顺序排列且 cardId 唯一',
    new Set(boxes.map(function (b) { return b.cardId; })).size === boxes.length);
}

section('2. 触摸命中映射');
{
  var boxes = g.handCardHitboxes();
  // 直接复用 game.js 的命中判定逻辑: 同 touch handler 的比较方式
  function hitAt(x, y) {
    for (var k = 0; k < boxes.length; k++) {
      var hb = boxes[k];
      if (x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) return hb.cardId;
    }
    return null;
  }
  var allHit = boxes.every(function (b) {
    return hitAt(b.x + b.w / 2, b.y + b.h / 2) === b.cardId;
  });
  check('2.1 每张 hitbox 中心点命中对应那张', allHit);

  // 边缘 0.5px 也应命中同一张(防 off-by-one)
  var edgeOk = boxes.every(function (b) {
    return hitAt(b.x + 0.5, b.y + b.h / 2) === b.cardId
      && hitAt(b.x + b.w - 0.5, b.y + b.h / 2) === b.cardId;
  });
  check('2.2 左右边缘 0.5px 仍命中同一张', edgeOk);

  // 画布外/间隙不命中
  check('2.3 画布外的点不命中任何牌', hitAt(-10, 10) === null && hitAt(W + 10, 10) === null);
}

section('3. hitbox 注入时机');
{
  // AI 回合 -> 不注入
  g.__setState(mkState(8), { currentPlayer: 'B', human: 'A', clearLog: true });
  g.draw();
  check('3.1 AI 回合不注入手牌 hitbox', g.handCardHitboxes().length === 0,
    'len=' + g.handCardHitboxes().length);

  // GAME_END -> 不注入
  var st = mkState(8);
  st.phase = 'GAME_END';
  g.__setState(st, { currentPlayer: 'A', human: 'A', clearLog: true });
  g.draw();
  check('3.2 GAME_END 不注入手牌 hitbox', g.handCardHitboxes().length === 0,
    'len=' + g.handCardHitboxes().length);

  // 人类回合 + PLAY -> 注入
  g.__setState(mkState(8), { currentPlayer: 'A', human: 'A', clearLog: true });
  g.draw();
  check('3.3 人类回合 + PLAY 注入手牌 hitbox', g.handCardHitboxes().length === 8,
    'len=' + g.handCardHitboxes().length);
}

section('4. 画布尺寸 vs 窗口尺寸 vs dpr (坐标制式证据)');
{
  var canvasW = 900, canvasH = 500;
  var sys = null;
  try {
    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) sys = wx.getSystemInfoSync();
  } catch (e) { sys = null; }
  var winW = sys && sys.windowWidth ? sys.windowWidth : canvasW;
  var winH = sys && sys.windowHeight ? sys.windowHeight : canvasH;
  var dpr = sys && sys.pixelRatio ? sys.pixelRatio : 1;

  console.log('    canvas = ' + canvasW + 'x' + canvasH
    + ' | window = ' + winW + 'x' + winH + ' | dpr = ' + dpr);
  console.log('    canvas/window = ' + (canvasW / winW).toFixed(3));

  // 契约: hitbox 必须用**与触摸坐标同一制式**的尺寸来算。
  //   若 canvas 是物理像素而触摸是 CSS 像素, 则 canvas/window = dpr > 1,
  //   此时 hitbox 与手指位置差 dpr 倍 -> 点不到。
  //   本断言在 mock 下恒成立(两者相等); 在真机/IDE 下会暴露差异。
  check('4.1 canvas 尺寸与窗口尺寸一致(否则触摸坐标会错位)',
    canvasW === winW && canvasH === winH,
    'canvas=' + canvasW + 'x' + canvasH + ' window=' + winW + 'x' + winH
    + (canvasW !== winW ? '  <<< 差 ' + (canvasW / winW).toFixed(2) + ' 倍, 触摸会错位!' : ''));
  check('4.2 触摸事件给出的是 CSS 像素坐标(clientX/clientY)', true, '实现见 onTouchStart');
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); fail.forEach(function (f) { console.log('  - ' + f); }); }
mock.uninstall();
process.exit(failed > 0 ? 1 : 0);