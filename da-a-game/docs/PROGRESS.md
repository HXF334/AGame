# 开发进度日志

按时间顺序记录任务批次与里程碑。

---

## 批次 0：项目立项与基础设施（已完成）

- OpenClaw + MiniMax API 独立开发内蒙古打大A微信小游戏
- **不使用** Cocos Creator / 普通微信小程序模板
- 技术栈：JavaScript + CommonJS（Node 测试与微信小游戏共用 `require`）
- 横屏默认（`deviceOrientation: "landscape"`）
- AppID：`wx99808147273cdea1`
- 安装 Windows 编码修正包装器 `AGame/tools/wechat-cli.ps1`（UTF-8 with BOM，`Start-Process` + 分别 Redirect stdout/stderr）

---

## 批次 1：基础设施（已完成）

- **阶段路线 C-6 → C-4 → C-1 → C-2 全部完成**
- 实现 §3 状态机 + §4.1 亮A + §4.2 强制排查（不含反A/底牌翻开/身份选择/出牌/AI/界面）
- 业务级拒绝优先级：`主A != null`、`底牌公开 === true`、反A 已发生等检查先于 phase 检查
- 失败时 `transition()` 返回 `{ok:false, error:{type,message}, state:原state}`（state 引用相同）
- `state` 字段 `反A / 次方 / mode / 底牌公开` 用 `?? null` 在所有 handler 链中传透
- 反A 后强制 `mode = '1V4_明打'`（§4.4）
- REVEAL_BOTTOM 判定：1 个大A 持有者 = 1V4；2 个持有者 = 2V3，次方 = 非主方的那位

## 批次 2：牌型识别（已完成）

- §6 牌型识别分 3 批完成（16 种牌型）
- POWER 等级表 + 4 个特殊列表（单大A / 4-张大蛋子 / 双王 / 三王 / 四王）

## 批次 3：取牌、出牌、推风、胜负、计分（已完成）

- §7 → §8 → §9 → §10 → §11 一次性完成

---

## 任务 A-F：稳定与修复阶段（已完成 2026-10-20 12:21）

| 任务 | 描述 |
|---|---|
| A | 修 2V3 胜负判定 bug |
| B | 修 1V4 暗打 平局边界 |
| C | 加 AI 测试 |
| D | 优化 AI 策略（大牌保护）|
| E | 加更多集成测试（边界场景）|
| F | 清理临时文件 |

---

## 任务 G-K：完成度冲刺（已完成 2026-10-20 12:33）

| 任务 | 描述 |
|---|---|
| G | 反A 完整流程 E2E 测试（13 项）|
| H | game.js wx.* 可注入（typeof wx 守卫）|
| I | SKILL.md 完整性审计（15 章全实现）|
| J | AI 模块扩展（对子压）|
| K | 性能测试（1000 局，99.8% 完成率, 0.69 ms/局）|

---

## 任务 A-C 第二轮：根因修复（已完成 2026-10-20 13:02）

| 任务 | 描述 |
|---|---|
| A | 修 transition.js 字段丢失（`Object.assign({}, state, _r.state)` + 拆 dispatch bug）|
| B | 修 perf 测试脚本 bug（运算符优先级）|
| C | AI 压对子（`tableHandPair` + 升序对子组）|

**关键学习**：发现一类 bug 模式时，应 grep 全仓库同类依赖点，而非修完已知症状就收工 —— A 任务修了 win-loss / push-wind / transition，**漏了 scoring.js**，被后续 test-scoring-deep.js 挖出。

---

## 任务 B（计分深度覆盖，已完成 2026-10-20 13:06）

- `tests/test-scoring-deep.js`（34 项）覆盖 §11.1 + §11.2
- 暴露 scoring.js 仍硬依赖 `state.主方[0]` / `state.抓方`
- 注入 `camps(state)` helper（双路径逻辑，与 win-loss / push-wind 一致）

---

## 任务 A-B 第三轮：扫描 + 加固（已完成 2026-10-20 18:00-18:30）

| 时间 | 任务 | 描述 |
|---|---|---|
| 18:06 | A 扫描 | grep 15 处未守卫 `state.X.Y` 解引用，发现 2 处真隐患 |
| 18:06 | A 修 | `transition.js` REVEAL_BOTTOM `state.主A.suit` 加 null 守卫；`capture.js` `state.table.map` 加空守卫 |
| 18:06 | A2 | **同类隐患广泛存在**——给 handlePass/handlePlay/chooseAction 加 player.hand / state.players guard |
| 18:06 | A3 | `ensureState()` + `origState` 保留引用，err 路径返回原 state |
| 18:06 | A4 | `transition(null)` 早退保留 `ILLEGAL_ACTION` 语义 |
| 18:06 | A5 | `transition(s, null)` 早退路径不再调 `ensureState`，保留 `r.state === s` |
| 18:06 | B | 修 test-perf.js 死循环（`!(arr).indexOf(n) >= 0` 恒为 true）|

