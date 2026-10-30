# 交接文档（HANDOFF）

**最后更新**：2026-10-30 21:00 (Asia/Shanghai) · 版本 **v0.32.0**
**目标读者**：未来接手本项目的开发者 / AI 协作会话
**项目路径**：`C:\Users\MyFirstAI\.openclaw\workspace-work\AGame\da-a-game\`

> **入口文档是 `docs/VERSION.md`**（当前最准：启动/测试/构建/本版新增/修掉的 Bug/遗留）。
> 本文件只讲「怎么接手」和「别踩哪些坑」。

---

## 1. 这是什么项目

内蒙古打大A 微信小游戏。**规则引擎与界面完全分离**：

```
src/*.js   规则引擎（CommonJS, 纯逻辑, 无 wx.* 依赖）—— 12 模块
game.js    界面与驱动（唯一有真实状态机的一层）
tests/     55 个套件, node 直接跑
```

**牌对象**：`{ suit: 'H', rank: 14, is主方大A: false }` —— 与其他项目的
`{ suit: 'hearts', value: 'A', id: 1 }` **不通用**，别照搬。

**规模**：5 人局 / 两副牌 108 张 / 4 张的取牌技能 / 单大A-单王-双大A / 1V4-2V3 明暗打 / 推风。

---

## 2. 接手前必读的 3 份 Skill

| Skill | 位置 | 什么时候看 |
|---|---|---|
| `dada-a-game-rules` | Workshop（**注意有分叉，见 §5**） | 改任何规则前。**它是唯一规则依据** |
| `dada-a-game-impl` | Workshop | 改 `src/` 引擎模块。11 个反复踩坑的模式 |
| `game-ui-engine-contract` | Workshop | 改 `game.js`。UI/引擎契约排错 + 无头测试 + 触摸映射 |

另有两份在 Workshop：`wechat-miniprogram-fix-class`（小程序错误类）、`windows-cn-batch-encoding`（中文 Windows 编码）。

**规则优先顺序**：`dada-a-game-rules`（规则） > `dada-a-game-impl`（实现约定） > `game-ui-engine-contract`（UI 契约）。
**规则与实现冲突时以规则为准**；规则没写的**不要自行裁定**（见规则手册 §11 规则空白处理流程）。

---

## 3. 启动 / 测试 / 构建

> **v0.11.0 变更（2026-10-24 晚）**
> - 真人座位**开局随机**（不再固定丁位）
> - **【下】按钮已删除** —— 各阶段自动判断能否进入下一阶段，能就直接进；
>   只有需要真人决策处（亮A / 反A / 次方身份）会停下等真人点，决策完自动续跑
> - 反A 的两张同花色A **不得与主A同花色**；亮双大A **默认 1V4暗打**


**无构建**：微信开发者工具直接加载 `game.js` + `src/`。基础库 3.17.5。
导入目录 `.../AGame/da-a-game`。

```bash
cd da-a-game

node tests/_runall.js          # 全量（55 套件）
node tests/_runall.js 3        # 3 轮
node tests/test-ui-phase-gate.js   # 单个
```

**测试纪律（2026-10-24 00:04 用户纠正，硬要求）**：

| 改动范围 | 跑什么 |
|---|---|
| 单个函数内部 | 直接覆盖它的 1~2 个套件 |
| `game.js` 流程控制 | 该流程涉及的套件（例：出牌 → `test-doplay-fallback` + `test-game-headless`）|
| `src/` 某个模块 | 该模块的套件 + 1 个端到端 |
| 一次改多条 / 改公共契约 / **大任务收尾** | **全量** |

> **一次全量 ≈ 一次大任务的收尾动作**，不是每个小改动的例行动作。
> 答不出「哪个测试会因为这个 bug 而失败」= 没测，跑全量也抓不到。

---

## 4. 接手时最容易踩的 5 个坑

### 4.1 读代码能证明逻辑自洽，证明不了规则抄对了

2026-10-24 实测：`canFanA` 把反A 的花色限定成主A的花色，而规则原文是
「**任意花色都可以；不要求与当前主A花色相同**」。

**引擎的 `handleFanA` 一直是对的，错的是新加的 UI 层资格判定** —— 而无头测试
**照抄了我抄错的判据**，全绿。

→ **判据要逐条对规则原文，不能对「看起来对」的感觉。**
→ 资格判定的回归见 `tests/test-eligibility-rules.js`。

### 4.2 无头测试没有「点」这个动作

2026-10-24 实测两个 P0 都逃过了全绿的 55 套件：

- **所有按钮都点不到** —— `uiButtonAt()` 调 `uiButtons()` **重新生成了一份对象**，
  而 `x/y/w/h` 是 draw 时写进**另一份对象**的 → `x >= undefined` 恒 false
- **phase=PLAY 但按钮全灰 + AI 不出手** —— 【下】在 PLAY 阶段消失 → 闸门最后
  一档永远到不了 → `currentPlayer` 恒为 null

→ **命中判定读的对象必须和写坐标的对象是同一份。**
→ 无头测试验不到什么，见 `game-ui-engine-contract` §5.3。

### 4.3 一个阶段状态机，两个入口

`phase` 可以在两处被推进：`runGateStage()` **内部**，或某个决策函数
（`humanChooseIdentity()`）**内部**。只在一个入口补逻辑，另一个必然漏。

→ 凡是「进入某阶段后要做的事」，抽**统一入口函数**，所有入口都调它
（本项目 `enterPlayIfNeeded()`）。

### 4.4 `game.js` 才是 bug 密集区

`src/` 15 模块 100% 有直接测试且从未出事；**三次 bug 全在 `game.js`**。
审查看**调用点**，不是模块。

### 4.5 handler 返回的 state 字段与引用同一性

成功路径必须 `Object.assign({}, state, overrides)`；**失败路径必须返回原引用**。
字段快照看不出引用问题。详见 `dada-a-game-impl` §1。

---

## 5. ⚠️ 规则手册：仓库版是唯一来源，Workshop 版是自动生成的镜像

| 角色 | 位置 | 说明 |
|---|---|---|
| **唯一权威来源** | `da-a-game/skills/da-a-game-rules/SKILL.md` | **完整版**（§1 核心职责 … §15 汇报，含 §3 每局阶段状态机 / §12 AI行动与信息边界 / §13 必测用例 / §14 开发完成标准）。**要改规则就改这里** |
| 自动生成的镜像 | `~/.openclaw/agents/work/agent/workshop-skills/dada-a-game-rules/SKILL.md` | 供 agent 加载。**由 `scripts/sync-skills.js` 生成，勿手改**（下次同步会覆盖）|

```bash
node scripts/sync-skills.js          # 同步
node scripts/sync-skills.js --check  # 只校验是否一致(退出码 1 = 不一致)
```

**为什么曾经分叉**：两份各自演化，Workshop 版少了 §3/§12-§15。直接后果：反A条款的
「花色是否须与主A相同」两份不一致（仓库 §4.4 写明「任意花色都可以」，Workshop 版只写
「持有同花色两张A」），实现方照着不够全的那份写 → 用户实测报「我有双大A，提示我没有反A资格」。
→ **判据要逐条对唯一来源，不能对「看起来对」的感觉。**

---

## 6. 当前状态（2026-10-24 01:20）

- 版本 **v0.11.0**，55 个套件全绿（v0.11.0 改了 4 条，9 个受影响套件连跑 3 次全绿）
- 需求二~十三全部落地，**已由用户在微信开发者工具真机确认**
- 未修 Bug：**0**
- 未闭环：像素级真机表现（见 `docs/VERSION.md` 遗留清单）

## 6. Skill 与仓库文档的关系

**全部 8 个 Skill 都在仓库里**，仓库是唯一来源；Workshop 里的是**自动生成的镜像**
（`node scripts/sync-skills.js` 同步，`--check` 只校验）：

| 仓库来源 | Workshop 镜像 | 内容 |
|---|---|---|
| `skills/da-a-game-rules/SKILL.md` | `dada-a-game-rules` | 完整规则手册（唯一权威）|
| `skills/senior-dev-standard/SKILL.md` | `senior-dev-standard` | 代码改动纪律 |
| `skills/dada-a-game-impl/SKILL.md` | `dada-a-game-impl` | 引擎实现 11 坑 |
| `skills/game-ui-engine-contract/SKILL.md` | `game-ui-engine-contract` | UI 契约排错 + 无头测试 |
| `skills/wechat-minigame-ui/SKILL.md` | `wechat-minigame-ui` | Canvas 小游戏界面实现 |
| `skills/git-safe-workflow/SKILL.md` | `git-safe-workflow` | Git 安全工作流 |
| `skills/wechat-miniprogram-fix-class/SKILL.md` | `wechat-miniprogram-fix-class` | 小程序错误类 |
| `skills/windows-cn-batch-encoding/SKILL.md` | `windows-cn-batch-encoding` | 中文 Windows 编码 |

> **为什么要这样**：`~/.openclaw/agents/work/agent/workshop-skills/` **不在版本控制里** ——
> 那个目录被清掉，Skill 就没了。仓库才是能版本化、能交接、能回滚的地方。
> Workshop 里的镜像**由脚本生成，不要手改**（下次同步会覆盖）。
> 改镜像的方法：**改仓库那份 → 跑 `node scripts/sync-skills.js`**。

---

## 7. 相关文档

- `docs/VERSION.md` — **入口**，最准
- `docs/KNOWN_ISSUES.md` — 未修问题 + 已修 P0 的现象/根因/修法/回归点
- `docs/PROJECT_STATUS.md` — 项目状态快照
- `docs/PROGRESS.md` — 时间线
- `docs/TEST_REPORT.md` — 测试统计与套件清单

---

## <!-- 2026-10-30-batch --> 当前状态（2026-10-30 21:00 (Asia/Shanghai)）

- **代码**：v0.32.0，git 已推（origin/main 与本地一致，工作区干净）。
- **测试**：67 个套件；本批相关的 16 个全绿；全量回归待跑。
- **规则唯一来源**：skills/da-a-game-rules/SKILL.md（改规则先改它，别在代码里私设规则）。

### 接手须知（本批踩到的坑）
1. **候选枚举必须「每个点数取一张」** —— combos.js 的连段枚举用 concat 把同点数多张牌塞进一段，枚举出的连张全含重复点数 → 引擎判 INVALID → 真能压的连张（9-10-J）和双大王从没被枚举过 → 提示/AI/doPlay 回退三条路径一起失效。修 combos.js 一处即可全线恢复。
2. **PASS 必须无条件清掉该玩家的出牌显示** —— 原来只清「非本轮」的，而轮次只在轮末递增 → 上一手牌永远清不掉 → 旧牌盖住「不出」文字。
3. **闸门阶段的自动过牌会留下「不出」标记** —— 亮A/反A/身份阶段引擎替玩家过牌，标记会带进牌局 → 进 PLAY 阶段要清一次 uiPassed。
4. **无头测试里 AI 会同步抢跑**（AI_STEP_DELAY=0）—— 断言要成立就得固定 human/局面，否则 flaky。
5. **测试必须用确定局面**（指定手牌 + 固定 human），随机手牌 + 随机 AI 会让同一份代码跑出不同结果。
6. **变异测试是硬证据**：每个修复都要「退回旧实现 → 断言精确失败 → 再恢复」。配方：定点替换 + node --check 变异文件 + finally 还原。
7. **改测试断言时写清原因**（尤其规格变更导致的期望值变化）。

