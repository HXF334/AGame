# cloudfunctions —— 云开发（D-079 / D-090）

> 这些代码**不进小游戏包**，只在云端运行。`project.config.json` 里已配 `cloudfunctionRoot` 并排除出包。

## init-db（初始化集合）

1. 开发者工具 → 云开发 → 云函数 → 右键 `init-db` → **上传并部署：云端安装依赖**。
2. 右键 → **云端测试**，参数传 `{}`，执行。
3. 返回 `{ ok: true, results: { rooms: 'created', room_logs: 'created', game_records: 'created' } }` 即成功；重复执行会返回 `exists`。

集合建好后，还需要在 **云开发控制台 → 数据库 → 权限设置** 里配置安全规则：
- `rooms` / `room_logs`：先只允许登录用户读写，后续按房间成员收紧。
- `game_records`：**只允许云函数写入**（客户端不可直接写），读取可先关闭。

## record-game（战绩落库）

1. 同 init-db：右键 `record-game` → **上传并部署：云端安装依赖**。
2. 部署后，客户端在每局 `GAME_END` 首次渲染时自动调用；无头测试/未初始化云时自动跳过。
3. 写入字段（服务端白名单）：`mode / winner / reason / mainSuit / mainBy / firstOut / players[{id,name,camp,score}] / totalScore / playsCount / createdAt / openid`。
4. 客户端上报失败只写日志，不影响结算与下一局；同一局只上报一次。

## 环境

- 环境 ID：`cloud1-d5g7uiwu9f7caacdc`
- 客户端初始化（已接在 `game.js` 的 `_submitGameRecord`）：`wx.cloud.init({ env: 'cloud1-d5g7uiwu9f7caacdc', traceUser: true })`

## clear-records（清空我的战绩）

1. 右键 \clear-records\ → **上传并部署：云端安装依赖**。
2. 不需要参数；openid 由服务端上下文取，只删当前用户自己的记录。
3. 返回 \{ ok: true, removed: N }\。