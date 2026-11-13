# 架构说明（ARCHITECTURE）

> 描述**当前真实实现**，不是理想设计。规则以 `skills/da-a-game-rules/SKILL.md` 为准，AI 口径以 `docs/ai/AI_POLICY.md` 为准。
> 文中的「已知取舍」是接手时需要知道的事实；「改进建议」尚未实施，动之前先和用户确认。

---

## 1. 分层

```
┌─────────────────────────────────────────────────────────┐
│ game.js        运行时：wx 生命周期、定时器、闸门、触摸、托管 │
│                持有模块级 currentPlayer / lastEmptiedPlayer │
├─────────────────────────────────────────────────────────┤
│ ui-render.js   纯几何：布局、绘制、命中框（hitboxes）        │
├─────────────────────────────────────────────────────────┤
│ src/           规则引擎：纯函数，不依赖 wx.*，不碰定时器      │
└─────────────────────────────────────────────────────────┘
```

依赖方向：`game.js → ui-render.js / src/*`；`src/*` 之间只允许单向依赖（`transition → play/capture/push-wind/hand-types`），`src/` **绝不** `require('game.js')` 或 `wx.*`。

## 2. 模块清单（`da-a-game/src/`，19 个）

| 模块 | 职责 | 关键导出 |
|---|---|---|
| `index.js` | 统一出口，聚合 card/deal/phases/transition/hand-types + play/push-wind/win-loss | 全部 |
| `card.js` | 牌模型与牌组 | `createDeck()` 108 张、`SUITS`、`RANKS` |
| `deal.js` | 发牌原语（洗牌、发牌顺序、一次发完、逐轮发） | `dealGame`、`dealRound`、`buildDealOrder`、`createPlayer` |
| `phases.js` | 阶段/动作/错误码枚举 | `PHASES`、`ACTIONS`、`ERR` |
| `transition.js` | 状态机主入口 + 亮A/强制排查/反A/翻底牌/身份/出牌委托 | `newGameState`、`transition`、`canLiangA`、`canFanA`、`canChooseIdentity`、`determineFirstPlayer` |
| `hand-types.js` | 牌型识别/比较/压制 | `identifyHand`、`compareHands`、`canBeat`、`HAND_TYPES`、`POWER` |
| `combos.js` | 手牌可出组合枚举（AI/提示用） | `candidateCombos(hand)` |
| `capture.js` | 4 取牌 | `canCapture`、`executeCapture` |
| `play.js` | 出牌/过牌/轮末 | `handlePlay`、`handlePass`、`isRoundOver` |
| `turn.js` | 轮次推进（D-061） | `nextAliveId`、`advanceAfterPlay`、`advanceAfterPass` |
| `ui-mirror.js` | UI 镜像派生（D-072） | 纯函数 `project(plays, opts)`：`uiPlays`/`uiPassed`/`uiTakenPlay`/`uiTrickId` |
| `push-wind.js` | 推风 | `pushWind` |
| `win-loss.js` | 胜负判定 | `getCamp`、`isAllOut`、`getFirstOutPlayer`、`checkGameEnd` |
| `scoring.js` | 计分 | `autoDeriveN`、`calculateScore` |
| `camp.js` | 敌友判定与推定 | `campOf`、`inferNext`、`inferCatcher`、`campCertain` |
| `ai-policy.js` | AI 口径常量（唯一来源） | `SORT_KEYS`、`POWER_RANK`、`EGG_PLUS_TYPES`、`BIG_EGG_PLUS` |
| `ai.js` | AI 决策 | `chooseAction`、`splitsRejected`、`splitPenalty`、`getLastTrace` |
| `lead-choice.js` | 起手选牌 | `leadCandidates`、`pickLead` |
| `sort-cards.js` | 手牌按链序排序（UI/AI 共用） | `chainKey`、`sortByChain` |
| `util.js` | 阵营工具 | `camps(state)` |

## 3. 数据模型

### 3.1 牌（card.js）

