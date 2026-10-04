import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { buildFingerprint, parseIsoDate, type ClaimInput } from "../src/lib/validation/rules";

const prisma = new PrismaClient();

// Sample dates are written relative to this day. Shifting them to "today"
// keeps the future-date and 60-day demo cases correct whenever the seed runs.
const SAMPLE_REFERENCE_DATE = "2026-10-01";
const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDate(value: string, offsetDays: number): string {
  const date = parseIsoDate(value);
  if (!date) return value; // keep invalid dates as-is so validation can flag them
  return new Date(date.getTime() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

async function main() {
  const samples: ClaimInput[] = JSON.parse(readFileSync("data/sample-claims.json", "utf8"));

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const offsetDays = Math.round((todayUtc - parseIsoDate(SAMPLE_REFERENCE_DATE)!.getTime()) / DAY_MS);

  // Reset demo data
  await prisma.auditEvent.deleteMany();
  await prisma.decision.deleteMany();
  await prisma.review.deleteMany();
  await prisma.claim.deleteMany();

  for (const sample of samples) {
    const claim = { ...sample, date: shiftDate(sample.date, offsetDays) };
    const created = await prisma.claim.create({
      data: {
        claimant: claim.claimant,
        expenseDate: claim.date,
        category: claim.category,
        amount: claim.amount,
        currency: claim.currency,
        description: claim.description,
        receiptAvailable: claim.receiptAvailable,
        fingerprint: buildFingerprint(claim),
        events: {
          create: { type: "CLAIM_CREATED", actor: "seed", details: { source: "data/sample-claims.json" } },
        },
      },
    });
    console.log(`Seeded ${created.id}  ${claim.date}  ${claim.claimant || "(no claimant)"}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());