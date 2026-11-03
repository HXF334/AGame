---
name: git-safe-workflow
description: Git 操作纪律——改前先看状态、diff 逐行审查、一个提交一个主题、消息用 -F 传文件、推送只推一次失败即停、推后回读远端、reset --hard 前先看工作区
---

# Git 安全工作流

管的是 **Git 操作本身**：检查、审查、提交、推送、回滚。
**不改代码内容**——那是 `senior-dev-standard`；**不改游戏规则**——那是 `da-a-game-rules`。

## 0. 归属判断

| 你要做的是 | 去哪里 |
|---|---|
| 改**代码内容**（最小改动、不碰红线文件、要不要重构） | `senior-dev-standard` |
| 改**游戏规则**（牌型、压制、计分） | `da-a-game-rules`（唯一权威） |
| **Git 操作**：检查、审查、提交、推送、回滚 | 本 Skill |

---

## 1. 改前：先看状态，再动文件

```bash
git status -sb                 # 有没有别人的改动 / 未跟踪产物
git log --oneline -5           # 最近提交在做什么，别在别人的活上叠加
git diff --stat                # 工作区已有多少改动
```

**三条硬规则**：

- **工作区不干净时先问**：已有的改动是谁的？是本次任务的一部分吗？直接 `git add -A` 会把不相关的东西一起提交。
- **提交前删临时产物**：探针脚本、临时输出、结果 txt、`_` 前缀的中间文件。它们会跟着进仓库，下次还要再删一遍。`git status --porcelain` 里出现 `??` 的文件逐个确认去留。
- **绝不 `git add -A` 除非确认过工作区里每一项都该进这次提交**。优先逐个 `git add <path>`。

---

## 2. 差异审查：读完整 diff，不要只看 --stat

```bash
git diff            # 未暂存
git diff --cached   # 已暂存
```

**审查清单**（逐项过，不是走形式）：

- [ ] 有没有**顺手改的无关行**（格式化、注释重排、import 顺序）→ 拆出去
- [ ] 有没有**调试残留**：`console.log`、`TODO`、注释掉的代码块
- [ ] 有没有**混进两个主题**（一个 bug 修复 + 一个重构）→ 拆成两个提交
- [ ] 有没有**误删**：整块函数、整段分支被删掉
- [ ] 新增代码的**边界**对不对：空数组 / null / undefined / 越界索引

**判据**：diff 里每一行都能用一句话说清「为什么改」。说不清的行就是不该在这次提交里。

---

## 3. 提交：拆分与消息

**一个提交一个主题**。混主题的提交会让 `git revert` 变成核弹，也让 bisect 失真。

**消息用文件传，不要用 `-m`**（PowerShell 会把 `-m` 里的引号切碎，详见 `windows-cn-batch-encoding`）：

```bash
git add <path>...                 # 逐个 add，不用 -A
git commit -F MSG.txt
git log --oneline -1              # 确认 commit 真的产生了
```

**消息正文写清三件事**：

1. **为什么改**（不是「改了什么」——diff 自己会说）
2. **怎么验证的**（跑了哪些测试、结果）
3. **顺带修的同类问题**（如果有，说明范围）

**提交前最后确认**：`git diff --cached --stat` 的文件列表符合预期。

---

## 4. 推送：只推一次，失败就停

**推多少次的授权口径以工作区 `AGENTS.md` 开发纪律第 4 条为准**（未授权不 push；获授权后也只推一次）。本节只讲**失败后怎么判断**。

```bash
git push origin main
git push origin <tag>     # tag 要单独推
```

**只推一次**。失败就**立刻停下来**，把提交留在本地，等下一次连同后续提交一起推。
不重试、不后台再推、不空转——连续失败说明是环境问题，多试只会把提交越压越久。

**按错误信息判断性质**（处置都是「停」，区别只在下次推之前要不要先改配置）：

| 错误 | 性质 | 处置 |
|---|---|---|
| `Could not connect to server port 443` | 网络 | 停，等网络恢复；下次一起推 |
| `Recv failure: Connection was reset` | 网络抖动 | 停，同上 |
| `Connection timed out`（**固定时长**，如恒定 21 秒） | TCP 握手就超时 | **调超时参数无效**（`http.lowSpeedLimit` 只管传输阶段，不管握手）；停 |
| `Permission denied` / `403` | 凭据或权限 | **不可重试**，改凭据 |
| `non-fast-forward` / `rejected` | 远端有你没有的提交 | **不可重试**，先 `git fetch` 再决定 rebase 还是 merge |
| `src refspec does not match` | 分支/标签名写错 | 改名字 |

