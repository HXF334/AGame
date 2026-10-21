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

## 批次 1-2-3：规则引擎全章节实现（已完成 2026-10-19-20）

- §3 状态机 + §4.1 亮A + §4.2 强制排查（不含反A/底牌翻开/身份选择/出牌/AI/界面）
- §6 牌型识别（16 种，分 3 批）
- §7 → §8 → §9 → §10 → §11 一次性完成
- 业务级拒绝优先级：`主A != null`、`底牌公开 === true`、反A 已发生等检查先于 phase 检查

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

## 任务 G-K：完成度冲刺（已完成 2026-10-20 12:33）

| 任务 | 描述 |
|---|---|
| G | 反A 完整流程 E2E 测试（13 项）|
| H | game.js wx.* 可注入（typeof wx 守卫）|
| I | SKILL.md 完整性审计（15 章全实现）|
| J | AI 模块扩展（对子压）|
| K | 性能测试（1000 局，99.8% 完成率, 0.69 ms/局）|

## 任务 A-C 第二轮 / B 第三轮：A3 加固（已完成 2026-10-20 13:02-18:30）

- transition.js 字段丢失（`Object.assign({}, state, _r.state)` + `ensureState`）
- 双路径推导 `camps()` 抽到 `src/util.js`
- N 自动推导 `autoDeriveN(state, winner)`
- D 任务：tap-to-select（selectedCards + handCardHitboxes + onTouchStart 命中检测）
- AI 压对子
- UI bug #1 `cardDescFull_cardDesc`（局部 const 屏蔽外层函数 → 改名 `cardText`）
- UI bug #2 `state is not defined` at runAI（`state` → `gameState`）

**关键学习**：发现 bug 模式时，应 grep 全仓库同类依赖点 —— A 任务只修了 win-loss / push-wind / transition，**漏了 scoring.js**，被后续 test-scoring-deep.js 挖出。

---

## 批次 4：自主全面审查 + 大规模修复（已完成 2026-10-20 22:40 - 2026-10-21 13:15）

### 阶段 A：git 基础设施 + SKILL 逐节审计
- 22:40 `git init -b main` + 首次提交 `6cb0985`（69 文件）
- 23:30 自审 SKILL 15 章，加 8 套审查测试，发现 7 个隐藏 bug

### 阶段 B：9 项修复（详见 `KNOWN_ISSUES.md` B18-B27）
| bug | 级别 | 概要 |
|---|---|---|
| **B18 [P0]** | 引擎 + 真实玩家 | 连张/双龙识别依赖牌序（`handlePlay` 按手牌存储顺序重排） |
| B19 [P1] | 引擎 | POWER 表压平 §6.3 末档，蛋子无法跳型压制 |
| B20 [P1] | 引擎 | PAIR/TRIPLE 比较泄露大A 加成 |
| B21 [P1] | 引擎 | 推风跳阵营（分支条件误用 mode）|
| B22 [P1] | 引擎 | 单大A 压制张数写反（4‖6 → 5‖6）|
| B23 [P1] | 引擎 | `isValidStraight` 循环起点错误（4-4-5 被误判为连张）|
| B24 [P1] | 引擎 | §4.3 直接亮双大A 未按 1V4明打 处理（代码注释写了意图但条件没实现）|
| B25 | AI | AI 重写：玩家 16 种牌型只出 SINGLE（100%），改后 9/16 |
| B26 | UI | game.js 对子回退声称修复但未落盘 |
| B27 | UI | 15 项 UI 修复汇总（详见 `KNOWN_ISSUES.md`）|

### 阶段 C：AI 能力实测 + 大规模压测
- **AI 40 局实测**：牌型覆盖 1/16 → 9/16，过牌率 49% → 49%（不变，取牌合法导致必然较高）
- **300 局压测**：300/300 正常结束、0 卡死、0 非法行动、0 牌张不守恒
- **D4「AI 死循环」已解决** —— 根因即 B18 P0

### 阶段 D：无头 UI 测试基建（`game.js` 此前 25KB 重建文件无任何测试）
**核心创新：mock wx/canvas 让 `game.js` 能在 node 里跑真实代码路径**

| 新增 | 用途 |
|---|---|
| `tests/mock-wx.js` | wx.createCanvas / onTouchStart + 9 ctx 方法 mock |
| `tests/test-game-headless.js`（25 项）| 驱动 `doPlay`/`doPass`/`runAI`/绘制，验证 log 文案质量、信息边界、牌张守恒 |
| `tests/lib/state-builder.js` | 共享局面构造器（消除测试/诊断分歧）|
| `tests/test-game-scenarios.js`（35 项）| **把你报过的每个 bug 固化为永久回归用例**（推风/33333/乱序连张/对子/§4.3/反A）|
| `tests/test-game-touch.js`（25 项）| 触摸坐标 → 牌 ID 映射正确性 |
| `game.js` 新增 `__setState` 注入点 + 补导出 `draw`/`cardDesc`/`selectedCards`/`handCardHitboxes`（`typeof module` 守卫已存在，微信零影响）|

