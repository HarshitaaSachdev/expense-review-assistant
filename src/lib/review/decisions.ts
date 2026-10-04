import { z } from "zod";
import { CATEGORIES } from "../config";
import type { Finding } from "../validation/rules";

export const DECISION_ACTIONS = [
  "APPROVE",
  "REJECT",
  "REQUEST_CLARIFICATION",
  "OVERRIDE_CATEGORY",
  "PROVIDE_CLARIFICATION",
] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

type Status = "PENDING_REVIEW" | "CLARIFICATION_REQUESTED" | "APPROVED" | "REJECTED";

export const DecisionSchema = z.object({
  action: z.enum(DECISION_ACTIONS),
  reviewer: z.string().trim().min(2, "Enter your name").max(80),
  reason: z.string().trim().max(1000).optional(),
  toCategory: z.enum(CATEGORIES).optional(),
});
export type DecisionInput = z.infer<typeof DecisionSchema>;

type ClaimState = {
  status: Status;
  hasReview: boolean;
  latestFindings: Finding[];
  currentCategory: string | null;
};

// Business rules for human decisions. Returns why the decision is not allowed, or null.
export function checkDecision(input: DecisionInput, state: ClaimState): string | null {
  if (state.status === "APPROVED" || state.status === "REJECTED") {
    return `This claim is already ${state.status.toLowerCase()}; decisions are final.`;
  }
  const reason = input.reason?.trim() ?? "";

  switch (input.action) {
    case "APPROVE":
      if (!state.hasReview) return "Run a review before approving.";
      if (state.latestFindings.some((f) => f.severity === "error") && !reason) {
        return "This claim has blocking issues. Give a reason to approve it anyway.";
      }
      return null;
    case "REJECT":
      return reason ? null : "A reason is required to reject a claim.";
    case "REQUEST_CLARIFICATION":
      return reason ? null : "Write the question for the claimant.";
    case "PROVIDE_CLARIFICATION":
      return reason ? null : "Enter the claimant's clarification.";
    case "OVERRIDE_CATEGORY":
      if (!input.toCategory) return "Choose the new category.";
      if (input.toCategory === state.currentCategory) return "The new category is the same as the current one.";
      return reason ? null : "A reason is required to override the AI classification.";
  }
}

export function nextStatus(action: DecisionAction, current: Status): Status {
  switch (action) {
    case "APPROVE":
      return "APPROVED";
    case "REJECT":
      return "REJECTED";
    case "REQUEST_CLARIFICATION":
      return "CLARIFICATION_REQUESTED";
    case "PROVIDE_CLARIFICATION":
      return "PENDING_REVIEW";
    case "OVERRIDE_CATEGORY":
      return current;
  }
}