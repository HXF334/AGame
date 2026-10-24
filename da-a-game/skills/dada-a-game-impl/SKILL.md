---
name: dada-a-game-impl
description: 实现打大A规则时的11个反复踩坑的代码层模式——state 全字段+失败引用同一性、活玩家计数、rank 编码、4 既能取也能打、单大A 严格规则、底牌→手牌 transfer、推风跳主A、大A 身份变化 (§7.3)、头名追踪、牌型识别器循环边界、兜底值域。规则本身在 dada-a-game-rules
---

# 打大A 实现踩坑（11 个反复出现的 bug 模式）

实现打大A 规则时**以下 11 个模式每个项目都会错一次**。规则本身在 `dada-a-game-rules` SKILL，但实现层的细节规则文档没说，全靠踩。

## 0. 触发条件

实现或重构 `src/play.js` / `src/capture.js` / `src/hand-types.js` / `src/transition.js` / `src/push-wind.js` 任一文件时，先看这 11 条。

**补守卫时的横展开扫法**：不要靠手写"哪些字段可能为 null"的清单——清单漏一个字段，扫描器自己就先崩在那个字段上（本项目 `state.actions.concat` 就是这么被漏掉的，扫描脚本跑着跑着自己 TypeError 才暴露）。改成扫代码本身：

```powershell
Select-String -Path 'src\*.js' -Pattern 'state\.\w+\.\w+'
```

扫出几十条，但绝大多数是安全的：逐条看它上面 3 行有没有 `if (!x) return`、`if (x === null) return err(...)` 之类的早退守卫。**只有裸奔的那几条是真隐患**，其余可标记为安全。

---

## 1. handler 返回的 state 必须保留全字段（成功路径 + 失败路径）

**症状 A**：UI 显示 `mode: 未定`、`主A: -`、`推风: -`，但代码逻辑正确

**根因 A**：handler 返回 `{ ok: true, state: { phase, table, lastPlayer, passedPlayers, passCount, players } }`，**只复制了 6 个字段**，丢了 `mode`、`主A`、`次方`、`推风触发者`、`底牌公开`、`反A`、`actions` 等。

**修法 A（成功路径）**：用 `Object.assign({}, state, {...overrides})` 合并，绝不手工列举字段。

**症状 B**：给入口加了字段归一化（`ensureState`）之后，一批老测试突然红了。失败信息长这样：`expected { ...一堆字段 } to equal { ...一模一样的字段 }`——字段一模一样，就是不相等。

**根因 B**：`ensureState` 每次返回**新对象**，把老代码"失败时原样返回传进来的 state"的约定变成了"返回等价副本"，所有 `===` 断言全挂。**失败路径丢的从来不是字段，是引用同一性**——只看字段快照完全看不出问题。

**修法 B（失败路径）**：入口留一份原引用，归一化**只喂给 dispatch**，失败时归还原引用。

**决策规则（老测试红了，到底改代码还是改测试）**：

| 老测试断言的是 | 判定 | 动作 |
|---|---|---|
| 失败时返回的**引用同一性**、失败**错误码类型** | 既有契约 | 改代码，不动测试 |
| 夹具本身非法（phase 造错、必填字段缺失） | 测试自己写错 | 改测试，不动代码 |
| 断言的**值本身不在该字段值域内**（非法玩家 ID、已废弃枚举名） | 测试锁的是 bug | 改测试，并注释写明原值错在哪 |

第三行最容易误判成"既有契约"。它的特征是**旧值在该字段的值域里从来就不合法**（玩家 ID 字段断言花色名 `DEFAULT_HEART`），锁的不是行为而是 bug —— 见 §11。

**改第三行之前先读该用例的注释和相邻断言**：作者常已把正确行为写在注释里，只是断言值写错了。实测 `test-phase2.js` 的注释写着"A 手里的 H-A-0/H-A-1 被标记 is主方大A"（= 归 A），断言却要求 `DEFAULT_HEART`。注释与断言冲突时，注释通常是先想清楚的那份。

三类会混在同一次失败里，**必须逐条判定**再动手，否则会把真实回归当噪音放过。

**自查清单**：
- 任何新增/改的 handler，成功路径都走 `Object.assign({}, state, overrides)`
- 任何新增/改的早退路径，都确认返回的是**原 state 引用**而不是归一化副本
- 如果 UI 字段变 `-` / `未定`，立刻检查 handler 返回的 state 字段是否全

