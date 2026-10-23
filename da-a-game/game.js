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
// 资格判定**由引擎提供**(判据与 transition 的 handler 同一套), UI 不自行判断
var canLiangA = engine.canLiangA;
var canFanA = engine.canFanA;
var canChooseIdentity = engine.canChooseIdentity;
var calculateScore = require('./src/scoring.js').calculateScore;

// === 工具 ===
// 仅内存缓冲, **不渲染到屏幕** (用户 2026-10-23 要求)。供测试与排查读取。
var logHistory = [];

// [2026-10-23 新增] 关键状态快照。
//   起因: 之前日志只有 "FORCED_CHECK → 主A: C" 这种半截信息, 事后只能从结局
//   反推阵营 —— 而反推会出错 (我曾据此误判主方成员, 被用户纠正)。
//   现在每次关键节点都打全量字段, 日志自身即可定案:
//     谁是主A / 谁是次A / 主方抓方名单 / 首出权 / 推风触发者与目标。
var NAMES_MAP = { A: '甲', B: '乙', C: '丙', D: '丁', E: '戊' };
function pn(id) { return NAMES_MAP[id] || (id || '-'); }

// 花色/方式 英文码 -> 汉字 (用户 2026-10-23 要求: 看日志要能直接读懂)
var SUIT_CN = { H: '红桃', D: '方块', C: '梅花', S: '黑桃' };
function psuit(s) { return SUIT_CN[s] || (s || '-'); }
var VIA_CN = {
  FORCED_CHECK: '强制排查',
  LIANG_A: '主动亮A',
  DEFAULT_HEART: '红桃A兜底',
  FORCED_CHECK_FALLBACK: '强制排查兜底'
};
function pvia(v) { return VIA_CN[v] || (v || '-'); }

function logState(tag) {
  var s = gameState || {};
  var za = s['主A'];
  var fan = s['反A'];
  log('[' + tag + ']'
    + ' phase=' + s.phase
    + ' mode=' + (s.mode || '-')
    + ' 主A=' + (za ? psuit(za.suit) + '(由' + pn(za.establishedBy) + '·' + pvia(za.viaMethod) + ')' : '-')
    + ' 次A=' + (s['次方'] ? pn(s['次方']) : '-')
    + ' 次方公开=' + (s['次方公开'] ? '是' : '否')
    + ' 底牌公开=' + (s['底牌公开'] ? '是' : '否')
    + ' 反A=' + (fan ? pn(fan.by) + '·' + psuit(fan.suit) : '-')
    + ' 主方=[' + (s['主方'] || []).map(pn).join(',') + ']'
    + ' 抓方=[' + (s['抓方'] || []).map(pn).join(',') + ']');
}

// 只在**静态字段**变化时打日志。
//   签名里故意**不含** 当前玩家 / 桌牌数 / 过牌 / lastPlayer —— 它们每回合都变,
//   混进来会导致每出一手牌就重复刷一遍相同的静态信息 (用户 2026-10-23 指出)。
//   现在: 开局打一次完整快照; 此后仅在出大A(→次方公开)、反A(→mode 变 1V4)、
//   阵营重算 等真实转换时补打一行。
var _lastSig = '';
function logStateIfChanged(tag) {
  var s = gameState || {};
  var za = s['主A'];
  var sig = [s.phase, s.mode, s['次方'], s['次方公开'] ? '1' : '0', s['底牌公开'] ? '1' : '0',
             s['反A'] ? s['反A'].by + s['反A'].suit : '-',
             za ? za.suit + za.establishedBy + za.viaMethod : '-',
             (s['主方'] || []).join(''), (s['抓方'] || []).join('')].join('|');
  if (sig === _lastSig) return;
  _lastSig = sig;
  logState(tag);
}

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
var DEFAULT_HUMAN = 'D';   // 需求: 真人每局默认坐丁位 (NAMES_MAP: D=丁)
let humanPlayer = DEFAULT_HUMAN;
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
let btnStage = null;   // 当前阶段的按钮列表(由 uiButtons() 产生)
let btnPass = null;
// [2026-10-21 删] btnPushWind 已移除。推风按 SKILL §9 应在"出完牌 + 其余玩家过牌 ->
//   轮次结束"时**自动**触发 (maybeTriggerPushWindAfterRoundEnd), 无需人工干预。
//   该按钮不仅多余, 还有害: 玩家可在轮次未结束时手动触发, 用陈旧触发者导致引擎
//   TRIGGER_NOT_OUT, 进而让 runAI 报 "lastPlayer cannot pass" 并中断自动玩法。
//   保留 doPushWind 函数本身 (自动触发路径调用它), 仅去掉 UI 入口。
let btnSelectPlayers = null;

