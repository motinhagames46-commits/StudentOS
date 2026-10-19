-- AlterTable
ALTER TABLE "StudySession" ADD COLUMN     "breakMinutes" INTEGER,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "targetMinutes" INTEGER;

