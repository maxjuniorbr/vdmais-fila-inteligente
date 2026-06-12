-- Display (TV) token per ER. The plaintext token is shown once in the admin
-- screen; only its SHA-256 hash is stored. It scopes panel access to a single
-- ER and is revocable (set to NULL) without touching any user profile.
ALTER TABLE "ers"
  ADD COLUMN IF NOT EXISTS "panelTokenHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ers_panelTokenHash_key" ON "ers"("panelTokenHash");
