---
name: git-commit
description: Generate conventional commit messages automatically. Use when user runs git commit, stages changes, or asks for commit message help. Analyzes git diff to create clear, descriptive conventional commit messages. Triggers on git commit, staged changes, commit message requests.
allowed-tools: Bash, Read
---

# Git Commit with Conventional Commits

## Overview

Use the Conventional Commits specification to create standardized, semantic Git commits. Analyze the actual diff to determine the appropriate type, scope, and message.

## Conventional Commit Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Commits Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test additions or fixes
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Maintenance tasks

## Examples

### Feature Addition

```bash
# You staged:
git add auth.service.ts login.component.tsx

# I analyze diff and suggest:
feat(auth): add JWT-based user authentication

- Implement login/logout functionality
- Add token management service
- Include auth guards for protected routes
- Add unit tests for auth service

Closes #42
```

### Bug Fix

```bash
# You staged:
git add UserList.tsx

# I suggest:
fix(components): resolve memory leak in UserList

Fixed subscription not being cleaned up in useEffect,
causing memory leak when component unmounts.

Closes #156
```

### Breaking Change

```bash
# You staged:
git add api/users.ts

# I suggest:
feat(api): update user API response format

Changed response structure to include metadata
for better pagination and filtering support.

BREAKING CHANGE: User API now returns { data, metadata }
instead of direct array. Update client code accordingly.
```

### Documentation Update

```bash
# You staged:
git add README.md docs/api.md

# I suggest:
docs: update API documentation with authentication examples

- Add authentication flow diagrams
- Include cURL examples for protected endpoints
- Document error responses
```

## Analysis Process

### Step 1: Check Staged Changes

```bash
git diff --staged --name-only
git diff --staged
```

### Step 2: Categorize Changes

- New files → feat
- Modified files → fix, refactor, or feat
- Deleted files → chore or refactor
- Test files → test
- Documentation → docs

### Step 3: Analyze Content

- What was changed?
- Why was it changed?
- What's the impact?
- Are there breaking changes?

### Step 4: Generate Message

**Subject line:**

- Max 50 characters
- Imperative mood ("add" not "added")
- No period at end
- Lowercase after type

**Body:**

- Explain WHAT and WHY, not HOW
- Wrap at 72 characters
- Bullet points for multiple changes

**Footer:**

- Breaking changes: `BREAKING CHANGE: description`
- Issue references: `Closes #123`, `Fixes #456`
