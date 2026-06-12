-- Session version for staff JWT revocation. The token embeds the version it was
-- signed with; incrementing this column invalidates every active token of the
-- account (logout, password change, account disable).
ALTER TABLE "operators"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
