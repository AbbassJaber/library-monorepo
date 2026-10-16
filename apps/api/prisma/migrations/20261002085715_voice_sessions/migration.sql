-- AlterEnum
ALTER TYPE "AiFeature" ADD VALUE 'VOICE';

-- AlterTable
ALTER TABLE "ai_runs" ADD COLUMN     "tokensSpeechIn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tokensSpeechOut" INTEGER NOT NULL DEFAULT 0;
