# OPENCLAW_HANDOFF · 内蒙古打大A 微信小游戏

> 面向**新会话 / 新 agent** 的接手说明。
> 最后更新：2026-11-02 18:00 (Asia/Shanghai) · 对应代码版本 **v0.34.0** · Git HEAD `8e868d1`
> 本文只覆盖「怎么接、怎么跑、不能动什么」。细节进度见 `docs/` 下 7 份文档。

---

## 1. 项目概况

| 项 | 内容 |
|---|---|
| 游戏 | 内蒙古打大A（微信小游戏），5 人局，2V3 / 1V4 模式，108 张牌（两副） |
| 形态 | 微信小游戏，**无构建**：开发者工具直接加载 `game.js` + `src/`，基础库 **3.17.5** |
| 技术栈 | 原生 JavaScript（CommonJS，**不打包、不转 ESM**）+ 微信小游戏运行时 `wx.*` + Canvas 2D 自绘 |
| 目录 | `C:\Users\MyFirstAI\.openclaw\workspace-work\AGame\da-a-game` |
| Git | 仓库根 `AGame/`，远端 `https://github.com/HXF334/AGame.git`，分支 `main` |

### 目录结构

```
game.js                      界面与驱动（唯一有真实状态机的一层）
ui-render.js                 纯几何渲染层（不含规则判断）
src/                         规则引擎 14 个模块（纯逻辑，无 wx.* 依赖）
  ai.js capture.js card.js combos.js deal.js hand-types.js index.js
  phases.js play.js push-wind.js scoring.js transition.js util.js win-loss.js
tests/                       68 个 test-*.js 套件 + mock-wx.js + lib/state-builder.js
docs/                        7 份交接文档（见 §4）
skills/                      8 个 skill 仓库副本（与 ~/.openclaw 镜像同源）
scripts/                     commit-gate.js import-skills.js preflight.js sync-skills.js
tools/                       audit-skill-tests.js stress-pushwind.js
game.json  project.config.json  project.private.config.json
```

---

## 2. 开发约束（硬约束，勿突破）

1. **不迁移 Cocos Creator** —— 保持原生小游戏 + Canvas 自绘。
2. **不重建项目** —— 不换目录结构、不换模块划分、不重写渲染层。
3. **不随意更换技术栈** —— 不引入构建工具、打包器、框架、TypeScript、npm 依赖。
4. **规则改动只认一个来源**（见 §3），代码里**不得私设规则**。
5. **规则有疑问先查 SKILL 原文**，不要靠「看起来对」的感觉补规则。
6. **测试必须用确定局面**：指定手牌 + 固定 human。无头测试里 AI 会同步抢跑
   （`AI_STEP_DELAY=0`），随机局面必然 flaky。
7. **每个修复配变异测试**：退回旧实现 → 断言必须**精确失败**（不是全挂）→ 再恢复。
8. **不擅自 push**：提交后由用户确认再推；push 最多尝试一次，失败不重试、不后台重试。

---

## 3. 规则来源与权威性

### 唯一权威来源（改规则先改它）

```
AGame/da-a-game/skills/da-a-game-rules/SKILL.md
```

- **仓库版 = 唯一来源**。
- `~/.openclaw/agents/work/agent/workshop-skills/dada-a-game-rules/SKILL.md` 是**自动生成的镜像**，
  由 `scripts/sync-skills.js` 同步；**不要直接编辑镜像**（改仓库版后跑同步脚本）。
- 关键章节：§6 牌型库 / §6.1 连续与龙 / §6.2 单张大小 / §6.3 全局牌力顺序 /
  §6.4 特殊压制规则 / §7 取牌 / §9 推风。
- 判据要**逐条对唯一来源**，不能对「看起来对」的感觉。

### 全局牌力顺序（§6.3，改判定前必读）

```
双大A > 四王 > 三连假八 > 四连珠蛋 > 三王 > 真八 > 真七 > 假八 > 连珠蛋 > 双王 > 大蛋子 > 蛋子 > 龙/对子/单张
```

特殊规则优先于通用顺序；龙/对子/单张同层级互不压；双龙单独按 §6.4 处理。

