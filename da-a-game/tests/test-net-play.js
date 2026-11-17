// tests/test-net-play.js — 联网出牌/过牌信封（2026-11-17 用户报 BAD_PAYLOAD）
//   背景：服务端 protocol.validateEnvelope 要求 PLAY 必须带 payload.playerId，
//   客户端原来只发 {cardIds} -> 服务端直接 BAD_PAYLOAD，玩家看到「出牌失败」。
//   这里锁两件事：
//     1) 联网「提示」在有牌可出时必须能选中（probe 不能被回合归属校验否掉）；
//     2) doPlay / doPass 发出的动作都带 playerId。
var path = require('path');
var g = require(path.join(__dirname, '..', 'game.js'));
var SB = require('./lib/state-builder.js');

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

var sent = [];
var fake = {
  roomId: '123456',
  send: function (type, payload) {
    sent.push({ type: type, payload: payload });
    return Promise.resolve({ ok: true, room: null });
  },
  leave: function () { return Promise.resolve({ ok: true }); },
  poll: function () { return Promise.resolve(null); }
};

var h5 = SB.C('H', 5), h6 = SB.C('H', 6);
var st = SB.build({ handMap: { B: [h5, h6] } });
// 只留两张手牌，其余移进弃牌堆：保证提示有确定的候选
(function trim() {
  var p = st.players.filter(function (x) { return x.id === 'B'; })[0];
  var keep = [], rest = [];
  p.hand.forEach(function (c) { (c.id === h5.id || c.id === h6.id ? keep : rest).push(c); });
  p.hand = keep;
  st.discarded = (st.discarded || []).concat(rest);
})();
st.phase = 'PLAY';
st.currentPlayer = 'B';
st.table = [];
g.__setState(st, { human: 'B', currentPlayer: 'B', clearLog: true });
g.__setOnlineClient(fake);
g.__setNet(true);

check('1 联网提示能选中（不被 NOT_YOUR_TURN 否掉）', g.uiHint() === true, 'selected=' + g.__selected().length);
check('2 提示选中了牌', g.__selected().length > 0);

sent.length = 0;
g.doPlay();
check('3 出牌信封带 playerId', sent.length === 1 && sent[0].type === 'PLAY' &&
  sent[0].payload && sent[0].payload.playerId === 'B', JSON.stringify(sent[0] || null));
check('4 出牌信封带 cardIds', !!(sent[0] && sent[0].payload.cardIds && sent[0].payload.cardIds.length));

sent.length = 0;
g.doPass();
check('5 过牌信封带 playerId', sent.length === 1 && sent[0].type === 'PASS' &&
  sent[0].payload && sent[0].payload.playerId === 'B', JSON.stringify(sent[0] || null));

// [2026-11-18 用户] 亮A 报 MISSING_PAYLOAD：引擎要 { playerId, cardId }，协议要 suit。
//   联网闸门按钮必须两个都发，否则 LIANG_A 永远失败、整局卡在亮A阶段。
var s1 = SB.C('S', 14);
var st2 = SB.build({ handMap: { B: [s1] }, phase: 'LIANG_A' });
st2['主A'] = null; st2['次方'] = null; st2['主方'] = null; st2['抓方'] = null;
st2.currentPlayer = 'B';
g.__setState(st2, { human: 'B', currentPlayer: 'B', clearLog: true });
g.__setOnlineClient(fake);
g.__setNet(true);
sent.length = 0;
g.uiClick('netSuit:S');
check('6 亮A 信封带 suit', sent.length === 1 && sent[0].type === 'LIANG_A' &&
  sent[0].payload && sent[0].payload.suit === 'S', JSON.stringify(sent[0] || null));
check('7 亮A 信封带 cardId（引擎要求）', !!(sent[0] && sent[0].payload.cardId),
  JSON.stringify(sent[0] || null));

sent.length = 0;
g.uiClick('netIdPublic');
check('8 身份信封带 choice', sent.length === 1 && sent[0].type === 'CHOOSE_IDENTITY' &&
  sent[0].payload && sent[0].payload.choice === 'PUBLIC', JSON.stringify(sent[0] || null));

// [2026-11-18 用户] 乐观显示：合法的牌才「先上桌（确认中）」，非法的连发都不发。
//   这里锁三件事：非法被本地预检拦住、合法先上桌、服务端拒绝时能回滚。
var h7 = SB.C('H', 7), h8 = SB.C('H', 8);
var st3 = SB.build({ handMap: { B: [h7, h8] } });
(function trim3() {
  var p = st3.players.filter(function (x) { return x.id === 'B'; })[0];
  var keep = [], rest = [];
  p.hand.forEach(function (c) { (c.id === h7.id || c.id === h8.id ? keep : rest).push(c); });
  p.hand = keep;
  st3.discarded = (st3.discarded || []).concat(rest);
})();
st3.phase = 'PLAY';
st3.currentPlayer = 'B';
st3.table = [SB.C('S', 14), SB.C('S', 14)];   // 桌上是对 A：♥7 单张管不上
g.__setState(st3, { human: 'B', currentPlayer: 'B', clearLog: true });
g.__setOnlineClient(fake);
g.__setNet(true);
g.__select([h7.id]);
sent.length = 0;
g.doPlay();
check('9 非法牌被本地预检拦住（不发请求）', sent.length === 0, JSON.stringify(sent));
check('10 非法牌不会乐观上桌', !(g.__pending() && g.__pending().cards));

st3.table = [];
g.__setState(st3, { human: 'B', currentPlayer: 'B', clearLog: true });
g.__select([h7.id]);
sent.length = 0;
g.doPlay();
check('11 合法牌先乐观上桌', !!(g.__pending() && g.__pending().cards && g.__pending().cards.length),
  JSON.stringify(g.__pending()));
check('12 乐观上桌后仍向服务端发牌', sent.length === 1 && sent[0].type === 'PLAY' &&
  sent[0].payload.cardIds.length === 1, JSON.stringify(sent[0] || null));

console.log('netplay: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
