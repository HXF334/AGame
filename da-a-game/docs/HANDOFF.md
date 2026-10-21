# 交接文档（HANDOFF）

**最后更新**：2026-10-20 20:14
**目标读者**：未来接手本项目的开发者 / AI 协作会话

---

## 1. 项目一句话

用 OpenClaw + MiniMax API 独立开发内蒙古打大A微信小游戏。当前 25 套件 / 589+ 项测试全过，规则引擎 < 1ms/局。UI 在用户目视验证阶段。

---

## 2. 必读清单（新会话第一件事）

按顺序读完以下 5 份文档，约 15 分钟：

1. **`docs/PROJECT_STATUS.md`** —— 当前完成度、关键修复、风险、下一步建议
2. **`docs/PROGRESS.md`** —— 开发批次与里程碑，按时间顺序
3. **`docs/TEST_REPORT.md`** —— 25 套件 / 589+ 项 / 性能数据 / 已知局限
4. **`docs/KNOWN_ISSUES.md`** —— 真实 bug / 性能特征 / 设计陷阱
5. **`docs/PROGRESS.md` 第 5 节「D-A-B：UI 可用后的并行任务」**

然后读：

6. **`skills/da-a-game-rules/SKILL.md`** —— 唯一规则来源（15 章）
7. **`src/index.js`** —— 规则引擎统一出口（看导出清单）
8. **`src/transition.js`** —— 9 个 handler + transition 入口（最长一个模块）

---

## 3. 快速命令清单

```bash
cd C:\Users\MyFirstAI\.openclaw\workspace-work\AGame\da-a-game

# 全部测试（耗时 < 1s）
foreach ($f in Get-ChildItem tests/test-*.js) { node $f.FullName }

# 性能（1.4s）
node tests/test-perf.js 1000

# 语法检查
foreach ($f in Get-ChildItem src/*.js) { node --check $f.FullName }

# 触发 WeChat IDE
& ..\tools\wechat-cli.ps1 open --project "$(Resolve-Path .)" --appid "wx99808147273cdea1"

# 刷新 docs（每次任务结束）
# 更新 PROJECT_STATUS / PROGRESS / HANDOFF / KNOWN_ISSUES / TEST_REPORT
```

---

## 4. 关键架构决策

### 4.1 内部 ID = A-E，显示名 = 甲乙丙丁戊
- `state.players[i].id` 保持 `'A'`/`'B'`/`'C'`/`'D'`/`'E'` 不动
- 显示名转换在 `game.js`：`names = ['甲', '乙', '丙', '丁', '戊']`
- **不要**改 ID —— 全部测试断言都用 A-E

### 4.2 state 是不可变快照
- 每个 handler 返回 `ok({ 新字段列表 })` 或 `err({ 错误 }, 原 state)`
- `transition()` 出口统一 `Object.assign({}, state, _r.state)` 合并（零侵入）
- 失败路径返回**原 state 引用**（origState），通过性通过保证
- **不要**在 handler 里直接 mutate state

### 4.3 阵营字段的双路径推导（统一到 src/util.js）
1 处实现 `camps(state)`，3 处调用（`win-loss.js` / `push-wind.js` / `scoring.js`）：

```js
// src/util.js
function camps(state) {
  if (!state || typeof state !== 'object') {
    return { main: [], takers: ALL_PLAYER_IDS.slice() };
  }
  var mainA = (state.主A && state.主A.establishedBy) || null;
  var ci = state.次方 || null;
  if (mainA) {
    var main = [mainA];
    if (ci && main.indexOf(ci) < 0) main.push(ci);
    return {
      main: main,
      takers: ALL_PLAYER_IDS.filter(function (i) { return main.indexOf(i) < 0; })
    };
  }
  // 回退：测试构造 / 早期阶段
  var main2 = (state.主方 || []).slice();
  if (ci && main2.indexOf(ci) < 0) main2.push(ci);
  return { main: main2, takers: (state.抓方 || []).slice() };
}
```

**主路径 = 主A.establishedBy + 次方（唯一真来源，transition 不会丢）**
**回退 = state.主方 / state.抓方（早期阶段 / 测试构造）**

### 4.4 N 自动推导（§11.2）
`calculateScore(state, result, n)` 中 `n` 可选。未传时按 `autoDeriveN(state, winner)` 推导：
- **主方胜**：N = 抓方阵营中手牌非空的人数（动态，1V4 不用 N）
- **主方失败**：查表（主A×次A × 出完/未出完 → 2/1/3）
- 向后兼容：显式传 `n` 仍生效

