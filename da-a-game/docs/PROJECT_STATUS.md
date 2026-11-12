# 项目状态（PROJECT_STATUS）

> **每次任务结束都更新本文件。** 新会话先读这里，再看 `PROJECT_CONTEXT.md` / `ARCHITECTURE.md`。
> 最后更新：2026-11-12（Asia/Shanghai）

---

## 1. 快照

| 项 | 值 |
|---|---|
| 分支 | `main` |
| HEAD | 本轮 `D-061/D-062` 提交（`git log -1`；上一提交 `d26b814 feat(engine): 轮次推进收归引擎（D-061）`） |
| 与远端 | 本地领先 2 个提交，待本轮结束 push（策略：每任务推一次，失败即停） |
| 工作区 | 干净 |
| 技术栈 | 原生微信小游戏，CommonJS + `wx.*` + Canvas，无构建、无 npm 依赖 |
| 基础库 | 3.17.6（`project.config.json` 与本地 `project.private.config.json` 已统一；真机最低版本由 MP 后台决定） |
| 微信开发者工具 | 已登录，CLI 可用；`da-a-game` 项目已打开并能进 PLAY（2026-11-12 截图） |

## 2. 测试与体检

| 检查 | 命令 | 结果（2026-11-12） |
|---|---|---|
| 全量回归 | `node tests/_runall.js` | **97 个套件 / 执行 97 次 / 失败 0 次** |
| 静态体检 | `node scripts/preflight.js --fast` | **12/12 通过** |
| 完整体检 | `node scripts/preflight.js` | **14/14 通过**（含 97/97 套件 + AI 口径机检） |
| 规则↔实现对账 | `node skills/audit-rules-vs-impl/scripts/audit.js` | 4/4（历史值；本次未重跑） |

> `node tests/_runall.js` 退出码可能为 1：runner 把进度写 stderr，PowerShell 包成 `NativeCommandError`。**看最后一行「失败 N 次」，不要看 exit code。**

## 3. 已完成能力

- **发牌**：108 张、22/22/22/21/21、每人最后一张进底牌槽；逐轮发牌（`DEALING`）。
- **亮A / 强制排查 / 反A**：主A 花色、双 A 判定、反A 夺权、首出权。
- **底牌揭示**：1V4 / 2V3 判定、次方身份选择（明/暗打）。
- **牌型**：17 种识别、比较、压制（含单大A/单王/双王/双龙特判）。
- **4 取牌**：目标 3-8 张、4 数 = 目标-1、取走大A 失身份。
- **出牌 / 过牌 / 轮末 / 推风**：`lastPlayer`、`passedPlayers`、`passCount`、清桌与推风。
- **胜负 / 计分**：1V4 明/暗、2V3 明/暗、平局；零和。
- **AI**：起手选链、压制、取牌、阵营推定、拆组过滤；与「提示」共用同一决策链。
- **UI**：Canvas 绘制、5 座、手牌交互、按钮、记牌器、观察者视角、托管、结算面板。
- **测试**：97 个无头套件（规则/AI/UI/E2E/审计）。

## 4. 本轮变更（2026-11-12，D-059～D-063）

### 代码

