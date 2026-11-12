# 决策记录（DECISIONS）

> 用途：记录**对后续有影响**的产品与机制决定，避免以后被人「优化」回去。
> 每条：决定 → 依据（用户原话/报障）→ 落点。
>
> **收录规则（用户 2026-11-10 裁定）**：
> - 只记**对后续可能有影响**的决定。
> - **单纯的 UI 微调不记**（颜色/字号/位置/尺寸）。
> - **已经废弃的决定不记**（被后续裁定取代的删掉；历史查 `git log -S "<关键词>"`）。
> - **重复的决定只修改**那一条，不新增条目。
> - **没用的**、**单纯的 BUG 修复**不记。
> - 规则本身归 `skills/da-a-game-rules/SKILL.md`；AI 口径归 `docs/ai/AI_POLICY.md`（本台账只留「为什么这么定」与指向，不复述口径）。
>
> 编号只增不复用；删掉的编号不再出现。
> 相关：项目背景 `PROJECT_CONTEXT.md`；架构 `ARCHITECTURE.md`；状态 `PROJECT_STATUS.md`；历史迁移资料 `docs/history/OPENCLAW_HANDOFF.md`。

---

## D-006 产品定位：真人对真人，AI 只用于验证规则

- 主要玩法是**真人对真人**；AI 的存在主要是补位与验证规则实现，不追求拟人博弈。
- 影响：AI 决策口径（排序键、拆组、阵营保守）按「出得合法、不浪费重手」定，不按「打得强」定。
- 相关：`docs/ai/AI_POLICY.md`

## D-008 测试不许用固定 setTimeout 等产品计时器

- 测试不得用固定 `setTimeout` 等待产品计时器（发牌/AI 延迟/倒计时）→ 必然 flaky。
- 改为**确定局面 + 状态转换 + 钩子**：`__setAiDelay` / `__enterPlay` / `__setAutoPlay` / `__autoPlayStep` / `__setDealStep`。
- 相关：`tests/mock-wx.js`、`AGENTS.md`

## D-012 逐轮发牌 + 发牌中可亮A

- 引擎新增 `DEALING` 阶段 + `DEAL_ROUND` 动作，**真·逐轮入 state**（不是 UI 假动画）：手牌里只有已发的牌 → 「只能亮已摸到的 A」「底牌不可亮」天然成立，无需额外判定。
- 发牌期间也接受亮A（手里有 A 就能亮）；发牌期间不设 5 秒倒计时。
- 无头默认 `DEAL_STEP=0` 同步把牌发完 → 异步发牌路径要靠 `__setDealStep` 强制。
- 相关：`src/deal.js`、`src/transition.js`

## D-013 托管 + 时间参数

- 托管：顶栏小机器人开启后**本局持续**由 AI 代打，直到用户取消；**取消时清掉排队中的动作**，取消后不再自动出牌；托管**不跨局**保留。
- 托管出完牌后要**触发推风**（真机托管出完牌不应把推风卡住）。
- 时间参数：闸门/亮A 5 秒；出牌 20 秒（任何玩家轮到都计时）；AI 延迟真机 1000ms（无头 mock 0ms，用 `__setAiDelay` 注入）。
- 相关：`game.js`、`tests/mock-wx.js`

## D-020 AI 起手选牌口径

- 起手唯一来源 `src/lead-choice.js`；【提示】/托管共用同一条链（见 D-021）。
- 选链算法：**由小到大当锚点**，链必须**含锚点**且**取最长**（最长链自然把相邻的都带上，单张 A/2/3 也进龙）。
- 选链优先**不拆同点组**（`555678` → 出 678 而不是 5678）；再比长短。
- `2 张及以上 4` 全部排除出起手池（留给取牌）；**单张 4 保留**（最没用的一张先走）。
- 手牌只剩一组时**整组出**（只剩对4 就不单出一个 4）。
- 整手牌（去掉留作取牌的 4）正好是一种组合牌型（连珠蛋/大连珠蛋/假八/大假八）→ **整手一次出完**，不拆成两个蛋子先出。
- 相关：`src/lead-choice.js`、`docs/ai/AI_POLICY.md` §4