// === 阶段闸门（2026-10-23 新增）===
// 需求: 发牌后各阶段拆开, 真人点【下】才推进; 需真人决策的阶段必须先决策,
//       【下】不得跳过。原实现是一条**自动跑完**的直线链, 中间零人工闸门。
//
// 阶段顺序沿用既有状态机(SKILL §3), 未新增任何阶段:
//   发牌 → [强制排查] → 反A → 翻底牌 → 次方身份 → 出牌
// 强制排查仅在「主A 未确立」时执行 —— 真人亮了 A 就跳过(符合 §4.2)。
var GATE_PLAN = [
  { id: 'DEAL',         label: '发牌' },
  { id: 'FORCED_CHECK', label: '强制排查' },
  { id: 'ADVANCE',      label: '进入反A阶段' },
  { id: 'REVEAL',       label: '翻开底牌' },
  { id: 'IDENTITY',     label: '次方身份选择' },
  { id: 'PLAY',         label: '正式出牌' }
];
var gateIdx = 0;
var gateChoice = null;   // { kind, eligible, reason, cards?, suit? } 待真人决策

function _errOf(r) { return (r && r.error && r.error.message) || '未知错误'; }

// 跑一个阶段。跑完若需真人决策, gateChoice.eligible=true —— 此时【下】必须被阻止。
function runGateStage() {
  if (gateIdx >= GATE_PLAN.length) return;
  gateChoice = null;
  var stage = GATE_PLAN[gateIdx];
  log('【阶段】' + stage.label);
  var r;
  switch (stage.id) {
    case 'DEAL':
      r = transition(gameState, { type: ACTIONS.START_GAME, payload: { startPlayerIndex: 0 } });
      if (r && r.ok) {
        gameState = r.state;
        log('  发牌完成');
        log('  座位: ' + ['A','B','C','D','E'].map(function (id) {
          return pn(id) + (id === humanPlayer ? '(真人)' : '(AI)');
        }).join(' ') + '  真人=' + pn(humanPlayer) + '(丁位)');
      } else { log('  发牌失败: ' + _errOf(r)); break; }
      var e1 = canLiangA(gameState, humanPlayer);
      gateChoice = { kind: 'LIANG_A', eligible: !!e1.ok, reason: e1.reason, cards: e1.cards };
      log('  真人亮A资格: ' + (e1.ok ? '有' : '无') + ' — ' + e1.reason);
      break;

    case 'FORCED_CHECK':
      if (gameState['主A']) { log('  跳过(主A已确立, 真人已亮A)'); gateIdx++; return runGateStage(); }
      r = transition(gameState, { type: ACTIONS.FORCED_CHECK, payload: {} });
      if (r && r.ok) {
        gameState = r.state;
        var za = gameState['主A'];
        log('  强制排查 → 主A: ' + psuit(za && za.suit) + ' 由' + pn(za && za.establishedBy)
          + ' 方式=' + pvia(za && za.viaMethod));
        logState('强制排查后');
      } else log('  强制排查失败: ' + _errOf(r));
      break;

    case 'ADVANCE':
      r = transition(gameState, { type: ACTIONS.ADVANCE, payload: {} });
      if (r && r.ok) {
        gameState = r.state;
        log('  进入反A阶段');
        var e2 = canFanA(gameState, humanPlayer);
        gateChoice = { kind: 'FAN_A', eligible: !!e2.ok, reason: e2.reason, cards: e2.cards, suit: e2.suit };
        log('  真人反A资格: ' + (e2.ok ? '有' : '无') + ' — ' + e2.reason);
      } else log('  ADVANCE 失败: ' + _errOf(r));
      break;

    case 'REVEAL':
      r = transition(gameState, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
      if (r && r.ok) {
        gameState = r.state;
        log('  底牌翻开 → ' + (gameState.mode || '?'));
        logState('底牌翻开后');
      } else log('  底牌翻开失败: ' + _errOf(r));
      break;

    case 'IDENTITY':
      if (gameState.phase === PHASES.IDENTITY_CHOICE) {
        var e3 = canChooseIdentity(gameState, humanPlayer);
        if (e3.ok) {
          gateChoice = { kind: 'IDENTITY', eligible: true, reason: e3.reason };
          log('  真人次方身份资格: 有 — ' + e3.reason);
        } else {
          log('  真人无次方身份资格(' + e3.reason + ') → 由授权者自动 HIDDEN');
          _autoChooseIdentity();
        }
      } else {
        log('  无需身份选择(阶段=' + gameState.phase + ')');
      }
      break;

    case 'PLAY':
      if (gameState.phase === PHASES.PLAY) {
        currentPlayer = determineFirstPlayer(gameState) || 'A';
        log('  首出权 → ' + pn(currentPlayer) + ' (§5)');
        logState('开局');
        log('  正式出牌阶段开始');
      }
      break;
  }
  gateIdx++;
}

// 授权者自动选 HIDDEN(真人无资格时; 沿用原自动链的行为)
function _autoChooseIdentity() {
  var chooser = engine.identityChooser(gameState);
  var r = transition(gameState, { type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: chooser, choice: 'HIDDEN' } });
  if (r && r.ok) {
    gameState = r.state;
    log('  CHOOSE_IDENTITY(自动) → ' + (gameState.mode || '?')
      + ' (次A=' + pn(gameState['次方']) + ')');
    logState('定身份后');
  } else log('  CHOOSE_IDENTITY 失败: ' + _errOf(r));
}

