// game.js — 内蒙古打大A 微信小游戏入口
// 规则引擎: src/index.js (12 模块, 25 套件 / 589+ 测试)
// UI: draw() 主循环 + tap-to-select + 3 列黄字 + log 14 行 + 右下角按钮

// === 加载引擎 (CommonJS require, 微信小游戏与 Node 测试共用) ===
var engine = require('./src/index.js');
var transition = engine.transition;
var PHASES = engine.PHASES;
var ACTIONS = engine.ACTIONS;
var determineFirstPlayer = engine.determineFirstPlayer;
var checkGameEnd = engine.checkGameEnd;
// [fix] ai.js 的 chooseAction 未被 index.js 转发, 直接从 ai.js 引
var chooseAction = require('./src/ai.js').chooseAction;
var candidateCombos = require('./src/combos.js').candidateCombos;

// === 工具 ===
// 仅内存缓冲, **不渲染到屏幕** (用户 2026-10-23 要求)。供测试与排查读取。
var logHistory = [];
function log(msg) {
  // [2026-10-23 用户要求] 只保留控制台日志: 本地文件与 UI 屏显都已移除。
  //   本地文件通道在 WeChat 运行时三次静默失败 (无 process / wx 沙箱不可读 /
  //   devtools 模拟器沙箱不落盘), 继续保留只会造成"以为在记日志"的错觉。
  //   需要排查时用户从调试器 Console 复制给我。
  logHistory.push(msg);
  if (logHistory.length > 200) logHistory.shift();   // 内存上限, 防无限增长
  console.log('[da-a-game] ' + msg);
}

// === 牌面描述 helper (在 try 块之前, 否则 suitChar TDZ) ===
var suitChar = { H: '♥', D: '♦', C: '♣', S: '♠' };
var jokerName = { big: '大王', small: '小王' };

function suitName(card) {
  if (!card) return '';
  if (card.isBigJoker) return jokerName.big;
  if (card.isSmallJoker) return jokerName.small;
  return suitChar[card.suit] || card.suit;
}

function rankDesc(card) {
  if (!card) return '?';
  if (card.isBigJoker) return '大王';
  if (card.isSmallJoker) return '小王';
  if (card.rank === 11) return 'J';
  if (card.rank === 12) return 'Q';
  if (card.rank === 13) return 'K';
  if (card.rank === 14) return 'A';
  return String(card.rank);
}

function cardDesc(card) {
  if (card && (card.isBigJoker || card.isSmallJoker)) return rankDesc(card);
  return suitName(card) + rankDesc(card);
}

// === 全局状态 ===
let gameState = engine.newGameState();
let currentPlayer = null;
let lastEmptiedPlayer = null;
let humanPlayer = 'A';
let selectedCards = [];
let handCardHitboxes = [];

// === 画布 (WeChat 小程序运行时 = wx, Node 测试时跳过) ===
var canvas = null, ctx = null, W = 0, H = 0;
if (typeof wx !== 'undefined') {
  canvas = wx.createCanvas();
  ctx = canvas.getContext('2d');
  W = canvas.width;
  H = canvas.height;
}

// === 玩家姓名 (内部 ID = A-E, 显示 = 甲乙丙丁戊) ===
const names = ['甲', '乙', '丙', '丁', '戊'];

// === 主A 描述 ===
function fmt主A(o) {
  if (!o) return '-';
  var sn = suitChar[o.suit] || o.suit;
  var vn = (o.viaMethod === 'LIANG_A') ? '主动亮' : (o.viaMethod === 'FORCED_CHECK' ? '强制排查' : '双A成功');
  return sn + ' ' + (names[['A','B','C','D','E'].indexOf(o.establishedBy)] || o.establishedBy) + ' ' + vn;
}

// === 按钮 (3 个 hitboxes) ===
let btnPlay = null;
let btnPass = null;
// [2026-10-21 删] btnPushWind 已移除。推风按 SKILL §9 应在"出完牌 + 其余玩家过牌 ->
//   轮次结束"时**自动**触发 (maybeTriggerPushWindAfterRoundEnd), 无需人工干预。
//   该按钮不仅多余, 还有害: 玩家可在轮次未结束时手动触发, 用陈旧触发者导致引擎
//   TRIGGER_NOT_OUT, 进而让 runAI 报 "lastPlayer cannot pass" 并中断自动玩法。
//   保留 doPushWind 函数本身 (自动触发路径调用它), 仅去掉 UI 入口。
let btnSelectPlayers = null;

