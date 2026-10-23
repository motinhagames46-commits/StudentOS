-- CreateTable
CREATE TABLE "DisciplineTransfer" (
    "id" SERIAL NOT NULL,
    "codeHash" TEXT NOT NULL,
    "disciplineIds" INTEGER[],
    "includeUnlinkedBlocks" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "toUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromUserId" INTEGER NOT NULL,

    CONSTRAINT "DisciplineTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisciplineTransfer_codeHash_key" ON "DisciplineTransfer"("codeHash");

-- CreateIndex
CREATE INDEX "DisciplineTransfer_fromUserId_idx" ON "DisciplineTransfer"("fromUserId");

-- AddForeignKey
ALTER TABLE "DisciplineTransfer" ADD CONSTRAINT "DisciplineTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