**完整代码与典型失败信息**见 `references/state-field-preservation.md`。写 handler 返回或排查"老测试突然红"前先读它。

---

## 2. `handlePass` 的"所有人过牌"判定要看活玩家

**症状**：A 出完牌后，B 出任意牌，C/D/E 过 3 次后，桌牌没清空，B 卡住不能出

**根因**：`handlePass` 用 `passCount >= state.players.length - 1`（硬编码 4），没排除已出完的 0 张玩家。

**修法**：只数"还活着且不是上家"的玩家：

```js
// 错 ❌
const otherPlayersCount = state.players.length - 1;
const allPassed = newPassCount >= otherPlayersCount;

// 对 ✅
const aliveOthers = state.players.filter(function (p) {
  return p.hand.length > 0 && p.id !== state.lastPlayer;
});
const allPassed = newPassCount >= aliveOthers.length;
```

**测试**：`A 出完 (0 张) → B 出 → C/D/E 过 3 次 → 轮应结束`（不是 4 次）。

---

## 3. 两套 rank 编码：`singleRankEncoding`（含大A）与 `pairRankEncoding`（不含大A）

**症状 A**：`2 不能压 A`、`5 < J` 错判（SKILL §6.2 顺序是 `3>2>A(14)>K(13)>Q(12)>J(11)>10>9>8>7>6>5>4`）

**症状 B**：只有 1 张大A 的**对A 压过了对3**（用户报"对A 压对3"）。根因是 PAIR/TRIPLE 也用了 `singleRankEncoding` —— 它给大A 返回 **20**，对A 的编码 20 > 对3 的 17，于是整副对子被大A 抬起来了。违反 SKILL §6.4「单大A 只管单张」。

**修法**：**单张**用含大A 的编码，**多张牌型**用不含大A 的编码。

```js
// singleRankEncoding — 只给 SINGLE 用，含大A 加成
function singleRankEncoding(card) {
  if (card.is主方大A) return 20;
  if (card.isBigJoker) return 19;
  if (card.isSmallJoker) return 18;
  if (card.rank === 3) return 17;
  if (card.rank === 2) return 16;
  if (card.rank >= 4 && card.rank <= 14) return card.rank + 1;  // 4→5, ..., 14→15
  return card.rank;
}

// pairRankEncoding — PAIR/TRIPLE/BIG_TRIPLE/TRUE_SEVEN/TRUE_EIGHT 用, 不含大A 加成
// SKILL §6.4: 大A 失去"单牌特权"后按普通 A 参与比较
function pairRankEncoding(card) {
  if (!card) return 0;
  if (card.isBigJoker) return 19;
  if (card.isSmallJoker) return 18;
  if (card.rank === 3) return 17;
  if (card.rank === 2) return 16;
  if (card.rank >= 4 && card.rank <= 14) return card.rank + 1;
  return 0;
}

// compareHands — 按牌型分流, 不要一套编码打天下
case HAND_TYPES.SINGLE:
  return singleRankEncoding(a.card) - singleRankEncoding(b.card);
case HAND_TYPES.PAIR:
case HAND_TYPES.TRIPLE:
  return pairRankEncoding(a.cards[0]) - pairRankEncoding(b.cards[0]);
```

**分流判据**：牌型是 `SINGLE` 才允许大A 加成；其余一切按点数排。**`compareHands` 里任何一处"所有牌型共用一套编码"的写法都要复查**——大A 只能抬高**单张**，抬高多张就是 §6.4 违规。

**改编码时连带核对**：这套改法不影响全局牌力（§6.3 大蛋子 > 对子仍成立，跨牌型压制走 `POWER` 表不走 `compareHands`），也不影响单大A 管单牌含大王/小王（§6.4 明列）。改完跑 `tests/test-pair-bigA-not-boost.js` 覆盖这两条边界。

**构造夹具时的两个陷阱**（都会静默失效，测试全绿但测的不是你以为的那手牌）：

1. `createNormalCard(suit, rank, X)` 的第 3 参是 **id 字符串**，不是 opts。传 `{ is主方大A: true }` 会得到 `id: "C-A-[object Object]"` 且 `is主方大A: false`——测的其实是普通 A。正确做法：建牌后手动 `c.is主方大A = true`。
2. **批量生成的填充牌，rank 取值区间必须避开特殊牌**。写 `((i % 10) + 5)` 想凑"5..13 的普通牌"，实际 i=9 时得到 **14 = A**，夹具凭空多出一批真 A。实测一次审查套件因此让"亮A 持有者数量"多算，把一条正确的引擎行为报成了 bug。改成 `((i % 9) + 5)`，或显式排除 A/王。**断言任何"有几张 A / 谁持有大A"之前，先数一遍夹具里实际有几张 A。**

