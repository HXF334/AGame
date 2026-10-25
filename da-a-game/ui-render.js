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
    hand: { y: vh * 0.700, maxW: vw * 0.74, cardH: vh * 0.200, ratio: 0.64 },
    me: { x: safe + r + 2, r: r, y: vh * 0.700 + vh * 0.200 * 0.42 },
    // [2026-10-25] 记牌器入口图标(顶部中央, 点击展开/收起)
    memo: { iconX: vw * 0.5, iconY: vh * 0.062, iconR: Math.round(vh * 0.036) }
  };
}

// 手牌几何: 命中区用**精确步长**(浮点不取整) -> 相邻命中区严格不重叠
function handLayout(n, m) {
  var cardH = m.hand.cardH;
  var cardW = Math.round(cardH * m.hand.ratio);
  var maxW = m.hand.maxW;
  var step;
  if (n <= 1) step = cardW;
  else {
    var avail = maxW - cardW;
    step = Math.min(cardW, avail / (n - 1));
    if (step < 10) step = 10;
  }
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
    var camps = (g['主方'] || []);
    var ids = SEAT_IDS.map(function (id) {
      var c = camps.indexOf(id) >= 0 ? '主' : '次';
      return c + st.names[SEAT_IDS.indexOf(id)];
    });
    text(ctx, ids.join(' '), x + m.vw * 0.16, y1, fs, '#ffffff', 'left', false);
  }

  // 记牌器图标(中央, 可点展开/收起)
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
function drawMemo(ctx, st, m) {
  if (!st.memoOpen) return;
  var items = st.memoItems || [];
  var n = items.length;
  if (!n) return;
  var cw = Math.round(m.vw * 0.049);
  var total = n * cw;
  var x0 = (m.vw - total) / 2;
  var y = m.top.h + Math.round(m.vh * 0.008);
  var cardW = Math.round(cw * 0.80);
  var cardH = Math.round(cardW * 1.40);
  var numH = Math.round(m.vh * 0.032);
  var pw = total + Math.round(m.vw * 0.016);
  var px = (m.vw - pw) / 2;
  var panelH = cardH + numH + Math.round(m.vh * 0.024);
  ctx.fillStyle = 'rgba(0,0,0,0.86)';
  rr(ctx, px, y - 4, pw, panelH + 8, 6); ctx.fill();
  ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 1;
  rr(ctx, px, y - 4, pw, panelH + 8, 6); ctx.stroke();
  for (var i = 0; i < n; i++) {
    var it = items[i];
    var cx = x0 + i * cw + cw / 2;
    // 上排: 白底小牌面
    ctx.fillStyle = '#fdfdf6';
    rr(ctx, cx - cardW / 2, y, cardW, cardH, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    rr(ctx, cx - cardW / 2, y, cardW, cardH, 2); ctx.stroke();
    if (it.icon) {
      text(ctx, it.icon, cx, y + cardH * 0.50, Math.max(10, Math.round(cardW * 0.50)), it.color || '#c8102e', 'center', true);
    } else {
      text(ctx, it.label, cx, y + cardH * 0.34, Math.max(8, Math.round(cardW * 0.40)), '#1a1a1a', 'center', true);
      text(ctx, it.suitChar || '', cx, y + cardH * 0.72, Math.max(9, Math.round(cardW * 0.42)), it.suitColor || '#1a1a1a', 'center', true);
    }
    // 下排: 数量(白底黑字, 统一黑色)
    var nbY = y + cardH + Math.round(m.vh * 0.006);
    ctx.fillStyle = '#f4f0e6';
    rr(ctx, cx - cardW / 2, nbY, cardW, numH, 2); ctx.fill();
    text(ctx, String(it.value), cx, nbY + numH / 2, Math.max(9, Math.round(m.vh * 0.026)), '#000000', 'center', true);
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
function drawSeats(ctx, st, m) {
  var g = st.gameState;
  var r = Math.round(m.vh * 0.052);
  var passed = g.passedPlayers || [];
  var scores = st.scores || {};
  var so = seatOrder(st.humanPlayer);
  var slots = { L1: m.seats[0], L2: m.seats[1], R1: m.seats[2], R2: m.seats[3] };
  var assign = {};
  assign[so.L1] = slots.L1; assign[so.L2] = slots.L2;
  assign[so.R1] = slots.R1; assign[so.R2] = slots.R2;
  var camp = st.camps || {};
  var out = [], seatMap = {}, markHits = [];
  var myMarks = (st.marks || {})[st.humanPlayer] || {};
  SEAT_IDS.forEach(function (pid) {
    if (pid === st.humanPlayer) return;
    var pos = assign[pid];
    if (!pos) return;
    seatMap[pid] = pos;
    var p = g.players.filter(function (x) { return x.id === pid; })[0];
    var isCur = st.currentPlayer === pid;
    var isPassed = passed.indexOf(pid) >= 0;
    var isOut = p && p.hand && p.hand.length === 0;
    var rr_ = Math.round(r * (isCur ? 1.14 : 1));
    var cx = pos.x, cy = pos.y;
    var outw = pos.side === 'L' ? -1 : 1;
    var fs = Math.max(10, Math.round(m.vh * 0.034));
    var nm = st.names[SEAT_IDS.indexOf(pid)];
    var nameX = cx + outw * (rr_ + 6);
    var nameA = pos.side === 'L' ? 'right' : 'left';
    text(ctx, nm, nameX, cy - rr_ * 0.30, fs, isCur ? '#ffd700' : '#ffffff', nameA, isCur);
    var cnt = p && p.hand ? p.hand.length : 0;
    var bw = Math.round(r * 0.92), bh = Math.round(r * 0.60);
    var bx = pos.side === 'L' ? (cx - rr_ - 6 - bw) : (cx + rr_ + 6);
    var by = cy + rr_ * 0.30;
    ctx.fillStyle = isOut ? '#555' : '#2f6fb5';
    rr(ctx, bx, by, bw, bh, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    rr(ctx, bx, by, bw, bh, 4); ctx.stroke();
    text(ctx, String(cnt), bx + bw / 2, by + bh / 2, Math.max(9, Math.round(m.vh * 0.030)), '#ffffff', 'center', true);
    var stTxt = isOut ? '已出完' : (isPassed ? '不出' : '');
    var ly = by + bh + Math.round(m.vh * 0.026);
    if (stTxt) { text(ctx, stTxt, nameX, ly, Math.max(9, Math.round(m.vh * 0.028)), '#cccccc', nameA, false); ly += Math.round(m.vh * 0.036); }
    if (camp.main === pid) { text(ctx, '主方', nameX, ly, Math.max(9, Math.round(m.vh * 0.028)), '#ffd98a', nameA, false); }
    else if (camp.second === pid) { text(ctx, '次方', nameX, ly, Math.max(9, Math.round(m.vh * 0.028)), '#9fd0ff', nameA, false); }
    drawScore(ctx, st, pid, scores[pid], cx, cy + rr_ + Math.round(m.vh * 0.036));
    var mr = Math.round(m.vh * 0.020);
    var mkx = pos.side === 'L' ? (cx - rr_ * 0.72) : (cx + rr_ * 0.72);
    var mky = cy - rr_ * 0.72;
    drawAllyMark(ctx, st, m, mkx, mky, mr, myMarks[pid] || null);
    markHits.push({ x: mkx - mr, y: mky - mr, w: mr * 2, h: mr * 2, id: pid });
    if (st.mainAceMarks && st.mainAceMarks[pid]) {
      var n = st.mainAceMarks[pid];
      var suit = st.mainAceSuit;
      for (var k = 0; k < n; k++) {
        var ax = pos.side === 'L' ? (cx + rr_ * 0.72 - k * Math.round(m.vh * 0.030)) : (cx - rr_ * 0.72 + k * Math.round(m.vh * 0.030));
        var ay = cy - rr_ * 0.72;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        circle(ctx, ax, ay, Math.round(m.vh * 0.022)); ctx.fill();
        text(ctx, suit ? (SUIT_CHAR[suit] || '?') : '?', ax, ay, Math.max(9, Math.round(m.vh * 0.030)), '#ffd700', 'center', true);
      }
    }
    out.push({ x: cx - rr_, y: cy - rr_, w: rr_ * 2, h: rr_ * 2, id: pid });
  });
  drawSeatPlays(ctx, st, m, seatMap);
  return { boxes: out, seatMap: seatMap, markHits: markHits };
}

function drawScore(ctx, st, pid, delta, x, y) {
  var v = (delta === undefined || delta === null) ? 0 : delta;
  var col = v > 0 ? '#7ee08a' : (v < 0 ? '#ff8888' : '#bbbbbb');
  text(ctx, (v > 0 ? '+' : '') + v, x, y, Math.max(10, Math.round((st.H || 390) * 0.033)), col, 'center', true);
}

// ===== 各家最新出牌(只在自己前方) =====
// [2026-10-25] 各家最新出牌 -> 头像**内侧**(朝牌桌中心), 与外侧的名字/牌数分开, 互不遮挡; 牌放大
function drawSeatPlays(ctx, st, m, seatMap) {
  var plays = st.uiPlays || {};
  Object.keys(plays).forEach(function (pid) {
    var cards = plays[pid];
    if (!cards || !cards.length) return;
    var slot = seatMap[pid];
    if (!slot) return;
    var cw = Math.round(m.vh * 0.076), ch = Math.round(cw * 1.34);
    var gap = Math.round(cw * 0.12);
    var n = Math.min(cards.length, 3);
    var total = n * cw + (n - 1) * gap;
    var rr_ = Math.round(m.vh * 0.052);
    var x0 = slot.side === 'L' ? (slot.x + rr_ + 8) : (slot.x - rr_ - 8 - total);
    var y = slot.y - ch / 2;
    for (var j = 0; j < n; j++) drawMiniCard(ctx, cards[j], x0 + j * (cw + gap), y, cw, ch, st);
    if (cards.length > n) {
      text(ctx, '+' + (cards.length - n), x0 + total + 4, y + ch / 2,
        Math.max(8, Math.round(m.vh * 0.026)), '#ffffff', 'left', false);
    }
  });
}

// ===== 手牌(含底牌牌背) =====
// [用户 #9] 底牌在自己手牌区**最右面**, 只显示牌背; 翻开后备选加入手牌
function drawHand(ctx, st, m) {
  // 只画真人自己的手牌: 按 humanPlayer 过滤, 绝不渲染他人手牌
  var g = st.gameState;
  var humanPlayer = st.humanPlayer;
  var me = g.players.filter(function (p) { return p.id === humanPlayer; })[0];
  if (!me) return [];
  var hand = (me.hand || []).slice();
  var bottom = me['底牌'] || null;      // 未翻开的底牌
  var sorted = hand.slice().sort(function (a, b) { return cardPower(b) - cardPower(a); });
  var total = sorted.length + (bottom ? 1 : 0);
  if (!total) return [];

  var L = handLayout(total, m);
  var boxes = [];
  var xAcc = L.x0;
  var showHit = (st.currentPlayer === st.humanPlayer && g.phase === 'PLAY');
  for (var i = 0; i < sorted.length; i++) {
    var card = sorted[i];
    var isSel = st.selectedCards.indexOf(card.id) >= 0;
    var x = xAcc; xAcc += L.step;
    drawCard(ctx, card, x, L.y - (isSel ? L.lift : 0), L.cardW, L.cardH, isSel, st);
    if (showHit) boxes.push({ x: x, y: L.y, w: Math.max(1, L.step), h: L.cardH, cardId: card.id });
  }
  if (bottom) {
    var bx = xAcc;
    drawCardBack(ctx, bx, L.y, L.cardW, L.cardH);
  }
  return boxes;
}

// 牌力排序(大->小): 大A > 大王 > 小王 > 3 > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4
function cardPower(c) {
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
function drawCard(ctx, card, x, y, w, h, isSel, st) {
  var joker = !!(card.isBigJoker || card.isSmallJoker);
  var red = (card.suit === 'H' || card.suit === 'D' || card.isBigJoker);
  var col = joker ? (card.isBigJoker ? '#c8102e' : '#1a1a1a') : (red ? '#c8102e' : '#1a1a1a');
  var isBigAce = st.isMainAce ? !!st.isMainAce(card) : false;
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  rr(ctx, x + 1, y + 2, w, h, 4); ctx.fill();
  ctx.fillStyle = isBigAce ? '#fdf3c8' : '#fdfdf6';
  rr(ctx, x, y, w, h, 4); ctx.fill();
  ctx.strokeStyle = isSel ? '#ffd700' : (isBigAce ? '#d9a05b' : 'rgba(0,0,0,0.4)');
  ctx.lineWidth = isSel ? Math.max(3, w * 0.08) : (isBigAce ? 2 : 1);
  rr(ctx, x, y, w, h, 4); ctx.stroke();
  if (joker) {
    var letters = 'JOKER';
    var lh = h * 0.102;
    var startY = y + h * 0.22;
    for (var li = 0; li < letters.length; li++) {
      text(ctx, letters[li], x + w / 2, startY + li * lh, Math.max(9, Math.round(w * 0.36)), col, 'center', true);
    }
    return;
  }
  text(ctx, st.rankDesc(card), x + w / 2, y + h * 0.30, Math.max(11, Math.round(w * 0.48)), col, 'center', true);
  text(ctx, SUIT_CHAR[card.suit] || '', x + w / 2, y + h * 0.68, Math.max(12, Math.round(w * 0.54)), col, 'center', true);
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
function drawMiniCard(ctx, card, x, y, w, h, st) {
  var joker = !!(card.isBigJoker || card.isSmallJoker);
  var red = (card.suit === 'H' || card.suit === 'D' || card.isBigJoker);
  var col = joker ? (card.isBigJoker ? '#c8102e' : '#1a1a1a') : (red ? '#c8102e' : '#1a1a1a');
  var isBigAce = st.isMainAce ? !!st.isMainAce(card) : false;
  ctx.fillStyle = isBigAce ? '#fdf3c8' : '#fdfdf6';
  rr(ctx, x, y, w, h, 3); ctx.fill();
  ctx.strokeStyle = isBigAce ? '#d9a05b' : 'rgba(0,0,0,0.35)'; ctx.lineWidth = isBigAce ? 2 : 1;
  rr(ctx, x, y, w, h, 3); ctx.stroke();
  if (joker) { text(ctx, '王', x + w / 2, y + h * 0.5, Math.max(9, Math.round(w * 0.46)), col, 'center', true); return; }
  text(ctx, st.rankDesc(card), x + w / 2, y + h * 0.30, Math.max(8, Math.round(w * 0.44)), col, 'center', true);
  text(ctx, SUIT_CHAR[card.suit] || '', x + w / 2, y + h * 0.68, Math.max(9, Math.round(w * 0.50)), col, 'center', true);
}

// ===== 真人头像 + 牌数(手牌左侧, 文字避开刘海) =====
// [2026-10-25] 真人玩家: 积分/名字/牌数/大A图标 与其他玩家一致, **没有敌友钮**
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
  var tx = cx + rr_ + 6;
  text(ctx, st.names[SEAT_IDS.indexOf(st.humanPlayer)], tx, cy - rr_ * 0.30, fs,
    st.currentPlayer === st.humanPlayer ? '#ffd700' : '#ffffff', 'left', true);
  var bw = Math.round(r * 0.92), bh = Math.round(r * 0.60);
  var bx = tx, by = cy + rr_ * 0.30;
  ctx.fillStyle = '#2f6fb5';
  rr(ctx, bx, by, bw, bh, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
  rr(ctx, bx, by, bw, bh, 4); ctx.stroke();
  text(ctx, String(cnt), bx + bw / 2, by + bh / 2, Math.max(9, Math.round(m.vh * 0.030)), '#ffffff', 'center', true);
  drawScore(ctx, st, st.humanPlayer, (st.scores || {})[st.humanPlayer], cx, cy + rr_ + Math.round(m.vh * 0.036));
  if (st.mainAceMarks && st.mainAceMarks[st.humanPlayer]) {
    var n = st.mainAceMarks[st.humanPlayer];
    var suit = st.mainAceSuit;
    for (var k = 0; k < n; k++) {
      var ax = cx + rr_ * 0.72 - k * Math.round(m.vh * 0.030);
      var ay = cy - rr_ * 0.72;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      circle(ctx, ax, ay, Math.round(m.vh * 0.022)); ctx.fill();
      text(ctx, suit ? (SUIT_CHAR[suit] || '?') : '?', ax, ay,
        Math.max(9, Math.round(m.vh * 0.030)), '#ffd700', 'center', true);
    }
  }
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
function drawSettlement(ctx, st, m) {
  var d = st.settlement;
  if (!d) return;
  var pw = Math.min(460, m.vw * 0.78), ph = Math.min(280, m.vh * 0.86);
  var px = (m.vw - pw) / 2, py = (m.vh - ph) / 2 - m.vh * 0.03;
  ctx.fillStyle = 'rgba(20,8,4,0.90)';
  rr(ctx, px, py, pw, ph, 10); ctx.fill();
  ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 2;
  rr(ctx, px, py, pw, ph, 10); ctx.stroke();
  var title = (d.res && d.res.winner && d.res.winner !== 'draw') ? (st.names[SEAT_IDS.indexOf(d.res.winner)] + ' 胜') : '平局';
  text(ctx, '本局结束 · ' + title, px + pw / 2, py + 26, Math.max(15, Math.round(m.vh * 0.052)), '#ffd98a', 'center', true);
  if (d.res && d.res.reason) text(ctx, d.res.reason, px + pw / 2, py + 50, Math.max(10, Math.round(m.vh * 0.032)), '#dddddd', 'center', false);
  var camps = (st.gameState['主方'] || []);
  var rowY = py + 76, rowH = Math.round(m.vh * 0.082);
  for (var i = 0; i < SEAT_IDS.length; i++) {
    var pid = SEAT_IDS[i];
    var y = rowY + i * rowH;
    var p = st.gameState.players.filter(function (x) { return x.id === pid; })[0];
    var camp = camps.indexOf(pid) >= 0 ? '主方' : '抓方';
    var delta = d.scores ? d.scores[pid] : undefined;
    var dtxt = (delta === undefined) ? '—' : ((delta > 0 ? '+' : '') + delta);
    ctx.fillStyle = (i % 2 === 0) ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)';
    rr(ctx, px + 14, y - rowH * 0.40, pw - 28, rowH * 0.80, 4); ctx.fill();
    text(ctx, st.names[i] + (pid === st.humanPlayer ? '(你)' : ''), px + 26, y, Math.max(12, Math.round(m.vh * 0.038)), '#ffffff', 'left', true);
    text(ctx, camp + ' · 剩 ' + ((p && p.hand) ? p.hand.length : 0), px + 118, y, Math.max(10, Math.round(m.vh * 0.032)), '#aaaaaa', 'left', false);
    text(ctx, dtxt, px + pw - 26, y, Math.max(12, Math.round(m.vh * 0.042)),
         (delta > 0) ? '#7ee08a' : ((delta < 0) ? '#ff8888' : '#cccccc'), 'right', true);
  }
}

// ===== 入口 =====
// [2026-10-25] 顶栏第二行: 5 个**可点**的玩家按钮(名字 + 阵营)
//   作用: 1) 测试模式下切换真人视角 2) 显示阵营(主/次)
//   [用户] 阵营要显示正确: 只给主A持有者标「主方」, 次方仅身份亮明后标「次方」
function drawPlayerBar(ctx, st, m) {
  if (!st.testMode) return [];
  var camp = st.camps || {};
  var y = m.top.h * 0.70;
  var h = Math.round(m.vh * 0.040);
  var w = Math.round(m.vw * 0.062);
  var gap = Math.round(m.vw * 0.006);
  var x0 = m.safeL + 4;
  var out = [];
  for (var i = 0; i < SEAT_IDS.length; i++) {
    var pid = SEAT_IDS[i];
    var x = x0 + i * (w + gap);
    var isMe = pid === st.humanPlayer;
    var isMain = camp.main === pid;
    var isSecond = camp.second === pid;
    ctx.fillStyle = isMe ? 'rgba(217,160,91,0.85)' : 'rgba(255,255,255,0.12)';
    rr(ctx, x, y - h / 2, w, h, 4); ctx.fill();
    ctx.strokeStyle = isMe ? '#ffd700' : 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1;
    rr(ctx, x, y - h / 2, w, h, 4); ctx.stroke();
    text(ctx, st.names[i], x + w * 0.30, y, Math.max(9, Math.round(m.vh * 0.030)),
      isMe ? '#3a2408' : '#ffffff', 'center', true);
    var tag = isMain ? '主' : (isSecond ? '次' : '');
    if (tag) {
      text(ctx, tag, x + w * 0.74, y, Math.max(9, Math.round(m.vh * 0.028)),
        isMain ? '#ffd98a' : '#9fd0ff', 'center', true);
    }
    out.push({ x: x, y: y - h / 2, w: w, h: h, id: pid });
  }
  return out;
}

function render(ctx, st) {
  var m = layout(st.W, st.H);
  drawTable(ctx, m);
  var memoIcon = { x: m.memo.iconX, y: m.memo.iconY, r: m.memo.iconR };
  drawTopBar(ctx, st, m, memoIcon);
  drawMemo(ctx, st, m);
  var seatInfo = drawSeats(ctx, st, m);
  drawTurnInfo(ctx, st, m);
  var btnBoxes = drawButtons(ctx, st, m, st.buttons || []);
  var playerBtns = drawPlayerBar(ctx, st, m);
  drawMeSeat(ctx, st, m);
  var handBoxes = drawHand(ctx, st, m);
  drawToast(ctx, st, m);
  if (st.phase === 'GAME_END') drawSettlement(ctx, st, m);
  return {
    btnLog: null, btnStage: btnBoxes, handHitboxes: handBoxes,
    seatHitboxes: seatInfo.boxes, markHits: seatInfo.markHits,
    memoIcon: memoIcon, layout: m,
    playerBtns: playerBtns,
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