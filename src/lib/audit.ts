import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { logger } from "./logger";

// Writes one history entry. Pass a transaction client to save it together with other changes.
export async function recordEvent(
  input: { claimId: string | null; type: string; actor: string; details?: unknown },
  db: Prisma.TransactionClient = prisma,
) {
  await db.auditEvent.create({
    data: {
      claimId: input.claimId,
      type: input.type,
      actor: input.actor,
      details: (input.details ?? {}) as Prisma.InputJsonValue,
    },
  });
  logger.info("audit.event", { claimId: input.claimId, type: input.type, actor: input.actor });
}