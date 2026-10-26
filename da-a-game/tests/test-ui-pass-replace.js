// tests/test-ui-pass-replace.js —— 「过牌的人显示『不出』, 而不是他之前出的牌」
//
// 复刻用户原话(2026-10-26):
//   「甲出 AAAA, 乙不出, 丙不出, 他们画面上应该显示不出, 而不是之前的 QQQ」
//
// 牌序(SKILL §6.2 单张从大到小: 大A>大王>小王>3>2>A>K>Q>J>10>...>4):
//   丙 先手 222(蛋子) -> 乙 QQQ(蛋子, **2>Q 所以 222 压 QQQ**)
//   -> 甲 AAAA(大蛋子, 4 张; 全局等级 大蛋子>蛋子, 可以跨牌型压)
//   -> 乙/丙 都管不上 AAAA -> 两人 PASS
//   期望: 乙、丙 的位置显示「不出」; 乙 的 QQQ / 丙 的 222 必须消失; 甲 的 AAAA 必须还在
//
// 根因(本测试要守住的行为):
//   _uiPassCleanup 原来只清「非本轮」的出牌显示, 而 uiTrickId 只在**轮末**递增
//   -> 一轮里只要有人一直出牌就永不变 -> 上一手牌永远清不掉
//   -> 渲染层 uiPlaysTrick[pid] === uiTrickId 为真 -> 「不出」被抑制 + 旧牌继续画
//   修法: PASS = 这一轮他不出 -> **无条件清掉他的出牌显示**
//
// 跑法: node tests/test-ui-pass-replace.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var { createNormalCard } = require('../src/card.js');
g.__setAiDelay(0);

function C(suit, rank) { return createNormalCard(suit, rank); }

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function texts() { return g.__renderTexts(); }
function buChuCount(ts) { return ts.filter(function (t) { return t === '不出'; }).length; }
function playBy(pid) { var p = g.uiPlays() || {}; return p[pid] || null; }
function passedIds() { return Object.keys(g.uiPassed() || {}); }

// ===== 布置手牌 =====
// 甲: 4 张 A(大蛋子) + 杂牌;  乙: 3 张 Q(蛋子) + 杂牌;  丙: 3 张 2(蛋子) + 杂牌
// 丁: 真人(主A), 手牌**不含 A**(免得大A 特殊规则干扰);  戊: 杂牌
// 乙/丙 打完各自的蛋子后只剩 2 张杂牌 -> **管不上 AAAA**, 只能 PASS(确定性)
var hands = [
  [C('H', 14), C('D', 14), C('S', 14), C('C', 14), C('S', 3), C('H', 5)],   // A 甲
  [C('H', 12), C('D', 12), C('S', 12), C('C', 3), C('H', 6)],              // B 乙
  [C('H', 2), C('D', 2), C('S', 2), C('C', 5), C('H', 7)],                // C 丙
  [C('S', 8), C('D', 9), C('H', 10)],                                     // D 丁(真人, 主A)
  [C('S', 11), C('C', 13), C('D', 5)]                                     // E 戊
];
var ids = ['A', 'B', 'C', 'D', 'E'];

// 用 require 时自动初始化的那局当底(不 newGame —— 免得开局流程的定时器搅局)
var st = g.gameState();
st.phase = 'PLAY';
st.players.forEach(function (p, i) { p.id = ids[i]; p.hand = hands[i]; });
// 主A = 丁, 花色 D —— 丁手里没有 A, 所以场上任何 A 都不是「大A」, 不触发大A 特殊规则
st['主A'] = { suit: 'D', establishedBy: 'D', viaMethod: 'LIANG_A' };
st['反A'] = null;
st['次方'] = null;
st['次方公开'] = true;
st['底牌公开'] = true;
st.table = [];
st.passedPlayers = [];
st.lastPlayer = null;

// 注: 无头测试里 AI_STEP_DELAY=0 -> AI 会**同步**抢跑(游戏.js L39 注释)。
//   所以每次出牌后必须轮到「真人」, AI 才会停手。
//   -> 出乙的牌时把真人临时设成丙(下一位), 出完再换回丁。
g.__setState(st, { currentPlayer: 'C', human: 'D', clearLog: true });

