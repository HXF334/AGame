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

console.log('netplay: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
