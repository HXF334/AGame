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
// [2026-10-24 UI 重做] 渲染层单独成文件: 纯几何, 可无头测试; **不含任何规则判断**
var uiRender = require('./ui-render.js');

// [2026-10-25] 这几个 UI 状态的**赋值**必须早于模块底部的启动调用 initGame():
//   JS 的 var 只提升**声明**, 不提升 `= {}` 的**赋值** —— 之前 uiPlays 就是这么炸的
//   (启动路径里它是 undefined -> AI 出牌时抛 "Cannot set properties of undefined")。
//   这里的 uiPrevHandLens 在启动时也被读 -> 同样必须提前。
var uiPassed = {};          // pid -> true (该玩家点了「不出」)
var btnAutoPlay = null;
var btnAutoPlayCancel = null;
var uiPrevHandLens = {};    // pid -> 上次的手牌张数(用来发现谁出牌了)
// [2026-10-26] **轮次跟踪**: 打大A 里每换一个点数, 引擎就收走旧桌牌 = 新的一轮开始。
//   旧一轮的「各家最新出牌」必须清掉, 否则:
//   - 桌面上一直显示上一轮的陈牌(用户: 乙出完牌一轮结束了, 牌面还没清)
//   - hasPlay 恒为真 -> **「不出」文字永远不显示**(用户: 不出文字一直没改好)
var uiTrickId = 0;          // 当前轮次
var uiPlaysTrick = {};      // pid -> 那手牌属于第几轮
var uiPrevTableIds = {};    // 上一帧桌牌上的牌 id 集合
var uiBigAcePlayed = {};    // pid -> 该玩家**打出**过几张主方大A(头像角标用)
var uiPrevPushWind = null;  // 上一次的「推风触发者」(用来识别推风)
// [2026-10-26] 上一帧的桌牌张数(用来识别**轮末**: 引擎轮末会把桌牌清空)
var uiPrevTableLen = 0;
// [2026-10-26] AI 动作之间的停顿(毫秒)
// [2026-11-02 用户] **开发者工具模拟器也要 1 秒停顿**(原来只有真机有):
//   用户原话「AI 出牌增加 1 秒等待, 包括测试环境」-> 模拟器里也停 1 秒, 便于看清 AI 动作。
//   只有 node 无头测试(mock-wx 注入的假运行时, 带 __isMock 标记)才为 0 ——
//   否则 65 个套件会被拖慢, 且 setTimeout 重入会让无头断言时序不稳。
//   判据放在纯函数 _computeAiDelay 里, 便于无头测试直接验证各种环境。
var AI_STEP_DELAY = _computeAiDelay(typeof wx !== 'undefined' ? wx : null);
// [2026-11-04 用户] 「ai出牌有个随机3秒的去掉，AI默认都随机一秒出牌」
//   -> 删除「每局随机挑一个 AI 当慢手、等 3 秒」的机制(AI_SLOW_DELAY / uiSlowAiPid)。
//   -> 现在**所有** AI 统一「随机约 1 秒」出牌: 基准 AI_STEP_DELAY(真机/模拟器 1000ms),
//      每个 AI 回合在基准上叠加 ±20% 随机抖动(见 _aiWaitMs), 避免所有 AI 节奏一模一样。
var uiAiWaitPlan = 0;        // 当前 AI 回合的等待时长(ms); 0 = 还没定

// 纯函数: 由 wx 运行时决定 AI 停顿(ms)。0 = 不同步等(无头测试), 1000 = 等 1 秒。
function _computeAiDelay(wxObj) {
  if (!wxObj) return 0;              // node 无头且没装 mock -> 本来就没有 ctx, AI 也不跑
  if (wxObj.__isMock) return 0;      // node 无头 + mock-wx -> 不能等(setTimeout 会让无头断言不稳)
  return 1000;                       // 真机 / 微信开发者工具模拟器
}

// [2026-11-04 用户] AI 出牌统一「随机约 1 秒」(不再有 3 秒慢手)。
//   纯函数: 基准 base 毫秒 + ±20% 随机抖动 -> 800~1200ms(真机/模拟器)。
//   无头测试 base=0 -> 直接返回 0(不能等, 否则套件被拖慢)。
function _aiWaitMs(base) {
  if (!base) return 0;
  var jitter = Math.round(base * 0.2 * (Math.random() * 2 - 1));
  return Math.max(200, base + jitter);
}

// [2026-10-25 P0 修复] 这几个 UI 状态的**赋值**必须早于模块底部的启动调用 initGame():
//   var 的**声明**会提升, 但 `= {}` 的**赋值不会** —— 之前 uiPlays 的赋值排在
//   initGame() 之后, 导致启动路径里 uiPlays === undefined,
//   AI 出牌时 `uiPlays[currentPlayer] = ...` 抛
//   "Cannot set properties of undefined (setting 'A')"(且只在某些发牌下出现 -> flaky)。
var uiPlays = {};
var uiMarks = {};
var uiMemoOpen = true;    // [2026-10-27 用户] 记牌器**默认展开**

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
  // [2026-10-26] 上限提到 1000: 原来 200 条很快被挤掉(每次动作好几条) -> 用户看着像「日志被清空」
  if (logHistory.length > 1000) logHistory.shift();   // 内存上限, 防无限增长
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
// [2026-10-24 用户修改] 真人座位**开局随机**, 不再固定丁位。
//   顶部 5 个按钮仍可随时切换。
var SEAT_IDS = ['A', 'B', 'C', 'D', 'E'];
function _randomSeat() { return SEAT_IDS[Math.floor(Math.random() * SEAT_IDS.length)]; }
let humanPlayer = _randomSeat();
let selectedCards = [];
let handCardHitboxes = [];

// ===== 逐轮发牌驱动 (2026-11-04 用户: 发牌过程中可亮A) =====
// 每轮 0.3 秒发 5 张(每家1张); 真人手里一有 A 就能点花色按钮亮A。
// [2026-11-04 用户] 「发牌速度改为0.3秒」-> 500ms 改 300ms(22 轮总时长 11s -> 6.6s)
// 发牌期间**不设 5 秒闸门倒计时**(发牌本身就有时间窗); 发完后的亮A阶段仍保留 5 秒。
var DEAL_STEP_MS = 300;            // 每轮间隔(真机/模拟器)
var uiDealTimer = null;           // 发牌定时器
var uiDealAces = [];              // 发牌期间真人手里**已发的** A(可亮的候选)

// 由 wx 运行时决定发牌间隔: 无头测试 = 0ms(否则套件被拖慢)
function _computeDealStep(wxObj) {
  if (!wxObj) return 0;
  if (wxObj.__isMock) return 0;
  return DEAL_STEP_MS;
}
var DEAL_STEP = _computeDealStep(typeof wx !== 'undefined' ? wx : null);

// 发一轮牌(只发牌, 不做收尾) -> 返回是否成功
function _dealOneRound() {
  var r = transition(gameState, { type: ACTIONS.DEAL_ROUND, payload: {} });
  if (r && r.ok) {
    gameState = r.state;
  } else {
    log('  逐轮发牌中断: ' + _errOf(r));
    return false;
  }
  // 刷新可亮的 A 候选(只取**手里已发的** A, 底牌不在 hand 里)
  uiDealAces = [];
  var me = gameState.players.filter(function (p) { return p.id === humanPlayer; })[0];
  if (me && me.hand) {
    uiDealAces = me.hand.filter(function (c) { return c.rank === 14; });
  }
  return true;
}

// 发牌结束后的收尾: 判真人亮A资格 -> 交给闸门流程继续
//   [2026-11-04] 单独拆出来, **不**在这里调 gateAutoAdvance:
//     同步路径由 runGateStage 正常返回后继续推进(gateIdx 已 ++),
//     异步路径由 _dealStepTick 调 gateAutoAdvance(此时 gateIdx 也已 ++)。
//     若在这里调 gateAutoAdvance, 同步路径会**重入**阶段机(gateIdx 还没 ++)
//     -> DEAL 被重跑 -> START_GAME 报 phase 错(实测全量套件失败)。
function _afterDeal() {
  log('  发牌完成');
  uiDealAces = [];
  // 发牌结束 -> 进入**发牌后的亮A阶段**(SKILL §3 第 5 步)
  var e1 = canLiangA(gameState, humanPlayer);
  log('  真人亮A资格: ' + (e1.ok ? '有' : '无') + ' — ' + e1.reason);
  if (e1.ok) {
    // 有A -> 等真人点花色按钮亮A(5 秒倒计时), 决策完自动进入下一阶段
    _uiSetGateChoice({ kind: 'LIANG_A', eligible: true, reason: e1.reason, cards: e1.cards });
  } else {
    // 没有A -> 由 AI 依次尝试亮A, 完成后自动进入下一阶段
    _aiLiangARound();
  }
}

// 定时器驱动的一轮(真机/模拟器: 每 0.3 秒)
function _dealStepTick() {
  uiDealTimer = null;
  if (!gameState || gameState.phase !== PHASES.DEALING) return;
  if (!_dealOneRound()) return;
  if (ctx) draw();
  if (gameState.phase !== PHASES.DEALING) {
    _afterDeal();
    gateAutoAdvance();     // 继续闸门流程(强制排查/反A/翻底牌/身份)
    enterPlayIfNeeded();
    if (ctx) draw();
    return;
  }
  uiDealTimer = setTimeout(_dealStepTick, DEAL_STEP);
}

// 发牌中真人点花色按钮 -> 亮A(引擎在 DEALING 阶段也接受 LIANG_A)
function _dealLiangA(suit) {
  if (!gameState || gameState.phase !== PHASES.DEALING) return false;
  if (gameState['主A']) return false;              // 已有人亮A
  var card = uiDealAces.filter(function (c) { return c && c.suit === suit; })[0];
  if (!card) return false;                          // 没有该花色的 A -> 按钮本来就该是灰的
  var r = transition(gameState, { type: ACTIONS.LIANG_A,
    payload: { playerId: humanPlayer, cardId: card.id } });
  if (r && r.ok) {
    gameState = r.state;
    log('  真人发牌中亮A: ' + psuit(card.suit) + ' (主A 由' + pn(humanPlayer) + ', 方式=主动亮)');
    logState('发牌中亮A后');
    if (ctx) draw();
    return true;
  }
  log('  发牌中亮A失败: ' + _errOf(r));
  return false;
}

// ===== 托管 (2026-11-04 用户: 顶栏小机器人按钮, AI 代打真人手牌) =====
// 点击小机器人 -> 托管**开启/关闭**切换; 托管时 AI 替真人出牌, 真人不能手动操作。
// 托管时真人手牌区显示**半透明「取消托管」**标识, 点该区域或顶栏机器人都能取消。
// **不跨局保留**: 每局开始重置为关闭(见 newGame)。
var uiAutoPlay = false;        // 托管开关

function _uiToggleAutoPlay() {
  uiAutoPlay = !uiAutoPlay;
  log(uiAutoPlay ? '开启托管: AI 代打真人手牌' : '关闭托管: 恢复真人操作');
  selectedCards = [];
  if (uiAutoPlay) _autoPlayTakeover();
  if (ctx) draw();
}