同理 `canBeat()` 要传 `identifyHand()` 的结果，裸牌数组两边 `.type` 都是 undefined 会恒返回 false。细节见 `game-ui-engine-contract` §2.3。

**对应 POWER 表**（跨牌型压制走这里，不走 `compareHands`；同 `compareHands` 一样要按 §6.3 独立核一遍）：

**每一档必须占一个独立数值**。§6.3 全局链最底一档是四级：

```
… > 大蛋子 > 蛋子 > 龙 > 对子 > 单张
```

把 `蛋子 / 龙 / 对子 / 单张` 全设成同一个值（常见的省事写法是全给 1），链就被压平了——`蛋子` 压不动 `对子`、`蛋子` 压不动 `单张`，而这四条在 §6.3 里是**四级严格分层的**。症状：§6.3 的跨型矩阵里只有 `龙/对子/单张` 三者之间符合预期（它们恰好同层、§6.3 也确实规定彼此不互压），**凡是涉及蛋子或大蛋子当攻方的格子全 false**，很容易被当成"蛋子本来就只能管蛋子"而漏掉。

决策规则：
- **§6.3 每两个相邻词条之间，POWER 值必须不同**。数一遍 §6.3 链上的词条数 = 表里必须有的档位数，缺档就是压平了。
- **同一数值 = 同层 = 不互压**，这是设计意图；反过来说，给两个 §6.3 里明确分层的词条同一个值，一定是 bug。
- 唯一的例外是**双龙**：§6.3 单独给它写了特殊规则（只能管双龙、大蛋子及以上才能压它），不参与这条线性链，按实现单列，并确保它不与链上任一档撞值。
- 改完用跨型矩阵回归：对 §6.3 链上**每一对**相邻及跨档组合跑 `canBeat`，两个方向都断言。真 bug 只在"蛋子/大蛋子当攻方"的方向错，两个方向都错通常是参数形状错（见 `game-ui-engine-contract` §2.3）。

---

## 4. `4` 既能取牌也能当普通单张打

**症状**：玩家手牌只有 4 时，按"出牌"按钮永远失败（"no target on table"）；同样 4 当普通单张也出不去

**根因**：`handlePlay` 把 4 张永远当 `executeCapture` 路径，capture 失败直接报错，没有回退。

**修法**：4 张先尝试 capture，失败回退到普通出牌路径：

```js
const allFours = playCards.every(c => c.rank === 4 && !c.isBigJoker && !c.isSmallJoker);
if (allFours) {
  const captureResult = executeCapture(state, playerId, playCards);
  if (captureResult.ok) return captureResult;
  // capture 不可用, 回退到普通出牌 (4 是合法单张, §6.1/§6.2)
}
// 继续走 identifyHand + canBeat 普通逻辑
```

**关键**：`4` 是 rank=4，SKILL §6.2 中**最低**的普通单张。`4 只能管空桌`（开新轮第一手）。

---

## 5. 单大A (SINGLE.is主方大A=true) 严格规则

**症状**：B 想用普通 BIG_TRIPLE (4 张 rank 5) 压单大A，结果**可以**（违反 SKILL §6.4）

**根因**：`canBeat` 在 current 是单大A 时用了宽松的"任何 BIG_TRIPLE 都能压"。

**修法**（按 SKILL §6.4 严格实现）：

```js
if (currentType === SINGLE && current.card && current.card.is主方大A) {
  if (playType === DOUBLE_BIG_A) return false;  // 2张大A不能管单大A
  // 4 张或 6 张同点数大A: BIG_TRIPLE 全部 is主方大A
  if (playType === BIG_TRIPLE && play.cards &&
      (play.cards.length === 4 || play.cards.length === 6)) {
    if (play.cards.every(c => c.is主方大A)) return true;
  }
  // 双王/三王/四王 各牌型显式列表包含单大A
  if (playType === DOUBLE_JOKER ||
      playType === TRIPLE_JOKER ||
      playType === FOUR_JOKER) return true;
  return false;
}
```