// === 初始化 (START_GAME → FORCED_CHECK → ADVANCE → REVEAL_BOTTOM → CHOOSE_IDENTITY) ===
try {
  let r;
  r = transition(gameState, { type: ACTIONS.START_GAME, payload: { startPlayerIndex: 0 } });
  if (r && r.ok) { gameState = r.state; log('START_GAME → 发牌'); }
  else log('START_GAME 失败: ' + (r && r.error && r.error.message));

  r = transition(gameState, { type: ACTIONS.FORCED_CHECK, payload: {} });
  if (r && r.ok) { gameState = r.state; log('FORCED_CHECK → 主A: ' + (gameState['主A'] ? gameState['主A'].suit : '?')); }

  r = transition(gameState, { type: ACTIONS.ADVANCE, payload: {} });
  if (r && r.ok) { gameState = r.state; log('ADVANCE → FAN_A'); }

  r = transition(gameState, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  if (r && r.ok) { gameState = r.state; log('REVEAL_BOTTOM → ' + (gameState.mode || '?')); }

  if (gameState.phase === PHASES.IDENTITY_CHOICE) {
    var chooser, choice;
    if (gameState['次方']) { chooser = gameState['次方']; choice = 'HIDDEN'; }
    else { chooser = gameState['主A'].establishedBy; choice = 'HIDDEN'; }
    r = transition(gameState, { type: ACTIONS.CHOOSE_IDENTITY, payload: { playerId: chooser, choice: choice } });
    if (r && r.ok) { gameState = r.state; log('CHOOSE_IDENTITY → 暗打'); }
  }

  if (gameState.phase === PHASES.PLAY) {
    currentPlayer = determineFirstPlayer(gameState);
    if (!currentPlayer) currentPlayer = 'A';
  }
  // 7) 如果轮到 AI, 立即开始自动出牌
  runAI();
} catch (e) {
  log('初始化异常: ' + (e && e.message));
}

// === 主渲染 ===
function draw() {
  if (!ctx) return;  // node 测试模式无 canvas
  // 背景
  ctx.fillStyle = '#0a4d2e';
  ctx.fillRect(0, 0, W, H);

  // 标题
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('内蒙古打大A · C-4 v3', W / 2, H * 0.06);

  // ===== 顶部 3 列黄字 (H*0.16 - 0.34) =====
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd700';

  // 次方计算 (内联)
  var 次方玩家_6 = (gameState.mode && gameState.mode.indexOf('2V3') >= 0) ? gameState['次方']
    : (gameState.mode && gameState.mode.indexOf('1V4') >= 0 ? (gameState['主方'] && gameState['主方'][0]) : null);
  var 次方显示_6 = 次方玩家_6 ? (
    (gameState['次方公开'] ? '公开' : '隐藏') +
    (names[['A','B','C','D','E'].indexOf(次方玩家_6)] || 次方玩家_6)
  ) : '-';

  // 列 1 (左)
  ctx.fillText('phase: ' + gameState.phase, W * 0.04, H * 0.16);
  ctx.fillText('mode:  ' + (gameState.mode || '未定'), W * 0.04, H * 0.22);
  ctx.fillText('主A: ' + fmt主A(gameState['主A']), W * 0.04, H * 0.28);
  // 列 2 (中)
  ctx.fillText('次方: ' + 次方显示_6, W * 0.36, H * 0.16);
  ctx.fillText('上家: ' + ((names[['A','B','C','D','E'].indexOf(gameState.lastPlayer)] || gameState.lastPlayer) || '-'), W * 0.36, H * 0.22);
  ctx.fillText('当前: ' + ((names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) || '-'), W * 0.36, H * 0.28);
  // [fix] 桌面放到"当前"下边 (中列第 4 行)
  if (gameState.table && gameState.table.length > 0) {
    var tStr = '桌: ';
    for (var tIdx = 0; tIdx < gameState.table.length && tIdx < 10; tIdx++) {
      tStr += cardDesc(gameState.table[tIdx]) + " ";
    }
    ctx.fillText(tStr, W * 0.36, H * 0.34);
  }
  // 列 3 (右)
  ctx.fillText('底牌公开: ' + (gameState['底牌公开'] ? '是' : '否'), W * 0.68, H * 0.16);
  ctx.fillText('过牌: ' + (function(){var p=gameState.passedPlayers||[]; return p.length?p.map(function(id){return names[['A','B','C','D','E'].indexOf(id)]||id;}).join(','):'-';})(), W * 0.68, H * 0.22);
  // [2026-10-21 改] 本字段改为显示【推风目标】而非触发者。
  //   原实现显示 (推风触发者 || lastEmptiedPlayer) —— 那是"谁出完牌触发的",
  //   却标成"推风: X", 极易被读成"推给了 X", 2026-10-21 已因此误判三轮。
  //   现在语义明确: "推风给 X" 的 X 就是 currentPlayer (§9.3 同阵营最近未出完者)。
  var pwPending = !!(gameState['推风触发者'] || lastEmptiedPlayer);
  var pwTarget = pwPending
    ? (currentPlayer ? (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) : '?')
    : '-';
  ctx.fillText('推风给: ' + pwTarget, W * 0.68, H * 0.28);
  ctx.fillText('桌牌: ' + (gameState.table ? gameState.table.length : 0) + ' 张', W * 0.68, H * 0.34);

  // ===== 桌牌牌面 (黄字) =====
  // [修复] 旧的独立桌面区已删 (改到中列"当前"下边)

  // ===== 人手牌渲染 (humanPlayer 回合) =====
  var me = gameState.players.find(function (p) { return p.id === humanPlayer; });
  if (me && me.hand && me.hand.length > 0) {
    function cardPower(c) {
      if (c.isBigJoker) return 21;
      if (c.isSmallJoker) return 20;
      if (c.rank === 2) return 17;
      if (c.rank === 3) return 18;
      if (c.rank === 14) return 16;
      return c.rank || 0;
    }
    var sortedHand = me.hand.slice().sort(function (a, b) { return cardPower(b) - cardPower(a); });
    handCardHitboxes = [];
    // [fix] 无条件渲染手牌 (轮到 AI 时也能看到自己的牌)
    if (sortedHand.length > 0) {
      var cardW = 24, cardH = 42, cardGap = 1;
      var totalW = sortedHand.length * cardW + (sortedHand.length - 1) * cardGap;
      var startX = (W - totalW) / 2;
      var cardY = H * 0.42;
      sortedHand.forEach(function (card, k) {
        var x = startX + k * (cardW + cardGap);
        var isSel = selectedCards.indexOf(card.id) >= 0;
        // [fix] hitbox 仅人类回合注入 (防止 AI 回合误点)
        if (currentPlayer === humanPlayer && gameState.phase === PHASES.PLAY) {
          handCardHitboxes.push({ x: x, y: cardY, w: cardW, h: cardH, cardId: card.id });
        }
        ctx.fillStyle = isSel ? '#ffd700' : '#1f6f3a';
        ctx.fillRect(x, cardY, cardW, cardH);
        ctx.strokeStyle = isSel ? '#c8102e' : '#ffffff';
        ctx.lineWidth = isSel ? 3 : 1;
        ctx.strokeRect(x, cardY, cardW, cardH);
        // rank + suit (一行文字一行花色)
        // [fix] 大小王无花色 (suit=null), 原先 suitChar[null] || card.suit 会把
        //   字面量 "null" 画到牌面上。改为显示「王」, 大王红 / 小王黑。
        var isJoker = !!(card.isBigJoker || card.isSmallJoker);
        ctx.fillStyle = card.isBigJoker ? '#c8102e'
                       : (isJoker ? '#000000'
                          : ((card.suit === 'H' || card.suit === 'D') ? '#c8102e' : '#000000'));
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(rankDesc(card), x + cardW / 2, cardY + 16);
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(isJoker ? '王' : (suitChar[card.suit] || card.suit), x + cardW / 2, cardY + 35);
      });
      // 已选张数提示
      if (selectedCards.length > 0) {
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('已选 ' + selectedCards.length + ' 张, 点出牌按钮出牌', W / 2, cardY - 8);
      }
    }
  }

  
  // ===== 按钮: 出牌 / 过牌 / 推风 (右下角) =====
  const btnW = 72, btnH = 30, gap = 6;
  // [2026-10-21 改] 3 个按钮 -> 2 个, 布局宽度同步收窄
  const totalBtnW = btnW * 2 + gap;
  const btnStartX = W - totalBtnW - W * 0.02;
  const btnY = H * 0.93 - btnH;

  const playEnabled = currentPlayer && gameState.phase === PHASES.PLAY;
  const passEnabled = playEnabled;
  const pushEnabled = true;   // [2026-10-21] 推风按钮已删, 此变量仅保留兼容, 绘制端不再使用

  // 出牌
  ctx.fillStyle = playEnabled ? '#c8102e' : '#555';
  ctx.fillRect(btnStartX, btnY, btnW, btnH);
  ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
  ctx.strokeRect(btnStartX, btnY, btnW, btnH);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('出牌', btnStartX + btnW / 2, btnY + btnH / 2);

  // 过牌
  ctx.fillStyle = passEnabled ? '#1e6091' : '#555';
  ctx.fillRect(btnStartX + btnW + gap, btnY, btnW, btnH);
  ctx.strokeRect(btnStartX + btnW + gap, btnY, btnW, btnH);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('过牌', btnStartX + btnW + gap + btnW / 2, btnY + btnH / 2);

  btnPlay = { x: btnStartX, y: btnY, w: btnW, h: btnH };
  btnPass = { x: btnStartX + btnW + gap, y: btnY, w: btnW, h: btnH };

  // ===== 顶部 5 按钮 (选我是哪个 + 剩余张数) =====
  const meBtnW = 56, meBtnH = 32, meGap = 8;
  for (var mi = 0; mi < 5; mi++) {
    var mx = W * 0.04 + mi * (meBtnW + meGap);
    var my = H * 0.01;
    var isMe = ['A','B','C','D','E'][mi] === humanPlayer;  // [fix] humanPlayer 存的是 ID 不是中文名
    var cnt = gameState.players[mi] ? gameState.players[mi].hand.length : '?';
    ctx.fillStyle = isMe ? '#ffeb3b' : '#666';
    ctx.fillRect(mx, my, meBtnW, meBtnH);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, meBtnW, meBtnH);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((isMe ? '★' : '') + names[mi] + ' ' + cnt, mx + meBtnW / 2, my + meBtnH / 2);
  }
  btnSelectPlayers = [];
  for (var mi2 = 0; mi2 < 5; mi2++) {
    btnSelectPlayers.push({ x: W * 0.04 + mi2 * (meBtnW + meGap), y: H * 0.01, w: meBtnW, h: meBtnH, id: names[mi2] });
  }
}

