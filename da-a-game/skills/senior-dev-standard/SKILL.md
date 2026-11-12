---
name: senior-dev-standard
description: 开发工作流总纲——最小改动、先读后改、写完必测；Git 提交/推送纪律；中文 Windows 的编码与 PowerShell 内联脚本坑。适用于本仓库所有代码与命令行操作。
---

# 开发工作流（代码 / Git / Windows 编码）

本 Skill 管**怎么改、怎么提交、怎么在中文 Windows 上安全执行命令**。
游戏规则以 `da-a-game-rules/SKILL.md` 为唯一来源；本 Skill 不参与判定牌型、压制、计分。

> 仓库级入口与红线见 `AGENTS.md`；两者冲突时以 `AGENTS.md` 为准。

---

## 1. 代码修改

1. **先读后改**：修改前完整读目标文件与相邻测试；只改目标段落，不顺手重构、不改无关格式。
2. **最小改动**：能改一行不改整个函数，能改一个函数不改整个文件；不因小 bug 重写模块。
3. **红线文件**：未经明确指令不改 `project.config.json`、`game.json`、`app.json`；不新增 npm 依赖/构建工具/框架。
4. **不碰规则**：牌型、压制、计分、阶段语义只认 `da-a-game-rules`；代码里不得私设规则。
5. **注释保留**：保留原有中文注释与命名风格；新增逻辑写清「为什么」。

## 2. 测试

1. **写完必测**：新增/修改逻辑必须补测试；先跑受影响套件，再跑全量（`node tests/_runall.js`）。
2. **断言锁性质**：合法/不合法、状态不变、不崩、分数守恒；不写死「必须出某张牌」。
3. **确定局面**：无头测试用 `tests/lib/state-builder.js` 固定手牌/桌面/身份；不依赖随机发牌与真实计时器（D-008）。
4. **失败先复现**：修 bug 先写会失败的用例（或临时退回旧实现验证断言确实变红），再修。
5. **看数字不看措辞**：套件通过数、失败数、退出码是判据；runner 把进度写 stderr，`[exit code: 1]` 可能只是 PowerShell 包装。

## 3. Git 纪律

### 改前
```powershell
git status -sb
git log --oneline -5
git diff --stat
```
- 工作区有别人的改动/临时产物时先问，不 `git add -A`；逐个 `git add <path>`。
- 提交前清掉探针脚本、临时输出、`_` 前缀中间文件。

### 审查
- 逐行读 `git diff`（不只 `--stat`）：无关格式化、调试 `console.log`、注释掉的代码、误删整段、混两个主题 → 拆出去。
- 判据：每一行都能一句话说清「为什么改」。

### 提交
- **一个提交一个主题**；消息用 `git commit -F msg.txt`（不要 `-m`，PowerShell 会切碎引号且失败会被下一条命令掩盖）。
- 正文写：为什么改、怎么验证、顺带修的同类问题。
- 提交后必须 `git log --oneline -1` 确认真的产生提交。

### 推送
- **每任务结束 push 一次；成功失败都只尝试一次**。失败就停、记录报错，留到下次一并推；不重试、不后台再推。
- 失败性质：网络类 → 等；`Permission denied/403` → 改凭据；`non-fast-forward/rejected` → 先 `git fetch` 再决定；`src refspec does not match` → 改名字。
- 判定看退出码（`$LASTEXITCODE`），git 把进度写 stderr 会触发 `NativeCommandError`，不代表失败。
- 推后回读：`git status -sb`（无 ahead）、`git log origin/main --oneline -1`。

### 回滚
- 已推送的历史不改写：用 `git revert`。
- `reset --hard` 前必须 `git status`（未提交改动会直接丢）；回退后跑相关测试。
- 发版打 annotated tag（`git tag -a`），tag 与分支分别确认推送。

## 4. 中文 Windows / PowerShell

### 写文件编码
- `.bat`/`.cmd`：cmd.exe 按系统代码页 **GBK(936)** 读，UTF-8（无论有无 BOM）都会乱码；整份文件用 GBK 存，行尾 CRLF，首行 `chcp 65001` 无效。
- `.ps1`：PowerShell 认 **UTF-8 with BOM**，不认 GBK；含中文的 .ps1 必须 BOM，否则字面量整段被坏。
- 仓库源码：UTF-8 **无 BOM** + **LF**（CRLF 会让微信打包器报 `WAGame.js:1 SyntaxError`，`node --check` 查不出）。

### 内联脚本
- `node -e "..."`、`powershell -Command "..."`、`git commit -m "..."` 会被 PowerShell **先解析一遍**：内层引号、`{}`、`$`、反引号都可能被吃掉，报「参数列表中缺少参量」「无法将 xxx 识别为 cmdlet」或 `SyntaxError`。
- 修法：内联只留无嵌套引号/括号/`$`/中文的调度命令；任何多行逻辑写成 `.js`/`.ps1` 临时文件再跑，跑完删除。

### 读子进程输出
- PowerShell 默认 `$OutputEncoding=US-ASCII`，Node/Electron 默认写 UTF-8 → 中文与 `√` 变乱码。
- 先试 `$OutputEncoding=[Text.Encoding]::UTF8; chcp 65001`；仍乱则用 `Start-Process -RedirectStandardOutput/-RedirectStandardError`（必须是两个**不同**临时文件）抓 raw bytes，再按 UTF-8/GBK 解码。
- 判成败靠 ASCII 计数与退出码，不靠乱码里的中文。

### 常用自检
```powershell
$bytes = [IO.File]::ReadAllBytes($path)
$bom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
```
- 行数/中文读取用 `[IO.File]::ReadAllLines($path)`；`Get-Content` 会把无 BOM UTF-8 当 GBK。

## 5. 收尾清单
- [ ] 只改了目标文件，diff 每行可解释
- [ ] 受影响套件 + 全量测试通过（失败 0）
- [ ] 新行为有测试，断言锁性质
- [ ] 提交单一主题，`git log -1` 已确认
- [ ] push 只尝试一次；失败已记录
- [ ] 文档/状态（`PROJECT_STATUS.md`）已同步