## D-021 【提示】≡ 托管；真人手动点选自由

- 【提示】第一个候选 = **托管会出的那一手**（同一个 `chooseAction` 调用，含阵营/拆组口径）。
- 其余候选排序：同牌型（与桌面同型）→ 牌型从小到大 → 张数少 → 牌力小。
- 提示候选池 = 托管的拆组判定（`ai.splitsRejected`）过滤后的合法组合；去重按**牌型形状**（类型+点数），**不按 card id**（否则 3a/3b/3c 算三个候选，点提示会连着选三个 3）。
- **真人手动点选**（engine 池）不受此限：候选池 = 全量引擎合法组合，可自由拼牌。
- 相关：`game.js uiHintCandidates`、`src/ai.js`

## D-026 出完优先 + 优先度按实际牌力

- 「这一手打完就出完」→ 优先**整手出**（`outAll`），别拆着出最后几手。
- 优先度按**实际牌力**（SKILL §6.3 链：双大A > 四王 > 大假八 > 大连珠蛋 > 三王 > 真八 > 真七 > 假八 > 连珠蛋 > 双王 > 大蛋子 > 蛋子 > 龙/对子/单张），不按张数或点数；弱牌先出。
- 牌力表放在 `src/ai-policy.js POWER_RANK`，与 `docs/ai/AI_POLICY.md` §3 机检同源。
- 相关：`src/ai-policy.js`、`docs/ai/AI_POLICY.md` §3

## D-027 4 组成的蛋子+ 靠后

- 必须出蛋子时，优先出别的蛋子，不出 444（排序键 `fourEgg`）。
- 相关：`src/ai.js`

## D-028 引擎出牌流水 + 推定次方信号

- 引擎公开**出牌流水** `state.plays`（`{playerId, type, count, beat}`；取牌另记 `kind:'CAPTURE'` + `useFours`）→ 是身份推定的**唯一数据来源**。
- 推定次方信号（命中任一）：① 用**大蛋子+**压身份未明的人；② 用**三个 4 及以上**取身份未明的人的牌；③ **累计 2 次及以上**用蛋子压身份未明玩家。
- 口径细节：起手出的蛋子不算；压**主A**的蛋子不算（那是抓方信号）；次方本人知道自己的阵营 → 不推定别人。
- 相关：`src/camp.js inferNext`、`src/play.js`、`src/transition.js`

## D-029 口径配置化 + 「X+」精确定义

- 排序键与「X+」集合外置到 `src/ai-policy.js`（**口径唯一来源**），并由单测 + `docs/ai/AI_POLICY.md` 机检锁住，防漂移。
- 「蛋子+」= 蛋子及以上（12 型）；「大蛋子+」= 大蛋子及以上（11 型）；**双龙不属于蛋子+**（独立牌型）。
- 排序键次序里「不拆组」**先于**「同类型优先」。
- 相关：`src/ai-policy.js`、`tests/test-ai-policy.js`

## D-030 敌友/阵营口径总纲

- 敌友判定唯一来源 `src/camp.js campOf`（SELF/ALLY/ENEMY/UNKNOWN），AI 决策与画面都读它，不各自判。
- **手动标记优先**于自动判定（标了敌 → AI 当他是敌人，可以用蛋子压）。
- **实际阵营一旦确定**（次方亮明/明打/1V4）→ 以真阵营表为准，**不能再手改**敌友标记；1V4 抓方彼此关系是确定的。
- 暗打时**主A持有者对其他玩家一律「不明」**（他不知道谁是次方）。
- 裁定 A：推定出次方后，其余未知玩家 = 队友。
- 相关：`src/camp.js`、`docs/ai/AI_POLICY.md` §11-§13

