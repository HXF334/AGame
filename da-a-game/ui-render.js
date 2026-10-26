// ui-render.js — 界面渲染层 v0.14.0
//
// [设计基线 2026-10-25] 用户真机截图 + 参照图(打大A)的**指定样式**:
//   牌面=大点数在上/大花色在下/无角标; 大小王=英文 JOKER 竖排(大王红/小王黑)
//   大A=淡黄底; 倒计时=按钮行中央正上方的金色闹钟
//   记牌器=固定长度居中, 可点图标展开/收起
//   敌友钮=每个**别人**头像左上角, 三态 ?/友/敌, 每人一套独立标记
//   各家最新出牌=只在自己座位前方, 中央不显示
//   座位=以真人为起点按逆时针(ids 顺序)环排
//   刘海屏=横屏刘海在左侧 -> 左右各留 6% 不放文字
//
// [不变式] 本文件**不含任何规则判断**: 合法性/牌型/计分全部来自引擎。
//   渲染层只负责"把状态画出来"。

var SEAT_IDS = ['A', 'B', 'C', 'D', 'E'];
var SUIT_CHAR = { H: '♥', D: '♦', C: '♣', S: '♠' };
var SEAT_COLOR = ['#4f8f5b', '#3f7fa8', '#a86a3f', '#8a5aa8', '#a85555'];
var RANKS_DESC = ['3', '2', 'A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4'];

// ===== 座位环排 =====
// 逆时针 = ids 顺序 A→B→C→D→E(=轮转顺序)。
//   左上 = 真人逆时针前驱第2位   左下 = 前驱第1位
//   右上 = 真人逆时针后继第2位   右下 = 后继第1位
// [用户 2026-10-25 举例] 真人=丙 -> 左甲乙 / 右丁戊; 真人=丁 -> 左乙丙 / 右戊甲
function seatOrder(humanId) {
  var idx = SEAT_IDS.indexOf(humanId);
  if (idx < 0) idx = 0;
  function at(k) { return SEAT_IDS[((idx + k) % 5 + 5) % 5]; }
  return { L1: at(-2), L2: at(-1), R1: at(2), R2: at(1) };  // L1=左上 L2=左下 R1=右上 R2=右下
}

// ===== 布局 =====
// ===== 布局常量(全部相对比例, 适配横屏) =====
function layout(W, H) {
  var vw = W || 844, vh = H || 390;
  var safe = vw * 0.06;                       // [刘海屏] 左右各 6% 不放文字
  var r = Math.round(vh * 0.052);
  return {
    vw: vw, vh: vh,
    safeL: safe, safeR: safe,
    top: { h: vh * 0.135 },
    table: { cx: vw * 0.5, cy: vh * 0.325, rx: vw * 0.40, ry: vh * 0.175 },
    // [2026-10-25] 座位往中间挪: 名字/牌数徽章要画在头像**外侧**, 需要 ~34px 文字宽度
    seats: [
      { x: safe + r + 44, y: vh * 0.215, side: 'L' },
      { x: safe + r + 44, y: vh * 0.405, side: 'L' },
      { x: vw - safe - r - 44, y: vh * 0.215, side: 'R' },
      { x: vw - safe - r - 44, y: vh * 0.405, side: 'R' }
    ],
    center: { x: vw * 0.5, y: vh * 0.315 },
    turn: { x: vw * 0.5, y: vh * 0.468 },      // [2026-10-25] 上移, 不与按钮行重叠
    btn: { y: vh * 0.560, h: vh * 0.100 },
    // [2026-10-25] 手牌上移, 避开手机底部横条
    hand: { y: vh * 0.700, maxW: vw * 0.70, cardH: vh * 0.188, ratio: 0.70 },
    me: { x: safe + r + 30, r: r, y: vh * 0.700 + vh * 0.200 * 0.42 },
    // [2026-10-25] 记牌器入口图标(顶部中央, 点击展开/收起)
    memo: { iconX: vw * 0.24, iconY: vh * 0.052, iconR: Math.round(vh * 0.026) }
  };
}

// 手牌几何: 命中区用**精确步长**(浮点不取整) -> 相邻命中区严格不重叠
// 手牌几何: 命中区用**精确步长**(浮点不取整) -> 相邻命中区严格不重叠
// [2026-10-25 用户] 牌之间的**间距固定不变**(不随牌数自适应):
//   按最多张数算一个 step; 牌变少时总宽度自然缩小, 整体居中
// 手牌几何: 命中区用**精确步长**(浮点不取整) -> 相邻命中区严格不重叠
// [2026-10-25 用户] 牌之间的**间距固定不变**(不随牌数自适应):
//   按最多张数算一个 step; 牌变少时总宽度自然缩小, 整体居中
//   总宽 = step*(n-1) + cardW —— **最后一张是完整牌宽**, 命中区要和这个对得上(否则不算居中)
// 手牌几何
// [2026-10-25 用户] 牌之间的**间距固定不变**(不随牌数自适应): 牌变少 -> 总宽缩小 -> 整体居中
// [2026-10-25] 步长必须是**整数**: 浮点步长会让相邻命中区边界抖动(被判定成重叠), 尺寸也不一致
//   命中区契约(test-game-touch): 数量=手牌数 / 全部等宽 / 相邻不重叠 / 外接盒居中
// 手牌几何
// [2026-10-25 用户] 牌之间的**间距固定不变**(不随牌数自适应): 牌变少 -> 总宽缩小 -> 整体居中
//   步长取**整数**(浮点会让相邻命中区边界抖动, 被判定成重叠)
//   命中区契约: 数量=手牌数 / 全部等宽 / 相邻不重叠 / 外接盒居中
function handLayout(n, m) {
  var cardH = m.hand.cardH;
  var cardW = Math.round(cardH * m.hand.ratio);
  var maxW = m.hand.maxW;
  var MAXN = 22;
  var step = Math.min(cardW, Math.round((maxW - cardW) / (MAXN - 1)));
  if (step < 8) step = 8;
  var totalW = n <= 1 ? cardW : step * n;
  return { cardW: cardW, cardH: cardH, step: step, x0: (m.vw - totalW) / 2, y: m.hand.y, n: n,
           totalW: totalW, lift: Math.round(cardH * 0.22) };
}

function buttonLayout(list, m) {
  var gap = Math.round(m.vw * 0.012);
  var h = Math.round(m.btn.h);
  var w = Math.max(58, Math.min(112, (m.vw - m.vw * 0.06 - gap * Math.max(0, list.length - 1)) / Math.max(1, list.length)));
  var totalW = w * list.length + gap * Math.max(0, list.length - 1);
  var x0 = (m.vw - totalW) / 2;
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    b.x = x0 + i * (w + gap); b.y = m.btn.y; b.w = w; b.h = h;
    out.push(b);
  }
  return out;
}

