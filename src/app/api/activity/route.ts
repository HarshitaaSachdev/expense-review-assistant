import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    const events = await prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { claim: { select: { id: true, claimant: true, description: true } } },
    });
    return NextResponse.json({ events });
  } catch (error) {
    return errorResponse(error, "activity.list_failed");
  }
}