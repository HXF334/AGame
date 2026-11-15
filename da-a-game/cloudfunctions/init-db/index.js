// cloudfunctions/init-db/index.js —— 云开发初始化（D-079）
//
// 用途: 首次部署后手动调用一次, 建好小游戏需要的集合。
// 调用方式: 开发者工具 -> 云开发 -> 云函数 -> init-db -> 云端测试(空参数) 或
//           wx.cloud.callFunction({ name: 'init-db' })
//
// 幂等: 集合已存在时返回 exists, 不报错。
// 注意: 索引与安全规则仍需在控制台确认(云函数无法设置安全规则)。

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const COLLECTIONS = [
  'rooms',        // 房间: 房间码、座位、状态、版本号
  'room_logs'     // 可选: 房间操作流水(排查/回放)
];

exports.main = async () => {
  const db = cloud.database();
  const results = {};
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
      results[name] = 'created';
    } catch (e) {
      const msg = (e && (e.errMsg || e.message)) || '';
      if (/already exist/i.test(msg) || e.errCode === -501001) {
        results[name] = 'exists';
      } else {
        results[name] = 'error: ' + msg;
      }
    }
  }
  return {
    ok: Object.keys(results).every((k) => String(results[k]).indexOf('error') !== 0),
    env: cloud.DYNAMIC_CURRENT_ENV,
    results
  };
};
