# oh-my-agent

**English** | [中文](./README.zh-CN.md)

Personal AI agent configuration and skills.

## pi-agent

Public snapshot of the local `~/.pi/agent` config.

## Skills

### Personal

| name | desc | Source |
| --- | --- | --- |
| `git-commit` | Generate conventional commit messages from the git diff | [skills/_i-git-commit](https://github.com/leeonon/oh-my-agent/tree/main/skills/_i-git-commit) |

### Emil Kowalski

| name | desc | Source |
| --- | --- | --- |
| `animate` | Build motion from scratch in the order that makes it feel right | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/animate) |
| `animate-expo` | Build Expo / React Native animations with Reanimated and Gesture Handler | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/animate-expo) |
| `animation-vocabulary` | Reverse-lookup a motion effect's exact name from a vague description | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/animation-vocabulary) |
| `apple-design` | Apple's fluid, physical interface approach, translated for the web | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/apple-design) |
| `ask-sonner` | Guide to Sonner, the React toast library | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/ask-sonner) |
| `emil-design-eng` | Emil Kowalski's philosophy on UI polish, components, and animation | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/emil-design-eng) |
| `find-animation-opportunities` | Find where the UI should animate — and where it shouldn't | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/find-animation-opportunities) |
| `improve-animations` | Audit motion in a codebase and produce implementation plans | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/improve-animations) |
| `pick-ui-library` | Pick a library for a frontend task from a curated list | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/pick-ui-library) |
| `prototype` | Build multiple UI versions behind a visual picker and promote the one that feels right | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/prototype) |
| `review-animations` | Review motion code against a high craft bar; flag by default | [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/review-animations) |

### Matt Pocock

| name | desc | Source |
| --- | --- | --- |
| `ask-matt` | Route to the right skill / flow in this repo for the situation | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/ask-matt) |
| `code-review` | Review in parallel against repo standards and the original spec | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/code-review) |
| `codebase-design` | Shared vocabulary for deep modules: interfaces, seams, testability | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/codebase-design) |
| `diagnosing-bugs` | Diagnosis loop for hard bugs and performance regressions | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/diagnosing-bugs) |
| `grill-me` | Grill a plan or design with relentless questions | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) |
| `grill-with-docs` | Grill the plan while writing ADRs and a glossary | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) |
| `grilling` | Stress-test a plan or design with questions before building | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling) |
| `handoff` | Compact the current conversation into a handoff for the next agent | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/handoff) |
| `research` | Research from primary sources; write findings as Markdown in the repo | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/research) |
| `setup-matt-pocock-skills` | One-time setup for issue tracker, triage labels, and domain docs | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/setup-matt-pocock-skills) |
| `tdd` | Test-first: red-green-refactor, or add integration tests | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd) |
| `to-issues` | Split a plan / spec / PRD into independently grabable issues | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-issues) |
| `to-prd` | Turn the current conversation into a PRD on the issue tracker | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-prd) |
| `triage` | Route issues and external PRs through a state machine; write agent-ready briefs | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/triage) |
| `writing-great-skills` | Vocabulary and principles for writing skills | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-great-skills) |

### Paul Bakaus

| name | desc | Source |
| --- | --- | --- |
| `arrange` | Improve layout, spacing, and visual rhythm | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `clarify` | Clarify UX copy, errors, and microcopy | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `critique` | Evaluate hierarchy, IA, and design quality from a UX lens | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `frontend-design` | Distinctive, production-grade frontends that avoid generic AI aesthetics | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design) |
| `harden` | Add error handling, i18n, text overflow, and edge cases | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `impeccable` | Main skill for designing, reviewing, and polishing frontend UI | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `teach-impeccable` | One-time collection of project design context into AI config | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `typeset` | Fix fonts, hierarchy, sizing, and readability | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |

### ibelick

| name | desc | Source |
| --- | --- | --- |
| `baseline-ui` | Validate animation duration, type scale, a11y, and layout anti-patterns in Tailwind projects | [ibelick/ui-skills](https://github.com/ibelick/ui-skills/tree/main/skills/baseline-ui) |

### humanlayer

| name | desc | Source |
| --- | --- | --- |
| `show-me` | Explain the current topic visually with diagrams, code-shape sketches, and HTML artifacts | [humanlayer/skills](https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md) |

### zenbu-labs

| name | desc | Source |
| --- | --- | --- |
| `terminal-browser` | A real browser in the terminal: split pane, snapshot, click, fill | [zenbu-labs/terminal-browser](https://github.com/zenbu-labs/terminal-browser) |

### citrolabs

| name | desc | Source |
| --- | --- | --- |
| `ego-browser` | Chromium browser for humans and agents; prefer it for browsing, forms, screenshots, and QA | [citrolabs/ego-lite](https://github.com/citrolabs/ego-lite/blob/main/skills/ego-browser/SKILL.md) |