```js
{
  id: 'S-A-n1',        // `${suit}-${rankName}-n${序号}`，全局唯一
  suit: 'H'|'D'|'C'|'S',
  rank: 2..14,         // 11=J 12=Q 13=K 14=A
  is主方大A: false,    // 主A 花色的 A 被标 true（含底牌槽）
  location: 'hand'|'table'|'discarded'|'底牌'|'captured' 等
}
```

大小王用 `isBigJoker` / `isSmallJoker` 标识，不参与 `rank` 比较。牌张守恒：`hand + 底牌 + table + discarded = 108`（取牌拿走的牌进 `captured` 并进入手牌，4 留在桌面）。

### 3.2 玩家（deal.js / transition.js）

```js
{ id: 'A', hand: [card], 底牌: card|null }
```

只有 5 个玩家 id：`A/B/C/D/E`，界面显示为「甲乙丙丁戊」。没有 `name` 字段，名字映射在 `game.js` 的 `names`。

### 3.3 对局状态（`transition.newGameState` + `ensureState`）

| 字段 | 含义 |
|---|---|
| `phase` | `PHASES.*` |
| `players` | 5 个玩家 |
| `deck` / `dealOrder` | 洗好的牌与发牌顺序（108） |
| `startPlayerIndex` | 起始座位 |
| `主A` | `null` 或 `{ suit, establishedBy, viaMethod, viaCardId? }` |
| `反A` | `null` 或 `{ by, 旧主A }` |
| `次方` | 2V3 的次 A 持有者；1V4 为 `null` |
| `mode` | `1V4_明打` / `1V4_暗打` / `2V3_明打` / `2V3_暗打` / `null` |
| `主方` / `抓方` | 阵营 id 数组（**可丢**，真源见 §7） |
| `头名` | 第一个出完者 |
| `出完顺序` | 大贡/二贡/三贡/四贡顺序 |
| `推风触发者` | 推风触发者（PLAY 期间没人写，见 §6.4） |
| `底牌公开` / `次方公开` | 公开标记 |
| `table` | 当前桌面牌 |
| `discarded` | 已作废的牌（旧桌面、取牌用掉的 4） |
| `passedPlayers` / `passCount` | 本轮已过牌者 |
| `lastPlayer` | 当前桌面最后出牌者 |
| `plays` | 公开出牌流水 `{playerId, type, count, beat, kind?, useFours?}` |
| `actions` | 成功动作历史（含 `type/payload/atPhase`） |

**状态不可变约定**：`transition()` 是纯函数；失败时返回入参 `state` 原引用；`src/` 内部一律 `Object.assign`/`map` 克隆，不原地改。

## 4. 状态机（`transition.js`）

### 4.1 契约

```js
transition(state, action) ->
  { ok: true,  state: newState } |
  { ok: false, error: { type, message }, state: 原 state }
```

- 入口 `ensureState()` 补齐所有字段（handler 里大量无守卫解引用）。
- `dispatch()` 按 `ACTIONS` 分派到 11 个 handler。
- 出口统一 `Object.assign({}, state, handler 返回的显式字段)`；并有一条特殊保护：**若新 state 的 `plays` 为空而旧的有内容，则沿用旧 `plays`**——否则一次过牌就会把推定依据清空（`plays` 是推定次方/抓方的唯一公开数据源）。

### 4.2 阶段与动作

```
GAME_START --START_GAME--> DEALING --DEAL_ROUND x22--> LIANG_A
LIANG_A --LIANG_A--> LIANG_A_RESOLVED --ADVANCE--> FAN_A
FAN_A --FAN_A/ADVANCE--> FAN_A_RESOLVED --REVEAL_BOTTOM--> REVEAL_BOTTOM
--> [2V3] IDENTITY_CHOICE --CHOOSE_IDENTITY--> PLAY
--> [1V4] PLAY
PLAY --PLAY/PASS/PUSH_WIND--> ... --checkGameEnd--> GAME_END --> SCORING
```