### 阶段 E：抓到并修了一个**真实现存 UI 缺陷**
构造态测试 S1 暴露出：`doPushWind` 没把引擎算出的 `currentPlayer` 同步回模块级变量，导致 `runAI` 拿过期值行动 —— **跨阵营推风**。

A/B 对照（临时移除修复后跑测试）：
- 移除 → 第一个行动者 = `AI 丙`（主方玩家）✗
- 保留 → 第一个行动者 = `AI 戊`（抓方最近未出完者）✓

影响面：每次自动推风都触发（`maybeTriggerPushWindAfterRoundEnd → doPushWind`）。这是**此前随机局几乎撞不到**的真实 bug。

### 阶段 F：修正一个 flaky 测试
`test-game-headless.js` 1.7 原来断言"每家 ≤22 张"作为全程不变量，12 次跑挂 1 次。
根因：**§7.1 取牌让手牌可超过 22**（实测 23 张）。22 只是发牌/翻底牌那一刻的分配值，非全程不变量。
改为"非负且 ≤108 + 总数 ≤108"。修正后**20/20 稳定**。

---

## 全部里程碑

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
| 2026-10-20 18:00 | 第二次扫描 + 加固完成 |
| 2026-10-20 18:33 | D-A-B 完成，25/25 套件全过 |
| 2026-10-20 18:11-18:12 | 3 个 UI runtime bug 修 |
| 2026-10-20 20:14 | 用户开始目视验证 |
| 2026-10-20 22:40 | **首次 git 提交 6cb0985（69 文件）** |
| 2026-10-21 13:15 | **8 个提交全部推送，43 套件 / 700+ 项全过，43 文件无头测试基建** |

---

## 当前状态摘要

```
测试  43 套件 PASS / 0 FAIL  (持续验证, 累计 400+ 次套件执行 0 失败)
AI   牌型覆盖 1/16 → 9/16, 300 局 0 卡死 / 0 非法 / 0 牌张不守恒
git  main == origin/main @ 1355d0e, 工作区干净, 73 文件
doc  KNOWN_ISSUES.md 更新至 B30
```

## 待办（按优先级）

| 优先级 | 事项 | 说明 |
|---|---|---|
| **P0** | **微信 IDE 实测** | `game.js` 是重建文件，本轮修了牌序依赖与推风同步 2 个真 bug，IDE 上未验证 |
| P2 | 补齐 `PROGRESS.md` / `PROJECT_STATUS.md` / `TEST_REPORT.md` / `HANDOFF.md` 4 份文档（仍停在 20:14）| **本批次已完成** |
| P3 | D7：`handlePlay`/`handlePass` 内改走 `camps()` | 防止再次出现 B19/B20 这类直接依赖阵营字段的同类 bug |
| — | `test-audit-integration.js` 偶发 flaky | 200+ 次未复现，根因未查明（不是 § 取牌增加手牌上限那类问题）|

## 已废弃 / 取代

| 旧方案 | 原因 | 新方案 |
|---|---|---|
| 硬依赖 `state.主方`/`抓方` | transition 丢字段时 crash | 双路径推导 `主A.establishedBy + 次方` |
| `getCamp` 用 `state.主方`/`抓方` | 同上 | `src/util.js camps()` |
| `chooseAction` 只出第一张 | 16 种牌型只出 1 种 | candidateCombos 枚举 + 引擎 `canBeat` 裁决 |
| `transition()` 直接 return handler 结果 | handler 返回 `ok({...})` 丢字段 | 出口统一 `Object.assign` merge |
| test-perf.js 用 `!(arr).indexOf(n) >= 0` | 运算符优先级 bug | 复用 e2e 循环 |
| `calculateScore(state, result, n)` 强制外部传 n | §11.2 N 应自动推导 | `autoDeriveN(state, winner)` |
| 3 处 camps() 重复实现 | 修算法要同步 3 处 | 统一到 `src/util.js` |
| `game.js` `state` / `gameState` 混用 | runAI ReferenceError | 全部 `gameState` |
| 局部 `const cardDesc` 屏蔽外层函数 cardDesc | L120 函数被屏蔽 → ReferenceError | 局部变量改名 `cardText` |
| project.config.json description 是 mojibake | IDE "worker path empty" 错 | 干净 ASCII 中文 |
| **AI 用 `doPlay(ids)`** 形式参数 | `doPlay()` 不收参数 | 测试须 `selectedCards().push()` 后调 `doPlay()` |
| **手牌 ≤22 张断言为全程不变量** | §7.1 取牌可超过 | "非负且 ≤108 + 总数守恒 108" |
| **isValidStraight 依赖 cards[0]/cards[len-1]** | handlePlay 重排牌序时 fail | 排序 + 点数集合显式判定 A 形态 |
| **PUSH_WIND 引擎算对的 currentPlayer 在 UI 被丢弃** | game.js 仅 `gameState = r.state` 未同步模块级变量 | 同步 `currentPlayer = r.state.currentPlayer` |