// AI 接管真人回合: 用引擎的 chooseAction 替真人做决策
function _autoPlayTakeover() {
  if (!uiAutoPlay) return false;
  if (!gameState || gameState.phase !== PHASES.PLAY) return false;
  if (currentPlayer !== humanPlayer) return false;
  var act = chooseAction(gameState, humanPlayer);
  if (!act) return false;
  if (act.type === 'PLAY') {
    var ids = act.cardIds || [];
    if (!ids.length) return false;
    log('  托管: AI 代打 ' + pn(humanPlayer) + ' 出牌 ' + ids.length + ' 张');
    _autoPlayDoPlay(ids);
    return true;
  }
  if (act.type === 'PASS') {
    log('  托管: AI 代打 ' + pn(humanPlayer) + ' 不出');
    _autoPlayDoPass();
    return true;
  }
  return false;
}

// 托管出牌: 走和真人一样的引擎动作, 但绕过「是不是真人回合」守卫
function _autoPlayDoPlay(ids) {
  var r = transition(gameState, { type: ACTIONS.PLAY,
    payload: { playerId: humanPlayer, cardIds: ids } });
  if (r && r.ok) {
    gameState = r.state;
    var cards = (gameState.table || []).slice(-ids.length);
    _uiRecordPlay(humanPlayer, cards);
    log('  托管出牌: ' + ids.length + ' 张');
    lastEmptiedPlayer = null;
    advanceCurrentPlayer();
    checkRoundEnd();
    doPushWindIfPending(false);
    enterPlayIfNeeded();
  } else {
    log('  托管出牌失败: ' + _errOf(r));
  }
  if (ctx) draw();
}

function _autoPlayDoPass() {
  var r = transition(gameState, { type: ACTIONS.PASS, payload: { playerId: humanPlayer } });
  if (r && r.ok) {
    gameState = r.state;
    uiPassed[humanPlayer] = true;
    log('  托管: 真人不出');
    advanceCurrentPlayer();
    checkRoundEnd();
    doPushWindIfPending(false);
    enterPlayIfNeeded();
  } else {
    log('  托管不出失败: ' + _errOf(r));
  }
  if (ctx) draw();
}

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

// 进入出牌阶段的统一入口 (2026-10-24 00:22)
// [P0 修复 - 第二条路径] 之前的修复只挂在 runGateStage() 末尾, 但**次方身份选择**
//   这条路的 phase->PLAY 转换发生在 humanChooseIdentity() **内部**, 不经过
//   runGateStage() -> PLAY 档跑不到 -> currentPlayer 恒为 null -> 按钮全灰 + AI 不出手。
//   (用户实测: 「我是次方身份未亮明次方身份」那局卡在这里;
//     而走「不亮A」那局(转换发生在 runGateStage 内) 就正常自动出牌了。)
//   现在把「设首出权 + 触发 AI」收敛到这一个函数, 所有可能进入 PLAY 的地方都调它。
function enterPlayIfNeeded() {
  if (gameState.phase !== PHASES.PLAY) return false;
  // [2026-10-27 用户] 进 PLAY 阶段 -> 清掉「不出」标记
  //   亮A/反A/身份阶段引擎会**自动过牌**(那些玩家没亮/没选), 标记留到牌局里
  //   -> 我亮了大A而且有首出权, 但甲头上还挂着「不出」(用户真机)
  uiPassed = {};
  if (!currentPlayer) {
    // 补跑 PLAY 档(设首出权)。PLAY 档跑完 currentPlayer 已有值, 递归会终止。
    runGateStage();
  }
  if (!currentPlayer) return false;
  if (currentPlayer !== humanPlayer) {
    runAI();
  }
  return true;
}

// 跑一个阶段。跑完若需真人决策, gateChoice.eligible=true —— 此时【下】必须被阻止。
function runGateStage() {
  if (gateIdx >= GATE_PLAN.length) return;
  gateChoice = null;
  var stage = GATE_PLAN[gateIdx];
  log('【阶段】' + stage.label);
  var r;
  switch (stage.id) {
    case 'DEAL':
      // [B5 修正 2026-11-03] 原来写死 { startPlayerIndex: 0 }, 把引擎的随机发牌覆盖成了固定起点。
      //   SKILL §2.2: 「每局随机选择发牌起始玩家」。这里**不传** startPlayerIndex,
      //   交给 transition/dealGame 自己随机。
      // [2026-11-04 用户] 「发牌过程中，持有可亮A的玩家可以亮A」-> **逐轮发牌**:
      //   progressive = true -> 引擎只洗牌, phase=DEALING; 之后每 0.5 秒发一轮(5张),
      //   发牌期间真人手里有 A 就能亮(四个花色按钮, 有A的可点、没有的置灰)。
      //   引擎侧 hand 只含**已发的牌** -> 只能亮「已摸到的 A」; 底牌直接进底牌槽 -> 天然不可亮。
      r = transition(gameState, { type: ACTIONS.START_GAME, payload: { progressive: true } });
      if (r && r.ok) {
        gameState = r.state;
        log('  开始逐轮发牌(' + (gameState.dealRoundsTotal || 0) + ' 轮, 每轮 ' + (DEAL_STEP_MS / 1000) + ' 秒)');
        // 启动发牌定时器(第一轮立刻发, 之后每轮 0.3 秒)
        //   [2026-11-04] **无头测试里 DEAL_STEP=0 -> 同步把 22 轮跑完**:
        //     否则发牌是异步的, 断言会在发牌完成前就执行 -> 79 套件大面积失配。
        //     真机/模拟器 DEAL_STEP=300 -> 保留 0.3 秒逐轮节奏(用户要的观感)。
        uiDealAces = [];
        if (DEAL_STEP <= 0) {
          // 无头: **同步**把 22 轮发完(只发牌, 收尾在循环后做一次)
          while (gameState && gameState.phase === PHASES.DEALING) {
            if (!_dealOneRound()) break;
          }
          if (gameState && gameState.phase !== PHASES.DEALING) _afterDeal();
        } else {
          uiDealTimer = setTimeout(_dealStepTick, DEAL_STEP);
        }
        log('  座位: ' + ['A','B','C','D','E'].map(function (id) {
          return pn(id) + (id === humanPlayer ? '(真人)' : '(AI)');
}).join(' ') + '  真人=' + pn(humanPlayer) + '(随机座位)');
      } else { log('  发牌失败: ' + _errOf(r)); break; }
      // [2026-11-04] 逐轮发牌 -> **发牌后的亮A判定挪到发牌完成时**(_dealStepTick 收尾)。
      //   原因: 发牌还没结束就判「真人手里有没有 A」, 看到的是**还没发到的手牌**(空)
      //   -> 会误判成「无 A」, 还会让 AI 在发牌中途抢跑亮A。
      break;

    case 'FORCED_CHECK':
      if (gameState['主A']) {
        // [2026-10-27 用户] 原来写死「跳过(主A已确立, 真人已亮A)」——
        //   但主A也可能是**AI**亮的(亮A倒计时结束后 AI 乙亮了) -> 说法自相矛盾
        var _za0 = gameState['主A'];
        log('  跳过(主A已确立: ' + pn(_za0.establishedBy) + ' ' + pvia(_za0.viaMethod) + ') -> 不用再强制排查');
        gateIdx++; return runGateStage();
      }
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
        _uiSetGateChoice({ kind: 'FAN_A', eligible: !!e2.ok, reason: e2.reason, cards: e2.cards, suit: e2.suit });
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
          _uiSetGateChoice({ kind: 'IDENTITY', eligible: true, reason: e3.reason });
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
        uiPassed = {};                 // [2026-10-27] 开局清「不出」(亮A 阶段的自动过牌不算)
        currentPlayer = determineFirstPlayer(gameState) || 'A';
        log('  首出权 → ' + pn(currentPlayer) + ' (§5)');
        logState('开局');
        log('  正式出牌阶段开始');
      }
      break;
  }
  gateIdx++;

  // [P0 修复 2026-10-24 00:09 用户实测] **死锁**: 引擎在 IDENTITY 阶段结束时就
  //   把 phase 变成了 PLAY, 而 currentPlayer 只在 PLAY 档里设置; 同时
  //   uiButtons() 在 PLAY 阶段**不再显示【下】** —— 于是:
  //     phase=PLAY 但 currentPlayer=null -> 按钮全灰(且切到谁都不能出)
  //     -> PLAY 档永远到不了 -> AI 也不出手
  //   用户实测: 「真人不亮A排查到甲被动亮牌, 但出牌阶段甲没有自动出牌,
  //   出牌过牌按钮是灰色的, 真人切换到甲也无法出牌」。
  //   修法: 一旦进入 PLAY 就**立刻补跑 PLAY 档**(设首出权), 不必再等一次【下】。
  //   递归安全: PLAY 档跑完 currentPlayer 已有值, 不会再进。
  if (gameState.phase === PHASES.PLAY && !currentPlayer) {
    runGateStage();
  }
}

// 授权者自动选 HIDDEN(真人无资格时; 沿用原自动链的行为)
// AI 亮A 轮: 按座位顺序让 AI 尝试亮A, 第一个成功的成为主A。
// [2026-10-24 用户要求] 「如果没有A, 等待其他玩家选择后自动进入下一阶段」
function _aiLiangARound() {
  if (gameState['主A']) return;               // 已有人亮A
  for (var i = 0; i < SEAT_IDS.length; i++) {
    var pid = SEAT_IDS[i];
    if (pid === humanPlayer) continue;
    if (gameState['主A']) return;
    var e = canLiangA(gameState, pid);
    if (!e.ok || !e.cards || !e.cards.length) continue;
    var r = transition(gameState, { type: ACTIONS.LIANG_A,
      payload: { playerId: pid, cardId: e.cards[0].id } });
    if (r && r.ok) {
      gameState = r.state;
      log('  AI ' + pn(pid) + ' 亮A → 主A: ' + psuit(gameState['主A'] && gameState['主A'].suit));
      return;
    }
  }
  log('  AI 均未亮A');
}

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
// [2026-10-24 用户修改] **删除【下】按钮**: 各阶段**自动判断**能否进入下一阶段,
//   可以就直接进入; 需要真人决策的阶段停下等真人点, 决策完自动续跑。
function gateAutoAdvance() {
  var guard = 0;
  while (guard++ < GATE_PLAN.length + 4) {
    if (gateIdx >= GATE_PLAN.length) break;
    // [2026-11-04 用户报障] 「亮牌后不能选牌不能出牌, 没有出牌按钮了」
    //   逐轮发牌是**异步**的(每 0.3 秒一轮): 发牌档跑完时牌**还没发完**。
    //   原来这里接着往下跑闸门(强制排查/反A/翻底牌/身份/出牌) ->
    //   引擎在 DEALING 阶段把这些动作**全部拒绝**, 但 gateIdx 一路 ++ ->
    //   **闸门计划被空转跑光**; 等牌发完再调 gateAutoAdvance 时已无档可跑
    //   -> 永远进不了 PLAY 阶段 -> 没有【出牌】按钮, 也不能选牌。
    //   修法: 发牌没结束就**停在这里**, 等 _dealStepTick 发完牌再续跑。
    if (gameState && gameState.phase === PHASES.DEALING) break;
    if (gateChoice && gateChoice.eligible) return false;   // 等真人决策, 停下
    gateChoice = null;
    runGateStage();
    enterPlayIfNeeded();   // 统一入口: 设首出权 + 触发 AI
  }
  return true;
}