// 【下】: 有待决策且资格具备时**拒绝推进**(防止跳过真人决策)
function gateNext() {
  if (gateChoice && gateChoice.eligible) {
    log('  【下】被阻止: 需先完成「' + gateChoice.kind + '」选择');
    return false;
  }
  gateChoice = null;   // 无需决策, 消费后允许推进
  runGateStage();
  if (gameState.phase === PHASES.PLAY && gateIdx >= GATE_PLAN.length) runAI();
  if (ctx) draw();
  return true;
}

// 真人亮A决策。doIt=true 亮, false 不亮。返回是否消费了本次决策。
function humanLiangA(doIt) {
  if (!gateChoice || gateChoice.kind !== 'LIANG_A' || !gateChoice.eligible) return false;
  var cards = gateChoice.cards;
  gateChoice = null;              // 先消费, 防同一次决策被执行两次
  if (!doIt) { log('  真人选择: 不亮A'); if (ctx) draw(); return true; }
  var card = cards && cards[0];
  if (!card) { log('  亮A失败: 无可用A牌'); return true; }
  var r = transition(gameState, { type: ACTIONS.LIANG_A,
    payload: { playerId: humanPlayer, cardId: card.id } });
  if (r && r.ok) {
    gameState = r.state;
    log('  真人亮A: ' + psuit(card.suit) + ' (主A 由' + pn(humanPlayer) + ', 方式=主动亮)');
    logState('亮A后');
  } else {
    log('  亮A失败: ' + _errOf(r));   // 引擎拒绝时不改阵营
  }
  if (ctx) draw();
  return true;
}

// 真人反A决策。资格与花色均由引擎判定, UI 不自行判断
function humanFanA(doIt) {
  if (!gateChoice || gateChoice.kind !== 'FAN_A' || !gateChoice.eligible) return false;
  var cards = gateChoice.cards, suit = gateChoice.suit;
  gateChoice = null;
  if (!doIt) { log('  真人选择: 不反A'); if (ctx) draw(); return true; }
  var ids2 = (cards || []).slice(0, 2).map(function (c) { return c.id; });
  if (ids2.length !== 2) { log('  反A失败: 牌数不足'); return true; }
  var r = transition(gameState, { type: ACTIONS.FAN_A,
    payload: { playerId: humanPlayer, suit: suit, cardIds: ids2 } });
  if (r && r.ok) {
    gameState = r.state;
    log('  真人反A成功: ' + pn(humanPlayer) + ' 成为主A');
    logState('反A后');
  } else {
    log('  反A失败: ' + _errOf(r));   // 失败不改阵营
  }
  if (ctx) draw();
  return true;
}

// 真人次方身份决策
function humanChooseIdentity(publicly) {
  if (!gateChoice || gateChoice.kind !== 'IDENTITY' || !gateChoice.eligible) return false;
  gateChoice = null;
  var choice = publicly ? 'PUBLIC' : 'HIDDEN';
  var r = transition(gameState, { type: ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: humanPlayer, choice: choice } });
  if (r && r.ok) {
    gameState = r.state;
    log('  真人选择次方身份: ' + (publicly ? '公开' : '隐藏')
      + ' → ' + (gameState.mode || '?'));
    logState('定身份后');
  } else {
    log('  身份选择失败: ' + _errOf(r));
  }
  if (ctx) draw();
  return true;
}

// === 初始化（由阶段闸门驱动）===
// 原实现是一条自动跑完的直线链, 中间零人工闸门; 现在**只跑第一个阶段「发牌」**,
// 其余阶段由真人点【下】推进(见 gateNext / runGateStage)。
// 原来的 runAI() 调用已移除 —— 现在由 gateNext 在到达 PLAY 阶段时统一触发,
// 否则会在发牌阶段就让 AI 开打。
function initGame() {
  gateIdx = 0;
  gateChoice = null;
  log('=== 对局初始化 ===');
  log('真人座位: ' + pn(humanPlayer) + ' (丁位, 可用顶部 5 按钮切换)');
  log('阶段流程: 发牌 → [强制排查] → 反A → 翻底牌 → 次方身份 → 出牌');
  runGateStage();
  if (ctx) draw();
}

try {
  initGame();
} catch (e) {
  log('初始化异常: ' + (e && e.message));
}

// === 新一局（【下一局】按钮）===
// 需求: 点击后必须重新发牌并重置真人座位为丁位, 同时重置日志与所有派生 UI 状态。
//   漏掉任何一项都会让上一局残留污染新局(历史上出过的对局是其中一种)。
function newGame() {
  log('=== 点击【下一局】===');
  humanPlayer = DEFAULT_HUMAN;      // 真人每局默认丁位
  selectedCards = [];
  handCardHitboxes = [];
  lastEmptiedPlayer = null;
  currentPlayer = null;
  gameState = engine.newGameState();
  logHistory = [];                   // 新局重置日志
  initGame();                        // 重新走阶段闸门(内部会重置 gateIdx/gateChoice)
  log('新局已开始, 真人=' + pn(humanPlayer) + '(丁位)');
  if (ctx) draw();
}