// === 首次 draw (启动渲染) ===
if (ctx) draw();

// === 轮次结束检测 ===
function checkRoundEnd() {
  if (!gameState || !gameState.players) return false;
  var nonEmpty = gameState.players.filter(function (p) { return p.hand.length > 0; });
  if (nonEmpty.length === 0) return false;
  var passed = gameState.passedPlayers || [];
  return nonEmpty.every(function (p) { return passed.indexOf(p.id) >= 0; });
}

// === 轮次结束触发推风 ===
// [2026-10-23 P0 修复] 原实现依赖 checkRoundEnd() 重新判断"轮次是否结束",
//   但引擎 play.js handlePass 在轮次结束的**同一个返回里**就把 passedPlayers 清空了:
//     table: [], passedPlayers: [], passCount: 0
//   于是事后 checkRoundEnd() 看到 passed=[] -> every() 为 false -> 永不触发。
//   症状: 整局 3 人出完牌, 推风一次都没触发 (用户 2026-10-23 Console 日志实证);
//        主方全空后抓方还继续出牌 (本该立即判主方胜)。
//
//   改为: 由调用方在拿到 transition 结果时, 用**清桌前后对比**判定轮次是否刚结束,
//   再显式传入。本函数只负责"该不该推风"的业务条件。
function doPushWindIfPending(roundJustEnded) {
  if (!roundJustEnded) return;                       // 轮次没结束 -> 不推风
  var trigger = lastEmptiedPlayer || gameState['推风触发者'];
  if (!trigger) return;                              // 本轮没人出完 -> 不推风
  // 只有"出完牌的人正是本轮最后出牌的人"才推风 (否则陈旧的 lastEmptiedPlayer 会误触发)
  if (gameState.lastPlayer && gameState.lastPlayer !== trigger) return;
  var p = gameState.players.filter(function (x) { return x.id === trigger; })[0];
  if (!p || p.hand.length !== 0) return;             // 触发者仍有牌 -> 不推风
  doPushWind();
}