- 发牌：`handleStartGame({progressive:true})` 只建 `DEALING`；`handleDealRound` 每轮 5 张（每人 1 张），发完按是否已有主A 进 `LIANG_A` 或 `LIANG_A_RESOLVED`。非 progressive 时 `dealGame` 一次发完。
- 亮A：`handleLiangA` 只在 `DEALING`/`LIANG_A`；底牌不可亮；亮后 `主A.suit` 定，`markAllAcesAs主方大A` 标所有同花色 A（含底牌槽）。
- 强制排查：`runForcedCheck` 从起始位逆时针、每人按 H/D/C/S；同花色两张 A 跳过；全无单 A → 红桃 A，`establishedBy` = 实际持有者。
- 反A：`handleFanA` 只能一次，要求手里同花色两张 A 且花色 ≠ 主A；成功后新主A、撤旧标记、`startPlayerIndex` = 反A者、`mode=1V4_明打`、主方=[反A者]、抓方=原主方+原次方+原抓方。
- 翻底牌：`handleRevealBottom` 把每人 `底牌` 并入 `hand` 并置 `null`，统计主A 花色 A 的持有者数：1 人→1V4，2 人→2V3（另一人为次方）。反A 已发生或 `mode=1V4_明打` 直接进 PLAY，否则进 IDENTITY_CHOICE。
- 身份选择：`handleChooseIdentity` 2V3 只有次方能选、1V4 只有主A 能选；`PUBLIC`→明打并置 `次方公开=true`，`HIDDEN`→暗打。
- 首出权：`determineFirstPlayer` 优先级 = 反A者 > 2V3 明打次方 > 主A.establishedBy。

### 4.3 出牌/过牌委托

`handlePlayAction` 只检查 `phase===PLAY`，然后委托 `play.handlePlay`；成功后维护 `出完顺序`/`头名`，并按模式处理身份公开：

- `2V3_暗打`：次方打出的牌里含大A → `次方公开=true`。
- `1V4_*`：主A 打出大A 且手里已无大A → `次方公开=true`（表示两张大A 都露了）。

`handlePassAction` 直接委托 `play.handlePass`。`handlePushWindAction` 允许 `payload.trigger` 覆盖 `state.推风触发者`。

## 5. 牌局流程（运行时视角，game.js）

1. `newGame()`：随机 `humanPlayer` 座位，重置全部 UI 状态，`gameState = newGameState()`，`initGame()`。
2. `initGame()` 发 `START_GAME{progressive:true}` → `DEALING`。
3. `_dealOneRound()`：每次 `DEAL_ROUND`；无头 `DEAL_STEP=0` 时 `while` 一次发完 22 轮；真机每轮 200ms。
4. 发牌中真人可点「亮A」（`_dealLiangA(suit)`），AI 逐轮尝试亮A。
5. 闸门（`GATE_PLAN = [DEAL, FORCED_CHECK, ADVANCE, REVEAL, IDENTITY, PLAY]`）逐档推进；每档可能停住等真人（`gateChoice`），否则自动。
6. 进入 PLAY 时 `_setTurn(determineFirstPlayer(...) || 'A')`（同时写模块变量与 `gameState.currentPlayer`），清 `uiPassed`，轮到 AI 则 `runAI()`。
7. 人类出牌 `doPlay()` / 过牌 `doPass()`；AI 由 `runAI()` 循环驱动。
8. 每次成功出牌后：`advanceCurrentPlayer()` → `checkGameEnd()` → 必要时 `doPushWindIfPending()` → `draw()` → `runAI()`。
9. 局终：`GAME_END`，展示结算（延迟 1 秒，D-055），「下一局」重新 `newGame()`。

## 6. 出牌 / 取牌 / 过牌 / 推风

### 6.1 `play.handlePlay(state, {playerId, cardIds})`

1. 校验 payload/玩家/手牌/cardIds 均存在且属于该玩家。
2. 若选的全是 4 → 先试 `executeCapture`；成功则记 `plays {kind:'CAPTURE', useFours, beat}` 并返回。
3. 否则 `identifyHand` + `canBeat(state.table)`；成功则覆盖 `table`、旧桌面进 `discarded`、`lastPlayer`、清 `passedPlayers/passCount`、追加 `plays {kind:'PLAY', beat}`。
4. **轮次校验**（D-059）：`state.currentPlayer` 非空时，`playerId` 必须等于它，否则 `NOT_YOUR_TURN`；为 null 时保持兼容（老测试/直接构造局面）。
5. **轮次推进**（D-061）：`transition.handlePlayAction/handlePassAction` 成功后调用 `src/turn.js` 把下一行动者写入 `state.currentPlayer`（跳过已出完者；全员过牌清桌时 `lastPlayer` 重新领出）。`game.js.advanceCurrentPlayer()` 只做镜像与 UI 清理，不再自己推座位。

