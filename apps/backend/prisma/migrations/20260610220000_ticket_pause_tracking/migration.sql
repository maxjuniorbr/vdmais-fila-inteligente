-- Track pause duration per ticket so it can be excluded from wait-time metrics.
ALTER TABLE "tickets"
  ADD COLUMN IF NOT EXISTS "pausedAt"      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "pausedSeconds" INTEGER NOT NULL DEFAULT 0;