**严格列表**（不能压单大A）：
- 任何 PAIR / TRIPLE / STRAIGHT
- 普通 BIG_TRIPLE（非全大A）
- 连珠蛋 / 假八 / 真七 / 真八 / 真八以上
- DOUBLE_BIG_A（2张大A不能管单大A）
- 4 张 rank 5 之类（非全大A的 4+ 张）

---

## 6. `REVEAL_BOTTOM` 必须先把底牌 → hand 再判阵营

**症状**：A 的底牌是大A，转移时漏算；或转移后 hand 数量 +1 但 UI 没更新

**根因**：`handleRevealBottom` 没转移底牌就直接做阵营判定。

**修法**（按 `dada-a-game-rules` SKILL §2.2/§4.5 [C-4 v4]）：

```js
function handleRevealBottom(state, payload) {
  // 业务级校验...
  if (state.主A === null) return err(ERR.ILLEGAL_ACTION, ...);

  // [C-4 v4] 反A 结束后**先**把各玩家底牌转入手牌
  var transferredPlayers = state.players.map(function (p) {
    if (p.底牌) {
      return Object.assign({}, p, {
        hand: p.hand.concat([p.底牌]),
        底牌: null
      });
    }
    return p;
  });

  // 然后用 transferredPlayers 做阵营判定 (1V4/2V3)
  // ...
  return ok({
    phase: nextPhase,
    players: transferredPlayers,
    // ...
    底牌公开: true
  });
}
```

**顺序不可换**：
1. 先 transfer（底牌 → hand，底牌 = null）
2. 再用 transferredPlayers 判大A 归属（因为底牌的 A 现在在 hand 里，要纳入判定）
3. 再 mark A（这一步在 handleLiangA / handleForcedCheck / handleFanA 里完成，但**必须**在 transfer 之后调用）

**UI 自动反映**：`player.hand.length` 自动 +1，无需额外更新。

**同一原则也适用于「重算出来的字段」——中间态为空不是 bug**：`handleFanA` 写 `抓方: buildNewTakers(...)` 时，`主方 / 次方 / 抓方` 还没锁定，读出来必然是 `[]`；真正的阵营由 `REVEAL_BOTTOM` 按大A 分布**重算并覆盖**。端到端验证的结果是 `抓方 = [A,B,C,D]`、`mode = 1V4_明打`，完全正确。

因此：

- **断言阵营/身份类字段，一律断在 `REVEAL_BOTTOM` 之后**（`PLAY` 阶段），不要断在播种它的那个 transition 上。中途空值是设计如此，报成 bug 会去改一行本来就对的代码。
- 中途值确实可疑时，写**端到端**探针（`... → FAN_A → REVEAL_BOTTOM → PLAY`）看最终值，别只看第一步。
- 「某字段只是没被填」和「某字段会被下游重算」是两回事，区别在于**下游有没有重算它**——先找重算点，找到了就是前者。

---

## 7. 推风：用 `state.mode` 判"次方已明"，未明时只跳 `state.主方[0]`（主AId）

**症状**：A 是主A，2V3 暗打，A 出完牌触发推风。期望推给 B，实际给了 A 自己或错位

**核心结论**（两条都必须记住）：

1. **`state.次方` 字段不能用来判"次方已明"**——2V3 暗打时它**有值**（系统内部始终知道谁次方），但身份未公开。判据只有 `state.mode === '2V3_明打'`。
2. **未明分支只跳一个玩家，不是跳整个阵营**——`state.主方` 数组**只存主A 确立者一人**，`state.主方[0]` 即主AId。**不跳次方**。

**完整实现**（顺时针搜寻循环、两个分支的 `continue` 过滤顺序）与自查清单见 `references/camp-push-wind-headname.md`。改 `src/push-wind.js` 或推风目标选择前先读它。

关键过滤条件不外推：跳过 `p.hand.length === 0`（已出完）与按 mode 决定跳主AId 还是跳整阵营。

---

## 8. §7.3 大A 身份变化 (4-取牌后 + 次方出大A)

**症状**：4-取牌成功后, 原大A 还带 `is主方大A` 标志, 仍按单大A 规则压制; 或 2V3 暗打下次方出大A 后 `state.次方公开` 不变

**根因**：
- `executeCapture` 复制被取回牌时, 没清除原大A 的 `is主方大A` 标志
- `handlePlayAction` 调完 `playModule.handlePlay` 后没检查"次方出大A"

