// [2026-11-16 用户] 清空当前用户的战绩。
//   安全：openid 只从服务端上下文取，客户端不能指定清谁；只删自己名下的记录。
//   云函数单次查询上限 100 条，循环分批删；最多 50 批（5000 条）防死循环。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async function () {
  const ctx = cloud.getWXContext();
  const openid = ctx.OPENID || '';
  if (!openid) return { ok: false, error: 'NO_OPENID' };

  const col = db.collection('game_records');
  let removed = 0;
  try {
    for (let i = 0; i < 50; i++) {
      const res = await col.where({ openid: openid }).limit(100).get();
      const docs = res.data || [];
      if (!docs.length) break;
      for (const doc of docs) {
        try { await col.doc(doc._id).remove(); removed++; } catch (e) { /* 单条失败不阻塞 */ }
      }
      if (docs.length < 100) break;
    }
    return { ok: true, removed: removed };
  } catch (e) {
    const msg = (e && (e.errMsg || e.message)) || String(e);
    // 集合不存在 = 没有战绩可清
    if (e && (e.errCode === -502005 || /not exist/i.test(msg))) return { ok: true, removed: removed };
    return { ok: false, error: 'CLEAR_FAILED', message: msg, removed: removed };
  }
};
