// tools/stress-games.js — 随机整局压测（纯 node，无头，不依赖开发者工具）
//
// 用法：
//   node tools/stress-games.js 50
//   node tools/stress-games.js 50 --seed 123456
//
// 做法：随机发牌 + 随机阵营/明暗打（2V3 或 1V4），从 PLAY 阶段起
// 由 chooseAction 驱动到 checkGameEnd，检查：
//   1) 每一步 transition 都成功
//   2) 能自然走到 GAME_END（不会死循环）
//   3) 结算分数零和
//   4) 牌张守恒（hand + 底牌 + table + discarded = 108）
//   5) 出完顺序 / 阵营判定不崩

'use strict';

const { transition, newGameState } = require('../src/transition.js');
const ai = require('../src/ai.js');
const deal = require('../src/deal.js');
const { PHASES } = require('../src/phases.js');
const wl = require('../src/win-loss.js');
const scoring = require('../src/scoring.js');

const SUITS = ['H', 'D', 'C', 'S'];
const MODES = ['2V3_暗打', '2V3_明打', '1V4_暗打', '1V4_明打'];
const MAX_STEPS = 4000;

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function countCards(st) {
  let n = 0;
  (st.players || []).forEach(function (p) {
    n += (p.hand || []).length;
    if (p.底牌) n += 1;
  });
  n += (st.table || []).length;
  n += (st.discarded || []).length;
  return n;
}

function buildState(rng) {
  const d = deal.dealGame();
  const st = newGameState();
  st.players = d.players;
  st.phase = PHASES.PLAY;

  const mode = MODES[Math.floor(rng() * MODES.length)];
  st.mode = mode;

  const suit = SUITS[Math.floor(rng() * SUITS.length)];
  const by = deal.PLAYER_NAMES[Math.floor(rng() * deal.PLAYER_NAMES.length)];
  st.主A = { suit: suit, rank: 14, establishedBy: by, viaMethod: 'LIANG_A' };

  let second = null;
  if (mode.indexOf('2V3') === 0) {
    const others = deal.PLAYER_NAMES.filter(function (x) { return x !== by; });
    second = others[Math.floor(rng() * others.length)];
    st.次方 = second;
    st.次方公开 = (mode === '2V3_明打');
  } else {
    st.次方 = null;
    st.次方公开 = false;
  }

  // 把该花色两张 A 标记为大A（1V4 时两张都在主方手里，2V3 时分开）
  st.players.forEach(function (p) {
    (p.hand || []).forEach(function (c) {
      if (c.suit === suit && c.rank === 14) c['is主方大A'] = true;
    });
  });

  const main = second ? [by, second] : [by];
  st.主方 = main;
  st.抓方 = deal.PLAYER_NAMES.filter(function (x) { return main.indexOf(x) < 0; });
  st.底牌公开 = true;
  st.currentPlayer = main[0];
  return st;
}

function playOne(rng) {
  let st = buildState(rng);
  let steps = 0;

  while (steps < MAX_STEPS) {
    const end = wl.checkGameEnd(st);
    if (end.ended) return { state: st, end: end, steps: steps };

    const pid = st.currentPlayer;
    if (!pid) throw new Error('PLAY 阶段没有 currentPlayer（step ' + steps + '）');

    const act = ai.chooseAction(st, pid);
    let action;
    if (act.type === 'PLAY') {
      action = { type: 'PLAY', payload: { playerId: pid, cardIds: act.cardIds } };
    } else if (act.type === 'PASS') {
      action = { type: 'PASS', payload: { playerId: pid } };
    } else {
      throw new Error('AI 返回未知动作：' + JSON.stringify(act));
    }

    const r = transition(st, action);
    if (!r.ok) {
      throw new Error('transition 失败：' + r.error.type + ' / ' + r.error.message +
        '（step ' + steps + '，player=' + pid + '，table=' + (st.table || []).length + '）');
    }
    st = r.state;
    steps += 1;

    const total = countCards(st);
    if (total !== 108) throw new Error('牌张不守恒：' + total + '（step ' + steps + '）');
  }

  throw new Error('超过 ' + MAX_STEPS + ' 步仍未结束');
}

function main() {
  const argv = process.argv.slice(2);
  let games = parseInt(argv[0], 10);
  if (!isFinite(games) || games <= 0) games = 50;
  let seed = Date.now() % 2147483647;
  const si = argv.indexOf('--seed');
  if (si >= 0 && argv[si + 1]) seed = parseInt(argv[si + 1], 10) >>> 0;

  const rng = makeRng(seed);
  const stats = { games: 0, fail: 0, wins: { 主方: 0, 抓方: 0, draw: 0 }, steps: 0, maxSteps: 0 };
  const failures = [];

  for (let i = 0; i < games; i++) {
    try {
      const r = playOne(rng);
      stats.games += 1;
      stats.steps += r.steps;
      if (r.steps > stats.maxSteps) stats.maxSteps = r.steps;

      const score = scoring.calculateScore(r.state, { winner: r.end.winner }) || {};
      const vals = Object.keys(score).map(function (k) { return score[k]; });
      const sum = vals.reduce(function (a, b) { return a + b; }, 0);
      if (vals.length && sum !== 0) throw new Error('结算非零和：' + sum + '（' + JSON.stringify(score) + '）');

      const w = r.end.winner || 'draw';
      if (stats.wins[w] == null) stats.wins[w] = 0;
      stats.wins[w] += 1;
    } catch (e) {
      stats.fail += 1;
      failures.push({ game: i + 1, error: e.message });
      if (failures.length >= 5) break;
    }
  }

  console.log('随机压测：局数 ' + stats.games + '，失败 ' + stats.fail +
    '，种子 ' + seed);
  console.log('结局分布：主方 ' + (stats.wins['主方'] || 0) +
    '，抓方 ' + (stats.wins['抓方'] || 0) +
    '，平局 ' + (stats.wins['draw'] || 0));
  if (stats.games) {
    console.log('平均步数 ' + (stats.steps / stats.games).toFixed(1) + '，最大 ' + stats.maxSteps);
  }
  failures.forEach(function (f) {
    console.log('  FAIL #' + f.game + ' ' + f.error);
  });
  process.exit(stats.fail === 0 ? 0 : 1);
}

main();
