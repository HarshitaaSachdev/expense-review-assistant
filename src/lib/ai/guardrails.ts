import { AI_CONFIDENCE_THRESHOLD, CATEGORY_LIMITS, type Category } from "../config";
import { isValidCategory, type ClaimInput, type Finding } from "../validation/rules";
import type { PolicyClause } from "../policy/policy";

export const VERDICTS = ["COMPLIANT", "NEEDS_CLARIFICATION", "NEEDS_REVIEW"] as const;
export type Verdict = (typeof VERDICTS)[number];

// What the model returns (already schema-validated before it reaches here)
export type RawAiOutput = {
  category: Category;
  confidence: number;
  verdict: Verdict;
  explanation: string;
  citations: { ref: string; reason: string }[];
  questions: string[];
  uncertaintyReason?: string;
};

export type Citation = { ref: string; section: string; text: string; reason: string };

export type AiReviewResult = {
  source: "GEMINI" | "FALLBACK";
  model: string | null;
  category: Category | null;
  confidence: number;
  uncertain: boolean;
  uncertaintyReason: string | null;
  verdict: Verdict;
  explanation: string;
  citations: Citation[];
  questions: string[];
  retrievedRefs: string[];
  // adjustments the guardrails made, shown to the reviewer
  notes: string[];
  error: string | null;
};

const VERDICT_RANK: Record<Verdict, number> = { COMPLIANT: 0, NEEDS_CLARIFICATION: 1, NEEDS_REVIEW: 2 };

// The most lenient verdict the deterministic findings allow
export function verdictFloor(findings: Finding[]): Verdict {
  if (findings.some((f) => f.severity === "error")) return "NEEDS_REVIEW";
  if (findings.some((f) => f.severity === "warning" && f.code !== "NEEDS_CLASSIFICATION")) {
    return "NEEDS_CLARIFICATION";
  }
  return "COMPLIANT";
}

export function finalizeAiOutput(
  raw: RawAiOutput,
  ctx: { findings: Finding[]; providedClauses: PolicyClause[]; model: string },
): AiReviewResult {
  const notes: string[] = [];
  const byRef = new Map(ctx.providedClauses.map((c) => [c.ref, c]));

  // Quotes always come from the policy file; the model only chooses which clauses apply
  const citations: Citation[] = [];
  for (const { ref, reason } of raw.citations) {
    const clause = byRef.get(ref.replace(/^§/, "").trim());
    if (!clause) {
      notes.push(`Removed citation to "${ref}", which is not one of the retrieved policy clauses.`);
      continue;
    }
    if (!citations.some((c) => c.ref === clause.ref)) {
      citations.push({ ref: clause.ref, section: clause.sectionTitle, text: clause.text, reason });
    }
  }
  if (citations.length === 0) notes.push("No valid policy clause was cited; treat this explanation with caution.");

  // The AI may be stricter than the deterministic checks, never more lenient
  const floor = verdictFloor(ctx.findings);
  let verdict = raw.verdict;
  if (VERDICT_RANK[verdict] < VERDICT_RANK[floor]) {
    notes.push(`Verdict raised from ${verdict} to ${floor} because deterministic checks found issues.`);
    verdict = floor;
  }

  const confidence = Math.min(1, Math.max(0, raw.confidence));
  const uncertain = confidence < AI_CONFIDENCE_THRESHOLD || citations.length === 0;
  const uncertaintyReason = uncertain
    ? raw.uncertaintyReason?.trim() ||
      `Confidence ${Math.round(confidence * 100)}% is below the ${Math.round(AI_CONFIDENCE_THRESHOLD * 100)}% threshold.`
    : null;

  return {
    source: "GEMINI",
    model: ctx.model,
    category: raw.category,
    confidence,
    uncertain,
    uncertaintyReason,
    verdict,
    explanation: raw.explanation.trim(),
    citations,
    questions: raw.questions.map((q) => q.trim()).filter(Boolean).slice(0, 5),
    retrievedRefs: ctx.providedClauses.map((c) => c.ref),
    notes,
    error: null,
  };
}

const FALLBACK_QUESTIONS: Record<string, string> = {
  MISSING_RECEIPT: "The receipt is missing. Please provide a written explanation (policy 2.2).",
  NEEDS_CLASSIFICATION: "Please confirm which expense category this claim belongs to.",
  MISSING_FIELD: "Please fill in the missing required fields.",
  OVER_LIMIT: "The amount exceeds the category limit. Please explain the business reason or attach prior approval.",
  STALE_CLAIM: "Why was this claim submitted more than 60 days after the expense?",
};

// Used when Gemini is not configured, times out, or returns something invalid.
// Always sends the claim to a human and never pretends to be an AI judgement.
export function buildFallbackResult(input: {
  claim: Pick<ClaimInput, "category" | "description">;
  findings: Finding[];
  clauses: PolicyClause[];
  guess: { category: Category | null; confidence: number };
  error: string;
}): AiReviewResult {
  const { claim, findings, clauses, guess, error } = input;
  const submitted = claim.category.trim();
  const submittedValid = isValidCategory(submitted);
  const category = submittedValid ? submitted : guess.category;

  const byRef = new Map(clauses.map((c) => [c.ref, c]));
  const citations: Citation[] = [];
  const cite = (ref: string | undefined, reason: string) => {
    const clause = ref ? byRef.get(ref) : undefined;
    if (clause && !citations.some((c) => c.ref === clause.ref)) {
      citations.push({ ref: clause.ref, section: clause.sectionTitle, text: clause.text, reason });
    }
  };
  for (const finding of findings) cite(finding.policyRef, finding.message);
  if (category) cite(CATEGORY_LIMITS[category].policyRef, `Limit for ${category}.`);

  const questions = [
    ...new Set(findings.map((f) => FALLBACK_QUESTIONS[f.code]).filter((q): q is string => Boolean(q))),
  ];
  const issues = findings.filter((f) => f.severity !== "info").length;
  const suggestion = !submittedValid && guess.category ? ` A keyword match suggests "${guess.category}".` : "";

  return {
    source: "FALLBACK",
    model: null,
    category,
    confidence: submittedValid ? 0.5 : guess.confidence,
    uncertain: true,
    uncertaintyReason: "AI review unavailable; the category comes from the submission or a keyword match and has not been verified.",
    verdict: "NEEDS_REVIEW",
    explanation: `AI review was unavailable, so this is a rule-based result. Deterministic checks found ${issues} issue(s).${suggestion} A reviewer must assess this claim manually.`,
    citations,
    questions,
    retrievedRefs: clauses.map((c) => c.ref),
    notes: [],
    error,
  };
}

// Re-applies the rule floor after findings change (e.g. limits re-checked against the AI's category)
export function applyVerdictFloor(result: AiReviewResult, findings: Finding[]): AiReviewResult {
  const floor = verdictFloor(findings);
  if (VERDICT_RANK[result.verdict] >= VERDICT_RANK[floor]) return result;
  return {
    ...result,
    verdict: floor,
    notes: [
      ...result.notes,
      `Verdict raised from ${result.verdict} to ${floor} after limits were re-checked against the ${result.category} category.`,
    ],
  };
}