-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "aiNotes" JSONB,
ADD COLUMN     "aiRetrievedRefs" JSONB,
ADD COLUMN     "aiUncertaintyReason" TEXT;
