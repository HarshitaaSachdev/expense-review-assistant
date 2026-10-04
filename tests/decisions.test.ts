import { describe, expect, it } from "vitest";
import { checkDecision, nextStatus, type DecisionInput } from "../src/lib/review/decisions";
import type { Finding } from "../src/lib/validation/rules";

type ClaimState = Parameters<typeof checkDecision>[1];

const pending: ClaimState = { status: "PENDING_REVIEW", hasReview: true, latestFindings: [], currentCategory: "Meals" };
const futureDate: Finding = { code: "FUTURE_DATE", severity: "error", message: "Future date", policyRef: "1.3" };

function check(input: Partial<DecisionInput>, state: ClaimState = pending) {
  return checkDecision({ action: "APPROVE", reviewer: "Asha", ...input }, state);
}

describe("checkDecision", () => {
  it("allows approving a reviewed claim", () => {
    expect(check({ action: "APPROVE" })).toBeNull();
  });

  it("requires a review before approval", () => {
    expect(check({ action: "APPROVE" }, { ...pending, hasReview: false })).toMatch(/review/i);
  });

  it("requires a reason to approve a claim with blocking issues", () => {
    const state: ClaimState = { ...pending, latestFindings: [futureDate] };
    expect(check({ action: "APPROVE" }, state)).toMatch(/reason/i);
    expect(check({ action: "APPROVE", reason: "Date typo confirmed with claimant" }, state)).toBeNull();
  });

  it.each(["REJECT", "REQUEST_CLARIFICATION", "PROVIDE_CLARIFICATION"] as const)("requires text for %s", (action) => {
    expect(check({ action })).not.toBeNull();
    expect(check({ action, reason: "Details" })).toBeNull();
  });

  it("requires a new category and a reason to override", () => {
    expect(check({ action: "OVERRIDE_CATEGORY", reason: "x" })).toMatch(/category/i);
    expect(check({ action: "OVERRIDE_CATEGORY", toCategory: "Meals", reason: "x" })).toMatch(/same/i);
    expect(check({ action: "OVERRIDE_CATEGORY", toCategory: "Client Entertainment" })).toMatch(/reason/i);
    expect(check({ action: "OVERRIDE_CATEGORY", toCategory: "Client Entertainment", reason: "Client dinner" })).toBeNull();
  });

  it("locks claims after a final decision", () => {
    expect(check({ action: "REJECT", reason: "x" }, { ...pending, status: "APPROVED" })).toMatch(/final/i);
  });
});

describe("nextStatus", () => {
  it("moves claims through the workflow", () => {
    expect(nextStatus("REQUEST_CLARIFICATION", "PENDING_REVIEW")).toBe("CLARIFICATION_REQUESTED");
    expect(nextStatus("PROVIDE_CLARIFICATION", "CLARIFICATION_REQUESTED")).toBe("PENDING_REVIEW");
    expect(nextStatus("OVERRIDE_CATEGORY", "PENDING_REVIEW")).toBe("PENDING_REVIEW");
    expect(nextStatus("APPROVE", "PENDING_REVIEW")).toBe("APPROVED");
  });
});