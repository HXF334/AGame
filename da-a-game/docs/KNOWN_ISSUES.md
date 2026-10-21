# 已知问题与设计陷阱

**更新时间**：2026-10-21 11:05

---

## 1. 真 bug（已修）

### B1: transition handler 丢字段 ✅ 已修
- **症状**：PLAY 阶段 `state.主方`/`抓方`/`discarded`/`table`/`passedPlayers` 是 undefined
- **根因**：handler 用 `ok({ 显式字段列表 })`，没列的字段被丢弃
- **修法**：`transition()` 出口 `Object.assign({}, state, _r.state)` + `ensureState()` 入口补齐 16 个字段
- **修复**：A 任务（root commit）

### B2: handleFanA startPlayerIndex 没更新 ✅ 已修
- **症状**：反A 成功后 startPlayerIndex 仍是原主A 的索引
- **修法**：`startPlayerIndex: ['A','B','C','D','E'].indexOf(payload.playerId)`
- **修复**：G 任务

### B3: scoring.js / win-loss.js / push-wind.js 硬依赖 state.主方 ✅ 已修
- **症状**：缺 `state.主方`/`抓方` 时 crash（`Cannot read properties of undefined (reading '0')`）
- **修法**：注入 `camps(state)` 双路径推导（A 任务抽出到 `src/util.js`，3 处统一）
- **修复**：A 任务 + B 第二轮 + D 任务第三次加固
- **教训**：A 任务只修了已知症状点（win-loss / push-wind / transition），**漏了 scoring.js**

### B4: test-push-wind.js 拆 dispatch 时 default 引用 action.type ✅ 已修
- **症状**：transition(未知 type) 报 ReferenceError
- **根因**：拆分 `switch` 到 `dispatch(state, type, payload)` 时 default 分支仍写 `'unknown action type: ' + action.type`
- **修法**：default 用 `type` 参数
- **修复**：A 任务

### B5: checkGameEnd 在 主A=null 时误报平局 ✅ 已修
- **症状**：主A 未确定但报 draw
- **修法**：加 guard `if (!_mainA) return { ended: false, reason: '主A未确定' }` + 回退路径
- **修复**：E 任务

### B6: AI 手牌全 4 时 crash ✅ 已修
- **症状**：`nonFoursSorted[0]` undefined
- **修法**：加 `if (nonFoursSorted.length === 0)` 分支返回 4 或 PASS
- **修复**：E 任务

### B7: 2V3 胜负误判"主方全空" ✅ 已修
- **症状**：2V3 抓方全空时判 "主方全空 平局"
- **根因**：当时 `state.主方`/`抓方` 在 transition 中已被丢
- **修法**：派生 `主A.establishedBy + 次方` 作为唯一真来源
- **修复**：A-F 阶段 B 任务

### B8: handleRevealBottom handle 主A.suit 无守卫 ✅ 已修
- **症状**：主A=null 时 REVEAL_BOTTOM 触发 `state.主A.suit` → TypeError
- **修法**：加 `if (!state.主A || !state.主A.establishedBy) return err(...)` 守卫
- **修复**：A 任务第三轮

### B9: executeCapture state.table 无守卫 ✅ 已修
- **症状**：table 空/undefined 时 crash
- **修法**：加 `if (!state.table || state.table.length === 0) return err(...)` 守卫
- **修复**：A 任务第三轮

### B10: handlePlay/handlePass/chooseAction 对 player.hand 无守卫 ✅ 已修
- **症状**：玩家 hand 缺失时 crash
- **修法**：加 `if (!Array.isArray(player.hand))` / `!state.players` 守卫
- **修复**：A 任务第三轮 + A2 加固

### B11: project.config.json description mojibake ✅ 已修
- **症状**：WeChat IDE 报 "worker path empty"
- **根因**：UTF-8 编码被错误解析（"鍐呰挋鍙ゆ墦澶"）
- **修法**：重写为干净 ASCII 中文
- **修复**：2026-10-20 18:11

### B12: cardDescFull_cardDesc is not defined ✅ 已修
- **症状**：game.js doPlay 报 ReferenceError
- **根因**：局部 `const cardDesc` 屏蔽了外层函数 `cardDesc`（之前"两步重命名"只完成一半）
- **修法**：局部变量改名 `cardText`
- **修复**：2026-10-20 18:11

