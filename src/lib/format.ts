import type { Verdict } from "./ai/guardrails";
import type { DecisionAction } from "./review/decisions";
import type { AuditEvent, ClaimStatus } from "./types";

export const STATUS_LABELS: Record<ClaimStatus, string> = {
  PENDING_REVIEW: "Pending review",
  CLARIFICATION_REQUESTED: "Clarification requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const VERDICT_LABELS: Record<Verdict, string> = {
  COMPLIANT: "Looks compliant",
  NEEDS_CLARIFICATION: "Needs clarification",
  NEEDS_REVIEW: "Needs review",
};

export const ACTION_LABELS: Record<DecisionAction, string> = {
  APPROVE: "Approved",
  REJECT: "Rejected",
  REQUEST_CLARIFICATION: "Requested clarification",
  OVERRIDE_CATEGORY: "Overrode category",
  PROVIDE_CLARIFICATION: "Added claimant clarification",
};

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount}`; // unknown currency code
  }
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// One readable line per history event
export function describeEvent(event: AuditEvent): string {
  const d = (event.details ?? {}) as Record<string, unknown>;
  switch (event.type) {
    case "CLAIM_CREATED":
      return `Claim submitted (${String(d.source ?? "form")})`;
    case "VALIDATION_RUN": {
      const codes = Array.isArray(d.findings) ? d.findings : [];
      return codes.length ? `Rule checks found: ${codes.join(", ")}` : "Rule checks passed";
    }
    case "AI_REVIEW_COMPLETED": {
      const confidence = typeof d.confidence === "number" ? formatPercent(d.confidence) : "?";
      const verdict = VERDICT_LABELS[d.verdict as Verdict] ?? String(d.verdict);
      return `AI (${d.model}) suggested ${d.category} at ${confidence} confidence: ${verdict}${d.uncertain ? " (uncertain)" : ""}`;
    }
    case "AI_REVIEW_FALLBACK":
      return `AI unavailable, rule-based fallback used${d.error ? `: ${d.error}` : ""}`;
    case "DECISION_MADE": {
      const label = ACTION_LABELS[d.action as DecisionAction] ?? String(d.action);
      const change = d.toCategory ? ` ${d.fromCategory || "none"} → ${d.toCategory}` : "";
      return `${label}${change}${d.reason ? `: "${d.reason}"` : ""}`;
    }
    default:
      return event.type;
  }
}