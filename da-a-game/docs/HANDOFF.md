# 交接文档（HANDOFF）

**最后更新**：2026-10-24 01:20 (Asia/Shanghai) · 版本 **v0.10.0**
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

## 5. ⚠️ 规则手册有两份副本，已经分叉

| 副本 | 位置 | 章节结构 |
|---|---|---|
| **Workshop**（**被 agent 加载的那份**） | `~/.openclaw/agents/work/agent/workshop-skills/dada-a-game-rules/` | §1 游戏概览 … §11 规则空白处理流程 |
| 仓库副本（**更全**，但未被加载） | `da-a-game/skills/da-a-game-rules/` | §1 核心职责 … §15 汇报，含 §3 阶段状态机 / §12 AI行动与信息边界 / §13 必测用例 / §14 完成标准 |

两者**不是同一份文件的两个副本，而是两套编号、两套措辞**。改规则前**先确认看的是哪一份**。

---

## 6. 当前状态（2026-10-24 01:20）

- 版本 **v0.10.0**，55 个套件全绿
- 需求二~十三全部落地，**已由用户在微信开发者工具真机确认**
- 未修 Bug：**0**
- 未闭环：像素级真机表现、`senior-dev-standard` 未进 Workshop（见 `docs/VERSION.md` 遗留清单）

---

## 7. 相关文档

- `docs/VERSION.md` — **入口**，最准
- `docs/KNOWN_ISSUES.md` — 未修问题 + 已修 P0 的现象/根因/修法/回归点
- `docs/PROJECT_STATUS.md` — 项目状态快照
- `docs/PROGRESS.md` — 时间线
- `docs/TEST_REPORT.md` — 测试统计与套件清单
