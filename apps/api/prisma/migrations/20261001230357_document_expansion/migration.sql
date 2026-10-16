-- AlterEnum
ALTER TYPE "AiFeature" ADD VALUE 'EXPANSION';

-- CreateTable
CREATE TABLE "book_expansions" (
    "bookId" INTEGER NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "fr" TEXT NOT NULL,
    "ar" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_expansions_pkey" PRIMARY KEY ("bookId")
);

-- AddForeignKey
ALTER TABLE "book_expansions" ADD CONSTRAINT "book_expansions_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