| 文件 | 变更 |
|---|---|
| `da-a-game/game.js` | **P0**：删除 `_autoPlayDoPlay` 里无条件的 `lastEmptiedPlayer = null;`，托管出完牌不再丢推风；新增 `__lastEmptiedPlayer()` 钩子。**P2**：删除 `doPlay` 中约 80 行不可达的「逐张回退 + 组合回退」死代码（行为不变，未选牌仍只提示）。**D-059**：新增 `_setTurn()` 镜像引擎轮次。**D-061**：`advanceCurrentPlayer()` 改为镜像 `gameState.currentPlayer` + 按「被跳过的空手玩家」清 UI，不再自己推座位（保留外部直接调用的兜底扫描）。 |
| `da-a-game/src/combos.js` | **P1**：对 A 池按 **card 对象**统一排序（普通 A 在前、主方大A 在后），高端 QKAA 与低端 A23 同时生效；删除对 card id 字符串的无效排序与重复 `var _groupsA`。 |
| `da-a-game/src/play.js` | **P2**：`isRoundOver` 改为与 `handlePass` 同口径（已出完者不计入「还需过牌」人数）；**D-059**：`handlePlay`/`handlePass` 增加轮次校验（`state.currentPlayer` 非空时必须匹配，否则 `NOT_YOUR_TURN`）。 |
| `da-a-game/src/turn.js` | **新增（D-061）**：`nextAliveId` / `advanceAfterPlay` / `advanceAfterPass`，引擎侧的轮次推进（跳过已出完；清桌后 `lastPlayer` 领出）。 |
| `da-a-game/src/transition.js` | **D-059**：`newGameState()` 与 `STATE_DEFAULTS` 增加 `currentPlayer: null`。**D-061**：`handlePlayAction` / `handlePassAction` 成功后调用 `turn.advanceAfterPlay/Pass` 写入下一行动者。 |
| `da-a-game/project.config.json` | **D-060**：`libVersion` 2.19.4 → 3.17.6（与本地 `project.private.config.json` 统一）。 |
| `da-a-game/tests/test-play.js` | 更新 2 个 `isRoundOver` 用例（补足手牌、新增「已出完不计数」）。 |
| `da-a-game/tests/test-autoplay-pushwind.js` | **新增**（7 断言）：托管出完最后一手 → `lastEmptiedPlayer` 保留 → 轮末推风成功。 |
| `da-a-game/tests/test-combos-qkaa.js` | **新增**（7 断言）：QKAA/A23 优先普通 A，只有大A 时仍能组龙。 |
| `da-a-game/tests/test-turn-ownership.js` | **新增（12 断言）**：越序拒绝、未设轮次兼容、game.js 镜像、引擎推进（含跳空手 / 清桌后 lastPlayer 领出 / lastPlayer 已出完顺延）。 |
| `da-a-game/tests/test-pack-manifest.js` | 入包清单增加 `src/turn.js`（现 23 个文件）。 |
| `da-a-game/scripts/preflight.js` | **D-063**：第 8 项不再读 `~/.openclaw/openclaw.json`，改为检查 `skills/*/SKILL.md` 存在、frontmatter 含 `name`/`description` 且 `name` 与目录名一致；已用临时坏技能变异验证（缺 SKILL.md / 缺 description 都会 FAIL）。 |
| `da-a-game/game.js`（文案） | 推风日志不再写死「同阵营=…」，改为输出触发者阵营 + 依据（§9.3 同阵营 / §9.4 顺时针非主A）。 |
| `da-a-game/game.js`（测试钩子） | `__setState` 注入局面时重置 `uiTakenPlay`/`uiCaptureScanned` 并重扫 CAPTURE 流水；修复 `test-ui-observer-camp` §3.5 约 1/4 概率随机失败（初始化随机局的扫描游标污染注入局面）。10 次连跑 0 失败。 |
| `da-a-game/src/phases.js` | 清理顶部过时注释（原文称「只实现到 LIANG_A_RESOLVED」，实际全部阶段已实现）。 |

### 文档与 skills

- 新增 `AGENTS.md`（仓库根）、`docs/PROJECT_CONTEXT.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/PROJECT_STATUS.md`（本文件）。
- `docs/history/OPENCLAW_HANDOFF.md` 保留，但已标注为历史资料（见文件头）。
- **D-062**：`git-safe-workflow`、`windows-cn-batch-encoding` 合并进 `senior-dev-standard`（重写为开发工作流总纲），删除原目录；skills 由 5 份精简为 3 份。`da-a-game-rules/SKILL.md` 重排（术语速查、去重），章节号与 §13 用例不变。

## 5. 冒烟记录（开发者工具）

