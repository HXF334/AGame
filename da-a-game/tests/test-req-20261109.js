// tests/test-req-20261109.js —— 2026-11-09 用户反馈一批的回归测试
//   ① 「不出」不再随机丢失(渲染闸门 + 「手牌变少」启发式两处)
//   ② 4取牌: 牌对象不再打「被取走」标记(共享引用会误伤), UI 自己反推
//   ③ 提示: 连点不重复
//   ④ 整手牌就是一种牌型 -> 整手出(连珠蛋)
//   ⑤ 真人和 AI 的「贡字」颜色一致
//   ⑥ 托管动作不清掉「不出」标记
//   ⑦ §6.3 牌力: 弱牌先出(双王 < 真七)
//   ⑧ 起手: 蛋子级整组留到最后, 先出单张
//   ⑨ 出完牌的人被压过 -> 桌面牌清掉, 换成大贡
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
  // [P2 2026-11-12] 镜像从流水派生: 同一轮先出牌、后过牌
  st.plays = [
    { playerId: 'A', kind: 'PLAY', type: 'SINGLE', count: 1, cards: [card.createNormalCard('S', 9, 'p1')] },
    { playerId: 'A', kind: 'PASS', type: 'PASS', count: 0 }
  ];
  g.__setState(st, { human: 'A', currentPlayer: 'A' });
  var texts = g.__renderTexts();
  check('① 同一轮出过牌又过牌 -> 仍然画「不出」', texts.indexOf('不出') >= 0,
    JSON.stringify(texts.slice(0, 25)));
}
{
  var st = mkState([card.createNormalCard('S',5,'h1'), card.createNormalCard('H',5,'h2'), card.createNormalCard('D',6,'h3')], []);
  g.__setState(st, { human: 'A', currentPlayer: 'A' });
  g.draw();                               // 先画一帧 -> 记下当前手牌数
  g.gameState().plays.push({ playerId: 'A', kind: 'PASS', type: 'PASS', count: 0 });   // 他刚过牌
  var me = st.players.filter(function (p) { return p.id === 'A'; })[0];
  me.hand.pop();                          // 托管连走多个动作: 中间没重画, 手牌变少
  g.draw();
  check('① 手牌变少不能误清「不出」标记', g.uiPassed()['A'] === true,
    'uiPassed=' + JSON.stringify(g.uiPassed()));
}

section('② 4取牌: 牌对象不打标记, UI 自己反推');
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
    // [2026-11-09 用户] 牌对象**不再**打标记: 牌对象是共享引用, 原地打标记会流到
    //   UI 的出牌缓存 -> 把没被取的牌也标上(用户报障: 「没被取的牌也透明了」)。
    var marked = t3.filter(function (c) { return c['被取走']; });
    // [2026-11-09 晚] 改回「原牌带标记 + **副本去掉标记**」: 只有真被取走的那手牌显示「取」;
    //   副本(进取牌者手牌)不带标记 -> 取牌者以后打出这手牌不会被误标。
    // [2026-11-09 晚] 牌对象**不再**打标记(共享引用会误伤): 「这手被取走」由 UI 层按引擎状态判定
    check('② 牌对象不再打「被取走」标记(共享引用会误伤)', marked.length === 0, 'marked=' + marked.length);
    var copied = taker.hand.filter(function (c) { return c['取自']; });
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

section('⑥ 托管动作不清掉「不出」标记');
{
  var _fs = require('fs'), _path = require('path');
  var _src = _fs.readFileSync(_path.join(__dirname, '..', 'game.js'), 'utf8');
  check('⑥ enterPlayIfNeeded 只在进入 PLAY 时清「不出」',
    _src.indexOf('if (uiLastPhase !== PHASES.PLAY) {') >= 0 &&
    _src.indexOf('uiPassResetAt = (gameState.plays || []).length;') >= 0, '');
  var st = mkState([card.createNormalCard('S',2,'g1'), card.createNormalCard('H',2,'g2')],
                   [card.createNormalCard('C',9,'tg1'), card.createNormalCard('D',9,'tg2'), card.createNormalCard('S',9,'tg3')]);
  st.players.forEach(function (p) {
    if (p.id !== 'A') p.hand = [card.createNormalCard('C',3,'x' + p.id), card.createNormalCard('D',3,'y' + p.id)];
  });
  g.__setState(st, { human: 'A', currentPlayer: 'A' });
  g.__enterPlay();
  g.gameState().plays.push({ playerId: 'B', kind: 'PASS', type: 'PASS', count: 0 });   // 模拟: 上家过了牌
  g.__setAutoPlay(true);
  g.__autoPlayStep();               // 托管接管: AI 替真人过牌
  g.__setAutoPlay(false);
  var pd6 = g.uiPassed();
  check('⑥ 托管过牌后真人自己显示「不出」', pd6['A'] === true, JSON.stringify(pd6));
  check('⑥ 托管动作不清别人的「不出」标记', pd6['B'] === true, JSON.stringify(pd6));
}

