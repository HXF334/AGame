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

// [2026-11-06 用户] 「打出的手牌排序时按龙的顺序排序而不是按单张大小」
//   -> 链序判定放在 src/sort-cards.js(纯逻辑), 渲染层只负责画
var sortCards = require('./src/sort-cards.js');
// [2026-11-07 23:27 用户] 敌友标记的**自动填充**: src/camp.js 算出敌/友/不明
var camp = require('./src/camp.js');

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
  // [2026-10-26 用户] 左右侧留的边距**太多** -> 安全边距 6% -> 3.5%
  //   (刘海在左侧, 内容从 ~41px 开始, 仍避开刘海)
  var safe = vw * 0.035;
  var r = Math.round(vh * 0.052);
  return {
    vw: vw, vh: vh,
    safeL: safe, safeR: safe,
    top: { h: vh * 0.135 },
    table: { cx: vw * 0.5, cy: vh * 0.325, rx: vw * 0.40, ry: vh * 0.175 },
    // [2026-10-25] 座位往中间挪: 名字/牌数徽章要画在头像**外侧**, 需要 ~34px 文字宽度
    // [2026-11-04 用户] 「AI玩家头像那一片整体往下移一点, 第二排多下移一点」
    //   -> 第一排 +0.020H, 第二排 +0.045H(第二排多下移一点)
    seats: [
      { x: safe + r + 44, y: vh * 0.235, side: 'L' },
      { x: safe + r + 44, y: vh * 0.470, side: 'L' },
      { x: vw - safe - r - 44, y: vh * 0.235, side: 'R' },
      { x: vw - safe - r - 44, y: vh * 0.470, side: 'R' }
    ],
    // [2026-11-03 用户] 真人出的牌**不再画在牌桌中央**, 改画在**原来按钮的位置**
    //   (按钮行正中) —— 用户原话「真人手牌不是居中, 而是在原来按钮的位置显示, 按钮隐藏掉」。
    //   那里显示着牌时**按钮让位隐藏**(见 drawButtons); 轮到自己时牌被清掉 -> 按钮重新出现。
    humanPlay: { x: vw * 0.5, y: vh * 0.610 },
    turn: { x: vw * 0.5, y: vh * 0.468 },      // [2026-10-25] 上移, 不与按钮行重叠
    btn: { y: vh * 0.560, h: vh * 0.100 },
    // [2026-10-25] 手牌上移, 避开手机底部横条
    // [2026-10-26] 底部暗区变矮 -> 手牌整体下移(牌的上沿 0.72H 正好贴暗区顶边)
    // [2026-11-06 用户] 「手牌高度多加一点」-> cardH 0.170H -> 0.185H;
    //   牌变高 -> 同时把整排**上移**(y 0.805H -> 0.780H), 否则底部出屏
    hand: { y: vh * 0.780, maxW: vw * 0.70, cardH: vh * 0.185, ratio: 0.70 },
    // [2026-11-04 用户] 「真人玩家头像那一片整体往上一点」-> 第一项 0.805H -> 0.780H
    me: { x: safe + r + 30, r: r, y: vh * 0.780 + vh * 0.200 * 0.42 },
    // [2026-10-25] 记牌器入口图标(顶部中央, 点击展开/收起)
    // [2026-11-04 用户] 「大小和记牌器按钮一样, 两个都再大一点」-> 半径 0.034H -> 0.042H
    memo: { iconX: vw * 0.235, iconY: vh * 0.062, iconR: Math.round(vh * 0.042) },
    // [2026-11-04 用户] 顶栏**右上角**小机器人(托管开关): 靠右但不贴边(留出安全边距)
    // [2026-11-04 用户] 「机器人头像太小了, 占大部分按钮区域」
    //   -> 头部尺寸比例提到 bot.headW/headH(占圆半径的比例), 眼睛/天线同步放大
    // [2026-11-04 用户] 「机器人图标再往左移, 被小游戏的圆圈和三个点(胶囊按钮)挡住了」
    //   -> 往左让出约 148px(约 0.38H), 整块避开胶囊按钮区域(胶囊约 90px 宽)。
    // [2026-11-04 用户] 「按钮再往右移一点」(上一轮让开胶囊按钮让过头了)
    //   0.38H -> 0.33H(往右回一点但仍避开胶囊按钮); 大小与记牌器一致(0.042H)
    // [2026-11-06 用户] 「机器人按钮左移一点」-> 0.33H -> 0.36H
    autoPlay: { iconX: vw - Math.round(vh * 0.36), iconY: vh * 0.062, iconR: Math.round(vh * 0.042) },
    // 机器人图形比例(相对圆半径) -> 「占大部分按钮区域」
    // [2026-11-06 用户] 「机器人头像再大一点(不是按钮变大, 是按钮里的机器人)」
    //   -> 头/眼/天线整体放大, **按钮本身大小不变**(0.042H, 与记牌器一致)
    //   数值按「图形完全落在圆内」反推(头角到圆心 < r)
    bot: { headW: 1.30, headH: 0.95, eye: 0.15, eyeDx: 0.32, antenna: 0.18, antennaDot: 0.19 }
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
           totalW: totalW, lift: Math.round(cardH * 0.12) };   // [2026-10-26] 抬起幅度减小
}

