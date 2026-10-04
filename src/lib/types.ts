import type { Citation, Verdict } from "./ai/guardrails";
import type { DecisionAction } from "./review/decisions";
import type { calculateTotals, Finding } from "./validation/rules";

export type ClaimStatus = "PENDING_REVIEW" | "CLARIFICATION_REQUESTED" | "APPROVED" | "REJECTED";

export type Claim = {
  id: string;
  claimant: string;
  expenseDate: string;
  category: string;
  amount: number;
  currency: string;
  description: string;
  receiptAvailable: boolean;
  fingerprint: string;
  finalCategory: string | null;
  status: ClaimStatus;
  createdAt: string;
  updatedAt: string;
};

export type Review = {
  id: string;
  claimId: string;
  validationFindings: Finding[];
  aiCategory: string | null;
  aiConfidence: number | null;
  aiUncertain: boolean;
  aiUncertaintyReason: string | null;
  aiVerdict: Verdict | null;
  aiExplanation: string | null;
  aiCitations: Citation[] | null;
  aiQuestions: string[] | null;
  aiNotes: string[] | null;
  aiRetrievedRefs: string[] | null;
  aiSource: "GEMINI" | "FALLBACK";
  aiModel: string | null;
  aiError: string | null;
  createdAt: string;
};

export type Decision = {
  id: string;
  claimId: string;
  action: DecisionAction;
  reviewer: string;
  reason: string | null;
  fromCategory: string | null;
  toCategory: string | null;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  claimId: string | null;
  type: string;
  actor: string;
  details: unknown;
  createdAt: string;
  claim?: { id: string; claimant: string; description: string } | null;
};

export type ClaimListItem = Claim & { latestReview: Review | null };
export type ClaimDetail = Claim & { reviews: Review[]; decisions: Decision[]; events: AuditEvent[] };
export type Totals = ReturnType<typeof calculateTotals>;