// === 出牌按钮 ===
function doPlay() {
  if (!currentPlayer || gameState.phase !== PHASES.PLAY) {
    log((names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 手牌空, 不能出牌');
    if (ctx) draw();
    return;
  }
  var player = gameState.players.find(function (p) { return p.id === currentPlayer; });
  if (!player || player.hand.length === 0) {
    log((names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 手牌空, 不能出牌');
    if (ctx) draw();
    return;
  }
  // [D] 优先用 selectedCards (多选多牌型); 未选则逐张试
  var lastError = null;
  if (selectedCards.length > 0) {
    var r0 = transition(gameState, {
      type: ACTIONS.PLAY,
      payload: { playerId: currentPlayer, cardIds: selectedCards.slice() }
    });
    if (r0 && r0.ok) {
      var me2 = gameState.players.find(function (p) { return p.id === currentPlayer; });
      var cardText = selectedCards.map(function (id) {
        var c = me2 ? me2.hand.concat(gameState.discarded || []).find(function (x) { return x.id === id; }) : null;
        return c ? cardDesc(c) : '?';
      }).join(' ');
      gameState = r0.state;
      log((names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 出 ' + cardText);
      selectedCards = [];
      var wasEmpty0 = me2 && me2.hand.length === 0;
      if (wasEmpty0) {
        lastEmptiedPlayer = currentPlayer;
        log('  -> ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 出完牌∈待轮次结束可能触发推风');
      }
      advanceCurrentPlayer();
      var endR0 = checkGameEnd(gameState);
      if (endR0.ended) {
        gameState.phase = 'GAME_END';
        log('牌局结束: ' + (endR0.winner || '平局') + ' 胜! reason=' + endR0.reason);
      } else {
        doPushWindIfPending(false);
      }
      if (ctx) draw();
      runAI();
      return;
    } else {
      lastError = r0 && r0.error;
      log('选中 ' + selectedCards.length + ' 张不合法: ' + (lastError && lastError.type) + ' ' + (lastError && lastError.message) + ' -> 回退逐张试');
      selectedCards = [];
    }
  }
  // [未选] 逐张检查手牌
  for (var i = 0; i < player.hand.length; i++) {
    var card = player.hand[i];
    var r = transition(gameState, {
      type: ACTIONS.PLAY,
      payload: { playerId: currentPlayer, cardIds: [card.id] }
    });
    if (r && r.ok) {
      var me3 = gameState.players.find(function (p) { return p.id === currentPlayer; });
      gameState = r.state;
      log((names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 出 ' + cardDesc(card));
      var wasEmpty = me3 && me3.hand.length === 0;
      if (wasEmpty) {
        lastEmptiedPlayer = currentPlayer;
        log('  → ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 出完牌 (待轮次结束触发推风)');
      }
      advanceCurrentPlayer();
      var endR = checkGameEnd(gameState);
      if (endR.ended) {
        gameState.phase = 'GAME_END';
        log('牌局结束: ' + (endR.winner || '平局') + ' 胜! reason=' + endR.reason);
      } else {
        doPushWindIfPending(false);
      }
      if (ctx) draw();
      runAI();
      return;
    }
    // [fix] 记录逐张尝试的最后一个错误。
    //   原先 lastError 仅在"已选牌"分支赋值, 未选牌直接点出牌时它始终为 null,
    //   导致末尾汇总打出 (null && ...) -> 字面量 "null null"。
    lastError = (r && r.error) || lastError;
  }
  // [修复] 3 张及以上组合回退: 调用已测试的 candidateCombos, 合法性交引擎裁决 (§14)
  //   原因: ai.js 的 chooseAction 不支持连张/蛋子/大蛋子, 会误报“不合法”
  (function () {
    var cands = candidateCombos(player.hand || []);
    for (var ci = 0; ci < cands.length; ci++) {
      var r2 = transition(gameState, { type: ACTIONS.PLAY, payload: { playerId: currentPlayer, cardIds: cands[ci].slice() } });
      if (r2 && r2.ok) {
        var mm = gameState.players.find(function (p) { return p.id === currentPlayer; });
        var txt = cands[ci].map(function (cid) {
          var cc = player.hand.filter(function (x) { return x.id === cid; })[0];
          return cc ? cardDesc(cc) : '?';
        }).join(' ');
        gameState = r2.state;
        log((names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 出 ' + txt + ' (组合回退)');
        if (mm && mm.hand.length === 0) { lastEmptiedPlayer = currentPlayer; }
        advanceCurrentPlayer();
        var e2 = checkGameEnd(gameState);
        if (e2.ended) { gameState.phase = 'GAME_END'; log('牌局结束: ' + (e2.winner || '平局')); } else { doPushWindIfPending(false); }
        if (ctx) draw();
        runAI();
        return;
      }
      // [fix] 同上: 组合回退也需记录错误, 供末尾汇总使用
      lastError = (r2 && r2.error) || lastError;
    }
  })();
  log((names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 失败: 所有 ' + player.hand.length + ' 张手牌都不可用. 最后: ' +
    ((lastError && lastError.type)
      ? (lastError.type + ' ' + (lastError.message || ''))
      : '未能出牌 (引擎未返回具体原因)'));
  if (ctx) draw();
}

// === 过牌 ===
function doPass() {
  if (!currentPlayer || gameState.phase !== PHASES.PLAY) {
    if (ctx) draw();
    return;
  }
  // [P0] 轮次结束标志: 引擎 handlePass 在轮结束的同一返回里清空 table+passedPlayers,
  //   事后用 passedPlayers 反推必然为 false -> 推风永不触发。此处用清桌前后对比取证。
  var _hadTable = (gameState.table || []).length > 0;
  var r = transition(gameState, { type: ACTIONS.PASS, payload: { playerId: currentPlayer } });
  if (r && r.ok) {
    gameState = r.state;
    var _roundEnded = _hadTable && (gameState.table || []).length === 0;
    log((names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer));
    advanceCurrentPlayer();
    var endR = checkGameEnd(gameState);
    if (endR.ended) {
      gameState.phase = 'GAME_END';
      log('牌局结束: ' + (endR.winner || '平局') + ' 胜! reason=' + endR.reason);
    } else {
      doPushWindIfPending(_roundEnded);
    }
  } else {
    log((names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 失败: ' + (r && r.error && r.error.type) + ' ' + (r && r.error && r.error.message));
  }
  if (ctx) draw();
  runAI();
}

// === 推风 ===
function doPushWind() {
  var trigger = lastEmptiedPlayer || gameState['推风触发者'];
  if (!trigger) {
    log('推风失败: 无触发者');
    if (ctx) draw();
    return;
  }
  var r = transition(gameState, { type: ACTIONS.PUSH_WIND, payload: { trigger: trigger } });
  if (r && r.ok) {
    gameState = r.state;
    // [P1 修复] 必须把引擎算出的推风目标同步回模块级 currentPlayer。
    //   push-wind.js 会在 newState 里设 currentPlayer = target (§9 目标选择结果),
    //   但本函数原先只更新 gameState, 遗漏了 currentPlayer —— 于是 runAI()
    //   拿着**过期**的 currentPlayer 行动, 推风目标被丢弃。
    //   doPlay/doPass 不受影响: 它们走 advanceCurrentPlayer() 自行维护。
    if (r.state.currentPlayer) currentPlayer = r.state.currentPlayer;
    // [P1 修复] 推风成功后必须清空 lastEmptiedPlayer。
    //   引擎已把 推风触发者 置为 null, 但本模块的 lastEmptiedPlayer 会一直留着旧值,
    //   导致三处错误:
    //     1) L164 画面显示"推风: X"是陈旧的**触发者**, 而非当前目标 -> 用户误以为推给了甲
    //     2) L237 pushEnabled 恒为真 -> 推风按钮永远可点
    //     3) 本函数再次被调用时会用陈旧触发者 -> 引擎 TRIGGER_NOT_OUT,
    //        或选中错误目标, 最终 runAI 报 "lastPlayer cannot pass" 而中断自动玩法。
    lastEmptiedPlayer = null;
    var endR = checkGameEnd(gameState);
    if (endR.ended) {
      gameState.phase = 'GAME_END';
      log('牌局结束: ' + (endR.winner || '平局') + ' 胜! reason=' + endR.reason);
    } else {
      doPushWindIfPending(false);
    }
    if (ctx) draw();
    runAI();
  }
}

// === AI 行动 ===
function runAI() {
  if (!ctx) return;  // node 测试模式不进 AI
  var guard = 0;
  while (currentPlayer && currentPlayer !== humanPlayer && gameState.phase === PHASES.PLAY && guard++ < 200) {
    try {
      var ai = gameState.players.find(function (p) { return p.id === currentPlayer; });
      if (!ai || ai.hand.length === 0) {
        // AI 手牌空 -> 过牌
        var r0 = transition(gameState, { type: ACTIONS.PASS, payload: { playerId: currentPlayer } });
        if (r0 && r0.ok) {
          gameState = r0.state;
          log('AI ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' PASS');
          advanceCurrentPlayer();
          var endR = checkGameEnd(gameState);
          if (endR.ended) {
            gameState.phase = 'GAME_END';
            log('牌局结束: ' + (endR.winner || '平局') + ' 胜! reason=' + endR.reason);
          } else {
            doPushWindIfPending(false);
          }
          if (ctx) draw();
        }
        continue;
      }
      // 调 AI 决策
      var action = chooseAction(gameState, currentPlayer);
      if (!action) {
        log('AI 无效 action: ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer));
        var fp2 = transition(gameState, { type: ACTIONS.PASS, payload: { playerId: currentPlayer } });
        if (fp2 && fp2.ok) { gameState = fp2.state; advanceCurrentPlayer(); } else { break; }
        if (ctx) draw();
        continue;
      }
      var aiCardsDesc = '';
      if (action.cardIds && action.cardIds.length > 0) {
        // [fix] 从 ai.hand 取 (不再等 transition 后的 table, 那时还没更新)
        var aiPlayer = gameState.players.find(function (p) { return p.id === currentPlayer; });
        var aiHand = aiPlayer ? aiPlayer.hand : [];
        var descCards = action.cardIds.map(function (id) {
          var c = aiHand.find(function (x) { return x.id === id; });
          return c || null;
        }).filter(Boolean);
        aiCardsDesc = descCards.length ? (' ' + descCards.map(cardDesc).join(' ')) : '';
      }
      // [fix] ai.js 返回平铺 action { type, playerId, cardIds },
      //       transition() 需要 { type, payload: {...} } -> 包装
      var wrapped = { type: action.type, payload: {} };
      if (action.playerId !== undefined) wrapped.payload.playerId = action.playerId;
      if (action.cardIds !== undefined) wrapped.payload.cardIds = action.cardIds;
      if (action.choice !== undefined) wrapped.payload.choice = action.choice;
      var r1 = transition(gameState, wrapped);
      if (r1 && r1.ok) {
        // [fix] PASS 动作无 cardIds, 需守卫避免 TypeError
        var wasEmpty = !!(ai && ai.hand && action.cardIds && ai.hand.length === action.cardIds.length);
        gameState = r1.state;
        log('AI ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' ' + action.type + (action.cardIds ? ' (' + action.cardIds.length + '张)' + aiCardsDesc : ''));
        if (wasEmpty) {
          lastEmptiedPlayer = currentPlayer;
          log('  → ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' AI 出完牌 (待轮次结束触发推风)');
        }
        advanceCurrentPlayer();
        var endR1 = checkGameEnd(gameState);
        if (endR1.ended) {
          gameState.phase = 'GAME_END';
          log('牌局结束: ' + (endR1.winner || '平局') + ' 胜! reason=' + endR1.reason);
        } else {
          doPushWindIfPending(false);
        }
        if (ctx) draw();
      } else {
        log('AI 行动失败: ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' ' + action.type + ' ' + (r1 && r1.error && r1.error.message));
        // [修复] 强制过牌而不是 break, 否则游戏卡死且按钮无响应
        var fp = transition(gameState, { type: ACTIONS.PASS, payload: { playerId: currentPlayer } });
        if (fp && fp.ok) {
          gameState = fp.state;
          log('AI ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' PASS (强制)');
          advanceCurrentPlayer();
        } else {
          log('AI 强制过牌也失败, 停止自动玩法');
          break;
        }
        if (ctx) draw();
        continue;
      }
    } catch (e) {
      log('AI 异常: ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' ' + (e && e.message));
      break;
    }
  }
}

// === 推进到下一玩家 ===
function advanceCurrentPlayer() {
  if (!gameState || !gameState.players) return;
  var ids = ['A', 'B', 'C', 'D', 'E'];
  var idx = ids.indexOf(currentPlayer);
  if (idx < 0) return;
  for (var step = 1; step <= 5; step++) {
    var next = ids[(idx + step) % 5];
    var nextPlayer = gameState.players.find(function (p) { return p.id === next; });
    if (nextPlayer && nextPlayer.hand && nextPlayer.hand.length > 0) {
      currentPlayer = next;
      // 清空选中
      selectedCards = [];
      return;
    }
  }
}

// === 触摸事件处理 (WeChat 小游戏) ===
if (typeof wx !== 'undefined') {
  wx.onTouchStart(function (e) {
    var touch = e.touches && e.touches[0];
    if (!touch) return;
    var x = touch.clientX || touch.x;
    var y = touch.clientY || touch.y;

    // 检查 顶部 5 按钮 (切换 humanPlayer)
    for (var i = 0; i < (btnSelectPlayers || []).length; i++) {
      var bp = btnSelectPlayers[i];
      if (x >= bp.x && x <= bp.x + bp.w && y >= bp.y && y <= bp.y + bp.h) {
        humanPlayer = ['A','B','C','D','E'][i];
        log('切换玩家: ' + names[i]);
        draw();
        return;
      }
    }

    // 检查 3 按钮 (出牌/过牌/推风)
    if (btnPlay && x >= btnPlay.x && x <= btnPlay.x + btnPlay.w && y >= btnPlay.y && y <= btnPlay.y + btnPlay.h) {
      doPlay();
      return;
    }
    if (btnPass && x >= btnPass.x && x <= btnPass.x + btnPass.w && y >= btnPass.y && y <= btnPass.y + btnPass.h) {
      doPass();
      return;
    }
    // [2026-10-21 删] 原此处有 btnPushWind 命中测试 -> doPushWind()。
    //   推风按钮已移除 (自动触发, 不该由玩家手动干预), 该分支一并删除。
    //   注意: doPushWind 函数本身保留, 自动路径 maybeTriggerPushWindAfterRoundEnd 仍调用它。

    // 检查 手牌 hitbox (tap-to-select)
    for (var k = 0; k < handCardHitboxes.length; k++) {
      var hb = handCardHitboxes[k];
      if (x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) {
        var idx2 = selectedCards.indexOf(hb.cardId);
        if (idx2 >= 0) selectedCards.splice(idx2, 1);
        else selectedCards.push(hb.cardId);
        draw();
        return;
      }
    }
  });
}

// === 导出 (供 Node 测试用, WeChat 小游戏环境无 module.exports 也无碍) ===
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    engine: engine,
    gameState: function () { return gameState; },
    currentPlayer: function () { return currentPlayer; },
    doPlay: doPlay, doPass: doPass, doPushWind: doPushWind, runAI: runAI, advanceCurrentPlayer: advanceCurrentPlayer,
    logHistory: function () { return logHistory; },
    checkRoundEnd: checkRoundEnd, doPushWindIfPending: doPushWindIfPending,
    // [测试可及性] draw / cardDesc 原先未导出, 导致无头测试无法捕获单帧渲染内容,
    //   从而无法验证信息边界 (他人手牌是否泄露)。本块已有 typeof module 守卫, 对微信无影响。
    draw: draw, cardDesc: cardDesc,
    selectedCards: function () { return selectedCards; },
    handCardHitboxes: function () { return handCardHitboxes; },
    setHumanPlayer: function (p) { humanPlayer = p; },
    // [测试注入] 注入构造好的 gameState, 用于**精确复现指定场景**。
    //   背景: game.js 初始化时会随机发牌并同步跑完 AI 回合, 测试无法控制局面,
    //   导致用户报过的 bug (推风跳阵营/单大A/连张) 只能随机撞上, 无法固化。
    //   有了注入点就能把每个 bug 写成**永久回归用例**。
    //   同时重置所有派生 UI 状态, 避免上一局的残留污染。
    __setState: function (st, opts) {
      gameState = st;
      var o = opts || {};
      currentPlayer = o.currentPlayer !== undefined ? o.currentPlayer
                    : (determineFirstPlayer(st) || 'A');
      lastEmptiedPlayer = o.lastEmptiedPlayer || null;
      if (o.clearLog !== false) logHistory = [];
      selectedCards = [];
      handCardHitboxes = [];
      if (o.human) humanPlayer = o.human;
      if (ctx) draw();
      return { phase: gameState.phase, currentPlayer: currentPlayer };
    }
  };
}