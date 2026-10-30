# 内蒙古打大A · 项目状态报告

**更新时间**：2026-10-30 21:00 (Asia/Shanghai) · 版本 **v0.32.0**
**项目路径**：`C:\Users\MyFirstAI\.openclaw\workspace-work\AGame\da-a-game\`
**入口文档**：`docs/VERSION.md`（最准）· 交接须知：`docs/HANDOFF.md`

---

## 1. 一句话状态

规则引擎完整、界面重构完成、**55 个套件全绿、需求二~十三全部落地并经用户真机确认**，
**未修 Bug 为 0**。

---

## 2. 架构

```
da-a-game/
├─ src/            规则引擎 12 模块（CommonJS, 纯逻辑, 无 wx.* 依赖）
│  ├─ index.js       统一出口
│  ├─ transition.js  状态机 + handler（+ 4 个资格判定纯函数）
│  ├─ play.js / capture.js / hand-types.js / win-loss.js / scoring.js …
├─ game.js         界面与驱动（唯一有真实状态机的层，~1300 行）
├─ tests/          55 个套件 + mock-wx.js + lib/state-builder.js
├─ skills/         项目内 Skill 文档（见 §5）
└─ docs/           VERSION / HANDOFF / PROJECT_STATUS / PROGRESS / TEST_REPORT / KNOWN_ISSUES
```

**分层铁律**：`src/` 不依赖 `wx.*`；`game.js` 不实现规则，只调用引擎。

---

## 3. v0.10.0 交付内容

## 2.5 v0.11.0 变更（2026-10-24 晚）

| # | 要求 | 落点 |
|---|---|---|
| 1 | 反A 两张A **不得与主A同花色** | 引擎 `handleFanA` + UI `canFanA` + 规则文 §4.4 |
| 2 | 亮双大A **默认 1V4暗打** | 去掉 `doubleA===true` 锁明打那支 → 进 IDENTITY_CHOICE 选明/暗；规则文 §4.5 |
| 3 | 真人座位**开局随机** | `_randomSeat()`，每局重掷 |
| 4 | **删除【下】**，自动推进 | `gateAutoAdvance` + 新增 `_aiLiangARound()`（原先 AI 没有亮A 逻辑）|

**验证**：9 个直接受影响的套件连跑 3 次 0 fail（随机座位会让测试天然 flaky，已消除）。


| 需求 | 落地 |
|---|---|
| 二、真人座位 | **开局随机** A~E，每局重掷；顶部 5 按钮可切 |
| 三、阶段按钮 | 亮A·不亮 · 反A·不反 · 公开身份·隐藏身份 |
| 四、阶段拆分 | 6 档闸门，**自动推进**（【下】按钮已删）；需要真人决策处停下等真人点 |
| 五/六/七、资格由引擎判定 | `canLiangA` / `canFanA` / `canChooseIdentity` / `identityChooser`（判据从既有 handler 提取）|
| 八、统一按钮模型 | `uiButtons()` 单一来源；`uiButtonAt()` / `uiClick()` 按 id 分发 |
| 十、结算画面 | 胜负 + 原因 + **五人得分表**（分数由引擎 `calculateScore` 给）|
| 十一、UI 日志 +【Log】 | 右上角开关，**默认隐藏**，不影响记录 |
| 十二、出牌失败提示 | 【当前没有可用牌】；非法选择不再自动换牌，保留选牌状态 |
| 十三、16 类测试 | `test-ui-phase-gate.js`(55) + `test-eligibility-rules.js`(23) |

---

## 4. 本版修掉的 3 个真 P0（都有真机或日志证据）

| # | 现象 | 根因 | 回归 |
|---|---|---|---|
| 1 | **所有按钮都点不到** | `uiButtonAt()` 拿的是**没有坐标的新对象**（`uiButtons()` 重新生成），而坐标写在另一份对象上 | `test-ui-phase-gate` §5 |
| 2 | **phase=PLAY 但按钮全灰 + AI 不出手** | 引擎在 IDENTITY 阶段结束就把 phase 变 PLAY，而 `currentPlayer` 只在 PLAY 档设置；同时 PLAY 阶段【下】消失 → 闸门最后一档永远到不了 | `test-ui-phase-gate` §10 §11 |
| 3 | **持双大A 却被判无反A资格** | `canFanA` 把花色限定成主A的花色，违反 SKILL §4.4「任意花色都可以」 | `test-eligibility-rules` |

**P0-2 有两条路径**：修第一版只修了「不亮A」路径（转换在 `runGateStage` 内），
「次方身份选择」路径（转换在 `humanChooseIdentity` **内部**）仍死锁 →
抽出统一入口 `enterPlayIfNeeded()` 才根治。

---

## 5. Skill 现状（2026-10-24 审计）

| Skill | 位置 | 状态 |
|---|---|---|
| `dada-a-game-rules` | Workshop | **镜像**（自动生成，勿手改）|
| `dada-a-game-impl` | Workshop | 生效。11 个引擎实现踩坑 + 验证清单 |
| `game-ui-engine-contract` | Workshop | 生效。UI 契约排错 + 无头测试 + 触摸映射 |
| `wechat-miniprogram-fix-class` | Workshop | 生效。小程序错误类 |
| `windows-cn-batch-encoding` | Workshop | 生效。中文 Windows 编码 |
| `wechat-minigame-ui` | Workshop | 生效（新建）。Canvas 小游戏界面实现 |
| `git-safe-workflow` | Workshop | 生效（新建）。Git 安全工作流 |
| `senior-dev-standard` | Workshop | **镜像**（从仓库提升上来，已含变异测试硬证据、审查看调用点、测试纪律映射表）|

**全部 8 个 Skill 的唯一来源都在仓库**，Workshop 里的是自动生成的镜像
（`node scripts/sync-skills.js` 同步 / `--check` 校验）：

| 仓库唯一来源 | Workshop 镜像 | 说明 |
|---|---|---|
| `da-a-game/skills/da-a-game-rules/SKILL.md`（31KB，§1-§15）| `dada-a-game-rules` | **规则唯一权威** |
| `da-a-game/skills/senior-dev-standard/SKILL.md` | `senior-dev-standard` | 代码改动纪律 |
| `da-a-game/skills/{dada-a-game-impl, game-ui-engine-contract, wechat-minigame-ui, git-safe-workflow, wechat-miniprogram-fix-class, windows-cn-batch-encoding}/` | 同名 | 其余 6 个 |

> **为什么要这样**：Workshop 目录 `~/.openclaw/agents/work/agent/workshop-skills/` **不在版本控制里** ——
> 它被清掉，Skill 就没了。仓库是能版本化、能交接、能回滚的地方。

**⚠️ 曾经的坑**：两份规则手册各自漂移（仓库 31KB / Workshop 20KB），反A条款的
「花色是否须与主A相同」在两份里不一致 —— 仓库 §4.4 写明「任意花色都可以」，
Workshop 版只写「持有同花色两张A」，实现方照着不够全的那份写 →
用户实测报「我有双大A，提示我没有反A资格」。**已改为仓库=来源 + 自动同步。**

---

## 6. 未闭环（非 Bug）

- **像素级真机表现** —— `test-ui-touch-contract` 只锁逻辑契约
- **1V4 明打/暗打的真机人工对局** —— 压测覆盖逻辑；用户已在 IDE 人工验过 1V4 明暗打
- **`senior-dev-standard` 未进 Workshop** —— 其中「变异测试是硬证据」「审查看调用点」等规约
  目前只在仓库文档里，agent 默认加载不到
- **仓库规则副本与 Workshop 副本的分叉** —— 见 §5

---

## 7. Git

```
main    f5f252c  feat!: v0.11.0 4 条新要求
tag     v0.10.0 -> 6b958b1      v0.9.0 -> e115ac3
```

回退：`git reset --hard v0.9.0`（界面重构前）/ `v0.10.0`（v0.11.0 之前）。

---

## <!-- 2026-10-30-batch --> 状态刷新（2026-10-30 21:00 (Asia/Shanghai)）

- **版本**：v0.32.0（真机验收修 UI + 引擎候选枚举修复）
- **测试**：67 个套件；本批相关 16 个全绿；全量回归待跑。
- **git**：已推；工作区干净。
- **本批核心**：引擎侧只有 1 处真 bug（combos.js 候选枚举把同点数多张牌塞进一段 → 连张/双王漏枚举）；其余全是 UI 层。
- **下一步**：① 跑一次全量回归；② 真机验收（花色按钮+5秒倒计时、提示条居中、空选弹出牌、结算几何与积分文案、左右边距、双大A角标方向）。