**区分不了就当作「停」**：停下来的代价只是「下次一起推」，强行推错的代价是把坏历史写进远端。

**推 tag 与推分支是两次独立操作** —— 分支推成功不代表 tag 推成功，反之亦然。
发版后要确认两个都上了远端。

---

## 5. 回滚：先分清「撤销提交」和「撤销发布」

| 目的 | 命令 | 后果 |
|---|---|---|
| 回退**内容**，保留历史 | `git revert <sha>` | 产生一个反向提交，**已推送的历史不会被改写** |
| 撤销**本地**未推送的提交 | `git reset --soft HEAD~1` | 改动回到暂存区，**不丢工作** |
| 撤销本地提交并**丢改动** | `git reset --hard <sha>` | **改动丢失**，只在确定要丢弃时用 |
| 回到某个**版本** | `git reset --hard v0.9.0` | 同上，丢工作区改动 |
| 只**看**旧版本不动工作区 | `git checkout v0.9.0 -- <path>` | 把某个路径恢复成旧版内容 |

**铁律**：

- **`reset --hard` 前先 `git status`** —— 有未提交改动时会**直接丢掉**，没有任何提示。
- **已推送的提交不要用 `reset --hard` 改写**。要撤销就用 `revert`，让历史线性可追。
- **回退要验证**：回退后跑一遍相关测试，确认回到的状态是能跑的，不只是「git 说成功了」。
- **发布前打 tag**：`git tag -a v0.10.0 -m "..."`（带注释的 annotated tag，不是轻量 tag）。
  tag 是回退的锚点，没有它就只能靠记忆找历史提交。

---

## 6. 判成败：看退出码，不看错误文本

**git 的 stderr 不是失败信号**：`git push` / `git commit` 把进度（`To https://...`、`* [new branch] main -> main`）写到 **stderr**。PowerShell 经管道读 stderr 时会把这些行包成错误记录，报 `NativeCommandError` 或 `Exit code 1`，**即使操作成功**。

判定顺序：

1. 先看有没有成功标志文本（`-> main`、`[new branch]`、`[main ...]`）
2. 再看退出码：`$LASTEXITCODE`
3. **两者不一致时以退出码为准**——不要把 `NativeCommandError` 当失败

```powershell
git push origin main *> $null
if ($LASTEXITCODE -eq 0) { "PUSH OK" } else { "PUSH FAILED" }
```

网络间歇性不可达时**按退出码**判断成败，不要按「出现了错误文本」判断。

**`git commit -m` 会自掩失败，必须单独查**：commit 失败后紧跟的 `git push` 会输出 `Everything up-to-date`（因为确实没有新 commit），**读起来像推送成功**。看到这条输出不能当作 commit 成功——它同时是"无新提交"和"提交失败"两种情况的输出。**提交后一律核对 `git log --oneline -1`。**

---

## 7. 推完之后

```bash
git status -sb        # 应该显示无 ahead
git log origin/main --oneline -1   # 确认远端真的有你的提交
git tag -l            # 确认 tag 在本地（是否在远端要另外确认）
```

**「命令没报错」不等于「推上去了」**。网络抖动时 git 可能只完成了一半。
**必须回读远端状态**（`git log origin/main`）确认，再报告「已推送」。

---

## 8. 收尾自检

- [ ] `git status` 干净，没有临时产物混进来
- [ ] diff 每一行都能说清为什么改
- [ ] 一个提交一个主题
- [ ] 消息用 `-F` 传文件，正文含「为什么 + 怎么验证」
- [ ] 推送只做一次，失败即停（不重试、不后台再推）
- [ ] 分支和 tag **分别确认**推上去了（回读 `git log origin/main`）
- [ ] 做过 `reset --hard` 的话，回退后跑过测试
- [ ] 有 tag 作为回退锚点

---

## 相关 SKILL

- `senior-dev-standard` — 代码改动纪律（最小改动、不碰红线文件、自动测试）
- `windows-cn-batch-encoding` — 中文 Windows 编码与 PowerShell 内联脚本切碎（提交消息用 `-F` 的根因之一）
- `da-a-game-rules` — 游戏规则唯一来源