// 真人亮A决策。doIt=true 亮, false 不亮。返回是否消费了本次决策。
function humanLiangA(doIt, suit) {
  if (!gateChoice || gateChoice.kind !== 'LIANG_A' || !gateChoice.eligible) return false;
  var cards = gateChoice.cards;
  gateChoice = null;              // 先消费, 防同一次决策被执行两次
  _uiLiangCountdownStop();        // [2026-10-27] 决策了就取消倒计时
if (!doIt) {
  log('  真人选择: 不亮A');
  _aiLiangARound();     // 真人放弃 -> AI 依次尝试亮A
  gateAutoAdvance();     // 自动进入下一阶段
  if (ctx) draw();
  return true;
}
  // [2026-10-26] 指定花色就亮那个花色的 A(花色按钮); 没指定就沿用原来「第一张 A」
  var card = null;
  if (suit) {
    card = (cards || []).filter(function (c) { return c && c.suit === suit; })[0] || null;
  } else {
    card = cards && cards[0];
  }
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
gateAutoAdvance();   // 决策完自动进入下一阶段
enterPlayIfNeeded();
  if (ctx) draw();
  return true;
}

// 真人反A决策。资格与花色均由引擎判定, UI 不自行判断
function humanFanA(doIt) {
  if (!gateChoice || gateChoice.kind !== 'FAN_A' || !gateChoice.eligible) return false;
  var cards = gateChoice.cards, suit = gateChoice.suit;
  gateChoice = null;
  _uiLiangCountdownStop();   // [2026-11-03] 反A 决策完 -> 取消 5 秒倒计时
if (!doIt) {
  log('  真人选择: 不反A');
  gateAutoAdvance();     // 自动进入下一阶段
  if (ctx) draw();
  return true;
}
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
gateAutoAdvance();   // 决策完自动进入下一阶段
enterPlayIfNeeded();
  if (ctx) draw();
  return true;
}

// 真人次方身份决策
function humanChooseIdentity(publicly) {
  if (!gateChoice || gateChoice.kind !== 'IDENTITY' || !gateChoice.eligible) return false;
  gateChoice = null;
  _uiLiangCountdownStop();   // [2026-11-03] 身份决策完 -> 取消 5 秒倒计时
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
  // [P0 2026-10-24] 这条路的 phase->PLAY 转换就在上面这行 transition 里,
  //   必须主动进 PLAY 阶段, 否则 currentPlayer 恒为 null(按钮全灰 + AI 不出手)。
gateAutoAdvance();   // 决策完自动进入下一阶段
enterPlayIfNeeded();
  if (ctx) draw();
  return true;
}

// === 初始化（由阶段闸门驱动）===
// 原实现是一条自动跑完的直线链, 中间零人工闸门; 现在**只跑第一个阶段「发牌」**,
// 其余阶段**自动推进**(见 gateAutoAdvance / runGateStage)。
// 原来的 runAI() 调用已移除 —— 现在由 gateAutoAdvance 在到达 PLAY 阶段时统一触发,
// 否则会在发牌阶段就让 AI 开打。
function initGame() {
  gateIdx = 0;
  gateChoice = null;
  log('=== 对局初始化 ===');
log('真人座位: ' + pn(humanPlayer) + ' (随机, 可用顶部 5 按钮切换)');
  log('阶段流程: 发牌 → [强制排查] → 反A → 翻底牌 → 次方身份 → 出牌');
gateAutoAdvance();   // 自动推进各阶段(遇真人决策则停下)
  uiTurnTick();
  uiStartTicker();
  if (ctx) draw();
}

try {
  initGame();
} catch (e) {
  log('初始化异常: ' + (e && e.message));
}

// === 新一局（【下一局】按钮）===
// 需求: 点击后必须重新发牌并重置真人座位(随机), 同时重置日志与所有派生 UI 状态。
//   漏掉任何一项都会让上一局残留污染新局(历史上出过的对局是其中一种)。
function newGame() {
  log('=== 点击【下一局】===');
humanPlayer = _randomSeat();      // 真人每局随机座位
  uiStopTicker();                   // 清理倒计时定时器
  uiStartTicker();                  // [2026-10-27] 重新起 ticker(原来只停不启 -> 下一局后倒计时不刷新, 玩家看不到)
  uiToast = null;                   // 清残留提示
  uiLogVisible = false;             // 日志面板默认隐藏
  uiMarks = {};                     // [2026-10-25] 新对局重置敌友标记
  uiMemoOpen = true;                // 记牌器默认展开(用户 2026-10-27)
  uiPlays = {};                     // 清掉各家出牌显示
  uiPassed = {};                    // [2026-10-27] 清掉上一局的「不出」标记(否则新局还挂着)
  uiAutoPlay = false;                 // [2026-11-04] 托管**不跨局保留**(新局重置为关)
  selectedCards = [];
  handCardHitboxes = [];
  lastEmptiedPlayer = null;
  currentPlayer = null;
  gameState = engine.newGameState();
  logHistory = [];                   // 新局重置日志(契约: 新局后第一条必须是「对局初始化」)
  initGame();                        // 重新走阶段闸门(内部会重置 gateIdx/gateChoice)
log('新局已开始, 真人=' + pn(humanPlayer) + '(随机座位)');
  if (ctx) draw();
}

// === 主渲染 ===
// ===== 提示条 (需求十二) =====
// 真人出牌失败时的简短提示。文案由用户指定, 不改字。
var uiToast = null;   // { text, until }
var NO_PLAYABLE_TEXT = '【当前没有可用牌】';

function showNoPlayableMsg(err) {
  // [2026-10-26] 提示文字要**按错误类型**分, 不能一律用「当前没有可用牌」
  //   (用户: 出牌不符合规则时提示文字不对)
  var t = (err && err.type) || '';
  var txt = NO_PLAYABLE_TEXT;
  if (t === 'INVALID_HAND') txt = '选的牌不是合法牌型';
  else if (t === 'CARD_NOT_IN_HAND') txt = '选的牌不在手里';
  else if (/BEAT/.test(t)) txt = '管不上桌上的牌';
  else if (t === 'NO_CARDS' || t === 'EMPTY_HAND') txt = '手里没有牌';
  else if (t === 'CARD_NOT_FOUND') txt = '找不到那张牌';
  else if (t === 'SUIT_MISMATCH') txt = '花色不对';
  else if (t) txt = '出不了这手牌(' + t + ')';
  uiToast = { text: txt, until: Date.now() + 2000 };
  log('  提示: ' + txt + (err ? ' (' + (err.type || '') + ')' : ''));
}

function uiToastNow() { return uiToast; }

// 通用短提示(2026-10-24): 【提示】按钮与各种状态都用它。
function showToast(txt, ms) {
  uiToast = { text: txt, until: Date.now() + (ms || 2600) };
}

// ===== 【提示】(2026-10-24) =====
// 按**当前规则**给出合法候选:
//   1) 候选来自引擎 combos.candidateCombos(hand) + 全部单张;
//   2) 每个候选用**引擎 transition** 逐个校验 —— 走的是和 doPlay **完全相同**的引擎路径,
//      所以「能过 transition」= 「出牌会被引擎接受」。**绝不推荐非法牌型。**
//   3) 选不出合法牌 -> 提示「当前没有可用牌」。
// 候选: 全部单张 + 引擎给的组合, 每个都用**引擎 transition** 校验(与 doPlay 同一路径)
// [2026-10-25 用户] 按**有效牌从小到大**排序(小王 < 小牌 < ... < 大A),
//   多次点【提示】时依次推荐下一个
function uiHintCandidates() {
  var me = gameState.players.find(function (p) { return p.id === humanPlayer; });
  if (!me || !me.hand || !me.hand.length) return [];
  var out = [], seen = {};
  // [2026-11-03 用户] 「提示的时候相同的牌不要一直提示, 循环回来的话可以再次提示」
  //   例: 上家出 44, 我有 5555/666/77 -> 应该 77 -> 666 -> 5555,
  //       而不是一堆 55 / 55 / 55 / 555 / 555 / 5555。
  //   做法:
  //     1) 候选按**牌型形状**去重(不是按牌的 id): 同点数的 4 张 5 只算一个候选;
  //     2) 同点数的组合只保留**最大**的一组(4 张 5 -> 只提示 5555, 不提示 55/555);
  //     3) 排序: **张数少的先**(2 张 -> 3 张 -> 4 张), 同张数再比牌力(小的先)。
  function add(ids, key) {
    if (!ids || !ids.length) return false;
    if (seen[key]) return false;
    var r = transition(gameState, { type: ACTIONS.PLAY,
      payload: { playerId: humanPlayer, cardIds: ids.slice() } });
    // 引擎不认 -> 不进候选; **seen 也不置位**(同形状的别的变体还有机会)
    if (!r || !r.ok) return false;
    seen[key] = 1;
    var cards = ids.map(function (id) { return me.hand.find(function (c) { return c.id === id; }); }).filter(Boolean);
    out.push({ ids: ids.slice(), cards: cards, label: _uiComboLabel(cards) });
    return true;
  }
  // 单张的「点数标识」: 同点数的 4 张 5 只提示一次; 大A/王 与普通 A 区分开
  function pointKey(c) {
    if (_uiIsMainAce(c)) return 'BIGA';
    if (c.isBigJoker) return 'BJ';
    if (c.isSmallJoker) return 'SJ';
    return 'R' + c.rank;
  }
  var singleSeen = {};
  me.hand.forEach(function (c) {
    var k = '1|' + pointKey(c);
    if (singleSeen[k]) return;
    singleSeen[k] = 1;
    add([c.id], k);
  });
  // [2026-10-25 用户] 「双大A」候选: 上家出了 3333 时, 双大A 能压住
  //   (引擎的 candidateCombos 不含这种**主A花色的两张A**组合)
  try {
    var _zhuSuit = gameState['主A'] && gameState['主A'].suit;
    if (_zhuSuit) {
      var _aces = me.hand.filter(function (c) { return c.rank === 14 && c.suit === _zhuSuit; });
      if (_aces.length === 2) {
        var _ids2 = [_aces[0].id, _aces[1].id];
        var _key2 = _ids2.slice().sort().join(',');
        if (!seen[_key2]) {
          var _r2 = transition(gameState, { type: ACTIONS.PLAY,
            payload: { playerId: humanPlayer, cardIds: _ids2.slice() } });
          if (_r2 && _r2.ok) {
            seen[_key2] = 1;
            out.push({ ids: _ids2.slice(), cards: _aces.slice(), label: '双大A' });
          }
        }
      }
    }
  } catch (e) { }
  // 组合: 同点数分组(只留最大的一组) + 其他形状(同形状只留一个)
  var sameRank = {}, others = [];
  try {
    (candidateCombos(me.hand) || []).forEach(function (ids) {
      if (!ids || ids.length < 2) return;
      var cs = ids.map(function (id) { return me.hand.find(function (c) { return c.id === id; }); }).filter(Boolean);
      if (cs.length !== ids.length) return;
      var same = cs.every(function (c) { return c.rank === cs[0].rank; });
      if (same) {
        var k = 'S|' + cs[0].rank;
        (sameRank[k] = sameRank[k] || []).push(ids);
      } else {
        others.push({ ids: ids, cards: cs });
      }
    });
  } catch (e) { }
  Object.keys(sameRank).forEach(function (k) {
    var list = sameRank[k].slice().sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < list.length; i++) {
      if (add(list[i], k)) break;      // 取引擎认可的最大那组
    }
  });
  others.forEach(function (o) {
    var ranks = o.cards.map(function (c) { return c.rank; }).slice().sort(function (a, b) { return a - b; });
    add(o.ids, 'C|' + o.cards.length + '|' + ranks.join('-'));
  });
  // 排序: 张数少的先(2 张 -> 3 张 -> 4 张) -> 同张数比牌力(小的先)
  out.sort(function (a, b) {
    if (a.cards.length !== b.cards.length) return a.cards.length - b.cards.length;
    var pa = _uiComboPower(a.cards), pb = _uiComboPower(b.cards);
    if (pa !== pb) return pa - pb;
    return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0);
  });
  return out;
}

