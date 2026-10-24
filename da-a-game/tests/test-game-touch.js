// tests/test-game-touch.js — 触摸坐标 → 牌 ID 映射正确性
//
// 动机: 触摸映射类 bug 在微信 IDE 里极难稳定复现 (手速/手抖/牌多时遮挡),
//       但完全可以自动化。这类 bug 一旦存在, 玩家点 A 位置会选中 B 牌,
//       却极难归因。
//
// 验证链路: 几何 → 命中测试 → 选择/取消 → doPlay 实际打出的牌
//
// 依赖的 hitbox 几何 (draw(), 约 L182):
//   cardW=24, cardH=42, cardGap=1, 居中, cardY = H * 0.42
//   x = startX + k * (cardW + cardGap)   => 相邻 hitbox 间距 25, 宽 24, 不重叠
//   仅在 currentPlayer === humanPlayer 且 phase === PLAY 时注入
var mock = require('./mock-wx.js');
var m = mock.install({ width: 800, height: 400 });
var g = require('../game.js');
var SB = require('./lib/state-builder.js');
var { identifyHand, HAND_TYPES } = require('../src/hand-types.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var C = SB.C;
var W = 800, H = 400;

// 构造一个确定性局面: A 手上含指定牌 (构造器会补齐到 §2.2 的 22 张),
// 因此期望的 hitbox 数量应以【实际手牌数】为准, 而非传入的张数。
function scenario(cards) {
  var st = SB.build({ handMap: { A: cards }, table: [], lastPlayer: 'B' });
  g.__setState(st, { currentPlayer: 'A', human: 'A' });
  g.draw();                                    // 建立 hitbox
  return st;
}
function hbs() { return g.handCardHitboxes(); }
function sel() { return g.selectedCards().slice(); }
function tap(x, y) { mock.fireTouch(m.touchHandlers, x, y); }
function tapBox(hb) { tap(hb.x + hb.w / 2, hb.y + hb.h / 2); }

// ================= 1. hitbox 几何 =================
section('1. hitbox 几何');

var cards5 = [C('S', 13), C('H', 11), C('D', 10), C('C', 9), C('S', 8)];
scenario(cards5);
var boxes = hbs();
var handN = g.gameState().players[0].hand.length;

check('1.1 hitbox 数量 = 实际手牌数 (' + handN + ' 张)', boxes.length === handN,
  'hitboxes=' + boxes.length + ' hand=' + handN);
// [2026-10-24 UI 重做] 卡片尺寸随布局自适应 -> 断言**统一性**而不是写死的旧尺寸 24x42
  // [2026-10-24 UI 重做] 卡片尺寸随布局自适应 -> 断言**统一性**而不是写死的旧尺寸 24x42
  check("1.2 所有 hitbox 尺寸一致(不写死尺寸)", boxes.every(function (b) { return b.w === boxes[0].w && b.h === boxes[0].h; }),
  JSON.stringify(boxes[0]));
check('1.3 全部位于画布内', boxes.every(function (b) {
  return b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;
}));
  // [2026-10-24 UI 重做] 按用户参考图: 手牌固定**底部**、按钮在手牌**上方**。
  //   旧断言 y<H/2 是旧布局(手牌在中间)的代理, 已失效。
  //   真实不变量: **手牌区与按钮区不相交**(两区上下排列, 但不能重叠)。
  var btns = (typeof g.uiButtonBoxes === "function") ? g.uiButtonBoxes() : [];
  var rectHit = function (a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; };
  var intersect = 0;
  boxes.forEach(function (b) { btns.forEach(function (t) { if (rectHit(b, t)) intersect++; }); });
  check("1.4 手牌区与按钮区不重叠", intersect === 0, "intersect=" + intersect + " btnCount=" + btns.length);
{
  // 风险项: 22 张手牌 * 25px = 549px。若画布宽于比值则右侧溢出,
  // 右端若干张牌会跑出屏幕而点不到。横屏常见分辨率需都能容纳。
  var needW = 22 * 24 + 21 * 1;
  var landscape = [[667, 375], [812, 375], [844, 390], [926, 428]];  // iPhone SE~Max 横屏
  var overflow = landscape.filter(function (d) { return needW > d[0]; });
  check('1.5 22 张手牌在常见横屏宽度下均不溢出', overflow.length === 0,
    '需要宽度>=' + needW + 'px, 溢出分辨率=' + JSON.stringify(overflow));
}

{
  // 居中: 第一张左边界与最后一张右边界到画布两侧的距离应相等
  var first = boxes[0], last = boxes[boxes.length - 1];
  var leftGap = first.x - 0;
  var rightGap = W - (last.x + last.w);
  check('1.6 手牌居中 (左右留白近似相等)',
    Math.abs(leftGap - rightGap) <= 1, 'left=' + leftGap.toFixed(1) + ' right=' + rightGap.toFixed(1));
}
{
  // 关键: 相邻 hitbox 不得重叠 (重叠会导致命中测试取第一个, 点右牌却选中左牌)
  var overlap = 0;
  for (var i = 1; i < boxes.length; i++) {
    if (boxes[i].x < boxes[i - 1].x + boxes[i - 1].w) overlap++;
  }
  check('1.7 相邻 hitbox 无重叠', overlap === 0, 'overlapping pairs=' + overlap);
}

// ================= 2. 命中测试: 点哪张选中哪张 =================
section('2. 命中测试 — 点中心选中对应牌');

{
  scenario(cards5);
  boxes = hbs();
  var miss = [];
  for (var k = 0; k < boxes.length; k++) {
    g.selectedCards().length = 0;
    tapBox(boxes[k]);
    var s = sel();
    if (s.length !== 1 || s[0] !== boxes[k].cardId) {
      miss.push('k=' + k + ' 期望=' + boxes[k].cardId + ' 实得=' + JSON.stringify(s));
    }
  }
  check('2.1 逐张点击中心, 均选中对应那张牌', miss.length === 0, miss.join(' ; '));
}

{
  // 点每张牌的最左 1px 与最右 1px 都应命中同一张
  var bad = [];
  scenario(cards5);
  boxes = hbs();
  for (var k = 0; k < boxes.length; k++) {
    g.selectedCards().length = 0;
    tap(boxes[k].x + 0.5, boxes[k].y + boxes[k].h / 2);
    var sL = sel();
    g.selectedCards().length = 0;
    tap(boxes[k].x + boxes[k].w - 0.5, boxes[k].y + boxes[k].h / 2);
    var sR = sel();
    if (sL[0] !== boxes[k].cardId || sR[0] !== boxes[k].cardId) {
      bad.push('k=' + k + ' 左缘=' + sL[0] + ' 右缘=' + sR[0]);
    }
  }
  check('2.2 每张牌的左右边缘也命中同一张 (无 off-by-one)', bad.length === 0, bad.join(' ; '));
}

{
  // [2026-10-24 UI 重做] 新设计里命中区**首尾相接铺满整排手牌**, 不再有"牌与牌之间的间隙"
  //   这个死区 —— 每一像素都恰好属于一张牌。
  //   所以旧断言的前提消失, 换成真实不变量: **手牌条之外点击不选中任何牌**。
  scenario(cards5);
  boxes = hbs();
  tap(boxes[0].x + boxes[0].w / 2, H - 5);   // 手牌条下方(按钮行之上/之下, 非手牌区)
  check("2.3 点在手牌条之外 -> 不选中", sel().length === 0, "selected=" + JSON.stringify(sel()));
  // 附加: 相邻命中区必须首尾相接(无死区、无重叠)
  var gapCount = 0, overlapCount = 0;
  for (var gi = 1; gi < boxes.length; gi++) {
    var d = boxes[gi].x - (boxes[gi - 1].x + boxes[gi - 1].w);
    if (d > 0.01) gapCount++;
    if (d < -0.01) overlapCount++;
  }
  check("2.3b 相邻命中区首尾相接(无死区无重叠)", gapCount === 0 && overlapCount === 0,
    "gaps=" + gapCount + " overlaps=" + overlapCount);
  check('2.3 点在手牌间隙 -> 不选中', sel().length === 0, 'selected=' + JSON.stringify(sel()));
}

{
  // 点手牌区上方/下方 -> 不应选中
  scenario(cards5);
  boxes = hbs();
  tap(boxes[0].x + 5, boxes[0].y - 10);
  var above = sel().length;
  tap(boxes[0].x + 5, boxes[0].y + boxes[0].h + 10);
  check('2.4 点在手牌区外 -> 不选中', above === 0 && sel().length === 0,
    'above=' + above + ' below=' + sel().length);
}

// ================= 3. 选择 / 取消 / 多选 =================
section('3. 选择、取消与多选');

{
  scenario(cards5);
  boxes = hbs();
  tapBox(boxes[0]);
  tapBox(boxes[1]);
  check('3.1 连续点两张 -> 两张均选中', sel().length === 2, JSON.stringify(sel()));
  tapBox(boxes[0]);
  check('3.2 再点已选中的那张 -> 取消选中', sel().length === 1 && sel()[0] === boxes[1].cardId,
    JSON.stringify(sel()));
  tapBox(boxes[1]);
  check('3.3 全部取消', sel().length === 0, JSON.stringify(sel()));
}

{
  scenario(cards5);
  boxes = hbs();
  for (var k = 0; k < 3; k++) tapBox(boxes[k]);
  check('3.4 可多选 3 张', sel().length === 3, JSON.stringify(sel()));
  check('3.5 选中项互不重复', new Set(sel()).size === 3, JSON.stringify(sel()));
}

// ================= 4. 完整链路: 点击 -> doPlay 打出正确的牌 =================
section('4. 完整链路 — 点击选牌后 doPlay 打出对应的牌');

{
  // 手上有一对3: 点这两张 -> 出牌后手牌应恰少这两张, 且该对子已离开手牌
  var st = scenario([C('S', 3), C('H', 3), C('D', 7), C('C', 9), C('S', 10)]);
  g.draw();
  boxes = hbs();

  // 找到那两张 3 的 hitbox (hitbox 顺序按牌力降序, 与手牌存储顺序无关)
  var byId = {};
  st.players[0].hand.forEach(function (c) { byId[c.id] = c; });
  var targetBoxes = boxes.filter(function (b) { return byId[b.cardId] && byId[b.cardId].rank === 3; });
  check('4.1 找到两张 3 的 hitbox', targetBoxes.length === 2, 'n=' + targetBoxes.length);

  var selectedIds = targetBoxes.map(function (b) { return b.cardId; });
  check('4.2 这两张 3 点数相同 (应构成对子)',
    selectedIds.every(function (id) { return byId[id].rank === 3; }));
  check('4.3 两张花色不同', byId[selectedIds[0]].suit !== byId[selectedIds[1]].suit,
    byId[selectedIds[0]].suit + ' vs ' + byId[selectedIds[1]].suit);

  targetBoxes.forEach(tapBox);
  check('4.4 点击后两张 3 均被选中', sel().length === 2, JSON.stringify(sel()));

  var before = g.gameState().players[0].hand.length;
  g.doPlay();
  var after = g.gameState().players[0].hand.length;

  check('4.5 doPlay 后手牌恰减 2', before - after === 2, 'before=' + before + ' after=' + after);
  check('4.6 点选的那两张 3 已离手', selectedIds.every(function (id) {
    return !g.gameState().players[0].hand.some(function (x) { return x.id === id; });
  }));
  console.log('   [信息] 打出的牌型=' + (function () {
    var s = g.gameState();
    var found = (s.table || []).concat(s.discarded || []).filter(function (c) {
      return selectedIds.indexOf(c.id) >= 0;
    });
    return found.length === 2 ? identifyHand(found).type : '(未找到)';
  })());
}

// ================= 5. 仅人类回合注入 hitbox =================
section('5. hitbox 仅在人类回合注入 (§14 防误触)');

{
  var st = SB.build({ handMap: { A: cards5 }, table: [], lastPlayer: 'B' });
  // AI 回合
  g.__setState(st, { currentPlayer: 'B', human: 'A' });
  g.draw();
  check('5.1 AI 回合不注入 hitbox', hbs().length === 0, 'n=' + hbs().length);

  // 点击也不应改变选择
  tap(W / 2, H * 0.42 + 21);
  check('5.2 AI 回合点击不产生选择', sel().length === 0, JSON.stringify(sel()));

  // 非 PLAY 阶段
  st.phase = 'GAME_END';
  g.__setState(st, { currentPlayer: 'A', human: 'A' });
  g.draw();
  check('5.3 GAME_END 阶段不注入 hitbox', hbs().length === 0, 'n=' + hbs().length);
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
mock.uninstall();
process.exit(failed > 0 ? 1 : 0);