## D-033 拆组口径

- **同点数家族**（对子/蛋子/大蛋子/真七/真八）拆同点组 → **不进候选**（硬过滤）。
- **组合牌型**（龙/双龙/连珠蛋/假八…）拆 ≥2 个同点组 → 排序降权（罚分），不禁用；拆 ≥3 张的组且拆完剩不到 3 张也罚。
- 为什么必须硬过滤：333 这类整组会被「阵营不明不用蛋子+」那条过滤掉；若拆组只降权，剩下的 33 仍是唯一候选 → 还是拆。
- 相关：`src/ai.js splitsRejected / splitPenalty`

## D-039 出完顺序 = 大贡/二贡/三贡/四贡

- 引擎记**出完顺序**（按出完先后）；画面与结算画面按顺序显示 大贡/二贡/三贡/四贡，**不再显示「头名」**（头名/末名的胜负判定仍按 SKILL §10）。
- 出完牌的人被轮转跳过 → **轮到他时**才清掉他桌面上那手牌并换成贡字；别人压过他时**先不清**。
- 同一轮多人出完：逐个跳过、逐个清，贡字互不串位。
- 相关：`src/transition.js`、`ui-render.js`

## D-048 推定的作用域 + 抓方推定三路信号

- 作用域：阵营推定只影响 **AI 自己的判断**，**不改真人玩家的敌友 UI**（真人托管后照样按推定的阵营出牌，但画面标记不动）。
- 抓方推定信号（命中任一）：A 用**大蛋子+**压主A 一次；B **累计 2 次及以上**用蛋子压主A玩家；C 用**三个 4 及以上**取主A玩家的牌。
- 口径细节：起手出的蛋子不算；压身份未明玩家的蛋子不算（那是推定次方的信号）。
- 相关：`src/camp.js inferCatcher`

## D-049 单张大A：允许进龙，但排在普通A进龙之后

- 取代原「单张大A 不加进龙」口径 → 改为**允许**进龙，但含大A 的组合 `power` +500 → 排序靠后（普通A进龙优先）。
- 相关：`src/ai.js`、`src/combos.js`

## D-050 王的拆组口径

- 2 张王 → 只能一起出（0/2 张）；3 张王 → 可用 1 张或 3 张；4 张王 → 可用 2 张或 4 张。
- 只看**这一手用了几张王**。
- 相关：`src/ai.js`

## D-051 取牌口径：拆 4 组的限制 + 阵营过滤

- 同阵营（公开或已知）→ **一律不取**。
- 阵营不明（次方未亮明）→ 不用**三个及以上的 4** 取（只用 2 张 4 取 3 张目标）。
- 取代 D-020/D-030「同阵营可用 44 取牌」。
- 取牌拆 4 组的细则：4 组 ≥3 张（蛋子级）时**不许拆开**去取牌；4 组不足 3 张可整组取；拆 4 组只要**还剩 ≥2 张 4** 就允许（拆完剩 1 张则不允许）。
- 相关：`src/ai.js _capCampOk`

## D-053 出完优先：假八也一样

- 「能出完就出完」，**假八/大假八不设例外**（此前「拆开能压住上家就别整手出」的例外取消）。
- 相关：`src/ai.js`

## D-054 1V4 暗打倍率 = 1

- 1V4 暗打倍率由 **2 改为 1**：独打者 ±16J，每抓方 ±4J（总分池 16J）；1V4 明打仍是倍率 4（±64J / ±16J）。
- 2V3 不变：明打倍率 2、暗打倍率 1（SKILL §11.2）。
- SKILL §11.1 规则文本已由用户同步；代码侧 `src/scoring.js` 三个测试套件（test-audit-scoring / test-scoring / test-scoring-deep）同步锁定 16/-4。
- 相关：`src/scoring.js`