// [2026-10-27 用户] 选中一张牌后, 自动补成**最小可用牌型**
//   规则: 在**引擎认可**(真能出)的候选里, 取 张数最少 / 同张数牌力最小 且**包含这张牌** 的那个
//   例: 手上有 8 9 9 10 10 J J Q Q, 桌面是 567 -> 选一张 9 -> 自动选中 8 9 10(3 张连张)
function _uiExpandSelection(cardId) {
  // [2026-11-03 用户] 别人出牌时真人可以**提前选牌**:
  //   预选阶段只该选中点的那张, **不能**按「当前能不能出牌」去自动扩展成牌型
  //   (那时引擎会拒绝真人的出牌 -> 候选为空 -> 刚选中的牌反而被清掉)。
  //   自己回合才做自动扩展(「选一张9, 自动补成8 9 10」的老行为)。
  if (currentPlayer !== humanPlayer) return;
  var cands;
  try { cands = uiHintCandidates(); } catch (e) { return; }
  var best = null, bestLen = 1e9, bestPow = 1e9;
  // [2026-11-03 用户] 「先判断手里的牌能不能组成有效牌型, 能的话不自动落下牌」
  //   -> 先找**同时含「点之前已选中的牌」和「刚点的这张」**的候选:
  //      能整组出就整组选上(例: 已选 6666, 再点 7 -> 66667777 假八, 不把 6666 落下);
  //      找不到就退回老行为(按点中的那张补最小牌型)。
  var keep = null, keepLen = 1e9, keepPow = 1e9;
  var before = selectedCards.filter(function (id) { return id !== cardId; });
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i];
    if (!c.ids || c.ids.indexOf(cardId) < 0) continue;
    var len = c.ids.length;
    var pw = _uiComboPower(c.cards);
    if (len < bestLen || (len === bestLen && pw < bestPow)) { best = c; bestLen = len; bestPow = pw; }
    var all = before.length > 0;
    for (var k = 0; k < before.length; k++) { if (c.ids.indexOf(before[k]) < 0) { all = false; break; } }
    if (all && (len < keepLen || (len === keepLen && pw < keepPow))) { keep = c; keepLen = len; keepPow = pw; }
  }
  // (1) 能跟已选的牌整组出 -> 整组选上(不落下)
  if (keep && keep.ids.length > 1) { selectedCards = keep.ids.slice(); return; }
  // (2) 点中的这张自己就能出 -> 不动(老行为: 继续累加选中)
  if (_uiSinglePlayable(cardId)) return;
  // (3) 退回老行为: 按点中的那张补最小牌型
  if (best && best.ids.length > 1) selectedCards = best.ids.slice();
}

// [2026-11-03] 这张牌**单出**是否合法(引擎说了算)。
//   用途: 自动补牌时, 如果这张牌自己就能出, 就不要动玩家的选择(老行为)。
function _uiSinglePlayable(cardId) {
  try {
    var r = transition(gameState, { type: ACTIONS.PLAY,
      payload: { playerId: humanPlayer, cardIds: [cardId] } });
    return !!(r && r.ok);
  } catch (e) { return false; }
}

// 组合的牌力取其中最大的一张
// 组合的牌力取其中最大的一张
// [2026-10-25] **大A 要算进去**(大A > 大王) -> 提示候选里大A 排在最前
function _uiComboPower(cards) {
  var mx = 0;
  (cards || []).forEach(function (c) {
    var p = uiRender.cardPower(c, _uiIsMainAce(c));
    if (p > mx) mx = p;
  });
  return mx;
}

// 候选的可读描述(不做完整牌型识别, 够用即可)
function _uiComboLabel(cards) {
  if (!cards || !cards.length) return "(空)";
  if (cards.length === 1) return "单张 " + cardDesc(cards[0]);
  var same = cards.every(function (c) { return c.rank === cards[0].rank; });
  if (same) return cards.length + "张" + rankDesc(cards[0]);
  return "组合 " + cards.map(cardDesc).join(" ");
}

// [2026-10-25 用户] 1) 选中牌后**不再弹提示文字**(已选中, 提示条多余)
//   2) 多次点击 -> 按有效牌从小到大依次推荐下一个候选
var uiHintIdx = 0;
function uiHint() {
  if (currentPlayer !== humanPlayer || gameState.phase !== PHASES.PLAY) {
    log('  提示: 现在不是你的回合');
    return false;
  }
  var cands = uiHintCandidates();
  if (!cands.length) {
    showToast(NO_PLAYABLE_TEXT);
    log('  提示: ' + NO_PLAYABLE_TEXT);
    if (ctx) draw();
    return false;
  }
  var pick = cands[uiHintIdx % cands.length];
  uiHintIdx = (uiHintIdx + 1) % cands.length;
  selectedCards = pick.ids.slice();
  log('  提示: ' + pick.label + ' -> 已选中 ' + pick.ids.length + ' 张');
  if (ctx) draw();
  return true;
}

// ===== 回合倒计时 (2026-10-24) =====
// **只显示, 不代替玩家操作** —— 到 0 只提示「请尽快出牌」, 不自动过牌(不发明规则)。
var uiTurnDeadline = 0;
var uiTurnTotal = 20000;
// [2026-11-03 用户] 其他玩家行动时 -> **先显示倒计时闹钟**, 等他出牌/过牌后才隐藏
//   (原来只有真人回合才有闹钟 -> AI 思考期间画面是静的, 不知道在等谁)
var uiAiWaitDeadline = 0;   // 当前 AI 的等待截止时间(0 = 没有 AI 在等)
var uiAiWaitTotal = 1000;   // 等待总时长(展示用)
var uiAiTurnAt = 0;         // 当前 AI 变成当前玩家的时间(算还要等多久)
var uiTicker = null;

function uiTurnTick() {
  // [2026-11-03 用户] 「出牌倒计时时间和真人玩家一样, 暂时先定 20 秒, 后面改成创建房间时设置的时间」
  //   -> 倒计时**跟着当前玩家走**(AI 回合同样计时), 总长统一 uiTurnTotal(20 秒)。
  //   AI 自己**等几秒再出牌**是另一件事(节奏, 见 AI_STEP_DELAY / _aiWaitMs)。
  //   每次换手都会重新计时 -> 这里**无条件清零再起表**。
  uiTurnDeadline = 0;
  if (currentPlayer && gameState.phase === PHASES.PLAY) {
    uiTurnDeadline = Date.now() + uiTurnTotal;
  }
}

function uiStartTicker() {
  if (uiTicker || typeof setInterval === "undefined") return;
  uiTicker = setInterval(function () { if (ctx && (uiTurnDeadline || uiLiangDeadline || uiAiWaitDeadline)) draw(); }, 250);
}

// ===== 亮A 决策倒计时 (2026-10-27 用户) =====
// 亮A 阶段取消【不亮】按钮, 改成 5 秒倒计时; 到点没人亮 -> 自动跳过亮A进入强制排查
var uiLiangDeadline = 0;
var uiLiangTotal = 5000;
var uiLiangTimer = null;
// [2026-11-03 用户] 「亮A 有 5 秒倒计时, 给反A、次方亮明身份也加 5 秒倒计时」
//   -> 三种**闸门**统一 5 秒; 超时按「等价于按了默认按钮」处理(亮A=不亮 / 反A=不反 / 身份=隐藏)。
var uiGateKind = null;   // 当前在倒计时的闸门类型('LIANG_A' | 'FAN_A' | 'IDENTITY')

function _uiLiangCountdownStart() {
  uiGateKind = (gateChoice && gateChoice.kind) ? gateChoice.kind : null;
  if (uiLiangTimer) return;
  uiLiangDeadline = Date.now() + uiLiangTotal;
  if (typeof setTimeout === 'undefined') return;
  uiLiangTimer = setTimeout(function () {
    uiLiangTimer = null;
    _uiLiangTimeout();
  }, uiLiangTotal);
}

function _uiLiangCountdownStop() {
  if (uiLiangTimer && typeof clearTimeout !== 'undefined') clearTimeout(uiLiangTimer);
  uiLiangTimer = null;
  uiLiangDeadline = 0;
  uiGateKind = null;
}

// 设置闸门决策的**单一入口**(生产流程和测试注入都走它)
//   亮A 的闸门 -> 同时启动 5 秒倒计时(到点没人亮 -> 自动进强制排查)
function _uiSetGateChoice(choice) {
  gateChoice = choice || null;
  // [2026-11-03 用户] 亮A / 反A / 次方亮明身份 —— **三种闸门都倒计时 5 秒**
  if (gateChoice && gateChoice.eligible) _uiLiangCountdownStart();
  else _uiLiangCountdownStop();
}

// 超时: 没人亮A -> 和原来的【不亮】一样: AI 依次尝试亮A, 然后自动进入强制排查
function _uiLiangTimeout() {
  uiLiangDeadline = 0;
  var _kind = uiGateKind;
  uiGateKind = null;
  if (!gateChoice || !gateChoice.eligible) return;
  // [2026-11-03 用户] 反A 超时 = 等同「不反」; 次方身份超时 = 等同「隐藏身份」
  if (_kind === 'FAN_A') {
    log('  反A 5 秒倒计时结束(没人反) -> 等同「不反」');
    humanFanA(false);
    return;
  }
  if (_kind === 'IDENTITY') {
    log('  次方身份 5 秒倒计时结束(没人选) -> 等同「隐藏身份」');
    humanChooseIdentity(false);
    return;
  }
  if (gateChoice.kind !== 'LIANG_A') return;
  log('  亮A 5 秒倒计时结束(没人亮) -> 由 AI 依次尝试亮A(没人能亮就进强制排查)');
  gateChoice = null;
  _aiLiangARound();
  gateAutoAdvance();
  if (ctx) draw();
}

// [2026-11-03 用户] 「出牌前亮A等倒计时的提示文字不要」-> 闸门倒计时**只画表盘**, 不再写说明文字

