# 项目状态（PROJECT_STATUS）

> **每次任务结束都更新本文件。** 新会话先读这里，再看 `PROJECT_CONTEXT.md` / `ARCHITECTURE.md`。
> 最后更新：2026-11-12（Asia/Shanghai）

---

## 1. 快照

| 项 | 值 |
|---|---|
| 分支 | `main` |
| HEAD | 本轮 `D-064` 提交（`git log -1`；上一提交 `a78f8c9 fix(game): 推风日志分 §9.3/§9.4 输出，preflight 去 OpenClaw 依赖（D-063）`） |
| 与远端 | 本地领先 1 个提交，待本轮结束 push（策略：每任务推一次，失败即停） |
| 工作区 | 干净 |
| 技术栈 | 原生微信小游戏，CommonJS + `wx.*` + Canvas，无构建、无 npm 依赖 |
| 基础库 | 3.17.6（`project.config.json` 与本地 `project.private.config.json` 已统一；真机最低版本由 MP 后台决定） |
| 微信开发者工具 | 已登录，CLI 可用；`da-a-game` 项目已打开并能进 PLAY（2026-11-12 截图） |

## 2. 测试与体检

| 检查 | 命令 | 结果（2026-11-12） |
|---|---|---|
| 全量回归 | `node tests/_runall.js` | **124 个套件 / 执行 124 次 / 失败 0 次** |
| 静态体检 | `node scripts/preflight.js --fast` | **12/12 通过** |
| 完整体检 | `node scripts/preflight.js` | **14/14 通过**（含 124/124 套件 + AI 口径机检） |
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
- **测试**：124 个无头套件（规则/AI/UI/E2E/审计）；其中 `test-room-core.js` 覆盖联网房间核心。

