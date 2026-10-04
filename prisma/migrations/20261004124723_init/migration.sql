-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING_REVIEW', 'CLARIFICATION_REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AiVerdict" AS ENUM ('COMPLIANT', 'NEEDS_CLARIFICATION', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "DecisionAction" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_CLARIFICATION', 'OVERRIDE_CATEGORY', 'PROVIDE_CLARIFICATION');

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "claimant" TEXT NOT NULL,
    "expenseDate" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "receiptAvailable" BOOLEAN NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "finalCategory" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "validationFindings" JSONB NOT NULL,
    "aiCategory" TEXT,
    "aiConfidence" DOUBLE PRECISION,
    "aiUncertain" BOOLEAN NOT NULL DEFAULT false,
    "aiVerdict" "AiVerdict",
    "aiExplanation" TEXT,
    "aiCitations" JSONB,
    "aiQuestions" JSONB,
    "aiSource" TEXT NOT NULL,
    "aiModel" TEXT,
    "aiError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "action" "DecisionAction" NOT NULL,
    "reviewer" TEXT NOT NULL,
    "reason" TEXT,
    "fromCategory" TEXT,
    "toCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "claimId" TEXT,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Claim_fingerprint_idx" ON "Claim"("fingerprint");

-- CreateIndex
CREATE INDEX "Review_claimId_idx" ON "Review"("claimId");

-- CreateIndex
CREATE INDEX "Decision_claimId_idx" ON "Decision"("claimId");

-- CreateIndex
CREATE INDEX "AuditEvent_claimId_idx" ON "AuditEvent"("claimId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