function playAs(pid, cards, humanNext) {
  g.__setState(g.gameState(), { currentPlayer: pid, human: humanNext, clearLog: false });
  var sel = g.selectedCards();
  sel.length = 0;
  cards.forEach(function (c) { sel.push(c.id); });
  g.doPlay();
}

// ===== 牌序 =====
// 1) 乙 先手 QQQ
playAs('B', [C('H', 12), C('D', 12), C('S', 12)], 'C');
check('乙 的 QQQ 已出(进 uiPlays)', !!(playBy('B') && playBy('B').length === 3),
  'uiPlays=' + JSON.stringify(Object.keys(g.uiPlays() || {})));

// 2) 丙 222 压 QQQ —— 同型比点数, **2 > Q**(SKILL §6.2)
playAs('C', [C('H', 2), C('D', 2), C('S', 2)], 'D');
check('丙 的 222 压住 QQQ', !!(playBy('C') && playBy('C').length === 3),
  'uiPlays=' + JSON.stringify(Object.keys(g.uiPlays() || {})));

// 3) 甲 AAAA(大蛋子) 压 蛋子 —— 之后轮到乙(AI): 乙丙 都管不上, 会自动 PASS
playAs('A', [C('H', 14), C('D', 14), C('S', 14), C('C', 14)], 'D');
check('甲 的 AAAA 已出(4 张大蛋子)', !!(playBy('A') && playBy('A').length === 4),
  'uiPlays=' + JSON.stringify(Object.keys(g.uiPlays() || {})));
check('乙 已过牌(管不上 AAAA)', passedIds().indexOf('B') >= 0, JSON.stringify(passedIds()));
check('丙 已过牌(管不上 AAAA)', passedIds().indexOf('C') >= 0, JSON.stringify(passedIds()));

// ===== 关键断言: 过牌的人**不能**还挂着旧牌 =====
check('乙 PASS 后: 乙 的 QQQ 显示已清掉', !playBy('B'),
  'uiPlays=' + JSON.stringify(Object.keys(g.uiPlays() || {})));
check('丙 PASS 后: 丙 的 222 显示已清掉', !playBy('C'),
  'uiPlays=' + JSON.stringify(Object.keys(g.uiPlays() || {})));
var tk = g.uiPlaysTrick() || {};
check('乙/丙 的轮次标记也清掉(否则渲染会抑制「不出」)',
  tk.B === undefined && tk.C === undefined, JSON.stringify(tk));
check('甲 没过牌 -> AAAA 仍然显示在桌面', !!(playBy('A') && playBy('A').length),
  'uiPlays=' + JSON.stringify(Object.keys(g.uiPlays() || {})));

// ===== 渲染级: 画面上必须有「不出」, 而且不能有乙的 Q =====
var ts = texts();
var nBuChu = buChuCount(ts);
check('渲染画面里有 2 个「不出」(乙、丙)', nBuChu >= 2,
  'count=' + nBuChu + ' ' + JSON.stringify(ts.filter(function (t) { return t === '不出'; })));
// 乙 的 QQQ 已经出了(不在任何人手里), 所以画面里不该再出现 Q
var qHits = ts.filter(function (t) { return String(t).indexOf('Q') >= 0; });
check('渲染画面里不再有 Q(乙的旧牌已消失)', qHits.length === 0, 'hits=' + JSON.stringify(qHits));

// ===== 源码级守卫: 守住「无条件清掉」这个行为 =====
var _fs = require('fs');
var _path = require('path');
var _src = _fs.readFileSync(_path.join(__dirname, '..', 'game.js'), 'utf8');
check('源码: _uiPassCleanup 无条件 delete uiPlays[pid]',
  /function _uiPassCleanup[\s\S]{0,500}delete uiPlays\[pid\]/.test(_src));
check('源码: _uiPassCleanup 里置位 uiPassed[pid]',
  /function _uiPassCleanup[\s\S]{0,400}uiPassed\[pid\] = true/.test(_src));
check('源码: AI 过牌路径(applyAction)也走 _uiPassCleanup',
  /action\.type === ACTIONS\.PASS[\s\S]{0,600}_uiPassCleanup\(currentPlayer\)/.test(_src));

console.log('test-ui-pass-replace: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