## 4. 本轮变更（2026-11-12～13，D-059～D-076）

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
| `da-a-game/src/play.js`（D-064） | 出牌流水补齐：PLAY / CAPTURE 记录带 `cards`；`handlePass` 追加 `kind:'PASS'`；轮末清桌追加 `kind:'CLEAR'`（记 `lastPlayer`）。 |
| `da-a-game/game.js`（D-064） | 删除 `_uiSyncTrick`/`_uiScanCaptured`/`_uiSyncPassState`/`_uiCurrentPlays` 与 `uiCaptureScanned`；新增 `_uiProjectPlays()` 从 `gameState.plays` 派生 `uiPlays`/`uiPlaysTrick`/`uiTrickId`/`uiPassed`/`uiTakenPlay`；「隐藏某手牌」用 `uiHiddenAt`、`uiPassHidden`、`uiPassResetAt` 表达。 |
| `da-a-game/tests/test-ui-derived-play.js` | **新增（10 断言）**：PLAY→uiPlays、PASS→清牌+不出、CAPTURE→取标志、CLEAR→轮次+1 且未出完者保留、空流水重置。 |
| `da-a-game/game.js`（D-066） | 提示排序补 `splitGroup`（拆同点组、含对子，与托管 `split` 键同口径），排在 `typeRank` 之后、`len` 之前；JJQ2 打 9 的顺序由 Q→J→2 修正为 Q→2→J。 |
| `da-a-game/ui-render.js`（D-067） | `drawSeats` 在 AI 座位头像中心绘制「AI」标志；真人座位（`drawMeSeat`）不画。 |
| `da-a-game/tests/test-hint-order-split.js` | **新增（7 断言）**：JJQ2 打 9 的顺序为 Q→2→J、托管同样出 Q、单张 J 记为拆组。 |
| `da-a-game/tests/test-ui-ai-badge.js` | **新增（3 断言）**：5 人局恰好 4 个「AI」标志，换真人座位仍为 4。 |
| `da-a-game/src/ai.js`（D-074） | `chainSplitCount` 收紧：龙只由**单张点数**（该 rank 恰 1 张）组成；整条用上不罚、局部记 1。 |
| `da-a-game/src/ai.js`（D-076） | 新增 `usedGroupCount` / `breakLayerOf`：跟牌先分层（同型不拆 / 同型拆 1 组 / 蛋子+ / 拆龙 / 拆对子）；`touched>=2` 与「跟对子时 `touched>=1`」硬过滤；回退 D-075 的 `_tableIsCombo` 清零。 |
| `da-a-game/game.js`（D-076） | 提示候选带 `layer`，比较器按 `bigTier → isFirst → layer → sameType → typeRank → splitGroup → len → value` 排序。 |
| `da-a-game/src/ai-policy.js`（D-076） | `SORT_KEYS` 在 `outAll` 后插入 `breakLayer`（标签「拆分层」）；`test-ai-policy` 顺序断言同步。 |
| `da-a-game/tests/test-split-chain.js` | 扩到 17 断言（D-074；6789 拿 6 记 1、1010JQK3→3、1010JQQK3→J、提示/托管同口径）。 |
| `da-a-game/tests/test-combo-follow-same-type.js` | **新增（4 断言）**：跟 567 龙时托管出同型龙、只拆 1 组、首候选=托管；断言不写死牌面。 |
| `da-a-game/tests/test-req-20261106b.js`、`test-ui-hint-straight.js` | T40.1 / 1a 按 **D-076** 恢复「不许拆 ≥2 组」的性质断言（67888899 不许出 6789，宁可过牌）。 |
| `da-a-game/audio.js` | **新增（D-077）**：音效与 BGM 管理器，11 种音效各一个 `InnerAudioContext`（90ms 节流），BGM 单独 loop；开关持久化 `dada_sfx`/`dada_bgm`；首次触摸 `unlock()` 后起 BGM；无 `wx` 时安全降级。 |
| `da-a-game/assets/audio/*.wav` | **新增（D-077）**：12 个占位音频（发牌/亮A/反A/普通出牌/大牌/炸弹/不出/取牌/倒计时/胜/负/BGM），共约 403KB；正式素材可同名替换。 |
| `da-a-game/tools/gen-audio.js` | **新增（D-077）**：用 Node 合成占位 WAV 的生成脚本（无 ffmpeg 依赖）。 |
| `da-a-game/ui-render.js`（D-077） | 顶栏机器人左侧新增「音」「乐」两个独立开关圆钮（开=金色/关=灰），`render()` 返回 `soundIcon`/`musicIcon` 命中区。 |
| `da-a-game/game.js`（D-077） | 音效接线：发牌/亮A/反A/出牌（分普通/大牌/炸弹）/不出/取牌/倒计时最后 3 秒/胜负；`_sfxAfterPlays()` 从新增流水补放，覆盖真人、托管、AI 三条路径；触摸时 `unlock()`。 |
| `da-a-game/tests/test-audio.js` | **新增（18 断言）**：默认开启、播放/节流、开关持久化、BGM 解锁与停止、无音频能力降级、顶栏两个按钮存在且不重叠。 |
| `da-a-game/tests/test-pack-manifest.js` | 入包清单加入 `audio.js` 与 12 个音频文件（现 37 个文件）。 |
| `da-a-game/src/ai-memory.js` | **新增（D-078）**：AI 记牌。`remaining()` 用公开信息（桌面/弃牌/出牌流水/自己手牌/公开底牌）算每个点数剩余张数；`highestSingle()`/`canBeBeatenSingle()` 判断单张是否绝对最大；纯逻辑无 `wx.*`。 |
| `da-a-game/src/ai.js`（D-078） | 残局（手牌 ≤6）领出时，若手里有「绝对最大」的单张，优先领出它（稳拿主动权）；不动跟牌与拆组口径。 |
| `da-a-game/tests/test-ai-memory.js` | **新增（6 断言）**：剩余张数守恒、自己手牌计入已见、最大单张判定、残局优先领出绝对最大单张、手牌 >6 不启用。 |
| `da-a-game/tests/test-pack-manifest.js`（D-078/D-080） | 入包清单加 `src/ai-memory.js`、`src/endgame.js`（现 39 个文件）。 |
| `da-a-game/src/endgame.js` | **新增（D-080）**：残局搜索。全体存活手牌 ≤10 时，用未见牌抽样 + 全员托管推演，按阵营胜负选动作；不读别人手牌。 |
| `da-a-game/tests/test-endgame.js` | **新增（13 断言）**：阈值、未见牌统计、抽样不重复、候选枚举、终局/未终局评分、队友剩牌计入、搜索返回合法动作。 |
| `da-a-game/game.js`（D-081） | 提示取托管那一手时带 `{endgame:true}`；提示排序改为「托管首选 → 大A 分级」。 |
| `da-a-game/src/endgame.js`（D-081） | 平分时优先常规 `chooseAction` 的选择（候选提前 + 严格大于才替换）。 |
| `da-a-game/src/ai.js`（D-082） | 大蛋子按张数加权；跟单大A/单王不再惩罚含大A；删除「自己≤6 优先绝对最大单张」。 |
| `da-a-game/tests/test-hint-matches-autoplay.js` | **新增（6 断言）**：提示首手 = 托管那一手（首出 556+双王 / 跟单 6 的大A / 跟单大A 的 5 张 A 蛋）。 |
| `da-a-game/cloudfunctions/init-db/` | **新增（D-079）**：云开发初始化云函数，幂等创建 `rooms`/`room_logs` 集合。 |
| `da-a-game/ui-render.js` / `game.js`（D-087） | 左上角 ☰ 菜单：下拉「音乐 / 音效 / 退出游戏」；顶栏不再放独立音/乐按钮（D-087 修订）。 |
| `da-a-game/tests/test-menu.js` | **新增（D-087，9 断言）**：菜单默认收起、三项、文本、顺序、命中区在画布内且不重叠。 |
| `da-a-game/project.config.json`（D-079） | `cloudfunctionRoot: "cloudfunctions/"`，并把 `cloudfunctions` 加入 `packOptions.ignore`（不进小游戏包）。 |
| `da-a-game/src/flow.js` | **新增（D-088/D-089）**：阶段闸门表 `GATE_PLAN` + `gateIndexOf/stageAt/nextStage/isFinalStage`；发牌 `startDeal/dealRound/isDealing`。`game.js` 只引用，不再自带表。 |
| `da-a-game/tests/test-flow.js` | **新增（14 断言）**：闸门顺序/索引/末档、发牌进 DEALING、22 轮发完（21/21/20/20/21 + 5 张底牌 = 108）、game.js 引用同一张表。 |
| `da-a-game/game.js`（D-086） | 提示兜底 `_bruteForceLegalPlays`：常规挑不出牌时穷举合法出牌（含 4 取牌）；候选补 `ids`，修复点提示取牌时的 `undefined.slice` 崩溃。 |
| `da-a-game/tests/test-hint-fallback.js` | **新增（7 断言）**：444 打 333 → 取牌 44；单大A 无解返回空；KKK 面前点提示选中 2 张 4。 |
| `da-a-game/src/record.js` | **新增（D-090）**：`buildRecord(state, view)` 只输出公开战绩（模式/胜负/阵营/得分/流水条数），不含手牌底牌。 |
| `da-a-game/game.js`（D-090） | 首进 `GAME_END` 调 `_submitGameRecord()`：`wx.cloud.init` 懒初始化、每局一次、失败只记日志。 |
| `da-a-game/cloudfunctions/record-game/` | **新增（D-090）**：服务端白名单校验后写入 `game_records`；`init-db` 集合表加入 `game_records`。 |
| `da-a-game/tests/test-record.js` | **新增（11 断言）**：字段齐全、阵营标注、零和、无手牌/底牌泄漏、平局与缺主A不崩。 |
| `da-a-game/src/history.js` | **新增（D-091）**：战绩页格式化（模式/胜负/时间/得分 + 汇总），纯函数、无 wx。 |
| `da-a-game/cloudfunctions/list-records/` | **新增（D-091）**：按 `openid` 查最近 N 局，只回传白名单字段；集合不存在按空列表处理。 |
| `da-a-game/ui-render.js` / `game.js`（D-091） | 菜单加「战绩」项；`drawHistoryPanel` 居中面板（标题/汇总/行/关闭），打开时拉取并渲染，点击任意处关闭。 |
| da-a-game/tests/test-ui-history.js（D-092） | 清空按钮：命中区/文案/与关闭不重叠/二次确认态，19 断言。 |
| da-a-game/cloudfunctions/clear-records/（D-092） | **新增**：按 openid 分批删除自己的 game_records，返回 {ok,removed}。 |
| `da-a-game/tests/test-history.js` / `test-ui-history.js` | **新增（20 / 13 断言）**：格式化与汇总、面板文本、空态与错误态、关闭命中区。 |
| `da-a-game/src/protocol.js` / `timing.js` / `version.js` | **新增（D-093，P0）**：联机动作信封（白名单/`baseSeq`/`actionKey`）、计时参数集中、协议/规则版本。 |
| `da-a-game/tools/sync-engine.js` + `cloudfunctions/game-server/` | **新增（D-093，P0）**：引擎副本同步与 `MANIFEST.json` 哈希校验；云函数骨架（当前只做 ping/版本握手）。 |
| `da-a-game/tests/lib/fake-cloud.js` | **新增（D-093，P0）**：假云端 `callFunction` + 权威 server（apply/seq/viewFor），供 P1 房间逻辑无头测试。 |
| `da-a-game/tests/test-protocol.js` / `test-engine-sync.js` / `test-online-harness.js` | **新增（13 / 5 / 338 断言）**：信封校验、引擎副本一致性、5 客户端投影/并发骨架。 |
| `da-a-game/docs/plans/ONLINE_ROOM.md` | **新增（D-093）**：好友建房方案（架构/一致性/生命周期/页面/阶段/风险）。 |

