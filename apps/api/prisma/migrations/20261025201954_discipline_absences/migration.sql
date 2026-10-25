-- AlterTable
ALTER TABLE "Discipline" ADD COLUMN     "absenceLimit" INTEGER,
ADD COLUMN     "absences" INTEGER NOT NULL DEFAULT 0;

