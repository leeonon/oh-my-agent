# pi-ui

Pi coding agent 的 UI 增强扩展包：启动页、思考块渲染、工具卡片、历史折叠、性能剖析，全部在一个包里，源码进 monorepo（`~/.agents/packages/pi-ui`），运行时由 settings.json 以本地路径加载。

```bash
# 开发期本地加载（settings.json packages 数组）
{ "source": "../../.agents/packages/pi-ui", "autoload": true }
```

改完代码执行 `/reload` 生效。

---

## 功能总览

### 1. 启动页（welcome / header）

`setHeader` 接管 pi 的启动 header，渲染为双栏卡片：

- 圆角边框卡片，标题 `π pi v1.1.0` 嵌在顶边框线上，与 pi-frame 的圆角输入框风格呼应
- 左栏：彩色 π logo（12×8 像素矩阵经半块合并渲染成 4 行，四行异色渐变）+ "ready when you are" 标语
- 右栏信息：`模型 · 思考等级`、`~/路径 · git 分支`、`N skills · N prompts · N extensions` 资源计数、dim 分隔线、快捷键提示
- **响应式键位提示**：优先读取用户自定义键位（`keyText("app.model.select")` 等），两列对齐布局，窄宽度自动降为单列前 3 条
- **compact 降级**：终端宽度 < 56 列时整个卡片换成两行单行式
- **原生资源列表移除**：pi 原生会在 header 下方渲染 `[Context]/[Skills]/[Prompts]/[Extensions]/[Extension issues]` 详细列表（扩展多时占满一屏）。pi-ui 会定位并摘除这个容器（幂等，pi 重建就再摘），资源信息以数量形式收进卡片。诊断日志写入 `/tmp/pi-ui-welcome-debug.log`
- 资源计数数据源：`ctx.getCommands()` 按 source 统计 skills/prompts（轮询刷新，命令注册完成后自动出现）；extensions 数取 settings.json 的 packages 长度

### 2. 思考块（thinking）

接管 assistant 消息的思考区域渲染：

- **流式态**：`✻ Thinking…` 扫光动画（亮带滑过暗斜体底文）+ `· Ns` 计时；正文带 muted `│` 竖线引导，按 `thinkingLines` 显示尾部预览
- **完成态**：`Thought for Ns`；agent 仍在执行时标题后挂四帧呼吸脉冲（`·→•→•→•`，180ms/帧，亮度呼吸），任务结束定格暗色 `·`
- **内联 markup**：思考文本里的 `` `code` ``（accent 加粗）、`**bold**`（加粗）、`# 标题`（加粗）、`- 列表`（muted `•` 圆点）都被渲染，不再裸露记号
- **树状连接符**（ctrl+o 展开态、多段思考）：段间 `├─`/`└─` 连接、段内 `│` 延续、末段自动换角
- 事件驱动 + 流式兜底双通道判定思考活动（provider 不回传 thinking 事件时也能正确显示/收尾）；思考时长经 session entry 持久化，reload 后不丢
- ctrl+o 切换全文展开

### 3. 工具卡片（tools / 渲染器）

通过 `pi.registerTool`（内置工具定义级覆盖）+ `pi.registerToolRenderer`（未知工具链式 resolver）双层接管：

- **Bash / Edit / Write**：`renderShell: "self"` 开口盒——顶边框标题 + 状态（耗时 · 文件数 · +/− 行数），Edit/Write 内嵌自适应 diff（语法高亮、加/删行底色、超长折叠），Bash 显示终端输出尾部 + 状态行
- **Read**：单文件渲染（`readLineLimit` 控制行数）
- **Grep**：树状结果面板（`grepFileLimit` 控制文件数，`… N more` 折叠，ctrl+o 展开 24 行）
- **Ls / Find**：紧凑列表面板
- **未知工具（MCP / 扩展 / 未注册）**：`registerToolRenderer` 链式 resolver 兜底为统一开口盒（`➔ 工具名` 标题 + 参数行 + 输出预览 + 耗时统计），`pi-thinking-steps` 之类的旧式原型补丁扩展已无需存在
- **MCP 工具名可读化**：`mcp__server__tool` → `Server: Tool` 展示
- **Agent 工具让位**：`Agent`/`Agents`/`get_subagent_result`/`steer_subagent` 不做装饰，保持子代理扩展自己的渲染
- **批组合并（batching）**：连续的 quiet 工具（read/ls/find）调用合并为单个无框树面板（首个调用渲染整板，其余零行），新消息/非批组工具/会话重置自动断组
- **fitLine 兜底**：所有自绘行强制截断到终端宽度，超宽不崩

### 4. 历史折叠（history）

超长会话每键击全量重绘很卡。`historyKeep` 只让最近 N 个工具卡片 / assistant 消息完整渲染，更早的渲染为零行（边界处一条 marker）。门控在渲染路径内逐帧重估，窗口自动滑动，无需失效风暴。0 = 关闭。

### 5. 渲染剖析器（profiler）

包裹 pi 热点组件的原型方法，累计调用次数与耗时（跨 reload 存活，globalThis 存储），用于定位失效风暴来源。`/pi-ui profile` 查看、`/pi-ui profile reset` 重置。

---

## 配置项

配置文件：`~/.pi/agent/pi-ui.json`（JSON，启动读取；命令修改即时写回）。所有数值命令都支持「只写键名」查看当前值。

