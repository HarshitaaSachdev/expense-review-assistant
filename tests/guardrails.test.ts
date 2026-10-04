import { describe, expect, it } from "vitest";
import { buildFallbackResult, finalizeAiOutput, verdictFloor, type RawAiOutput } from "../src/lib/ai/guardrails";
import { allClauses } from "../src/lib/policy/policy";
import type { Finding } from "../src/lib/validation/rules";

const clauses = allClauses();
const mealClauses = clauses.filter((c) => c.sectionId === "3");

const raw: RawAiOutput = {
  category: "Meals",
  confidence: 0.9,
  verdict: "COMPLIANT",
  explanation: "Business lunch within the meal limit.",
  citations: [{ ref: "3.1", reason: "Meal limit applies" }],
  questions: [],
};

const ctx = { findings: [] as Finding[], providedClauses: mealClauses, model: "test-model" };
const overLimit: Finding = { code: "OVER_LIMIT", severity: "warning", message: "Over limit", policyRef: "3.1" };
const futureDate: Finding = { code: "FUTURE_DATE", severity: "error", message: "Future date", policyRef: "1.3" };

describe("finalizeAiOutput", () => {
  it("takes citation text from the policy, not from the model", () => {
    const result = finalizeAiOutput(raw, ctx);
    expect(result.citations[0]).toMatchObject({ ref: "3.1", text: mealClauses[0].text, reason: "Meal limit applies" });
  });

  it("drops citations to clauses that were not provided", () => {
    const result = finalizeAiOutput(
      { ...raw, citations: [{ ref: "3.1", reason: "ok" }, { ref: "14.2", reason: "invented" }] },
      ctx,
    );
    expect(result.citations.map((c) => c.ref)).toEqual(["3.1"]);
    expect(result.notes.join(" ")).toContain("14.2");
  });

  it("never lets the AI be more lenient than the rules", () => {
    expect(finalizeAiOutput(raw, { ...ctx, findings: [futureDate] }).verdict).toBe("NEEDS_REVIEW");
    expect(finalizeAiOutput(raw, { ...ctx, findings: [overLimit] }).verdict).toBe("NEEDS_CLARIFICATION");
  });

  it("marks low-confidence classifications as uncertain", () => {
    expect(finalizeAiOutput({ ...raw, confidence: 0.55 }, ctx).uncertain).toBe(true);
    expect(finalizeAiOutput(raw, ctx).uncertain).toBe(false);
  });

  it("marks results without valid citations as uncertain", () => {
    expect(finalizeAiOutput({ ...raw, citations: [] }, ctx).uncertain).toBe(true);
  });
});

describe("verdictFloor", () => {
  it("ignores classification-only warnings", () => {
    const needsClass: Finding = { code: "NEEDS_CLASSIFICATION", severity: "warning", message: "classify" };
    expect(verdictFloor([needsClass])).toBe("COMPLIANT");
  });
});

describe("buildFallbackResult", () => {
  it("sends the claim to a human and asks for missing information", () => {
    const missingReceipt: Finding = { code: "MISSING_RECEIPT", severity: "warning", message: "No receipt", policyRef: "2.2" };
    const result = buildFallbackResult({
      claim: { category: "Ground Transport", description: "Cab to office" },
      findings: [missingReceipt],
      clauses,
      guess: { category: "Ground Transport", confidence: 0.45 },
      error: "AI request timed out after 20s",
    });
    expect(result).toMatchObject({ source: "FALLBACK", verdict: "NEEDS_REVIEW", uncertain: true });
    expect(result.questions[0]).toContain("receipt");
    expect(result.citations.map((c) => c.ref)).toContain("2.2");
  });
});