### 文档与 skills

- 新增 `AGENTS.md`（仓库根）、`docs/PROJECT_CONTEXT.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/PROJECT_STATUS.md`（本文件）。
- `docs/history/OPENCLAW_HANDOFF.md` 保留，但已标注为历史资料（见文件头）。
- **D-062**：`git-safe-workflow`、`windows-cn-batch-encoding` 合并进 `senior-dev-standard`（重写为开发工作流总纲），删除原目录；skills 由 5 份精简为 3 份。`da-a-game-rules/SKILL.md` 重排（术语速查、去重），章节号与 §13 用例不变。

## 4.1 联网 P1/P2/P3（2026-11-16）

- P2：新增 `src/online.js`（客户端房间控制器：create/join/ready/start/send/poll/offline/online；`send` 自动带 `baseSeq`，遇 `STALE` 先 poll 再用新 seq 重试一次）；`tests/test-online-client.js`（15 断言，用内存假云跑 5 人建房→准备→开局→断线）。
- P3：`room.js` 增加 `deadline`、`tick`（到点由服务端 AI 代当前玩家走一步并记 `afk`）、`setOffline/setOnline`（对局中离线即 AI 接管，回来可恢复）；`index.js` 增加 `tick/offline/online` 动作。
- 打包清单 47 个文件（`src/online.js`）。