---

## 4. 开发规约与其他必要文档

### 规约 Skill（项目内 `skills/`）

| Skill | 用途 |
|---|---|
| `senior-dev-standard/SKILL.md` | 资深开发者规范：先读后改、最小改动、不碰红线文件、写完必测、变异测试是硬证据 |
| `dada-a-game-impl/SKILL.md` | 实现层 **11 个反复踩坑的代码层模式**（state 全字段+失败引用同一性、活玩家计数、rank 编码、4 既能取牌也能作为普通牌打出、底牌→手牌 transfer 等） |
| `game-ui-engine-contract/SKILL.md` | UI↔引擎契约排错；含「操作入口语义变更后无头驱动的改法与定位步骤」（与 §6.1 三条反馈直接相关） |
| `git-safe-workflow/SKILL.md` | Git 安全工作流：改前检查、差异审查、提交拆分、推送只推一次 |
| `wechat-minigame-ui/SKILL.md` | 微信小游戏 UI 规范 |
| `wechat-miniprogram-fix-class/SKILL.md` | 微信小程序/小游戏错误横展开修复 |
| `windows-cn-batch-encoding/SKILL.md` | Windows 中文编码（.bat 用 GBK / .ps1 用 UTF-8+BOM） |
| `da-a-game-rules/SKILL.md` | 规则本体（见 §3） |

### 工作区级文档

| 文件 | 内容 |
|---|---|
| `AGENTS.md`（工作区根） | 通用工作纪律 + **Token/额度纪律**（工具输出 ≤40 行、单命令失败最多重试 1 次、后台通知只在有新内容时回、长任务落盘、单轮上下文 >20 万 token 或连续 >2 小时就换会话） |
| `MEMORY.md`（工作区根） | 长期决策与结论（含「连段枚举按每点同张数 k」的决策） |
| `memory/YYYY-MM-DD.md` | 每日流水 |

### 项目级文档（`docs/`）

| 文件 | 内容 |
|---|---|
| `docs/HANDOFF.md` | 交接摘要：项目是什么、启动/测试/构建、接手易踩的坑 |
| `docs/KNOWN_ISSUES.md` | 已知问题与设计陷阱（含已修 bug 的根因分析） |
| `docs/PROGRESS.md` | 按日期的进度流水 |
| `docs/PROJECT_STATUS.md` | 状态报告：版本、测试、目录、下一步 |
| `docs/RULE_AUDIT.md` | 规则实现与 SKILL 的逐条对账 |
| `docs/TEST_REPORT.md` | 测试报告：套件数、回归明细、变异测试证据 |
| `docs/VERSION.md` | 版本冻结记录（含回退方式） |
---

## 5. 当前进度

### 已完成

- **规则引擎**：SKILL §1~§14 全部章节实现完毕（14 个 `src/` 模块）。
- **界面重构**：开局从「一条自动跑完的直线链」改成真人逐阶段推进；亮/不亮、反/反、
  次方身份、结算、日志、出牌失败提示均已落地。
- **真机 UI 修复批次**（v0.29.0 ~ v0.32.0）：双大王提示、选牌自动补成最小可用牌型、
  PASS 显示「不出」而非旧牌、轮末清已出完玩家桌面、结算几何与积分文案、左右安全边距 3.5%、
  花色亮A 按钮 + 5 秒倒计时、记牌器默认展开、右上双大A 角标方向、提示条居中、
  空选牌弹「请先选牌」（不再自动替玩家出牌）。
- **引擎候选枚举修复**（v0.33.0，提交 `d785da7`）：连段枚举改为「同一段内每个点数取**相同张数 k**」，
  k=1 连张 / k=2 双龙 / k=3 连珠蛋；混合张数组合（如 `[8,9,9,10,10,J]`）不再产生。
  配套 `SEQ_K_MIN_LEN = { 1: MIN_SEQ, 2: 6, 3: 9 }` 与 `_pickCombos()` 组合上限。
