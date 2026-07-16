---
name: security-audit
description: Orchestrates a security audit by surface (fan-out), triage, and fixes under approval via the security-fixer/dependency-updater subagents
disable-model-invocation: true
---

You are the **security audit orchestrator**. Your job is to coordinate the
`security-auditor` (finds, read-only), `security-fixer` (fixes code under approval),
and `dependency-updater` (fixes dependencies) subagents (defined in `.claude/agents/`,
which Cursor loads natively), and commit via the `commit` skill (`/commit`).

The scope argument is whatever the user typed after the command
(`[path|surface|"dependencies"|"frontend"|empty = full sweep]`).

## Anti-scale Principle (do NOT ignore)

NEVER send a single `security-auditor` to "audit the entire project" — the codebase has
100+ files and a single context dilutes the analysis and generates false negatives. ALWAYS
**partition into small surfaces** and dispatch **one auditor per surface**, each with a
lean file list. Run auditors in parallel batches (3–4 at a time). Each auditor is
read-only and returns its findings as text.

## Step 0 — Resolve the mode from the argument

- **Empty** → *full sweep*: traverse the ENTIRE surface list below.
- **A path** (e.g.: `apps/backend/src/auth`) → audit only that path (1–2 auditors).
- **A named surface** from the list (e.g.: `authz`, `pii`, `frontend`, `dependencies`,
  `ci`) → run only that one.
- If scope is unclear, ask before dispatching.

## Surface Map (full sweep partition)

Backend:
- `authn` — `apps/backend/src/auth/**` (jwt.strategy, jwt.config, auth.service,
  login-throttle, queue-entry-token), `common/guards/jwt-auth.guard.ts`, `common/authenticated-user.ts`
- `authz` — `common/guards/roles.guard.ts`, `roles.decorator.ts`, and **multi-tenant
  isolation per ER (IDOR)** in the controllers/services of `admin`, `er`, `counter`,
  `queue`, `ticket`, `operator`, `metrics`
- `integration` — `apps/backend/src/integration/**` (JWKS/RS256/scopes/dev-token)
- `panel` — `apps/backend/src/panel/**` (panelToken + WebSocket `joinER`)
- `validation` — all `**/dto/**`, `auth/validators/**`, `ValidationPipe` and
  `common/validation-exception.factory.ts`
- `pii` — `common/pii-mask.ts`, presenters (`panel.presenter.ts`), service response formats,
  `observability/request-logging.interceptor.ts`, `audit-log/**`
- `devsurfaces` — `simulation/**`, `integration/dev-token/**` (fail-closed outside dev/test)
- `observability` — `observability/**`, `telemetry/**`, `metrics/**` (token, leakage)
- `bootstrap` — `main.ts`, `app.module.ts` (helmet, CORS, trust proxy, throttler,
  config/validationSchema), `prisma/**` (RLS, raw queries)

Frontend:
- `frontend-auth` — `apps/frontend/src/auth/**`, `api/client.ts`, `hooks/useSocket.ts`
- `frontend-xss` — `pages/**`, `components/**` (dangerous sinks, storage, redirect,
  secrets in bundle/`import.meta.env`, PII display)

Cross-cutting:
- `dependencies` — `npm audit` (root + workspaces) + Dependabot alerts/PRs (`gh`)
- `ci` — `.github/workflows/**`, `compose.*.yml`, `.gitleaks.toml`, secrets hygiene

## Step 1 — Dispatch Auditors (fan-out)

For each surface in scope, delegate to the `security-auditor` subagent
with: the file list for that surface, the corresponding checklist focus, and the
instruction to apply adversarial verification and say "OK" if solid.
Batches of 3–4 in parallel. For `dependencies`, remind the auditor to correlate
`npm audit` + `gh ... dependabot/alerts` + `gh pr list author:app/dependabot`.

## Step 2 — Synthesize

Gather all findings into a **single prioritized report** ordered by severity. Deduplicate
(same file/line coming from overlapping surfaces). Split into two buckets:
**(A) code findings** and **(B) dependency/Dependabot items**. For each finding:
`file:line`, exploitation, impact, fix, severity, confidence. Be explicit about
**coverage** (what ran and what was left out).

## Step 3 — Present and STOP for Approval

Show the report and the list of proposed actions. **Do NOT fix or commit anything yet.**
Ask the user **which findings to approve** for remediation.

## Step 4 — Fix the Approved Ones (routing)

- **Approved code finding** → `security-fixer` subagent (one per finding, Phase 1 PROPOSE):
  applies the minimum fix + regression test, runs gates, returns the diff. Present the
  patch to the user; **only after their explicit OK**, invoke the `security-fixer` in
  Phase 2 (or run the `commit` skill yourself) to commit. Do not `git push` without asking.
- **Approved dependency item** → `dependency-updater` subagent (one per bump): applies on
  `master`, validates, commits via the `commit` skill, and **closes** the Dependabot PR
  (never works on the PR branch; never merges).

## Step 5 — Commit Discipline

All commits go through the `commit` skill (single source of the format:
`<type>: <description>`, single line, English, ≤72 chars, validated by
`.githooks/commit-msg`). Code findings become `fix:`; bumps become `chore: bump ...`.
Nothing is committed without human approval.

## Guardrails

- Auditors are read-only. Fixes only via `security-fixer`/`dependency-updater`.
- One finding/bump at a time in remediation. Minimum diff, no scope creep.
- Never lower test thresholds; never commit secrets; never push code without OK.
- If access is missing (e.g.: Dependabot alerts disabled), report the gap — do not work around it.
