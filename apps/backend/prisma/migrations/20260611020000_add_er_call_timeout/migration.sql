-- Per-ER, parameterizable call timeout. When a CALLING ticket exceeds this many
-- seconds it is auto-marked as no-show and the counter is released. 0 disables.
ALTER TABLE "ers"
  ADD COLUMN IF NOT EXISTS "callTimeoutSeconds" INTEGER NOT NULL DEFAULT 600;
