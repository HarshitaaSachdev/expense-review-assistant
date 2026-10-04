import { readFileSync } from "node:fs";
import { runAiReview } from "../src/lib/ai/reviewAgent";
import { validateClaim, type ClaimInput } from "../src/lib/validation/rules";

async function main() {
  const samples: ClaimInput[] = JSON.parse(readFileSync("data/sample-claims.json", "utf8"));
  const index = Number(process.argv[2] ?? 4);
  const claim = samples[index];
  if (!claim) throw new Error(`No sample claim at index ${index} (0-${samples.length - 1})`);

  // The raw sample dates are written relative to 2026-10-01
  const findings = validateClaim(claim, { today: new Date("2026-10-01T00:00:00Z") });
  const result = await runAiReview(claim, findings);
  console.log(JSON.stringify({ claim, findings, result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});