## D-055 结算画面延迟 1 秒弹出

- 对局结束后**先停在牌桌画面 1 秒**（让玩家看清最后一手），满 1 秒才弹结算面板。
- 延迟量走**纯函数按运行时决定**：真机/开发者工具模拟器 1000ms，node 无头 0ms（不拖慢套件、不让无头断言等定时器 —— 遵 D-008）。
- 新一局把延迟计时归零；到点由定时器自重绘，不依赖用户点击。
- 相关：`game.js _computeSettleDelay / _uiSettleForDraw`

## D-056 AI 决策日志口径：不再每手都打 + 托管那一行含牌名

- [2026-11-08 16:03 用户] 「AI决策的log太多了，不用每次出牌都出」→ **决策轨迹只在 3 处打**：托管代打出牌、托管代打不出、AI 手牌空自动过牌；**AI 自己出牌/过牌不打**。
- 托管那一行把「出了几张 + 出了什么牌 + 决策轨迹」**合成一行**（同一裁定）。
- 「推定次方」打**玩家名**（丙/丁…），不打 id（2026-11-08 用户裁定）。
- 排序键标签以 `src/ai-policy.js` 的 `SORT_KEY_LABELS` 为准（出完/拆蛋组/同型/牌力/4蛋/拆组/大组/价值/张数）。
- 相关：`game.js _aiTraceLine`、`src/ai.js`、`src/ai-policy.js`

## D-057 文档体系：6 份，规则 SKILL 不动（2026-11-12）

- 用户同意把交接文档重组为：`AGENTS.md`（仓库级 Agent 入口）、`PROJECT_CONTEXT.md`、`ARCHITECTURE.md`、`DECISIONS.md`、`PROJECT_STATUS.md`，加上保持不变的 `skills/da-a-game-rules/SKILL.md`。
- 旧 `OPENCLAW_HANDOFF.md` 降为**历史迁移资料**，不再作为 DSH 永久规范；其中路径/工具/OpenClaw 配置多数已失效。
- 其它 skills 允许后续合并精简，但 `da-a-game-rules` 必须保持独立、权威。
- 相关：`AGENTS.md`、`docs/` 下 4 份新文档

## D-058 引擎轮次归属：暂不改，先记录（2026-11-12；同日由 D-059 取代）

- 现状：`state.currentPlayer` 只在 `push-wind.js` 写入；PLAY 期间轮次只存在于 `game.js` 的模块级 `currentPlayer`，`transition/play` 不校验谁该出牌。
- 决定：**本轮不改**。改它会动状态结构与所有出牌调用链，属核心架构改动，需用户在看到影响评估后单独批准。
- 约束：在改动前，所有出牌入口必须继续由 `game.js` 守轮次；测试不得假设引擎能独立校验越序。
- 相关：`ARCHITECTURE.md` §13 技术债 #1

## D-059 引擎轮次归属：state.currentPlayer 为权威副本（2026-11-12，取代 D-058）

- 用户批准按「方案 B（先低风险）」实施：`state.currentPlayer` 由引擎持有，出牌/过牌入口在字段非空时校验 `payload.playerId === state.currentPlayer`，越序返回 `NOT_YOUR_TURN`。
- `game.js` 的模块级 `currentPlayer` 保留为 UI/流程快变量，但每次换手/注入都通过 `_setTurn()` 镜像回 `gameState.currentPlayer`；两者不允许分叉。
- 推进权本轮仍留在 `game.js.advanceCurrentPlayer`（空手跳过、清出牌显示等 UI 副作用也在这里）；「引擎完全接管推进（方案 A）」作为后续项，需再评估。
- 兼容：`state.currentPlayer` 为 null 时不做轮次校验，老测试/直接构造局面不受影响。
- 相关：`src/transition.js`（`STATE_DEFAULTS`/`newGameState`）、`src/play.js`、`game.js _setTurn/__setState`、`tests/test-turn-ownership.js`