- `tools/wechat-cli.ps1 islogin` → `{"login":true}`。
- `tools/wechat-cli.ps1 open --project ...\da-a-game` → `√ open`，IDE server `http://127.0.0.1:41957`。
- 窗口截图（`PrintWindow`）确认：控制台无红色报错；发牌 → 亮A → 强制排查 → 翻底牌 → 次方身份 → PLAY 全流程日志正常；界面显示 5 座、手牌、按钮、记牌器；模式 `2V3_暗打`、主方 2 人、抓方 3 人。
- **2026-11-12 完整一局（D-061 之后，托管自动跑）**：主方胜（`reason=2V3_主方全空 头名在主方`）；结算页 甲 大贡 +2、乙 三贡 −1、丙 四贡 +1、丁 −1、戊 二贡 −1 —— **合计 0，零和**；N=1 与 §11.2 暗打公式一致（主A +2N、次A +N、各抓方 −N）。控制台无报错。
- **未做**：真机扫码；1V4 / 反A 分支的模拟器实测（规则单测已覆盖）。

## 6. 已知问题

| 级别 | 问题 | 影响 | 计划 |
|---|---|---|---|
| 高 | **真机未验证**（开发者工具已完整跑通一局 2V3 并核对结算） | 真机字体/安全区/性能/触摸命中可能与模拟器不同 | 发布前在真机各跑 1 局 2V3、1V4、反A |
| 中 | ~~轮次推进仍在 game.js~~（D-061 已解决：引擎在 `transition` 写入 `state.currentPlayer`，`game.js` 只镜像 + 清 UI） | — | 已实施；新增出牌入口必须走 `transition` |
| 中 | ~~preflight 第 8 项读 `~/.openclaw/openclaw.json`~~（D-063 已解决：改为仓库内 skills 结构检查） | — | 已实施，不再依赖外部配置 |
| 低 | 基础库版本 | 仓库内字段不等于真机实际版本 | 已统一 3.17.6；真机最低版本在 MP 后台设置并回归 |
| 低 | ~~推风日志写死「同阵营=…」~~（已改为输出触发者阵营 + §9.3/§9.4 依据） | — | 已实施 |
| 低 | UI 镜像（`uiPlays`/`uiTableIds`/`uiTakenPlay`…）手工同步 | 漏同步会画面滞后 | 长期改为从 state 派生 |
| 低 | 微信开发者工具 `open` 项目会**重写 `project.config.json`**（键顺序变化、行尾转 CRLF、末尾无换行） | 产生无关 diff，CRLF 有打包风险 | 提交前 `git diff` 检查；本次已 `git checkout -- project.config.json` 还原 |
| 低 | ~~`src/phases.js` 顶部注释过时~~（已清理） | — | 已完成 |

## 7. 待办与优先级

1. **P0**：真机验证（2V3 / 1V4 / 反A 各一局），核对结算分数与贡字顺序。
2. **P1**：~~preflight 去掉 OpenClaw 依赖；推风文案修正~~（2026-11-12 已完成，见 D-063；phases 过时注释一并清理）。
3. **P2**：UI 镜像收敛（`uiPlays`/`uiTableIds`/`uiTakenPlay` 从 state 派生）；发牌/闸门仍是 `game.js` 的驱动代码。
4. **P3**：~~其它 skills 合并精简~~（D-062 已完成：skills 精简为 3 份，规则 SKILL 已重排）。
5. **持续**：改动后更新本文件；保持 97+ 套件全绿。

## 8. 命令速查（`da-a-game/` 下）

```powershell
node tests/_runall.js             # 全量
node tests/_runall.js 10 20       # 指定范围
node tests/test-play.js           # 单套件
node scripts/preflight.js --fast  # 静态体检
node scripts/preflight.js         # 全量体检（含测试）
node skills/audit-rules-vs-impl/scripts/audit.js
node tools/ui-acceptance-check.js # 离线渲染逐项验收（如仍需要）
.\..\tools\wechat-cli.ps1 open --project "C:\AI_WorkSpace\Project\AGame\da-a-game"
```

## 9. 交接须知

- 工作区提交后应为干净；本轮改动已提交并 push（`git log -1`）。推送策略：每任务结束推一次，失败即停、下次再推。
- 新会话先读 `AGENTS.md` → 本文件 → 涉及规则读 SKILL 对应章节。
- 不要照抄 `docs/history/OPENCLAW_HANDOFF.md` 里的旧路径与 OpenClaw 命令。
- 每次任务结束：更新本文件的「快照 / 测试结果 / 已知问题 / 待办」。
