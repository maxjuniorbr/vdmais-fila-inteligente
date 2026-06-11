---
name: commit
description: Run validation gates, analyze working tree changes, create well-scoped commits, and run post-commit quality gates. Use when the user asks to commit or save changes.
---

# Commit Assistant

Runs tests, analyzes all changes, and creates well-scoped commits following project conventions.

## Usage

Invoke from the agents UI as `commit`. No arguments needed — analyzes staged + unstaged changes.

## Security Premise

**NEVER commit API keys, tokens, passwords, or any secret/credential to the repository.**
Before staging any file, check that no secret values are being introduced.
If a change contains what looks like an API key, token, or credential — STOP immediately and do NOT proceed with the commit.
Secrets must live exclusively in `.env` or environment variables on the hosting platform, never in source code.

## Steps

### 1. Run validation

Run all commands and check results:

```
npm run lint
npm test
```

- If **any fails**, stop immediately. Show the error output and do NOT commit.

### 2. Analyze the working tree

Run:

```
git status
git diff
git diff --staged
```

- If there are **no changes** (staged or unstaged), abort silently.
- Identify every changed file, its nature (new, modified, deleted), and which area it belongs to.

### 3. Decide commit strategy

Group the changes by **logical unit of work**. Use your judgement:

- If all changes belong to the **same logical unit**, create a **single commit**. This is the preferred path when it makes sense.
- If changes clearly belong to **distinct logical units** (e.g., a bug fix + a separate refactor + a new feature), split into **separate commits**, one per unit.

**Splitting criteria:**

- Different `type` (feat vs fix vs refactor vs chore vs test)
- Different functional area with no coupling between them
- A standalone config/infra change mixed with a feature change

**Do NOT over-split.** If in doubt, keep it in one commit.

### 4. Stage and commit

For each logical unit:

1. Stage only the relevant files (`git add <files>`). Never use `git add -A` or `git add .`.
2. Construct the commit message following the **Commit Rules** below.
3. Execute `git commit -m "..."`.

If multiple commits are needed, execute them in dependency order (base changes first).

### 5. Post-commit quality gates

After committing, run these checks. If any fails, **warn but do not revert the commit** (the commit already exists locally — the user decides whether to amend, add a follow-up commit, or rollback).

1. **Secrets scan:** grep the diff for tokens, API keys, passwords. If found, STOP and instruct the user to revert + rotate.
2. **Schema drift:** if `prisma/migrations/**` changed, verify schema.prisma and generated client are in sync.

### 6. Verify

Run `git log --oneline -5` at the end to confirm the commits were created.

## Commit Rules (Strict)

- **Format:** `<type>: <description>` (single line only, no body).
- **Allowed Types:** `feat` (feature), `fix` (bug fix), `refactor` (code restructuring), `style` (visuals/formatting), `chore` (maintenance/config), `docs` (documentation), `test` (tests).
- **Scopes Forbidden:** Never use scopes. Use `feat:`, NOT `feat(ui):`.
- **Language:** The description must be exclusively in **English**.
- **Style:** Use imperative mood, strictly lowercase letters, maximum 72 characters.
- **Punctuation:** Do not end the description with a period.
- **No Body:** Only the commit title — no blank line, no details, no footer. Just: `<type>: <description>`

## Output

For each commit created, show one line:

```
✓ <commit-hash-short> <commit-message>
```

If tests failed, show:

```
✗ tests failed — commit aborted
```

Followed by the relevant error output.

No greetings, no narration, no extra text.
