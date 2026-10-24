---
name: "wechat-minigame-ui"
description: "微信小游戏 Canvas 界面实现——横屏画布与 dpr、手牌布局、hitbox 单一来源、按钮由状态推导"
---

# 微信小游戏 Canvas 界面实现

微信小游戏是 **Canvas 单页**（不是小程序 WXML/WXSS 栈）：没有 DOM、没有 CSS、没有
`pageOrientation`，布局全靠自己算像素。本 Skill 只讲**怎么把界面写对**。

## 归属判断（先分流，别走错 Skill）

| 你遇到的是 | 去哪里 |
|---|---|
| 小程序（WXML/WXSS/JSON）错误类、`pageOrientation` 漏配、config 验证 | `wechat-miniprogram-fix-class` |
| 引擎测试全绿但 UI 无响应/元素缺失/重复渲染 | `game-ui-engine-contract` |
| **规则本身算错** | `dada-a-game-rules`（唯一依据），实现坑见 `dada-a-game-impl` |
| **Canvas 界面怎么写对**：画布尺寸、手牌布局、hitbox、按钮模型、面板几何 | 本 Skill |

---

## 1. 画布尺寸：CSS 像素 vs 物理像素

小游戏拿到的 `screenWidth` / `windowWidth` 是 **CSS 像素**；`canvas.width` 若乘了
`pixelRatio` 就是**物理像素**。两套混用会让所有坐标错位一个倍数，且**高分屏才错**。

**定死一条规矩：画布逻辑坐标一律用 CSS 像素，绘制前统一缩放。**

```js
var dpr = wx.getSystemInfoSync().pixelRatio || 1;
canvas.width = W * dpr;   // 物理像素, 只给 GPU
canvas.height = H * dpr;
ctx.scale(dpr, dpr);      // 之后 ctx 的坐标就是 CSS 像素
var W = wx.getSystemInfoSync().windowWidth;   // CSS 像素
var H = wx.getSystemInfoSync().windowHeight;
```

**触摸坐标必须用同一套**：触摸事件的 `clientX/clientY` 是 CSS 像素，直接与 CSS 像素的
hitbox 比较，**不要再乘除 dpr**。判定方式：一行日志同时打出
`canvas.width / windowWidth / pixelRatio` —— `canvas.width / windowWidth ≈ dpr` 就说明
画布是物理像素而触摸是 CSS 像素，此时**要么 `ctx.scale` 统一，要么 hitbox 全部换算**，
二选一，不能各算各的。

**完成判据**：在任意 dpr 下，同一个视觉位置用手指点到，与用代码模拟的 `clientX/Y`
命中的实体一致。

---

## 2. 横屏布局：先定可用矩形，再摆元素

横屏不等于「宽」——**高度才是稀缺资源**（常见 844×390，可用高度不到 400px）。

**先算可用矩形，别边写边调**：

```
顶部条     y ∈ [0,      0.08H]     玩家切换/开关按钮
信息区     y ∈ [0.10H,  0.34H]     phase/mode/主A 等黄字
中央区     y ∈ [0.30H,  0.60H]     桌牌
手牌区     y ∈ [0.62H,  0.88H]     玩家手牌
操作区     y ∈ [0.88H,  1.00H]     按钮行
```

**铁律**：
- 任何元素的上沿**不得低于它所属区的上沿**，下沿不得越过下一区的上沿。
- 按钮行固定在 `H*0.93` 附近，**其它元素不得压到 `H*0.88` 以下**。
- 加元素前先算它落在哪一区；**跨区就说明分区错了**，先改分区。

**完成判据**：每个元素的 `y` 与 `y + height` 都能说出它属于哪一区，且不越界。

---

## 3. 手牌布局：手牌满时不能溢出

手牌最多 22 张。横屏常见可用宽度约 700~800px。

**用「重叠 + 抬升」而不是「缩小」**：

```
牌宽 w = 46
第 i 张 (0-based) 的 x = startX + i * step
step = min(w, (可用宽 - w) / (n - 1))     n>1；n==1 时 step=0
重叠时给选中/可点的牌加 y 偏移抬起来
```