**修法**（按 SKILL §7.3 [C-4 v4]）：

**8.1 4-取牌后: 清除被取回大A 的 `is主方大A`**

```js
// src/capture.js executeCapture 内
var captured = state.table.map(function (c) {
  var copy = Object.assign({}, c, { location: { type: 'hand', playerId: playerId } });
  if (copy.is主方大A) {
    return Object.assign({}, copy, { is主方大A: false });  // 大A → 普通 A
  }
  return copy;
});
```

**8.2 次方出大A: 设 `state.次方公开 = true` (mode 不变)**

```js
// src/transition.js handlePlayAction
function handlePlayAction(state, payload) {
  if (state.phase !== PHASES.PLAY) {
    return err(ERR.NOT_PLAY_PHASE, '...', state);
  }
  var result = playModule.handlePlay(state, payload);
  if (!result.ok) return result;

  // [C-4 v4] §7.3: 2V3 暗打时次方打出大A → 次方身份公开 (mode 不变)
  if (result.state.mode === '2V3_暗打' && result.state.次方 === payload.playerId) {
    var hasBigA = false;
    for (var i = 0; i < result.state.table.length; i++) {
      if (result.state.table[i].is主方大A) { hasBigA = true; break; }
    }
    if (hasBigA) {
      result.state.次方公开 = true;
    }
  }
  return result;
}
```

**自查清单**：
- 大A 失去身份后, `canBeat` 自动按普通 A 走 (§6.4 单大A 规则靠 `is主方大A === true` 判断, 失效后规则自动失效)
- 大A 状态变化**不影响玩家所属主方/次方阵营** (1V4/2V3 在 REVEAL_BOTTOM 时已锁定)
- 实现时必须按**卡的实体 ID** 识别 (不能用 rank 14 判断, 大A 和普通 A rank 都是 14)
- `state.次方公开` 是新字段, 初始 `false`, 触发后 `true`, **不可重置**
- `state.次方公开` 触发后, mode **仍为 2V3_暗打** (mode 在 CHOOSE_IDENTITY 已锁定, 不能后续修改倍率)

**测试**：
- `test-capture.js`: 4-取牌成功后, 被取回大A 失去 `is主方大A` 标志
- `test-play.js`: 2V3 暗打次方 C 打出大A → `state.次方公开 = true`, mode 仍 `2V3_暗打`

---

## 9. `checkGameEnd` 必须追踪 `state.头名` (按时间顺序), 不能用 array 顺序的 `getFirstOutPlayer`

**症状**：A/D 主方全空, 实际应该按"谁先出完"判定平局 vs 主方胜。用户说"E 先出完应该平局", 但代码给的是"主方胜"（1V4-style 倒置逻辑）。

**核心结论**：

- `checkGameEnd` 若用 `getFirstOutPlayer(state)`（按 `state.players` **数组顺序**取第一个空手牌玩家），判的就不是"谁**先**出完"。必须在 `handlePlayAction` 出牌成功后按**时间顺序**写 `state.头名`，且**只记最早的**（后续出完不覆盖）。
- 头名/末名同阵营 → 平局；不同阵营 → 头名阵营胜。
- `getFirstOutPlayer` 降级为**回退**（`state.头名` 未设时），不是首选。

**完整实现**（`handlePlayAction` 追踪代码、`checkGameEnd` 的 2V3 分支、自查清单、测试要求：makeState 必须透传 `头名`）见 `references/camp-push-wind-headname.md`。改 `src/win-loss.js` 或胜负判定前先读它。

---

## 10. 牌型识别器的循环边界：每一对相邻都要被检查

**症状**：`445`（两张 4 + 一张 5）能作为合法牌型出出去，而 `455` 被正确拒绝——同一类东西两种结果

**根因**：`isValidStraight()` 的"无 A"分支循环起点写成了 `i = 1`，跳过了 `cards[0]/cards[1]` 这一对：

```js
// 错 i 从 1 开始，只检查了 n-2 对
for (let i = 1; i < cards.length - 1; i++) {
  if (cards[i+1].rank !== cards[i].rank + 1) return null;
}
// 对 从 0 开始，n 张牌恰好检查 n-1 对
for (let i = 0; i < cards.length - 1; i++) {
  if (cards[i+1].rank !== cards[i].rank + 1) return null;
}
```

`4,4,5` 时 i=1 只检查 `5 === 4+1` → 通过 → 误判成连张。`4,5,5` 恰好因顺序不同被拒，于是表现为"有时对有时错"。

