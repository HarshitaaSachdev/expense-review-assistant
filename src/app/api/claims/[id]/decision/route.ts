import { NextResponse } from "next/server";
import { recordEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/http";
import { checkDecision, DecisionSchema, nextStatus } from "@/lib/review/decisions";
import type { Finding } from "@/lib/validation/rules";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = DecisionSchema.parse(await request.json());

    const claim = await prisma.claim.findUnique({
      where: { id },
      include: { reviews: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!claim) throw new HttpError(404, "Claim not found.");

    const latest = claim.reviews[0];
    const currentCategory = claim.finalCategory ?? latest?.aiCategory ?? claim.category;
    const problem = checkDecision(input, {
      status: claim.status,
      hasReview: Boolean(latest),
      latestFindings: (latest?.validationFindings ?? []) as unknown as Finding[],
      currentCategory,
    });
    if (problem) throw new HttpError(422, problem);

    const isOverride = input.action === "OVERRIDE_CATEGORY";
    const decision = await prisma.$transaction(async (tx) => {
      const created = await tx.decision.create({
        data: {
          claimId: id,
          action: input.action,
          reviewer: input.reviewer,
          reason: input.reason?.trim() || null,
          fromCategory: isOverride ? currentCategory : null,
          toCategory: isOverride ? (input.toCategory ?? null) : null,
        },
      });
      await tx.claim.update({
        where: { id },
        data: {
          status: nextStatus(input.action, claim.status),
          ...(isOverride ? { finalCategory: input.toCategory } : {}),
        },
      });
      await recordEvent(
        {
          claimId: id,
          type: "DECISION_MADE",
          actor: input.reviewer,
          details: {
            decisionId: created.id,
            action: created.action,
            reason: created.reason,
            fromCategory: created.fromCategory,
            toCategory: created.toCategory,
            basedOnReviewId: latest?.id ?? null,
          },
        },
        tx,
      );
      return created;
    });

    return NextResponse.json({ decision }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "decision.failed");
  }
}