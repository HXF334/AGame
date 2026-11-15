// src/endgame.js — 残局搜索（D-080）
//
// 只在「所有存活玩家手牌总数 <= ENDGAME_LIMIT」且轮到 AI 出牌时启用。
// 设计约束：
//   1) 不改变规则引擎，只用 transition 推演；
//   2) AI 不读别人手牌：用「未见牌随机分配」抽样出若干世界（determinization）；
//   3) 每个候选动作在每个世界里推演到终局/步数上限，按**阵营胜负**取平均分；
//   4) 队友与对手都由现有 chooseAction 托管（它本身带阵营判断），
//      因此评分天然包含「让队友走完 / 拦住对手」两种考虑。
// 纯逻辑，不依赖 wx.*。

var card = require('./card.js');
var transitionMod = require('./transition.js');
var winLoss = require('./win-loss.js');
var handTypes = require('./hand-types.js');
var combos = require('./combos.js');

var ENDGAME_LIMIT = 10;      // 所有存活玩家手牌总数 <= 10 进入残局
var MAX_STEPS = 40;          // 单次推演最多步数（残局很小，正常 10 步内结束）
var WIN_SCORE = 1000;

function alivePlayers(state) {
  return ((state && state.players) || []).filter(function (p) {
    return p && Array.isArray(p.hand) && p.hand.length > 0;
  });
}

// 所有存活玩家的手牌总数
function totalCards(state) {
  return alivePlayers(state).reduce(function (n, p) { return n + p.hand.length; }, 0);
}

function isEndgame(state, limit) {
  if (!state || state.phase !== 'PLAY') return false;
  var lim = (typeof limit === 'number') ? limit : ENDGAME_LIMIT;
  return totalCards(state) <= lim;
}

// 已经很清楚的牌：自己手牌、桌面、弃牌堆、出牌流水里的 cards、已公开的底牌
function seenIds(state, viewerId) {
  var ids = {};
  var me = (state.players || []).filter(function (p) { return p.id === viewerId; })[0];
  if (me && me.hand) me.hand.forEach(function (c) { ids[c.id] = 1; });
  (state.table || []).forEach(function (c) { ids[c.id] = 1; });
  (state.discarded || []).forEach(function (c) { ids[c.id] = 1; });
  (state.plays || []).forEach(function (r) {
    (r.cards || []).forEach(function (c) { ids[c.id] = 1; });
  });
  if (state.底牌公开 && Array.isArray(state.底牌)) {
    state.底牌.forEach(function (c) { ids[c.id] = 1; });
  }
  return ids;
}

// 未见牌（别人手牌 + 未公开底牌）
function unseenCards(state, viewerId) {
  var seen = seenIds(state, viewerId);
  return card.createDeck().filter(function (c) { return !seen[c.id]; });
}

// 可复现随机数（测试用）
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// 抽样一个「世界」：把未见牌随机分给其他玩家（按他们当前的手牌张数）
function sampleState(state, viewerId, rng) {
  var s = JSON.parse(JSON.stringify(state));
  var pool = shuffle(unseenCards(state, viewerId).slice(), rng);
  var idx = 0;
  s.players.forEach(function (p) {
    var need = 0;
    var orig = (state.players || []).filter(function (x) { return x.id === p.id; })[0];
    if (orig && orig.hand) need = orig.hand.length;
    if (p.id === viewerId) { p.hand = JSON.parse(JSON.stringify(orig.hand)); return; }
    p.hand = pool.slice(idx, idx + need);
    idx += need;
  });
  return s;
}

// 枚举当前玩家的合法动作（出牌候选 + 过牌）
function enumerateActions(state, playerId) {
  var me = (state.players || []).filter(function (p) { return p.id === playerId; })[0];
  if (!me || !me.hand || !me.hand.length) return [];
  var table = state.table || [];
  var currentHand = table.length ? handTypes.identifyHand(table) : null;
  var raw = combos.candidateCombos(me.hand).slice();
  me.hand.forEach(function (c) { raw.push([c.id]); });
  var seen = {};
  var out = [];
  raw.forEach(function (ids) {
    if (!ids || !ids.length) return;
    var key = ids.slice().sort().join('|');
    if (seen[key]) return;
    seen[key] = 1;
    var cards = me.hand.filter(function (c) { return ids.indexOf(c.id) >= 0; });
    if (cards.length !== ids.length) return;
    var h = handTypes.identifyHand(cards);
    if (!h || h.type === 'INVALID') return;
    if (currentHand && !handTypes.canBeat(h, currentHand)) return;
    out.push({ type: 'PLAY', playerId: playerId, cardIds: ids.slice() });
  });
  if (table.length) out.push({ type: 'PASS', playerId: playerId });
  // 控制规模：优先保留张数多的（更可能一次走完）
  out.sort(function (a, b) {
    var an = a.cardIds ? a.cardIds.length : 0;
    var bn = b.cardIds ? b.cardIds.length : 0;
    return bn - an;
  });
  return out.slice(0, 40);
}