### 6.2 4 取牌（`capture.js`）

- `canCapture(fours, target)`：4 必须 rank=4 非王；目标 3-8 张同点非王；`fours.length === target.length - 1`；至少 2 张 4。
- `executeCapture`：目标牌复制并标 `取自`、去掉 `is主方大A`；4 上桌；`lastPlayer`=取牌者；`被取走者`=原 `lastPlayer`；清过牌；目标牌进取牌者手牌。
- 取牌算有效出牌，4 留在桌面；全员过牌则本轮失效。

### 6.3 过牌与轮末（`play.handlePass`）

- 要求桌面有牌、不是 `lastPlayer`、本轮没过过。
- `aliveOthers = players.filter(p => p.id !== lastPlayer && p.hand.length > 0)`。
- `passCount >= aliveOthers.length` → 清空 `table`（进 `discarded`）、重置 `lastPlayer`。
- `isRoundOver` 已与上述口径统一（P2 修复）。

### 6.4 推风（`push-wind.js`）

- 前置：`phase===PLAY`、触发者存在且手牌为空。
- 阵营全空 → 直接 `PUSH_WIND_END`（由 `checkGameEnd` 收尾）。
- 次方明确（`次方公开===true` 或 `mode==='2V3_明打'`）→ 推给**同阵营最近**的未出完者。
- 次方不明确 → 按 §9.4 推给**顺时针最近的非主A 未出完者**（不按阵营过滤）。
- 写 `currentPlayer`，清 `推风触发者`。

**运行时触发链**：`state.推风触发者` 在 PLAY 期间**没有任何代码写入**；真正触发源是 `game.js` 的模块级 `lastEmptiedPlayer`，由 `doPushWindIfPending(roundJustEnded)` 用四道闸判断：轮刚结束、trigger 非空、`state.lastPlayer===trigger`、trigger 手牌为空。

## 7. 胜负与计分

### 7.1 阵营真源

`win-loss.getCamp(state)` 与 `util.camps(state)` 都以 **`主A.establishedBy` + `次方`** 为唯一真源；`state.主方/抓方` 只是冗余镜像（反A/克隆时可能不一致），仅作回退。

### 7.2 `checkGameEnd(state)`

- 主A 未确定 → 不结束。
- `1V4_明打`：有头名即结束，胜方 = 头名阵营。
- `1V4_暗打`：独打者先出完 → 主胜；抓方全出完 → 抓方胜；抓方先出完、独打者后出完但仍有抓方有牌 → 平局。
- `2V3`：任一阵营全空 → 按头名判胜/平。

### 7.3 `scoring.calculateScore`

- `1V4_明打`：独打者 ±64，每个抓方 ∓16。
- `1V4_暗打`：独打者 ±16，每个抓方 ∓4（D-054）。
- `2V3`：N = 未出完的抓方人数（主胜）或查表 2/1/3（主败）；主A ±2N、次A ±N、每个抓方 ∓N；明打 ×2、暗打 ×1；平局 `{}`。
- 恒零和（三个抓方都扣）。

## 8. AI 决策链

```
chooseAction(state, playerId)
  ├─ IDENTITY_CHOICE → CHOOSE_IDENTITY(HIDDEN)
  ├─ 桌空 → lead-choice.pickLead(hand)
  ├─ 桌上有牌 → 先看能否取牌（4 数够、目标 3-8、阵营过滤）
  └─ 否则压制：candidateCombos + 单张 + 双大A + 双王
        → 硬过滤（双大A不拆、王白名单、UNKNOWN 不用蛋子+、
                  同点数家族不拆、拆组罚>0 禁、同阵营重手禁）
        → 按 ai-policy.SORT_KEYS 排序
        → 第一个合法候选；无则 PASS
```