- 新增 `cloudfunctions/game-server/room.js`：房间状态机 `WAITING → PLAYING → SETTLED → FINISHED`，`seq` 乐观锁 + `moveKeys` 幂等，空位 AI 补齐，全员准备自动开局，基础分累计，`poll` 只回 `publicView`（他人手牌只给张数）。
- `cloudfunctions/game-server/index.js`：`ping/create/join/ready/start/apply/poll`，房间存 `rooms` 集合。
- `src/protocol.js` 动作白名单扩到 8 个（新增 LIANG_A / FAN_A / ADVANCE / REVEAL_BOTTOM / CHOOSE_IDENTITY 及 payload 校验）。
- `tests/test-room-core.js`（23 断言）。
- 对局数上限 **30**；局间只显示累计总分（D-094 修订）。

- 云端：game-server 已部署（34 文件 / 93.2 KB），与 init-db/ecord-game/list-records/clear-records 同环境；rooms 集合首次写入时自愈创建。

## 5. 冒烟记录（开发者工具）

- `tools/wechat-cli.ps1 islogin` → `{"login":true}`。
- `tools/wechat-cli.ps1 open --project ...\da-a-game` → `√ open`，IDE server `http://127.0.0.1:41957`。
- 窗口截图（`PrintWindow`）确认：控制台无红色报错；发牌 → 亮A → 强制排查 → 翻底牌 → 次方身份 → PLAY 全流程日志正常；界面显示 5 座、手牌、按钮、记牌器；模式 `2V3_暗打`、主方 2 人、抓方 3 人。
- **2026-11-12 完整一局（D-061 之后，托管自动跑）**：主方胜（`reason=2V3_主方全空 头名在主方`）；结算页 甲 大贡 +2、乙 三贡 −1、丙 四贡 +1、丁 −1、戊 二贡 −1 —— **合计 0，零和**；N=1 与 §11.2 暗打公式一致（主A +2N、次A +N、各抓方 −N）。控制台无报错。
- **真机**：2V3 由用户验证正常（2026-11-12）；1V4 / 反A 由用户验证正常（2026-11-15）。
- **2026-11-15 音效（D-077）**：模拟器重编译后顶栏显示「音」「乐」两个金色开关；点「音」变灰并输出 `音效: 关`，控制台无音频报错；再点恢复。BGM 在首次触摸后启动。
- **2026-11-15 音效修复**：发牌音改为**每 3 轮**随发牌播放（原来只在发牌结束响一次；每轮又太急促）；BGM 采样率 12000→16000（非常规采样率部分平台解码失败）、合成振幅 0.055→0.16、音量 0.22→0.35；110/110 通过。
- **未做**：无（真机与模拟器整局均已覆盖；剩余只差发布前回归）。

