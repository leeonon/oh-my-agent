# pi-ui

Pi coding agent 的 UI 扩展，目标是把 oh-my-pi / Claude Code 里那些好用的 TUI 体验搬过来。

首屏 welcome 已经迁到这个包里：居中 Logo，下方左栏 Pi 资源、右栏当前目录 / git。

开发期用本地路径加载，不要丢进 `~/.pi/agent/extensions/`：

```bash
pi install /Users/ly/.agents/packages/pi-ui
```

改完 `/reload`。发布后改成 `npm:pi-ui`，把上面这条本地路径从 settings 里去掉。