// === 主渲染 ===
// ===== 提示条 (需求十二) =====
// 真人出牌失败时的简短提示。文案由用户指定, 不改字。
var uiToast = null;   // { text, until }
var NO_PLAYABLE_TEXT = '【当前没有可用牌】';

function showNoPlayableMsg(err) {
  uiToast = { text: NO_PLAYABLE_TEXT, until: Date.now() + 2000 };
  log('  提示: ' + NO_PLAYABLE_TEXT + (err ? ' (' + (err.type || '') + ')' : ''));
}

function uiToastNow() { return uiToast; }

// ===== 统一按钮模型（2026-10-23 新增，需求八）=====
// 按钮的**可见性与可用性全部由游戏状态推导**，单一来源。
// 之前 btnPlay/btnPass/btnSelectPlayers 三处各自判断 phase 与 currentPlayer，
// 容易互相冲突；现在 draw() 只负责排版绘制，触摸只按 id 分发。
function uiButtons() {
  var out = [];
  var ph = gameState.phase;
  var c = gateChoice;
  var ended = ph === PHASES.GAME_END;
  var playing = ph === PHASES.PLAY;

  if (!playing && !ended) {
    // 阶段选择：亮A / 反A / 次方身份，按 gateChoice 的 kind 决定显示哪组
    if (c && c.kind === 'LIANG_A') {
      out.push({ id: 'liangA', label: '亮A', enabled: !!c.eligible });
      out.push({ id: 'noLiangA', label: '不亮', enabled: !!c.eligible });
    } else if (c && c.kind === 'FAN_A') {
      out.push({ id: 'fanA', label: '反A', enabled: !!c.eligible });
      out.push({ id: 'noFanA', label: '不反', enabled: !!c.eligible });
    } else if (c && c.kind === 'IDENTITY') {
      out.push({ id: 'idPublic', label: '公开身份', enabled: !!c.eligible });
      out.push({ id: 'idHidden', label: '隐藏身份', enabled: !!c.eligible });
    }
    // 【下】：有待决策且资格具备时**不可用**（不能跳过真人决策）
    out.push({ id: 'next', label: '下', enabled: !(c && c.eligible) });
  }

  if (playing) {
    var onTurn = currentPlayer === humanPlayer;
    out.push({ id: 'play', label: '出牌', enabled: onTurn });
    out.push({ id: 'pass', label: '过牌', enabled: onTurn });
  }

  if (ended) {
    out.push({ id: 'newGame', label: '下一局', enabled: true });
  }
  return out;
}

// 按坐标命中某个按钮；不可用的按钮返回 null（不响应）
// [P0 修复 2026-10-23 23:56] 原来这里调 uiButtons() **重新生成了一份对象**,
//   而 x/y/w/h 是 draw() 时写进**另一份对象**的 -> 命中判断拿到的坐标是 undefined
//   -> `x >= undefined` 恒为 false -> **所有按钮都点不到**。
//   用户实测: 点(783,348) 报「点击未命中」, 而该坐标其实正落在【下】上。
//   现在必须用 draw/layout 时算好坐标的那一份(btnStage)。
function uiButtonAt(x, y) {
  var list = btnStage || [];
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    if (!b.enabled) continue;
    if (b.x === undefined || b.y === undefined) continue;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

// 按 id 触发按钮动作。返回 true 表示已处理
function uiClick(id) {
  switch (id) {
    case 'liangA':   return humanLiangA(true);
    case 'noLiangA': return humanLiangA(false);
    case 'fanA':     return humanFanA(true);
    case 'noFanA':   return humanFanA(false);
    case 'idPublic': return humanChooseIdentity(true);
    case 'idHidden': return humanChooseIdentity(false);
    case 'next':     return gateNext();
    case 'play':     doPlay(); return true;
    case 'pass':     doPass(); return true;
    case 'newGame':  newGame(); return true;
    default: return false;
  }
}

// ===== 结算画面 (需求十) =====
// 五人得分表 + 胜负结果。分数**由引擎 calculateScore 给出**, UI 不自己算。
// [注] 这两个函数必须在**文件作用域**, 不能落在 draw() 体内 ——
//   否则 module.exports 里引用不到(会报 _settlementData is not defined)。
function _settlementData() {
  var res = null;
  try { res = checkGameEnd(gameState); } catch (e) { res = null; }
  if (!res || !res.winner) res = { winner: 'draw', reason: '' };
  var scores = {};
  try { scores = calculateScore(gameState, res) || {}; } catch (e) { scores = {}; }
  return { res: res, scores: scores };
}

function _drawSettlement() {
  if (!ctx) return;
  var d = _settlementData();
  var vw = W || 844, vh = H || 390;
  var pw = Math.min(420, vw * 0.72), ph = Math.min(250, vh * 0.78);
  var px = (vw - pw) / 2, py = (vh - ph) / 2 - vh * 0.04;

  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
  ctx.strokeRect(px, py, pw, ph);

  var title = d.res.winner === 'draw' ? '平局' : (d.res.winner + '胜');
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('本局结束 · ' + title, px + pw / 2, py + 26);

  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#cccccc';
  ctx.fillText(d.res.reason || '', px + pw / 2, py + 48);

  // 五人得分表
  var ids = ['A', 'B', 'C', 'D', 'E'];
  var camps = (gameState['主方'] || []).map(function (p) { return p.id; });
  var rowY = py + 72, rowH = 30;
  ctx.textAlign = 'left';
  ids.forEach(function (pid, i) {
    var y = rowY + i * rowH;
    var p = gameState.players.filter(function (x) { return x.id === pid; })[0];
    var camp = camps.indexOf(pid) >= 0 ? '主方' : '抓方';
    var isHuman = pid === humanPlayer;
    var delta = d.scores[pid];
    var deltaTxt = (delta === undefined) ? '—' : ((delta > 0 ? '+' : '') + delta);

    ctx.fillStyle = (i % 2 === 0) ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)';
    ctx.fillRect(px + 14, y - 12, pw - 28, rowH - 4);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(pn(pid) + (isHuman ? '(你)' : ''), px + 26, y);

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '12px sans-serif';
    ctx.fillText(camp + ' · 剩 ' + ((p && p.hand) ? p.hand.length : 0) + ' 张', px + 108, y);

    ctx.fillStyle = (delta > 0) ? '#66dd66' : (delta < 0 ? '#ff7777' : '#cccccc');
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(deltaTxt, px + pw - 26, y);
    ctx.textAlign = 'left';
  });
}
// ===== UI 日志 + 【Log】开关 (需求十一) =====
// 默认**隐藏**: 不影响正常对局画面。**不影响日志记录** —— logHistory 一直在记,
//   只是默认不显示; 点右上角【Log】切换。
// 注意: 坐标在无 canvas 时也先算出来, 这样无头测试能验证命中区。
var uiLogVisible = false;
var btnLog = null;