- 同点分组按 `groupKeyOf` 取键：**大A 单列 `BIG_A`**，不与普通 A 同组（D-065）。否则「拆组」会把 AAA 误判为拆了 5 张 A 的组而过滤掉。
- 拆组权重按 `chainSplitCount` 计：同点组拆组罚 2、拆龙罚 1（D-069）；「龙」只由**单张点数**构成（成对的点数不参与），整条用上不罚、局部使用罚 1（D-074）。
- **跟牌分层（D-076）**：`ai.breakLayerOf(tableType, type, cards, hand)` 给出 0..3 的层：
  跟龙/组合 = 同型不拆 0 / 同型拆 1 组 1 / 蛋子+ 2；跟对子 = 同型 0 / 蛋子+ 1（拆组已在硬过滤里禁）；
  跟单张 = 同型不拆 0 / 蛋子+ 1 / 拆全单张龙 2 / 拆对子 3。
  `touched >= 2`（动了 ≥2 个同点组）一律不进候选；提示候选带同名字段 `layer`，比较器先比 `bigTier` 再 `isFirst` 再 `layer`。
- 提示与托管共用 `chainSplitCount` 与 `groupKeyOf` 口径。
- 「提示」候选池是全量合法组合，排序时先按 `bigTier`（不含大A=0 / 双大A=1 / 混出=2）再按 `isFirst`（D-065）。

- `camp.js campOf` 返回 `SELF/ALLY/ENEMY/UNKNOWN`：手动标记优先；公开阵营按真表；暗打主A 看别人一律 UNKNOWN；推定信号来自 `state.plays`（D-028/D-048）。
- 推定只影响 AI 自己的判断，**不改真人 UI 的敌友标记**（D-048）。
- `ai-policy.js` 是排序键/牌力/「蛋子+」集合的唯一来源，`tests/test-ai-policy.js` + `docs/ai/AI_POLICY.md` 机检块锁死。
- `splitsRejected` / `splitPenalty` 是拆组硬过滤与降权的实现；`getLastTrace` / `getLastCandidates` 供日志与「提示」复用。

## 9. UI 与渲染

- `game.js` 只做**布局结果的使用**与交互：`uiLayout()` / `uiHandLayout()` 来自 `ui-render.js`，返回坐标与 hitboxes。
- `ui-render.js` 负责：桌面、顶栏（模式/主A/次方/记牌器）、5 个座位、每人桌面牌、手牌、按钮、toast、结算面板；`render()` 返回 hitboxes 供 `game.js` 命中检测。
- 顶部 5 个圆形按钮 = 切换 `uiObserver`（只读观察视角，可看 5 家手牌），不是玩家。
- 手牌点击 → 选中/取消；`_uiExpandSelection` 会自动补成合法牌型（点一张 5 自动带成对子/蛋子）。
- `uiPlays` / `uiPlaysTrick` / `uiTrickId` / `uiPassed` / `uiTakenPlay` 是**从 `gameState.plays` 派生的视图**（D-064）：`_uiProjectPlays()` 遍历流水重建；PLAY/CAPTURE 记录带 `cards`，PASS 追加 PASS 记录，轮末清桌追加 CLEAR 记录。「暂时藏起某手牌」「暂时藏起不出」用 `uiHiddenAt`、`uiPassHidden`、`uiPassResetAt` 表达，不再手工增删这些视图。

## 10. 定时器与异步

| 常量 | 值 | 用途 |
|---|---|---|
| `DEAL_STEP` | 真机 200ms，mock/无头 0 | 逐轮发牌 |
| `AI_STEP_DELAY` | 真机 1000ms，mock 0 | AI 每步思考延迟 |
| `SETTLE_DELAY_MS` | 真机 1000ms，无头 0 | 局终到结算面板 |
| 闸门/亮A 倒计时 | 5s | 等真人操作 |
| 出牌倒计时 | 20s | 轮到任何人 |

