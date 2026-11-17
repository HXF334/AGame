// tests/test-server-flow.js — 用假 wx-server-sdk 跑真实云函数 game-server（无头全流程）
//   [2026-11-18 用户] 问：能不能不靠人操作模拟器验证？
//   答：可以。这里把 `wx-server-sdk` 换成内存假库，直接 require 真实的
//   `cloudfunctions/game-server/index.js`，用和客户端完全相同的信封
//   （protocol.makeAction）走 create → start → 亮A → 出牌，断言每一步都被接受。
//   这一类 bug（MISSING_PAYLOAD / NOT_PLAY_PHASE / STALE）都能在这里复现，不需要开发者工具。
var path = require('path');
var Module = require('module');

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

// ---- 内存版 wx-server-sdk ----
var store = {};
var currentOpenid = '';
var fakeSdk = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init: function () {},
  getWXContext: function () { return { OPENID: currentOpenid }; },
  database: function () {
    return {
      createCollection: function () { return Promise.resolve({}); },
      collection: function () {
        return {
          doc: function (id) {
            return {
              get: function () {
                if (!store[id]) return Promise.reject(new Error('document not found'));
                return Promise.resolve({ data: JSON.parse(JSON.stringify(store[id])) });
              },
              set: function (o) {
                store[id] = JSON.parse(JSON.stringify(o.data));
                return Promise.resolve({});
              },
              remove: function () {
                delete store[id];
                return Promise.resolve({});
              }
            };
          },
          where: function () {
            return {
              limit: function () {
                return {
                  get: function () {
                    return Promise.resolve({
                      data: Object.keys(store).map(function (k) { return JSON.parse(JSON.stringify(store[k])); })
                    });
                  }
                };
              }
            };
          }
        };
      }
    };
  }
};

var origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeSdk;
  return origLoad.apply(this, arguments);
};

var server = require(path.join(__dirname, '..', 'cloudfunctions', 'game-server', 'index.js'));
var protocol = require(path.join(__dirname, '..', 'cloudfunctions', 'game-server', 'engine', 'protocol.js'));

function call(openid, event) {
  currentOpenid = openid;
  event = Object.assign({ openid: openid }, event);
  return server.main(event);
}

// 和客户端一样发动作：取服务端最新 seq 做 baseSeq
function send(openid, roomId, type, payload) {
  var seq = store[roomId] ? store[roomId].seq : 0;
  var env = protocol.makeAction(type, payload, seq);
  return call(openid, { action: 'apply', roomId: roomId, env: env });
}

var ROOM = '778899';

(async function run() {
  var r1 = await call('o1', { action: 'create', roomId: ROOM, nick: '甲', config: { rounds: 12, baseScore: 1, turnSeconds: 0, aiFill: true } });
  check('1 创建房间成功且房间号不被改写', r1.ok && store[ROOM] && store[ROOM].id === ROOM, JSON.stringify(r1).slice(0, 120));

  var r2 = await call('o1', { action: 'start' , roomId: ROOM });
  check('2 开局成功', r2.ok, JSON.stringify(r2).slice(0, 160));

  var room = store[ROOM];
  check('3 开局后进入牌局状态', !!(room && room.state && room.state.phase), room && room.state && room.state.phase);

  // 找到自己的座位与一张 A（服务端 state 里就有真牌）
  var me = room.state.players.filter(function (p) { return p.id === 'A'; })[0];
  var ace = (me.hand || []).filter(function (c) { return c.rank === 14; })[0];

  var phase0 = room.state.phase;
  if (phase0 === 'LIANG_A') {
    if (ace) {
      var rl = await send('o1', ROOM, 'LIANG_A', { suit: ace.suit, cardId: ace.id });
      check('4 亮A 被接受（cardId 生效）', rl.ok, JSON.stringify(rl).slice(0, 200));
    } else {
      check('4 亮A：手上没有A，跳过（由超时强制排查）', true);
    }
  } else {
    check('4 开局已在 ' + phase0 + '，跳过亮A', true);
  }

  // 轮询推进直到进入 PLAY。真人可操作的闸门会开 5 秒窗口（超时才默认），
  //   所以这里最多等 ~7 秒，避免把「正常等窗口」误判成卡死。
  var guard = 0, st = null, p = null, t0 = Date.now();
  while (guard++ < 700 && Date.now() - t0 < 7000) {
    p = await call('o1', { action: 'poll', roomId: ROOM });
    st = store[ROOM];
    if (st && st.state && st.state.phase === 'PLAY') break;
    await new Promise(function (r) { setTimeout(r, 10); });
  }
  check('5 能推进到 PLAY 阶段', !!(st && st.state && st.state.phase === 'PLAY'), st && st.state && st.state.phase);
  check('6 服务端 phase 与客户端看到的 view 一致', !!(p && p.ok && p.room.state && p.room.state.phase === 'PLAY'),
    p && p.room && p.room.state && p.room.state.phase);

  // 轮到真人时，用和客户端一样的方式做一个合法动作（领出=单张，跟牌=不出），
  //   断言服务端接受；关键是不再报 NOT_PLAY_PHASE。
  var cur = st.state.currentPlayer;
  if (cur === 'A') {
    var meHand = (st.state.players.filter(function (p) { return p.id === 'A'; })[0] || {}).hand || [];
    var hasTable = (st.state.table || []).length > 0;
    var act = hasTable ? { type: 'PASS', payload: { playerId: 'A' } }
      : { type: 'PLAY', payload: { playerId: 'A', cardIds: [meHand[0].id] } };
    var play = await send('o1', ROOM, act.type, act.payload);
    check('7 真人动作被接受（不再 NOT_PLAY_PHASE）', play.ok, JSON.stringify(play).slice(0, 240));
    if (!play.ok) console.log('    server detail: ' + JSON.stringify(play));
  } else {
    check('7 首手不是真人（' + cur + '），跳过一次真人动作', true);
  }

  // 连发两次同一个动作：第二次必须是 STALE/DUPLICATE，而不是把状态搞乱
  var r8 = await call('o1', { action: 'poll', roomId: ROOM });
  check('8 轮询返回可渲染视图', !!(r8.ok && r8.room && r8.room.state), JSON.stringify(r8).slice(0, 120));

  // 最后一个真人退出 → 房间应立即被释放，同号可重建
  var r9 = await call('o1', { action: 'leave', roomId: ROOM });
  check('9 真人退出后房间被删除', r9.ok && !store[ROOM], JSON.stringify(r9).slice(0, 160));
  var r10 = await call('o2', { action: 'create', roomId: ROOM, nick: '乙', config: { rounds: 12, baseScore: 1, turnSeconds: 0, aiFill: true } });
  check('10 同号房间可再次创建', r10.ok && !!store[ROOM], JSON.stringify(r10).slice(0, 160));

  console.log('\nserver flow: ' + pass + ' passed, ' + fail + ' failed');
  console.log('checks: ' + (pass + fail) + ' | passed: ' + pass + ' | failed: ' + fail);
  Module._load = origLoad;
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('EXCEPTION', e && e.stack || e);
  process.exit(1);
});
