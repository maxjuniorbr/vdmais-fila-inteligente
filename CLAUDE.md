# vdmais-fila-inteligente

Queue management system for hospital ERs. Monorepo: `apps/backend` (NestJS + Prisma + Postgres) and `apps/frontend` (React + Vite).

## Commands

```bash
# Backend (from apps/backend)
npm run lint && npm test     # validate
npm run build                # nest build + tsc check
npx prisma migrate status    # check DB parity with migrations

# Frontend (from apps/frontend)
npm run lint && npm test     # validate
npm run build                # tsc -b + vite build

# Root (runs both workspaces)
npm run lint && npm test
```

## Commit rules (enforced by `.githooks/commit-msg`)

Format: `<type>: <description>` — single line, no body, no scope, ≤72 chars.
Types: `feat` `fix` `refactor` `style` `chore` `docs` `test`
English, imperative mood, lowercase, no trailing period.

Use `/commit` to run the full commit assistant.

## MCPs available

Configured in `.mcp.json` at the repo root (gitignored — it holds the Render API token).
Pre-approved via `enableAllProjectMcpServers` in `.claude/settings.json`.

- **render** — backend service on Render (list/deploy/env vars). Authenticates with a static bearer token in `.mcp.json`.
- **vercel** — frontend deployment on Vercel. OAuth on first connect.
- **supabase** — managed Postgres (project `vdmais-fila-inteligente-supabase`). OAuth on first connect. Production DB migrations must be applied manually before each release (Render does not run `prisma migrate deploy` on start).

## Detailed guidelines (loaded on demand by sub-directory CLAUDE.md)

- **Frontend design + UX** → `apps/frontend/CLAUDE.md` (loaded when editing `apps/frontend/**`)
- **Database migrations** → `apps/backend/CLAUDE.md` (loaded when editing `apps/backend/prisma/**`)
