-- Global staff (e.g. ADMIN) are not tied to a single ER.
ALTER TABLE "operators" ALTER COLUMN "erId" DROP NOT NULL;