## D-060 基础库版本统一为 3.17.6（2026-11-12）

- `project.config.json` 与本地 `project.private.config.json` 的 `libVersion` 统一为 `3.17.6`（此前 2.19.4 / 3.17.6 不一致，模拟器实际跑后者）。
- 说明：`libVersion` 只影响开发者工具编译/模拟；真机用的是用户微信自带基础库，最低支持版本需在微信公众平台后台设置，仓库字段不是真机依据。
- 相关：`project.config.json`

## D-061 引擎完全接管轮次推进（方案 A，2026-11-12）

- 用户批准按方案 A 实施：新增 `src/turn.js`（`nextAliveId` / `advanceAfterPlay` / `advanceAfterPass`），由 `transition.handlePlayAction` / `handlePassAction` 在成功后调用。
- 规则：行动者之后按座次找下一个有手牌者（跳过已出完）；全员过牌清桌后由 `lastPlayer` 重新领出（已出完则顺延）；终局无人有牌时保持 `currentPlayer` 不变，交给 `checkGameEnd`。
- `game.js.advanceCurrentPlayer()` 改为纯镜像 + UI 清理：读取 `gameState.currentPlayer`，只在「轮转真正跳过某个已出完玩家」时清其 `uiPlays/uiPlaysTrick`；兜底扫描仅用于外部直接调用（老测试/工具）。
- 兼容：`play.handlePlay/handlePass` 仍只做轮次校验，不写轮次；直接调用它们的测试不受影响。
- 相关：`src/turn.js`（新增）、`src/transition.js`、`game.js`、`tests/test-turn-ownership.js`（12 断言）、`tests/test-pack-manifest.js`（入包清单 +turn.js）

## D-062 skills 精简为 3 份，规则 SKILL 可读性整理（2026-11-12）

- 用户要求合并其余 skills，并单独优化 `da-a-game-rules`。
- 合并：`git-safe-workflow`、`windows-cn-batch-encoding` 并入 `senior-dev-standard`（保留目录名，避免改 OpenClaw 白名单），后者重写为「开发工作流总纲」（代码纪律 / 测试 / Git / 中文 Windows 编码）。
- 删除 `skills/git-safe-workflow`、`skills/windows-cn-batch-encoding`；现仅 3 份：`da-a-game-rules`（规则）、`senior-dev-standard`（工作流）、`audit-rules-vs-impl`（对账）。
- `da-a-game-rules/SKILL.md` 重排：增加术语速查与阅读路径，合并重复段落；**章节号 §1–§15 与 §13 的 20 条必测用例保持不变**（代码注释与审计脚本依赖），规则语义未变。
- 相关：`da-a-game/skills/*/SKILL.md`、`docs/PROJECT_STATUS.md`

## D-063 preflight 第 8 项改为仓库内技能结构检查（2026-11-12）

- 原第 8 项读 `~/.openclaw/openclaw.json` 的 `dada-dev` 白名单，是 OpenClaw 工作流残留：换机、删配置或不再用 OpenClaw 后恒红，但对 DSH 下的技能发现没有影响。
- 改为检查仓库自身：`skills/<dir>/SKILL.md` 必须存在、frontmatter 含 `name` 与 `description`、`name` 与目录名一致；不依赖任何外部配置。
- 变异验证：临时放一个缺 `SKILL.md`、再放一个缺 `description` 的目录，preflight 均准确 FAIL；删除后恢复 12/12。
- 相关：`scripts/preflight.js`、`skills/*/SKILL.md`、`PROJECT_STATUS.md` §6、`ARCHITECTURE.md` §13

## D-064 UI 出牌显示改为流水派生（2026-11-12）

