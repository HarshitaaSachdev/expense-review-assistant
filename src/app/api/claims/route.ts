import { NextResponse } from "next/server";
import { recordEvent } from "@/lib/audit";
import { CreateClaimSchema, serializeClaim } from "@/lib/claims";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { buildFingerprint, calculateTotals } from "@/lib/validation/rules";

export async function GET() {
  try {
    const claims = await prisma.claim.findMany({
      orderBy: { createdAt: "desc" },
      include: { reviews: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const items = claims.map(({ reviews, ...claim }) => ({ ...serializeClaim(claim), latestReview: reviews[0] ?? null }));
    const totals = calculateTotals(
      items.map((c) => ({
        amount: c.amount,
        currency: c.currency,
        category: c.finalCategory ?? c.latestReview?.aiCategory ?? c.category,
        status: c.status,
      })),
    );
    return NextResponse.json({ claims: items, totals });
  } catch (error) {
    return errorResponse(error, "claims.list_failed");
  }
}

export async function POST(request: Request) {
  try {
    const input = CreateClaimSchema.parse(await request.json());
    const claim = await prisma.$transaction(async (tx) => {
      const created = await tx.claim.create({
        data: {
          claimant: input.claimant,
          expenseDate: input.date,
          category: input.category,
          amount: input.amount,
          currency: input.currency,
          description: input.description,
          receiptAvailable: input.receiptAvailable,
          fingerprint: buildFingerprint(input),
        },
      });
      await recordEvent({ claimId: created.id, type: "CLAIM_CREATED", actor: input.claimant, details: { source: "form" } }, tx);
      return created;
    });
    return NextResponse.json({ claim: serializeClaim(claim) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "claims.create_failed");
  }
}