## 6. 已知问题

| 级别 | 问题 | 影响 | 计划 |
|---|---|---|---|
| 低 | ~~真机只验证了 2V3~~（2026-11-15 用户已补跑 1V4 / 反A，正常） | — | 已完成 |
| 中 | ~~轮次推进仍在 game.js~~（D-061 已解决：引擎在 `transition` 写入 `state.currentPlayer`，`game.js` 只镜像 + 清 UI） | — | 已实施；新增出牌入口必须走 `transition` |
| 中 | ~~preflight 第 8 项读 `~/.openclaw/openclaw.json`~~（D-063 已解决：改为仓库内 skills 结构检查） | — | 已实施，不再依赖外部配置 |
| 低 | 基础库版本 | 仓库内字段不等于真机实际版本 | 已统一 3.17.6；真机最低版本在 MP 后台设置并回归 |
| 低 | ~~推风日志写死「同阵营=…」~~（已改为输出触发者阵营 + §9.3/§9.4 依据） | — | 已实施 |
| 低 | ~~UI 镜像（`uiPlays`/`uiTakenPlay`/`uiPassed`/`uiTrickId`…）手工同步~~（D-064 已解决：改为从 `gameState.plays` 派生，隐藏语义用 `uiHiddenAt`/`uiPassHidden`） | — | 已实施；新增流水事件时必须同步 `_uiProjectPlays` 的分支 |
| 低 | ~~微信开发者工具 `open` 项目会重写 `project.config.json`~~（D-073 已解决：`tools/wechat-cli.ps1` 打开前记哈希，若此前干净且被改写则自动 `git checkout --` 还原） | — | 已实施；若本地已有未提交改动则只提示、不动 |
| 低 | ~~`src/phases.js` 顶部注释过时~~（已清理） | — | 已完成 |
| 低 | 微信开发者工具内**听不到音效/BGM**（真机正常；模拟器音频后端限制，控制台无报错） | 无法在模拟器验收音效 | 以真机为准；模拟器只验收开关 UI 与日志 |

## 7. 待办与优先级

1. **P0**：~~真机补跑 1V4 / 反A~~（2026-11-15 用户已验证，正常）。
2. **P1**：~~preflight 去掉 OpenClaw 依赖；推风文案修正~~（2026-11-12 已完成，见 D-063；phases 过时注释一并清理）。
3. **P2**：~~UI 镜像收敛（`uiPlays`/`uiTakenPlay` 从 state 派生）~~（D-064 已完成，见 §4）；发牌/闸门仍是 `game.js` 的驱动代码。
4. **P3**：~~其它 skills 合并精简~~（D-062 已完成：skills 精简为 3 份，规则 SKILL 已重排）。
5. **P4（单机收尾）**：~~AI 记牌（D-078）~~ 已完成；**残局搜索（D-080）** 已实现（全体剩牌 ≤10，抽样推演，含队友评估），只在 AI/托管启用。
6. **下一阶段**：好友建房对战——方案已确认（D-093，见 `docs/plans/ONLINE_ROOM.md`），P0 已在 `main` 完成（protocol/timing/version、引擎副本同步、fake-cloud、测试）；后续在 `feature/online-room` 分支做 `game-server` 房间核心（P1）。云开发环境 `cloud1-d5g7uiwu9f7caacdc` 已开通；`init-db`/`record-game`/`list-records`/`clear-records` 已部署；上线前需确认棋牌类目/资质。
7. **持续**：改动后更新本文件；保持 124+ 套件全绿。

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

