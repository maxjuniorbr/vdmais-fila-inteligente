# Database migrations and environment parity (Prisma)

Operational context for any work touching the Prisma schema or migrations.
Canonical deploy process: [deployment-mvp.md](../../docs/deployment-mvp.md)

## Durable rules (apply in every environment)

- `apps/backend/prisma/migrations/` is the single source of truth. Every schema
  change is a new migration here; never edit a migration that was already applied.
- The canonical apply mechanism is `prisma migrate deploy` against the target
  Postgres via `DATABASE_URL`. It is portable across any managed or self-hosted Postgres.
- The deploy pipeline MUST run `prisma migrate deploy` before releasing code that
  depends on the new schema, otherwise the API breaks referencing missing columns/types.
- Verify parity before release: `prisma migrate status` must report "up to date".
- Never point a local `.env` at a remote/production database. Confirm `DATABASE_URL`
  is localhost before running any migration command locally.
- Prefer additive, idempotent migrations (`ADD COLUMN IF NOT EXISTS`,
  `ADD VALUE IF NOT EXISTS`, safe defaults). Destructive changes in any shared
  environment (drop column/table, type change, unique index over existing data)
  require explicit human confirmation before applying.
- Row Level Security is enabled on all tables. The backend connects as a
  privileged/owner role that bypasses RLS, so the app is unaffected. Keep RLS
  enabled when creating new tables.

## Current hosting (MVP / pilot only — temporary, will change at delivery)

> Production delivery will NOT use these providers. Treat this as the present pilot
> setup only; when the target environment changes, update just this section.

- **Two independent databases must receive EVERY schema migration right now: the
  local dev Postgres AND Supabase.** Supabase is the de-facto production database
  in this pilot (it won't be the final production target, but today it is). They
  track migrations separately and neither updates the other, so applying a
  migration to only one leaves the other broken — the app then throws Prisma
  `P2022 column ... does not exist` against the stale database. Apply to both:
  - Local dev DB: confirm `DATABASE_URL` is `localhost`, then `prisma migrate deploy`
    (or `prisma migrate dev`). Verify with `prisma migrate status` → "up to date".
  - Supabase: apply via the Supabase MCP `apply_migration` (name = migration folder
    name, so the ledger matches the repo) or the CLI. The user does NOT apply
    migrations by hand in the dashboard — use the MCP/CLI.
- Backend runs on Render (free tier) and does NOT run `prisma migrate deploy`
  (no migrate step in build or start). So today the Supabase migration must be
  applied before each release, and code that depends on it ships only after.
- Database is managed Postgres on Supabase (project `vdmais-fila-inteligente-supabase`),
  migrated through the Supabase migration ledger `supabase_migrations.schema_migrations`
  (tracked by folder name) instead of Prisma's `_prisma_migrations`.
- Parity check for the current Supabase database:
  `select name from supabase_migrations.schema_migrations order by version;`
  then compare against the folders in `apps/backend/prisma/migrations/`.

## At production delivery (target corporate environment)

- Standardize the pipeline on `prisma migrate deploy` as a release step (portable,
  no provider lock-in).
- Reconcile the dual tracking: the current database tracks migrations via Supabase
  (no `_prisma_migrations`). On the target database, baseline Prisma first with
  `prisma migrate resolve --applied <migration>` for every already-applied migration,
  then run `prisma migrate deploy`, so Prisma does not try to re-run everything.
