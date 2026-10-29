-- CreateTable
CREATE TABLE "DocumentFile" (
    "id" SERIAL NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "DocumentFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentFile_userId_idx" ON "DocumentFile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFile_documentId_ordinal_key" ON "DocumentFile"("documentId", "ordinal");

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

