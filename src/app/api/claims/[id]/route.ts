import { NextResponse } from "next/server";
import { serializeClaim } from "@/lib/claims";
import { prisma } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const claim = await prisma.claim.findUnique({
      where: { id },
      include: {
        reviews: { orderBy: { createdAt: "desc" } },
        decisions: { orderBy: { createdAt: "desc" } },
        events: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!claim) throw new HttpError(404, "Claim not found.");
    return NextResponse.json({ claim: serializeClaim(claim) });
  } catch (error) {
    return errorResponse(error, "claims.get_failed");
  }
}