function _drawUiLog() {
  var vw = W || 844, vh = H || 390;
  var bw = 56, bh = 26;
  var bx = vw - bw - vw * 0.02, by = vh * 0.01;
  btnLog = { x: bx, y: by, w: bw, h: bh, id: 'log' };
  if (!ctx) return;

  // --- 右上角【Log】按钮 ---
  ctx.fillStyle = uiLogVisible ? '#c8102e' : '#1e6091';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Log', bx + bw / 2, by + bh / 2);

  if (!uiLogVisible) return;

  // --- 左侧日志面板 ---
  var px = vw * 0.02, py = vh * 0.38, pw = vw * 0.38, ph = vh * 0.44;
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1;
  ctx.strokeRect(px, py, pw, ph);

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('日志 (点右上 Log 隐藏)', px + 8, py + 12);

  var lines = logHistory.slice(-11);
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#dddddd';
  for (var i = 0; i < lines.length; i++) {
    var t = String(lines[i]);
    if (t.length > 50) t = t.slice(0, 50) + '…';
    ctx.fillText(t, px + 8, py + 26 + i * 13);
  }
}

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
  // [2026-10-23] 手牌几何提到 draw() 作用域: UI 日志区要据此算「手牌下沿」,
  //   否则日志只能写死位置, 而布局一改就会压到手牌或按钮。
  var cardW = 24, cardH = 42, cardGap = 1;
  var cardY = H * 0.42;
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
      var totalW = sortedHand.length * cardW + (sortedHand.length - 1) * cardGap;
      var startX = (W - totalW) / 2;
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

  
// ===== 按钮: 由 uiButtons() 统一排版并绘制 (需求八) =====
// 之前这里硬编码出牌/过牌两个按钮并各自判断 phase/currentPlayer, 与阶段闸门
// 的按钮需求完全脱节 —— 亮A/不亮/反A/不反/下/结算/下一局 全都点不到。
// 现在: 按钮集合来自 uiButtons()（单一来源）, 这里只负责算坐标 + 画。
(function drawUiButtons() {
  var list = uiButtons();
  btnPlay = null; btnPass = null; btnStage = list;
  if (!list.length) return;

  var gap = 6, h = 30;
  // 无 canvas 时用默认视口, 这样**无头测试也能验证命中区**（坐标照样算出来）
  var vw = W || 844, vh = H || 390;
  var pad = vw * 0.02;
  var w = Math.max(56, Math.min(96, (vw - pad * 2 - gap * (list.length - 1)) / list.length));
  var y = vh * 0.93 - h;
  var totalW = w * list.length + gap * (list.length - 1);
  var startX = vw - totalW - pad;

  list.forEach(function (b, i) {
    var x = startX + i * (w + gap);
    b.x = x; b.y = y; b.w = w; b.h = h;
    if (b.id === 'play') btnPlay = b;
    if (b.id === 'pass') btnPass = b;
  });

  if (!ctx) return;   // 无 canvas: 只算坐标, 不绘制

  list.forEach(function (b, i) {
    var x = startX + i * (w + gap);
    ctx.fillStyle = b.enabled ? '#1e6091' : '#555';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = b.enabled ? '#ffffff' : '#888888';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, x + w / 2, y + h / 2);
  });

  // 阶段提示文字: 让真人知道现在轮到哪个阶段、按钮为何不可用
  if (list.length) {
    ctx.fillStyle = '#ffd700';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(_stageHint(), pad, y + h / 2);
  }

  // ===== 提示条 (需求十二) =====
  // 文案固定为用户指定的「【当前没有可用牌】」, 2 秒后自动消失。
  if (uiToast && uiToast.text && uiToast.until > Date.now()) {
    var tw = (typeof ctx.measureText === 'function') ? ctx.measureText(uiToast.text).width : 150;
    var tx = W / 2 - tw / 2 - 10, ty = H * 0.05;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(tx, ty, tw + 20, 26);
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5;
    ctx.strokeRect(tx, ty, tw + 20, 26);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(uiToast.text, tx + 10, ty + 13);
  }

  // ===== 结算画面 (需求十) =====
  if (gameState.phase === PHASES.GAME_END) _drawSettlement();

  // ===== UI 日志 + 【Log】开关 (需求十一) =====
  _drawUiLog();
})();

