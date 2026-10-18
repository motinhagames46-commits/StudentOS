-- CreateEnum
CREATE TYPE "DataOrigin" AS ENUM ('MANUAL', 'IMPORT_ICS', 'IMPORT_CSV');

-- CreateEnum
CREATE TYPE "BlockKind" AS ENUM ('CLASS', 'EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('ICS', 'CSV');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('NEEDS_REVIEW', 'CONFIRMED', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "importJobId" TEXT,
ADD COLUMN     "origin" "DataOrigin" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "ScheduleBlock" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "BlockKind" NOT NULL DEFAULT 'CLASS',
    "location" TEXT,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Lisbon',
    "isBusy" BOOLEAN NOT NULL DEFAULT true,
    "recurrenceRule" TEXT,
    "exceptionDates" TIMESTAMP(3)[],
    "seriesEndAt" TIMESTAMP(3),
    "origin" "DataOrigin" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "disciplineId" INTEGER,
    "importJobId" TEXT,

    CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "originalFilename" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "options" JSONB,
    "warnings" JSONB,
    "counts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "userId" INTEGER NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleBlock_userId_startAt_idx" ON "ScheduleBlock"("userId", "startAt");

-- CreateIndex
CREATE INDEX "ScheduleBlock_userId_fingerprint_idx" ON "ScheduleBlock"("userId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleBlock_userId_origin_externalId_key" ON "ScheduleBlock"("userId", "origin", "externalId");

-- CreateIndex
CREATE INDEX "ImportJob_userId_createdAt_idx" ON "ImportJob"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_userId_origin_externalId_key" ON "Task"("userId", "origin", "externalId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

