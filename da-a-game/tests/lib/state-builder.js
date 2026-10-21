// tests/lib/state-builder.js — 确定性局面构造器 (测试与诊断共用)
// 抽成共享模块的原因: 曾因测试与诊断脚本各写一份构造器、补丁只落到其中一份,
//   导致诊断结论反复失真。单一实现消除此类分歧。
var { createNormalCard } = require('../../src/card.js');

var seq = 0;
function C(s, r) { return createNormalCard(s, r, 'sb' + (++seq)); }

// §2.2: 前三家 22 张, 后两家 21 张 (底牌已翻开并入)
var TARGET = { A: 22, B: 22, C: 22, D: 21, E: 21 };

// 选项:
//   handMap       { playerId: [牌数组] }  指定该玩家的关键牌, 其余自动填充
//   emptyPlayers  [playerId]              已出完, 手牌 0 张 (填充时跳过)
//   table         [牌数组]                桌面
//   phase/mode/主A/反A/次方/次方公开/主方/抓方/推风触发者/lastPlayer/
//   passedPlayers/底牌公开
// 保证: 手牌 + 桌面 + 弃牌堆 === 108
function build(o) {
  o = o || {};
  var table = (o.table || []).slice();
  var empty = o.emptyPlayers || [];
  var handMap = o.handMap || {};

  var players = ['A', 'B', 'C', 'D', 'E'].map(function (pid) {
    if (empty.indexOf(pid) >= 0) return { id: pid, hand: [], 底牌: null };
    return { id: pid, hand: (handMap[pid] || []).slice(), 底牌: null };
  });

  var need = 108 - table.length - players.reduce(function (a, p) { return a + p.hand.length; }, 0);

  players.forEach(function (p) {
    if (empty.indexOf(p.id) >= 0) return;          // 已出完的玩家不填充 (易漏, 务必保留)
    var add = Math.max(0, Math.min(TARGET[p.id] - p.hand.length, need));
    // 填充牌点数限 5..13 (不含 A/王/4), 避免干扰被测场景
    for (var i = 0; i < add; i++) p.hand.push(C(['H', 'D', 'C', 'S'][i % 4], 5 + (i % 9)));
    need -= add;
  });

  // 剩余额度计入弃牌堆 (模拟已出完玩家丢弃的牌)
  var discarded = [];
  for (var j = 0; j < need; j++) discarded.push(C(['H', 'D', 'C', 'S'][j % 4], 5 + (j % 9)));

  return {
    phase: o.phase || 'PLAY',
    mode: o.mode || '2V3_暗打',
    主A: o.主A || { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
    反A: o.反A || null,
    次方: o.次方 !== undefined ? o.次方 : 'C',
    次方公开: !!o.次方公开,
    主方: o.主方 || ['B', 'C'],
    抓方: o.抓方 || ['A', 'D', 'E'],
    底牌公开: o.底牌公开 !== undefined ? o.底牌公开 : true,
    头名: null,
    推风触发者: o.推风触发者 || null,
    table: table,
    discarded: discarded,
    passedPlayers: (o.passedPlayers || []).slice(),
    passCount: (o.passedPlayers || []).length,
    lastPlayer: o.lastPlayer || 'B',
    actions: [],
    players: players
  };
}

function countAll(s) {
  var t = 0;
  s.players.forEach(function (p) { t += (p.hand ? p.hand.length : 0) + (p.底牌 ? 1 : 0); });
  return t + (s.table || []).length + (s.discarded || []).length;
}

// 生成两张**同花色**的 A (反A 用)
function twoAces(suit) {
  return [C(suit, 14), C(suit, 14)];
}

module.exports = { build: build, countAll: countAll, C: C, twoAces: twoAces, TARGET: TARGET };