// ===== 结算画面 (需求十) =====
// 五人得分表 + 胜负结果。分数**由引擎 calculateScore 给出**, UI 不自己算。

function _stageHint() {
  var c = gateChoice;
  var ph = gameState.phase;
  if (ph === PHASES.GAME_END) return '本局结束';
  if (ph === PHASES.PLAY) {
    return currentPlayer === humanPlayer ? '轮到你出牌' : ('等待 ' + pn(currentPlayer) + ' 出牌');
  }
  var stage = gateIdx < GATE_PLAN.length ? GATE_PLAN[gateIdx].label : '准备';
  if (c && !c.eligible) return stage + '（你无相应资格，按【下】继续）';
  if (c && c.eligible) return stage + '（需你先选择）';
  return stage;
}

  // [2026-10-23 移除] UI 层操作日志已按用户要求去掉, 只保留控制台 log。
  //   原因: 屏幕空间宝贵; 且控制台日志已足够定位问题
  //   (2026-10-23 19:52 真实对局日志即为纯控制台输出, 成功定位 dpr 猜测错误)。
  //   历史: 该块曾放在此处, 位置为「手牌下沿 ~ 按钮上沿」, 行数按可用空间算
  //   (skill game-ui-engine-contract §2.1: 行数×间距×起点三者联动)。

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
  log('推风触发: ' + pn(trigger) + '出完 + 本轮结束 -> 调用 PUSH_WIND');
  doPushWind();
}

