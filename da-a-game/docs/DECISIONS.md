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
