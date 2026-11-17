# AGENTS.md · 内蒙古打大A（AGame）

> 仓库级 Agent 入口。**先读本文件，再读 `da-a-game/docs/PROJECT_STATUS.md` 拿当前状态。**
> 本文件只管「怎么在这个仓库里工作」；游戏规则一律以 `da-a-game/skills/da-a-game-rules/SKILL.md` 为准。

---

## 0. 一句话

原生**微信小游戏**「内蒙古打大A」：5 人局、两副牌 108 张、2V3 / 1V4、亮A/反A/取牌/推风/计分。
无构建、无 npm 依赖，微信开发者工具直接加载 `game.js` + `src/`。

## 1. 路径

| 项 | 路径 |
|---|---|
| Git 仓库根 | `C:\AI_WorkSpace\Project\AGame`（`.git` 在这里） |
| 游戏根（minigameRoot） | `C:\AI_WorkSpace\Project\AGame\da-a-game` |
| 规则唯一来源 | `da-a-game/skills/da-a-game-rules/SKILL.md` |
| 当前状态 / 待办 | `da-a-game/docs/PROJECT_STATUS.md` |
| 架构说明 | `da-a-game/docs/ARCHITECTURE.md` |
| 决策台账 | `da-a-game/docs/DECISIONS.md` |
| AI 口径 | `da-a-game/docs/ai/AI_POLICY.md` |
| 历史迁移资料（只读） | `da-a-game/docs/history/OPENCLAW_HANDOFF.md` |

`docs/`、`tests/`、`skills/`、`scripts/`、`tools/` 都被 `project.config.json` 的 `packOptions.ignore` 排除，不会打进小游戏包。

## 2. 权威顺序

1. **规则**：`skills/da-a-game-rules/SKILL.md`（15 章，含牌型库、亮A/反A、4 取牌、推风、胜负、计分、必测用例）。
2. **已确认的口径与取舍**：`docs/DECISIONS.md`（D-xxx）。
3. **AI 行为**：`docs/ai/AI_POLICY.md` + `src/ai-policy.js`（机检同源，`scripts/check-ai-policy-doc.js`）。
4. **实现现状**：`src/`、`game.js`、`tests/`。

规则文档与代码冲突时：**不要自行判定谁错**，先记录差异、影响、证据，交用户确认。规则没写的行为不许自行裁定。

## 3. 技术栈与红线

- 技术栈：原生 JavaScript（CommonJS，**不打包、不转 ESM**）+ 微信小游戏 `wx.*` + Canvas 2D 自绘。基础库 **3.17.6**，横屏，appid `wx99808147273cdea1`。
- **不迁 Cocos / 其他引擎**；**不重建项目**；**不换目录结构与模块划分**；**不引入构建工具、框架、TypeScript、npm 依赖**。
- **行尾必须 LF**，文件 UTF-8。写成 CRLF 会让微信打包器报 `WAGame.js:1 SyntaxError`（`node --check` 查不出来）。`.gitattributes` 已强制 `* text=auto eol=lf`。
- `src/` **不得依赖 `wx.*`**；`game.js` 不实现规则，只调用引擎；`ui-render.js` 只做几何与绘制。
- 规则改动只认 SKILL 一个来源，代码里不得私设规则。

## 4. 环境

- Windows 10/11 + PowerShell 7（`pwsh`）。Node `v26.x`，无 npm 依赖，**不要 `npm install`**。
- 微信开发者工具：`C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`
  命令行请用 `tools/wechat-cli.ps1` 包一层（直接管道会因编码把中文/符号读成乱码）：
  ```powershell
  .\tools\wechat-cli.ps1 islogin
  .\tools\wechat-cli.ps1 open --project "C:\AI_WorkSpace\Project\AGame\da-a-game"
  ```
- 读文件用 UTF-8。PowerShell 的 `Get-Content` 会把无 BOM 的 UTF-8 当 GBK 读（行数偏少、中文乱码）；需要行数用 `[IO.File]::ReadAllLines`。

## 5. 常用命令（都在 `da-a-game/` 下执行）

```powershell
node tests/_runall.js            # 全量套件（当前 131 个，失败 0）
node tests/_runall.js 10 20      # 只跑第 10~20 个
node tests/test-xxx.js           # 单套件
node scripts/preflight.js --fast # 12 项静态体检（不含全量测试）
node scripts/preflight.js        # 14 项（含全量测试 + AI 口径机检）
node tools/sync-engine.js        # 改过 src/ 后：同步云函数引擎副本（--check 只校验）
node tools/stress-games.js 50    # 随机整局压测（纯 node，50 局）
node tools/gen-audio.js          # 重新生成占位音效/BGM（assets/audio/*.wav）
node skills/audit-rules-vs-impl/scripts/audit.js   # 规则↔实现三向对账（只读）
```

判成败看**退出码**。`node tests/_runall.js` 会把进度写 stderr，PowerShell 会包成 `NativeCommandError` 并给出 `[exit code: 1]`，**这不是测试失败**；看最后一行的「失败 N 次」。