- **e2e 驱动修复**（v0.33.0，同提交）：`test-pushwind-human-e2e.js` 改走 `uiHint()` → `doPlay()` 的真人路径。
- **用户 3 条反馈修复**（v0.34.0，提交 `8e868d1`）：
  - **假八【提示】**：连段枚举 k 上界 3→4（`SEQ_K_MIN_LEN[4]=8`）→「每点取 4 张」的假八/
    三连假八终于被枚举（引擎侧识别一直是对的，**只漏在枚举层**）。
  - **AI 出牌 1 秒停顿**：判定从 `_uiTestMode()` 换成纯函数 `_computeAiDelay(wx)`，靠
    `tests/mock-wx.js` 的 `__isMock` 标记区分 → **开发者工具模拟器也停 1 秒**（原来恰好 0ms）。
  - **真人出牌显示 + 清理时机**：给真人加牌桌中央显示位（原来 `seatMap` 只有 4 个 AI 座位，
    真人的牌**永远不画**）；删掉 `advanceCurrentPlayer()` 里过早的 `delete uiPlays[humanPlayer]`
    → 真人出的牌保留到**自己再出牌/过牌**为止（与 AI 座位一致）。
- **全量回归**：68 个套件 **68/68 全绿**（2026-11-02）。
- **交接文档**：7 份 `docs/*.md` + 本文已更新到 v0.34.0（提交 `8e868d1`）。

### 当前状态（2026-11-02 18:00 实测）

| 项 | 值 |
|---|---|
| Git HEAD | `8e868d1`（代码 + 文档） |
| 工作区 | **干净**，未提交 0 |
| 未推送 | **1**（`8e868d1`，待用户确认后推） |
| 分支 | 仅 `main` |
| 全量回归 | 68/68 passed |
| 运行方式 | 微信开发者工具导入 `.../AGame/da-a-game`，基础库 3.17.5，无构建 |

---

## 6. 未完成事项

### 6.1 用户 2026-11-01 提出的 3 条反馈 —— ✅ **已全部修复**（v0.34.0，提交 `8e868d1`）

> 三条都按「写复现脚本 → 定点修改 → 相关套件 → 变异测试」逐条走完，全量回归 68/68 全绿。
> 根因分析与回归证据见 `docs/KNOWN_ISSUES.md`（B29~B31）与 `docs/TEST_REPORT.md`。
> 下面保留**修复前**的根因记录，便于追溯「当时为什么错」。

**(1) 别人出双王，我方手上有 JJJJ+QQQQQ 时，【提示】说「当前没有可用牌」**

- 已实证（引擎侧正确、枚举侧缺失）：
  - 引擎把 `JJJJ+QQQQ`（4 张 J + 4 张 Q，J/Q 相邻）识别为 **`FAKE_EIGHT` 假八**（§6 牌型库：「2组连续的四张同点数牌，例如 AAAA+KKKK」），
    `POWER['FAKE_EIGHT']=6` > `POWER['DOUBLE_JOKER']=4`，且 `canBeat(FAKE_EIGHT, DOUBLE_JOKER) === true` → **能压双王**。
  - 但 `src/combos.js` 的连段枚举是 `for (var _k = 1; _k <= 3; _k++)` —— **k 上界只到 3**，
    「每点取 4 张」的假八**根本枚举不到** → 【提示】拿不出候选 → 报「当前没有可用牌」。
  - 复现脚本已验证：`candidateCombos()` 枚举出的牌型里 **不含 `FAKE_EIGHT`**，而引擎直判该手牌 `= FAKE_EIGHT` 且能压双王。
- **已修**：k 上界扩到 4 + 补 `SEQ_K_MIN_LEN[4]=8`（假八需 2 组 × 4 张 = 8 张起）。
  组合爆炸已实测可控：报障手牌候选 7→8；极端手牌（8J+8Q+6K）1205→2408、提示路径 67ms。
- 新增套件 `tests/test-combos-fake-eight.js`（8 张假八 + 12 张三连假八 + transition 接受 + 【提示】能选中）。

**(2) AI 出牌增加 1 秒等待，**包括测试环境****

