# 项目背景与约束（PROJECT_CONTEXT）

> 用途：给第一次接触本项目的人/Agent 一份「为什么做、做成什么样、不能碰什么」的说明。
> 实现细节见 `ARCHITECTURE.md`；决策依据见 `DECISIONS.md`；当前进度见 `PROJECT_STATUS.md`。

---

## 1. 项目是什么

「内蒙古打大A」是一款**微信小游戏**，属于内蒙古/晋陕一带流行的扑克玩法。

- 5 人局（甲、乙、丙、丁、戊），逆时针出牌。
- **两副牌 108 张**，每人 22/22/22/21/21 张，最后一张为**底牌**。
- 先亮 A 定「主 A」，再由主 A 花色与持有者关系分成 **1V4（独打）** 或 **2V3** 两种模式；也支持**反 A** 重新夺权。
- 核心机制：主/次/反 A、明打/暗打、4 取牌、推风、大贡/二贡出完顺序、按模式计分。

完整规则见 `skills/da-a-game-rules/SKILL.md`（唯一权威）。

## 2. 产品定位

- **主要玩法是真人对真人**；AI 的存在主要是**补位**与**验证规则实现**，不追求拟人博弈强度（D-006）。
- 因此 AI 的决策口径是「出得合法、不浪费重手、不拆关键组」，而不是「打得像高手」。
- 现阶段的验收目标是：**规则正确、流程完整、不崩、可复盘**，不是排行榜/匹配/运营功能。

## 3. 技术形态（硬约束）

| 项 | 约束 |
|---|---|
| 运行形态 | 原生微信小游戏，开发者工具直接加载，**无构建、无打包** |
| 语言 | 原生 JavaScript，**CommonJS**（`require`/`module.exports`），不转 ESM |
| 渲染 | Canvas 2D 自绘（`wx.createCanvas` + `getContext('2d')`），无 UI 框架 |
| 平台 API | 微信小游戏 `wx.*`：`createCanvas` / `getSystemInfoSync` / `onTouchStart` / `onWindowResize` |
| 基础库 | 2.19.4（`project.config.json`；`project.private.config.json` 里另有 3.17.6，见 PROJECT_STATUS 已知问题） |
| 屏幕 | 横屏，`game.json` 固定 `landscape` |
| 依赖 | **零 npm 依赖**，不引入构建工具 / 框架 / TypeScript |
| 行尾 | **LF**；UTF-8 |

### 明确不做

- 不迁移 Cocos Creator 或其他引擎；不重建项目；不换目录结构/模块划分。
- 不引入 npm、webpack/vite、TS、React/Vue 等。
- 不做联网对战、账号体系、排行榜、支付/广告（如需，先立项评估）。
- 不为了「看起来更现代」而重写渲染层或状态机。

## 4. 目录约定

```
AGame/                      Git 仓库根
├─ AGENTS.md                Agent 入口（本仓库工作纪律）
├─ tools/wechat-cli.ps1     微信开发者工具 CLI 包装（编码安全）
└─ da-a-game/               游戏根 = minigameRoot
   ├─ game.js               界面/驱动/定时器（唯一真实运行时状态）
   ├─ ui-render.js          纯几何绘制
   ├─ src/                  规则引擎（纯逻辑，不依赖 wx.*）
   ├─ tests/                无头回归套件
   ├─ scripts/              preflight / commit-gate / AI 口径机检
   ├─ skills/               规则与开发纪律
   ├─ tools/                离线审计/压测工具（不进包）
   └─ docs/                 本组文档（不进包）
```

`project.config.json` 的 `packOptions.ignore` 已排除 `scripts/tests/docs/skills/tools`；`tests/test-pack-manifest.js` 锁定最终入包文件集合。

## 5. 用户优先级与协作方式

用户最关心（按顺序）：

1. **稳定**：不崩、不卡死、状态不串。
2. **代码质量 / 长期可维护**：结构清晰、单一来源、测试锁得住。
3. **功能推进**：不作为第一目标。

协作约定：

- 日常读码、分析、计划、跑测试、修普通 bug：可自主进行。
- **规则变更、核心架构改变、破坏性操作、重要设计取舍**：必须先说明原因与影响，由用户决定。
- Git 由用户管理：不 push、不 reset、不 clean；提交前先确认工作区。
- 审计/接手初期默认**只读**；确认接手后才动代码。

## 6. 术语

| 术语 | 含义 |
|---|---|
| 主 A | 第一个有效亮出的 A 的花色；该花色的 A 为「大 A」 |
| 次 A / 次方 | 2V3 中与主 A 同花色的另一张 A 的持有者（主 A 的队友） |
| 反 A | 持有同花色两张 A（且非主 A 花色）者夺取主 A 身份，独打明打 |
| 大 A | 主 A 花色的 A；单张牌力最高，双大 A 无敌 |
| 1V4 | 两张同花色 A 在同一人手里：独打者 vs 其余四人 |
| 2V3 | 两张同花色 A 分属两人：主 A + 次方 vs 其余三人 |
| 明打 / 暗打 | 次方身份是否公开；影响倍率与 AI 敌友判断 |
| 底牌 | 每人最后一张牌组成的第 5 张底牌，亮 A/反 A 阶段不可见 |
| 取牌 | 用 4 取走桌面目标牌（目标 3-8 张，4 数 = 目标数 - 1） |
| 推风 | 一轮结束、最后出完者出完时，把出牌权推给下一位 |
| 大贡/二贡/三贡/四贡 | 按出完先后记录的出完顺序（不显示「头名」字样） |
| 托管 | 顶栏机器人：本局由 AI 代打，不跨局 |

## 7. 文档体系

| 文档 | 回答的问题 |
|---|---|
| `AGENTS.md` | 怎么在这个仓库里工作 |
| `PROJECT_CONTEXT.md`（本文） | 为什么做、约束是什么、术语 |
| `ARCHITECTURE.md` | 代码怎么组织、状态怎么流动 |
| `DECISIONS.md` | 哪些口径已经拍板、为什么 |
| `PROJECT_STATUS.md` | 现在做到哪、测了什么、还剩什么 |
| `docs/ai/AI_POLICY.md` | AI 具体怎么决策 |
| `skills/da-a-game-rules/SKILL.md` | 游戏规则本身 |

历史迁移资料 `docs/history/OPENCLAW_HANDOFF.md` 只记录「从 OpenClaw 迁过来时是什么样」，**不是现行规范**；其中的路径与工具命令多数已失效。
