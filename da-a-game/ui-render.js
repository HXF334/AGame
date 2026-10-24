// ui-render.js — 界面渲染层（牌桌 / 玩家 / 手牌 / 按钮 / 倒计时）
//
// [为什么单独一个文件] 2026-10-24 UI 重做。理由:
//   1. 纯几何函数可在**无 canvas** 的无头测试里验证(与 game.js 同坐标系: CSS 像素)
//   2. game.js 已 1400+ 行, 再塞渲染逻辑会更难维护
//   3. 渲染层**不含任何规则判断** —— 合法性全部由引擎给出, UI 只负责呈现
//
// [坐标系] 一律用 **CSS 像素**: game.js 的 W/H = canvas.width/height,
//   触摸用 touch.clientX/clientY。两者同空间, **不做 dpr 换算**
//   (见 skills/game-ui-engine-contract §5.4: 混用 dpr 会导致真机点不中)。
//
// [视觉参考] 用户提供的打大A 截图的**布局思路**:
//   横屏 / 暖红棕牌桌 / 中央留白 / 其他玩家分布四周 / 手牌固定底部 /
//   当前行动者一眼可辨 / 底部操作按钮。**不照搬**其规则、文字、广告与无关功能。

var SEAT_IDS = ['A', 'B', 'C', 'D', 'E'];
var SUIT_CHAR = { H: '♥', D: '♦', C: '♣', S: '♠' };
var SEAT_COLOR = ['#4f8f5b', '#3f7fa8', '#a86a3f', '#8a5aa8', '#a85555'];

// ===== 布局常量（全部相对比例, 适配横屏）=====
// 无 canvas 时的空上下文: 让 render() **仍然算几何**(命中区), 只是不绘制。
// 无头测试靠这个验证「按钮/手牌命中区」, 不用真机。
function noopCtx() {
  var c = { measureText: function (t) { return { width: String(t || '').length * 8 }; } };
  var M = ['fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'beginPath',
           'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'fill', 'stroke',
           'save', 'restore', 'translate', 'scale', 'rotate', 'setLineDash', 'drawImage',
           'clip', 'quadraticCurveTo', 'bezierCurveTo', 'rect'];
  for (var i = 0; i < M.length; i++) c[M[i]] = function () {};
  return c;
}
function layout(W, H) {
  var vw = W || 844, vh = H || 390;
  return {
    vw: vw, vh: vh,
    top: { h: vh * 0.115 },
    table: { cx: vw * 0.5, cy: vh * 0.30, rx: vw * 0.415, ry: vh * 0.185 },
    // 4 个 AI 分布在牌桌左右（真人信息在顶栏, 不占桌面）
    seats: {
      A: { x: vw * 0.105, y: vh * 0.205, side: 'L' },
      B: { x: vw * 0.105, y: vh * 0.400, side: 'L' },
      C: { x: vw * 0.895, y: vh * 0.205, side: 'R' },
      D: { x: vw * 0.895, y: vh * 0.400, side: 'R' },
      E: { x: vw * 0.895, y: vh * 0.590, side: 'R' }
    },
    center: { x: vw * 0.5, y: vh * 0.285 },
    turn: { x: vw * 0.5, y: vh * 0.505 },
    btn: { y: vh * 0.555, h: vh * 0.105 },
    hand: { y: vh * 0.735, maxW: vw * 0.90, cardH: vh * 0.215, ratio: 0.64 }
  };
}

// 手牌几何: 按张数自适应宽度, 重叠时给"抬升"留出可辨空间
// [完成判据] 最左/最右一张都在可用宽度内; n=1 时不除零
// 手牌几何: 命中区用**精确步长**(浮点, 不取整) -> 相邻命中区严格不重叠。
// [2026-10-24] 关键决定: 命中区 = **牌肩**(每张牌露在上一张左边的部分),
//   宽度正好是步长。整排命中区首尾相接铺满手牌条, 因此:
//   1) 宽度统一(所有 hitbox 同宽) 2) 相邻不重叠 3) 手牌条居中 4) 点哪张就是哪张。
//   牌多到放不下时才重叠; 此时每张只露牌肩, 仍然可点。
function handLayout(n, m) {
  var cardH = m.hand.cardH;
  var cardW = Math.round(cardH * m.hand.ratio);
  var maxW = m.hand.maxW;
  var step;
  if (n <= 1) {
    step = cardW;
  } else {
    var avail = maxW - cardW;
    step = Math.min(cardW, avail / (n - 1));   // <= cardW 才会重叠
    if (step < 10) step = 10;                  // 再挤也要留一点可点宽度
  }
  var totalW = n <= 1 ? cardW : step * n;      // 命中区条宽(铺满整排)
  var x0 = (m.vw - totalW) / 2;
  return { cardW: cardW, cardH: cardH, step: step, x0: x0, y: m.hand.y, n: n,
           totalW: totalW, lift: Math.round(cardH * 0.22) };
}