- 现状：`game.js` 顶部 `var AI_STEP_DELAY = (typeof wx !== 'undefined' && !_uiTestMode()) ? 1000 : 0;`
  → 开发者工具（`platform==='devtools'`）与 node 环境都被归零，**只有真机是 1 秒**。
- 相关事实：`runAI()` 开头 `if (!ctx) return;`（node 测试模式不进 AI）；无头套件普遍 `g.__setAiDelay(0)`；
  `game-ui-engine-contract` 规约 §3d 专门讲「操作入口语义变更后无头驱动怎么改」。
- 约束：改延迟**不能让套件超时**（修完实测 68 个套件仍全绿；无头套件的延迟由 `__setAiDelay(0)` 归零）。
- **已澄清**（用户 2026-11-02）：「测试环境」= **微信开发者工具模拟器** → 模拟器里也要停 1 秒。
- **已修**：判定从 `_uiTestMode()` 换成纯函数 `_computeAiDelay(wx)`：无 wx / `wx.__isMock` → 0ms；
  真机与**开发者工具模拟器** → 1000ms。判据靠 `tests/mock-wx.js` 打的 `__isMock` 标记
  （**`platform` 分不开**：mock 也报 `devtools`）。node 无头测试仍 0ms，68 个套件不会被拖慢。
- 新增套件 `tests/test-ui-ai-delay.js`（各环境取值 + 源码守卫）。

**(3) 真人出的牌在牌面上看不见，直接显示「不出」等；应等到自己出牌时才清空自己前面的桌面状态**

- 现状 A：`ui-render.js` 的 `drawSeatPlays()` 只按 `seatMap` 绘制，而 `seatMap` 只含 **4 个 AI 座位**（真人没有槽位）
  → **真人自己出的牌不画在牌面上**。
- 现状 B：`game.js` `advanceCurrentPlayer()` 里 `if (next === humanPlayer) delete uiPlays[humanPlayer];`
  → 轮到自己时就把**自己上一次的出牌显示**清掉，与「自己出牌时才清」相反。
- 另需核对：`drawMeSeat()` 已画真人自己的「不出 / 已出完」（L679~690 附近）；真人出牌显示位需新增，且与
  `_uiCurrentPlays()` 的当前轮过滤、`_uiPassCleanup()` 的 PASS 清理、`_uiRoundEnded()` 的轮末清理三者不打架。
- **已修**：(A) 给真人加**牌桌中央**显示位（`seatMap[st.humanPlayer] = { x: m.center.x, y: m.center.y, side: 'C' }`，
  整排居中画在桌面中央）；(B) 删掉 `advanceCurrentPlayer()` 里过早的 `delete uiPlays[humanPlayer]`
  → 真人出的牌保留到**自己再出牌**（`_uiRecordPlay` 覆盖）或**过牌**（`_uiPassCleanup` 清）为止，与 AI 座位一致。
  PASS 仍清、轮末仍清已出完者 → 三者不打架。
- 新增套件 `tests/test-ui-human-play-display.js`（牌面中央画得出 + 轮到真人时不被清 + 源码守卫）。

### 6.2 其它

- 完整已知问题清单见 `docs/KNOWN_ISSUES.md`（含已修 bug 的根因分析，改动前先读相关条目）。
- **待核实**：项目根目录有 9 个被 git 跟踪的临时文本文件
  （`_pre.txt _pree.txt d1.txt d2.txt e1.txt j2.txt o.txt o5.txt v.txt`）—— 疑似历史遗留，是否清理需用户确认。
- **待核实**：`docs/` 中「本批相关 16 个套件 / 全量回归待跑」等表述已随 v0.33.0 更新，但个别文件可能残留旧措辞，改动时顺带校对。

---

## 7. 下一步任务建议（**不要在未确认前执行**）

1. ✅ **3 条反馈已修完**（v0.34.0，提交 `8e868d1`）—— 每条都走了「复现脚本 → 定点修改 →
   相关套件 → 变异测试」，全量回归 68/68 全绿。
2. **真机 / 开发者工具模拟器目视确认**：第 (3) 条改了渲染层与状态清理时机（真人自己的牌画在牌桌中央），
   无头测试只能证明「画得出」，**画面好不好看要人看**。重点看：真人出的牌是否居中、
   轮到真人时自己的上一手牌是否**还在**（不该被清）、过牌后是否正确显示「不出」。