- 用户批准 P2「UI 镜像收敛」：`uiPlays` / `uiPlaysTrick` / `uiTrickId` / `uiPassed` / `uiTakenPlay` 不再由 `game.js` 各函数手工增删，改为从 `gameState.plays` 派生。
- 引擎补齐流水：PLAY / CAPTURE 记录带 `cards`；每次过牌追加 `kind:'PASS'`；轮末清桌追加 `kind:'CLEAR'`（记 `lastPlayer`）。流水仍是只增日志，`transition` 出口 merge 保旧值的逻辑不变。
- 派生：`_uiProjectPlays()` 一趟扫描重建视图——CLEAR 递增轮次；PLAY/CAPTURE 记「最新一手」与轮次；PASS 清该家显示并置「不出」；CAPTURE 的 `beat` 给被取者打「取」标记。
- UI 意图单独存放：`uiHiddenAt`（暂时藏起某家某一手，如出完后被压过、轮到他被跳过才清）、`uiPassHidden`（暂时藏起「不出」）、`uiPassResetAt`（新轮开始后旧的「不出」不再显示）。这些只影响显示，不写回引擎状态。
- 代价：新增流水事件类型时必须同步 `_uiProjectPlays` 分支；直接注入 `uiPlays` 的测试改为注入 `state.plays` 并 `draw()`。
- 相关：`src/play.js`、`game.js`（`_uiProjectPlays`/`_uiHidePlay`/`_uiHidePass`，删除 `_uiSyncTrick`/`_uiScanCaptured`/`_uiSyncPassState`/`_uiCurrentPlays`）、`tests/test-ui-derived-play.js`、`ARCHITECTURE.md` §9、§13 技术债 #2

## D-065 提示候选：大A 单独成组，按「不含大A → 双大A → 混出」排序（2026-11-12）

- 用户反馈：1V4 明打、手牌 双大A + 3 普通A 时，点提示依次选中「双大A → 5张A → 双大A」，且 AAA 根本不出现；期望「先 AAA（不含大A）→ 双大A → 5张A」。
- 根因两处：① `combos.js` 同点组只取前 n 张前缀，双大A 排在组首，永远枚举不出三张普通A；② `ai.js` 按 rank 分组，大A 与普通A 同组，出 AAA 被判为拆了 5 张 A 的组。
- 改法：`ai.js` 新增 `groupKeyOf(c)`（主方大A → `BIG_A`），`handGroups`/`splitsSameRankGroup`/`splitEggCount` 统一用它；`combos.js` 同点组按「普通A 在前、大A 在后」排序后用 `_subsets` 枚举全部子集；`game.js uiHintCandidates` 增加 `bigTier`（0/1/2）并排在 `isFirst` 之前。
- 结果：候选顺序为 `3张A`(首发) → `4张K` → `2张A`(双大A) → `5张A` → 假八组合。
- 测试：`tests/test-hint-big-a-order.js`（5 断言）。
- 相关：`src/ai.js`、`src/combos.js`、`game.js`、`docs/ai/AI_POLICY.md` §3.1、`ARCHITECTURE.md` §8

## D-066 提示排序补「拆同点组」键，与托管同口径（2026-11-12）

- 用户反馈：手牌 JJQ2、上家出单 9，点提示依次 Q → J → 2；期望 Q → 2 → J（托管不会拆 JJ 出 J）。
- 根因：提示排序只用了 `ai.splitPenalty`（只管同点家族），缺托管排序里的 `split` 键（拿对子里的 1 张也算拆组）。J 与 2 都不罚，于是按 `value` 升序 J(11) 排在 2(18) 前。
- 改法：`game.js uiHintCandidates` 增加 `splitGroup` 字段（按 `groupKeyOf` 分组，候选用了某组的一部分就 +1），排序放在 `typeRank` 之后、`len` 之前——先保「同牌型优先」，再比拆组。
- 结果：JJQ2 打 9 → Q（托管首选）→ 2 → J；J333 打单 10 仍保持「单张优先于蛋子」。
- 测试：`tests/test-hint-order-split.js`（7 断言）。
- 相关：`game.js`（`uiHintCandidates`/`_hintSplitGroups`）、`tests/test-req-20261108.js` §2.2

