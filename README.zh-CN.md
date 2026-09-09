# oh-my-agent

[English](./README.md) | **中文**

个人 AI agent 配置与 skills。

## pi-agent

本机 `~/.pi/agent` 的可公开配置快照

## Skills

### 个人

| name | desc | 源链接 |
| --- | --- | --- |
| `git-commit` | 根据 git diff 自动生成 conventional commit message | [skills/_i-git-commit](https://github.com/leeonon/oh-my-agent/tree/main/skills/_i-git-commit) |

### Emil Kowalski

| name | desc | 源链接 |
| --- | --- | --- |
| `animate` | 从零做动画，按「手感对不对」的顺序做决策并写出实现 | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/animate) |
| `animate-expo` | 用 Reanimated / Gesture Handler 做 Expo、React Native 动画 | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/animate-expo) |
| `animation-vocabulary` | 把模糊的动效描述反查成准确术语 | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/animation-vocabulary) |
| `apple-design` | 把 Apple 的界面与物理化动效方法论落到 Web | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/apple-design) |
| `ask-sonner` | Sonner（React toast）的安装、用法与排错指南 | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/ask-sonner) |
| `emil-design-eng` | Emil Kowalski 对 UI 打磨、组件设计和动画决策的方法论 | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/emil-design-eng) |
| `find-animation-opportunities` | 找出该动但没动的地方，也否掉不该动的 | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/find-animation-opportunities) |
| `improve-animations` | 审计代码库动效，产出可交给别人执行的改造计划 | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/improve-animations) |
| `pick-ui-library` | 按场景从精选清单里挑前端库 | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/pick-ui-library) |
| `prototype` | 做出多个真正不同的 UI 版本，用可视化选择器现场挑选 | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/prototype) |
| `review-animations` | 按高标准审查动效代码，默认先标问题 | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/review-animations) |

### Matt Pocock

| name | desc | 源链接 |
| --- | --- | --- |
| `ask-matt` | 按场景路由到仓库里合适的 skill / flow | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/ask-matt) |
| `code-review` | 按仓库规范与原始需求两条线并行做 code review | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/code-review) |
| `codebase-design` | 深模块设计的共用词汇：接口、接缝、可测试性 | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/codebase-design) |
| `diagnosing-bugs` | 疑难 bug / 性能回退的诊断循环 | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/diagnosing-bugs) |
| `grill-me` | 用追问把计划或设计烤扎实 | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) |
| `grill-with-docs` | 烤计划的同时写下 ADR 和 glossary | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) |
| `grilling` | 动手前用追问压力测试计划或设计 | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling) |
| `handoff` | 把当前对话压成下一任 agent 能接的交接文档 | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/handoff) |
| `research` | 对着一手资料做调研，结果写成仓库里的 Markdown | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/research) |
| `setup-matt-pocock-skills` | 一次性配好 issue tracker、triage 标签和领域文档布局 | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/setup-matt-pocock-skills) |
| `tdd` | 测试先行：红绿重构，或补集成测试 | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd) |
| `to-issues` | 把计划 / spec / PRD 拆成可独立领取的 issue | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-issues) |
| `to-prd` | 把当前对话收成 PRD 发到 issue tracker | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-prd) |
| `triage` | 按状态机分流 issue 和外部 PR，写出 agent 能下手的 brief | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/triage) |
| `writing-great-skills` | 写 skill 时用的词汇和原则 | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-great-skills) |

### Paul Bakaus

| name | desc | 源链接 |
| --- | --- | --- |
| `arrange` | 改善布局、间距与视觉节奏 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `clarify` | 改清 UX copy、报错和微文案 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `critique` | 从 UX 角度评估层级、信息架构与设计质量 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `frontend-design` | 做有辨识度、生产级的前端界面，避开泛 AI 审美 | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design) |
| `harden` | 补错误处理、i18n、文本溢出和边界情况 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `impeccable` | 设计 / 审查 / 打磨前端界面的主 skill | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `teach-impeccable` | 一次性收集项目设计上下文，写进 AI 配置 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `typeset` | 修正字体、层级、字号和可读性 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |

### ibelick

| name | desc | 源链接 |
| --- | --- | --- |
| `baseline-ui` | Tailwind 项目里校验动效时长、字号阶梯、无障碍与布局反模式 | [ibelick/ui-skills](https://github.com/ibelick/ui-skills/tree/main/skills/baseline-ui) |

### humanlayer

| name | desc | 源链接 |
| --- | --- | --- |
| `show-me` | 用简洁图示、代码结构草图和针对性 HTML 产物，帮人把当前话题看明白 | [humanlayer/skills](https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md) |

### zenbu-labs

| name | desc | 源链接 |
| --- | --- | --- |
| `terminal-browser` | 终端里跑一个真浏览器，可分屏、截图、点击、填表 | [zenbu-labs/terminal-browser](https://github.com/zenbu-labs/terminal-browser) |

### citrolabs

| name | desc | 源链接 |
| --- | --- | --- |
| `ego-browser` | 给人和 agent 用的 Chromium 浏览器，浏览、填表、截图、QA 优先用它 | [citrolabs/ego-lite](https://github.com/citrolabs/ego-lite/blob/main/skills/ego-browser/SKILL.md) |
