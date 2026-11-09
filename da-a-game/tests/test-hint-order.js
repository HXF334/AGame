// tests/test-hint-order.js —— 提示的候选/顺序 ≡ 托管(同一套逻辑, 只不考虑阵营)(用户 2026-11-08 22:40)
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var SB = require('./lib/state-builder.js');
var card = require('../src/card.js');
var aiMod = require('../src/ai.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log(''); console.log('=== ' + t + ' ==='); }

function mkState(handCards, tableCards) {
  var st = SB.build({ handMap: { A: handCards }, table: tableCards, lastPlayer: 'B',
    '主A': { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    '次方': 'C', '次方公开': false, '主方': ['A','C'], '抓方': ['B','D','E'], mode: '2V3_暗打' });
  var me = st.players.filter(function (p) { return p.id === 'A'; })[0];
  st.discarded = st.discarded.concat(me.hand.slice(handCards.length));
  me.hand = handCards;
  return st;
}
function idsOf(a) { return a.slice().sort().join(','); }
// [2026-11-08 23:59 用户] 「提示和AI托管完全不一样」-> 提示第一手 = **托管那一手**:
//   托管用的是 chooseAction(state, playerId)(带阵营/拆组口径), 提示用**同一个调用**取第一手。
function hintVsAi(name, handCards, tableCards) {
  var st = mkState(handCards, tableCards);
  g.__setState(st, { human: 'A', currentPlayer: 'A' });
  var aiAct = aiMod.chooseAction(st, 'A', {});
  var cands = g.uiHintCandidates();
  var aiIds = (aiAct && aiAct.type === 'PLAY') ? idsOf(aiAct.cardIds) : '(PASS)';
  var hintIds = cands.length ? idsOf(cands[0].ids) : '(无候选)';
  // 托管要出牌时, 提示第一手必须一模一样; 托管过牌时提示仍要给**合法**候选
  if (aiIds === '(PASS)') {
    check(name + ': 托管过牌时提示仍有合法候选', cands.length > 0, '提示=' + hintIds);
  } else {
    check(name + ': 提示第一个候选 = 托管会出的那一手', aiIds === hintIds, 'AI=' + aiIds + ' 提示=' + hintIds);
  }
  return cands;
}

section('1. 提示的候选顺序跟托管一致(不考虑阵营)');
{
  hintVsAi('1.1 对10 vs JJ22',
    [card.createNormalCard('S',11,'h1'), card.createNormalCard('H',11,'h2'),
     card.createNormalCard('D',2,'h3'), card.createNormalCard('C',2,'h4')],
    [card.createNormalCard('S',10,'t1'), card.createNormalCard('H',10,'t2')]);
  hintVsAi('1.2 K vs 22+大A',
    [card.createNormalCard('S',2,'h5'), card.createNormalCard('H',2,'h6'),
     card.createNormalCard('D',14,'h7'), card.createNormalCard('C',14,'h8')],
    [card.createNormalCard('S',13,'t3')]);
  hintVsAi('1.3 33 vs 9999',
    [card.createNormalCard('S',9,'h9'), card.createNormalCard('H',9,'h10'),
     card.createNormalCard('D',9,'h11'), card.createNormalCard('C',9,'h12')],
    [card.createNormalCard('S',3,'t4'), card.createNormalCard('H',3,'t5'), card.createNormalCard('D',3,'t6')]);
}

// [2026-11-09 用户] 「点提示时的拆组应该是组合牌型(龙/双龙/连珠蛋/假八等)才会拆组,
//   同点数牌型(对子/蛋子+等)不应该拆组。托管不是这样的吗?」
//   -> 提示与托管**同口径**: 提示候选全部复用 ai.splitsRejected 判定。
section('2. 拆组: 提示与托管同口径(不拆同点组)');
{
  var st = mkState([card.createNormalCard('S',6,'h13'), card.createNormalCard('H',6,'h14'),
    card.createNormalCard('D',7,'h15'), card.createNormalCard('C',8,'h16'), card.createNormalCard('S',8,'h17')],
    [card.createNormalCard('S',5,'t7'), card.createNormalCard('H',6,'t8'), card.createNormalCard('D',7,'t9')]);
  g.__setState(st, { human: 'A', currentPlayer: 'A' });
  var me2 = st.players.filter(function (p) { return p.id === 'A'; })[0];
  var aiAct2 = aiMod.chooseAction(st, 'A', {});
  var cands2 = g.uiHintCandidates();
  var aiCards2 = (aiAct2 && aiAct2.cardIds) ? aiAct2.cardIds.map(function (id) {
    return me2.hand.filter(function (c) { return c.id === id; })[0]; }).filter(Boolean) : [];
  var aiType2 = 'INVALID';
  try { aiType2 = require('../src/hand-types.js').identifyHand(aiCards2).type; } catch (e) { }
  check('2.1 托管出的那手符合托管拆组口径',
    !aiAct2 || aiAct2.type === 'PASS' || aiMod.splitsRejected(aiCards2, aiType2, me2.hand) === false,
    'AI=' + (aiAct2 ? aiAct2.type : 'null') + ' type=' + aiType2);
  // 关键断言: 提示候选**全部**符合托管的拆组判定(以前会放进拆同点组的连张)
  var badOnes = cands2.filter(function (c) { return aiMod.splitsRejected(c.cards, c.type, me2.hand); });
  check('2.2 提示候选全部符合托管拆组口径(不拆同点组)', badOnes.length === 0,
    '违规=' + JSON.stringify(badOnes.map(function (c) { return c.type; })));
  check('2.3 提示允许拆组的连张(只罚不禁)',
    cands2.some(function (c) { return c.type === 'STRAIGHT'; }),
    'types=' + JSON.stringify(cands2.map(function (c) { return c.type; })));
  check('2.4 提示候选按牌型形状去重(同形状只留一个)',
    (function () {
      var seen = {}, dup = [];
      cands2.forEach(function (c) {
        var k = c.type + '|' + c.cards.map(function (x) { return x.rank; }).sort(function (a, b) { return a - b; }).join(',');
        if (seen[k]) dup.push(k); seen[k] = 1;
      });
      return dup.length === 0;
    })(), JSON.stringify(cands2.map(function (c) { return c.type; })));
}


console.log('');
console.log('test-hint-order: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
process.exit(0);
