# 规则 ↔ 实现 ↔ 测试 对账表

**生成日期**：2026-10-24 · **对账基线**：规则手册 §13 的 20 条必测用例（仓库唯一来源 `skills/da-a-game-rules/SKILL.md`）

## 为什么要做这个

2026-10-24 晚上出了一个 P0：**持双大A 的玩家被判「无反A资格」**。
根因不是引擎错（引擎 `handleFanA` 一直是对的），而是**UI 层自己写的资格判定抄错了规则**；
而**测试照抄了那个错判据**，所以 55 个套件全绿。

> **测试验证的是「实现与测试一致」，不是「实现与规则一致」。**
> 本表就是为查这一类问题而做的。

## 方法（两轮，刻意不靠"命中"下结论）

1. **第一轮 · 原始命中**：每条用例的关键词在 `src/` 和 `tests/` 的命中文件数。
2. **第二轮 · 真实覆盖**：**剔除注释后**再数（`/* */` 与 `//`，字符串内的不算）。
   依据 `game-ui-engine-contract` §2.3：**注释不是断言**，「命中」不等于「覆盖」。
3. **第三轮 · 复核**：对 `impl=0` 的用例换用**实现侧真实标识符**（数字/英文）再查一遍，
   排除"实现缺失"与"关键词选错"这两种可能。

## 结果

| 指标 | 结果 |
|---|---|
| 20 条用例有实现 | **20/20** |
| 20 条用例有真实覆盖（剔除注释后仍命中） | **20/20** |
| **弱覆盖**（原始命中>0 但剔除注释后=0，即只有注释提到） | **0 条** |
| 规则与实现/测试的不一致 | **发现 1 处，已修**（见 §A.1） |

## §A.1 发现的不一致（已修）

**规则 §13 第 6 条与 §4.4 冲突** —— §4.4 已在 2026-10-24 按用户裁定写明「反A 的两张同花色A
**不得与主A同花色**」，但 §13 的必测用例第 6 条仍只写「同花色两张A」，**漏了花色限制**。

后果：如果只看 §13 造用例，就会造出「主A=红桃、玩家持两张红桃A → 可以反A」的用例 ——
**这正是今晚那个 bug 的判据**。已把 §13 第 6 条补齐，与 §4.4 对齐。

> **教训**：规则手册**内部**也会不一致。§13 是"照着它写测试"的入口，
> 它比 §4 少一个限定条件，**照它写测试就会把 bug 固化成"期望行为"**。

## §A.2 逐条对账表

