// cloudfunctions/record-game/index.js
// [2026-11-16 P3] 战绩落库：接收客户端整理好的公开战绩，写入 game_records。
//   安全：只接受固定字段，不接收手牌/底牌；客户端数据不可信，这里做结构校验。
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function pickPlayer(p) {
  if (!p || typeof p.id !== 'string') return null;
  return {
    id: String(p.id).slice(0, 32),
    name: String(p.name || p.id).slice(0, 32),
    camp: (p.camp === 'main' || p.camp === 'taker') ? p.camp : 'unknown',
    score: Number(p.score) || 0
  };
}

exports.main = async (event) => {
  const record = event && event.record;
  if (!record || typeof record.mode !== 'string' || !Array.isArray(record.players)) {
    return { ok: false, error: 'INVALID_RECORD' };
  }
  if (record.players.length < 2 || record.players.length > 8) {
    return { ok: false, error: 'INVALID_PLAYERS' };
  }
  const players = record.players.map(pickPlayer).filter(Boolean);
  if (players.length !== record.players.length) {
    return { ok: false, error: 'INVALID_PLAYERS' };
  }
  const ctx = cloud.getWXContext() || {};
  const data = {
    schemaVersion: 1,
    mode: String(record.mode).slice(0, 32),
    winner: String(record.winner || 'draw').slice(0, 16),
    reason: String(record.reason || '').slice(0, 64),
    mainSuit: record.mainSuit ? String(record.mainSuit).slice(0, 2) : null,
    mainBy: record.mainBy ? String(record.mainBy).slice(0, 8) : null,
    firstOut: record.firstOut ? String(record.firstOut).slice(0, 8) : null,
    players: players,
    totalScore: Number(record.totalScore) || 0,
    playsCount: Number(record.playsCount) || 0,
    clientCreatedAt: String(record.createdAt || '').slice(0, 32),
    openid: ctx.OPENID || '',
    createdAt: db.serverDate()
  };
  // 集合不存在时自愈（避免必须手动跑 init-db）：创建后重试一次
  let r;
  try {
    r = await db.collection('game_records').add({ data });
  } catch (e) {
    const msg = (e && (e.errMsg || e.message)) || '';
    if (e && (e.errCode === -502005 || /collection not exist|not exist/i.test(msg))) {
      await db.createCollection('game_records');
      r = await db.collection('game_records').add({ data });
    } else {
      return { ok: false, error: 'WRITE_FAILED', message: msg };
    }
  }
  return { ok: true, id: r._id };
};
