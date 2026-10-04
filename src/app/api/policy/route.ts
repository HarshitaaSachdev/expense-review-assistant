import { NextResponse } from "next/server";
import { CATEGORY_LIMITS, EXCHANGE_RATES } from "@/lib/config";
import { errorResponse } from "@/lib/http";
import { loadPolicy } from "@/lib/policy/policy";

export async function GET() {
  try {
    return NextResponse.json({ policy: loadPolicy(), limits: CATEGORY_LIMITS, rates: EXCHANGE_RATES });
  } catch (error) {
    return errorResponse(error, "policy.load_failed");
  }
}