| # | 规则原文（SKILL §13） | 实现位置 | 测试覆盖 | 结论 |
|---|---|---|---|---|
| 1 | 108张牌无重复实体ID；发牌后前三人22张、后两人21张 | `src/deal.js src/card.js` | test-deal.js test-game-scenarios.js | 已覆盖 |
| 2 | 底牌: 最后发牌是底牌；翻开前不参与亮A/反A；只见自己的 | `src/deal.js src/transition.js` | test-phase2.js test-reveal-bottom.js test-fan-a.js | 已覆盖 |
| 3 | 第一个有效亮A决定主A；其他普通亮A被拒绝 | `src/transition.js handleLiangA` | test-phase2.js test-skill-coverage.js | 已覆盖 |
| 4 | 强制排查按发牌顺序；同花色两张A跳过该花色 | `src/transition.js handleForcedCheck` | test-forced-check-establishedby.js test-phase2.js | 已覆盖 |
| 5 | 没有可排查单A时红桃A自动主方 | `src/transition.js handleForcedCheck(兜底)` | test-forced-check-establishedby.js test-phase2.js | 已覆盖(标识符在注释里, 已复核) |
| 6 | 反A: 同花色两张A + **不得与主A同花色**；多人反A只有首个成功 | `src/transition.js handleFanA + canFanA` | test-fan-a.js test-fan-a-e2e.js test-eligibility-rules.js | 已覆盖 + **规则已对齐(见 §A.1)** |
| 7 | 两张大A分属两人=2V3，同一人=1V4；次方公开才算2V3明打 | `src/transition.js REVEAL_BOTTOM/CHOOSE_IDENTITY` | test-scoring-deep.js test-reveal-bottom.js test-liang-double-a.js | 已覆盖 + **v0.11.0 已改双大A默认暗打** |
| 8 | 首轮出牌权优先级 | `src/win-loss.js determineFirstPlayer` | test-first-player.js test-liang-double-a.js | 已覆盖 |
| 9 | 点数顺序 QKA最大/A23最小/K-A-2不合法 | `src/hand-types.js src/combos.js` | test-hand-types.js test-order-independence.js | 已覆盖(标识符在注释里, 已复核) |
| 10 | 龙必须同张数互压；牌型不能跨压；双龙专属规则 | `src/hand-types.js` | test-hand-types.js test-straight-invalid.js | 已覆盖 |
| 11 | 双大A独立出牌无敌；混第三张A变普通蛋子；单大A/单王/双王压制 | `src/hand-types.js src/play.js` | test-hand-types-batch2/3.js test-pair-bigA-not-boost.js | 已覆盖 |
| 12 | 乙出5555丙丁过牌, 戊用444取走; 目标移入戊手牌 | `src/capture.js executeCapture` | test-capture.js test-capture-target-expiry.js | 已覆盖(标识符在注释里, 已复核) |
| 13 | 取牌数量比目标少一张; 王不能被取; 至少两个4才能取 | `src/capture.js src/hand-types.js` | test-capture.js test-hand-types.js | 已覆盖(标识符在注释里, 已复核) |
| 14 | 新出牌让旧取牌目标失效; 全员过牌时未取走目标失效; 过牌重置 | `src/capture.js src/play.js` | test-capture-target-expiry.js test-ai-modes.js | 已覆盖(标识符在注释里, 已复核) |
| 15 | 过牌后同一轮仍可再次参与 | `src/play.js src/transition.js handlePass` | test-play.js test-capture-target-expiry.js | 已覆盖 |
| 16 | 推风跳过已出完玩家; 次方未明时跳过主A; 目标必须行动 | `src/push-wind.js` | test-push-wind.js test-pushwind-trigger-clear.js | 已覆盖 |
| 17 | 1V4明打/暗打胜负边界和计分结果 | `src/win-loss.js src/scoring.js` | test-scoring-deep.js test-win-loss-boundary.js | 已覆盖 |
| 18 | 2V3主方胜动态N、主方败查表、明打倍率2、平局0分 | `src/scoring.js` | test-scoring-deep.js test-reveal-bottom.js | 已覆盖 |
| 19 | 阵营全出完立刻结束; 出完不能再出牌; 结算只执行一次 | `src/win-loss.js src/play.js` | test-ai-integration.js test-e2e-full-game.js | 已覆盖 |
| 20 | 随机完整对局: 无死循环/重复结算/丢牌 | `src/win-loss.js src/play.js` | test-perf.js test-e2e-full-game.js | 已覆盖 |

## §A.3 复核的 5 条（`impl=0` 换标识符后）

这 5 条第一轮在 `src/` 的**真实代码**里找不到关键词 —— 复核后确认是**关键词选错**，
不是实现缺失：`QKA` / `5555` / `红桃` 这类中文与数字混写的词**只出现在注释里**，
实现用的是数字（`rank === 14`）与英文标识符（`executeCapture` / `isValidStraight`）。

| # | 复核用标识符 | 命中实现 |
|---|---|---|
| 5 | 红桃A自动主方(无主A时的兜底) | ✔ 已确认 |
| 9 | 点数顺序 QKA最大/A23最小/K-A-2不合法 | ✔ 已确认 |
| 12 | 4张取牌: 目标移入手牌/桌面移除 | ✔ 已确认 |
| 13 | 取牌数量比目标少一张/王不能被取 | ✔ 已确认 |
| 14 | 取牌目标失效/过牌状态重置 | ✔ 已确认 |

## §A.4 遗留（不属本次对账范围）

- **判据正确性仍需人工过一遍规则原文** —— 本表能证明「实现与测试一致」，
  证明不了「实现与规则一致」。今晚的反A bug 正是后者。
  规则改一次，就要用 §13 重跑一次本对账。
- **§13 与 §4 的一致性没有自动检查** —— 本次是人工发现的。
  候选做法：给 `preflight.js` 加一项「§13 的每条用例关键词在 §4..§12 里都有对应条款」。

---

**相关**：`skills/da-a-game-rules`（规则唯一来源）· `skills/game-ui-engine-contract` §2.3
（探针/grep 三方向都不足为据）· `scripts/preflight.js`（提交前体检）