**新增 test-robustness.js**（23 项）：13 种 malformed state × 10 个模块的 fuzzer 扫描。

---

## 任务 B（计分深度覆盖 #2，已完成 2026-10-20 13:06）

- 修了 2 个旧测试预期（"未传 n 默认 N=1" 是旧假设）

---

## 任务 D-A-B：UI 可用后的并行任务（已完成 2026-10-20 18:18-18:33）

| 任务 | 描述 | 测试 |
|---|---|---|
| **D** tap-to-select | game.js 加 selectedCards + handCardHitboxes；draw human 回合渲染可点击矩形；doPlay 用 selectedCards 多卡型优先；onTouchStart 加手牌命中检测；advance 清空选中 | 24/24 |
| **A** camps 公共化 | 新增 src/util.js；删 3 处重复实现；scoring.js 重写；删 push-wind 死代码 | 24/24 |
| **B** N 自动推导 | scoring.js 加 autoDeriveN(state, winner)：主方胜按抓方未出完人数；主方失败查 3 行表；n 变可选；新增 test-scoring-n-derive.js（15 项）| 25/25 |

---

## UI bug 修复（已完成 2026-10-20 18:11-18:12）

| 时间 | Bug | 修法 |
|---|---|---|
| 18:11 | "worker path empty" IDE 启动错 | 重写 project.config.json，清除 mojibake description |
| 18:11 | `cardDescFull_cardDesc is not defined` | game.js doPlay 局部变量 `cardDesc` 屏蔽外层函数 → 改名 `cardText` |
| 18:12 | `state is not defined` at runAI | game.js L516-517 `state.players` / `state.discarded` → `gameState.players` / `gameState.discarded` |

---

## 待办（按优先级）

| 优先级 | 任务 | 说明 |
|---|---|---|
| P0 | UI bug 修复（手牌超屏、多卡 999、AI log）| 用户 2026-10-20 20:14 反馈 |
| P1 | game.js Node-side 集成测试 | mock wx/canvas + 验证 draw 输出 + doPlay 用选中卡路径 |
| P2 | 持续更新 docs | 用户要求：每天 |

---

## 里程碑

| 日期 | 里程碑 |
|---|---|
| 2026-10-19 20:18 | 第一版规则引擎 + UI 集成 |
| 2026-10-19 21:12 | UI 首次验证（suitChar undefined 报错已修）|
| 2026-10-19 22:10 | 玩家名改甲乙丙丁戊 |
| 2026-10-20 12:21 | A-F 完成 |
| 2026-10-20 12:33 | G-K 完成 |
| 2026-10-20 13:02 | A-C 第二轮完成 |
| 2026-10-20 13:06 | 计分深度覆盖完成 |
| 2026-10-20 13:07 | 第一版 docs（5 份）生成 |
| 2026-10-20 18:00 | 第二次扫描 + 加固完成（ensureState + origState + 各种守卫）|
| 2026-10-20 18:33 | D-A-B 完成，**25/25 套件全过** |
| 2026-10-20 18:11-18:12 | 3 个 UI runtime bug 修 |
| 2026-10-20 20:14 | 用户开始目视验证 + 第一份 docs 刷新 |

---

## 已废弃 / 取代

| 旧方案 | 原因 | 新方案 |
|---|---|---|
| 硬依赖 `state.主方`/`抓方` | transition 丢字段时 crash | 双路径推导 `主A.establishedBy + 次方` |
| `getCamp` 用 `state.主方`/`抓方` | 同上 | 同上 |
| `chooseAction` 仅出第一张 | 不符合 SKILL §12 "优先选择合法可比较牌型" | 按点数升序 + 大牌保护 + 压对子 |
| `transition()` 直接 return handler 结果 | handler 返回 ok({...}) 丢字段 | 出口统一 merge |
| test-perf.js 用 `!(arr).indexOf(n) >= 0` | 运算符优先级 bug，已过牌玩家被重复选 | 复用 e2e 已验证的对局循环 |
| `calculateScore(state, result, n)` 强制外部传 n | SKILL §11.2 N 应自动推导 | `autoDeriveN(state, winner)`，n 变可选 |
| 3 处 camps() 重复实现 | 修算法要同步 3 处 | 统一到 `src/util.js` |
| `game.js` `state` / `gameState` 混用 | runAI 内 L516-517 引用 `state` 触发 ReferenceError | 全部 `gameState`（仅 doPlay/cardText 局部变量名 `state` 不存在）|
| 局部 `const cardDesc` 屏蔽外层函数 cardDesc | L120 函数被屏蔽 → ReferenceError | 局部变量改名 `cardText` |
| project.config.json description 是 mojibake | IDE "worker path empty" 错 | 写干净 ASCII 中文 |