---

## 5. 已知陷阱（不要踩）

| 陷阱 | 后果 |
|---|---|
| ❌ 直接 mutate state | 破坏不可变快照 |
| ❌ 在 handler 里返回 `ok({ phase, players })`（不全字段列表）| **已 OK**，transition() 出口会补全，但其他可能没用 merge 的代码会丢字段 |
| ❌ 改 `state.players[i].id` 从 `'A'` 到别的 | 全部测试断言崩 |
| ❌ 在 PowerShell 里嵌带中文双引号的复杂字符串 | mojibake 匹配失败，改用 node 脚本 + `\u` 转义 |
| ❌ **写补丁脚本时漏 `fs.writeFileSync`** | 改动在内存里但没落盘，测试白挂一轮 —— **写完立即回读验证** |
| ❌ 假设 `state.主方`/`抓方` 一定有值 | 必须用双路径（§4.3）或 `camps()` |
| ❌ 用单字符串 pattern 配中文字符 | 改用 ASCII 锚点（行号 / 唯一英文变量名）|
| ❌ 跑 perf 测试只关心吞吐 | 完成率 0% 就是引擎 bug 信号，调试完再看数字 |
| ❌ **line-based splice 留孤立代码** | 找 `});` 时只匹配第一个，会造成 8 行遗留；用第二遍 splice 清掉 |
| ❌ **"测试预期与 SKILL 不一致"** | 改了实现后，旧测试断言可能过期，必须**逐项对照** §11.2/§10 等规则 |
| ❌ **局部 const 名 = 外层函数名** | 会屏蔽外层函数（game.js 旧 bug cardDescFull_cardDesc → 局部 const 改名 cardText） |
| ❌ **`state` vs `gameState` 混用** | game.js 内全局变量叫 gameState，但 runAI 局部用 state 引用会 ReferenceError |

---

## 6. 跨会话协作约定

1. **每次新任务先 grep**：发现 bug 模式时，扫整个仓库的同类依赖点（A 任务只修了 win-loss / push-wind / transition，**漏了 scoring.js**，被 test-scoring-deep.js 挖出）
2. **修改 game.js 前先在 node 里跑测试**：`game.js` 有 `typeof wx !== 'undefined'` 守卫，可加载不 crash，但 draw() 等 UI 函数在 node 里静默
3. **不要删临时文件 `tests/_*.js`**（除非确认落盘成功并 `Remove-Item` 真的删了）
4. **每次任务后刷新 5 份 docs**（用户要求每天更新）
5. **接到新指令时，先看 `docs/PROGRESS.md` 最近的里程碑 + `docs/KNOWN_ISSUES.md`** —— 不重复造轮子

---

## 7. UI 实测指南（用户在 IDE 验证）

1. 触发 WeChat IDE：`& ..\tools\wechat-cli.ps1 open ...`
2. **目视验证清单**（按顺序）：
   - 顶部 5 个 "甲/乙/丙/丁/戊" 按钮可切换 humanPlayer
   - 中部 "我的牌(甲): ♥A ♦5 ..." 按大小排序（大→左）
   - log 应含 "PLAY A 出 ♥5" 之类的完整牌描述
   - **AI 出牌 log 也含牌描述**（D 任务加的，需验证实际生效）
   - AI 出牌优先小牌（先出 4，再出 5）
   - 出牌/过牌/推风 3 按钮可点
   - 1 真人对 5 AI 可完整跑到 GAME_END
   - **手牌宽度自适应**：不能超出屏幕（D 任务 tap-to-select 加的 cardW=50/张，按 14 张手牌需自适应）
3. **不要**靠点击 IDE 按钮验证 game.js 的逻辑 —— 逻辑已由 25 套件覆盖
4. **重点验证**：UI 不崩溃、显示不 undefined、按钮位置正确（IDE 模拟器分辨率可能影响 draw() 的坐标计算）

---

## 8. 联系信息

- 项目 owner：`gateway-owner`
- AppID：`wx99808147273cdea1`
- AppID 测试者：通过 OpenClaw MiniMax API 自动开发
- 文档维护：每个任务批次结束时更新 `docs/PROGRESS.md` 和 `docs/PROJECT_STATUS.md`（用户要求：每天）