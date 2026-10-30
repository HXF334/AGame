# 测试报告

**更新时间**：2026-10-30 21:00 (Asia/Shanghai) · 版本 **v0.32.0**
**总测试套件**：**67** · 相关回归全绿（16 个套件）· 全量回归待跑
**入口**：`docs/VERSION.md` §2（启动/测试/构建）

---

## 1. 怎么跑

```bash
cd da-a-game

node tests/_runall.js            # 全量（55 套件）
node tests/_runall.js 3          # 3 轮
node tests/_runall.js 10 20      # 只跑第 11~20 个（1-based 闭区间）
node tests/test-ui-phase-gate.js # 单个套件
```

> `tests/_runall.js` 每个子进程带 **60s 超时** —— `test-perf.js` 跑满 1000 局
> 会把 exec 会话拖到被切断。**它曾经不存在**（文档引用了但文件缺失），
> 2026-10-23 补上，2026-10-24 修了区间参数 off-by-one。

---

## 2. 测试纪律（硬要求，2026-10-24 00:04 用户纠正）

| 改动范围 | 跑什么 |
|---|---|
| 单个函数内部 | 直接覆盖它的 1~2 个套件 |
| `game.js` 流程控制 | 该流程涉及的套件 |
| `src/` 某个模块 | 该模块的套件 + 1 个端到端 |
| 一次改多条 / 改公共契约 / **大任务收尾** | **全量** |

**答不出「哪个测试会因为这个 bug 而失败」= 没测**，跑全量也抓不到。

> 违规记录：2026-10-24 当晚每改一点 UI 就跑全量 55 套件，一天跑了七八遍。
> 规则早写在 `AGENTS.md`，**写了没执行等于没写**。

---

## 3. 本版新增的套件

### `tests/test-ui-phase-gate.js`（55 项）
阶段闸门 / 统一按钮 / 结算画面 / UI 日志 / 出牌失败提示，8+2 个小节：

| 小节 | 覆盖 |
|---|---|
| 1 | 真人默认丁位 |
| 2 | 阶段拆分与【下】推进（含「有资格时【下】被阻止」）|
| 3 | 逐档推进到 PLAY（阶段/资格日志/首出权）|
| 4 | 出牌阶段按钮（无阶段按钮残留 + 可用性随轮次）|
| 5 | 统一按钮模型与命中（含「禁用按钮不可命中」）|
| 6 | 出牌失败提示（提示出现 / 不再回退逐张试 / 未自动换牌 / 选牌被保留）|
| 7 | UI 日志与 Log 开关（默认隐藏 / 切换不影响记录 / 面板有内容）|
| 8 | 结算画面（五人姓名 / 下一局按钮）+【下一局】重置 |
| 10 | **死锁回归**：`phase=PLAY ⟹ currentPlayer 非 null` |
| 11 | **不变量回归**：跨 8 个独立 module 实例（不同随机牌）|

> ⚠️ **总断言数随牌局浮动**（43 / 55 等）—— 第 2 节是**条件分支**
> （真人手里有没有 A 决定走哪条）。不是 bug，但看汇总时要留意。

### `tests/test-eligibility-rules.js`（23 项）
**专门锁资格判据**。2026-10-24 用户实测抓到 `canFanA` 把反A花色判窄
（违反 SKILL §4.4「任意花色都可以；不要求与当前主A花色相同」），
这类「判据抄错规则」的 bug 最需要专门锁：

```
2.1 主A=红桃, 玩家持两张黑桃A -> 有资格, suit='S'   ← 关键回归
2.5 两张A花色不同 -> 无资格(必须同一花色)
2.11 底牌不参与反A资格判断
```

---

## 4. 全量回归（2026-10-24 收尾）

```
套件 55 个, 范围 1-55, 共执行 55 次; 失败 0 次
```

本轮多次交叉确认全绿：`1-53` 一次跑完 / `1-27` / `15-27` / `28-33` / `31-42` /
`34-42` / `35-53` 均为 0 fail。`test-perf.js` 跑 100 局断言全过（单局 ~14ms）。

---

## 5. 无头测试验不到什么（报告口径）

| 验得到 | 验不到 |
|---|---|
| 作用域错误 / 未定义符号 | 像素级视觉（手牌宽度、按钮位置）|
| 状态同步断裂 | 真机触摸坐标精度 |
| 牌张守恒 / 阶段错乱 | 帧率 / 性能 |
| 驱动循环死锁 / 非法行动 | 未 mock 的宿主 API 的真实行为 |
| 信息边界泄露 | **触达性**（按钮能否被点到）|
| 事件处理抛异常 | **判据本身对不对**（测试可能照抄了错判据）|
| 触摸坐标 → 命中 → 出牌 端到端映射 | |

> **说**「无头测试 55/55 通过，IDE 目视已做」**不要说**「画面正常」。
> 2026-10-24 三个 P0 里有两个**只有真机能发现**。

---

## 6. 套件清单

引擎 39 · 界面/驱动 16（55 总）

```
test-ai-*.js            test-play.js               test-scoring-deep.js
test-capture.js         test-push-wind*.js         test-state-immutability.js
test-double-bigA.js     test-pushwind-*.js         test-ui-phase-gate.js
test-eligibility-rules.js  test-reveal-bottom.js   test-ui-touch-contract.js
test-forced-check-establishedby.js  test-robustness.js
test-game-headless.js   test-scoring.js            test-liang-double-a.js
test-game-scenarios.js  test-order-independence.js
test-pair-bigA-not-boost.js  test-phase2.js
test-perf.js            test-push-wind-camp.js
```

---

## 7. 尚未覆盖

- 像素级真机表现（`test-ui-touch-contract` 只锁逻辑契约）
- IDE 人工对局的完整录像级回归
- 长时间运行的内存/性能曲线（`test-perf.js` 只跑局数与吞吐）

---

## <!-- 2026-10-30-batch --> 测试刷新（2026-10-30 21:00 (Asia/Shanghai)）

- **套件总数**：67（本批新增 6 个：test-ui-hint-straight / test-ui-liang-a-suit / test-ui-liang-countdown / test-ui-display-batch / test-ui-toast-countdown / test-ui-roundend-out）。
- **本批相关回归全绿**：test-ui-pass-replace 14/0、test-ui-pass-display 9/0、test-ui-roundend-out 5/0、test-ui-hint-straight 5/0、test-ui-liang-a-suit 16/0、test-ui-liang-countdown 6/0、test-ui-display-batch 13/0、test-ui-toast-countdown 10/0、test-doplay-fallback 28/0、test-ui-phase-gate 57/0、test-ui-v14 40/0、test-game-headless 24/0、test-game-touch 27/0、test-game-scenarios 36/0、test-combos 20/0、test-ai 9/0、test-audit-ui 16/0、test-eligibility-rules 23/0。
- **变异测试**：连张枚举退回旧实现 → 精确失败 3 条（复现「提示: 当前没有可用牌」）；双大王枚举退回 → 精确失败 3 条；轮末清牌退回 → 精确失败 1 条。
- **flaky 治理**：test-ui-pass-display 原来随机手牌 + AI 无头同步抢跑 → 同一份代码跑出 9/0、7/2、5/4 三种结果。已改成指定手牌 + 固定 human，连跑 3 次都是 9/0。
- **待办**：全量回归（67 套件）还没跑。