### B13: state is not defined ✅ 已修
- **症状**：game.js runAI L526 报 ReferenceError
- **根因**：L516-517 用 `state.players` / `state.discarded` 但同作用域变量是 `gameState`
- **修法**：`state` → `gameState`
- **修复**：2026-10-20 18:12

### B14: scoring.js 语法错（lastIndexOf 合并行）✅ 已修
- **症状**：scoring.js L6 `→{ playerId: delta, ... }` 合并残留
- **根因**：A 任务抽 camps 时 lastIndexOf 逻辑出错
- **修法**：重写整个 scoring.js
- **修复**：A 任务第三次加固

### B15: push-wind.js 残留 `if (_mainA)` 死代码 ✅ 已修
- **症状**：test-push-wind.js 全挂：`ReferenceError: _mainA is not defined`
- **根因**：A 任务抽 camps 时只删了变量声明，没删引用
- **修法**：删 if/else 死代码（camps() 已处理双路径）
- **修复**：A 任务第三次加固

### B16: line-based splice 留 8 行孤立代码 ✅ 已修
- **症状**：test-scoring-n-derive.js SyntaxError: Unexpected token '}'
- **根因**：找 `});` 时只匹配第一个，遗留 8 行原始 test body
- **修法**：第二遍 splice 清掉
- **修复**：B 任务（N 自动推导）测试期间

### B17: B 任务测试预期与 SKILL 不一致 ✅ 已修
- **症状**：test-scoring-deep.js 4.1 "未传 n 默认 N=1"，test-scoring-n-derive.js 1.2 "B 出完不计分"
- **根因**：旧测试预期 vs SKILL §11.2 实际语义
  - §11.2 主方胜: N = 抓方**未出完**人数
  - §11.2 抓方得分: **每个抓方都得 -N**（阵营计分，不论是否出完）
- **修法**：重写 2 个测试预期 + B 任务"自动推导"取代"默认 N=1"
- **修复**：B 任务第三轮

---

## 1b. 2026-10-20 夜 / 10-21 修复的 bug

### B18 [P0] 连张/双龙识别依赖牌序 ✅ 已修
- **症状**：手牌非点数升序时，连张/双龙永远识别失败（INVALID_HAND）；真实玩家与 AI 同样中招
- **根因**：`play.js handlePlay` 用 `player.hand.filter(c => cardIds.indexOf(c.id) >= 0)` 取牌，会按**手牌存储顺序**重排，丢弃调用方给的顺序；而 `isValidStraight` / `isValidDoubleStraight` 逐位比较 `cards[i+1].rank === cards[i].rank + 1` 并直接读 `cards[0]`/`cards[len-1]`，隐含“已按点数升序”
- **修法**：识别前先按 rank 升序排序；不能只排序沿用旧逻辑（排序会把 A-2-3 变成 [2,3,14] 使 A 落到末尾被误当高端 A），改用**点数集合**显式判定 A 的两种合法形态（§6.1）：`rest[0]===2` → A 作低端；`rest[last]===13` → A 作高端。`isValidDoubleStraight` 同步处理
- **触发经过**：为让 AI 能打连张而放宽起手，40 局实测出现 30/40 卡死 + 30 次 INVALID_HAND，由此定位
- **附带收益**：D4（AI 死循环）根因即此问题，300 局压测不再复现
- **回归**：`test-order-independence.js`（13 项，含全排列验证）

### B19 [P1] 蛋子无法跳型压制龙/对子/单张 ✅ 已修
- **根因**：`POWER` 表把 `SINGLE/PAIR/TRIPLE/STRAIGHT` 全设为 1，压平了 §6.3 全局链末档
- **修法**：`SINGLE/PAIR/STRAIGHT=1, TRIPLE=2, BIG_TRIPLE=3 … DOUBLE_BIG_A=13`，`DOUBLE_STRAIGHT=0` 不变
- **测试修正**：`test-hand-types-batch2.js` 原断言把蛋子错列为与龙/对子同层，已按 §6.3 更正并补反向断言

### B20 [P1] PAIR/TRIPLE 比较泄露大A 加成 ✅ 已修
- **症状**：对A（含一个大A）压过对3
- **根因**：`compareHands` 的 PAIR 分支复用 `singleRankEncoding`，该函数对 `is主方大A` 返回 20 > 3 的 17
- **修法**：新增 `pairRankEncoding()`（纯点数，不含大A加成）供 PAIR/TRIPLE/BIG_TRIPLE/TRUE_SEVEN/TRUE_EIGHT 使用
- **回归**：`test-pair-bigA-not-boost.js`（19 项）