function buttonLayout(list, m) {
  var gap = Math.round(m.vw * 0.012);
  // [2026-11-04 用户] 「亮A那四个花色按钮还是再分开一些」
  //   -> 相邻**花色**按钮之间用 suitGap(比普通 gap 宽)
  // [2026-11-06 用户] 「亮A那四个花色按钮距离再小一些」-> 0.020vw -> 0.009vw
  var suitGap = Math.round(m.vw * 0.009);
  var h = Math.round(m.btn.h);
  // [2026-10-26] **花色按钮窄一些**(一个花色符号不需要整行那么宽)
  var nSuit = 0, nOther = 0;
  for (var si = 0; si < list.length; si++) {
    if (list[si].kind === 'suit') nSuit++; else nOther++;
  }
  // [2026-11-06 用户] 「亮A按钮太小了, 整体放大」-> 38/h*0.74 -> 50/h*1.02
  var wSuit = Math.max(50, Math.round(h * 1.02));
  // [2026-11-04] 先按**实际间距**算总宽(花色之间是 suitGap), 再定普通按钮宽
  var gapTotal = 0;
  for (var tg = 0; tg < list.length - 1; tg++) {
    gapTotal += (list[tg].kind === 'suit' && list[tg + 1].kind === 'suit') ? suitGap : gap;
  }
  var wOther = Math.max(58, Math.min(112,
    (m.vw - m.vw * 0.06 - gapTotal - nSuit * wSuit) / Math.max(1, nOther)));
  var totalW = 0;
  for (var ti = 0; ti < list.length; ti++) totalW += (list[ti].kind === 'suit' ? wSuit : wOther);
  totalW += gapTotal;
  var x = (m.vw - totalW) / 2;
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    var bw = (b.kind === 'suit' ? wSuit : wOther);
    b.x = x; b.y = m.btn.y; b.w = bw; b.h = h;
    // [2026-11-04 用户] 「亮A那四个花色按钮还是再分开一些」
    //   -> 相邻花色按钮之间留 suitGap(与普通按钮之间仍留 gap)
    x += bw;
    if (i < list.length - 1) {
      var nxt = list[i + 1];
      x += (b.kind === 'suit' && nxt.kind === 'suit') ? suitGap : gap;
    }
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
  // [2026-10-26 用户] 底部手牌暗区**高度减小** -> 浅色牌桌区往下延伸, 暗区从 34% 缩到 28%
  //   (暗区顶边 0.66H -> 0.72H; 手牌随之整体下移, 保证整排牌仍在暗区内)
  ctx.fillStyle = '#7a3220'; ctx.fillRect(0, 0, m.vw, m.vh * 0.72);
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
function drawTopBar(ctx, st, m, memoIcon, autoIcon) {
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
  // [2026-11-04 用户] 顶栏右上角小机器人: 托管开关(开=亮色高亮, 关=暗色)
  if (autoIcon) {
    var _ar = autoIcon.r;
    ctx.fillStyle = st.autoPlay ? '#ffd98a' : 'rgba(120,120,120,0.55)';
    circle(ctx, autoIcon.x, autoIcon.y, _ar); ctx.fill();
    ctx.strokeStyle = st.autoPlay ? '#ffffff' : '#8a8a8a'; ctx.lineWidth = st.autoPlay ? 2 : 1;
    circle(ctx, autoIcon.x, autoIcon.y, _ar); ctx.stroke();
    var _hy = autoIcon.y - _ar * 0.18;
    var _bt = m.bot || { headW: 0.78, headH: 0.58, eye: 0.13, eyeDx: 0.25, antenna: 0.26, antennaDot: 0.36 };
    var _hw = _ar * _bt.headW, _hh = _ar * _bt.headH;
    ctx.fillStyle = st.autoPlay ? '#2b2b2b' : '#e8e8e8';
    rr(ctx, autoIcon.x - _hw / 2, _hy - _hh / 2, _hw, _hh, Math.max(2, _ar * 0.16)); ctx.fill();
    var _er = Math.max(1.8, _ar * _bt.eye);
    ctx.fillStyle = st.autoPlay ? '#ffd98a' : '#5a5a5a';
    circle(ctx, autoIcon.x - _hw * _bt.eyeDx, _hy, _er); ctx.fill();
    circle(ctx, autoIcon.x + _hw * _bt.eyeDx, _hy, _er); ctx.fill();
    ctx.strokeStyle = st.autoPlay ? '#2b2b2b' : '#e8e8e8'; ctx.lineWidth = Math.max(1, _ar * 0.09);
    ctx.beginPath();
    ctx.moveTo(autoIcon.x, _hy - _hh / 2);
    ctx.lineTo(autoIcon.x, _hy - _hh / 2 - _ar * _bt.antenna);
    ctx.stroke();
    circle(ctx, autoIcon.x, _hy - _hh / 2 - _ar * _bt.antennaDot, Math.max(1.8, _ar * _bt.eye)); ctx.fill();
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
// 记牌器 —— 参照图3样式, 按用户要求继续压缩;
//   1) 只显示在**顶部深棕色那一条**(顶栏)里
//   2) 大A 用**主A 的花色**; 大王=红 JOKER, 小王=黑 JOKER(竖排, 更短更小)
//   3) 下面只写剩余数字, **灰色**
//   4) **不要黑边**: 面板半透明, 只留一条细灰线; 牌面浅灰无描边
//   5) [2026-10-26] 内容**左移到「记」按钮旁边**(原来居中, 离按钮很远)
function drawMemo(ctx, st, m) {
  if (!st.memoOpen) return;
  var items = st.memoItems || [];
  var n = items.length;
  if (!n) return;
  var topH = m.top.h;
  var cw = Math.round(m.vw * 0.022);
  var total = n * cw;
  // 面板紧跟在「记」按钮右边
  var x0 = m.memo.iconX + m.memo.iconR + 20;   // [2026-10-26] 内容往右移一点
  var maxRight = m.vw - Math.round(m.vw * 0.015);
  if (x0 + total > maxRight) {
    cw = Math.max(8, Math.floor((maxRight - x0) / n));
    total = n * cw;
  }
  var cardW = cw;
  var cardH = Math.round(topH * 0.50);
  var numH = Math.round(topH * 0.26);
  var y = Math.round(m.vh * 0.004);
  ctx.fillStyle = 'rgba(30,12,6,0.55)';
  rr(ctx, x0 - 3, y, total + 6, cardH + numH + 3, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(200,200,200,0.45)'; ctx.lineWidth = 1;
  rr(ctx, x0 - 3, y, total + 6, cardH + numH + 3, 3); ctx.stroke();
  var suit = st.mainAceSuit;
  for (var i = 0; i < n; i++) {
    var it = items[i];
    var cx = x0 + i * cw + cw / 2;
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
      var lh2 = fs2 * 0.82;
      var gh = lh2 * (letters.length - 1);
      var sy = y + 1.5 + cardH / 2 - gh / 2;
      for (var li = 0; li < letters.length; li++) {
        text(ctx, letters[li], cx, sy + li * lh2, fs2, jc, 'center', true);
      }
    } else {
      text(ctx, lbl, cx, y + 1.5 + cardH * 0.52,
        Math.max(7, Math.round(cardH * 0.50)), '#333333', 'center', true);
    }
    var nbY = y + 1.5 + cardH;
    text(ctx, String(it.value), cx, nbY + numH / 2,
      Math.max(7, Math.round(numH * 0.80)), '#999999', 'center', true);
  }
}

// [2026-11-08 22:40 用户] 出完牌的顺序 -> 大贡/二贡/三贡/四贡
var GONG_NAMES = ['大贡', '二贡', '三贡', '四贡'];
function gongLabelOf(state, pid) {
  var ord = (state && state['出完顺序']) || [];
  var idx = ord.indexOf(pid);
  if (idx < 0) return null;
  return GONG_NAMES[idx] || null;
}

// ===== 敌友钮 =====
// [用户 2026-10-25] 每个**别人**头像左上角; 三态 ?/友/敌; 每人一套独立标记
// [2026-11-08 16:24 用户] 「不要推测变淡的处理」-> 一律实心, 不再区分推测/确定。
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
    // [2026-11-04 用户] 「开局前每个人前面都显示已出完, 然后才开始发牌」
    //   -> 发牌阶段手牌本来就是空的(还没发到), **不能**当成「已出完」。
    //      只有真的打过牌的阶段(PLAY/GAME_END)手牌为空才算出完。
    var outPhase = (g.phase === 'PLAY' || g.phase === 'GAME_END');
    var isOut = outPhase && p && p.hand && p.hand.length === 0;
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
    // [2026-11-07 23:27 用户] 敌友标记: **手动标记优先**; 没手动标就按 src/camp.js 自动算
    //   (抓方视角: 主方=敌; 推定的次A=敌; 推定后其余未知玩家=友; 还没线索=?)
    // [2026-11-08 16:24 用户] 「点击敌友按钮标记, 画面上显示的敌友不变」-> **手动标记优先**,
    //   点了就生效(没手动标时才用 src/camp.js 的自动判定)。
    // [2026-11-08 22:20 用户] 「只有次A身份已经明了的时候不能手动改, 其他时候是可以改的」
    //   -> 身份未明: 手动标记优先(点了就生效); 身份明了: 以真阵营表为准, 手动标记不再生效。
    var _mark = null;
    // [2026-11-08 22:33 用户] 能不能手动改按观察者自己的知情程度(camp.canManualMark)
    var _canM = st.gameState ? camp.canManualMark(st.gameState, st.humanPlayer, pid) : false;
    // [2026-11-10 用户] 「切到问号后 UI 还显示敌/友」-> 手动标过(哪怕标的是问号)就用手动的,
    //   不再被自动判定覆盖。
    if (_canM && Object.prototype.hasOwnProperty.call(myMarks, pid)) {
      _mark = (myMarks[pid] === 'unknown') ? null : myMarks[pid];
    }
    if (st.gameState) {
      var _c = camp.campOf(st.gameState, st.humanPlayer, pid);
      // [2026-11-09 21:44 用户] 「AI 根据逻辑推测出阵营后为什么没有主动标敌友标记?」
      //   -> 自动标按 camp.campOf 的结果: **确定的关系**和**推定出来的关系**都显示(推定次A=敌、其余抓方=友),
      //      推不出来的才是「?」。
      if (!_mark) _mark = (_c === 'ENEMY') ? 'enemy' : (_c === 'ALLY' ? 'friend' : null);
      // [2026-11-09 用户] 「已经明确的要标好, 不明确的不能给真人自动标」
      //   -> 只在**关系已确定**(campCertain: 次方亮明/明打/1V4里对主A)时按真实阵营自动标;
      //      不确定(暗打抓方之间/1V4开局) -> 不自动填, 显示「?」, 只能手动标。
    }
    drawAllyMark(ctx, st, m, colX, mky, mr, _mark);
    markHits.push({ x: colX - mr, y: mky - mr, w: mr * 2, h: mr * 2, id: pid });
    // 「不出」在头像内侧
    // 「不出」/「已出完」: 判据是**本轮**是否出过错牌
    //   (上一轮出的牌仍然显示在桌上, 但不能因此抑制他的「不出」)
    var playedThisTrick = (st.uiPlaysTrick || {})[pid] === st.uiTrickId;
    var plays = st.uiPlays || {};
    // [2026-11-09 用户] 「托管后不出还会**随机**丢失」-> 判据改成「他自己最后动作是不是过牌」:
    //   之前这里拿「本轮是否出过错牌」当闸门, 托管连走多个动作时两边判据互相打架 -> 随机丢失。
    var _s2 = '';
    if (isOut) {
      if (!playedThisTrick) _s2 = gongLabelOf(st.gameState, pid) || '已出完';
    } else if (isPassed) {
      _s2 = '不出';
    }
    if (_s2) {
      // [2026-11-04 用户] 「AI玩家打出的手牌或者不出离头像再远一点」
      var _ix = cx + inw * (rr_ + 20);
      var _ia = pos.side === 'L' ? 'left' : 'right';
      // [2026-11-08 23:36 用户] 贡字用结算金色; [2026-11-09 用户] 真人/AI 贡字颜色一致
      text(ctx, _s2, _ix, cy, Math.max(12, Math.round(m.vh * 0.044)),
        (isOut && gongLabelOf(st.gameState, pid)) ? '#f0a500' : (isOut ? '#9a9a9a' : '#ffd700'), _ia, true);
    }
    drawScore(ctx, st, pid, scores[pid], cx, cy + rr_ + Math.round(m.vh * 0.036));
    if (st.mainAceMarks && st.mainAceMarks[pid]) {
      var n = st.mainAceMarks[pid];
      var suit = st.mainAceSuit;
      for (var k = 0; k < n; k++) {
        // [2026-10-26 用户] 右侧玩家的第 2 个大A角标画在**第 1 个的左侧**(往远离头像的方向排);
        //   左侧玩家不变(往右排)
        var ax = (pos.side === 'L')
          ? (cx + rr_ * 0.42) + k * aceIconGap
          : (cx - rr_ * 0.55) - k * aceIconGap;
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
  // [2026-11-02 用户] 真人自己出的牌**也要画出来**:
  //   根因: seatMap 原来只有 4 个 AI 座位(真人在上面的 forEach 里被 `return` 跳过了)
  //         -> drawSeatPlays 找不到真人的槽位 -> **真人自己出的牌永远不画**
  //         (用户 2026-11-01 报障:「真人出的牌在牌面上看不见」)
  // [2026-11-03 用户] 位置改了: **不在牌桌中央**, 改在**原来按钮的位置**(m.humanPlay)。
  //   注意: 这**不新增命中框**(下面的 out.push 只在 AI 座位的循环里做), 不影响触摸契约。
  seatMap[st.humanPlayer] = { x: m.humanPlay.x, y: m.humanPlay.y, side: 'C' };

  drawSeatPlays(ctx, st, m, seatMap);
  return { boxes: out, seatMap: seatMap, markHits: markHits };
}

// 积分(头像下方) —— [2026-10-25 用户] 数字后面加「分」
function drawScore(ctx, st, pid, delta, x, y) {
  var v = (delta === undefined || delta === null) ? 0 : delta;
  var col = v > 0 ? '#7ee08a' : (v < 0 ? '#ff8888' : '#bbbbbb');
  // [2026-10-27 用户] 头像下面的积分: **正分不带加号**(「2分」而不是「+2分」)
  text(ctx, (v > 0 ? '' : '') + v + '分', x, y,
    Math.max(10, Math.round((st.H || 390) * 0.033)), col, 'center', true);
}

// ===== 各家最新出牌(只在自己前方) =====
// [2026-10-25] 各家最新出牌 -> 头像**内侧**(朝牌桌中心), 与外侧的名字/牌数分开, 互不遮挡; 牌放大
// [2026-10-25 用户] 各家最新出牌 -> 头像**内侧**(朝牌桌中心)
//   **和手牌一样重叠**(不再一张张分开); 内容按可见宽度居中
// [2026-10-25 用户] 各家最新出牌 -> 头像**内侧**(朝牌桌中心)
//   **和手牌一样重叠**; 所有张的内容都按 step 宽居中(最后一张也一样, 不要单独居中)
// [2026-11-09 用户] 4取牌: 被取走的牌飞向**取牌玩家**的手牌区
function _captureTargetPos(st, m, seatMap, toPid) {
  if (!toPid) return null;
  if (toPid === st.humanPlayer) {
    var hand = m.hand || {};
    var hy = (hand.y != null) ? hand.y : Math.round(m.vh * 0.80);
    return { x: Math.round(m.vw * 0.5), y: hy };
  }
  var s = seatMap && seatMap[toPid];
  if (!s) return null;
  return { x: s.x, y: s.y };
}

function drawSeatPlays(ctx, st, m, seatMap) {
  var plays = st.uiPlays || {};
  Object.keys(plays).forEach(function (pid) {
    var cards = plays[pid];
    if (!cards || !cards.length) return;
    // [2026-11-06 用户] 「打出的手牌排序时按龙的顺序排序而不是按单张大小」
    //   -> 龙型(连张/双龙/连珠蛋/假八)按**链序**排(3-4-5-6 显示成 3 4 5 6,
    //      而不是按单张大小排成 4 5 6 3); 非龙型仍按单张大小排。
    var _isAce2 = st.isMainAce || function () { return false; };
    cards = sortCards.sortByChain(cards) || cards.slice().sort(function (a, b) {
      return cardPower(a, _isAce2(a)) - cardPower(b, _isAce2(b));
    });
    var slot = seatMap[pid];
    if (!slot) return;
    // [2026-11-06 用户] 「打出的手牌整体大一些」-> 0.115H -> 0.130H
    var cardH = Math.round(m.vh * 0.130);
    var cardW = Math.round(cardH * m.hand.ratio);
    var rr_ = Math.round(m.vh * 0.052);
    // [2026-11-04 用户] 「我出55667788991010JJQQ，桌面上显示不全」
    //   -> 原来这里 `Math.min(cards.length, 10)` **硬截断到 10 张**(后面画 "+N"),
    //      16 张的双龙只画出 10 张 -> 看着"没出全"。
    //   -> 改成: **尽量全部画出**, 按该槽位**可用宽度压缩步长**;
    //      只有连「最小步长」都塞不下时才截断并标 "+N"。
    //      (可用宽度: C=按钮行几乎整屏; L/R=头像内侧到牌桌中线, 左右两边不撞车)
    var avail = slot.side === 'C' ? (m.vw - m.safeL - m.safeR)
             : slot.side === 'L' ? (m.table.cx - (slot.x + rr_ + 18))
             : ((slot.x - rr_ - 18) - m.table.cx);
    // [2026-11-06 用户] 「禁止出现+N截断, 手牌和打出的牌都要显示全」
    //   -> 删掉截断分支: 先压步长, 压到下限仍放不下就**等比缩小牌本身**,
    //      保证**一张都不少**(宁可小, 不丢牌)。
    var MIN_STEP = 8;                        // 再窄就认不出点数了
    var MAX_STEP = Math.round(cardW * 0.58);
    var n = cards.length;                    // 全部显示
    var step = MAX_STEP;
    if (n > 1 && avail > cardW) {
      var fit = Math.floor((avail - cardW) / (n - 1));
      if (fit < step) step = Math.max(MIN_STEP, fit);
    }
    var totalW = cardW + step * (n - 1);
    if (totalW > avail && n > 1) {
      // 步长压到下限仍放不下 -> 等比缩小牌(不截断)
      var _sc = avail / totalW;
      cardW = Math.max(10, Math.round(cardW * _sc));
      cardH = Math.max(12, Math.round(cardH * _sc));
      step = Math.max(1, Math.floor((avail - cardW) / (n - 1)));
      totalW = cardW + step * (n - 1);
    }
    // [2026-11-02] side 'C' = 牌桌中央(真人自己的出牌): 整排**居中**画
    // [2026-11-04 用户] 「AI玩家打出的手牌离头像再远一点」(+8 -> +18)
    var x0 = slot.side === 'L' ? (slot.x + rr_ + 18)
          : slot.side === 'C' ? Math.round(slot.x - totalW / 2)
          : (slot.x - rr_ - 18 - totalW);
    var y = slot.y - cardH / 2;
    // [2026-11-06 用户] 「禁止 +N 截断」-> 全部画出, 不再有 "+N" 标记
    // [2026-11-09 用户] 被 4 取走的牌 -> 桌面右下角标「取」(不再整手半透明)
    for (var j = 0; j < n; j++) {
      // 内容一律按 step 宽居中 -> 和其他手牌位置一致
      var _cd = cards[j];
      drawMiniCard(ctx, _cd, x0 + j * step, y, cardW, cardH, st, step);
      // [2026-11-09 用户] 「透明度不要了, 只在桌面上被取的牌的右下角标一个半透明的取字」
      //   -> 「被取走」从**引擎状态**反推: 被取走的牌会以副本进取牌者手牌(带「取自」标记),
      //      副本 id 与原牌一致 -> 只有真被取走的那手牌会被标上, 不会被误伤。
      // [2026-11-09 用户] 「标记黄色不明显, 看不出来」+「同一个玩家第二个没被取的蛋子也有取标志」
      //   -> 只认**牌对象自己**的「被取走」标记(capture 时打在原牌上, 副本会去掉这个标记,
      //      所以取牌者以后再打出这手牌不会被误标); 画成**红底黄字**小牌子, 一眼能看见。
      if (st.uiTakenPlay && st.uiTakenPlay[pid] && j === n - 1) {
        // [2026-11-09 用户] 「刚打出的999也没人取牌, 怎么有取的标志呢?」
        //   -> 标志只认「**那一手出牌**被取走过」(uiTakenPlay), 不认牌对象上的标记:
        //      没被取的牌/新打的牌都不会有标志; 同一手只标**最后一张**。
        // [2026-11-09 用户] 「不用每张都标, 只在最后一张的右下角标」+「只是证明当时这手牌被取走了, 再次打出无关」
        //   -> 只标那手牌的**最后一张**; 标记在牌对象上, 副本不带 -> 以后再打出不会被标。
        var _fs2 = Math.max(10, Math.round(m.vh * 0.032));
        var _bw = _fs2 * 1.5, _bh = _fs2 * 1.25;
        var _bx = x0 + j * step + cardW - _bw - 1;
        var _by = y + cardH - _bh - 1;
        ctx.save();
        ctx.fillStyle = 'rgba(190,30,30,0.92)';
        rr(ctx, _bx, _by, _bw, _bh, 3); ctx.fill();
        ctx.fillStyle = '#ffe9a8';
        text(ctx, '取', _bx + _bw / 2, _by + _bh / 2, _fs2, '#ffe9a8', 'center', true);
        ctx.restore();
      }
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
  // [2026-11-03 用户] 「别人出牌时真人玩家也可以提前选择手里的牌, 只是不能打出」
  //   -> 命中区在 PLAY 阶段**一直注入**(不再只限真人回合), 让真人能提前预选;
  //      能不能真的打出去由 game.js doPlay 的「现在不是你的回合」守卫管。
  var showHit = (g.phase === 'PLAY');
  for (var i = 0; i < n; i++) {
    var card = sorted[i];
    var isSel = st.selectedCards.indexOf(card.id) >= 0;
    var x = L2.x0 + i * L2.step;
    drawCard(ctx, card, x, L2.y - (isSel ? L2.lift : 0), L2.cardW, L2.cardH, isSel, st, L2.step);
    // [2026-11-03 用户] 「手牌区最右侧的手牌右侧点击无法选中这张牌」
    //   -> 右边那张**整张露出**(后面没有底牌牌背压着)时, 命中区要盖住整张牌,
    //      否则牌面右边一条点不到。有底牌时它被牌背压住, 仍用 step 宽(= 露出来的那一条)。
    //   注: 命中区的 w 保持 step(契约: 等宽/居中/首尾相接), 额外用 fullW 记整张宽度。
    var _full = (i === n - 1 && !bottom) ? L2.cardW : 0;
    if (showHit) boxes.push({ x: x, y: L2.y, w: L2.step, h: L2.cardH, cardId: card.id, fullW: _full });
  }
  if (bottom) {
    drawCardBack(ctx, L2.x0 + n * L2.step, L2.y, L2.cardW, L2.cardH);
  }
  // [2026-11-04 用户] 托管时真人手牌处显示**半透明「取消托管」**标识
  //   -> 点这块区域也能取消托管(命中框由 game.js 记录)。
  if (st.autoPlay) {
    // [2026-11-07 23:22 用户] 「取消托管按钮再稍微大一点, 上移一点」
    var _cw = Math.max(112, Math.round(m.vw * 0.19));
    var _ch = Math.round(m.vh * 0.088);
    var _cx = m.vw / 2 - _cw / 2 - 6;   // [2026-11-09 用户] 「取消托管靠右了, 再往左一点」
    // [2026-11-06 用户] 「取消托管」标识放到**手牌下半部、数字下方**
    //   -> 原来画在手牌**上方**(L2.y - _ch/2), 现在压在手牌下半部、点数数字下面。
    // [2026-11-08 用户] 「取消托管稍微下移一点, 不要压着数字」-> 0.60 -> 0.67
    var _cy = Math.round(L2.y + L2.cardH * 0.67 - _ch / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    rr(ctx, _cx, _cy, _cw, _ch, Math.round(_ch * 0.35)); ctx.fill();
    ctx.strokeStyle = 'rgba(255,217,138,0.85)'; ctx.lineWidth = 1.5;
    rr(ctx, _cx, _cy, _cw, _ch, Math.round(_ch * 0.35)); ctx.stroke();
    text(ctx, '取消托管', _cx + _cw / 2, _cy + _ch / 2, Math.max(12, Math.round(m.vh * 0.040)), '#ffd98a', 'center', true);
    boxes.push({ x: _cx, y: _cy, w: _cw, h: _ch, cancelAutoPlay: true });
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
  // [2026-11-06 用户] 「牌上的字大一点」-> 0.42/0.46 -> 0.46/0.50
  var numFs = Math.max(11, Math.round(w * 0.46));
  var suitFs = Math.max(12, Math.round(w * 0.50));
  var numY = y + h / 2 - numFs * 0.78;   // [2026-10-26] 牌面文字整体上移
  var suitY = y + h / 2 + suitFs * 0.46;   // 跟着上移
  text(ctx, st.rankDesc(card), cx, numY, numFs, col, 'center', true);
  text(ctx, SUIT_CHAR[card.suit] || '', cx, suitY, suitFs, col, 'center', true);
  // [2026-11-08 22:40 用户] 「被4取走的蛋子+加点标志」-> 用**绿色描边**标记;
  //   牌面保持干净(2026-10-25 基线), 但一眼能看出这手是被4取走的。
  // [2026-11-09 用户] 「4取牌后不是手牌变化, 是桌面上被取的牌变化, **不要加绿框**」
  //   -> 手牌区不再描绿框; 改成: 桌面(受害者座位)那手被取的牌半透明 + 飞向取牌者手牌。
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
  // [2026-11-06 用户] 「打出的手牌整体大一些」-> 字号同步放大
  var numFs = Math.max(9, Math.round(w * 0.44));
  var suitFs = Math.max(10, Math.round(w * 0.48));
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
  // [2026-10-26] 真人自己的座位也要显示「不出」/「已出完」
  //   (之前只有 AI 座位有 -> 真人过牌后看不到自己的状态; 也漏了「已出完」提示)
  //   位置: 头像**上方**(右边被手牌区占住)
  var _playedThisTrick = (st.uiPlaysTrick || {})[st.humanPlayer] === st.uiTrickId;
  // [2026-11-04 用户] 「开局前每个人前面都显示已出完」-> 同上: 发牌阶段不算出完
  var _isOut = (g.phase === 'PLAY' || g.phase === 'GAME_END') && me && me.hand && me.hand.length === 0;
  // [2026-11-08 23:36 用户] 「托管后 AI 替我过牌还是看不到不出文字」-> 除了 UI 标记, 也读引擎的 passedPlayers
  // [2026-11-08 23:59] 只看 UI 层标记 st.uiPassed: 引擎的 passedPlayers 语义是「有人出牌就清全员」,
  //   别人一出手就会把真人的「不出」也带走(用户报障: 下家出完牌后上家的不出文字没了)。
  var _isPassed = (g.phase === 'PLAY') && !!((st.uiPassed || {})[st.humanPlayer]);
  // [2026-11-09 用户] 「托管后不出还会随机丢失」+「真人玩家的大贡颜色和其他人不一样」
  //   -> 「不出」只看他最后动作(不再被「本轮出过牌」压住); 大贡/二贡颜色与 AI 座位一致(#f0a500)。
  var _s2 = '';
  if (_isOut) {
    if (!_playedThisTrick) _s2 = gongLabelOf(st.gameState, st.humanPlayer) || '已出完';
  } else if (_isPassed) {
    _s2 = '不出';
  }
  if (_s2) {
    // [2026-11-03 用户] 「真人玩家的不出文字和打出的手牌在同一个位置」-> 画在 layout().humanPlay
    text(ctx, _s2, m.humanPlay.x, m.humanPlay.y,
      Math.max(12, Math.round(m.vh * 0.044)),
      (_isOut && gongLabelOf(st.gameState, st.humanPlayer)) ? '#f0a500' : (_isOut ? '#9a9a9a' : '#ffd700'), 'center', true);
  }
  text(ctx, st.names[SEAT_IDS.indexOf(st.humanPlayer)], colX + fs * 0.5, cy, fs,
    st.currentPlayer === st.humanPlayer ? '#ffd700' : '#ffffff', 'right', true);
  return null;
}

// ===== 倒计时(按钮行中央正上方, 样式参照图3 闹钟) =====
function drawTurnInfo(ctx, st, m, seatMap) {
  if (!st.turnDeadline) return;
  var c = m.turn;
  // [2026-11-03 用户] 「其他玩家出牌时的倒计时在他们自己前方, 不能都放在真人玩家这块」
  //   -> 当前玩家是 AI 时, 闹钟画在**他自己头像内侧**(和他出牌 / 「不出」同一个方向)。
  var _pid = st.currentPlayer;
  var _slot = (_pid && seatMap) ? seatMap[_pid] : null;
  if (_pid && _pid !== st.humanPlayer && _slot && _slot.side !== 'C') {
    var _rr = Math.round(m.vh * 0.052);
    var _inw = _slot.side === 'L' ? 1 : -1;
    var _rad = Math.round(m.vh * 0.055);
    // [2026-11-04] 跟出牌/「不出」保持同一档距离(离头像更远)
    c = { x: _slot.x + _inw * (_rr + _rad + 20), y: _slot.y };
  }
  var total = st.turnTotal || 20000;
  var left = Math.max(0, st.turnDeadline - Date.now());
  var sec = Math.ceil(left / 1000);
  // [2026-10-27 用户] 亮A 的 5 秒倒计时**要看得见**: 表盘更大 + 数字更大 + 下面写明后果
  // [2026-11-03] 反A / 次方身份的 5 秒倒计时同样用大表盘
  var isLiang = !!st.turnIsLiang || !!st.turnIsGate;
  // [2026-11-06 用户] 「出牌的闹钟大小和亮A的闹钟一样」-> 统一 0.062H
  // [2026-11-06 用户] 所有闹钟稍微小一点 -> 0.055H
  var r = Math.round(m.vh * 0.055);
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
  text(ctx, String(sec), c.x, c.y,
       Math.max(22, Math.round(m.vh * 0.076)),
       sec <= 5 ? '#c8102e' : '#5e2417', 'center', true);
  // [2026-11-03 用户] 「出牌前亮A等倒计时的提示文字不要」
  //   -> 闸门倒计时**只画表盘和秒数**, 下面那行说明文字去掉。
}

// ===== 按钮 =====
// [2026-11-03 用户] 按钮行的位置被「打出的手牌」**或**「不出」文字占着
//   (两者都在 layout().humanPlay) -> 这时候按钮让位隐藏, 轮到自己时恢复。
function _uiHumanRowTaken(st) {
  var hp = (st.uiPlays || {})[st.humanPlayer];
  if (hp && hp.length) return true;
  if ((st.uiPassed || {})[st.humanPlayer]) return true;
  var me = (st.gameState.players || []).filter(function (p) { return p.id === st.humanPlayer; })[0];
  if (me && me.hand && me.hand.length === 0) return true;
  return false;
}

function drawButtons(ctx, st, m, list) {
  // [2026-10-25] 结算阶段: 「下一局」由 drawSettlement 画在**面板内下方中央** -> 这里跳过, 免得画两个
  if (st.phase === 'GAME_END') return [];
  // [2026-11-03 用户] 真人出的牌画在**原来按钮的位置**(layout().humanPlay)
  //   -> 那里显示着牌时**按钮隐藏**(用户原话「按钮隐藏掉」)。
  //   判据用 st.uiPlays: 真人出牌后有记录(牌画在那儿); 轮到自己时 game.js 的
  //   advanceCurrentPlayer 会清掉它 -> 按钮重新出现(用户原话「轮到自己出牌时上一手牌
  //   应该清掉显示按钮」)。
  var _hp = (st.uiPlays || {})[st.humanPlayer];
  if (st.phase === 'PLAY' && (_hp && _hp.length)) return [];
  // [2026-11-03] 「不出」文字也画在按钮位 -> 同样让位
  if (st.phase === 'PLAY' && _uiHumanRowTaken(st)) return [];
  var boxes = buttonLayout(list, m);
  var fs = Math.max(11, Math.round(m.vh * 0.038));
  for (var i = 0; i < boxes.length; i++) {
    var b = boxes[i];
    var on = b.enabled;
    // [2026-10-26] 花色按钮: 浅色底 + 花色本身的颜色(像一张牌), 符号画大一点
    var isSuit = (b.kind === 'suit');
    // [2026-11-04 用户] 「4个大A按钮可用不可用时区分不明显，调整一下背景」
    //   -> 可用 = **亮牌面**(近白底 + 花色本色字 + 金色粗边)
    //   -> 不可用 = **深暗底**(近黑底 + 极暗字 + 细灰边)
    //      两者底色明度差拉大, 一眼能分辨。
    if (isSuit) {
      if (on) {
        ctx.fillStyle = '#fffdf6';
        rr(ctx, b.x, b.y, b.w, b.h, Math.round(b.h * 0.30)); ctx.fill();
        ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 2;
        rr(ctx, b.x, b.y, b.w, b.h, Math.round(b.h * 0.30)); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(10,10,10,0.78)';
        rr(ctx, b.x, b.y, b.w, b.h, Math.round(b.h * 0.30)); ctx.fill();
        ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1;
        rr(ctx, b.x, b.y, b.w, b.h, Math.round(b.h * 0.30)); ctx.stroke();
      }
    } else {
      ctx.fillStyle = on ? (b.id === 'hint' ? '#2f8f4f' : (b.id === 'play' ? '#1e6091' : '#8a5a2b')) : '#4a4a4a';
      rr(ctx, b.x, b.y, b.w, b.h, Math.round(b.h * 0.30)); ctx.fill();
      ctx.strokeStyle = on ? '#ffd98a' : '#6a6a6a'; ctx.lineWidth = on ? 2 : 1;
      rr(ctx, b.x, b.y, b.w, b.h, Math.round(b.h * 0.30)); ctx.stroke();
    }
    // [2026-11-06 用户] 「亮A按钮太小了, 整体放大」-> 花色符号跟着放大
    var fs2 = isSuit ? Math.max(20, Math.round(m.vh * 0.068)) : fs;
    var col2 = on ? (isSuit ? suitColor(b.suit) : '#ffffff') : (isSuit ? 'rgba(255,255,255,0.22)' : '#9a9a9a');
    text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, fs2, col2, 'center', true);
  }
  return boxes;
}

// ===== 提示条 =====
function drawToast(ctx, st, m) {
  var t = st.toast;
  if (!t || !t.text || t.until <= Date.now()) return;
  var fs = Math.max(11, Math.round(m.vh * 0.036));
  var tw = (typeof ctx.measureText === 'function') ? ctx.measureText(t.text).width + fs * 2 : 180;
  // [2026-10-27 用户] 提示条原来贴在**顶栏下面**, 太靠上 -> 改成**屏幕正中**
  // [2026-11-03 用户] 「提示文字移到手牌上方一点, 不要压住其他东西」
  //   -> 改贴**手牌区上沿的正上方**(按钮行下方 / 手牌上方):
  //      不再压屏幕正中那一块(那里有轮次提示/阶段提示), 也不压按钮行。
  var th = Math.round(m.vh * 0.072);
  var tgap = Math.round(m.vh * 0.015);
  var tx = m.vw / 2 - tw / 2, ty = Math.round(m.hand.y - th - tgap);
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  rr(ctx, tx, ty, tw, th, 6); ctx.fill();
  ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 1.5;
  rr(ctx, tx, ty, tw, th, 6); ctx.stroke();
  text(ctx, t.text, tx + tw / 2, ty + th / 2, fs, '#ffd700', 'center', true);
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
// [2026-10-27] 结算画面几何 —— 抽成**纯函数**(单一来源: 绘制和测试都用它)
//   标题带 0.165H(标题离下面明细远一点) / 行高 0.070H / 戊行到按钮 0.016H / 下边距 0.016H
//   面板高度按内容算, 整体位置比居中**偏下** 0.02H(用户: 结算画面整体往下一点)
function settlementLayout(m) {
  var titleFs = Math.max(15, Math.round(m.vh * 0.050));
  var titleH = Math.round(m.vh * 0.165);
  var rowH = Math.round(m.vh * 0.070);
  var gapBtn = Math.round(m.vh * 0.016);
  var padBottom = Math.round(m.vh * 0.016);
  var btnH = Math.round(m.vh * 0.080);
  var btnW = Math.round(m.vw * 0.26);
  var ph = Math.min(Math.round(m.vh * 0.88), titleH + 5 * rowH + gapBtn + btnH + padBottom);
  var pw = Math.min(540, m.vw * 0.90);
  return {
    pw: pw, ph: ph,
    px: (m.vw - pw) / 2,
    py: (m.vh - ph) / 2 + m.vh * 0.02,
    titleFs: titleFs, titleH: titleH, rowH: rowH,
    gapBtn: gapBtn, padBottom: padBottom,
    btnW: btnW, btnH: btnH
  };
}

function drawSettlement(ctx, st, m) {
  var d = st.settlement;
  if (!d) return null;
  // [2026-10-26 用户] 3) 结算画面**高度减小**; 戊那一行和「下一局」按钮**近一点**
  //   面板高度改成**按内容算**(标题带 + 5 行 + 间距 + 按钮 + 下边距), 不再写死 280
  // [2026-10-26 用户] 4) 玩家行的底纹高度**还原**(之前改小了) ——
  //   用户说的「玩家阴影区域」指的是**底部手牌暗区**, 不是结算画面里的玩家行
  // [2026-10-26 用户] 标题**不能压住甲那一行** -> 标题带留够高度, 标题在带内垂直居中
  var SL = settlementLayout(m);
  var pw = SL.pw, ph = SL.ph, px = SL.px, py = SL.py;
  var titleFs = SL.titleFs, titleH = SL.titleH, rowH = SL.rowH;
  var gapBtn = SL.gapBtn, padBottom = SL.padBottom;
  var bw2 = SL.btnW, bh2 = SL.btnH;
  ctx.fillStyle = 'rgba(20,8,4,0.92)';
  rr(ctx, px, py, pw, ph, 10); ctx.fill();
  ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 2;
  rr(ctx, px, py, pw, ph, 10); ctx.stroke();
  var w = (d.res && d.res.winner) || 'draw';
  var title = (w === 'draw') ? '平局' : (w + '胜');
  text(ctx, '本局结束 · ' + title, px + pw / 2, py + titleH * 0.5, titleFs, '#ffd98a', 'center', true);
  var camps = (st.gameState['主方'] || []);
  // [2026-11-06 23:54 用户] 结算画面把谁是头名标出来
  var _head = (d && d['头名']) || (st.gameState && st.gameState['头名']) || null;
  var rowY = py + titleH;
  var cw = 17, ch = 24, cstep = 12;   // [2026-10-26] 还原原来的小牌尺寸
  var isAce = st.isMainAce || function () { return false; };
  for (var i = 0; i < SEAT_IDS.length; i++) {
    var pid = SEAT_IDS[i];
    var y = rowY + i * rowH;
    var p = st.gameState.players.filter(function (x) { return x.id === pid; })[0];
    var camp = camps.indexOf(pid) >= 0 ? '主方' : '抓方';
    var delta = d.scores ? d.scores[pid] : undefined;
    // [2026-10-26] 平局/无数据 -> 显示 0 分(不是 —)
    // [2026-10-27 用户] 结算画面积分后面加「分」字
    var dtxt = (delta === undefined) ? '0分' : ((delta > 0 ? '+' : '') + delta + '分');
    ctx.fillStyle = (i % 2 === 0) ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)';
    rr(ctx, px + 12, y - rowH * 0.46, pw - 24, rowH * 0.92, 3); ctx.fill();
text(ctx, st.names[i], px + 22, y, Math.max(11, Math.round(m.vh * 0.036)), (pid === st.humanPlayer ? '#ffd700' : '#ffffff'), 'left', true);
    text(ctx, camp + ' · 剩 ' + ((p && p.hand) ? p.hand.length : 0), px + 92, y, Math.max(9, Math.round(m.vh * 0.028)), '#aaaaaa', 'left', false);
    // [2026-11-08 22:40 用户] 结算画面不再显示「头名」, 改成按出完顺序显示 大贡/二贡/三贡/四贡;
    //   标签放在**分数左边**(别压着分数)。
    var _gl2 = gongLabelOf(st.gameState, pid);
    if (_gl2) {
      // [2026-11-08 23:36 用户] 「结算画面的大贡二贡等标签往右移」-> 从 -108 挪到 -90
      // [2026-11-09 用户] 「结算画面的大贡二贡等标签稍微往左移一点点」-> -62 挪到 -72
      // [2026-11-09 用户] 上一批把画标签那一行**替换成了注释** -> 结算画面根本不画标签(报障「没有几贡标志」)
      text(ctx, _gl2, px + pw - 72, y, Math.max(9, Math.round(m.vh * 0.026)), '#ffd98a', 'right', true);
    }
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
  var bx2 = px + (pw - bw2) / 2, by2 = py + ph - bh2 - padBottom;
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
  var autoIcon = { x: m.autoPlay.iconX, y: m.autoPlay.iconY, r: m.autoPlay.iconR };
  drawTopBar(ctx, st, m, memoIcon, autoIcon);
  drawMemo(ctx, st, m);
  var seatInfo = drawSeats(ctx, st, m);
  drawTurnInfo(ctx, st, m, seatInfo.seatMap);
  var btnBoxes = drawButtons(ctx, st, m, st.buttons || []);
  var switchHit = drawMeSeat(ctx, st, m);
  var handBoxes = drawHand(ctx, st, m);
  drawToast(ctx, st, m);
  var settleBtn = (st.phase === 'GAME_END') ? drawSettlement(ctx, st, m) : null;
  return {
    btnLog: null, btnStage: btnBoxes, handHitboxes: handBoxes,
    seatHitboxes: seatInfo.boxes, markHits: seatInfo.markHits,
    memoIcon: memoIcon, autoPlayIcon: autoIcon, layout: m,
    switchHit: switchHit,
    settleBtn: settleBtn,
    cancelAutoPlayBox: (handBoxes || []).filter(function (b) { return b.cancelAutoPlay; })[0] || null,
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
  SEAT_IDS: SEAT_IDS, SUIT_CHAR: SUIT_CHAR, RANKS_DESC: RANKS_DESC,
  settlementLayout: settlementLayout
};