## D-067 AI 座位头像加「AI」标志（2026-11-12）

- 用户要求：AI 玩家的头像中间加 AI 标志，便于区分真人/AI。
- 改法：`ui-render.js drawSeats` 在每个非真人座位（该函数不画真人座位）的头像圆心绘制白色加粗「AI」，字号约 `rr * 0.62`；真人座位在 `drawMeSeat` 中绘制，不加标志。
- 观察者模式：`humanPlayer` 被改写为观察者本人，其余座位仍显示 AI 标志，符合「切换到 AI 玩家视角」的语义。
- 测试：`tests/test-ui-ai-badge.js`（3 断言，用 `__renderTexts()` 统计「AI」出现 4 次）。
- 相关：`ui-render.js` §9、`tests/test-ui-ai-badge.js`

## D-068 AI 标志跟随真实真人，不跟随观察视角（2026-11-12）

- 用户反馈：切换顶部 5 按钮观察 AI 时，底部被观察的 AI 头像没有「AI」标志，而真人座位反而显示 AI；期望「真人跟着走」。
- 根因：渲染态把 `humanPlayer` 改写成观察者，UI 用 `pid !== st.humanPlayer` 判断 AI，于是底部被观察者永远被当成真人。
- 改法：渲染态新增 `realHumanPlayer`（始终是真正拿手机的玩家）；`drawSeats` 用 `pid !== (st.realHumanPlayer || st.humanPlayer)` 画 AI；`drawMeSeat` 在 `st.humanPlayer !== realHumanPlayer` 时也画「AI」。
- 测试：`tests/test-ui-ai-badge.js` 增 3 条观察者断言（新增 `__setObserver` / `__renderTextsAt` 钩子）。
- 相关：`game.js`（渲染态）、`ui-render.js`（`drawSeats`/`drawMeSeat`）

## D-069 拆组权重：拆同点组 2、拆龙 1（2026-11-12）

- 用户反馈：上家出单 5，手牌 678JJQ，现逻辑出 6（拆龙），期望出 Q；只有 678JJ 这种没别的选择时才拆龙出 6。
- 口径：拆对子/同点组比拆龙更伤，权重 2 : 1；孤立单张 0。
- 改法：`src/ai.js` 新增 `chainSplitCount(cards, hand)`（极大连续段 ≥3 个不同点数，A 可高可低；候选只动一段的一部分、且剩余不再成段 → 记 1）；`_splitCount` 改为 `同点组拆组数 * 2 + 拆龙数`；`game.js _hintSplitGroups` 同口径（`splitGroup` 权重同样 ×2 加拆龙）。
- 结果：678JJQ 打单 → Q；678JJ 打单 → 6；整条龙照常出；6789 拿 6（剩 789 仍成段）不罚。
- 测试：`tests/test-split-chain.js`（10 断言，AI/托管/提示三处一致）；`tests/test-hint-order-split.js` 3.1 期望值随权重改为 2。
- 相关：`src/ai.js`、`game.js`（`_hintSplitGroups`）、`tests/test-split-chain.js`

## D-070 1V4 / 反A 整局无头 E2E（2026-11-12）

- 背景：1V4 与反A 只有规则单测，没有「定身份 -> 整局 -> 结算」的端到端覆盖。
- 新增 `tests/test-1v4-fan-a-e2e.js`，按 `state.currentPlayer` 驱动（D-061 后引擎接管推进），AI 每步用 `chooseAction`，`checkGameEnd` 收尾：
  - A. 底牌揭示：同一人两张同花色 A -> 1V4，主方只有该玩家、抓方其余 4 人、选完身份进 PLAY；
  - B. 1V4 明打整局：能打到 GAME_END，分数 ±64 / ∓16 且零和；
  - C. 1V4 暗打整局：分数只能 ±16 / ±4（平局 0），零和；
  - D. 反A：FAN_A 成功 -> mode 变 1V4_明打、主方只有反A者、抓方含原主方+次方+抓方、首出权是反A者，整局跑完并结算。