### B21 [P1] 推风跳阵营 ✅ 已修
- **症状**：抓方玩家出完后推风给了主方玩家
- **根因**：`push-wind.js` 用 `state.mode === '2V3_明打'` 判断“次方身份是否明确”，但 §4.5/§7.3 规定次方公开后 mode 仍为 `2V3_暗打`（只影响计分倍率）→ 落入无阵营校验分支
- **修法**：分支条件改为 `state.次方公开 === true || state.mode === '2V3_明打'`
- **回归**：`test-push-wind-camp.js`（13 项）

### B22 [P1] 单大A 压制条件写反 ✅ 已修
- **症状**：33333 管不了单大A；4 张大A 却能管
- **根因**：判定写成 `length === 4 || 6` 且额外要求 `every(c => c.is主方大A)`；§6.4 实际只按**张数**（5 或 6），且不要求是大A牌
- **修法**：按张数判定 + `POWER >= POWER[BIG_TRIPLE]` 覆盖“全局牌力更高者”
- **测试修正**：`test-hand-types-batch2.js` 原注释“5张同点数但非大A不能压单大A”在 SKILL 中无此表述，已按原文更正并补“4张全大A也不能管”

### B23 [P1] isValidStraight 循环起点错误 ✅ 已修
- **症状**：`4-4-5` 被误判为连张（而 `4-5-5` 因顺序不同被正确拒绝，逻辑不自洽）
- **根因**：无 A 分支 `for (let i = 1; …)` 跳过 `cards[1]` 检查
- **回归**：`test-straight-invalid.js`（16 项）

### B24 [P1] §4.3 直接亮双大A 未按 1V4明打处理 ✅ 已修
- **症状**：玩家持同花色两张A 直接亮后，引擎仍进 IDENTITY_CHOICE 让其再选明/暗
- **根因**：`handleRevealBottom` 注释已写明“直接亮双大A → 1V4明打已锁定”，但条件只判 `反A已发生 || state.mode === '1V4_明打'`；直接亮双大A路径 `viaMethod='LIANG_A'`、`mode=null`，两个条件均不满足
- **修法**：`handleLiangA` 记录 `doubleA` 标志；`handleRevealBottom` 判定加上 `主A.doubleA === true`
- **回归**：`test-liang-double-a.js`（16 项）

### B25 AI 只会出单张 ✅ 已修
- **症状**：实测 40 局，16 种牌型只出 SINGLE（100%），过牌率 49%；PAIR 分支因“AI 只出单张 → 桌上只有单张 → PAIR 永不触发”而成为死代码
- **修法**：`src/ai.js` 重写为 `candidateCombos` 枚举 + `canBeat` 引擎裁决（AI 不自行判牌型，§12/§14）；新增 `src/combos.js` 纯函数枚举候选组合，人类玩家回退复用同一模块
- **效果**：牌型覆盖 1 → 9 种（SINGLE/TRIPLE/BIG_TRIPLE/PAIR/STRAIGHT/DOUBLE_STRAIGHT/TRUE_SEVEN/STRAIGHT_TRIPLE/FAKE_EIGHT）；引擎拒绝非法行动 0；300 局 0 卡死

### B26 game.js “对子回退”声称修复但未落盘 ✅ 已修
- **症状**：用户报“桌上有对10、我有KKK，点出牌提示不可用”，当时报告已修复，实际代码中无 `byRank` 回退
- **修法**：`doPlay` 回退改为调用已测试的 `candidateCombos`，覆盖对子/蛋子/大蛋子/连张

### B27 UI 修复汇总 ✅ 已修
- 两个“桌:”重复显示（删旧独立区）
- `cardDescFull_cardDesc is not defined` / `state is not defined` 类作用域错误
- `engine.chooseAction is not a function`（改从 ai.js 直接 require）
- AI action 未包 payload 导致 `PLAY payload needs { playerId, cardIds }`
- 出完牌后手牌消失（`isHumanTurn` 条件渲染 → 无条件渲染 + hitbox 仅人类回合）
- `action.cardIds.length` 空守卫（PASS 时 cardIds undefined → TypeError）
- ★ 标记恒 false（`names[mi] === humanPlayer` 比较中文名与 ID）
- 推风后 `currentPlayer` 未同步（模块级变量与 pushWind 返回值脱节）
- 推风目标可过牌（违反 §9.2 “推风的目标玩家必须出牌”）
- log 位置/间隔/行数（14→10→15 行，间距 0.023→0.029）
- 过牌/推风字段显示 ABCDE → 中文名