**自查与回归**：

- **不对称性就是线索**：识别器对同一组点数因排列顺序不同给出不同结果，就去查循环起点和边界。
- 新增识别器测试必须覆盖**负例的对称排列**（`445` / `454` / `544` 都要测）。只测 `455` 通过不代表 `445` 对。
- 循环里任何 `i = 1`、`i < len - 1`、`i <= len - 1` 都要手算实际检查了哪几对：`n` 张牌必须恰好检查 `n-1` 对。
- 同标准复查其余识别器：`isValidDoubleStraight` 的成对循环、连珠蛋的连续性判定、A 在头/尾的分支。

---

## 11. 兜底分支产出的 ID 字段，值必须来自本字段的值域

**症状**：某个动作稳定刷 `PLAYER_NOT_FOUND player X not found`；UI 顶栏把 X 原样回显（「当前: DEFAULT_HEART」「主A: ♥ DEFAULT_HEART 双A成功」）；该动作永远失败，而规则函数全对

**根因**：兜底分支把**邻近值域的常量**填进了 ID 字段：

```js
// 强制排查全部花色都查不到 → 兜底红桃A
return { suit: 'H', establishedBy: 'DEFAULT_HEART', viaMethod: 'DEFAULT_HEART' };
//                                ^^^^^^^^^^^^ 花色名   ^^^^^^^^^^^^^^^^^^^ 方法名标签
```

`establishedBy` 的值域是玩家 ID `'A'..'E'`。ID 一旦非法，`players.find(p => p.id === x)` 全部落空 → `currentPlayer` 非法 → 此后每一步出牌都失败。

**修法**：兜底按"找**实际持有该花色**的玩家"逐级回退，每级返回值都取自该字段自己的值域；实在无法回退才用必然合法的常量（如 `startPlayer`）。实测兜底结果从 `{suit:'H', establishedBy:'DEFAULT_HEART'}` 变为 `{suit:'H', establishedBy:'A', viaMethod:'FORCED_CHECK'}`。

**判定规则**：

- 写任何**兜底 / 默认 / 未知**分支前，先问"这个值在本字段的值域里吗"
- **值域分歧信号**：`*Method` / `*Reason` 这类**方法名或原因码字段**与 `*Id` **共用同一个字面量** —— 通常是拿枚举标签冒充 ID
- **UI 原样回显 ID 字段是最快的探测器**：顶栏打出花色名/人名，说明生产者已经在写非法值，不用等引擎报错
- `PLAYER_NOT_FOUND` 刷屏 = 有人往 `players[].id` 里塞了不该有的东西，**先查生产者，不查消费者**——`players` 列表是干净的，查它是死路

---

## 验证清单

