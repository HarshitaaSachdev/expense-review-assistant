import type { Prisma } from "@prisma/client";
import { applyVerdictFloor } from "../ai/guardrails";
import { runAiReview } from "../ai/reviewAgent";
import { recordEvent } from "../audit";
import { toClaimInput } from "../claims";
import { prisma } from "../db";
import { isValidCategory, validateClaim } from "../validation/rules";

const json = (value: unknown) => value as Prisma.InputJsonValue;

// Rules -> AI -> guardrails -> save. Every run is stored, so earlier reviews stay in the history.
export async function reviewClaim(claimId: string) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { decisions: { where: { action: "PROVIDE_CLARIFICATION" }, orderBy: { createdAt: "asc" } } },
  });
  if (!claim) return null;

  const input = toClaimInput(claim);
  // A reviewer's category override wins over what the employee submitted
  if (claim.finalCategory) input.category = claim.finalCategory;
  // Clarifications from the claimant are reviewed together with the original description
  for (const clarification of claim.decisions) {
    input.description += `\nClarification from claimant: ${clarification.reason}`;
  }

  const duplicates = await prisma.claim.findMany({
    where: { fingerprint: claim.fingerprint, id: { not: claim.id } },
    select: { id: true },
  });
  const duplicateIds = duplicates.map((d) => d.id);
  const today = new Date();

  let findings = validateClaim(input, {
    today,
    duplicateIds,
    categorySource: claim.finalCategory ? "reviewer" : "submitted",
  });
  await recordEvent({
    claimId,
    type: "VALIDATION_RUN",
    actor: "system",
    details: { findings: findings.map((f) => f.code) },
  });

  let ai = await runAiReview(input, findings);

  // No valid category from the employee: check limits against the AI's suggestion as well
  if (!claim.finalCategory && !isValidCategory(input.category.trim()) && ai.category) {
    findings = validateClaim(input, { today, duplicateIds, effectiveCategory: ai.category, categorySource: "ai" });
    ai = applyVerdictFloor(ai, findings);
  }

  return prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        claimId,
        validationFindings: json(findings),
        aiCategory: ai.category,
        aiConfidence: ai.confidence,
        aiUncertain: ai.uncertain,
        aiUncertaintyReason: ai.uncertaintyReason,
        aiVerdict: ai.verdict,
        aiExplanation: ai.explanation,
        aiCitations: json(ai.citations),
        aiQuestions: json(ai.questions),
        aiNotes: json(ai.notes),
        aiRetrievedRefs: json(ai.retrievedRefs),
        aiSource: ai.source,
        aiModel: ai.model,
        aiError: ai.error,
      },
    });
    await recordEvent(
      {
        claimId,
        type: ai.source === "GEMINI" ? "AI_REVIEW_COMPLETED" : "AI_REVIEW_FALLBACK",
        actor: ai.source === "GEMINI" ? "ai" : "system",
        details: {
          reviewId: review.id,
          model: ai.model,
          category: ai.category,
          confidence: ai.confidence,
          verdict: ai.verdict,
          uncertain: ai.uncertain,
          error: ai.error,
        },
      },
      tx,
    );
    return review;
  });
}