section('⑦ §6.3 牌力: 弱牌先出(双王 < 真七)');
{
  var jokers = [card.createBigJoker('j1'), card.createSmallJoker('j2')];
  var nines = [];
  for (var i = 0; i < 7; i++) nines.push(card.createNormalCard('S', 9, 'n' + i));
  var tbl = [card.createNormalCard('H',5,'tt1'), card.createNormalCard('D',5,'tt2'), card.createNormalCard('C',5,'tt3')];
  var st = mkState(jokers.concat(nines), tbl);
  g.__setState(st, { human: 'A', currentPlayer: 'A' });
  var act = aiMod.chooseAction(st, 'A', { ignoreCamp: true });
  var actType = 'NONE';
  if (act && act.type === 'PLAY' && act.cardIds && act.cardIds.length) {
    var meH = st.players.filter(function (p) { return p.id === 'A'; })[0];
    var cs = act.cardIds.map(function (id) {
      return meH.hand.filter(function (c) { return c.id === id; })[0]; }).filter(Boolean);
    try { actType = handTypes.identifyHand(cs).type; } catch (e) { actType = 'ERR'; }
  }
  check('⑦ 托管按 §6.3 牌力选牌: 弱牌(双王)先于强牌(真七)', actType === 'DOUBLE_JOKER', 'type=' + actType);
  var cands = g.uiHintCandidates();
  check('⑦ 提示第一候选 ≡ 托管那一手(双王)', cands.length > 0 && cands[0].type === 'DOUBLE_JOKER',
    'first=' + (cands.length ? cands[0].type : '(无)'));
}

section('⑧ 起手: 蛋子级整组留到最后, 弱牌先出(单张先出)');
{
  var hand = [card.createNormalCard('S',5,'h8'), card.createNormalCard('H',5,'h9'),
              card.createNormalCard('D',5,'h10'), card.createNormalCard('C',5,'h11'),
              card.createNormalCard('S',7,'h12')];
  var st = mkState(hand, []);
  g.__setState(st, { human: 'A', currentPlayer: 'A' });
  var act = aiMod.chooseAction(st, 'A', {});
  check('⑧ 起手: 先出单张(不整组出蛋子级)', !!(act && act.type === 'PLAY' && act.cardIds.length === 1),
    'n=' + (act && act.cardIds ? act.cardIds.length : 0));
}

section('⑨ 出完牌的人: 轮到他时才清桌面牌, 换成大贡');
{
  var st = mkState([card.createNormalCard('S',5,'i1')], [card.createNormalCard('C',3,'i2')]);
  var d = st.players.filter(function (p) { return p.id === 'D'; })[0];
  d.hand = [];                         // 丁已出完
  st['出完顺序'] = ['D'];
  g.__setState(st, { human: 'A', currentPlayer: 'C' });
  // [P2 2026-11-12] 镜像从流水派生: 丁最后出的一手牌记进 plays
  g.gameState().plays = [{ playerId: 'D', kind: 'PLAY', type: 'SINGLE', count: 1,
                            cards: [card.createNormalCard('S',3,'i3')] }];
  st.lastPlayer = 'D';                 // 他刚出完, 还是当前墩的出牌人
  g.draw();
  check('⑨ 出完牌的人: 他最后那手牌先留在桌上', !!(g.uiPlays()['D'] && g.uiPlays()['D'].length),
    JSON.stringify(Object.keys(g.uiPlays())));
  st.lastPlayer = 'B';                 // 被别人压过
  g.draw();
  check('⑨ 别人压过他 -> 桌面牌还留着(等轮到他才清)', !!(g.uiPlays()['D'] && g.uiPlays()['D'].length),
    JSON.stringify(Object.keys(g.uiPlays())));
  g.advanceCurrentPlayer();            // 轮转到丁(他出完牌, 被跳过)
  check('⑨ 轮到他 -> 桌面牌清掉', !g.uiPlays()['D'], JSON.stringify(Object.keys(g.uiPlays())));
  check('⑨ 清掉后显示大贡字', g.__renderTexts().indexOf('大贡') >= 0, JSON.stringify(g.__renderTexts().slice(0, 20)));
}