function applyAction(state, action, chooseAction) {
  var payload = { playerId: action.playerId };
  if (action.type === 'PLAY') payload.cardIds = action.cardIds;
  var r = transitionMod.transition(state, { type: action.type, payload: payload });
  if (!r || !r.ok) return null;
  return r.state;
}

// 从某个状态开始，用现有 AI 把所有人托管到终局/步数上限
function rollout(state, viewerId, chooseAction, maxSteps) {
  var s = state;
  var steps = 0;
  while (steps < (maxSteps || MAX_STEPS)) {
    if (!s || s.phase !== 'PLAY') break;
    var end = winLoss.checkGameEnd(s);
    if (end && end.ended) return { state: s, end: end };
    var actor = s.currentPlayer;
    if (!actor) break;
    var p = (s.players || []).filter(function (x) { return x.id === actor; })[0];
    if (!p || !p.hand || !p.hand.length) break;
    var act = chooseAction(s, actor, { noEndgame: true });
    var ns = applyAction(s, act, chooseAction);
    if (!ns) break;
    s = ns;
    steps++;
  }
  return { state: s, end: winLoss.checkGameEnd(s) };
}

function teamOf(state, playerId) {
  return winLoss.getCamp(state, playerId);
}

function teamRemaining(state, campName) {
  var n = 0;
  (state.players || []).forEach(function (p) {
    if (winLoss.getCamp(state, p.id) === campName) n += (p.hand ? p.hand.length : 0);
  });
  return n;
}

// 评分：终局看阵营胜负；未终局看双方剩牌差 + 是否我方领出
function evaluate(state, viewerId, end) {
  var myCamp = teamOf(state, viewerId);
  if (!myCamp) return 0;
  if (end && end.ended) {
    if (end.winner === myCamp) return WIN_SCORE;
    if (end.winner === 'draw') return 0;
    return -WIN_SCORE;
  }
  var foe = myCamp === '主方' ? '抓方' : '主方';
  var mine = teamRemaining(state, myCamp);
  var theirs = teamRemaining(state, foe);
  var score = (theirs - mine) * 10;
  var cur = state.currentPlayer;
  if (cur && teamOf(state, cur) === myCamp) score += 3;
  return score;
}

// 主入口：返回 { action, score, samples } 或 null
function search(state, playerId, opts) {
  opts = opts || {};
  if (!state || state.phase !== 'PLAY') return null;
  if (state.currentPlayer && state.currentPlayer !== playerId) return null;
  var chooseAction = opts.chooseAction;
  if (typeof chooseAction !== 'function') return null;
  var actions = enumerateActions(state, playerId);
  if (!actions.length) return null;
  var samples = opts.samples || 6;
  var rng = opts.rng || mulberry32(opts.seed || 20261115);
  var best = null;
  actions.forEach(function (action) {
    var sum = 0, n = 0;
    for (var i = 0; i < samples; i++) {
      var world = sampleState(state, playerId, rng);
      var after = applyAction(world, action, chooseAction);
      if (!after) continue;
      var r = rollout(after, playerId, chooseAction, opts.maxSteps);
      sum += evaluate(r.state, playerId, r.end);
      n++;
    }
    if (!n) return;
    var avg = sum / n;
    if (!best || avg > best.score) best = { action: action, score: avg, samples: n };
  });
  return best;
}

module.exports = {
  ENDGAME_LIMIT: ENDGAME_LIMIT,
  totalCards: totalCards,
  isEndgame: isEndgame,
  seenIds: seenIds,
  unseenCards: unseenCards,
  sampleState: sampleState,
  enumerateActions: enumerateActions,
  rollout: rollout,
  evaluate: evaluate,
  search: search,
  mulberry32: mulberry32
};
