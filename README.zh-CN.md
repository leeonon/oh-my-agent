# oh-my-agent

[English](./README.md) | **中文**

个人 AI agent 配置与 skills。

## pi-agent

本机 `~/.pi/agent` 的可公开配置快照

## Skills

### 个人

| name         | desc                                               | Author  | 源链接                                                                                         |
| ------------ | -------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `git-commit` | 根据 git diff 自动生成 conventional commit message | leeonon | [skills/\_i-git-commit](https://github.com/leeonon/oh-my-agent/tree/main/skills/_i-git-commit) |

### 收集的

| name                       | desc                                                      | Author                  | 源链接                                                                                                          |
| -------------------------- | --------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `animate`                  | 为界面补上有目的的动画与微交互                            | Paul Bakaus             | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                                                     |
| `apple-design`             | 把 Apple 的界面与物理化动效方法论落到 Web                 | Emil Kowalski           | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/apple-design)                     |
| `arrange`                  | 改善布局、间距与视觉节奏                                  | Paul Bakaus             | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                                                     |
| `ask-matt`                 | 按场景路由到仓库里合适的 skill / flow                     | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/ask-matt)                 |
| `baseline-ui`              | Tailwind 项目里校验动效时长、字号阶梯、无障碍与布局反模式 | ibelick                 | [ibelick/ui-skills](https://github.com/ibelick/ui-skills/tree/main/skills/baseline-ui)                          |
| `clarify`                  | 改清 UX copy、报错和微文案                                | Paul Bakaus             | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                                                     |
| `code-review`              | 按仓库规范与原始需求两条线并行做 code review              | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/code-review)              |
| `codebase-design`          | 深模块设计的共用词汇：接口、接缝、可测试性                | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/codebase-design)          |
| `critique`                 | 从 UX 角度评估层级、信息架构与设计质量                    | Paul Bakaus             | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                                                     |
| `diagnosing-bugs`          | 疑难 bug / 性能回退的诊断循环                             | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/diagnosing-bugs)          |
| `frontend-design`          | 做有辨识度、生产级的前端界面，避开泛 AI 审美              | Anthropic / Paul Bakaus | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design)                      |
| `grill-me`                 | 用追问把计划或设计烤扎实                                  | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me)                |
| `grill-with-docs`          | 烤计划的同时写下 ADR 和 glossary                          | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs)          |
| `grilling`                 | 动手前用追问压力测试计划或设计                            | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling)                |
| `handoff`                  | 把当前对话压成下一任 agent 能接的交接文档                 | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/handoff)                 |
| `harden`                   | 补错误处理、i18n、文本溢出和边界情况                      | Paul Bakaus             | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                                                     |
| `impeccable`               | 设计 / 审查 / 打磨前端界面的主 skill                      | Paul Bakaus             | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                                                     |
| `prototype`                | 用一次性原型验证状态模型或界面手感                        | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/prototype)                |
| `research`                 | 对着一手资料做调研，结果写成仓库里的 Markdown             | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/research)                 |
| `setup-matt-pocock-skills` | 一次性配好 issue tracker、triage 标签和领域文档布局       | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/setup-matt-pocock-skills) |
| `tdd`                      | 测试先行：红绿重构，或补集成测试                          | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd)                      |
| `teach-impeccable`         | 一次性收集项目设计上下文，写进 AI 配置                    | Paul Bakaus             | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                                                     |
| `terminal-browser`         | 终端里跑一个真浏览器，可分屏、截图、点击、填表            | zenbu-labs              | [zenbu-labs/terminal-browser](https://github.com/zenbu-labs/terminal-browser)                                   |
| `to-issues`                | 把计划 / spec / PRD 拆成可独立领取的 issue                | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-issues)                |
| `to-prd`                   | 把当前对话收成 PRD 发到 issue tracker                     | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-prd)                   |
| `triage`                   | 按状态机分流 issue 和外部 PR，写出 agent 能下手的 brief   | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/triage)                   |
| `typeset`                  | 修正字体、层级、字号和可读性                              | Paul Bakaus             | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                                                     |
| `writing-great-skills`     | 写 skill 时用的词汇和原则                                 | Matt Pocock             | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-great-skills)    |
