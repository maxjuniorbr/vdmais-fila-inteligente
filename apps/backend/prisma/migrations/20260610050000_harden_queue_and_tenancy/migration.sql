-- CreateTable
CREATE TABLE "queues" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "nextSequence" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "erId" TEXT NOT NULL,

    CONSTRAINT "queues_pkey" PRIMARY KEY ("id")
);

-- Add tenancy and daily queue references as nullable while existing data is backfilled.
ALTER TABLE "operators" ADD COLUMN "erId" TEXT;
ALTER TABLE "tickets" ADD COLUMN "queueId" TEXT;

-- Recreate one queue for every ER/day already represented by a ticket.
INSERT INTO "queues" ("id", "businessDate", "nextSequence", "openedAt", "closedAt", "erId")
SELECT
    'queue_' || md5("erId" || ':' || ("createdAt"::date)::text),
    "createdAt"::date,
    MAX("queuePosition"),
    MIN("createdAt"),
    NULL,
    "erId"
FROM "tickets"
GROUP BY "erId", "createdAt"::date;

-- Ensure an open ER has a queue for the current operation date.
INSERT INTO "queues" ("id", "businessDate", "nextSequence", "openedAt", "closedAt", "erId")
SELECT
    'queue_' || md5("id" || ':' || (COALESCE("dayOpenedAt", CURRENT_TIMESTAMP)::date)::text),
    COALESCE("dayOpenedAt", CURRENT_TIMESTAMP)::date,
    0,
    COALESCE("dayOpenedAt", CURRENT_TIMESTAMP),
    NULL,
    "id"
FROM "ers"
WHERE "isDayOpen" = true
ON CONFLICT DO NOTHING;

UPDATE "tickets" AS ticket
SET "queueId" = queue."id"
FROM "queues" AS queue
WHERE queue."erId" = ticket."erId"
  AND queue."businessDate" = ticket."createdAt"::date;

-- Prefer the ER already associated through a counter when assigning staff.
UPDATE "operators" AS operator
SET "erId" = (
    SELECT counter."erId"
    FROM "counters" AS counter
    WHERE counter."operatorId" = operator."id"
    ORDER BY counter."createdAt" ASC
    LIMIT 1
)
WHERE operator."erId" IS NULL;

-- Legacy staff without a counter is assigned to the first ER so the relation
-- can become mandatory. Production data should be reviewed before deployment.
UPDATE "operators"
SET "erId" = (SELECT "id" FROM "ers" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "erId" IS NULL;

ALTER TABLE "operators" ALTER COLUMN "erId" SET NOT NULL;
ALTER TABLE "tickets" ALTER COLUMN "queueId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "queues_erId_businessDate_key" ON "queues"("erId", "businessDate");
CREATE UNIQUE INDEX "tickets_queueId_queuePosition_key" ON "tickets"("queueId", "queuePosition");
CREATE INDEX "tickets_erId_state_queuePosition_idx" ON "tickets"("erId", "state", "queuePosition");

-- Enforce the central duplicate-ticket rule under concurrent requests.
CREATE UNIQUE INDEX "tickets_one_active_per_re_er"
ON "tickets"("erId", "representativeId")
WHERE "state" IN ('WAITING', 'CALLING', 'IN_SERVICE');

-- AddForeignKey
ALTER TABLE "queues" ADD CONSTRAINT "queues_erId_fkey"
FOREIGN KEY ("erId") REFERENCES "ers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operators" ADD CONSTRAINT "operators_erId_fkey"
FOREIGN KEY ("erId") REFERENCES "ers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_queueId_fkey"
FOREIGN KEY ("queueId") REFERENCES "queues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_checkinAttendantId_fkey"
FOREIGN KEY ("checkinAttendantId") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
