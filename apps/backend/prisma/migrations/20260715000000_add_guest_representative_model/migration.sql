-- Guest model: a guest joins the queue with name + phone only, so the remaining
-- registration fields become optional and "kind" tells the records apart. The
-- phone stays NOT NULL + UNIQUE — it is the guest's identity key.
DO $$
BEGIN
  CREATE TYPE "RepresentativeKind" AS ENUM ('REGISTERED', 'GUEST');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "representatives"
  ADD COLUMN IF NOT EXISTS "kind" "RepresentativeKind" NOT NULL DEFAULT 'REGISTERED';

ALTER TABLE "representatives" ALTER COLUMN "cpf" DROP NOT NULL;
ALTER TABLE "representatives" ALTER COLUMN "birthDate" DROP NOT NULL;
ALTER TABLE "representatives" ALTER COLUMN "reCode" DROP NOT NULL;
ALTER TABLE "representatives" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Guest entry is opt-in per ER; no ER changes behavior without explicit action.
ALTER TABLE "ers"
  ADD COLUMN IF NOT EXISTS "guestEntryEnabled" BOOLEAN NOT NULL DEFAULT false;