| 配置键 | 命令 | 默认 | 范围 | 说明 |
|---|---|---|---|---|
| `collapsedResultLines` | `/pi-ui collapsed-lines N` | `0` | 0–200 | 工具结果折叠时的正文行数；0 = 隐藏输出直到 ctrl+o 展开 |
| `statsPlacement` | `/pi-ui stats <位置>` | `bottom-left` | bottom-left / bottom-right / top-right | 工具盒上耗时/文件/行数统计的位置（支持中文：左下/右下/右上） |
| `boxPadding` | `/pi-ui box-padding N` | `0` | 0–2 | 工具盒内部空行数；0 紧凑 |
| `grepFileLimit` | `/pi-ui grep-files N` | `5` | 1–20 | Grep 折叠面板显示的文件数 |
| `readLineLimit` | `/pi-ui read-lines N` | `50` | 1–200 | Read 单文件展开行数 |
| `thinkingLines` | `/pi-ui thinking-lines N` | `2` | 0–5 | 思考折叠时的尾部预览行数；0 = 只显示纯 Thinking 标签 |
| `historyKeep` | `/pi-ui history-keep N` | `80` | 0–2000 | 历史折叠窗口（完整渲染的近期卡片/消息数）；0 = 关闭折叠 |

配置文件示例：

```json
{
  "collapsedResultLines": 0,
  "statsPlacement": "top-right",
  "boxPadding": 0,
  "grepFileLimit": 5,
  "readLineLimit": 50,
  "thinkingLines": 2,
  "historyKeep": 80
}
```

### 极简单行的两种风格（minimalStyle）

`density: "minimal"` 下每张工具卡折叠为一行，风格可切换（`/pi-ui minimal-style anchor|name`，配置键 `minimalStyle`，默认 `anchor`）：

```
│ $ npm run build && npm test --coverage → all tests passed (42)   ← anchor：│ 导轨 + 语义锚点字符
│ ± src/a/b/c/config.ts → applied                                    （$ bash ● read ± edit ○ 搜索 ≡ ls * 其他）
│ ➔ Bash ✓ npm test --coverage — passed                           ← name：彩色工具名 + 状态符
```

- 运行中整行 warning 色、失败 error 色、完成低对比暗色（anchor 风格遵循 pi-tool-call-markers 的低对比语义）
- 摘要**保尾截断**：超长时 `…` + 尾部（命令的关键参数在尾部）
- `→ 结果尾` 展示结果首行摘要；ctrl+o 展开该卡恢复完整盒子

## 命令

```
/pi-ui                                  # 查看全部当前值
/pi-ui collapsed-lines 30               # 折叠正文行数
/pi-ui stats top-right                  # 统计位置（支持 左下/右下/右上）
/pi-ui box-padding 1                    # 盒内空行
/pi-ui grep-files 8                     # grep 文件数
/pi-ui read-lines 80                    # read 行数
/pi-ui thinking-lines 3                 # 思考预览行数
/pi-ui history-keep 120                 # 历史折叠窗口
/pi-ui profile                          # 渲染剖析快照
/pi-ui profile reset                    # 重置剖析数据
```

### 自定义颜色（colors）

`pi-ui.json` 可用 `colors` 段覆盖思考/工具名的主题色（值为**当前主题的 token 名**，不是任意 CSS 色；无效 token 自动回退默认，不会崩）：

```json
{
  "colors": {
    "thinking": "mauve",         // 思考正文（默认 thinkingText）
    "thinkingGuide": "accent",   // 思考引导 brain 图标（默认 accent）
    "tools": {
      "bash": "warning",         // 按工具名覆盖极简行颜色
      "edit": "success",
      "*": "mdLink"              // 其余工具的兜底色
    }
  }
}
```

可用 token（默认主题）：`accent` `success` `warning` `error` `muted` `dim` `text` `thinkingText` `mdHeading` `mdLink` `mdCode` `toolTitle` 等；catppuccin 主题另含 `mauve` `teal` `peach` 等。

限制：assistant 回答正文的颜色由主题的 `text` token 控制（pi 原生 Markdown 渲染），pi-ui 不越权重染（会破坏语法高亮）——要改正文色请改主题文件的 `text`。

## 推荐的宿主 settings.json 配合项

```json
{ "quietStartup": "header" }
```

pi 官方开关：header 保留（被 pi-ui 卡片接管）、原生 `[Context]/[Skills]...` 资源列表**不再渲染**（治本）。pi-ui 的 `hideStartupListings` 兜底继续摘除 quiet 模式下仍会出现的 `[Extension issues]`/`[Skill conflicts]` 诊断段。

## 兼容性说明

- pi-ui 用**官方扩展 API**（`registerTool` / `registerToolRenderer` / `setHeader` / `registerEntryRenderer`）+ 极少量原型补丁（思考块 `updateContent`，带标记防重装）。与同样原型补丁 `AssistantMessageComponent` / `ToolExecutionComponent` 的扩展互斥（如 `pi-cc-extensions`、`pi-thinking-steps`——后者已验证覆盖 pi-ui 的思考渲染，二者二选一）。
- 已适配 pi 1.1.0：`registerToolRenderer` 链式 resolver、`durationMs`/`outputPad` 渲染上下文、ExpandableText 资源面板兼容读取。

## 开发

```bash
cd packages/pi-ui
../../node_modules/.bin/tsc --noEmit -p tsconfig.json   # 类型检查
node scripts/bench-frame.ts                              # 渲染性能基准（300 帧）
node scripts/repro-stack.mjs oscillate alt               # alt-screen 摘除复现装置
node scripts/preview-tool-call.ts                        # 工具卡渲染预览
```