- 结果：23 断言全过；全量套件 103 个。
- 相关：`tests/test-1v4-fan-a-e2e.js`、`src/turn.js`（推进）、`src/scoring.js`
## D-071 随机整局压测工具（2026-11-12）

- 新增 `tools/stress-games.js`：随机发牌 + 随机 2V3/1V4、明/暗打，从 PLAY 起由 `chooseAction` 驱动到 `checkGameEnd`。
- 校验：每步 transition 成功、能自然结束、结算零和、牌张守恒（hand + 底牌 + table + discarded = 108）。
- 首轮 50 局（seed=7）：0 失败，主方 9 / 抓方 20 / 平局 21，平均 106.7 步。
- 用法：`node tools/stress-games.js 50 [--seed N]`。

## D-072 game.js 拆分第一步：UI 镜像派生抽到 src/ui-mirror.js（2026-11-12）

- 背景：game.js 仍偏大（约 2600 行），其中 `_uiProjectPlays` 是纯计算，适合先外移。
- 新增 `src/ui-mirror.js`：`project(plays, { hiddenAt, passHidden, passResetAt, handOf })` 返回 `{ plays, playsTrick, trick, passed, taken }`。
- `game.js._uiProjectPlays` 变为状态装配 + 调用该纯函数；行为与 D-064 一致。
- 新增 `tests/test-ui-mirror.js`（10 断言）；两条源码守卫改为检查 `src/ui-mirror.js`。
- 下一步可继续抽「提示候选构造」等纯逻辑，逐步缩小 game.js。

## D-073 devtools 打开项目时自动还原 project.config.json（2026-11-12）

- 问题：开发者工具 `open` 会改写 `project.config.json`（键序/行尾/末尾换行），污染工作区。
- 改法：`tools/wechat-cli.ps1` 在 `open` 前记录文件 SHA256 与 git 干净状态；若打开后被改写且此前干净，则 `git checkout --` 还原；此前已有改动则不碰，只提示。
- 注意：该脚本含中文，必须保存为 UTF-8 with BOM，否则 PowerShell 按 GBK 解析会报「字符串缺少终止符」。

## D-074 拆龙口径收紧：龙只由单张点数构成（2026-11-12）

- 用户反馈：上家出单 9，手牌 10 10 J Q K 3，点提示选中 K；期望 3（JQK 是龙，不该拆）。若手牌是 10 10 J Q Q K 3，则期望 J。
- 新口径：龙只统计**单张点数**（手里该 rank 恰好 1 张）组成的极大连续段（≥3，A 可高可低）；整条龙都用上不算拆；只动一部分记 1；成对的点数不参与龙（避免为了凑龙拆对子）。
- 效果：10 10 J Q K 3 → 3；10 10 J Q Q K 3 → J（Q 成对，J/K/3 都是自由单张，取牌力最小的 J）；678JJQ → Q；678JJ → 6。
- 实现：重写 `src/ai.js chainSplitCount`（`isSingle` 判定 + 只对单张段计惩罚）；`_splitCount` 与 `game.js _hintSplitGroups` 共用，托管/提示同口径。
- 关系：D-069 的权重（拆同点组 2 : 拆龙 1）不变；只收紧「龙」的定义，因此 6789 拿 6 由「不罚」改为记 1（行为不变，仍出 6）。
- 测试：`tests/test-split-chain.js` 扩到 17 断言（1.4 期望 0→1，新增 1.5–1.7 与提示/托管各 2 条）。
- 相关：`src/ai.js`、`game.js`、`docs/ai/AI_POLICY.md` §3.1、`tests/test-split-chain.js`
