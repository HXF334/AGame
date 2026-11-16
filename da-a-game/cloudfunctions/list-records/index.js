// cloudfunctions/list-records/index.js
// [2026-11-16 P3 战绩页] 只读查询：按当前用户 openid 取最近 N 局战绩。
//   安全：openid 由服务端上下文取，客户端不能指定；只返回白名单字段，不回传 openid。
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function pick(rec) {
  return {
    _id: rec._id,
    mode: rec.mode,
    winner: rec.winner,
    reason: rec.reason,
    mainSuit: rec.mainSuit,
    mainBy: rec.mainBy,
    firstOut: rec.firstOut,
    humanId: rec.humanId || null,
    players: (rec.players || []).map(function (p) {
      return { id: p.id, name: p.name, camp: p.camp, score: p.score };
    }),
    totalScore: rec.totalScore,
    playsCount: rec.playsCount,
    createdAt: rec.createdAt
  };
}

exports.main = async (event) => {
  const ctx = cloud.getWXContext() || {};
  const openid = ctx.OPENID || '';
  if (!openid) return { ok: false, error: 'NO_OPENID' };
  const limit = Math.min(50, Math.max(1, Number(event && event.limit) || 10));
  try {
    const r = await db.collection('game_records')
      .where({ openid: openid })
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return { ok: true, records: (r.data || []).map(pick) };
  } catch (e) {
    const msg = (e && (e.errMsg || e.message)) || '';
    // 集合还不存在（第一局都没打完）时当作空列表，不报错
    if (e && (e.errCode === -502005 || /collection not exist|not exist/i.test(msg))) {
      return { ok: true, records: [] };
    }
    return { ok: false, error: 'QUERY_FAILED', message: msg };
  }
};