---

## 2. 已知设计陷阱

### D1: 反A 后 startPlayerIndex 路径
反A 成功后 `state.主方`/`抓方`/`次方` 是双路径推导出来的，**不是 transition 显式设置的**。如果未来添加需要这 3 字段的场景（如 UI 显示某玩家的角色），应该走 camps() / getCamp() 而非直接读 state.主方/抓方。

### D2: camps() 已统一到 src/util.js ✅ 已修
历史问题："win-loss.js / push-wind.js / scoring.js 各自独立实现" 已抽取到 `src/util.js`。A 任务第三次加固完成。

### D3: game.js 强依赖 wx
`game.js` 启动时同步执行 `newGameState()` + 完整 init chain（START_GAME → FORCED_CHECK → ... → PLAY）。在 WeChat IDE 里 wx 是全局对象，正常工作。已加 `typeof wx !== 'undefined'` 守卫让 node 可加载，但 draw() 等 UI 函数在 node 里静默不执行。

### D4: AI 偶发死循环 ✅ 已解决
`test-perf` 历史记录：1000 局中 2 局 hit `maxSteps=400`。
**根因已定位并修复**（见 B18）：AI 反复尝试打出因牌序依赖而永远识别失败的连张，形成活锁。
P0 修复后 300 局压测：正常结束 300/300，卡死 0，最大 195 步。

### D5: AI 不会主动选择 ≥3 张牌型 ✅ 已修
旧 `src/ai.js` 只支持单牌/对子/取牌。已重写（见 B25）：
- ✅ 单牌 / 对子 / 蛋子 / 大蛋子 / 真七 / 连张 / 双龙 / 连珠蛋 / 假八 / [4]取牌
- ✅ 牌型覆盖 9/16（实测 40 局）
- ❌ 仍未覆盖 7 种（需 3+ 同点连续组合，随机发牌下概率低）：TRUE_EIGHT、STRAIGHT_TRIPLE_LARGE、TRIPLE_FAKE_EIGHT、DOUBLE_JOKER、TRIPLE_JOKER、FOUR_JOKER、DOUBLE_BIG_A
  —— 这些路径已由单元测试覆盖，仅未在随机对局中出现。

### D6: SKILL §11.2 N 自动推导只覆盖 2V3
1V4 不用 N（自身 1 倍率），自动推导对 1V4 直接返回 1（跳过）。

### D7: handlePlay / handlePass 字段依赖（残留）
虽然 transition() 出口已 merge 全部字段，且加了 player.hand 守卫，但 handlePlayAction / handlePass 内部仍可能引用 state.主方/抓方（如未来添加计分逻辑）。需要 review。

---

## 4. 性能特征

### P1: 性能不是瓶颈
```
单局耗时:  0.691 ms
吞吐:      300,569 ops/sec
```
规则引擎可在 600+ 局/秒（受限于 AI 单线程）。

### P2: AI 步数 vs 性能
平均 207.6 步/局，最大 259 步。**步数 = 每次 transition 调用**。AI 倾向 PASS 而非出牌时，步数会接近 maxSteps=400。

---

## 5. 局限

### L1: UI 部分验证中（用户目视验证）
WeChat IDE 实测受限于当前用户环境。game.js 25 套件覆盖了所有逻辑路径，但 UI 表现（手牌宽度、多卡出牌、AI log 牌描述、按钮位置、视觉卡牌）需 IDE 实测。

### L2: 已知 UI bug（待修 2026-10-20 20:14）
- **R4**: 手牌占太宽，超出屏幕（用户观察）
- **R5**: 多卡出牌 999 → 下家 2 张 → 桌牌 77（行为可疑，可能规则 bug）
- **R6**: AI 出牌 log 不含牌描述（AI E PLAY 3张 后没牌面）

### L3: AI 不会主动选择 ≥3 张牌型 ✅ 已修（见 D5）

