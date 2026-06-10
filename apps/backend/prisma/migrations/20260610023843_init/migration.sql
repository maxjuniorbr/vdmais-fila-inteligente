-- CreateEnum
CREATE TYPE "Role" AS ENUM ('REPRESENTATIVE', 'OPERATOR', 'ATTENDANT', 'MANAGER');

-- CreateEnum
CREATE TYPE "TicketState" AS ENUM ('WAITING', 'CALLING', 'IN_SERVICE', 'FINISHED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EntryChannel" AS ENUM ('QR_CODE', 'LINK', 'CHECKIN_ASSISTED');

-- CreateEnum
CREATE TYPE "CounterState" AS ENUM ('UNAVAILABLE', 'ACTIVE', 'CALLING', 'IN_SERVICE', 'PAUSED');

-- CreateTable
CREATE TABLE "representatives" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "reCode" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "representatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qrCodeUrl" TEXT,
    "isDayOpen" BOOLEAN NOT NULL DEFAULT false,
    "dayOpenedAt" TIMESTAMP(3),
    "dayClosedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "state" "CounterState" NOT NULL DEFAULT 'UNAVAILABLE',
    "erId" TEXT NOT NULL,
    "operatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operators" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "state" "TicketState" NOT NULL DEFAULT 'WAITING',
    "entryChannel" "EntryChannel" NOT NULL,
    "queuePosition" INTEGER NOT NULL,
    "erId" TEXT NOT NULL,
    "representativeId" TEXT NOT NULL,
    "counterId" TEXT,
    "operatorId" TEXT,
    "checkinAttendantId" TEXT,
    "calledAt" TIMESTAMP(3),
    "serviceStartedAt" TIMESTAMP(3),
    "serviceFinishedAt" TIMESTAMP(3),
    "noShowAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "restoreReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "erId" TEXT NOT NULL,
    "ticketId" TEXT,
    "representativeId" TEXT,
    "operatorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "representatives_cpf_key" ON "representatives"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "representatives_phone_key" ON "representatives"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "representatives_reCode_key" ON "representatives"("reCode");

-- CreateIndex
CREATE UNIQUE INDEX "counters_erId_number_key" ON "counters"("erId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "operators_email_key" ON "operators"("email");

-- AddForeignKey
ALTER TABLE "counters" ADD CONSTRAINT "counters_erId_fkey" FOREIGN KEY ("erId") REFERENCES "ers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counters" ADD CONSTRAINT "counters_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_erId_fkey" FOREIGN KEY ("erId") REFERENCES "ers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "representatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "counters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_erId_fkey" FOREIGN KEY ("erId") REFERENCES "ers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "representatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
