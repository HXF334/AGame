# 项目状态（PROJECT_STATUS）

> **每次任务结束都更新本文件。** 新会话先读这里，再看 `PROJECT_CONTEXT.md` / `ARCHITECTURE.md`。
> 最后更新：2026-11-12（Asia/Shanghai）

---

## 1. 快照

| 项 | 值 |
|---|---|
| 分支 | `main` |
| HEAD | 本轮 `D-059/D-060` 提交（`git log -1`；上一提交 `091bae1 docs: 重组接手文档`） |
| 与远端 | `ahead 8`（远端 `https://github.com/HXF334/AGame.git`），**未 push** |
| 工作区 | 干净（本轮改动已提交） |
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

## 4. 本轮变更（2026-11-12，D-059/D-060）

### 代码

| 文件 | 变更 |
|---|---|
| `da-a-game/game.js` | **P0**：删除 `_autoPlayDoPlay` 里无条件的 `lastEmptiedPlayer = null;`，托管出完牌不再丢推风；新增 `__lastEmptiedPlayer()` 钩子。**P2**：删除 `doPlay` 中约 80 行不可达的「逐张回退 + 组合回退」死代码（行为不变，未选牌仍只提示）。 |
| `da-a-game/src/combos.js` | **P1**：对 A 池按 **card 对象**统一排序（普通 A 在前、主方大A 在后），高端 QKAA 与低端 A23 同时生效；删除对 card id 字符串的无效排序与重复 `var _groupsA`。 |
| `da-a-game/src/play.js` | **P2**：`isRoundOver` 改为与 `handlePass` 同口径（已出完者不计入「还需过牌」人数）；**D-059**：`handlePlay`/`handlePass` 增加轮次校验（`state.currentPlayer` 非空时必须匹配，否则 `NOT_YOUR_TURN`）。 |
| `da-a-game/src/transition.js` | **D-059**：`newGameState()` 与 `STATE_DEFAULTS` 增加 `currentPlayer: null`。 |
| `da-a-game/game.js` | **P0**：删除 `_autoPlayDoPlay` 里无条件的 `lastEmptiedPlayer = null;`，托管出完牌不再丢推风；新增 `__lastEmptiedPlayer()` 钩子。**P2**：删除 `doPlay` 中约 80 行不可达的「逐张回退 + 组合回退」死代码（行为不变，未选牌仍只提示）。**D-059**：新增 `_setTurn()`，所有轮次变更（进入 PLAY、出牌/过牌推进、推风、newGame、测试注入）同时写模块变量与 `gameState.currentPlayer`。 |
| `da-a-game/project.config.json` | **D-060**：`libVersion` 2.19.4 → 3.17.6（与本地 `project.private.config.json` 统一）。 |
| `da-a-game/tests/test-play.js` | 更新 2 个 `isRoundOver` 用例（补足手牌、新增「已出完不计数」）。 |
| `da-a-game/tests/test-autoplay-pushwind.js` | **新增**（7 断言）：托管出完最后一手 → `lastEmptiedPlayer` 保留 → 轮末推风成功。 |
| `da-a-game/tests/test-combos-qkaa.js` | **新增**（7 断言）：QKAA/A23 优先普通 A，只有大A 时仍能组龙。 |
| `da-a-game/tests/test-turn-ownership.js` | **新增**（7 断言）：引擎拒绝越序出/过、未设轮次时兼容、game.js 轮次镜像一致。 |

### 文档

- 新增 `AGENTS.md`（仓库根）、`docs/PROJECT_CONTEXT.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/PROJECT_STATUS.md`（本文件）。
- `docs/history/OPENCLAW_HANDOFF.md` 保留，但已标注为历史资料（见文件头）。

## 5. 冒烟记录（开发者工具）

- `tools/wechat-cli.ps1 islogin` → `{"login":true}`。
- `tools/wechat-cli.ps1 open --project ...\da-a-game` → `√ open`，IDE server `http://127.0.0.1:41957`。
- 窗口截图（`PrintWindow`）确认：控制台无红色报错；发牌 → 亮A → 强制排查 → 翻底牌 → 次方身份 → PLAY 全流程日志正常；界面显示 5 座、手牌、按钮、记牌器；模式 `2V3_暗打`、主方 2 人、抓方 3 人。
- **未做**：真机扫码验证、完整打完一局并核对结算分数、1V4/反A 分支的模拟器实测。

## 6. 已知问题

| 级别 | 问题 | 影响 | 计划 |
|---|---|---|---|
| 高 | **真机未验证**（仅模拟器冒烟） | 真机字体/安全区/性能/触摸命中可能与模拟器不同 | 发布前至少各跑 1 局 2V3、1V4、反A |
| 中 | **轮次推进仍在 game.js**（引擎已持有并校验 `state.currentPlayer`，D-059） | 引擎能拒绝越序，但不能自行推进/回放 | 方案 A（推进收进 transition）待评估，见 D-059/ARCHITECTURE §13 |
| 中 | preflight 第 8 项读 `~/.openclaw/openclaw.json` | 换机/删 OpenClaw 配置后该项会红 | 改 DSH 检查或删除（待确认） |
| 低 | 基础库版本 | 仓库内字段不等于真机实际版本 | 已统一 3.17.6；真机最低版本在 MP 后台设置并回归 |
| 低 | 推风日志写死「同阵营=…」 | 次方未公开、实际推给抓方时文案误导 | 文案改为按实际阵营输出 |
| 低 | UI 镜像（`uiPlays`/`uiTableIds`/`uiTakenPlay`…）手工同步 | 漏同步会画面滞后 | 长期改为从 state 派生 |
| 低 | 微信开发者工具 `open` 项目会**重写 `project.config.json`**（键顺序变化、行尾转 CRLF、末尾无换行） | 产生无关 diff，CRLF 有打包风险 | 提交前 `git diff` 检查；本次已 `git checkout -- project.config.json` 还原 |
| 低 | `src/phases.js` 顶部注释称「只实现到 LIANG_A_RESOLVED」 | 过时，误导 | 可顺手清理 |

## 7. 待办与优先级

1. **P0**：真机验证（2V3 / 1V4 / 反A 各一局），核对结算分数与贡字顺序。
2. **P1**：preflight 去掉 OpenClaw 依赖；推风文案修正。
3. **P2**：推进完全收归引擎（方案 A，见 D-059/`ARCHITECTURE.md` §13）；UI 镜像收敛。
4. **P3**：其它 skills 合并精简（`da-a-game-rules` 保持独立）。
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

- 工作区提交后应为干净；本轮改动已提交（`git log -1`）。提交/推送由用户决定（不 push，除非明确授权）。
- 新会话先读 `AGENTS.md` → 本文件 → 涉及规则读 SKILL 对应章节。
- 不要照抄 `docs/history/OPENCLAW_HANDOFF.md` 里的旧路径与 OpenClaw 命令。
- 每次任务结束：更新本文件的「快照 / 测试结果 / 已知问题 / 待办」。