- AI 延迟有 ±20% 抖动，下限 200ms（`_computeAiDelay`，`wxObj.__isMock` 时 0）。
- `runAI()` 用 `while` + guard 200 防死循环；每个 AI 步通过 `setTimeout` 排下一拍，避免整局同步卡死。
- **测试不要等这些定时器**（D-008），用钩子把延迟设 0 或直接驱动状态。

## 11. 测试架构

- 无测试框架：每个 `tests/test-*.js` 自带 `test()`/`assert`，`node tests/test-xxx.js` 直接跑，退出码非 0 即失败。
- `tests/_runall.js`：枚举 `test-*.js`（当前 **105** 个），可带起止序号只跑一段；汇总「套件 N 个 / 执行 N 次 / 失败 M 次」。
- `tests/mock-wx.js`：`__isMock=true`、800×400 canvas、`ctx` 方法桩、`onTouchStart` 收集 handler、`fireTouch`；必须在 `require game.js` **之前**安装。
- `tests/lib/state-builder.js`：`SB.build({...})` 构造确定局面并自动补足 108 张；`SB.countAll` 校验守恒。
- 断言纪律：锁性质（合法/不合法、状态不变、不崩、日志出现），不写死具体牌；E2E 用固定局面 + 钩子。
- 覆盖：规则引擎、AI 口径、UI 命中/渲染、E2E 全流程、文档/技能一致性审计。

## 12. 打包与配置

- `project.config.json`：`appid=wx99808147273cdea1`、`libVersion=3.17.6`、`minigameRoot=./`、`packOptions.ignore=[scripts,tests,docs,skills,tools]`。
- `project.private.config.json`（git 忽略，仅本地）：`libVersion` 同为 3.17.6。
- `tests/test-pack-manifest.js` 锁定最终入包文件集合（当前 24 个文件），新增目录忘加 ignore 会被这条测试拦住。
- 无 `package.json`、无 lockfile；不要引入依赖。

## 13. 已知取舍与技术债

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| 1 | ~~**轮次推进仍在 game.js**~~（D-061 已解决）：引擎在 `transition` 出牌/过牌成功后写入 `state.currentPlayer`，`game.js.advanceCurrentPlayer()` 只镜像并清 UI | 引擎可独立推进，状态可回放；`game.js` 的兜底扫描仅服务老测试/直接注入 | 保持；新增出牌入口必须走 `transition`，不得绕过 |
| 2 | ~~UI 镜像状态与 `gameState` 双份~~（D-064 已解决）：`uiPlays`/`uiTakenPlay`/`uiPassed`/`uiTrickId` 由 `gameState.plays` 派生 | 派生结果只取决于流水；遗留的 `uiHiddenAt`/`uiPassHidden` 仅表达「暂时藏起」的 UI 意图 | 新增流水事件时必须补 `_uiProjectPlays` 分支与测试 |
| 3 | `transition` 出口 merge + `plays` 保护是补丁式设计 | 新 handler 容易忘记返回字段 | 新 handler 明确列出所有变更字段；补测试锁 `plays` 不丢 |
| 4 | `game.js` 约 2.6k 行，混驱动/闸门/触摸/托管/日志 | 可读性下降，改动易牵连 | 只做低风险拆分（如日志/闸门），不重写 |
| 5 | ~~preflight 第 8 项仍读 `~/.openclaw/openclaw.json` 的 dada-dev 白名单~~（D-063 已解决） | 原为 OpenClaw 残留，换机/删配置会恒红；现改为仓库内 skills 结构检查（SKILL.md + name/description） | 保持；新增技能只需保证目录名与 frontmatter 一致 |
| 6 | 基础库：仓库字段只影响开发者工具，真机由用户微信决定 | 模拟器与真机行为可能有差异 | 统一 3.17.6；MP 后台最低版本另行设置 |
| 7 | ~~推风日志文案写死「同阵营=…」~~（已解决） | 次方未公开时实际目标可能是抓方，旧文案会误导 | 现按 §9.3/§9.4 输出依据与目标 |
| 8 | ~~`src/phases.js` 顶部注释称「只实现到 LIANG_A_RESOLVED」~~（已清理） | 过时，误导新人 | 已改为「全部阶段均已实现」 |
