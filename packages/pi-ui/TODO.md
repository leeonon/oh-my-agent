# pi-ui 功能点

目标：替代 `pi-cc-extensions` 的内容区与相关 UI。官方钩子优先；没有钩子的标为「补丁」，和 cc 不能同时开。

实现时一次只做一个 `- [ ]`，做完勾成 `- [x]`。

---

## 已完成

- [x] 包脚手架（`packages/pi-ui`，本地 `pi install`）
- [x] 启动欢迎页：居中 Logo、左栏 Context / Skills / Prompts / Extensions、右栏 Directory（cwd + git）
- [x] 不撑满屏幕、不抢 footer（starship 继续工作）

---

## 内容区 · 工具

### 工具调用卡（标题行）

- [x] `read` / `bash` / `grep` / `find` / `ls` 的 `renderCall`：单行摘要、图标、进行中/成功/失败状态（bash 已升级为圆角盒，见下）
- [x] bash 圆角盒外壳（参考 pi-omp-theme）：`╭─ ➔ Bash ✓ ─╮` 标题嵌边框、`$ command` 语法高亮、`├─ Output ─┤` 分隔、`╰─ 耗时 · ~N words ─╯` footer、退出/超时/取消状态解析、运行中闭合卡片 + 开放衔接拓扑；`renderShell: "self"` 去掉原生工具底色，边框才看得见
- [x] `edit` / `write` 开口盒（同 bash）：路径在盒内，footer 放 `1 file · +N -M`；`renderShell: "self"`
- [x] MCP 工具名可读化（omp：`mcp__server__tool` → `Server: Tool`，未知工具走 fallback 开口盒）；Pi 1.1 迁移到官方 `pi.registerToolRenderer` 链式 resolver，删除 `ToolExecutionComponent` 原型补丁（含 `hasRendererDefinition` hack 与 session_start 重装）
- [x] 工具外壳：跟 pi-tool-display，用默认 Box（缩进 + pending/success/error 底色）
- [x] 让位 `Agent`（不包装 Agent/Agents/get_subagent_result/steer_subagent）

官方：同名 `registerTool` 只提供 `renderCall`，执行逻辑继承内置。

### 工具结果

- [x] 折叠态：`collapsedResultLines` 可配预览行数（`/pi-ui collapsed-lines N`）。0 = 折叠时不画 Output，`ctrl+o` 才展开；grep/read 与 bash/edit/write/MCP 盒共用
- [x] bash 盒装结果：Output 分隔、流式 isPartial 开放延续、空输出文案、耗时冻结；stats 位置 `/pi-ui stats bottom-left|bottom-right|top-right`（默认左下）
- [x] 展开态：折叠走 `collapsedResultLines`，展开盒内上限 50 行，不做 cc 的 Input 树
- [x] 流式 `isPartial`：第一次空着，随后流入开口盒，footer 仍是 Running
- [x] 错误结果：标题 `✘`、正文 error 色、footer `✘ Failed`

官方：`renderResult({ expanded, isPartial })`。

### 代码 Diff

- [ ] `edit` 的 unified / split
- [ ] `write` 的新建 / 覆盖预览（可只显示 `created` 摘要）
- [ ] 语法高亮
- [ ] 折叠行数、word wrap、宽屏才 split

官方：覆盖 `edit` / `write` 的 `renderResult`；`write` 若要额外 metadata 再 `registerTool` 覆盖执行。

### 工具分组（官方 leader/member 方案）

- [x] 连续工具调用合成一组（read/ls/find，参考 pi-omp-theme：leader 渲染整组无框树面板，成员渲染零行）
- [x] 组折叠 / 组展开（折叠 6 行上限，展开透传 leader 的 expanded）
- [x] 错误成员内联显示（✘ + 错误文本，不随折叠隐藏）

用官方 renderCall/renderResult 实现，不需要补丁。bash/grep/其他工具开动、新消息、session 重置都会断组。`collapsed-lines` 配置现在只影响 bash/grep。

### 工具鼠标（补丁）

- [ ] 点击展开、双击折叠
- [ ] hover 高亮
- [ ] fullscreen 滚轮步进、回到底部

无官方 API。会和 Pi 官方 fullscreen 输入抢。与 cc 互斥。

---

## 内容区 · 消息

### 思考块

- [x] 按 cc 方式重构：隐藏时全量重建内容区，活动判定改事件驱动（`message_update` 的 `thinking_start/delta`、文本/工具边界、`message_end`），不再靠文本增长猜
- [x] 思考中：`✻ Thinking...` 主题色扫光（亮字带滑动）+ 尾部 N 行摘要；结束时标签换成 `Thought for Ns`（会话内时长，跨重载持久化未做）
- [x] `ctrl+o` 全量展开、点击单段切换；`thinking-lines 0-5` 控制摘要行数（0 = 仅标签）
- [x] `isStreaming` 保留不丢（修复 invalidate 重绘闪烁）；组件识别改鸭子类型，不跨模块副本 `instanceof`
- [ ] 时长持久化（`appendEntry` + 会话恢复，cc 有）
- [ ] 正文 dim（可选）

补丁 `AssistantMessageComponent.prototype.updateContent`（带标记可重装），与 cc 互斥。

### Markdown 增强

- [ ] Mermaid / 状态图等围栏转 ASCII
- [ ] GitHub admonition（`> [!NOTE]` 等）
- [ ] URL 可点

官方：`registerMarkdownTransformer`（用户消息、助手正文、思考块都会走）。

### 系统消息块（补丁）

- [ ] Skill 调用块 → 单行卡
- [ ] 压缩摘要 → 单行卡
- [ ] 分支摘要 → 单行卡

无官方渲染钩子。补丁对应 MessageComponent，与 cc 互斥。

### Working 行

- [ ] `setWorkingMessage`：token / 耗时
- [ ] `setWorkingIndicator`：自定义 spinner（可选）

官方 API。输入框上方，不是 transcript。

---

## 内容区 · 自定义条目

- [ ] agent 结束摘要（`registerEntryRenderer`，不进模型）
- [ ] @session / @subagent 引用展示（`registerMessageRenderer`，进模型）

---

## 壳（非内容区，替换 cc 时要认领或明确放弃）

- [x] 启动欢迎（`setHeader`）—— 已做，不再做 cc 那套 startup header
- [ ] Footer：不做，留给 starship
- [ ] 主题：cc-dark / cc-light 是否自带（package `themes/`）
- [ ] 编辑器（`setEditorComponent`）：omp 式 powerline 编辑器已实现后整体撤销（用户决定不采用 omp 形式；代码含 embedWorkingStatus 坑与填充式 gauge 的结论见 git 历史）
- [ ] Widget：暂不做

---

## cc 附带功能（不是样式，卸 cc 会一起没）

要迁进 pi-ui 再勾选，不迁就保持未做、继续用别的包。

- [ ] `/context` 上下文检视
- [ ] @ session / subagent 引用输入（autocomplete）
- [ ] bash alias
- [ ] flush docked bash
- [ ] 样式/Diff/Thinking 设置面板（对应 `/ccstyle`）

---

## 实现约定

先官方钩子（工具 render、Markdown transformer、working），再决定要不要补丁（思考、工具外壳、分组、鼠标、系统消息块）。

补丁模块开做之前先卸掉或关掉 `pi-cc-extensions` 的 style，避免两家同时补 `ToolExecutionComponent` / `AssistantMessageComponent`。

不要动 `setFooter`。