// ===== 绘制工具 =====
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); }
function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  if (ctx.ellipse) ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  else ctx.arc(x, y, rx, 0, Math.PI * 2);
  ctx.closePath();
}
function text(ctx, s, x, y, size, color, align, bold) {
  ctx.font = (bold ? 'bold ' : '') + size + 'px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

// ===== 牌桌 =====
function drawTable(ctx, m) {
  ctx.fillStyle = '#5e2417'; ctx.fillRect(0, 0, m.vw, m.vh);
  ctx.fillStyle = '#7a3220'; ctx.fillRect(0, 0, m.vw, m.vh * 0.66);
  var t = m.table;
  ellipse(ctx, t.cx, t.cy, t.rx, t.ry);
  ctx.fillStyle = '#a8472e'; ctx.fill();
  ctx.strokeStyle = '#d9a05b'; ctx.lineWidth = Math.max(2, m.vh * 0.008); ctx.stroke();
  ellipse(ctx, t.cx, t.cy, t.rx * 0.93, t.ry * 0.88);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = Math.max(1, m.vh * 0.004); ctx.stroke();
  text(ctx, '内蒙古打大 A', t.cx, t.cy + m.vh * 0.10, Math.max(11, Math.round(m.vh * 0.038)),
       'rgba(255,255,255,0.13)', 'center', true);
}

// ===== 顶栏 =====
// [N2] 测试模式(开发者工具/node) 显示 模式全名 + 阵营明细; 真机只显示 [明/暗] + [大A 花色]
// ===== 顶栏 =====
// [2026-10-25 用户] 顶栏只留两行, **不要再堆 5 个按钮**(挤在「大A」同一行, 字还乱)
//   第一行: 模式(测试=全名 / 正式=明暗) + 记牌器图标
//   第二行: 大A 花色; 测试模式额外显示**阵营明细**(主/次/抓), 按真人视角正确判定
// ===== 顶栏 =====
// [2026-10-25 用户] 顶栏只留两行, **不要再堆 5 个按钮**
//   第一行: 模式(测试=全名 / 正式=明暗)
//   第二行: 「大A 花色」 + 阵营明细(只留 主X / 次X, 隔两个空格)
//     次方**身份亮明** -> 和主方同色(黄); 未亮明 -> 浅灰
function drawTopBar(ctx, st, m, memoIcon) {
  var g = st.gameState;
  var h = m.top.h;
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(0, 0, m.vw, h);
  ctx.fillStyle = 'rgba(217,160,91,0.5)'; ctx.fillRect(0, h - 1, m.vw, 1);
  var fs = Math.max(10, Math.round(m.vh * 0.034));
  var x = m.safeL + 4;
  var y0 = h * 0.30, y1 = h * 0.70;
  if (st.testMode) {
    text(ctx, '模式 ' + (g.mode || '未定'), x, y0, fs, '#ffd98a', 'left', true);
  } else {
    var mode = g.mode || '';
    var bright = mode.indexOf('明打') >= 0 ? '明打' : (mode.indexOf('暗打') >= 0 ? '暗打' : (mode || '未定'));
    text(ctx, bright, x, y0, fs, '#ffd98a', 'left', true);
  }
  var zhu = g['主A'];
  var zhuTxt = zhu ? (SUIT_CHAR[zhu.suit] || zhu.suit) : '-';
  text(ctx, '大A ' + zhuTxt, x, y1, fs, '#ffd98a', 'left', true);
  if (st.testMode) {
    var camp = st.camps || {};
    var tx = x + fs * 3.4;                // 「大A 花色」后面隔一点
    if (camp.main) {
      var t1 = '主' + st.names[SEAT_IDS.indexOf(camp.main)];
      text(ctx, t1, tx, y1, fs, '#ffd98a', 'left', true);
      tx += fs * 2.4;                  // 主甲 -> 次乙 也收紧
    }
    if (camp.second) {
      var t2 = '次' + st.names[SEAT_IDS.indexOf(camp.second)];
      text(ctx, t2, tx, y1, fs, camp.secondOpen ? '#ffd98a' : '#bbbbbb', 'left', true);
    }
  }
  if (memoIcon) {
    ctx.fillStyle = st.memoOpen ? '#c8102e' : '#1e6091';
    circle(ctx, memoIcon.x, memoIcon.y, memoIcon.r); ctx.fill();
    ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 1.5;
    circle(ctx, memoIcon.x, memoIcon.y, memoIcon.r); ctx.stroke();
    text(ctx, '记', memoIcon.x, memoIcon.y, Math.max(9, Math.round(m.vh * 0.030)), '#ffffff', 'center', true);
  }
}

// ===== 记牌器(展开面板) =====
// 固定长度, 居中, 在顶栏下方浮层。数值 = 还没打出的张数。
// 顺序 = §6.2 单牌大小顺序: 大A > 大王 > 小王 > 3 > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4
// ===== 记牌器(展开面板) =====
// [2026-10-25 用户] **样式完全参照参考图**: 上排一列白底小牌面, 下排对应各点数的剩余张数
//   固定长度, 居中, 在顶栏下方浮层。数值 = 还没打出的张数。
//   顺序 = §6.2 单牌大小: 大A > 大王 > 小王 > 3 > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4
// 记牌器 —— 参照图3样式:
//   1) 右上角**浮层**(不是顶部横条)
//   2) 上排只写「什么牌」(大A/大王/小王/3/2/A/K/...)，**不画花色**
//   3) 下排只写剩余数字, 按花色着色(红桃/方块=红, 黑桃/梅花=黑)
//   4) 紧凑小格; 显示不下就自动缩小列宽
// 记牌器 —— 参照图3样式:
//   1) **只显示在顶部深棕色那一条**(顶栏)里, 不再压在牌桌上
//   2) 大A 用**花色**表示; 大王=红色 JOKER, 小王=黑色 JOKER(竖排)
//   3) 下面只写剩余数字, **黑色**
//   4) 整体缩小
// 记牌器 —— 参照图3样式, 并按用户要求继续压缩:
//   1) 只显示在**顶部深棕色那一条**(顶栏)里
//   2) 大A 用**主A 的花色**; 大王=红 JOKER, 小王=黑 JOKER(竖排, 更短更小)
//   3) 下面只写剩余数字, **灰色**
//   4) **不要黑边**: 面板半透明, 只留一条细灰线; 牌面浅灰无描边
function drawMemo(ctx, st, m) {
  if (!st.memoOpen) return;
  var items = st.memoItems || [];
  var n = items.length;
  if (!n) return;
  var topH = m.top.h;
  var cw = Math.round(m.vw * 0.022);
  var availW = m.vw - Math.round(m.vw * 0.04);
  if (n * cw > availW) cw = Math.max(8, Math.floor(availW / n));
  var cardW = cw;
  var cardH = Math.round(topH * 0.50);
  var numH = Math.round(topH * 0.26);
  var total = n * cw;
  var x0 = (m.vw - total) / 2;
  var y = Math.round(m.vh * 0.004);
  // 面板: 半透明底 + 一条细灰线(不要黑边)
  ctx.fillStyle = 'rgba(30,12,6,0.55)';
  rr(ctx, x0 - 3, y, total + 6, cardH + numH + 3, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(200,200,200,0.45)'; ctx.lineWidth = 1;
  rr(ctx, x0 - 3, y, total + 6, cardH + numH + 3, 3); ctx.stroke();
  var suit = st.mainAceSuit;
  for (var i = 0; i < n; i++) {
    var it = items[i];
    var cx = x0 + i * cw + cw / 2;
    // 上排: 浅灰小牌面(无描边)
    ctx.fillStyle = 'rgba(235,231,222,0.92)';
    rr(ctx, cx - cardW / 2 + 0.5, y + 1.5, cardW - 1, cardH, 2); ctx.fill();
    var lbl = it.label || '';
    if (lbl === '大A') {
      text(ctx, suit ? (SUIT_CHAR[suit] || '?') : '?', cx, y + 1.5 + cardH * 0.52,
        Math.max(8, Math.round(cardH * 0.56)), suitColor(suit), 'center', true);
    } else if (lbl === '大王' || lbl === '小王') {
      var jc = (lbl === '大王') ? '#c8102e' : '#333333';
      var letters = 'JOKER';
      var fs2 = Math.max(4, Math.round(cardH * 0.15));
      var lh2 = fs2 * 0.82;                       // 压缩行距 -> 更短
      var gh = lh2 * (letters.length - 1);
      var sy = y + 1.5 + cardH / 2 - gh / 2;
      for (var li = 0; li < letters.length; li++) {
        text(ctx, letters[li], cx, sy + li * lh2, fs2, jc, 'center', true);
      }
    } else {
      text(ctx, lbl, cx, y + 1.5 + cardH * 0.52,
        Math.max(7, Math.round(cardH * 0.50)), '#333333', 'center', true);
    }
    // 下排: 剩余数字(**灰色**)
    var nbY = y + 1.5 + cardH;
    text(ctx, String(it.value), cx, nbY + numH / 2,
      Math.max(7, Math.round(numH * 0.80)), '#999999', 'center', true);
  }
}

// ===== 敌友钮 =====
// [用户 2026-10-25] 每个**别人**头像左上角; 三态 ?/友/敌; 每人一套独立标记
function drawAllyMark(ctx, st, m, x, y, r, state) {
  var col = state === 'friend' ? '#2f6fb5' : (state === 'enemy' ? '#c8102e' : '#2f8f4f');
  var label = state === 'friend' ? '友' : (state === 'enemy' ? '敌' : '?');
  ctx.fillStyle = col;
  circle(ctx, x, y, r); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
  circle(ctx, x, y, r); ctx.stroke();
  text(ctx, label, x, y, Math.max(8, Math.round(m.vh * 0.026)), '#ffffff', 'center', true);
}

// ===== 玩家座位 =====
// 玩家座位: 真人以外的 4 人按逆时针环排填 4 个固定槽位(2 左 2 右)
// [2026-10-25] 名字/牌数/状态 -> 头像**外侧**; 出的牌 -> 头像**内侧**;
//   敌友钮 左左上/右右上; 大A图标 左右上/右左上; 大A图标只给真正的大A持有者
// 玩家座位: 真人以外的 4 人按逆时针环排填 4 个固定槽位(2 左 2 右)
// [2026-10-25] 名字/牌数 -> 头像**外侧**; 出的牌 &「不出」-> 头像**内侧**
//   敌友钮 左左上/右右上; 大A图标 左右上/右左上
// 玩家座位: 真人以外的 4 人按逆时针环排填 4 个固定槽位(2 左 2 右)
// [2026-10-25] 名字/牌数 -> 头像**外侧**; 出的牌 &「不出」-> 头像**内侧**
//   敌友钮在**玩家名上方**(名字和牌数下移, 不再被压住)
//   大A图标: 左右上/右左上; 多个时**横向排开不重合**, 整体往右
// 玩家座位: 真人以外的 4 人按逆时针环排填 4 个固定槽位(2 左 2 右)
// [2026-10-25] 名字/牌数 -> 头像**外侧**; 出的牌 &「不出」-> 头像**内侧**
//   敌友钮在**玩家名上方**(名字下移 + 钮上移, 两者错开不压)
//   大A图标: 用**自己花色**的颜色(红桃/方块红, 黑桃/梅花黑), 浅底深字
// 花色对应的显示色: 红桃/方块=红, 黑桃/梅花=黑
function suitColor(suit) {
  return (suit === 'H' || suit === 'D') ? '#c8102e' : '#1a1a1a';
}

// 玩家座位: 真人以外的 4 人按逆时针环排填 4 个固定槽位(2 左 2 右)
// [2026-10-26] 名字和牌数徽章**同一水平线**(垂直居中于头像),
//   敌友钮在名字的**斜上方外侧**(不压名字, 也不像叠罗汉)
// 玩家座位: 真人以外的 4 人按逆时针环排填 4 个固定槽位(2 左 2 右)
// [2026-10-26] 名字/牌数徽章**同一水平线**; 名字在徽章**外侧**(之前徽章盖住了名字!);
//   敌友钮在名字的**斜上方外侧**
// 玩家座位: 真人以外的 4 人按逆时针环排填 4 个固定槽位(2 左 2 右)
// [2026-10-26] 1) 头像下的「主方/次方」标签**删掉**(顶栏已有同一份信息, 重复且挤占位置)
//   2) 玩家名**最后画** -> 保证不会被徽章/敌友钮盖住
//   3) 「不出」只在 PLAY 阶段显示(开局亮A阶段的自动过牌不该显示)
// 玩家座位: 真人以外的 4 人按逆时针环排填 4 个固定槽位(2 左 2 右)
// [2026-10-26] 敌友钮 / 玩家名 / 牌数徽章 -> **竖排**:
//   三个元素**同一个 x**(垂直方向对齐), 整体**垂直居中**于头像
//   钮(上) / 名字(中) / 徽章(下); 「不出」在头像内侧; 名字最后画保证不被盖
function drawSeats(ctx, st, m) {
  var g = st.gameState;
  var r = Math.round(m.vh * 0.052);
  var scores = st.scores || {};
  var so = seatOrder(st.humanPlayer);
  var slots = { L1: m.seats[0], L2: m.seats[1], R1: m.seats[2], R2: m.seats[3] };
  var assign = {};
  assign[so.L1] = slots.L1; assign[so.L2] = slots.L2;
  assign[so.R1] = slots.R1; assign[so.R2] = slots.R2;
  var out = [], seatMap = {}, markHits = [];
  var myMarks = (st.marks || {})[st.humanPlayer] || {};
  var aceIconR = Math.round(m.vh * 0.019);
    var aceIconGap = Math.round(m.vh * 0.032);   // [2026-10-26] 两个图标贴紧(轻微重叠)
  var inPlay = (g.phase === 'PLAY');
  SEAT_IDS.forEach(function (pid) {
    if (pid === st.humanPlayer) return;
    var pos = assign[pid];
    if (!pos) return;
    seatMap[pid] = pos;
    var p = g.players.filter(function (x) { return x.id === pid; })[0];
    var isCur = st.currentPlayer === pid;
    var isPassed = inPlay && !!((st.uiPassed || {})[pid]);
    var isOut = p && p.hand && p.hand.length === 0;
    var rr_ = Math.round(r * (isCur ? 1.14 : 1));
    var cx = pos.x, cy = pos.y;
    var outw = pos.side === 'L' ? -1 : 1;
    var inw = -outw;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    circle(ctx, cx + 2, cy + 3, rr_ + 3); ctx.fill();
    ctx.fillStyle = SEAT_COLOR[SEAT_IDS.indexOf(pid)] || '#666';
    circle(ctx, cx, cy, rr_); ctx.fill();
    ctx.strokeStyle = isCur ? '#ffd700' : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = isCur ? Math.max(3, m.vh * 0.009) : 1.5;
    circle(ctx, cx, cy, rr_); ctx.stroke();
    var fs = Math.max(10, Math.round(m.vh * 0.034));
    var nm = st.names[SEAT_IDS.indexOf(pid)];
    var cnt = p && p.hand ? p.hand.length : 0;
    var bw = Math.round(r * 0.92), bh = Math.round(r * 0.60);
    var mr = Math.round(m.vh * 0.020);
    // 竖排: 三者同一个 x(名字中心), 整体垂直居中于头像
    var colX = pos.side === 'L' ? (cx - rr_ - 8 - fs * 0.5) : (cx + rr_ + 8 + fs * 0.5);
    var nameA = pos.side === 'L' ? 'right' : 'left';
    var nameX = pos.side === 'L' ? (colX + fs * 0.5) : (colX - fs * 0.5);
    var mky = cy - Math.round(fs * 1.35);
    var by = cy + Math.round(fs * 1.15) - bh / 2;
    // 牌数徽章
    ctx.fillStyle = isOut ? '#555' : '#2f6fb5';
    rr(ctx, colX - bw / 2, by, bw, bh, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    rr(ctx, colX - bw / 2, by, bw, bh, 4); ctx.stroke();
    text(ctx, String(cnt), colX, by + bh / 2, Math.max(9, Math.round(m.vh * 0.030)), '#ffffff', 'center', true);
    // 敌友钮(最上)
    drawAllyMark(ctx, st, m, colX, mky, mr, myMarks[pid] || null);
    markHits.push({ x: colX - mr, y: mky - mr, w: mr * 2, h: mr * 2, id: pid });
    // 「不出」在头像内侧
    // 「不出」/「已出完」: 判据是**本轮**是否出过错牌
    //   (上一轮出的牌仍然显示在桌上, 但不能因此抑制他的「不出」)
    var playedThisTrick = (st.uiPlaysTrick || {})[pid] === st.uiTrickId;
    var plays = st.uiPlays || {};
    if (!playedThisTrick) {
      var s2 = isOut ? '已出完' : (isPassed ? '不出' : '');
      if (s2) {
        var ix = cx + inw * (rr_ + 10);
        var ia = pos.side === 'L' ? 'left' : 'right';
        text(ctx, s2, ix, cy, Math.max(12, Math.round(m.vh * 0.044)), isOut ? '#9a9a9a' : '#ffd700', ia, true);
      }
    }
    drawScore(ctx, st, pid, scores[pid], cx, cy + rr_ + Math.round(m.vh * 0.036));
    if (st.mainAceMarks && st.mainAceMarks[pid]) {
      var n = st.mainAceMarks[pid];
      var suit = st.mainAceSuit;
      for (var k = 0; k < n; k++) {
        var ax = (pos.side === 'L' ? (cx + rr_ * 0.42) : (cx - rr_ * 0.55)) + k * aceIconGap;
        var ay = cy - rr_ * 0.72;
        ctx.fillStyle = '#f4f0e6';
        circle(ctx, ax, ay, aceIconR); ctx.fill();
        ctx.strokeStyle = suitColor(suit); ctx.lineWidth = 1;
        circle(ctx, ax, ay, aceIconR); ctx.stroke();
        text(ctx, suit ? (SUIT_CHAR[suit] || '?') : '?', ax, ay,
          Math.max(9, Math.round(m.vh * 0.026)), suitColor(suit), 'center', true);
      }
    }
    // 玩家名(中间, 最后画)
    text(ctx, nm, nameX, cy, fs, isCur ? '#ffd700' : '#ffffff', nameA, true);
    out.push({ x: cx - rr_, y: cy - rr_, w: rr_ * 2, h: rr_ * 2, id: pid });
  });
  drawSeatPlays(ctx, st, m, seatMap);
  return { boxes: out, seatMap: seatMap, markHits: markHits };
}

// 积分(头像下方) —— [2026-10-25 用户] 数字后面加「分」
function drawScore(ctx, st, pid, delta, x, y) {
  var v = (delta === undefined || delta === null) ? 0 : delta;
  var col = v > 0 ? '#7ee08a' : (v < 0 ? '#ff8888' : '#bbbbbb');
  text(ctx, (v > 0 ? '+' : '') + v + '分', x, y,
    Math.max(10, Math.round((st.H || 390) * 0.033)), col, 'center', true);
}

// ===== 各家最新出牌(只在自己前方) =====
// [2026-10-25] 各家最新出牌 -> 头像**内侧**(朝牌桌中心), 与外侧的名字/牌数分开, 互不遮挡; 牌放大
// [2026-10-25 用户] 各家最新出牌 -> 头像**内侧**(朝牌桌中心)
//   **和手牌一样重叠**(不再一张张分开); 内容按可见宽度居中
// [2026-10-25 用户] 各家最新出牌 -> 头像**内侧**(朝牌桌中心)
//   **和手牌一样重叠**; 所有张的内容都按 step 宽居中(最后一张也一样, 不要单独居中)
function drawSeatPlays(ctx, st, m, seatMap) {
  var plays = st.uiPlays || {};
  Object.keys(plays).forEach(function (pid) {
    var cards = plays[pid];
    if (!cards || !cards.length) return;
    var slot = seatMap[pid];
    if (!slot) return;
    var cardH = Math.round(m.vh * 0.115);
    var cardW = Math.round(cardH * m.hand.ratio);
    var n = Math.min(cards.length, 4);
    var step = Math.round(cardW * 0.58);
    var totalW = cardW + step * (n - 1);
    var rr_ = Math.round(m.vh * 0.052);
    var x0 = slot.side === 'L' ? (slot.x + rr_ + 8) : (slot.x - rr_ - 8 - totalW);
    var y = slot.y - cardH / 2;
    for (var j = 0; j < n; j++) {
      // 内容一律按 step 宽居中 -> 和其他手牌位置一致
      drawMiniCard(ctx, cards[j], x0 + j * step, y, cardW, cardH, st, step);
    }
    if (cards.length > n) {
      text(ctx, '+' + (cards.length - n), x0 + totalW + 4, y + cardH / 2,
        Math.max(8, Math.round(m.vh * 0.026)), '#ffffff', 'left', false);
    }
  });
}

// ===== 手牌(含底牌牌背) =====
// [用户 #9] 底牌在自己手牌区**最右面**, 只显示牌背; 翻开后备选加入手牌
// 手牌(含底牌牌背)
// [2026-10-25 用户] **大A 要排在大王前面** -> 排序时把大A 单独算
// 手牌(含底牌牌背)
// [2026-10-25] **大A 要排在大王前面** -> 排序时把大A 单独算
//   牌面内容按**可见宽度**居中(重叠时可见的是左边一条, 否则内容会偏右)
// 手牌(含底牌牌背)
// [2026-10-25] **大A 要排在大王前面** -> 排序时把大A 单独算
//   牌面内容按**可见宽度**居中(重叠时可见的是左边一条, 否则内容会偏右)
//   命中区宽度 = 实际可见宽度 -> 手牌条左右留白相等(居中)
//   底牌在**最右面**, 只显示牌背; 它占位但**不可点**(cardId=null)
// 手牌(含底牌牌背)
// [2026-10-25] **大A 要排在大王前面** -> 排序时把大A 单独算
//   牌面内容按**可见宽度**居中(重叠时可见的是左边一条, 否则内容会偏右)
//   所有命中区等宽 step; **底牌不占命中区**(数量必须=手牌数), 只画在手牌条最右端
// 手牌(含底牌牌背)
// [2026-10-25] **大A 要排在大王前面** -> 排序时把大A 单独算
//   牌面内容按**可见宽度**居中(重叠时可见的是左边一条, 否则内容会偏右)
//   所有命中区等宽 step; **底牌不占命中区**(数量必须=手牌数), 只画在手牌条最右端
// [2026-10-26] 结算阶段: **不再在手牌区显示手牌**(用户: 只在结算画面显示剩余手牌)
function drawHand(ctx, st, m) {
  var g = st.gameState;
  if (g.phase === 'GAME_END') return [];
  var humanPlayer = st.humanPlayer;
  var me = g.players.filter(function (p) { return p.id === humanPlayer; })[0];
  if (!me) return [];
  var hand = (me.hand || []).slice();
  var bottom = me['底牌'] || null;
  var isAce = st.isMainAce || function () { return false; };
  var sorted = hand.slice().sort(function (a, b) {
    return cardPower(b, isAce(b)) - cardPower(a, isAce(a));
  });
  var n = sorted.length;
  if (!n) return [];
  var L2 = handLayout(n, m);
  var boxes = [];
  var showHit = (st.currentPlayer === st.humanPlayer && g.phase === 'PLAY');
  for (var i = 0; i < n; i++) {
    var card = sorted[i];
    var isSel = st.selectedCards.indexOf(card.id) >= 0;
    var x = L2.x0 + i * L2.step;
    drawCard(ctx, card, x, L2.y - (isSel ? L2.lift : 0), L2.cardW, L2.cardH, isSel, st, L2.step);
    if (showHit) boxes.push({ x: x, y: L2.y, w: L2.step, h: L2.cardH, cardId: card.id });
  }
  if (bottom) {
    drawCardBack(ctx, L2.x0 + n * L2.step, L2.y, L2.cardW, L2.cardH);
  }
  return boxes;
}

// 牌力排序(大->小): 大A > 大王 > 小王 > 3 > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4
// 牌力排序(大->小): **大A** > 大王 > 小王 > 3 > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4
// [2026-10-25 用户] **大A 必须比大王还大**(同花色的 A 就是大A)
//   isBigAce 由调用方传入(靠 state.主A.suit + 持有者判定), 不用引擎那个「同花色全标」的标记
function cardPower(c, isBigAce) {
  if (isBigAce) return 22;
  if (c.isBigJoker) return 21;
  if (c.isSmallJoker) return 20;
  if (c.rank === 3) return 19;
  if (c.rank === 2) return 18;
  if (c.rank === 14) return 16;
  return c.rank || 0;
}

// ===== 牌面 =====
// [用户 #1] 大点数在上 + 大花色在下, **无角标**; 大小王 = 英文 JOKER 竖排
// [用户 #8] 大A 底色淡黄
// [2026-10-25 用户] 牌面**内容居中**, 字略小; 大点数在上/大花色在下/无角标; 大小王=英文 JOKER 竖排; 大A=淡黄底
// 牌面: **内容整体居中**(点数+花色作为一组), 大小王=英文 JOKER 竖排(整体居中), 大A=淡黄底
// 牌面: **内容按可见区域居中**(手牌重叠时只露出左边一条, 内容画在牌中心会偏右)
//   大小王 = 英文 JOKER 竖排(**整体缩到牌面内**, 之前会超出)
function drawCard(ctx, card, x, y, w, h, isSel, st, visibleW) {
  var joker = !!(card.isBigJoker || card.isSmallJoker);
  var red = (card.suit === 'H' || card.suit === 'D' || card.isBigJoker);
  var col = joker ? (card.isBigJoker ? '#c8102e' : '#1a1a1a') : (red ? '#c8102e' : '#1a1a1a');
  var isBigAce = st.isMainAce ? !!st.isMainAce(card) : false;
  var vw2 = visibleW || w;                     // 可见宽度(重叠时=step)
  var cx = x + vw2 / 2;                       // 内容中心
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  rr(ctx, x + 1, y + 2, w, h, 4); ctx.fill();
  ctx.fillStyle = isBigAce ? '#fdf3c8' : '#fdfdf6';
  rr(ctx, x, y, w, h, 4); ctx.fill();
  ctx.strokeStyle = isSel ? '#ffd700' : (isBigAce ? '#d9a05b' : 'rgba(0,0,0,0.4)');
  ctx.lineWidth = isSel ? Math.max(3, w * 0.08) : (isBigAce ? 2 : 1);
  rr(ctx, x, y, w, h, 4); ctx.stroke();
  if (joker) {
    var letters = 'JOKER';
    var fs = Math.max(7, Math.round(w * 0.22));   // 缩小: 5 个字母总高必须 < 牌高
    var lh = fs * 0.98;
    var groupH = lh * (letters.length - 1);
    var startY = y + h / 2 - groupH / 2;
    for (var li = 0; li < letters.length; li++) {
      text(ctx, letters[li], cx, startY + li * lh, fs, col, 'center', true);
    }
    return;
  }
  var numFs = Math.max(10, Math.round(w * 0.42));
  var suitFs = Math.max(11, Math.round(w * 0.46));
  var numY = y + h / 2 - numFs * 0.78;   // [2026-10-26] 牌面文字整体上移
  var suitY = y + h / 2 + suitFs * 0.46;   // 跟着上移
  text(ctx, st.rankDesc(card), cx, numY, numFs, col, 'center', true);
  text(ctx, SUIT_CHAR[card.suit] || '', cx, suitY, suitFs, col, 'center', true);
}

// 底牌牌背: 深色底 + 简单图案
function drawCardBack(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  rr(ctx, x + 1, y + 2, w, h, 4); ctx.fill();
  ctx.fillStyle = '#1f3a63';
  rr(ctx, x, y, w, h, 4); ctx.fill();
  ctx.strokeStyle = '#d9a05b'; ctx.lineWidth = 1.5;
  rr(ctx, x, y, w, h, 4); ctx.stroke();
  ctx.fillStyle = 'rgba(217,160,91,0.75)';
  var cx = x + w / 2, cy = y + h / 2, d = Math.min(w, h) * 0.22;
  ctx.beginPath();
  ctx.moveTo(cx, cy - d); ctx.lineTo(cx + d, cy); ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d, cy);
  ctx.closePath(); ctx.fill();
}

// 小牌面(桌面/各家出牌)
// 小牌面(各家出牌) —— 内容居中
// 小牌面(各家出牌) —— 和手牌一致: 大小王也用英文 JOKER 竖排; 内容居中
// 小牌面(各家出牌) —— 和手牌一致: 大小王用英文 JOKER 竖排(缩到牌面内), 内容居中
// 小牌面(各家出牌) —— 和手牌一致: 大小王用英文 JOKER 竖排; 内容按可见宽度居中
function drawMiniCard(ctx, card, x, y, w, h, st, visibleW) {
  var joker = !!(card.isBigJoker || card.isSmallJoker);
  var red = (card.suit === 'H' || card.suit === 'D' || card.isBigJoker);
  var col = joker ? (card.isBigJoker ? '#c8102e' : '#1a1a1a') : (red ? '#c8102e' : '#1a1a1a');
  var isBigAce = st.isMainAce ? !!st.isMainAce(card) : false;
  var vw2 = visibleW || w;
  var cx = x + vw2 / 2;
  ctx.fillStyle = isBigAce ? '#fdf3c8' : '#fdfdf6';
  rr(ctx, x, y, w, h, 3); ctx.fill();
  ctx.strokeStyle = isBigAce ? '#d9a05b' : 'rgba(0,0,0,0.35)'; ctx.lineWidth = isBigAce ? 2 : 1;
  rr(ctx, x, y, w, h, 3); ctx.stroke();
  if (joker) {
    var letters = 'JOKER';
    var fs = Math.max(6, Math.round(w * 0.19));
    var lh = fs * 0.98;
    var groupH = lh * (letters.length - 1);
    var startY = y + h / 2 - groupH / 2;
    for (var li = 0; li < letters.length; li++) {
      text(ctx, letters[li], cx, startY + li * lh, fs, col, 'center', true);
    }
    return;
  }
  var numFs = Math.max(8, Math.round(w * 0.40));
  var suitFs = Math.max(9, Math.round(w * 0.44));
  var numY = y + h / 2 - numFs * 0.78;
  var suitY = y + h / 2 + suitFs * 0.46;
  text(ctx, st.rankDesc(card), cx, numY, numFs, col, 'center', true);
  text(ctx, SUIT_CHAR[card.suit] || '', cx, suitY, suitFs, col, 'center', true);
}

// ===== 真人头像 + 牌数(手牌左侧, 文字避开刘海) =====
// [2026-10-25] 真人玩家: 积分/名字/牌数/大A图标 与其他玩家一致, **没有敌友钮**
// [2026-10-25 用户] 真人玩家: 头像/名字/牌数 与**左侧玩家一致** -> 名字和牌数在**左侧**(外侧)
//   真人没有敌友钮, 头像**右上**放一个「切」按钮(点击循环切换真人视角)
// [2026-10-25 用户] 真人玩家: 头像/名字/牌数 与**左侧玩家一致** -> 名字和牌数在**左侧**(外侧)
//   **没有敌友钮**; 「切」按钮已删除(用户问它意义 -> 去掉)
// [2026-10-26] 真人玩家: 头像/名字/牌数 与**左侧玩家一致** -> 名字和牌数在**左侧**(外侧),
//   同一水平线; 顶部右上是**大A图标**; 没有敌友钮
// [2026-10-26] 真人玩家: 名字/牌数在**左侧外侧**、同一水平线(徽章紧贴头像, 名字在徽章外侧)
// [2026-10-26] 真人玩家: 名字/牌数在左侧外侧、同一水平线; 名字最后画
// [2026-10-26] 真人玩家: 钮/名字/徽章竖排同 x, 在头像左侧; 名字最后画
function drawMeSeat(ctx, st, m) {
  var g = st.gameState;
  var me = g.players.filter(function (p) { return p.id === st.humanPlayer; })[0];
  var cnt = (me && me.hand) ? me.hand.length : 0;
  var r = Math.round(m.me.r);
  var cx = m.me.x, cy = m.me.y;
  var rr_ = Math.round(r * (st.currentPlayer === st.humanPlayer ? 1.14 : 1));
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  circle(ctx, cx + 2, cy + 3, rr_ + 3); ctx.fill();
  ctx.fillStyle = SEAT_COLOR[SEAT_IDS.indexOf(st.humanPlayer)] || '#666';
  circle(ctx, cx, cy, rr_); ctx.fill();
  ctx.strokeStyle = st.currentPlayer === st.humanPlayer ? '#ffd700' : 'rgba(255,255,255,0.55)';
  ctx.lineWidth = st.currentPlayer === st.humanPlayer ? Math.max(3, m.vh * 0.009) : 1.5;
  circle(ctx, cx, cy, rr_); ctx.stroke();
  var fs = Math.max(10, Math.round(m.vh * 0.034));
  var bw = Math.round(r * 0.92), bh = Math.round(r * 0.60);
  var colX = cx - rr_ - 8 - fs * 0.5;
  var by = cy + Math.round(fs * 1.15) - bh / 2;
  ctx.fillStyle = '#2f6fb5';
  rr(ctx, colX - bw / 2, by, bw, bh, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
  rr(ctx, colX - bw / 2, by, bw, bh, 4); ctx.stroke();
  text(ctx, String(cnt), colX, by + bh / 2, Math.max(9, Math.round(m.vh * 0.030)), '#ffffff', 'center', true);
  drawScore(ctx, st, st.humanPlayer, (st.scores || {})[st.humanPlayer], cx, cy + rr_ + Math.round(m.vh * 0.036));
  if (st.mainAceMarks && st.mainAceMarks[st.humanPlayer]) {
    var n = st.mainAceMarks[st.humanPlayer];
    var suit = st.mainAceSuit;
    var aceIconR = Math.round(m.vh * 0.019);
    var aceIconGap = Math.round(m.vh * 0.032);   // [2026-10-26] 两个图标贴紧(轻微重叠)
    for (var k = 0; k < n; k++) {
      var ax = cx + rr_ * 0.42 + k * aceIconGap;
      var ay = cy - rr_ * 0.72;
      ctx.fillStyle = '#f4f0e6';
      circle(ctx, ax, ay, aceIconR); ctx.fill();
      ctx.strokeStyle = suitColor(suit); ctx.lineWidth = 1;
      circle(ctx, ax, ay, aceIconR); ctx.stroke();
      text(ctx, suit ? (SUIT_CHAR[suit] || '?') : '?', ax, ay,
        Math.max(9, Math.round(m.vh * 0.026)), suitColor(suit), 'center', true);
    }
  }
  text(ctx, st.names[SEAT_IDS.indexOf(st.humanPlayer)], colX + fs * 0.5, cy, fs,
    st.currentPlayer === st.humanPlayer ? '#ffd700' : '#ffffff', 'right', true);
  return null;
}

// ===== 倒计时(按钮行中央正上方, 样式参照图3 闹钟) =====
function drawTurnInfo(ctx, st, m) {
  if (!st.turnDeadline) return;
  var c = m.turn;
  var total = st.turnTotal || 20000;
  var left = Math.max(0, st.turnDeadline - Date.now());
  var sec = Math.ceil(left / 1000);
  var r = Math.round(m.vh * 0.048);
  // 铃铛耳朵
  ctx.strokeStyle = '#d9a05b'; ctx.lineWidth = Math.max(2, m.vh * 0.007);
  ctx.beginPath();
  ctx.moveTo(c.x - r * 0.95, c.y - r * 0.70); ctx.lineTo(c.x - r * 0.45, c.y - r * 1.05);
  ctx.moveTo(c.x + r * 0.95, c.y - r * 0.70); ctx.lineTo(c.x + r * 0.45, c.y - r * 1.05);
  ctx.stroke();
  // 表盘
  ctx.fillStyle = '#f6e7c6';
  circle(ctx, c.x, c.y, r); ctx.fill();
  ctx.strokeStyle = '#d9a05b'; ctx.lineWidth = Math.max(2, m.vh * 0.008);
  circle(ctx, c.x, c.y, r); ctx.stroke();
  // 秒数
  text(ctx, String(sec), c.x, c.y, Math.max(12, Math.round(m.vh * 0.046)),
       sec <= 5 ? '#c8102e' : '#5e2417', 'center', true);
}

// ===== 按钮 =====
function drawButtons(ctx, st, m, list) {
  // [2026-10-25] 结算阶段: 「下一局」由 drawSettlement 画在**面板内下方中央** -> 这里跳过, 免得画两个
  if (st.phase === 'GAME_END') return [];
  var boxes = buttonLayout(list, m);
  var fs = Math.max(11, Math.round(m.vh * 0.038));
  for (var i = 0; i < boxes.length; i++) {
    var b = boxes[i];
    var on = b.enabled;
    ctx.fillStyle = on ? (b.id === 'hint' ? '#2f8f4f' : (b.id === 'play' ? '#1e6091' : '#8a5a2b')) : '#4a4a4a';
    rr(ctx, b.x, b.y, b.w, b.h, Math.round(b.h * 0.30)); ctx.fill();
    ctx.strokeStyle = on ? '#ffd98a' : '#6a6a6a'; ctx.lineWidth = on ? 2 : 1;
    rr(ctx, b.x, b.y, b.w, b.h, Math.round(b.h * 0.30)); ctx.stroke();
    text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, fs, on ? '#ffffff' : '#9a9a9a', 'center', true);
  }
  return boxes;
}

// ===== 提示条 =====
function drawToast(ctx, st, m) {
  var t = st.toast;
  if (!t || !t.text || t.until <= Date.now()) return;
  var fs = Math.max(11, Math.round(m.vh * 0.036));
  var tw = (typeof ctx.measureText === 'function') ? ctx.measureText(t.text).width + fs * 2 : 180;
  var tx = m.vw / 2 - tw / 2, ty = m.top.h + Math.round(m.vh * 0.010);
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  rr(ctx, tx, ty, tw, Math.round(m.vh * 0.072), 6); ctx.fill();
  ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 1.5;
  rr(ctx, tx, ty, tw, Math.round(m.vh * 0.072), 6); ctx.stroke();
  text(ctx, t.text, tx + tw / 2, ty + Math.round(m.vh * 0.036), fs, '#ffd700', 'center', true);
}

// ===== 结算 =====
// ===== 结算 =====
// [2026-10-25 用户] 1) 标题原来是「本局结束 · undefined 胜」——
//      引擎的 winner 是**阵营**('主方'/'抓方'/'draw'), 不是玩家 ID,
//      之前拿它去 indexOf 玩家表 -> -1 -> names[-1] = undefined
//   2) 下面那行「谁先出完」(res.reason) 不要了
//   3) 「下一局」按钮要画在**面板内下方中央**(原来被面板盖住, 只能看到半透明轮廓)
// ===== 结算 =====
// [2026-10-25 用户] 1) 标题原来是「本局结束 · undefined 胜」——
//      引擎的 winner 是**阵营**('主方'/'抓方'/'draw'), 不是玩家 ID
//   2) 下面那行「谁先出完」(res.reason) 不要了
//   3) 「下一局」按钮画在**面板内下方中央**
//   4) **把所有未出完牌玩家的手牌一次性摊开显示**(不管是否合理)
// ===== 结算 =====
// [2026-10-26] 剩余手牌**放大**(原来 10x14 根本看不清), 行距收紧(上下只留一点边距)
// ===== 结算 =====
// [2026-10-26] 行往下移(离标题远一点); 显示**全部**剩余手牌(顺序同手牌区); 平局显示 0 分
function drawSettlement(ctx, st, m) {
  var d = st.settlement;
  if (!d) return null;
  var pw = Math.min(540, m.vw * 0.90), ph = Math.min(280, m.vh * 0.86);
  var px = (m.vw - pw) / 2, py = (m.vh - ph) / 2 - m.vh * 0.03;
  ctx.fillStyle = 'rgba(20,8,4,0.92)';
  rr(ctx, px, py, pw, ph, 10); ctx.fill();
  ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 2;
  rr(ctx, px, py, pw, ph, 10); ctx.stroke();
  var w = (d.res && d.res.winner) || 'draw';
  var title = (w === 'draw') ? '平局' : (w + '胜');
  text(ctx, '本局结束 · ' + title, px + pw / 2, py + 28, Math.max(15, Math.round(m.vh * 0.050)), '#ffd98a', 'center', true);
  var camps = (st.gameState['主方'] || []);
  var rowH = Math.round(m.vh * 0.070);
  var rowY = py + 68;
  var cw = 17, ch = 24, cstep = 12;
  var isAce = st.isMainAce || function () { return false; };
  for (var i = 0; i < SEAT_IDS.length; i++) {
    var pid = SEAT_IDS[i];
    var y = rowY + i * rowH;
    var p = st.gameState.players.filter(function (x) { return x.id === pid; })[0];
    var camp = camps.indexOf(pid) >= 0 ? '主方' : '抓方';
    var delta = d.scores ? d.scores[pid] : undefined;
    // [2026-10-26] 平局/无数据 -> 显示 0 分(不是 —)
    var dtxt = (delta === undefined) ? '0' : ((delta > 0 ? '+' : '') + delta);
    ctx.fillStyle = (i % 2 === 0) ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)';
    rr(ctx, px + 12, y - rowH * 0.46, pw - 24, rowH * 0.92, 3); ctx.fill();
    text(ctx, st.names[i] + (pid === st.humanPlayer ? '(你)' : ''), px + 22, y, Math.max(11, Math.round(m.vh * 0.036)), '#ffffff', 'left', true);
    text(ctx, camp + ' · 剩 ' + ((p && p.hand) ? p.hand.length : 0), px + 92, y, Math.max(9, Math.round(m.vh * 0.028)), '#aaaaaa', 'left', false);
    // **全部**剩余手牌, 顺序与手牌区一致(大A > 大王 > 小王 > 3 > 2 > A > K ...)
    var hand = (p && p.hand) ? p.hand : [];
    if (hand.length) {
      var hs = hand.slice().sort(function (a, b) { return cardPower(b, isAce(b)) - cardPower(a, isAce(a)); });
      var hx = px + 170;
      for (var j = 0; j < hs.length; j++) {
        drawMiniCard(ctx, hs[j], hx + j * cstep, y - ch / 2, cw, ch, st, cstep);
      }
    }
    text(ctx, dtxt, px + pw - 22, y, Math.max(11, Math.round(m.vh * 0.038)),
         (delta > 0) ? '#7ee08a' : ((delta < 0) ? '#ff8888' : '#cccccc'), 'right', true);
  }
  var bw2 = Math.round(m.vw * 0.26), bh2 = Math.round(m.vh * 0.080);
  var bx2 = px + (pw - bw2) / 2, by2 = py + ph - bh2 - Math.round(m.vh * 0.024);
  ctx.fillStyle = '#8a5a2b';
  rr(ctx, bx2, by2, bw2, bh2, Math.round(bh2 * 0.30)); ctx.fill();
  ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 2;
  rr(ctx, bx2, by2, bw2, bh2, Math.round(bh2 * 0.30)); ctx.stroke();
  text(ctx, '下一局', bx2 + bw2 / 2, by2 + bh2 / 2, Math.max(11, Math.round(m.vh * 0.036)), '#ffffff', 'center', true);
  return { x: bx2, y: by2, w: bw2, h: bh2, id: 'newGame' };
}

// ===== 入口 =====
// [2026-10-25] 顶栏第二行: 5 个**可点**的玩家按钮(名字 + 阵营)
//   作用: 1) 测试模式下切换真人视角 2) 显示阵营(主/次)
//   [用户] 阵营要显示正确: 只给主A持有者标「主方」, 次方仅身份亮明后标「次方」

function render(ctx, st) {
  var m = layout(st.W, st.H);
  drawTable(ctx, m);
  var memoIcon = { x: m.memo.iconX, y: m.memo.iconY, r: m.memo.iconR };
  drawTopBar(ctx, st, m, memoIcon);
  drawMemo(ctx, st, m);
  var seatInfo = drawSeats(ctx, st, m);
  drawTurnInfo(ctx, st, m);
  var btnBoxes = drawButtons(ctx, st, m, st.buttons || []);
  var switchHit = drawMeSeat(ctx, st, m);
  var handBoxes = drawHand(ctx, st, m);
  drawToast(ctx, st, m);
  var settleBtn = (st.phase === 'GAME_END') ? drawSettlement(ctx, st, m) : null;
  return {
    btnLog: null, btnStage: btnBoxes, handHitboxes: handBoxes,
    seatHitboxes: seatInfo.boxes, markHits: seatInfo.markHits,
    memoIcon: memoIcon, layout: m,
    switchHit: switchHit,
    settleBtn: settleBtn,
  };
}

function noopCtx() {
  var c = { measureText: function (t) { return { width: String(t || '').length * 8 }; } };
  var M = ['fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'beginPath', 'closePath',
           'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'fill', 'stroke', 'save', 'restore',
           'translate', 'scale', 'rotate', 'setLineDash', 'drawImage', 'clip',
           'quadraticCurveTo', 'bezierCurveTo', 'rect'];
  for (var i = 0; i < M.length; i++) c[M[i]] = function () {};
  return c;
}

module.exports = {
  render: render, layout: layout, handLayout: handLayout, buttonLayout: buttonLayout,
  cardPower: cardPower, seatOrder: seatOrder, noopCtx: noopCtx,
  SEAT_IDS: SEAT_IDS, SUIT_CHAR: SUIT_CHAR, RANKS_DESC: RANKS_DESC
};