## 6. 开工流程

1. `git status` + `git log --oneline -5`，确认工作区与 HEAD。
2. 读 `da-a-game/docs/PROJECT_STATUS.md`（当前进度、已知问题、待办）。
3. 涉及规则：读 SKILL 对应章节原文，不要凭记忆。
4. 涉及结构：读 `docs/ARCHITECTURE.md` 的模块职责与状态机说明。
5. 改代码前先读目标文件与相邻测试；改完跑受影响套件 → 再跑全量。

## 7. 修改纪律

- **最小改动**。不做顺手重构、不改无关格式、不重命名公共接口。
- 新行为/修 bug **先补测试**；断言只锁**性质**（合法/不合法、状态不变、不崩），不写死「必须出某张牌」。
- 测试禁用固定 `setTimeout` 等待产品计时器（D-008）；用 `__setAiDelay` / `__enterPlay` / `__setAutoPlay` / `__autoPlayStep` / `__setDealStep` 等钩子。
- 无头测试必须用**确定局面**（`tests/lib/state-builder.js`），否则 AI 抢跑导致 flaky。
- 修 bug 建议做变异验证：临时退回旧实现 → 断言必须精确失败 → 恢复。
- 改动规则、核心架构、数据结构、计分口径 → **先说明原因与影响，由用户决定**。
- 不装插件、不改 DSH 配置、不动依赖锁文件。

## 8. 验证门槛

提交前至少满足：

- `node tests/_runall.js` → `失败 0 次`（当前 **131 个套件**）。
- `node scripts/preflight.js --fast` → 12/12。
- 触及 UI / 流程：用开发者工具 `open` 后截图确认能进 PLAY、无运行时报错（见 `PROJECT_STATUS.md` 冒烟记录）。
- 触及规则：跑 `audit-rules-vs-impl`。

## 9. Git

- 仓库根是 `AGame/`；在 `AGame` 或 `AGame/da-a-game` 里执行 git 都能找到 `.git`。
- **push 由用户授权、每任务结束推一次**：任务收尾提交后执行一次 `git push`；无论成功失败都只尝试一次——失败就停下、记录报错，留到下次需要 push 时一并推，不反复重试、不改远端配置。
- `reset --hard` / `clean -fd` / 切分支前必须先看工作区。
- 提交信息用 `git commit -F <file>`（不要 `-m`，失败会被下一条命令掩盖）；提交后核对 `git log --oneline -1`。
- 一个提交一个主题；不要在同一个提交里混代码、文档、无关格式。

## 10. 文档地图

| 文档 | 职责 |
|---|---|
| `AGENTS.md`（本文件） | Agent 入口：路径、红线、命令、纪律 |
| `docs/PROJECT_CONTEXT.md` | 项目背景、产品定位、硬约束、术语 |
| `docs/ARCHITECTURE.md` | 实际架构：模块、数据结构、状态机、流程、技术债 |
| `docs/DECISIONS.md` | 已确认的产品/机制决定（编号只增不复用） |
| `docs/PROJECT_STATUS.md` | 当前状态、测试结果、已知问题、待办 |
| `docs/ai/AI_POLICY.md` | AI 决策口径（排序键、阵营、取牌限制） |
| `skills/da-a-game-rules/SKILL.md` | 游戏规则唯一来源 |
| `docs/history/OPENCLAW_HANDOFF.md` | 历史迁移资料，**不是现行规范** |
| `docs/plans/ONLINE_ROOM.md` | 好友建房对战方案（联网实施依据） |

### 文档更新节奏

- `docs/DECISIONS.md`：**随决策更新**。规则、口径、架构取舍一变就追加一条（编号只增不复用）；只改实现不改口径的，不新增。
- `docs/PROJECT_STATUS.md`：**里程碑 / 交接前更新**。记录当前 HEAD、测试数、已完成能力、已知问题、待办；不必每个小改动都改，日常变更靠 commit message。
- `AGENTS.md` / `docs/ARCHITECTURE.md`：工作方式或结构真的变了才同步（新增红线、命令、模块、状态机契约）。
- `skills/da-a-game-rules/SKILL.md`：规则唯一来源，非规则变更不要动。

## 11. 当前状态（摘要，详见 PROJECT_STATUS.md）

