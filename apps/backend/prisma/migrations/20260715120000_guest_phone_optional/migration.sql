-- Guest identity moved from phone to CPF (validated by check digit). A guest no
-- longer provides a phone, so the column becomes optional. Additive/non-destructive:
-- registered reps still set it via the required register DTO; Postgres allows many
-- NULLs under a UNIQUE column.
ALTER TABLE "representatives" ALTER COLUMN "phone" DROP NOT NULL;
