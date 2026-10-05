"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { HistoryTimeline } from "@/components/claim/HistoryTimeline";
import { AiReviewPanel, RuleFindings } from "@/components/claim/ReviewPanel";
import { ReviewerActions } from "@/components/claim/ReviewerActions";
import { Badge, buttonClass, Card, ErrorBox, Spinner, StatusBadge, VerdictBadge } from "@/components/ui";
import { api } from "@/lib/api-client";
import { BASE_CURRENCY } from "@/lib/config";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import type { DecisionAction } from "@/lib/review/decisions";
import type { ClaimDetail } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { toBaseAmount } from "@/lib/validation/rules";

export default function ClaimPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<{ claim: ClaimDetail }>(`/api/claims/${id}`);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const runReview = useCallback(async () => {
    setReviewing(true);
    setReviewError(null);
    try {
      await api(`/api/claims/${id}/review`, { method: "POST" });
      await reload();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "The review failed.");
    } finally {
      setReviewing(false);
    }
  }, [id, reload]);

  const claim = data?.claim;
  const isFinal = claim?.status === "APPROVED" || claim?.status === "REJECTED";

  // A claim is reviewed automatically the first time it is opened
  useEffect(() => {
    if (claim && claim.reviews.length === 0 && !isFinal && !autoStarted.current) {
      autoStarted.current = true;
      runReview();
    }
  }, [claim, isFinal, runReview]);

  if (loading && !data) return <Spinner label="Loading claim…" />;
  if (error && !data) {
    return (
      <div className="space-y-3">
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← Back to claims
        </Link>
        <ErrorBox message={error} onRetry={reload} />
      </div>
    );
  }
  if (!claim) return null;

  const latest = claim.reviews[0] ?? null;
  const earlier = claim.reviews.slice(1);
  const inBase = toBaseAmount(claim.amount, claim.currency);

  async function handleDecision(action: DecisionAction) {
    await reload();
    // New information changes the inputs, so the claim is reviewed again
    if (action === "PROVIDE_CLARIFICATION" || action === "OVERRIDE_CATEGORY") await runReview();
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← Back to claims
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{claim.claimant || "(no claimant)"}</h1>
          <StatusBadge status={claim.status} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Claim">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Description" wide>
                <span className="whitespace-pre-line">{claim.description}</span>
              </Detail>
              <Detail label="Amount">
                {formatMoney(claim.amount, claim.currency)}
                {claim.currency !== BASE_CURRENCY && (
                  <span className="text-slate-500">
                    {" "}
                    ({inBase === null ? "unsupported currency" : `≈ ${formatMoney(inBase, BASE_CURRENCY)}`})
                  </span>
                )}
              </Detail>
              <Detail label="Expense date">{claim.expenseDate || "Missing"}</Detail>
              <Detail label="Submitted category">{claim.category || "None"}</Detail>
              <Detail label="Receipt">{claim.receiptAvailable ? "Available" : "Not available"}</Detail>
              {claim.finalCategory && <Detail label="Category set by reviewer">{claim.finalCategory}</Detail>}
              <Detail label="Submitted">{formatDateTime(claim.createdAt)}</Detail>
            </dl>
          </Card>

          {reviewError && <ErrorBox message={reviewError} onRetry={runReview} />}

          {reviewing ? (
            <Card>
              <Spinner label="Running rule checks and AI review… this can take up to 30 seconds." />
            </Card>
          ) : latest ? (
            <>
              <RuleFindings review={latest} />
              <AiReviewPanel review={latest} />
            </>
          ) : (
            <Card>
              <p className="text-sm text-slate-500">This claim has not been reviewed yet.</p>
            </Card>
          )}

          {!isFinal && !reviewing && (
            <button onClick={runReview} className={buttonClass("secondary")}>
              {latest ? "Re-run review" : "Run review"}
            </button>
          )}

          {earlier.length > 0 && (
            <Card title={`Earlier reviews (${earlier.length})`}>
              <ul className="divide-y divide-slate-100 text-sm">
                {earlier.map((review) => (
                  <li key={review.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="text-slate-500">{formatDateTime(review.createdAt)}</span>
                    <Badge>{review.aiSource === "GEMINI" ? "AI" : "Rule-based"}</Badge>
                    <span>
                      {review.aiCategory ?? "No category"}
                      {review.aiConfidence !== null ? ` · ${formatPercent(review.aiConfidence)}` : ""}
                    </span>
                    <VerdictBadge verdict={review.aiVerdict} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <ReviewerActions claim={claim} latestReview={latest} disabled={reviewing} onDecision={handleDecision} />
          <HistoryTimeline events={claim.events} />
        </div>
      </div>
    </div>
  );
}

function Detail({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}