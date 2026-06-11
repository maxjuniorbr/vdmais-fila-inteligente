---
description: "Use when creating or editing Prisma schema, database migrations, or any file under apps/backend/prisma/. Covers migration safety, environment parity, current Supabase/Render hosting, and production delivery guidelines."
applyTo: "apps/backend/prisma/**"
---

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

- Backend runs on Render (free tier) and does NOT run `prisma migrate deploy`
  (no migrate step in build or start). So today migrations must be applied to the
  database manually before each release.
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
