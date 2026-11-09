// tests/test-req-20261109.js —— 2026-11-09 用户反馈一批的回归测试
//   ① 「不出」不再随机丢失(渲染闸门 + 「手牌变少」启发式两处)
//   ② 4取牌: 桌面被取的牌打「被取走」标记(半透明 + 飞向取牌者手牌)
//   ③ 提示: 连点不重复 + 拆组口径 = 托管
//   ④ 整手牌就是一种牌型 -> 整手出(连珠蛋)
//   ⑤ 真人和 AI 的「贡字」颜色一致
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var SB = require('./lib/state-builder.js');
var card = require('../src/card.js');
var aiMod = require('../src/ai.js');
var capture = require('../src/capture.js');
var handTypes = require('../src/hand-types.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t2) { console.log(''); console.log('=== ' + t2 + ' ==='); }
function mkState(handCards, tableCards) {
  var st = SB.build({ handMap: { A: handCards }, table: tableCards, lastPlayer: 'B',
    '主A': { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    '次方': 'C', '次方公开': false, '主方': ['A','C'], '抓方': ['B','D','E'], mode: '2V3_暗打' });
  var me = st.players.filter(function (p) { return p.id === 'A'; })[0];
  st.discarded = st.discarded.concat(me.hand.slice(handCards.length));
  me.hand = handCards;
  st.phase = 'PLAY';
  return st;
}
function idsOf(a) { return a.slice().sort().join(','); }

section('① 「不出」不再随机丢失');
{
  var st = mkState([card.createNormalCard('S',5,'h1'), card.createNormalCard('H',5,'h2')], []);
  g.__setState(st, { human: 'A', currentPlayer: 'A' });
  var ui = g.__uiState();
  ui.uiPassed['A'] = true;               // 他过了牌
  ui.uiPlaysTrick['A'] = ui.uiTrickId;   // 同一轮(uiTrickId 相同)里他**出过牌**
  var texts = g.__renderTexts();
  check('① 同一轮出过牌又过牌 -> 仍然画「不出」', texts.indexOf('不出') >= 0,
    JSON.stringify(texts.slice(0, 25)));
}
{
  var st = mkState([card.createNormalCard('S',5,'h1'), card.createNormalCard('H',5,'h2'), card.createNormalCard('D',6,'h3')], []);
  g.__setState(st, { human: 'A', currentPlayer: 'A' });
  g.draw();                               // 先画一帧 -> 记下当前手牌数
  g.uiPassed()['A'] = true;               // 他刚过牌
  var me = st.players.filter(function (p) { return p.id === 'A'; })[0];
  me.hand.pop();                          // 托管连走多个动作: 中间没重画, 手牌变少
  g.draw();
  check('① 手牌变少不能误清「不出」标记', g.uiPassed()['A'] === true,
    'uiPassed=' + JSON.stringify(g.uiPassed()));
}

section('② 4取牌: 桌面被取的牌打「被取走」标记');
{
  var t3 = [card.createNormalCard('S',5,'t1'), card.createNormalCard('H',5,'t2'), card.createNormalCard('D',5,'t3')];
  var fours = [card.createNormalCard('S',4,'f1'), card.createNormalCard('H',4,'f2')];
  var st = mkState(fours.slice(), t3);
  var r = capture.executeCapture(st, 'A', fours);
  check('② 取牌成功', !!(r && r.ok === true), JSON.stringify(r && r.error));
  if (r && r.ok) {
    var taker = r.state.players.filter(function (p) { return p.id === 'A'; })[0];
    var copies = taker.hand.filter(function (c) { return c['取自']; });
    check('② 被取的牌进手牌副本带「取自」标记', copies.length === 3, 'copies=' + copies.length);
    var taken = t3.filter(function (c) { return c['被取走']; });
    check('② 桌面原牌带「被取走」标记(半透明/飞行动画用)', taken.length === 3, 'taken=' + taken.length);
  }
}

section('③ 提示: 连点逐个轮换不重复');
{
  var hand = [card.createNormalCard('S',4,'x1'), card.createNormalCard('H',5,'x2'), card.createNormalCard('D',5,'x3'),
              card.createNormalCard('C',6,'x4'), card.createNormalCard('S',6,'x5'),
              card.createNormalCard('H',7,'x6'), card.createNormalCard('D',7,'x7')];
  var st = mkState(hand, []);
  g.__setState(st, { human: 'A', currentPlayer: 'A' });
  var picked = [];
  for (var i = 0; i < 3; i++) {
    g.uiHint();
    picked.push(idsOf(g.selectedCards()));
  }
  var uniq = {};
  picked.forEach(function (p) { uniq[p] = 1; });
  check('③ 连点提示 -> 每次选中的牌不重复', Object.keys(uniq).length === picked.length, JSON.stringify(picked));
}

section('④ 整手牌就是一种牌型 -> 整手出');
{
  var hand = [];
  [10,11,12].forEach(function (rk) {
    ['S','H','D'].forEach(function (su, k) { hand.push(card.createNormalCard(su, rk, 'z' + rk + k)); });
  });
  var st = mkState(hand, []);
  var act = aiMod.chooseAction(st, 'A', {});
  check('④ 整手牌 -> 托管整手出(一次出完)', !!(act && act.type === 'PLAY' && act.cardIds.length === hand.length),
    'act=' + (act ? act.type : 'null') + ' n=' + (act && act.cardIds ? act.cardIds.length : 0));
  check('④ 整手牌本身是连珠蛋', handTypes.identifyHand(hand).type === handTypes.HAND_TYPES.STRAIGHT_TRIPLE,
    'type=' + handTypes.identifyHand(hand).type);
}

section('⑤ 真人和 AI 的贡字颜色一致');
{
  var st = mkState([card.createNormalCard('S',5,'c1')], []);
  st['出完顺序'] = ['A','B'];
  var me = st.players.filter(function (p) { return p.id === 'A'; })[0];
  me.hand = [];
  var other = st.players.filter(function (p) { return p.id === 'B'; })[0];
  other.hand = [];
  g.__setState(st, { human: 'A', currentPlayer: 'A' });
  // 清掉上一段留下的 UI 标记(本轮出过牌/不出), 免得影响贡字判定
  var u5 = g.__uiState();
  Object.keys(u5.uiPlaysTrick).forEach(function (k) { delete u5.uiPlaysTrick[k]; });
  Object.keys(u5.uiPassed).forEach(function (k) { delete u5.uiPassed[k]; });
  var drawn = g.__renderTextStyles();
  var humanGong = drawn.filter(function (d) { return d.text === '大贡'; })[0];
  var aiGong = drawn.filter(function (d) { return d.text === '二贡'; })[0];
  check('⑤ 真人/AI 都画出了贡字', !!humanGong && !!aiGong,
    JSON.stringify(drawn.map(function (d) { return d.text; }).slice(0, 30)));
  if (humanGong && aiGong) {
    check('⑤ 真人贡字颜色 = AI 贡字颜色', humanGong.style === aiGong.style,
      'human=' + humanGong.style + ' ai=' + aiGong.style);
  }
}

console.log('');
console.log('test-req-20261109: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
