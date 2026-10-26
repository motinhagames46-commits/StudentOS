-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('SCAN', 'PDF', 'TEXT');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CardKind" AS ENUM ('MCQ', 'SHORT');

-- CreateEnum
CREATE TYPE "FinanceKind" AS ENUM ('EXPENSE', 'INCOME');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiConsentAt" TIMESTAMP(3),
ADD COLUMN     "aiConsentVersion" TEXT;

-- CreateTable
CREATE TABLE "StudyDocument" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "source" "DocumentSource" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PROCESSING',
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "disciplineId" INTEGER,

    CONSTRAINT "StudyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" SERIAL NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "embeddingModel" TEXT NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyCard" (
    "id" SERIAL NOT NULL,
    "kind" "CardKind" NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "correctOption" INTEGER,
    "expectedAnswer" TEXT,
    "explanation" TEXT,
    "due" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsedDays" INTEGER NOT NULL DEFAULT 0,
    "scheduledDays" INTEGER NOT NULL DEFAULT 0,
    "learningSteps" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "state" INTEGER NOT NULL DEFAULT 0,
    "lastReview" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "disciplineId" INTEGER,
    "documentId" INTEGER,
    "quizId" INTEGER,

    CONSTRAINT "StudyCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardReview" (
    "id" SERIAL NOT NULL,
    "rating" INTEGER NOT NULL,
    "state" INTEGER NOT NULL,
    "due" TIMESTAMP(3) NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "elapsedDays" INTEGER NOT NULL,
    "scheduledDays" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cardId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "CardReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" SERIAL NOT NULL,
    "topic" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "score" DOUBLE PRECISION,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "disciplineId" INTEGER,
    "documentId" INTEGER,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FinanceKind" NOT NULL,
    "color" TEXT,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTransaction" (
    "id" SERIAL NOT NULL,
    "kind" "FinanceKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "occurredOn" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "categoryId" INTEGER,

    CONSTRAINT "FinanceTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "targetCents" INTEGER NOT NULL,
    "savedCents" INTEGER NOT NULL DEFAULT 0,
    "deadline" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceInsight" (
    "id" SERIAL NOT NULL,
    "tips" JSONB NOT NULL,
    "basedOn" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "FinanceInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudyDocument_userId_createdAt_idx" ON "StudyDocument"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentChunk_userId_idx" ON "DocumentChunk"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_ordinal_key" ON "DocumentChunk"("documentId", "ordinal");

-- CreateIndex
CREATE INDEX "StudyCard_userId_due_idx" ON "StudyCard"("userId", "due");

-- CreateIndex
CREATE INDEX "CardReview_cardId_idx" ON "CardReview"("cardId");

-- CreateIndex
CREATE INDEX "CardReview_userId_reviewedAt_idx" ON "CardReview"("userId", "reviewedAt");

-- CreateIndex
CREATE INDEX "Quiz_userId_createdAt_idx" ON "Quiz"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_userId_kind_name_key" ON "FinanceCategory"("userId", "kind", "name");

-- CreateIndex
CREATE INDEX "FinanceTransaction_userId_occurredOn_idx" ON "FinanceTransaction"("userId", "occurredOn");

-- CreateIndex
CREATE INDEX "SavingsGoal_userId_idx" ON "SavingsGoal"("userId");

-- CreateIndex
CREATE INDEX "FinanceInsight_userId_createdAt_idx" ON "FinanceInsight"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudyDocument" ADD CONSTRAINT "StudyDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyDocument" ADD CONSTRAINT "StudyDocument_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyCard" ADD CONSTRAINT "StudyCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyCard" ADD CONSTRAINT "StudyCard_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyCard" ADD CONSTRAINT "StudyCard_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudyDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyCard" ADD CONSTRAINT "StudyCard_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReview" ADD CONSTRAINT "CardReview_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "StudyCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReview" ADD CONSTRAINT "CardReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudyDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInsight" ADD CONSTRAINT "FinanceInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

