# pi-frame

Pi coding agent 的输入框与底部状态栏美化包。

## 能力

### 圆角闭合输入框

Pi 原生输入框只有上下两条横线（无侧边）。pi-frame 替换为完整闭合的圆角边框：

```
╭──────────────────────────────────────────╮
│ 你的输入内容……                            │
╰──────────────────────────────────────────╯
```

- 继承官方 `CustomEditor`，保留全部应用快捷键、Escape 中止、粘贴图片、IME 光标定位
- 顶边框右侧显示当前模型 id（左侧 Working 状态不受影响）：`── ✻ Working… ────── gpt-5.6-sol ──╮`
- `/` 自动补全下拉展开时，底边框自动移到列表下方，整个菜单收进框内（含分页计数）
- 滚动指示（`↑ N more` / `↓ N more`）在圆角边框上原样保留
- 任意宽度下每行精确对齐（有渲染宽度断言的预览脚本）

### 模块化双行 footer

通过 `ctx.ui.setFooter` 接管底部状态栏，双行分组布局：

```
~/code/api-server  main  「重构 pi-ui」                gpt-5.6-sol  think high
↑12.4k ↓3.2k  $0.42  ctx 34% (68.0k/200k)                mcp 8  plugins 12
```

可用模块：`cwd` `git` `title` `turn` `model` `thinking` `tokens` `cost` `context` `mcp` `plugins` `spacer`（弹性空隙，平分剩余宽度，多个可放）。`context` 的展示为 `68k/200k (34%) ●●●······`——10 格点状进度条，随用量绿→黄→红，无任何边框装饰。

`turn` 是整轮统计（默认第一行右侧）：`⏱ 4.2s · TTFT 1.8s · 42 tok/s`。边界为 `before_agent_start → agent_settled`（一条消息发出到任务完成，**不随工具调用重置**——pi 的 `agent_start/end` 每次内部 LLM 请求都会重发，不能用作整轮时钟）。运行中每 250ms 跳动，TTFT 跟随最近一次流式请求，TPS 按已完成步累计（usage 在每步流结束时上报）；完成定格，下一轮开始清零。窄终端（<90 列）先隐藏 `mcp`/`plugins`，计量段永不丢。

- token/成本统计带缓存：会话是 append-only，按（条目数 + 末条目引用）判定，未变化时 O(1)
- 上下文用量 ≥80% 时自动变红
- git 分支变化由 `FooterDataProvider.onBranchChange` 推送重绘

## 配置

`~/.config/pi/pi-frame.json`（不存在时用默认值）：

```json
{
  "editor": { "frame": true, "paddingX": 0 },
  "footer": {
    "enabled": true,
    "rows": [
      ["cwd", "git", "title", "spacer", "thinking"],
      ["tokens", "cost", "context", "spacer", "mcp", "plugins"]
    ]
  }
}
```

## 命令

- `/frame` — 查看当前状态
- `/frame stats` — 轮次统计面板（本轮 + 会话累计：轮/步/总耗时/模型耗时/工具耗时/TTFT 均值/TPS/累计输出 tokens）
- `/frame reload` — 重读配置文件
- `/frame editor on|off` — 开关圆角输入框（写回配置）
- `/frame footer on|off` — 开关 footer（写回配置）
- `/frame rows <json>` — 改模块布局，如 `/frame rows [["cwd","git","spacer","model"]]`

## 单槽说明

`setEditorComponent` / `setFooter` 都是单槽 API，后设置者生效。与 starship 类 statusline 包二选一（本包开发时 starship 已是 `autoload: false`）。

## 开发

```bash
pnpm install --filter pi-frame
pnpm --filter pi-frame typecheck
pnpm --filter pi-frame preview:editor   # 圆角框渲染 + 宽度断言
pnpm --filter pi-frame preview:footer   # footer 双行布局（mock 数据）
```

预览脚本用 jiti 别名到宿主（`~/.npm-global`）的 pi 副本，避免依赖版本漂移。
