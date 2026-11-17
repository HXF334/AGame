// tests/test-online-stale.js — 联网动作 STALE 重试（D-105）
//   [2026-11-17 用户] 实测「联网失败: PLAY -> STALE」一直不消失。
//   根因：c.send 原来 STALE 后先 poll 再重发，而 poll 自身会 advanceRoom（推进 AI/闸门，
//   seq 再涨），等于「刚追上的序号又被顶掉」。现在改成：直接采纳服务端 STALE 回包里的
//   seq 再重试，不再 poll。
var path = require('path');
var online = require(path.join(__dirname, '..', 'src', 'online.js'));

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

// 假服务端：当前 seq=7；只有当 baseSeq 等于 7 时才成功，否则回 STALE + 最新 seq
function makeCloud(startSeq) {
  var calls = [];
  var seq = startSeq;
  var accepted = 0;
  return {
    calls: calls,
    getSeq: function () { return seq; },
    getAccepted: function () { return accepted; },
    call: function (name, data) {
      calls.push({ name: name, action: data && data.action, env: data && data.env });
      if (data.action === 'poll') {
        // poll 会「推进」房间：这里模拟 seq 再涨 1（这正是原来致命的点）
        seq += 1;
        return Promise.resolve({ ok: true, room: { id: 'R1', seq: seq, status: 'PLAYING', players: [] } });
      }
      if (data.action === 'apply') {
        var env = data.env;
        if (env.baseSeq !== seq) return Promise.resolve({ ok: false, error: 'STALE', seq: seq });
        accepted += 1;
        seq += 1;
        return Promise.resolve({ ok: true, room: { id: 'R1', seq: seq, status: 'PLAYING', players: [] } });
      }
      return Promise.resolve({ ok: false, error: 'UNKNOWN' });
    }
  };
}

var cloud = makeCloud(7);
var c = online.createClient({ call: cloud.call });
c.roomId = 'R1';
c.seq = 0;   // 客户端的视图严重落后

c.send('PLAY', { playerId: 'A', cardIds: ['H-3-0'] })['then'](function (r) {
  check('1.1 最终成功', !!(r && r.ok), JSON.stringify(r));
  var polls = cloud.calls.filter(function (x) { return x.action === 'poll'; }).length;
  check('1.2 STALE 重试不再触发 poll（避免 seq 被 poll 顶掉）', polls === 0, 'polls=' + polls);
  var applies = cloud.calls.filter(function (x) { return x.action === 'apply'; }).length;
  check('1.3 用服务端回的 seq 重试并成功', applies === 2 && cloud.getAccepted() === 1, 'applies=' + applies);
  check('1.4 成功后本地 seq 跟上服务端', c.seq === 8, 'seq=' + c.seq);

  // 连续 STALE（服务端每次都在动）也不能无限重试
  var cloud2 = makeCloud(3);
  var c2 = online.createClient({ call: cloud2.call });
  c2.roomId = 'R1';
  c2.seq = 0;
  c2.send('PLAY', { playerId: 'A', cardIds: ['H-3-0'] })['then'](function (r2) {
    var applies2 = cloud2.calls.filter(function (x) { return x.action === 'apply'; }).length;
    check('2.1 最多重试 4 次后停止（不会无限循环）', applies2 <= 4, 'applies=' + applies2);
    console.log('\nonline stale: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  });
});
