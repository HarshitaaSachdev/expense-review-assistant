"use client";

import { useEffect, useState } from "react";
import { buttonClass, Card } from "@/components/ui";
import { ApiError, api } from "@/lib/api-client";
import { CATEGORIES } from "@/lib/config";
import { ACTION_LABELS, formatDateTime } from "@/lib/format";
import type { DecisionAction } from "@/lib/review/decisions";
import type { ClaimDetail, Review } from "@/lib/types";

const REVIEWER_KEY = "expense-review:reviewer";

const ACTIONS: { action: DecisionAction; label: string; variant: "primary" | "secondary" | "danger" }[] = [
  { action: "APPROVE", label: "Approve", variant: "primary" },
  { action: "REJECT", label: "Reject", variant: "danger" },
  { action: "REQUEST_CLARIFICATION", label: "Request clarification", variant: "secondary" },
  { action: "PROVIDE_CLARIFICATION", label: "Add claimant's answer", variant: "secondary" },
  { action: "OVERRIDE_CATEGORY", label: "Override category", variant: "secondary" },
];

type Props = {
  claim: ClaimDetail;
  latestReview: Review | null;
  disabled: boolean;
  onDecision: (action: DecisionAction) => Promise<void>;
};

const fieldClass = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2";

export function ReviewerActions({ claim, latestReview, disabled, onDecision }: Props) {
  const [reviewer, setReviewer] = useState("");
  const [action, setAction] = useState<DecisionAction | null>(null);
  const [reason, setReason] = useState("");
  const [toCategory, setToCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Remember the reviewer's name on this device (this demo has no login)
  useEffect(() => {
    try {
      setReviewer(localStorage.getItem(REVIEWER_KEY) ?? "");
    } catch {
      // storage unavailable, the user types their name each time
    }
  }, []);

  function updateReviewer(value: string) {
    setReviewer(value);
    try {
      localStorage.setItem(REVIEWER_KEY, value);
    } catch {
      // storage unavailable
    }
  }

  const isFinal = claim.status === "APPROVED" || claim.status === "REJECTED";
  const hasBlockingIssues = latestReview?.validationFindings.some((f) => f.severity === "error") ?? false;
  const currentCategory = claim.finalCategory ?? latestReview?.aiCategory ?? claim.category;

  const reasonLabel: Record<DecisionAction, string> = {
    APPROVE: hasBlockingIssues ? "Reason (required: rule checks found blocking issues)" : "Note (optional)",
    REJECT: "Reason for rejection",
    REQUEST_CLARIFICATION: "Question for the claimant",
    PROVIDE_CLARIFICATION: "Claimant's answer",
    OVERRIDE_CATEGORY: "Reason for the override",
  };

  function choose(next: DecisionAction) {
    setAction(next);
    setError(null);
    setSuccess(null);
    setToCategory("");
    // Start a clarification request from the AI's questions; the reviewer can edit them
    setReason(next === "REQUEST_CLARIFICATION" ? (latestReview?.aiQuestions ?? []).join("\n") : "");
  }

  async function submit() {
    if (!action) return;
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/claims/${claim.id}/decision`, {
        method: "POST",
        json: { action, reviewer, reason: reason || undefined, toCategory: toCategory || undefined },
      });
      setSuccess(`${ACTION_LABELS[action]}.`);
      setAction(null);
      setReason("");
      await onDecision(action);
    } catch (err) {
      const details = err instanceof ApiError && err.details ? Object.values(err.details).join(" ") : "";
      setError(details || (err instanceof Error ? err.message : "Could not save the decision."));
    } finally {
      setSubmitting(false);
    }
  }

  if (isFinal) {
    const last = claim.decisions[0];
    return (
      <Card title="Decision">
        <p className="text-sm">
          This claim was <strong>{claim.status === "APPROVED" ? "approved" : "rejected"}</strong>
          {last ? ` by ${last.reviewer} on ${formatDateTime(last.createdAt)}` : ""}.
        </p>
        {last?.reason && <p className="mt-2 text-sm text-slate-600">Reason: {last.reason}</p>}
        <p className="mt-2 text-xs text-slate-500">Decisions are final.</p>
      </Card>
    );
  }

  return (
    <Card title="Reviewer actions">
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-xs font-medium uppercase text-slate-500">Your name</span>
          <input
            value={reviewer}
            onChange={(e) => updateReviewer(e.target.value)}
            placeholder="e.g. Asha (Finance)"
            className={fieldClass}
          />
        </label>

        {!latestReview && <p className="text-xs text-slate-500">Approval becomes available after the first review.</p>}

        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((item) => (
            <button
              key={item.action}
              type="button"
              disabled={disabled || submitting || (item.action === "APPROVE" && !latestReview)}
              onClick={() => choose(item.action)}
              className={`${buttonClass(item.variant)} ${action === item.action ? "outline-2 outline-offset-2 outline-slate-900" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {action && (
          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            {action === "OVERRIDE_CATEGORY" && (
              <label className="block">
                <span className="text-xs font-medium uppercase text-slate-500">
                  New category (current: {currentCategory || "none"})
                </span>
                <select value={toCategory} onChange={(e) => setToCategory(e.target.value)} className={fieldClass}>
                  <option value="">Choose…</option>
                  {CATEGORIES.filter((c) => c !== currentCategory).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="text-xs font-medium uppercase text-slate-500">{reasonLabel[action]}</span>
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAction(null)} className={buttonClass("secondary")}>
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className={buttonClass(action === "REJECT" ? "danger" : "primary")}
              >
                {submitting ? "Saving…" : `Confirm: ${ACTIONS.find((a) => a.action === action)?.label}`}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-red-50 p-2 text-red-700" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-md bg-emerald-50 p-2 text-emerald-700" role="status">
            {success}
          </p>
        )}
        <p className="text-xs text-slate-500">The AI only recommends. Nothing is approved or rejected until you confirm.</p>
      </div>
    </Card>
  );
}