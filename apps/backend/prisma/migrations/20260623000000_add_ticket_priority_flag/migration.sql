-- Preferential service flag (Lei 10.048). A priority ticket is called before any
-- regular one; ordering becomes "isPriority" DESC, "queuePosition" ASC.
ALTER TABLE "tickets"
  ADD COLUMN IF NOT EXISTS "isPriority" BOOLEAN NOT NULL DEFAULT false;

-- Replace the active-ticket ordering index so the call query stays index-backed.
-- Build the new index first, then drop the old one (keeps coverage if it fails).
CREATE INDEX IF NOT EXISTS "tickets_erId_state_isPriority_queuePosition_idx"
ON "tickets"("erId", "state", "isPriority", "queuePosition");

DROP INDEX IF EXISTS "tickets_erId_state_queuePosition_idx";
