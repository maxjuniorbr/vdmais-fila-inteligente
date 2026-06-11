-- Refuse to hide pre-existing operational inconsistencies. If this migration
-- fails, close the duplicate counter assignments before retrying it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "counters"
    WHERE "operatorId" IS NOT NULL
    GROUP BY "operatorId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce one counter per operator: duplicate assignments exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX "counters_operatorId_key"
ON "counters"("operatorId");