// === 出牌按钮 ===
// [2026-10-23 文案修正] winner 可能是 draw 或空, 原代码一律拼「 胜!」->
//   「牌局结束: draw 胜!」自相矛盾(用户 20:02 真实日志)。
function fmtResult(r) {
  if (!r || !r.winner || r.winner === 'draw') return '平局';
  return r.winner + ' 胜';
}

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
      // [P0 修复 2026-10-23] 原来读 me2.hand.length —— me2 是 transition **之前**
      //   捕获的 player 引用, 而 transition 会**克隆** players 数组与 player 对象
      //   (实测: players 换新 = true, player 对象换新 = true), 于是 me2 永远停在
      //   出牌前的手牌数 -> 玩家出完最后几张牌时 wasEmpty0 恒为 false
      //   -> lastEmptiedPlayer 不被设置 -> 推风永不触发。
      //   必须从**新** gameState 里重新取。
      var _meAfter0 = gameState.players.find(function (p) { return p.id === currentPlayer; });
      var wasEmpty0 = _meAfter0 && _meAfter0.hand.length === 0;
      if (wasEmpty0) {
        lastEmptiedPlayer = currentPlayer;
        log('  -> ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 出完牌∈待轮次结束可能触发推风');
      }
      advanceCurrentPlayer();
      var endR0 = checkGameEnd(gameState);
      if (endR0.ended) {
        gameState.phase = 'GAME_END';
        log('牌局结束: ' + fmtResult(endR0) + ' reason=' + endR0.reason);
      } else {
        doPushWindIfPending(false);
      }
      if (ctx) draw();
      runAI();
      return;
    } else {
      // [需求十二 2026-10-23 23:43 用户裁定] 选了但牌型非法 ->
      //   **不再自动换成别的牌**, 直接提示并停下。
      //   两条用户原话:「选了但牌型非法 → 不再自动换牌, 改为提示」。
      //   保留 selectedCards —— 需求要求「保留当前有效手牌和必要的选牌状态」,
      //   让真人自己调整选择(而不是被系统悄悄清空)。
      lastError = r0 && r0.error;
      log('选中 ' + selectedCards.length + ' 张不合法: ' + (lastError && lastError.type) + ' ' + (lastError && lastError.message));
      showNoPlayableMsg(lastError);
      if (ctx) draw();
      return;
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
      gameState = r.state;
      log((names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 出 ' + cardDesc(card));
      // [P0 修复 2026-10-23] 同上: me3 同样是过期引用, 从新 state 重新取。
      var _meAfter = gameState.players.find(function (p) { return p.id === currentPlayer; });
      var wasEmpty = _meAfter && _meAfter.hand.length === 0;
      if (wasEmpty) {
        lastEmptiedPlayer = currentPlayer;
        log('  → ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 出完牌 (待轮次结束触发推风)');
      }
      advanceCurrentPlayer();
      var endR = checkGameEnd(gameState);
      if (endR.ended) {
        gameState.phase = 'GAME_END';
        log('牌局结束: ' + fmtResult(endR) + ' reason=' + endR.reason);
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
  // [P3 真正修法 2026-10-23 20:19] 原先组合回退的 `return` 写在 IIFE **内部**,
  //   只退出 IIFE 自己 -> doPlay 继续往下走, 于是组合回退**已经出牌成功**之后,
  //   仍然会打出「失败: 压不过桌面」。用户实测: 只点一次出牌, 出来两条日志,
  //   第二条是假的(我一度误判为「两次点击」, 那是错的)。
  //   改用标志位把成功信号传出 IIFE, 由 doPlay 真正 return。
  var _comboPlayed = false;
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
        // [P0 修复 2026-10-23] 原来读 mm.hand.length, 而 mm 是在 transition **之前**
        //   捕获的引用(transition 会克隆 players 与 player 对象) -> 恒读到出牌前的手牌数
        //   -> ≥3 张组合回退出完最后的手牌时 lastEmptiedPlayer 不被设置 -> 推风不触发。
        //   与 doPlay 批量/逐张两处同源, 这是第三处。
        var _mmAfter = gameState.players.find(function (p) { return p.id === currentPlayer; });
        if (_mmAfter && _mmAfter.hand.length === 0) { lastEmptiedPlayer = currentPlayer; }
        advanceCurrentPlayer();
        var e2 = checkGameEnd(gameState);
        if (e2.ended) { gameState.phase = 'GAME_END'; log('牌局结束: ' + fmtResult(e2)); } else { doPushWindIfPending(false); }
        if (ctx) draw();
        runAI();
        _comboPlayed = true;   // 告诉 doPlay 已完成, 别再落到末尾的失败日志
        return;
      }
      // [fix] 同上: 组合回退也需记录错误, 供末尾汇总使用
      lastError = (r2 && r2.error) || lastError;
    }
  })();
  if (_comboPlayed) return;
  log((names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 失败: 压不过桌面(单张与组合均已尝试). 最后: ' +
    ((lastError && lastError.type)
      ? (lastError.type + ' ' + (lastError.message || ''))
      : '未能出牌 (引擎未返回具体原因)'));
  // [需求十二] 未选牌但手中没有能大过桌面的牌型 -> 提示, 不再反复尝试。
  showNoPlayableMsg(lastError);
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
    log((names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' PASS');
    advanceCurrentPlayer();
    var endR = checkGameEnd(gameState);
    if (endR.ended) {
      gameState.phase = 'GAME_END';
      log('牌局结束: ' + fmtResult(endR) + ' reason=' + endR.reason);
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
    var _before = currentPlayer;
    gameState = r.state;
    log('推风完成: 触发=' + pn(trigger)
      + ' 同阵营=' + (gameState['主方'] && gameState['主方'].indexOf(trigger) >= 0
          ? '主方[' + gameState['主方'].map(pn).join(',') + ']'
          : '抓方[' + (gameState['抓方'] || []).map(pn).join(',') + ']')
      + ' 目标=' + pn(r.state.currentPlayer)
      + ' (§9.3 同阵营最近未出完者)');
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
      log('牌局结束: ' + fmtResult(endR) + ' reason=' + endR.reason);
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
        // [P0 修复] 轮次结束标志: 引擎 handlePass 轮结束的同一返回里就清空 table+passedPlayers,
        //   事后用 passedPlayers 反推必然 false。此处用清桌前后对比取证 (与 doPass 同一套)。
        var _hadT0 = (gameState.table || []).length > 0;
        var r0 = transition(gameState, { type: ACTIONS.PASS, payload: { playerId: currentPlayer } });
        if (r0 && r0.ok) {
          gameState = r0.state;
          var _re0 = _hadT0 && (gameState.table || []).length === 0;
          log('AI ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' PASS');
          advanceCurrentPlayer();
          var endR = checkGameEnd(gameState);
          if (endR.ended) {
            gameState.phase = 'GAME_END';
            log('牌局结束: ' + fmtResult(endR) + ' reason=' + endR.reason);
          } else {
            doPushWindIfPending(_re0);
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
        // [P0 修复] AI 出牌也可能结束轮次(所有人都过完后最后一人出牌收桌), 同上取证
        var _hadT1 = (gameState.table || []).length > 0;
        gameState = r1.state;
        var _re1 = _hadT1 && (gameState.table || []).length === 0;
        log('AI ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' ' + action.type + (action.cardIds ? ' (' + action.cardIds.length + '张)' + aiCardsDesc : ''));
        if (wasEmpty) {
          lastEmptiedPlayer = currentPlayer;
          log('  → ' + (names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' AI 出完牌 (待轮次结束触发推风)');
        }
        advanceCurrentPlayer();
        var endR1 = checkGameEnd(gameState);
        if (endR1.ended) {
          gameState.phase = 'GAME_END';
          log('牌局结束: ' + fmtResult(endR1) + ' reason=' + endR1.reason);
        } else {
          doPushWindIfPending(_re1);
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
      // [2026-10-23] 每次换手都对比一次关键状态指纹, 只在**变化时**打日志。
      //   这样「出大A → 次方公开」「反A → mode 变 1V4」这类身份/阵营变化
      //   无需逐个手写日志点, 也不会因未变化而刷屏。
      logStateIfChanged('换手');
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

    // 检查 右上角【Log】开关 (需求十一)
    if (btnLog && x >= btnLog.x && x <= btnLog.x + btnLog.w && y >= btnLog.y && y <= btnLog.y + btnLog.h) {
      uiLogVisible = !uiLogVisible;
      log('UI 日志面板: ' + (uiLogVisible ? '显示' : '隐藏'));
      draw();
      return;
    }

    // 统一按钮模型（需求八）: 可用性已由 uiButtons() 判定, 这里只按 id 分发。
    //   不可用的按钮在 uiButtonAt 里已跳过, 不会被命中。
    var hitBtn = uiButtonAt(x, y);
    if (hitBtn) {
      uiClick(hitBtn.id);
      draw();
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
    // [2026-10-23 23:57 用户要求] 「点击未命中」诊断日志已删除。
    //   理由: 正式对局里点空白处属正常操作, 这行日志只是噪声。
    //   当时它确实有用 —— 正是它暴露出「所有按钮都点不到」的真 bug
    //   (uiButtonAt 拿的是没有坐标的新对象), 那个 bug 已修。
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
    },
// ===== 阶段闸门（2026-10-23 新增，供 UI 与无头测试使用）=====
    // 需求把「自动跑完整局」改成「真人点【下】逐阶段推进」，因此无头测试
    // **必须显式驱动闸门**才能进入 PLAY —— 不能在 node 下偷偷自动推进,
    // 那会让无头测试与真机行为分叉(正是 KNOWN_ISSUES E1「测试自我污染」那类错)。
    gateInfo: function () {
      return {
        idx: gateIdx,
        total: GATE_PLAN.length,
        stage: gateIdx < GATE_PLAN.length ? GATE_PLAN[gateIdx].id : null,
        choice: gateChoice ? {
          kind: gateChoice.kind,
          eligible: gateChoice.eligible,
          reason: gateChoice.reason,
          cardCount: (gateChoice.cards || []).length
        } : null,
        phase: gameState.phase
      };
    },
    gateNext: gateNext,
    humanLiangA: humanLiangA,
    humanFanA: humanFanA,
    humanChooseIdentity: humanChooseIdentity,
    getHumanPlayer: function () { return humanPlayer; },
    defaultHuman: function () { return DEFAULT_HUMAN; },
    // 无头驱动: 模拟真人依次点【下】, 遇到需要决策的阶段按 opts 决定。
    //   opts = { liangA:bool, fanA:bool, identity:bool, maxSteps:int }
    //   默认全部 false(不亮/不反/隐藏) —— 与真人「什么都不主动」一致。
    __driveGateToPlay: function (opts) {
      var o = opts || {};
      var maxSteps = o.maxSteps || 40;
      var steps = [];
      for (var i = 0; i < maxSteps; i++) {
        // [fix 2026-10-23] 终止条件必须是「闸门全部跑完」(gateIdx >= total),
        //   不能用 phase===PLAY —— PLAY 那一档**本身还没跑**,
        //   它才负责设 currentPlayer / 调 runAI; 提前 break 会留下 currentPlayer=null。
        if (gateIdx >= GATE_PLAN.length) break;
        var c = gateChoice;
        if (c && c.eligible) {
          if (c.kind === 'LIANG_A') humanLiangA(!!o.liangA);
          else if (c.kind === 'FAN_A') humanFanA(!!o.fanA);
          else if (c.kind === 'IDENTITY') humanChooseIdentity(!!o.identity);
          steps.push('decide:' + c.kind);
          continue;
        }
        var moved = gateNext();
        steps.push('next:' + (moved ? 'ok' : 'blocked'));
        if (!moved) break;
      }
      // 闸门跑完但 PLAY 还没就绪(理论不该发生) -> 兜底再推一次, 避免留下 null 首出权
      if (gateIdx >= GATE_PLAN.length && !currentPlayer && gameState.phase === PHASES.PLAY) {
        currentPlayer = determineFirstPlayer(gameState) || currentPlayer;
      }
      return { steps: steps, phase: gameState.phase, currentPlayer: currentPlayer };
    },
    // ===== UI 层（2026-10-23 新增）=====
    uiButtons: uiButtons,
    uiButtonAt: uiButtonAt,
    uiClick: uiClick,
    newGame: newGame,
    // [测试] 最近一次 draw 算好坐标的按钮列表; 以及结算数据
    btnStage: function () { return btnStage; },
    settlementData: _settlementData,
    // ===== UI 日志 (需求十一) =====
    uiLogVisible: function () { return uiLogVisible; },
    toggleUiLog: function () { uiLogVisible = !uiLogVisible; if (ctx) draw(); return uiLogVisible; },
    btnLog: function () { return btnLog; }
  };
}