- `step < w` 就是重叠。**重叠必须有抬升**，否则后一张完全盖住前一张的点数。
- 抬升偏移量与重叠量成正比：`lift = (w - step) * 0.6`。
- **完成判据**：n=22 时最后一张的右沿 `<= 可用宽`；且相邻两张至少露出牌点数所在的宽度。

**反过来：不要让手牌区被按钮行压住。** 手牌下沿 = `手牌区下沿`，按钮行起点 = `操作区上沿`，
两者必须留 4~8px 间隙。

---

## 4. 触摸 hitbox：**写坐标的对象与读坐标的对象必须是同一份**

这是小游戏最常见的「点了没反应」根因。

**反模式**（会 100% 点不到）：

```js
function hitTest(x, y) {
  var list = buildButtons();          // ← 新对象，没有 x/y/w/h
  for (...) if (x >= b.x && ...)      // x >= undefined → 恒 false
}
```

**正确模式**：

```js
var hitboxes = [];                     // 模块级持有
function layout() {                    // 布局阶段：只算坐标
  hitboxes = buildButtons().map(assignGeometry);
}
function hitTest(x, y) {               // 命中阶段：只读已算好的
  return hitboxes.filter(function (b) { return b.enabled; })
    .filter(function (b) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; })[0];
}
```

**铁律**：
1. 坐标**只在布局阶段算一次**，存进模块级数组。
2. 命中测试**只读那个数组**，绝不重新生成。
3. 禁用元素**从命中集合里剔除**（`enabled=false` 的按钮不该吃掉点击）。
4. 布局与绘制**分离**：无 canvas 时也把坐标算出来（用默认视口尺寸），
   这样无头测试能验证命中区，不用真机。

**完成判据**：按钮中心点命中自己；按钮之间的间隙与区外不命中；禁用按钮不命中。

---

## 5. UI 状态由游戏状态推导，不要维护并行布尔值

多个位置各自判断 `phase` / `currentPlayer` 来决定显示什么，必然出现互相冲突
（这个按钮亮了那个没亮）。

**单一来源**：

```js
function uiButtons() {                 // 唯一入口: 返回 [{id, label, enabled}]
  var out = [];
  if (phase !== PLAY && phase !== GAME_END) {
    if (gateChoice && gateChoice.kind === 'LIANG_A') {
      out.push({ id: 'liangA',   label: '亮A', enabled: !!gateChoice.eligible });
      out.push({ id: 'noLiangA', label: '不亮', enabled: !!gateChoice.eligible });
    }
    // [2026-10-24 用户要求] **不提供【下】**: 各阶段自动判断能否进入下一阶段。
    //   需要真人决策时**停下等真人点**, 决策完自动续跑(gateAutoAdvance)。
    //   若保留「跳过」按钮且在有待决策时可用, 等于给了一条绕过玩家决策的路径。
  }
  if (phase === PLAY) {
    out.push({ id: 'play', label: '出牌', enabled: currentPlayer === humanPlayer });
  }
  if (phase === GAME_END) out.push({ id: 'newGame', label: '下一局', enabled: true });
  return out;
}
```

**要点**：
- **资格不具备时按钮仍然显示，但 `enabled=false`** —— 玩家需要知道「有这个操作但我不符合条件」，
  直接不显示会让玩家以为自己漏看了什么。
- **不要提供「跳过后续阶段」的按钮**。让「跳过」在需要亮A/反A选择时仍然可用，
  等于给了一条绕过玩家决策的路径。
- **每一档状态的「进入该状态后要做的事」收进统一入口函数**，所有能触发状态转换的地方都调它。
  分散在多个入口的补丁逻辑必然漏一处（漏掉的那处会表现为「某个阶段按钮全灰 / AI 不出手」）。

**完成判据**：把 UI 相关的判断全部收进 `uiButtons()` 后，`grep` 渲染与命中代码里
不再出现独立的 `phase ===` 判断。

