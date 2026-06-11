-- Per-ER, parameterizable pause timeout. When a paused ("não estou pronta")
-- ticket exceeds this many seconds it is auto-cancelled. 0 disables the timeout.
ALTER TABLE "ers"
  ADD COLUMN IF NOT EXISTS "pauseTimeoutSeconds" INTEGER NOT NULL DEFAULT 300;
