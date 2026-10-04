import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "./logger";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Every API error has the same shape: { error, details? }
export function errorResponse(error: unknown, event: string) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const details = Object.fromEntries(error.issues.map((issue) => [issue.path.join(".") || "_", issue.message]));
    return NextResponse.json({ error: "Please fix the highlighted fields.", details }, { status: 400 });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  logger.error(event, { error: error instanceof Error ? error.message : String(error) });
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}