---

## 6. 面板与提示几何：行数 × 间距 × 起点 联动

日志面板、结算面板、提示条都吃同一套几何。

```
末行 y = 起点 + (n - 1) × 间距
```

**三条上界都要查**：
1. `末行 y < H` —— 没出屏
2. `末行 y < 交互区上沿` —— 没压到按钮（**只看 H 会漏掉这一条**）
3. `间距 × H > 字体像素` —— 不视觉粘连（13px 字体实测 `间距 ≈ 0.029H` 偏挤，`0.023H` 太挤）

**加行数必然要压间距或抬起点**，先算再改。面板宽度同理：`起点 + 宽度 <= 画布宽`。

**提示条**：用「有文字 → 显示，N 秒后自动消失」的 toast，不要常驻。宽度按
`measureText` 量出来 + padding，**不要写死**，否则中文与英文宽度不同会溢出。

**完成判据**：面板最坏情况（最长的一行文本 + 最大行数）不越界、不压按钮。

---

## 8. 行尾：必须 LF，CRLF 会让打包器直接崩,,**微信小游戏的打包器不容忍 CRLF。** 源文件被改成 CRLF 后，真机直接报：,,```,WAGame.js:1 SyntaxError: MiniProgramError,Invalid or unexpected token(env: Windows,mg,2.02.2608080; lib: 3.17.5),```,,**`node --check` 是过的** —— JS 规范允许 CR 当行结束符，所以本地语法检查完全测不出来。,报错位置是打包后的 `WAGame.js:1`，与源文件行号无关，看不出是哪个文件。,,**排查手法**：数行尾分布，CRLF 与裸 LF 必须分清：,,```js,var s = fs.readFileSync(f, 'utf8');,var crlf = 0, lone = 0, lf = 0;,for (var i = 0; i < s.length; i++) {,  var c = s.charCodeAt(i);,  if (c === 13) { if (s.charCodeAt(i + 1) === 10) { crlf++; i++; } else lone++; },  else if (c === 10) lf++;,},console.log(f, { crlf: crlf, lone: lone, lf: lf });   // 期望 crlf=0,```,,**写文件时保持原行尾**：`split(/\r?\n/)` 之后要用**与原文件一致**的分隔符 join。,仓库是 **LF**（已用 `.gitattributes` 的 `eol=lf` 锁定），`join('\r\n')` 会把整个文件改坏。,,**完成判据**：改完的行尾分布与改动前一致；`node --check` 通过**不代表**打包能过 ——,行尾类问题只能靠上面的计数检查 + 真机确认。,
## 7. 收尾自检

- [ ] `node --check` 所有改过的 `.js` 通过
- [ ] 画布逻辑坐标与触摸坐标是**同一套**（CSS 像素或物理像素，二选一并贯穿）
- [ ] 每个元素都属于某个分区，不越区、不压按钮行
- [ ] 手牌满（22 张）不溢出，重叠时抬升可见
- [ ] hitbox 与按钮坐标**来自同一份对象**，禁用按钮不参与命中
- [ ] UI 判断全部收在 `uiButtons()`，渲染与命中代码里没有独立的 phase 判断
- [ ] 面板最坏情况不越界；提示条宽度按文字实测
- [ ] 在**没有 IDE** 的情况下，无头测试能验证命中区（布局与绘制已分离）
- [ ] **真机点一遍**：每个按钮、每张手牌都点过，确认响应与预期一致
      （无头测试没有「点」这个动作，触达性只有真机能验）

---

## 相关 SKILL

- `game-ui-engine-contract` — 界面/引擎**契约排错**（导出未转发、动作形状、驱动循环死锁）、无头 UI 测试、触摸映射四档必测
- `wechat-miniprogram-fix-class` — 小程序（WXML/WXSS）错误类与 IDE 配置
- `dada-a-game-rules` — 规则手册，改规则前必查
- `windows-cn-batch-encoding` — 中文 Windows 编码与 PowerShell 内联脚本切碎
