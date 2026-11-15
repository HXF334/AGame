# cloudfunctions —— 云开发（D-079）

> 这些代码**不进小游戏包**，只在云端运行。`project.config.json` 里已配 `cloudfunctionRoot` 并排除出包。

## init-db（初始化集合）

1. 开发者工具 → 云开发 → 云函数 → 右键 `init-db` → **上传并部署：云端安装依赖**。
2. 右键 → **云端测试**，参数传 `{}`，执行。
3. 返回 `{ ok: true, results: { rooms: 'created', room_logs: 'created' } }` 即成功；重复执行会返回 `exists`。

集合建好后，还需要在 **云开发控制台 → 数据库 → 权限设置** 里给 `rooms` 配置安全规则（先只允许登录用户读写，后续按房间成员收紧）。

## 环境

- 环境 ID：`cloud1-d5g7uiwu9f7caacdc`
- 代码侧初始化（联网任务时再加）：`wx.cloud.init({ env: 'cloud1-d5g7uiwu9f7caacdc', traceUser: true })`