- 规则引擎、UI、AI、托管、结算已可完整跑通；全量 **131 套件 / 0 失败**。
- 2026-11-12 已修：托管出完牌推风丢失（P0）、QKAA 优先普通 A 失效（P1）、`doPlay` 约 80 行死代码 + `isRoundOver` 口径不一致（P2）；轮次归属先由 D-059 让引擎持有并校验，再由 **D-061（方案 A）完全接管推进**（`src/turn.js` + `transition` 写入 `state.currentPlayer`，game.js 只镜像）；基础库统一为 3.17.6（D-060）；UI 镜像（`uiPlays`/`uiTakenPlay`/`uiPassed`/`uiTrickId`）改由引擎出牌流水派生（D-064）；点提示的候选枚举改为「不含大A → 双大A → 大A混出」（D-065）。
- 2026-11-13 已修：点提示拆组排序（D-066）、AI 头像「AI」标志（D-067/D-068）、拆龙权重（D-069）、1V4/反A 整局 E2E（D-070）、压测工具（D-071）、UI 派生外移 `src/ui-mirror.js`（D-072）、devtools 改写配置自动还原（D-073）、拆龙只统计单张（D-074）。**跟牌分层以 D-076 为准**：同型不拆 → 同型拆 1 组 → 蛋子+ → 拆龙 → 拆对子；拆 ≥2 组硬禁。D-075 已被 D-076 修正。
- 2026-11-15 已做：音效与背景音乐（D-077）——11 种音效分档播放、BGM 循环、顶栏「音」「乐」两个独立开关并持久化；素材为 `assets/audio/` 占位 WAV，可用同名文件替换；首次触摸解锁播放（微信自动播放限制）。
- 2026-11-16 已做（联网 P0/P1）：`feature/online-room` 分支；P0 前置（`src/version.js`、`src/timing.js`、`src/protocol.js`、`tools/sync-engine.js` + 引擎 hash、`tests/lib/fake-cloud.js`、`docs/plans/ONLINE_ROOM.md`）；P1 服务端房间核心 `cloudfunctions/game-server/room.js`（创建/加入/准备/自动开局/动作校验/结算累计/轮询裁剪/超时托管/断线 AI 接管）与入口 `index.js`（rooms 集合）；P2 客户端房间控制器 `src/online.js`（轮询、seq 自动修正、离线标记）与首页/创建/加入三页面 + 单机入口（真实 wx 默认 HOME，无头测试默认 GAME）。
- 2026-11-16 已做：左上角 ☰ 菜单（音乐/音效/退出，D-087）；提示兜底穷举 + 取牌崩溃修复（D-086）；`P1` 流程层 `src/flow.js`（闸门表 D-088、发牌推进 D-089）；`P3` 战绩记录 `src/record.js` + 云函数 `record-game`（D-090）。
- 开发者工具可 `open` 并进入 PLAY（2026-11-12 截图冒烟通过）；真机已由用户跑过 2V3 与 1V4/反A，正常。
- 未完成：文档后续维护。

## 12. 与 OpenClaw 历史的关系

本项目最早在 OpenClaw 工作区开发，2026-11 迁移到 DSH。`docs/history/OPENCLAW_HANDOFF.md`、旧 `MEMORY.md`/`AGENTS.md` 只作历史参考：

- 其中的绝对路径、`tools/probe.js`、`resume.js`、`openclaw config`、Gateway 重启等**均已失效**。
- 新会话以本文件 + `docs/` 为准，不要照抄历史文档里的 OpenClaw 配置。

## 13. Token 效率纪律（省 token，但不许变笨）

> 总原则：**正确性 > token**。省 token 只能省「重复劳动、无效读取、无效截图」，不能省「理解、验证、关键读取」。任何为了省 token 而跳过下面「必须做」清单的行为，都算违反本文件。

### 13.1 可以省（默认这样做）

- **先定位再读**：用 grep/glob 找到位置后只读相关 40–80 行，不整文件读大文件（如 `game.js` 2700+ 行）。
- **批量执行**：一条命令里完成「改 → `node --check` → 跑受影响套件」，减少来回轮次。
- **分级测试**：改完先跑受影响的 1–3 个套件；收尾再跑全量 `node tests/_runall.js`。
- **检查优先于人眼**：能用单测、`preflight`、`node --check` 覆盖的，就不开开发者工具截图。
- **截图预算**：默认 0 张；确需看图才能确认的关键节点最多 1–2 张；需要更多截图先向用户申请。
- **决策落盘**：把长期约定写进 `DECISIONS.md` / `PROJECT_STATUS.md` / 本文件，减少重复解释；换模型或换机时靠文档冷启动。
- **不重复读同一文件**：同一会话内已读过的内容靠记忆与摘要，必要时用 grep 复核关键行号。

### 13.2 必须做（不许为省 token 跳过）

- 改规则相关代码前，**读 `skills/da-a-game-rules/SKILL.md` 对应章节原文**。
- 改任何文件前，**读目标文件的相关段落**；不凭记忆改代码。
- 改完**跑受影响套件**；收尾**跑全量**（当前 131 套件）与 `preflight --fast`。
- 用户明确要求的验收点（画面/交互/真机）**必须验证**，不能用「应该没问题」代替。
- 不确定时**宁可多花 token 确认**：读原文、跑测试、问用户，都不算浪费。
- 视觉类改动：至少自己核对坐标/命中区/文字是否越界（单测断言或 1 张截图）。

### 13.3 异常信号（出现即停，回到完整流程）

- 测试结果与预期不符却想「先跳过」；
- 只看了摘要就下结论；
- 连续两次改同一处仍失败；
- 用户反馈「和上次说的不一致」。

出现以上情况：停止省 token 模式，完整读相关代码/规则，重新验证后再继续。