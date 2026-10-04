import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/http";
import { reviewClaim } from "@/lib/review/runReview";

// AI calls with retries can take a while
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const claim = await prisma.claim.findUnique({ where: { id }, select: { status: true } });
    if (!claim) throw new HttpError(404, "Claim not found.");
    if (claim.status === "APPROVED" || claim.status === "REJECTED") {
      throw new HttpError(409, "This claim is final and cannot be re-reviewed.");
    }
    const review = await reviewClaim(id);
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "review.failed");
  }
}