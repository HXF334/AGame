// [2026-11-16 用户] 联网 P2：房间等待页数据层（纯函数，不依赖 wx）
//   view 来自 game-server 的 poll 结果（已按当前玩家裁剪）。
function seatRows(view) {
  var players = (view && view.players) || [];
  var bySeat = {};
  for (var i = 0; i < players.length; i++) bySeat[players[i].seat] = players[i];
  var rows = [];
  for (var s = 0; s < 5; s++) {
    var p = bySeat[s];
    if (!p) {
      rows.push({ seat: s, empty: true, label: '空位', status: '等待加入', ready: false, ai: false, offline: false, owner: false, you: false, total: 0 });
      continue;
    }
    var status = p.offline ? '离线' : (p.ai ? 'AI' : (p.ready ? '已备' : '未备'));
    rows.push({
      seat: s,
      empty: false,
      label: p.nick || ('玩家' + (s + 1)),
      status: status,
      ready: !!p.ready,
      ai: !!p.ai,
      offline: !!p.offline,
      owner: !!p.owner,
      you: (view.you === s),
      total: p.total || 0
    });
  }
  return rows;
}

function myRow(view) {
  var rows = seatRows(view);
  for (var i = 0; i < rows.length; i++) if (rows[i].you) return rows[i];
  return null;
}

function isOwner(view) {
  var r = myRow(view);
  return !!(r && r.owner);
}

function canConfig(view) {
  return !!(view && view.status === 'WAITING');
}

function canStart(view) {
  if (!view || view.status !== 'WAITING') return false;
  var rows = seatRows(view);
  var me = null, humans = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].you) me = rows[i];
    if (!rows[i].empty && !rows[i].ai) humans += 1;
  }
  return !!(me && me.owner && humans >= 1 && (humans >= 5 || (view.config && view.config.aiFill)));
}

function statusText(view) {
  if (!view) return '连接中';
  if (view.status === 'WAITING') return '等待准备';
  if (view.status === 'PLAYING') return '对局中（第 ' + view.round + '/' + view.rounds + ' 局）';
  if (view.status === 'SETTLED') return '本局结束';
  if (view.status === 'FINISHED') return '全部结束';
  return String(view.status || '');
}

module.exports = {
  isOwner: isOwner,
  seatRows: seatRows,
  myRow: myRow,
  canConfig: canConfig,
  canStart: canStart,
  statusText: statusText
};