function uiStopTicker() {
  if (uiTicker && typeof clearInterval !== "undefined") clearInterval(uiTicker);
  uiTicker = null;
  uiTurnDeadline = 0;
  // [2026-11-03] AI 等待闹钟也要清(新局/重开不能留上一局的残留)
  uiAiWaitDeadline = 0;
  uiAiTurnAt = 0;
}

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
    // [2026-11-04 用户] **发牌中**也显示四个花色按钮(有A的可点、没有的置灰)
    if (ph === PHASES.DEALING) {
      var _dealHasSuit = {};
      (uiDealAces || []).forEach(function (card) { if (card && card.suit) _dealHasSuit[card.suit] = true; });
      ['S', 'H', 'D', 'C'].forEach(function (s) {
        out.push({
          id: 'dealLiangA:' + s,
          label: (uiRender.SUIT_CHAR && uiRender.SUIT_CHAR[s]) || s,
          kind: 'suit', suit: s, enabled: !gameState['主A'] && !!_dealHasSuit[s]
        });
      });
      return out;
    }
    // 阶段选择：亮A / 反A / 次方身份，按 gateChoice 的 kind 决定哪组
    if (c && c.kind === 'LIANG_A') {
      // [2026-10-26 用户] 亮A 阶段: 把「亮A」按钮换成**花色按钮** ——
      //   手上有几个花色的 A 就加几个按钮, 点哪个花色 = 亮哪个花色的大A
      // [2026-10-27 用户] **列出全部 4 个花色** —— 没有的 A 按钮置灰(不可点),
      //   有哪个 A 哪个按钮可点; 「不亮」按钮取消 -> 换成 5 秒倒计时, 到点自动进强制排查
      var _hasSuit = {};
      (c.cards || []).forEach(function (card) { if (card && card.suit) _hasSuit[card.suit] = true; });
      ['S', 'H', 'D', 'C'].forEach(function (s) {
        out.push({
          id: 'liangA:' + s,
          label: (uiRender.SUIT_CHAR && uiRender.SUIT_CHAR[s]) || s,
          kind: 'suit', suit: s, enabled: !!c.eligible && !!_hasSuit[s]
        });
      });
    } else if (c && c.kind === 'FAN_A') {
      out.push({ id: 'fanA', label: '反A', enabled: !!c.eligible });
      out.push({ id: 'noFanA', label: '不反', enabled: !!c.eligible });
    } else if (c && c.kind === 'IDENTITY') {
      out.push({ id: 'idPublic', label: '公开身份', enabled: !!c.eligible });
      out.push({ id: 'idHidden', label: '隐藏身份', enabled: !!c.eligible });
    }


  }

  if (playing) {
    // [2026-11-04 用户] 托管中 -> 真人**不能手动操作**(AI 代打), 按钮全部禁用
    var onTurn = currentPlayer === humanPlayer && !uiAutoPlay;
    out.push({ id: 'play', label: '出牌', enabled: onTurn });
    out.push({ id: 'pass', label: '不出', enabled: onTurn });
    // [2026-10-24] 【提示】: 只给**引擎校验过的合法候选**(见 uiHintCandidates)
    out.push({ id: 'hint', label: '提示', enabled: onTurn });
  }

  if (ended) {
    // [2026-10-25] 结算阶段的「下一局」**逻辑上仍然存在**(uiButtons 里保留, 测试 8.4 要),
    //   但**绘制**由结算面板自己做(画在面板内下方中央) -> drawButtons 在结算阶段跳过它
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
  // [2026-11-03 用户] 「中间出提示文字时, 如果我点按钮就立马把提示文字清掉」
  //   -> 点任何按钮先清掉上一条提示(它会一直杵在屏幕正中挡视线)。
  //   放在**动作之前**: 按钮自己产生的新提示(如【当前没有可用牌】)仍然要显示。
  uiToast = null;
  // [2026-10-26] 花色按钮: id = 'liangA:<花色>' -> 亮那个花色的大A
  if (typeof id === 'string' && id.indexOf('liangA:') === 0) {
    return humanLiangA(true, id.slice('liangA:'.length));
  }
  // [2026-11-04] 发牌中亮A: id = 'dealLiangA:<花色>'
  if (typeof id === 'string' && id.indexOf('dealLiangA:') === 0) {
    return _dealLiangA(id.slice('dealLiangA:'.length));
  }
  switch (id) {
    case 'liangA':   return humanLiangA(true);
    case 'noLiangA': return humanLiangA(false);
    case 'fanA':     return humanFanA(true);
    case 'noFanA':   return humanFanA(false);
    case 'idPublic': return humanChooseIdentity(true);
    case 'idHidden': return humanChooseIdentity(false);
case 'next':     log('  【下】已移除(各阶段自动推进)'); return false;
    case 'play':     doPlay(); return true;
    case 'pass':     doPass(); return true;
    case 'hint':     return uiHint();
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

// ===== UI 日志 + 【Log】开关 (需求十一) =====
// 默认**隐藏**: 不影响正常对局画面。**不影响日志记录** —— logHistory 一直在记,
//   只是默认不显示; 点右上角【Log】切换。
// 注意: 坐标在无 canvas 时也先算出来, 这样无头测试能验证命中区。
var uiLogVisible = false;
var btnLog = null;


// ===== 主渲染 (2026-10-24 交给 ui-render.js) =====
// 布局/绘制全在 ui-render.js: 纯几何, 可无头测试。
// **无 canvas 时仍然算几何**(ui-render 内部用 no-op ctx), 这样无头测试能验证命中区。
// ===== [2026-10-24] 每人最新出牌 / 当前积分 (UI 侧) =====

function _uiCardsByIds(ids, st) {
  var pool = [];
  (st.table || []).forEach(function (c) { pool.push(c); });
  (st.discarded || []).forEach(function (c) { pool.push(c); });
  (st.players || []).forEach(function (p) {
    (p.hand || []).forEach(function (c) { pool.push(c); });
    if (p['底牌']) pool.push(p['底牌']);   // 底牌是**一张牌**(deal.js: player.底牌 = 单张), 不是数组
  });
  var out = [];
  ids.forEach(function (id) {
    for (var i = 0; i < pool.length; i++) if (pool[i].id === id) { out.push(pool[i]); return; }
  });
  return out;
}

// [2026-10-24] 当前积分: **只来自引擎** calculateScore, UI 不自己算。
//   引擎是**终局才结算** -> 对局中途 winner 未定, 积分就是 0(中途还没定)。
function _uiScores() {
  try {
    var res = checkGameEnd(gameState);
    return calculateScore(gameState, res) || {};
  } catch (e) { return {}; }
}
// ===== [2026-10-25] v0.14.0 UI 配套状态 =====
// 敌友标记: uiMarks[观察者id][目标id] = 'friend' | 'enemy' | null(问号)
//   [用户] 每人一套独立标记(我标乙=友, 丙标乙=敌, 互不影响); 新对局重置; 圆钮不含自己
var btnMarkHits = null;
var btnMemo = null;
var btnPlayerHits = null;
var btnSettle = null;   // [2026-10-25] 结算面板里的「下一局」按钮(面板内下方中央)
// [2026-10-25] 「不出」的 UI 层状态: 引擎的 passedPlayers 语义是「有人出牌就清全员」,
//   但用户要的是「只在**该玩家自己**出牌时才清」+ 推风/新一轮时全清 -> 这里独立维护
// (uiPassed / uiPrevHandLens / uiPrevTableIds 的**赋值**在文件顶部 —— 必须早于 initGame())

// 敌友三态循环: ? -> 友 -> 敌 -> ?
function uiMarkCycle(pid) {
  var mine = uiMarks[humanPlayer] || (uiMarks[humanPlayer] = {});
  var cur = mine[pid] || null;
  mine[pid] = (cur === null) ? 'friend' : (cur === 'friend' ? 'enemy' : null);
  log('标记 ' + pn(pid) + ' -> ' + (mine[pid] === 'friend' ? '友' : (mine[pid] === 'enemy' ? '敌' : '?')));
  return mine[pid];
}

// 大A 判定: 引擎打的 is主方大A 标记(同花色的那两张 A)
function _uiIsMainAce(card) { return !!(card && card['is主方大A'] === true); }

// 主方头像右上角该显示几个大A花色标
//   1V4明打 -> 2; 1V4暗打 -> 1, 等主方打出第2张大A(该花色A已出场) -> 2
//   2V3 -> 主方 1 个; 次方仅在**身份亮明**(次方公开)时 1 个
// 主方头像右上角该显示几个大A花色标
//   1V4明打 -> 2; 1V4暗打 -> 1, 等主方打出第2张大A(该花色A已出场) -> 2
//   2V3 -> 主A持有者 1 个; 次方仅在**身份亮明**(次方公开)时 1 个
// [2026-10-25 用户反馈] 之前次方未亮明也显示了大A图标 -> 修正: 次方亮明才给
// [2026-10-25] 阵营标签: 只给**主A 持有者**标「主方」; 次方**身份亮明后**才标「次方」。
//   (之前用 state.主方 数组判主方 -> 次方未亮明时也被标成「主方」, 属于信息泄露)
// [2026-10-25] 同步「不出」显示状态
//   1) 某个玩家手牌变少 -> 他出牌了 -> **只清他一个人的**「不出」
//   2) 桌牌上的牌**一张都不在了**(桌牌被收走 = 新一轮 or 推风) -> 所有人「不出」清掉, 各家出牌显示也清掉
// [2026-10-26] 同步「当前轮」
//   桌牌上的牌被**整体换掉**(和上一帧没有任何一张重叠) = 引擎收走了旧桌牌 = 新的一轮
//   -> 清掉**旧一轮**各家的出牌显示(否则桌面显示陈牌, 且「不出」被抑制)
//   引擎侧的推风整轮清空由 _uiRoundEnded 负责
function _uiSyncTrick() {
  var g = gameState;
  var cur = {};
  (g.table || []).forEach(function (c) { cur[c.id] = 1; });
  var had = Object.keys(uiPrevTableIds).length > 0;
  var overlap = false;
  for (var oid in uiPrevTableIds) { if (cur[oid]) { overlap = true; break; } }
  if (had && !overlap && Object.keys(cur).length > 0) {
    // [2026-10-26] **这里不递增 uiTrickId** ——
    //   「换点数」**不是**「新一轮」(一轮里可以连着换点数跟牌)。
    //   之前这里和 _uiRoundEnded **两个地方都递增** -> trick 翻倍跳变 ->
    //   某人刚出的牌被判成「上一轮的」-> 他一过牌就被清掉(用户: 清牌不对)。
    //   轮次**只**由 _uiRoundEnded(引擎清空桌牌 = 轮末)推进。
  }
  uiPrevTableIds = cur;
}

function _uiSyncPassState() {
  var g = gameState;
  if (!g || !g.players) return;
  // 只清**他自己**的「不出」(他出牌了)
  // [2026-10-26] 这里**绝对不要碰 uiPlays**: 我之前加的"旧桌牌一张都不在了就清空"会误判 ——
  //   打大A 里**每个点数变化都会收走桌牌** -> 每次都触发 -> 各家刚出的牌被清掉
  //   -> 桌面上的牌一直看不见(用户报的 bug)。一轮结束的清理由 _uiRoundEnded 负责
  //   (那才是引擎给出的准确信号)。
  g.players.forEach(function (p) {
    var prev = uiPrevHandLens[p.id];
    if (prev !== undefined && p.hand.length < prev) delete uiPassed[p.id];
    uiPrevHandLens[p.id] = p.hand.length;
  });
  // [2026-10-26] **推风成功** -> 「不出」全清(引擎这时会清空桌牌)
  var _pw = g['推风触发者'] || null;
  if (_pw && _pw !== uiPrevPushWind) uiPassed = {};
  uiPrevPushWind = _pw;
  // [2026-10-26] **轮末检测统一放这里**(不再分散在各 action 路径):
  //   引擎 src/play.js handlePass 的 allPassed 分支 -> 轮末时**桌牌被清空**
  //   -> 「上一帧桌牌非空, 这一帧空了」= 轮末。
  //   (之前只有真人 doPass 路径调 _uiRoundEnded -> **AI 过牌结束一轮时轮次不推进**,
  //    轮末的清牌 / 「已出完」也就都不触发。)
  var _tLen = (g.table || []).length;
  if (uiPrevTableLen > 0 && _tLen === 0) _uiRoundEnded();
  uiPrevTableLen = _tLen;
}

// [2026-10-26] **当前轮**各家的出牌显示(只传当前轮的!)
//   根因: uiPlays 里存的是「历史所有出牌」, 渲染层用 hasPlay 决定要不要显示「不出」
//   -> 上一轮出过牌的人, 这一轮 PASS 了, 记录还在 -> 「不出」被抑制 -> 用户永远看不到
//   -> 只把**当前轮**的给他, 上一轮出过的牌自然不挡着「不出」
function _uiCurrentPlays() {
  var out = {};
  Object.keys(uiPlays).forEach(function (pid) {
    if (uiPlaysTrick[pid] === uiTrickId) out[pid] = uiPlays[pid];
  });
  return out;
}

// [2026-10-26] 记录一次出牌到 UI 的「各家最新出牌」
//   **根因**: doPlay 走自己的 transition 路径(多张/逐张两条), **不经过 applyAction**,
//   而 uiPlays 只在 applyAction 里被更新 -> 真人/引擎出牌后桌面上看不到他出的牌
//   (用户: 别人出的牌看不见)。applyAction 那边也改成走这个函数, 保证两条路径一致。
function _uiRecordPlay(pid, cards) {
  if (!cards || !cards.length) return;
  _uiSyncTrick();                       // 可能开了新一轮 -> 先清掉旧一轮的显示
  uiPlays[pid] = cards;
  uiPlaysTrick[pid] = uiTrickId;
}

// [2026-10-26] 过牌后的收尾(真人和 AI 两条路径共用)
//   1) 标记「不出」
//   2) 清掉**上一轮**留下的出牌显示 —— 他这轮不出, 上一轮那手牌不该还挂在桌面上,
//      而且那手牌会**把「不出」文字挡住**(用户: pass后牌没清, 不出文字被压住了)
//      **本轮**出的牌要保留(他出了牌, 牌就在桌上)
function _uiPassCleanup(pid) {
  uiPassed[pid] = true;
  // [2026-10-26] **无条件清掉他的出牌显示** ——
  //   他过牌了 = 这一轮他不出 -> 头像旁边必须显示「不出」, 而不是他上一轮出的牌。
  //   (用户: 甲出 AAAA, 乙不出、丙不出, 他们画面上应该显示「不出」, 不是之前的 QQQ)
  //   之前靠 uiPlaysTrick === uiTrickId 判断「是不是本轮出的」, 但 uiTrickId 只在**轮末**递增,
  //   而一轮里只要有人一直出牌就**永不变** -> 上一轮的牌永远清不掉 -> 一直显示旧牌。
  //   既然 PASS 就代表这轮不打, 直接清掉最直接, 也不依赖轮次。
  delete uiPlays[pid];
  delete uiPlaysTrick[pid];
}

function _uiCamps() {
  var g = gameState;
  var out = { main: null, second: null, secondOpen: false };
  if (g['主A'] && g['主A'].establishedBy) out.main = g['主A'].establishedBy;
  if (g['次方']) {
    out.second = g['次方'];
    // [2026-10-26] **2V3_明打 模式下次方身份「始终公开」** —— 但引擎**不会**把
    //   state.次方公开 置成 true(无需再触发) -> 只看该字段会误判成「未亮明」,
    //   导致顶栏「次X」是灰色、头像角标也不出现。引擎 transition.js 注释写明这一点。
    var _mode = g.mode || '';
    out.secondOpen = (g['次方公开'] === true) || (_mode.indexOf('2V3_明打') >= 0);
  }
  return out;
}

function _uiMainAceMarks() {
  var out = {};
  var g = gameState;
  var zhu = g['主A'];
  if (!zhu || !zhu.suit) return out;
  var mode = g.mode || '';
  var suit = zhu.suit;
  if (mode.indexOf('1V4') === 0) {
    var main = zhu.establishedBy;
    var n = 1;
    if (mode.indexOf('明打') >= 0) {
      n = 2;
    } else {
      var playedA = 0;
      (g.discarded || []).forEach(function (c) { if (c.suit === suit && c.rank === 14) playedA++; });
      (g.table || []).forEach(function (c) { if (c.suit === suit && c.rank === 14) playedA++; });
      if (playedA >= 1) n = 2;
    }
    if (main) out[main] = n;
  } else {
    // [2026-10-26] 2V3: **亮过大A 的人显示 1 个角标**
    //   (之前我理解错了, 直接把 2V3 的角标全去掉了 -> 用户报「甲亮A后头像上没有大A图标」)
    //   **2 个**角标是**独打(1V4)**才有(他手里 2 张主方大A); 2V3 每个相关的人只标 1 个。
    if (zhu.establishedBy) out[zhu.establishedBy] = 1;
    // 次方**公开身份后**也要标 1 个(他打出过大A 才公开身份)
    // (用户: 次方戊大A角标没有)
    if (g['次方'] && (g['次方公开'] === true || mode.indexOf('2V3_明打') >= 0)) out[g['次方']] = 1;
  }
  // [2026-10-26] **不再累加**「打出过大A」的次数 —— 那是累计值, 打几次就几个图标,
  //   而且跨局不清 -> 用户看到「双大A的图标出了4个」。角标只表示**持有几张主方大A**。
  return out;
}

// 记牌器: 还没打出的牌 = 所有人手牌 + 未翻开的底牌(翻开后就进了 hand)
//   顺序按 §6.2 单牌大小: 大A > 大王 > 小王 > 3 > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4
//   大A 单独统计(不影响 A 的个数, A 里包含大A)
function _uiMemo() {
  var bigAce = 0, bigJoker = 0, smallJoker = 0;
  var byRank = {};
  function add(c) {
    if (!c) return;
    if (_uiIsMainAce(c)) bigAce++;
    if (c.isBigJoker) { bigJoker++; return; }
    if (c.isSmallJoker) { smallJoker++; return; }
    if (!byRank[c.rank]) byRank[c.rank] = { red: 0, black: 0 };
    if (c.suit === 'H' || c.suit === 'D') byRank[c.rank].red++; else byRank[c.rank].black++;
  }
  (gameState.players || []).forEach(function (p) {
    (p.hand || []).forEach(add);
    if (p['底牌']) add(p['底牌']);
  });
  var suit = gameState['主A'] ? gameState['主A'].suit : null;
  var items = [];
  // [2026-10-26] 参照图3: 上排只写牌名(不画花色), 下排数字按**花色**着色(红桃/方块=红, 黑桃/梅花=黑)
  var aceCol = (suit === 'H' || suit === 'D') ? '#c8102e' : '#1a1a1a';
  items.push({ label: '大A', value: bigAce, suitColor: aceCol });
  items.push({ label: '大王', value: bigJoker, suitColor: '#c8102e' });
  items.push({ label: '小王', value: smallJoker, suitColor: '#1a1a1a' });
  var order = [3, 2, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4];
  var names = { 3: '3', 2: '2', 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4' };
  order.forEach(function (rk) {
    var d = byRank[rk] || { red: 0, black: 0 };
    var col = (d.red > 0 && d.black === 0) ? '#c8102e'
            : ((d.black > 0 && d.red === 0) ? '#1a1a1a' : '#888888');
    items.push({ label: names[rk], value: (d.red + d.black), suitColor: col });
  });
  return { items: items };
}

// 测试模式: 微信开发者工具 或 无 wx 的 node 环境 -> 显示完整调试信息; 真机 -> 精简
function _uiTestMode() {
  if (typeof wx === 'undefined') return true;
  try {
    var info = wx.getSystemInfoSync();
    return !info || info.platform === 'devtools';
  } catch (e) { return true; }
}

// 一轮结束(有人过牌导致) -> 清掉各家最新出牌
// [2026-10-26] 一轮结束 -> 「不出」标记也清空, **但保留刚过牌的那个人**
//   (他确实刚过牌, 「不出」要一直显示到他**自己出牌**为止; 之前连他一起清掉了
//    -> 用户看到的现象是「其他玩家过牌后都不显示不出文字」)
//   推风时引擎清空桌牌也走这里 -> 桌牌和「不出」一起清
function _uiRoundEnded() {
  // [2026-10-26 用户] 1) 轮次 +1(标记「这一轮过去了」)
  //   2) **「不出」文字保留**(用户: 轮末不清不出文字) -> **不动 uiPassed**
  //   3) **已经出完牌的人**: 清掉他留在桌面上的牌 -> 渲染层就会显示「已出完」
  //      (用户: 已出完牌的人的桌面要清干净, 并提示已出完)
  //   其它没出完的人: 桌面上的牌**保留**(用户: 别人出的牌看不见)
  uiTrickId++;
  (gameState.players || []).forEach(function (p) {
    if (p && p.hand && p.hand.length === 0) {
      delete uiPlays[p.id];
      delete uiPlaysTrick[p.id];
    }
  });
}

// [2026-11-04 用户] 「牌局结束的时候后面的闹钟要清掉」
//   -> 回合 20 秒 / AI 等待 / 闸门 5 秒的倒计时**全部**清零(画面上不该再有表盘)。
function _uiClearCountdowns() {
  uiTurnDeadline = 0;
  uiAiWaitDeadline = 0;
  uiAiTurnAt = 0;
  uiAiWaitPlan = 0;
  _uiLiangCountdownStop();
}

// [2026-11-04 用户] 「发牌阶段记牌器收起来, 等出牌阶段再判断要不要展开」
//   -> 发牌阶段(牌还没发齐, 记出来的数没意义)强制收起; 进 PLAY 后按用户设置恢复。
function _uiMemoOpenNow() {
  if (gameState && gameState.phase === PHASES.DEALING) return false;
  return uiMemoOpen;
}

function draw() {
  // [2026-10-25] 同步「不出」显示状态(谁出牌了/桌牌被收走了)
  _uiSyncPassState();
  // [2026-11-03/04 用户] 「牌局结束的时候后面的闹钟要清掉」
  //   -> 结束后不再有任何倒计时(回合 20 秒 / AI 等待 / 闸门 5 秒), 也不该继续倒数。
  if (gameState.phase === PHASES.GAME_END) _uiClearCountdowns();
  var out = uiRender.render(ctx || uiRender.noopCtx(), {
    W: W, H: H,
    gameState: gameState,
    currentPlayer: currentPlayer,
    humanPlayer: humanPlayer,
    selectedCards: selectedCards,
    names: names,
    rankDesc: rankDesc,
    cardDesc: cardDesc,
    buttons: uiButtons(),
    stageHint: _stageHint(),
    logVisible: uiLogVisible,
    logHistory: logHistory,
    toast: uiToast,
    uiPlays: uiPlays,
    // [2026-10-26] 渲染层要用「本轮是否出过错牌」来判定要不要显示「不出」
    //   (上一轮出的牌**仍然显示**在桌上, 但不能因此抑制他的「不出」)
    uiPlaysTrick: uiPlaysTrick,
    uiTrickId: uiTrickId,
    marks: uiMarks,
    // [2026-11-04 用户] 「发牌阶段记牌器收起来, 等出牌阶段再判断要不要展开」
    //   -> 发牌阶段强制收起(牌还没发齐, 记出来的数没意义);
    //      进入出牌阶段后按用户设置(默认展开)恢复。
    memoOpen: _uiMemoOpenNow(),
    memoItems: _uiMemo().items,
    testMode: _uiTestMode(),
    isMainAce: _uiIsMainAce,
    mainAceSuit: gameState['主A'] ? gameState['主A'].suit : null,
    mainAceMarks: _uiMainAceMarks(),
    camps: _uiCamps(),
    uiPassed: uiPassed,
    scores: _uiScores(),
    settlement: (gameState.phase === PHASES.GAME_END) ? _settlementData() : null,
    // [2026-10-27] 亮A 阶段用**亮A 倒计时**(5 秒); 出牌阶段用回合倒计时(20 秒)
    // [2026-11-03] 倒计时闹钟: 亮A 用亮A 的, 真人回合用回合的, **AI 回合用 AI 等待的**
    // [2026-11-03] 闸门倒计时(亮A/反A/身份, 5 秒)优先; 其次出牌回合倒计时(20 秒, 任何玩家轮到都计时)
    // [2026-11-03 用户] 「牌局结束的时候后面的闹钟要清掉」-> 结束后一律不画闹钟
    turnDeadline: (gameState.phase === PHASES.GAME_END) ? 0 : (uiLiangDeadline ? uiLiangDeadline : (uiTurnDeadline || uiAiWaitDeadline)),
    turnTotal: (gameState.phase === PHASES.GAME_END) ? 0 : (uiLiangDeadline ? uiLiangTotal : (uiTurnDeadline ? uiTurnTotal : uiAiWaitTotal)),
    turnIsLiang: !!(gateChoice && gateChoice.kind === 'LIANG_A'),   // [2026-10-27] 亮A 倒计时画大一点
    turnIsGate: !!uiGateKind,             // [2026-11-03] 三种闸门倒计时都用大表盘
    autoPlay: uiAutoPlay,
    phase: gameState.phase
  });
  btnLog = out.btnLog;
  btnStage = out.btnStage;
  handCardHitboxes = out.handHitboxes;
  btnSelectPlayers = out.seatHitboxes;
  btnMarkHits = out.markHits;
  btnMemo = out.memoIcon;
  btnSettle = out.settleBtn;
  btnAutoPlay = out.autoPlayIcon;
  btnAutoPlayCancel = out.cancelAutoPlayBox;
}

// === 首次 draw (启动渲染) ===
if (ctx) draw();

// === 轮次结束检测 ===
function _stageHint() {
  var c = gateChoice;
  var ph = gameState.phase;
  if (ph === PHASES.GAME_END) return '本局结束';
  if (ph === PHASES.PLAY) {
    return currentPlayer === humanPlayer ? '轮到你出牌' : ('等待 ' + pn(currentPlayer) + ' 行动');
  }
  var stage = gateIdx < GATE_PLAN.length ? GATE_PLAN[gateIdx].label : '准备';
  if (c && !c.eligible) return stage + '（你无相应资格，自动继续）';
  if (c && c.eligible) return stage + '（需你先选择）';
  return stage;
}
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
  // [2026-11-03 用户] 别人出牌时真人可以**提前选牌**, 但**不能打出**
  //   -> 这里显式拦住「真人在别人回合把自己的牌打出去」。
  //   判据是**牌的归属**(选中的牌里有没有真人的牌), 不是「当前玩家是不是真人」:
  //     - 真人回合 -> 放行(正常出牌)
  //     - 别人回合 + 选中的是自己的牌 -> 拦住(真人不能替别人出牌/抢先出牌)
  //     - 别人回合 + 选中的是别人的牌(无头测试用它模拟别人出牌) -> 放行
  if (currentPlayer && currentPlayer !== humanPlayer) {
    var _meNow = gameState.players.filter(function (p) { return p.id === humanPlayer; })[0];
    var _mineSel = (_meNow && _meNow.hand ? _meNow.hand : []).filter(function (c) {
      return selectedCards.indexOf(c.id) >= 0;
    });
    if (_mineSel.length > 0) {
      log('  提示: 现在不是你的回合, 不能出牌');
      showToast('还没轮到你出牌');
      if (ctx) draw();
      return;
    }
  }
  var player = gameState.players.find(function (p) { return p.id === currentPlayer; });
  if (!player || player.hand.length === 0) {
    log((names[['A','B','C','D','E'].indexOf(currentPlayer)] || currentPlayer) + ' 手牌空, 不能出牌');
    if (ctx) draw();
    return;
  }
  // [D] 优先用 selectedCards (多选多牌型)
  var lastError = null;
  // [2026-10-27 用户] **没选中牌点【出牌】-> 弹提示, 不自动出牌**
  //   (原来会「逐张检查手牌」自动替他出一张, 玩家根本不知道自己出了什么)
  if (selectedCards.length === 0) {
    showToast('请先选牌');
    log('  提示: 请先选牌(没有选中任何牌)');
    if (ctx) draw();
    return;
  }
  if (selectedCards.length > 0) {
    // [2026-10-26] 先把要出的牌对象抓出来(transition 之后牌就不在手牌里了)
    var _playedCards0 = selectedCards.map(function (id) {
      return player.hand.concat(gameState['底牌'] || []).find(function (x) { return x.id === id; });
    }).filter(function (c) { return !!c; });
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
      _uiRecordPlay(currentPlayer, _playedCards0);   // [2026-10-26] 桌面显示他的牌
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
        gameState.phase = 'GAME_END'; _uiClearCountdowns();
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
      _uiRecordPlay(currentPlayer, [card]);   // [2026-10-26] 桌面显示他的牌
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
        gameState.phase = 'GAME_END'; _uiClearCountdowns();
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
        if (e2.ended) { gameState.phase = 'GAME_END'; _uiClearCountdowns(); log('牌局结束: ' + fmtResult(e2)); } else { doPushWindIfPending(false); }
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
    // [2026-10-26] 过牌**不再删**自己的出牌显示 ——
    //   他的牌还在桌上(只是这轮没跟), 删了会导致「他出的对4/对6看不见」
    //   旧逻辑(2026-10-24)是为清掉「轮到真人时显示自己的旧牌」, 但过牌时删错了
    // [2026-10-26] 过牌 -> 标记「不出」, 并清掉他的出牌显示
    //   (他这轮不出 -> 头像旁边显示「不出」, 之前那手牌不该还挂着挡住它)
    //   轮末处理**不在这里**: 统一由 draw() 里的 _uiSyncPassState 检测引擎信号后做,
    //   否则只有真人过牌这条路径会推进轮次, AI 过牌结束一轮时就不推进。
    _uiPassCleanup(currentPlayer);
    selectedCards = [];       // [2026-11-03] 真人过牌 -> 预选作废(下一轮要重选)
    advanceCurrentPlayer();
    var endR = checkGameEnd(gameState);
    if (endR.ended) {
      gameState.phase = 'GAME_END'; _uiClearCountdowns();
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
    // [2026-11-04 用户] 推风把回合交给谁 -> 谁就清掉上一轮留下的出牌显示 /「不出」标记
    //   (推风不走 advanceCurrentPlayer -> 真人自己的「不出」留着 -> 按钮被藏起来, 只剩闹钟)
    if (currentPlayer) {
      _uiClearTurnDisplay(currentPlayer);
      uiTurnTick();
    }
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
      gameState.phase = 'GAME_END'; _uiClearCountdowns();
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
    // [2026-10-26] **AI 节奏**: 每个 AI 动作之间停顿 1 秒(用户: AI玩家出牌太快了)
    // [2026-11-03] 改成「**每个 AI 从变成当前玩家起等 1 秒**」(原来是「距上一个 AI 动作 1 秒」)
    //   -> 每个 AI 回合都有可感知的等待, 期间**点着倒计时闹钟**(用户:「其他玩家出牌时
    //   应该先显示倒计时, 等他们出牌或过牌后才会把闹钟隐藏掉」)。
    var _now = Date.now();
    if (!uiAiTurnAt) {
      uiAiTurnAt = _now;   // 刚进 PLAY 就轮到 AI 的情况
      if (!uiAiWaitPlan) uiAiWaitPlan = _aiWaitMs(AI_STEP_DELAY);
    }
    // [2026-11-04] 所有 AI 统一「随机约 1 秒」出牌(本回合时长在 advanceCurrentPlayer 里定好)
    var _waitMs = uiAiWaitPlan || AI_STEP_DELAY;
    var _waitLeft = _waitMs - (_now - uiAiTurnAt);
    if (_waitLeft > 0) {
      // 还在等这个 AI 行动 -> **闹钟点亮**(显示还剩多久)
      // [2026-11-03] 闹钟**只在真正等待时**点亮: 上一家出完牌的那一帧是
      //   「他出的牌 / 不出」(闹钟熄), 下一个 AI 开始等才重新点亮。
      uiAiWaitDeadline = _now + _waitLeft;
      uiAiWaitTotal = _waitMs;
      setTimeout(runAI, _waitLeft);
      return;
    }
    uiAiWaitDeadline = 0;   // 他要动了 -> 闹钟收起来(这一刻画面上是「他出的牌 / 不出」)
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
            gameState.phase = 'GAME_END'; _uiClearCountdowns();
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
        // [2026-10-24] 记录 AI 最新出牌 -> 显示在它自己座位前方
        if (action.type === ACTIONS.PLAY && action.cardIds && action.cardIds.length) {
          _uiRecordPlay(currentPlayer, _uiCardsByIds(action.cardIds, gameState));
    // [2026-10-26] 统计该玩家**打出**过几张主方大A -> 头像左上角角标
    var _bigN = 0;
    (uiPlays[currentPlayer] || []).forEach(function (c) { if (c && c.is主方大A) _bigN++; });
    if (_bigN) uiBigAcePlayed[currentPlayer] = (uiBigAcePlayed[currentPlayer] || 0) + _bigN;
        } else if (action.type === ACTIONS.PASS) {
          // [2026-10-26] 过牌**不删**本轮自己的出牌显示(他的牌还在桌上);
          //   但**上一轮**的出牌显示要清掉(不然会挡住「不出」文字)
          //   [2026-10-26] AI 的 PASS 走的是**这条路径**(不是 doPass),
          //   之前只在 doPass 里置位 -> AI/其他人过牌时「不出」永远不显示。
          //   我的回归测试也只覆盖了 doPass(真人过牌) -> 漏掉了这条路径。
          _uiPassCleanup(currentPlayer);
        }
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
          gameState.phase = 'GAME_END'; _uiClearCountdowns();
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

// [2026-11-04 用户] 轮到某人时 -> 清掉他上一轮留下的出牌显示 / 「不出」标记。
//   推风**不走** advanceCurrentPlayer, 所以单独抽出来给两条路径共用:
//   真人自己的「不出」标记留着的话, 渲染层的「按钮让位」逻辑会把
//   【出牌/不出/提示】藏起来(画面上只剩闹钟) —— 用户 2026-11-04 实测报障。
function _uiClearTurnDisplay(pid) {
  delete uiPlays[pid];
  delete uiPlaysTrick[pid];
  delete uiPassed[pid];
  if (pid === humanPlayer) {
    uiAiTurnAt = 0;         // 真人回合 -> 不留上一轮的 AI 等待起点(否则下一轮 AI 少等)
    uiAiWaitPlan = 0;      // 真人回合 -> 清掉上一轮 AI 的等待时长
    uiAiWaitDeadline = 0;   // 真人回合 -> AI 的等待闹钟必须熄(否则残留的截止时间会继续倒数)
  } else {
    uiAiTurnAt = Date.now();   // AI 变成当前玩家 -> 开始算它的等待(闹钟)
    uiAiWaitPlan = _aiWaitMs(AI_STEP_DELAY);   // 本回合的随机等待时长(约 1 秒)
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
      var _prevCur = currentPlayer;   // [2026-11-03] 记下换手前是谁 -> 决定要不要清真人的预选
      currentPlayer = next;
      // [2026-10-24] 倒计时跟着回合走: 轮到真人就计时, 离开就清零
      uiTurnTick();
      // [2026-11-03 用户] 轮到真人出牌 -> **清掉自己上一手牌的显示**
      //   真人出的牌现在画在**原来按钮的位置**(ui-render layout().humanPlay),
      //   不清掉就会和【出牌/不出/提示】三个按钮叠在一起。
      //   用户原话「正常轮到自己出牌时上一手牌应该清掉显示按钮」。
      //   [2026-11-02 旧行为] 当时是「不清掉」(那套方案下牌画在牌桌中央, 不冲突) ——
      //   2026-11-03 牌位改到按钮行后, 必须清掉。
      // [2026-11-03 用户] 「轮到AI玩家出牌时, 闹钟显示的时候要把他上一轮出的牌或者不出文字清掉」
      //   -> 轮到谁就清掉他上一轮留下的出牌显示 / 「不出」标记:
      //      真人回合 -> 按钮位让出来(旧行为); AI 回合 -> 座位前方的闹钟不跟旧牌/「不出」打架。
      _uiClearTurnDisplay(next);
      // [2026-11-03 用户] 别人出牌时真人**可以提前选牌**(只是不能打出)
      //   -> 换手时**不能**无条件清空选中: 只有「刚才是真人在行动」才清
      //      (真人出牌/过牌时清; AI 行动时保留真人的预选)。
      if (_prevCur === humanPlayer) selectedCards = [];
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
        // [2026-10-25 P0 修复] 原来用**槽位索引**当玩家 ID, 但座位现在是**动态环排**的
        //   -> 点谁都不是谁(切不到戊)。改成用 hitbox 里带的**真实 pid**。
        humanPlayer = bp.id;
        log('切换玩家: ' + names[['A','B','C','D','E'].indexOf(bp.id)]);
        draw();
        return;
      }
    }

    // [2026-10-24 用户要求] **删掉【Log】按钮**(它压住了微信胶囊按钮) -> 命中分支一并删除


    // [2026-10-25] 结算面板里的「下一局」按钮(面板内下方中央)
    if (btnSettle && x >= btnSettle.x && x <= btnSettle.x + btnSettle.w &&
        y >= btnSettle.y && y <= btnSettle.y + btnSettle.h) {
      uiClick('newGame');
      draw();
      return;
    }
    // [2026-10-25] 记牌器图标: 点击展开/收起记牌器
    if (btnMemo && x >= btnMemo.x - btnMemo.r && x <= btnMemo.x + btnMemo.r &&
        y >= btnMemo.y - btnMemo.r && y <= btnMemo.y + btnMemo.r) {
      uiMemoOpen = !uiMemoOpen;
      log('记牌器: ' + (uiMemoOpen ? '展开' : '收起'));
      draw();
      return;
    }
    // [2026-11-04 用户] 顶栏小机器人按钮: 切换托管(AI 代打真人手牌)
    if (btnAutoPlay && x >= btnAutoPlay.x - btnAutoPlay.r && x <= btnAutoPlay.x + btnAutoPlay.r &&
        y >= btnAutoPlay.y - btnAutoPlay.r && y <= btnAutoPlay.y + btnAutoPlay.r) {
      _uiToggleAutoPlay();
      draw();
      return;
    }
    // [2026-11-04 用户] 托管时真人手牌区的半透明「取消托管」标识: 点它也能取消
    if (btnAutoPlayCancel && x >= btnAutoPlayCancel.x && x <= btnAutoPlayCancel.x + btnAutoPlayCancel.w &&
        y >= btnAutoPlayCancel.y && y <= btnAutoPlayCancel.y + btnAutoPlayCancel.h) {
      _uiToggleAutoPlay();
      draw();
      return;
    }
    // [2026-10-25] 敌友钮: 点击循环 ? -> 友 -> 敌 -> ?
    for (var mk = 0; mk < (btnMarkHits || []).length; mk++) {
      var mh = btnMarkHits[mk];
      if (x >= mh.x && x <= mh.x + mh.w && y >= mh.y && y <= mh.y + mh.h) {
        uiMarkCycle(mh.id);
        draw();
        return;
      }
    }

    // 统一按钮模型（需求八）: 可用性已由 uiButtons() 判定, 这里只按 id 分发。
    //   不可用的按钮在 uiButtonAt 里已跳过, 不会被命中。
    var hitBtn = uiButtonAt(x, y);
    // [2026-10-25] 结算阶段: 「下一局」的真实按钮在**结算面板内**, 由 btnSettle 命中;
    //   底部那个不可见的同名按钮不要再触发
    if (hitBtn && !(hitBtn.id === 'newGame' && btnSettle)) {
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
      // [2026-11-03 用户] 「手牌区最右侧的手牌右侧点击无法选中这张牌」
      //   -> 最后一张整张露出时命中区要盖住整张牌(fullW); 其余仍是 step 宽。
      var _hw = hb.fullW || hb.w;
      if (x >= hb.x && x <= hb.x + _hw && y >= hb.y && y <= hb.y + hb.h) {
        if (!hb.cardId) continue;          // 底牌占位但不可点
        var idx2 = selectedCards.indexOf(hb.cardId);
        if (idx2 >= 0) selectedCards.splice(idx2, 1);
        else {
          selectedCards.push(hb.cardId);
          // [2026-10-27 用户] 选一张牌 -> 自动补成**最小可用牌型**
          //   「我选择一个9, 默认把8和10一起选中起来」(手上有 8 9 9 10 10 J J Q Q, 桌面 567)
          _uiExpandSelection(hb.cardId);
        }
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
    // [2026-10-24 UI 重做] 供无头测试验证新 UI 契约
    uiHint: uiHint,
    uiHintCandidates: uiHintCandidates,
    uiTurnInfo: function () { return { deadline: uiTurnDeadline, total: uiTurnTotal, now: Date.now() }; },
  // [2026-11-03] AI 等待闹钟(其他玩家行动时点亮, 他出牌/过牌后熄灭) —— 供回归测试断言
  uiAiWait: function () { return { deadline: uiAiWaitDeadline, total: uiAiWaitTotal, now: Date.now() }; },
    uiLayout: function () { return uiRender.layout(W || 844, H || 390); },
    uiHandLayout: function (n) { return uiRender.handLayout(n, uiRender.layout(W || 844, H || 390)); },
    uiButtonBoxes: function () { return btnStage || []; },
    // [2026-10-26] 测试钩子: 渲染一帧并返回**所有画出的文本**
    //   目的: 无头验证「不出」等 UI 文案到底有没有被画出来
    __renderTexts: function () {
      var texts = [];
      var old = ctx;
      ctx = {
        canvas: { width: W || 844, height: H || 390 },
        measureText: function (t) { return { width: String(t || '').length * 8 }; },
        fillText: function (t) { texts.push(String(t)); },
        save: function () {}, restore: function () {}, beginPath: function () {},
        closePath: function () {}, moveTo: function () {}, lineTo: function () {}, arcTo: function () {},
        arc: function () {}, fill: function () {}, stroke: function () {},
        fillRect: function () {}, clearRect: function () {}, translate: function () {},
        rotate: function () {}, scale: function () {}, setLineDash: function () {},
        createLinearGradient: function () { return { addColorStop: function () {} }; },
        fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1
      };
      try { draw(); } finally { ctx = old; }
      return texts;
    },
    uiPlays: function () { return uiPlays; },
    // [2026-10-26] 测试钩子: 「不出」标记的 UI 层状态(无头复现用)
    // [2026-10-26] 测试钩子: 调整 AI 动作间隔(无头测试里设 0, 否则一步要等 1 秒)
    __setAiDelay: function (ms) {
    AI_STEP_DELAY = ms;
    uiAiTurnAt = 0;
    uiAiWaitPlan = 0;
  },
    // [2026-11-04] 测试钩子: 强制逐轮发牌的间隔(ms)
    //   背景: 无头默认 DEAL_STEP=0 -> 22 轮**同步**跑完, 异步发牌路径平时测不到;
    //         而用户报障的 #3/#4 只在**异步**路径上出现。
    __setDealStep: function (ms) { DEAL_STEP = ms; },
    // [2026-11-04] 发牌节奏常量 -> 给回归测试锁定(用户裁定: 每轮 0.3 秒)
    __dealStepMs: function () { return DEAL_STEP_MS; },
    // [2026-11-04] 渲染层实际用的记牌器展开状态(发牌阶段强制收起) -> 给测试读
    uiMemoOpenNow: _uiMemoOpenNow,
  // [2026-11-04] AI 本回合的随机等待时长观测钩子
  uiAiWaitPlan: function () { return uiAiWaitPlan; },
  // [2026-11-04] AI 等待时长的纯函数(基准 + ±20% 抖动), 供测试直接验证
  __aiWaitMs: _aiWaitMs,
  // [2026-11-03] 提示文字观测钩子(点按钮要立刻清掉它)
  uiToastNow: function () { return uiToast; },
    // [2026-11-02] 测试钩子: AI 停顿的判定是纯函数, 暴露出来直接验证各环境取值
    __computeAiDelay: _computeAiDelay,
    __aiDelay: function () { return AI_STEP_DELAY; },
    uiPassed: function () { return uiPassed; },
    uiMemoOpen: function () { return uiMemoOpen; },   // [2026-10-27] 记牌器默认展开 -> 给测试读
    uiAutoPlay: function () { return uiAutoPlay; },
    toggleAutoPlay: _uiToggleAutoPlay,
    uiTrickId: function () { return uiTrickId; },
    uiPlaysTrick: function () { return uiPlaysTrick; },
    uiMemoItems: function () { return _uiMemo().items; },
    uiIsMainAce: _uiIsMainAce,
    uiMainAceMarks: _uiMainAceMarks,
    uiMarks: function () { return uiMarks; },
    uiMarkCycle: uiMarkCycle,
    uiTestMode: _uiTestMode,
    uiScores: function () { return _uiScores(); },
    uiLayoutSnapshot: function () { return uiRender.layout(W || 844, H || 390); },
    selectedCards: function () { return selectedCards; },
    handCardHitboxes: function () { return handCardHitboxes; },
    setHumanPlayer: function (p) { humanPlayer = p; },
    // [测试注入] 直接设置当前**闸门决策**(亮A/反A/身份), 用于精确复现指定场景。
    //   背景: 自然流程里闸门在**发牌后**随机决定(真人手里的 A 是随机的),
    //   测试没法稳定造出「手里有两种花色的 A」-> 亮A 的花色按钮就没法固化。
    __setGateChoice: function (obj) { _uiSetGateChoice(obj); },   // [2026-10-27] 和生产流程同一条路(会启动倒计时)
    uiLiangDeadline: function () { return uiLiangDeadline; },   // 亮A 倒计时截止时间
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
      // [2026-10-26] 只有**显式**要求才清日志(原来默认每次都清 -> 用户看到日志一直被清空)
      if (o.clearLog === true) logHistory = [];
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
gateAutoAdvance: gateAutoAdvance,
    humanLiangA: humanLiangA,
    humanFanA: humanFanA,
    humanChooseIdentity: humanChooseIdentity,
    getHumanPlayer: function () { return humanPlayer; },
defaultHuman: function () { return humanPlayer; },
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
var moved = gateAutoAdvance();
steps.push('advance:' + (moved ? 'ok' : 'wait'));
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
    uiButtonModel: function () { return uiButtons(); },
    settlementData: _settlementData,
    // ===== UI 日志 (需求十一) =====
    uiLogVisible: function () { return uiLogVisible; },
    toggleUiLog: function () { uiLogVisible = !uiLogVisible; if (ctx) draw(); return uiLogVisible; },
    btnLog: function () { return btnLog; }
  };

}