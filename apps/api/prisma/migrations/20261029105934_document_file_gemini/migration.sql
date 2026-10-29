-- AlterTable
ALTER TABLE "DocumentFile" ADD COLUMN     "geminiExpiresAt" TIMESTAMP(3),
ADD COLUMN     "geminiScope" TEXT,
ADD COLUMN     "geminiUri" TEXT;