// 按钮几何: 一行居中, 数量多时自动缩窄
function buttonLayout(list, m) {
  var gap = Math.round(m.vw * 0.012);
  var h = Math.round(m.btn.h);
  var pad = m.vw * 0.03;
  var w = Math.max(58, Math.min(112, (m.vw - pad * 2 - gap * Math.max(0, list.length - 1)) / Math.max(1, list.length)));
  var totalW = w * list.length + gap * Math.max(0, list.length - 1);
  var x0 = (m.vw - totalW) / 2;
  var y = m.btn.y;
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    b.x = x0 + i * (w + gap); b.y = y; b.w = w; b.h = h;
    out.push(b);
  }
  return out;
}

// ===== 绘制工具 =====
function rr(ctx, x, y, w, h, r) {
  // 圆角矩形（不用 ctx.roundRect, 兼容性更稳）
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}
function text(ctx, s, x, y, size, color, align, bold) {
  ctx.font = (bold ? 'bold ' : '') + size + 'px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

// ===== 牌桌背景 =====
function drawTable(ctx, m) {
  // 暖红棕底 + 竖向渐变感（用两层矩形近似, 不用 gradient 以免兼容问题）
  ctx.fillStyle = '#5e2417';
  ctx.fillRect(0, 0, m.vw, m.vh);
  ctx.fillStyle = '#7a3220';
  ctx.fillRect(0, 0, m.vw, m.vh * 0.62);

  // 中央椭圆牌桌
  var t = m.table;
  ctx.save();
  ctx.fillStyle = '#a8472e';
  circle(ctx, t.cx, t.cy, 1);
  ctx.restore();
  // 用椭圆路径
  ctx.beginPath();
  ctx.ellipse ? ctx.ellipse(t.cx, t.cy, t.rx, t.ry, 0, 0, Math.PI * 2)
              : ctx.arc(t.cx, t.cy, t.rx, 0, Math.PI * 2);
  ctx.fillStyle = '#a8472e';
  ctx.fill();
  ctx.strokeStyle = '#d9a05b';
  ctx.lineWidth = Math.max(2, m.vh * 0.008);
  ctx.stroke();
  // 内圈暗边, 制造"中央留白"的层次
  ctx.beginPath();
  ctx.ellipse ? ctx.ellipse(t.cx, t.cy, t.rx * 0.93, t.ry * 0.88, 0, 0, Math.PI * 2)
              : ctx.arc(t.cx, t.cy, t.rx * 0.93, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = Math.max(1, m.vh * 0.004);
  ctx.stroke();
  // 桌面中央水印(留白区)
  text(ctx, '内 蒙 古 打 大 A', t.cx, t.cy + m.vh * 0.11, Math.max(11, Math.round(m.vh * 0.038)), 'rgba(255,255,255,0.13)', 'center', true);
}

// ===== 顶栏: 模式 / 主A / 次方 / 你的座位 =====
function drawTopBar(ctx, st, m, btnLog) {
  var g = st.gameState;
  var h = m.top.h;
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(0, 0, m.vw, h);
  ctx.fillStyle = 'rgba(217,160,91,0.55)';
  ctx.fillRect(0, h - 1, m.vw, 1);

  var fs = Math.max(10, Math.round(m.vh * 0.032));
  var y0 = h * 0.30, y1 = h * 0.70;
  var x = m.vw * 0.025;
  var camps = (g['主方'] || []);

  // 左: 模式 + 主A
  var modeTxt = g.mode || '未定';
  text(ctx, '模式 ' + modeTxt, x, y0, fs, '#ffd98a', 'left', true);
  var zhu = g['主A'];
  var zhuTxt = zhu ? (SUIT_CHAR[zhu.suit] || zhu.suit) + '·' + st.names[SEAT_IDS.indexOf(zhu.establishedBy)] : '-';
  text(ctx, '主A ' + zhuTxt, x, y1, fs, '#ffd98a', 'left', true);

  // 中: 你的座位 + 剩余张数
  var humanPlayer = st.humanPlayer;
  var me = g.players.filter(function (p) { return p.id === humanPlayer; })[0];
  var myCamp = camps.indexOf(st.humanPlayer) >= 0 ? '主方' : '抓方';
  var myHand = me && me.hand ? me.hand.length : 0;
  text(ctx, '你 ' + st.names[SEAT_IDS.indexOf(st.humanPlayer)] + ' · ' + myCamp + ' · 剩 ' + myHand,
    m.vw * 0.5, y0, fs, '#ffffff', 'center', true);
  var cF = g['次方'];
  var cTxt = '-';
  if (cF) cTxt = (g['次方公开'] ? '公开' : '隐藏') + st.names[SEAT_IDS.indexOf(cF)];
  text(ctx, '次方 ' + cTxt, m.vw * 0.5, y1, fs, '#c9c9c9', 'center', false);

  // 右: 底牌公开 + Log 按钮
  text(ctx, '底牌' + (g['底牌公开'] ? '公开' : '隐藏'), m.vw * 0.975, y0, fs, '#c9c9c9', 'right', false);
  if (btnLog) {
    ctx.fillStyle = st.logVisible ? '#c8102e' : '#1e6091';
    rr(ctx, btnLog.x, btnLog.y, btnLog.w, btnLog.h, 6); ctx.fill();
    ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 1.5;
    rr(ctx, btnLog.x, btnLog.y, btnLog.w, btnLog.h, 6); ctx.stroke();
    text(ctx, 'Log', btnLog.x + btnLog.w / 2, btnLog.y + btnLog.h / 2, Math.max(10, Math.round(m.vh * 0.033)), '#ffffff', 'center', true);
  }
}

// ===== 玩家座位 =====
function drawSeats(ctx, st, m) {
  var g = st.gameState;
  var r = Math.round(m.vh * 0.052);
  var camps = (g['主方'] || []);
  var passed = g.passedPlayers || [];
  var out = [];
  SEAT_IDS.forEach(function (pid) {
    if (pid === st.humanPlayer) return;         // 真人信息在顶栏
    var pos = m.seats[pid];
    if (!pos) return;
    var p = g.players.filter(function (x) { return x.id === pid; })[0];
    var isCur = st.currentPlayer === pid;
    var isPassed = passed.indexOf(pid) >= 0;
    var isOut = p && p.hand && p.hand.length === 0;
    var scale = isCur ? 1.14 : 1;
    var rr_ = Math.round(r * scale);
    var cx = pos.x, cy = pos.y;

    // 头像底盘
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    circle(ctx, cx + 2, cy + 3, rr_ + 3); ctx.fill();
    ctx.fillStyle = SEAT_COLOR[SEAT_IDS.indexOf(pid)] || '#666';
    circle(ctx, cx, cy, rr_); ctx.fill();
    ctx.strokeStyle = isCur ? '#ffd700' : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = isCur ? Math.max(3, m.vh * 0.009) : 1.5;
    circle(ctx, cx, cy, rr_); ctx.stroke();

    // 名字
    var nm = st.names[SEAT_IDS.indexOf(pid)];
    var tx = pos.side === 'L' ? cx + rr_ + 8 : cx - rr_ - 8;
    var ta = pos.side === 'L' ? 'left' : 'right';
    text(ctx, nm, tx, cy - rr_ * 0.45, Math.max(10, Math.round(m.vh * 0.036)), isCur ? '#ffd700' : '#ffffff', ta, isCur);

    // 剩余牌数徽章
    var cnt = p && p.hand ? p.hand.length : 0;
    var bw = Math.round(r * 0.95), bh = Math.round(r * 0.62);
    var bx = cx + rr_ + 4, by = cy + rr_ * 0.35;
    if (pos.side === 'R') { bx = cx - rr_ - 4 - bw; }
    ctx.fillStyle = isOut ? '#555' : '#2f6fb5';
    rr(ctx, bx, by, bw, bh, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    rr(ctx, bx, by, bw, bh, 4); ctx.stroke();
    text(ctx, String(cnt), bx + bw / 2, by + bh / 2, Math.max(9, Math.round(m.vh * 0.030)), '#ffffff', 'center', true);

    // 状态: 已过牌 / 已出完
    var stTxt = isOut ? '已出完' : (isPassed ? '不出' : '');
    if (stTxt) {
      text(ctx, stTxt, tx, cy + rr_ * 0.85, Math.max(9, Math.round(m.vh * 0.030)),
        isOut ? '#9a9a9a' : '#cccccc', ta, false);
    }
    // 阵营(已确定且允许公开)
    if (camps.indexOf(pid) >= 0) {
      text(ctx, '主方', tx, cy + rr_ * 1.5, Math.max(9, Math.round(m.vh * 0.028)), '#ffd98a', ta, false);
    }
    out.push({ x: cx - rr_, y: cy - rr_, w: rr_ * 2, h: rr_ * 2, id: pid });
  });
  return out;
}

// ===== 中央: 最近出牌 + 过牌提示 =====
function drawCenter(ctx, st, m) {
  var g = st.gameState;
  var c = m.center;
  var table = g.table || [];
  var passed = g.passedPlayers || [];
  if (table.length) {
    var n = Math.min(table.length, 5);
    var cw = Math.round(m.vh * 0.075), ch = Math.round(cw * 1.35);
    var gap = Math.round(cw * 0.12);
    var total = n * cw + (n - 1) * gap;
    var x0 = c.x - total / 2;
    for (var i = 0; i < n; i++) {
      var card = table[table.length - n + i];
      drawMiniCard(ctx, card, x0 + i * (cw + gap), c.y - ch / 2, cw, ch, st);
    }
    if (table.length > n) {
      text(ctx, '+' + (table.length - n), c.x, c.y + ch * 0.85, Math.max(9, Math.round(m.vh * 0.028)), '#ffffff', 'center', false);
    }
    var lp = g.lastPlayer;
    if (lp) {
      text(ctx, st.names[SEAT_IDS.indexOf(lp)] + ' 出牌', c.x, c.y - ch * 0.85,
        Math.max(9, Math.round(m.vh * 0.030)), 'rgba(255,255,255,0.75)', 'center', false);
    }
  } else if (passed.length) {
    text(ctx, passed.map(function (id) { return st.names[SEAT_IDS.indexOf(id)]; }).join('、') + ' 不出',
      c.x, c.y, Math.max(11, Math.round(m.vh * 0.034)), 'rgba(255,255,255,0.6)', 'center', false);
  } else {
    text(ctx, st.stageHint || '', c.x, c.y, Math.max(10, Math.round(m.vh * 0.032)), 'rgba(255,255,255,0.45)', 'center', false);
  }
}

// 小牌面(中央桌牌)
function drawMiniCard(ctx, card, x, y, w, h, st) {
  ctx.fillStyle = '#fdfdf6';
  rr(ctx, x, y, w, h, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
  rr(ctx, x, y, w, h, 3); ctx.stroke();
  if (!card) return;
  var red = (card.suit === 'H' || card.suit === 'D' || card.isBigJoker);
  var col = red ? '#c8102e' : '#1a1a1a';
  var fs = Math.max(8, Math.round(w * 0.46));
  text(ctx, st.rankDesc(card), x + w / 2, y + h * 0.28, fs, col, 'center', true);
  text(ctx, (card.isBigJoker || card.isSmallJoker) ? '王' : (SUIT_CHAR[card.suit] || ''),
    x + w / 2, y + h * 0.68, Math.max(9, Math.round(w * 0.52)), col, 'center', true);
}

// ===== 手牌（底部）=====
function drawHand(ctx, st, m) {
  var g = st.gameState;
  var me = g.players.filter(function (p) { return p.id === st.humanPlayer; })[0];
  var hand = (me && me.hand) ? me.hand : [];
  var boxes = [];
  if (!hand.length) return boxes;

  var sorted = hand.slice().sort(function (a, b) { return cardPower(b) - cardPower(a); });
  var L = handLayout(sorted.length, m);
  var showHit = (st.currentPlayer === st.humanPlayer && g.phase === 'PLAY');

  var xAcc = L.x0;
  for (var i = 0; i < sorted.length; i++) {
    var card = sorted[i];
    var isSel = st.selectedCards.indexOf(card.id) >= 0;
    // [2026-10-24] x 用**逐张累加**而不是 x0 + i*step:
    //   浮点下 (x0+(i-1)*step)+step 与 x0+i*step 可能差 1e-13,
    //   严格 "<" 判定会误报"相邻命中区重叠"。累加保证首尾精确相接。
    var x = xAcc;
    xAcc += L.step;
    var y = L.y - (isSel ? L.lift : 0);
    drawCard(ctx, card, x, y, L.cardW, L.cardH, isSel, st);
    if (showHit) {
      // [2026-10-24] 重叠手牌的命中区用**步长**而不是整张牌宽:
      //   卡片从左往右画, 后一张压住前一张的右边 -> 每张露出来的是它的**左侧牌肩**,
      //   宽度正好是步长。命中区取牌肩 -> 宽度统一、相邻不重叠、点哪张就是哪张。
      var hw = Math.max(1, L.step);   // 精确步长: 取整会导致相邻命中区重叠
      boxes.push({ x: x, y: L.y, w: hw, h: L.cardH, cardId: card.id });
    }
  }

  // 选中提示
  if (st.selectedCards.length) {
    text(ctx, '已选 ' + st.selectedCards.length + ' 张 · 点【出牌】确认',
      m.vw / 2, L.y - L.lift - Math.round(m.vh * 0.022), Math.max(10, Math.round(m.vh * 0.032)), '#ffd700', 'center', true);
  }
  return boxes;
}

// 牌力排序(大->小)
function cardPower(c) {
  if (c.isBigJoker) return 21;
  if (c.isSmallJoker) return 20;
  if (c.rank === 2) return 17;
  if (c.rank === 3) return 18;
  if (c.rank === 14) return 16;
  return c.rank || 0;
}

// 完整牌面
function drawCard(ctx, card, x, y, w, h, isSel, st) {
  // 选中: 金色外框 + 抬升(位置已由调用方处理)
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  rr(ctx, x + 1, y + 2, w, h, 4); ctx.fill();
  ctx.fillStyle = '#fdfdf6';
  rr(ctx, x, y, w, h, 4); ctx.fill();
  var bigA = !!card.is主方大A;
  ctx.strokeStyle = isSel ? '#ffd700' : (bigA ? '#d9a05b' : 'rgba(0,0,0,0.4)');
  ctx.lineWidth = isSel ? Math.max(3, w * 0.08) : (bigA ? 2 : 1);
  rr(ctx, x, y, w, h, 4); ctx.stroke();

  var red = (card.suit === 'H' || card.suit === 'D' || card.isBigJoker);
  var col = red ? '#c8102e' : '#1a1a1a';
  var joker = !!(card.isBigJoker || card.isSmallJoker);
  // 左上角点数
  text(ctx, st.rankDesc(card), x + w * 0.22, y + h * 0.14, Math.max(8, Math.round(w * 0.34)), col, 'center', true);
  // 中央大点数
  text(ctx, st.rankDesc(card), x + w / 2, y + h * 0.42, Math.max(11, Math.round(w * 0.46)), col, 'center', true);
  // 花色
  text(ctx, joker ? '王' : (SUIT_CHAR[card.suit] || ''), x + w / 2, y + h * 0.74,
    Math.max(11, Math.round(w * 0.58)), col, 'center', true);
  if (bigA) {
    text(ctx, '大A', x + w / 2, y + h * 0.92, Math.max(7, Math.round(w * 0.22)), '#b8860b', 'center', true);
  }
}

// ===== 回合信息 + 倒计时 =====
function drawTurnInfo(ctx, st, m) {
  var g = st.gameState;
  var c = m.turn;
  var who = st.currentPlayer ? st.names[SEAT_IDS.indexOf(st.currentPlayer)] : '-';
  var mine = st.currentPlayer === st.humanPlayer;
  var fs = Math.max(10, Math.round(m.vh * 0.034));
  text(ctx, (mine ? '轮到你' : ('等待 ' + who + ' 行动')), c.x, c.y, fs, mine ? '#ffd700' : '#ffffff', 'center', true);

  // 倒计时: 只在真人回合显示。**到 0 不自动代替玩家操作**(不发明规则), 只提示。
  if (mine && st.turnDeadline) {
    var left = Math.max(0, st.turnDeadline - Date.now());
    var total = st.turnTotal || 20000;
    var sec = Math.ceil(left / 1000);
    var r = Math.round(m.vh * 0.035);
    var tx = c.x + m.vw * 0.13, ty = c.y;
    ctx.beginPath();
    ctx.arc(tx, ty, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / total));
    ctx.strokeStyle = sec <= 5 ? '#ff5555' : '#ffd700';
    ctx.lineWidth = Math.max(2, m.vh * 0.008);
    ctx.stroke();
    text(ctx, String(sec), tx, ty, Math.max(9, Math.round(m.vh * 0.030)), sec <= 5 ? '#ff7777' : '#ffd700', 'center', true);
  }
}

// ===== 按钮 =====
function drawButtons(ctx, st, m, list) {
  var boxes = buttonLayout(list, m);
  if (!boxes.length) return boxes;
  var fs = Math.max(11, Math.round(m.vh * 0.038));
  for (var i = 0; i < boxes.length; i++) {
    var b = boxes[i];
    var on = b.enabled;
    ctx.fillStyle = on ? (b.id === 'hint' ? '#2f8f4f' : (b.id === 'play' ? '#1e6091' : '#8a5a2b')) : '#4a4a4a';
    rr(ctx, b.x, b.y, b.w, b.h, Math.round(b.h * 0.30)); ctx.fill();
    ctx.strokeStyle = on ? '#ffd98a' : '#6a6a6a';
    ctx.lineWidth = on ? 2 : 1;
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
  var tx = m.vw / 2 - tw / 2, ty = m.top.h + 6;
  ctx.fillStyle = 'rgba(0,0,0,0.80)';
  rr(ctx, tx, ty, tw, Math.round(m.vh * 0.075), 6); ctx.fill();
  ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 1.5;
  rr(ctx, tx, ty, tw, Math.round(m.vh * 0.075), 6); ctx.stroke();
  text(ctx, t.text, tx + tw / 2, ty + Math.round(m.vh * 0.037), fs, '#ffd700', 'center', true);
}

// ===== 结算画面 =====
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
  if (d.res && d.res.reason) {
    text(ctx, d.res.reason, px + pw / 2, py + 50, Math.max(10, Math.round(m.vh * 0.032)), '#dddddd', 'center', false);
  }

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
    text(ctx, st.names[i] + (pid === st.humanPlayer ? '(你)' : ''), px + 26, y,
      Math.max(12, Math.round(m.vh * 0.038)), '#ffffff', 'left', true);
    text(ctx, camp + ' · 剩 ' + ((p && p.hand) ? p.hand.length : 0), px + 118, y,
      Math.max(10, Math.round(m.vh * 0.032)), '#aaaaaa', 'left', false);
    text(ctx, dtxt, px + pw - 26, y, Math.max(12, Math.round(m.vh * 0.042)),
      (delta > 0) ? '#7ee08a' : ((delta < 0) ? '#ff8888' : '#cccccc'), 'right', true);
  }
}

// ===== UI 日志面板 =====
function drawLog(ctx, st, m, btnLog) {
  if (!st.logVisible) return;
  var px = m.vw * 0.02, py = m.vh * 0.40, pw = m.vw * 0.40, ph = m.vh * 0.42;
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  rr(ctx, px, py, pw, ph, 6); ctx.fill();
  ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 1;
  rr(ctx, px, py, pw, ph, 6); ctx.stroke();
  text(ctx, '日志 (点右上 Log 隐藏)', px + 8, py + 12, Math.max(10, Math.round(m.vh * 0.030)), '#ffd98a', 'left', true);
  var lines = (st.logHistory || []).slice(-10);
  for (var i = 0; i < lines.length; i++) {
    var t = String(lines[i]);
    if (t.length > 46) t = t.slice(0, 46) + '…';
    text(ctx, t, px + 8, py + 28 + i * Math.round(m.vh * 0.036), Math.max(9, Math.round(m.vh * 0.028)), '#dddddd', 'left', false);
  }
}

// ===== 入口 =====
function render(ctx, st) {
  var m = layout(st.W, st.H);
  drawTable(ctx, m);

  // Log 按钮坐标(无 canvas 也要算, 供无头测试验证命中区)
  var lbw = Math.round(m.vw * 0.062), lbh = Math.round(m.vh * 0.068);
  var btnLog = { x: m.vw - lbw - m.vw * 0.02, y: m.vh * 0.012, w: lbw, h: lbh, id: 'log' };

  drawTopBar(ctx, st, m, btnLog);
  var seatBoxes = drawSeats(ctx, st, m);
  drawCenter(ctx, st, m);
  drawTurnInfo(ctx, st, m);
  var btnBoxes = drawButtons(ctx, st, m, st.buttons || []);
  var handBoxes = drawHand(ctx, st, m);
  drawToast(ctx, st, m);
  if (st.phase === 'GAME_END') drawSettlement(ctx, st, m);
  drawLog(ctx, st, m, btnLog);

  return { btnLog: btnLog, btnStage: btnBoxes, handHitboxes: handBoxes, seatHitboxes: seatBoxes, layout: m };
}

module.exports = {
  noopCtx: noopCtx,
  render: render,
  layout: layout,
  handLayout: handLayout,
  buttonLayout: buttonLayout,
  cardPower: cardPower,
  SEAT_IDS: SEAT_IDS,
  SUIT_CHAR: SUIT_CHAR
};