- [ ] 改任何 handler 后，跑全量测试无回归（不是抽样）
- [ ] 牌型识别器：同一组点数的**不同排列**给出同一结果；负例至少测 3 种排列
- [ ] 新加的守卫函数**确实被调用**——grep 定义处 + 调用处各一次。补丁脚本报 `WRITTEN OK` ≠ 真的接上了（本项目 `ensureState` 定义完漏调用过一次，测试全绿但 bug 还在）
- [ ] 失败路径返回的是**原 state 引用**，不是归一化副本
- [ ] UI 显示 `mode: 未定` → 检查 handler 返回的 state 字段
- [ ] 玩家出完牌后其他人过牌 → 桌牌应清空（按活玩家数算，不是硬编码 4）
- [ ] `2` 能压 `A`；`5 < J`；**对A（含 1 张大A）压不了对3/对2**（§3 的两套编码分流生效）
- [ ] **§6.3 POWER 表没有档位压平**：链上每两个相邻词条数值不同；`蛋子/龙/对子/单张` 四级是四个值，不是同一个。跨型矩阵对 `蛋子/大蛋子` 当攻方的格子两个方向都断言
- [ ] **断言方向前先查 §6.3/§6.4，别用扑克直觉**——本游戏至少四条与直觉相反，反复假失败：**`A > K`**（对A 能压对K）、**大蛋子/蛋子 能压对子**（§6.3 全局链，不限于同层）、**单大A 能管单张大王**（§6.4 明列）、**双龙只被双龙或大蛋子及以上压**
- [ ] 断言阵营/身份字段时断在 `REVEAL_BOTTOM` 之后，不在播种它的 transition 上（中间态空值会被重算覆盖）
- [ ] 批量填充牌的 rank 区间**避开 A/王**（`((i % 10) + 5)` 会撞出 14 = A）；断言 A 的张数前先数夹具
- [ ] 4 张 rank 5 (非全大A) **不能**压单大A；4 张 H 大A **能**压
- [ ] 走到 REVEAL_BOTTOM 时手牌数按 `dada-a-game-rules` §2.2 口径核对：转移前合计 `103 + 5 底牌 = 108`，转移后恒为 `22/22/22/21/21`。**只断言这两个不变量**——转移前的逐人排列随发牌起始人轮转（`21/21/21/20/20`、`21/21/20/20/21` 等都可能），写死某一种排列去断言会误报
- [ ] **PLAY 阶段每家手牌数不再守「22 上限」**：§7.1 取牌会把对方牌转进自己手牌（实测出现 23 张）。22 只是发牌+底牌那一刻的分配值，不是全程不变量。**真正的全程不变量是 §14 牌张守恒 108**——任何阶段的「每家 ≤ 22」断言都会间歇性挂。区分清楚「相位不变量」（仅在该相位成立）与「全程不变量」（跨相位一直成立）；跨相位会换一套
- [ ] 2V3 暗打 A 出完牌触发推风 → 推给 B (次方, 下一个未出完), 不是 C
- [ ] E 先出完 (头名 E) 主方全空 → 平局（不是主方胜）
- [ ] A 先出完 (头名 A) 主方全空 → 主方胜
- [ ] test makeState 透传 `头名` 字段（否则测试胜负结果不确定）
- [ ] 兜底/默认分支产出的每个 ID 字段值域合法；`*Method` 与 `*Id` 不共用字面量（§11）
- [ ] 修复后老测试红了，**先分类再动手**：断言的值域非法 → 改测试；引用同一性/错误码 → 改代码（§1 决策表）

## 调试时按顺序问的 9 个问题

当 `da-a-game` 行为不对时：

1. **handler 返回的 state 全了吗？**（mode/主A/次方/推风触发者/底牌公开/反A）——成功路径和失败路径分开看
2. **handlePass 算的是"活玩家"还是"硬编码 4"？**（A 出完后的轮结束条件）
3. **compareHands 走的是哪套编码？** 原始 rank、`singleRankEncoding`（含大A）、还是 `pairRankEncoding`（不含大A）？——SINGLE 与多张牌型分流了吗（2 vs A，5 vs J，**对A vs 对3**）
4. **单大A 的 canBeat 走的是严格列表分支吗？**（4 张 rank 5 试图压单大A 应 false）
5. **REVEAL_BOTTOM transfer 在阵营判定之前吗？**（底牌 A 是否参与判定）
6. **推风判的是 `state.mode` 还是 `state.次方` 字段？未明时跳的是主AId 还是整个阵营？**
7. **checkGameEnd 用 state.头名 (时间顺序) 还是 getFirstOutPlayer (array 顺序)？**（平局 vs 阵营胜的判定关键）
8. **新加的守卫函数有没有被真正调用？**
9. **牌型识别器对同一组点数的不同排列，结果一致吗？**（不一致就是循环起点/边界写错，见 §10）
10. **稳定报 `PLAYER_NOT_FOUND player X` 时，X 是谁写进去的？**（先查兜底分支生产的 ID 值域，别查 `players` 列表——非法值永远匹配不到，见 §11）

## 相关 SKILL

- **dada-a-game-rules** — 完整规则手册（§1-§10）。改规则前必查。
- **game-ui-engine-contract** — 画面/AI 接引擎的契约排错（导出未转发、动作形状、驱动循环死锁、重复渲染）。引擎测试全绿但 UI 不对时看它。
- **wechat-miniprogram-fix-class** — 微信 IDE 配置错误、worker path empty、edit 工具兜底、逐锚点替换脚本。
- **windows-cn-batch-encoding** — PowerShell 内联脚本引号切碎、GBK/UTF-8、CLI 输出乱码。

## 支持文件

- `references/camp-push-wind-headname.md` — §7 推风目标选择与 §9 头名追踪的完整代码与自查清单。改 `src/push-wind.js` / `src/win-loss.js` 前读。
- `references/state-field-preservation.md` — §1 handler 返回的字段保留与失败路径引用同一性。写 handler 返回或排查"老测试突然红"前读。