### L4: SKILL §11.2 N 自动推导已实现 ✅（旧 L3 已修）

### L5: game.js 视觉扑克牌未完成
现在 draw 用文字 + Unicode 花色符号；想做真正扑克牌（白底矩形 + 红/黑花色 + 数字）需要 IDE 验证。

### L6: game.js tap-to-select 无自动化测试覆盖
D 任务加的可点击矩形全靠 IDE 验证，没 mock wx/canvas 跑集成测试。

---

## 6. 环境与配置

| 项 | 值 |
|---|---|
| AppID | `wx99808147273cdea1` |
| 横屏 | `deviceOrientation: "landscape"` |
| 引擎版本 | WeChat Devtools 2.02.0, lib 3.17.4 |
| Node | v24.21.0 |
| npm | 11.19.0 |
| 项目根 | `C:\Users\MyFirstAI\.openclaw\workspace-work\AGame\da-a-game\` |

---

## 7. 历史 bug 时间线（精简版）

```
2026-10-19 21:12  UI: suitChar undefined (game.js 加载顺序 bug) → 加 guard
2026-10-19 22:09  UI: cardDescFull is not defined → 改名
2026-10-19 22:10  UI: 切换 humanPlayer 不显示手牌 → 加 nameToId 映射
2026-10-19 22:10  UI: ★ 标记总是指向 'A' → 用 isHumanMe 映射

2026-10-20 12:21  A: 2V3 胜负判定 → 派生主A+次方
2026-10-20 12:21  B: 1V4 暗打 平局边界
2026-10-20 12:32  E: 主A=null 误报平局 → guard
2026-10-20 12:32  E: AI 全 4 手牌 crash → onlyFours[0] 兜底

2026-10-20 13:02  A2: transition 丢字段 → merge + 拆 dispatch bug
2026-10-20 13:02  A2: dispatch default 引用 action.type → 用 type
2026-10-20 13:02  A2: scoring.js 仍硬依赖 state.主方[0] → 修（5 任务时漏）
2026-10-20 13:02  B: test-perf.js 运算符优先级 bug → 复用 e2e 循环
2026-10-20 13:06  B2: scoring.js 双路径 → 注入 camps()

2026-10-20 18:00  A3: handleRevealBottom 主A 加 null 守卫
2026-10-20 18:00  A3: capture.js table 加空守卫
2026-10-20 18:00  A3: handlePlay/Pass/AI 加 player.hand guard
2026-10-20 18:00  A3: ensureState + origState（修 24 套 4 FAIL）
2026-10-20 18:00  A4: transition(null) 早退保留 ILLEGAL_ACTION 语义
2026-10-20 18:00  A5: transition(s, null) 早退不再调 ensureState

2026-10-20 18:11  UI: project.config.json mojibake → 重写
2026-10-20 18:11  UI: cardDescFull_cardDesc is not defined → 局部变量改名
2026-10-20 18:12  UI: state is not defined → gameState

2026-10-20 18:25  D: tap-to-select (5 改动)
2026-10-20 18:28  A: camps 抽到 src/util.js
2026-10-20 18:30  B: N 自动推导 (autoDeriveN)

2026-10-20 20:14  用户目视验证 → 发现 3 个 UI bug (R4/R5/R6) 待修

2026-10-20 22:40  git init + 首次提交 6cb0985（69 文件）

2026-10-20 23:30  自主全面审查（SKILL 逐节核对）+ 新增 8 套审查测试
2026-10-20 23:58  B19 POWER 表压平 §6.3 末档 → 蛋子可跳型压制
2026-10-21 00:05  B20 pairRankEncoding 拆分 → 对A 不再泄露大A加成
2026-10-21 00:36  B21 推风分支条件 mode → 次方公开
2026-10-21 00:40  B25/B26 AI 重写 + src/combos.js 抽出
2026-10-21 00:45  B22 单大A 压制张数写反 (4||6 → 5||6)
2026-10-21 09:30  B18 [P0] 连张/双龙识别依赖牌序 → 排序 + 点数集合判 A
2026-10-21 09:45  B24 §4.3 直接亮双大A 未按 1V4明打 处理
2026-10-21 10:30  300 局压测：0 卡死 / 0 非法行动 / 0 牌张不守恒
2026-10-21 11:05  本文档更新（40 套件全绿）
```