section('⑩ 同一轮多个人都出完牌');
{
  var st = mkState([card.createNormalCard('S',5,'m1')], [card.createNormalCard('C',3,'m2')]);
  var d = st.players.filter(function (p) { return p.id === 'D'; })[0];
  var e = st.players.filter(function (p) { return p.id === 'E'; })[0];
  d.hand = []; e.hand = [];            // 丁、戊都出完了
  st['出完顺序'] = ['D','E'];
  g.__setState(st, { human: 'A', currentPlayer: 'C' });
  g.gameState().plays = [
    { playerId: 'D', kind: 'PLAY', type: 'SINGLE', count: 1, cards: [card.createNormalCard('S',3,'m3')] },
    { playerId: 'E', kind: 'PLAY', type: 'SINGLE', count: 1, cards: [card.createNormalCard('H',4,'m4')] }
  ];
  g.draw();
  check('⑩ 两人出完: 桌面牌都先留着', !!(g.uiPlays()['D'] && g.uiPlays()['D'].length) && !!(g.uiPlays()['E'] && g.uiPlays()['E'].length),
    JSON.stringify(Object.keys(g.uiPlays())));
  g.advanceCurrentPlayer();            // 轮转: 丁(跳过) -> 戊(跳过) -> 甲
  check('⑩ 轮过之后两人的桌面牌都清掉', !g.uiPlays()['D'] && !g.uiPlays()['E'],
    JSON.stringify(Object.keys(g.uiPlays())));
  var t10 = g.__renderTexts();
  check('⑩ 大贡/二贡 都显示(按出完顺序)', t10.indexOf('大贡') >= 0 && t10.indexOf('二贡') >= 0,
    JSON.stringify(t10.slice(0, 24)));
}

section('⑪ 结算画面: 大贡/二贡标签要画出来');
{
  var _fs2 = require('fs'), _path2 = require('path');
  var _ur = _fs2.readFileSync(_path2.join(__dirname, '..', 'ui-render.js'), 'utf8');
  // [2026-11-09 用户] 「结算画面没有几贡标志了」-> 上一批把画标签那行替换成了注释(标签根本不画)
  check('⑪ 结算画面确实画出了贡字(不是被注释掉的那行)',
    _ur.indexOf('text(ctx, _gl2, px + pw - 72, y,') >= 0, '');
}

section('⑫ 抓方不能手改主A的敌友标记');
{
  var camp = require('../src/camp.js');
  var stC = { mode: '2V3_暗打', '主A': { suit: 'H', establishedBy: 'B' }, '次方': null,
              '次方公开': false, '主方': ['B','D'], '抓方': ['A','C','E'] };
  check('⑫ 抓方对主A关系确定 -> 不能手改', camp.canManualMark(stC, 'A', 'B') === false, '');
  check('⑫ 抓方之间(谁可能是次方)仍可手改', camp.canManualMark(stC, 'A', 'C') === true, '');
  var stOpen = { mode: '2V3_明打', '主A': { suit: 'H', establishedBy: 'B' }, '次方': 'D',
                 '次方公开': true, '主方': ['B','D'], '抓方': ['A','C','E'] };
  check('⑫ 次方亮明 -> 所有人不能手改', camp.canManualMark(stOpen, 'A', 'C') === false, '');
}

console.log('');
section('⑫ 出牌流水(plays)不能被过牌清空(推定次方/抓方的依据)');
{
  var engine = require('../src/index.js');
  var st = { phase: 'PLAY', mode: '2V3_暗打', players: [
      { id: 'A', hand: [{ id: 'c1', rank: 5, suit: 'S' }] },
      { id: 'B', hand: [{ id: 'c2', rank: 6, suit: 'H' }] }
    ],
    table: [{ id: 't1', rank: 9, suit: 'D' }], lastPlayer: 'A', passedPlayers: [], passCount: 0,
    plays: [{ playerId: 'A', type: 'BIG_TRIPLE', count: 4, beat: 'B' }]
  };
  var r = engine.transition(st, { type: 'PASS', payload: { playerId: 'B' } });
  check('⑫ 过牌后出牌流水仍在(推定依据不能丢)',
    !!(r && r.ok && r.state && r.state.plays && r.state.plays.length >= 1 &&
       r.state.plays[0].playerId === 'A' && r.state.plays[0].type === 'BIG_TRIPLE'),
    JSON.stringify(r && r.state && r.state.plays));
}

console.log('test-req-20261109: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