3. 清理根目录被跟踪的临时 txt（**先问用户**）。
4. `session.reset` 兜底属 **OpenClaw 侧**（工作区根 `AGENTS.md` / `MEMORY.md`），不属于本项目代码；
   如要做，单独提，别混进游戏提交。
5. **skills 镜像漂移待用户裁决**（与本次修复无关，既有漂移）：`scripts/sync-skills.js --check` 报 5 个
   skill 镜像与仓库不一致，且**镜像比仓库多内容**（如 `dada-a-game-impl` 镜像多出 §12~§15，
   其中 §14/§15 正是「先验证引擎再验证候选枚举」「每点几张×几组按 §6 牌型表逐条对」这两条结论）。
   全量同步会**覆盖掉镜像里这些多出来的内容** → 需先决定「保镜像」还是「以仓库为准覆盖」。

---

## 8. 新会话接手说明

### 8.1 先读这些（顺序）

1. **本文** `OPENCLAW_HANDOFF.md`（你正在读的）
2. `skills/da-a-game-rules/SKILL.md` —— 规则唯一来源，改任何判定前必读相关章节
3. `skills/senior-dev-standard/SKILL.md` —— 开发规约
4. `docs/HANDOFF.md` + `docs/KNOWN_ISSUES.md` —— 现状与历史坑
5. `skills/dada-a-game-impl/SKILL.md` —— 11 个反复踩坑的代码层模式（写引擎代码前扫一遍）
6. 要动 UI 契约时加读 `skills/game-ui-engine-contract/SKILL.md`

### 8.2 怎么跑

```bash
# 微信开发者工具：导入目录 .../AGame/da-a-game，基础库 3.17.5，无构建

# 单个套件
cd .../AGame/da-a-game && node tests/test-ai-lead-combo.js

# 全量（68 个）：逐个 node 跑，统计通过数
#   或: node tests/_runall.js          # 项目自带批量跑测脚本
```

- 无头测试用 `tests/mock-wx.js` 模拟微信运行时；`tests/lib/state-builder.js` 造确定局面。
- **mock-wx 会打 `__isMock` 标记**：game.js 用它区分「AI 要不要等 1 秒」——
  node 无头测试 = 0ms（否则 68 个套件会被拖慢），真机与**开发者工具模拟器** = 1000ms。
- **不要** `npm install` / 构建 / 升级依赖 —— 本项目没有依赖，也不需要。

### 8.3 不能擅自修改的东西

| 内容 | 原因 |
|---|---|
| `skills/da-a-game-rules/SKILL.md` 的规则条文 | 唯一来源，改动需用户确认；改完跑 `scripts/sync-skills.js` 同步镜像 |
| `~/.openclaw/agents/work/agent/workshop-skills/**` 下的镜像文件 | 自动生成，会被覆盖 |
| 技术栈 / 目录结构 / 模块划分 | 见 §2 硬约束 |
| `docs/` 里已记为「已完成」的条目 | 不要把待完成需求写成已完成 |
| git 历史与远端 | 未经用户要求不 push；不 reset / 不 rebase |

### 8.4 工作纪律提醒（来自 `AGENTS.md`）

- 工具输出压到最小（单次 ≤40 行）：先定位行号再读那一段，不要整文件灌进上下文。
- 同一命令失败**最多重试 1 次**；再失败就换方式，别在同一条路上打转。
- 长任务**落盘**结果文件（进程被回收也不丢），不要靠反复重跑「确认」。
- 后台通知只在**有新输出内容**时才回；纯「已完成 / 失败」不单独起一轮。
- 单轮上下文 >20 万 token 或连续工作 >2 小时 → 主动换会话，交接写进 `memory/YYYY-MM-DD.md`。
- 遇到与「感觉」冲突的行为，**先查 SKILL 原文**，再查引擎代码。

---

<!-- project: path:C:\Users\MyFirstAI\.openclaw\workspace-work\AGame -->
