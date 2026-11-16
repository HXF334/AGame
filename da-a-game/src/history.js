// src/history.js
// [2026-11-16 P3 战绩页] 战绩记录的展示层：纯函数，无 wx、无副作用。
//   输入是 list-records 云函数返回的 records（公开字段 + humanId），输出面板要用的文本行。
//   注意：这里只做格式化，不参与规则，也不改任何 state。

function modeText(mode) {
  var s = String(mode || '');
  if (s === '2V3_明打') return '2V3明打';
  if (s === '2V3_暗打') return '2V3暗打';
  if (s === '1V4_明打') return '1V4明打';
  if (s === '1V4_暗打') return '1V4暗打';
  return s || '未知模式';
}

function resultText(winner) {
  if (winner === '主方') return '主胜';
  if (winner === '抓方') return '抓胜';
  return '平局';
}

function pad2(n) { return n < 10 ? '0' + n : String(n); }

function timeText(createdAt) {
  if (!createdAt) return '';
  var d = (createdAt instanceof Date) ? createdAt : new Date(createdAt);
  if (isNaN(d.getTime())) return '';
  return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function perspText(p) {
  if (p === 'win') return '胜';
  if (p === 'lose') return '负';
  if (p === 'draw') return '平';
  return '—';
}

function deltaText(n) {
  var v = Number(n) || 0;
  if (v > 0) return '+' + v;
  return String(v);
}

function selfScore(rec) {
  if (!rec || !rec.players) return null;
  // [2026-11-16] 用记录里存的「当时真人座位」找人；没存 humanId 的老记录显示 —，
  //   不能拿当前座位去猜（座位每局随机重排）。
  var id = rec.humanId;
  if (!id) return null;
  for (var i = 0; i < rec.players.length; i++) {
    if (rec.players[i] && rec.players[i].id === id) return Number(rec.players[i].score) || 0;
  }
  return null;
}

// rows(records) -> [{ time, mode, result, delta, key }]
function rows(records) {
  var out = [];
  (records || []).forEach(function (rec, i) {
    if (!rec) return;
    var sc = selfScore(rec);
    out.push({
      key: String(rec._id || i),
      time: timeText(rec.createdAt || rec.clientCreatedAt),
      mode: modeText(rec.mode),
      result: perspText(perspective(rec)),
      delta: sc == null ? '—' : deltaText(sc)
    });
  });
  return out;
}

// perspective(rec) -> 'win' | 'lose' | 'draw' | 'unknown'
//   [2026-11-16 修正] 胜负看「我方阵营」而不是分数正负：
//   平局得 0 分、旧记录没有 humanId 时得分未知，都不能混算成「平」。
function perspective(rec) {
  if (!rec || !rec.humanId || !rec.players) return 'unknown';
  var camp = null;
  for (var i = 0; i < rec.players.length; i++) {
    if (rec.players[i] && rec.players[i].id === rec.humanId) { camp = rec.players[i].camp; break; }
  }
  if (!camp || camp === 'unknown') return 'unknown';
  var w = String(rec.winner || '');
  if (w === '主方') return camp === 'main' ? 'win' : 'lose';
  if (w === '抓方') return camp === 'taker' ? 'win' : 'lose';
  return 'draw';
}

// summary(records) -> '最近 N 局：X 胜 Y 负 Z 平[，U 局身份未知]'
function summary(records) {
  var win = 0, lose = 0, draw = 0, unknown = 0;
  (records || []).forEach(function (rec) {
    if (!rec) return;
    var p = perspective(rec);
    if (p === 'win') win++;
    else if (p === 'lose') lose++;
    else if (p === 'draw') draw++;
    else unknown++;
  });
  var s = '最近 ' + (records || []).length + ' 局：' + win + ' 胜 ' + lose + ' 负 ' + draw + ' 平';
  if (unknown) s += '，' + unknown + ' 局身份未知';
  return s;
}

module.exports = {
  modeText: modeText,
  resultText: resultText,
  perspText: perspText,
  timeText: timeText,
  deltaText: deltaText,
  selfScore: selfScore,
  rows: rows,
  perspective: perspective,
  summary: summary
};
