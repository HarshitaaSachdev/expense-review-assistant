"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, buttonClass, EmptyState, ErrorBox, Spinner, Stat, StatusBadge, VerdictBadge } from "@/components/ui";
import { BASE_CURRENCY } from "@/lib/config";
import { formatMoney, STATUS_LABELS } from "@/lib/format";
import type { ClaimListItem, ClaimStatus, Totals } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { toBaseAmount } from "@/lib/validation/rules";

type Filter = ClaimStatus | "ALL";
const FILTERS: Filter[] = ["ALL", "PENDING_REVIEW", "CLARIFICATION_REQUESTED", "APPROVED", "REJECTED"];

export default function ClaimsPage() {
  const { data, error, loading, reload } = useApi<{ claims: ClaimListItem[]; totals: Totals }>("/api/claims");
  const [filter, setFilter] = useState<Filter>("ALL");

  if (loading && !data) return <Spinner label="Loading claims…" />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const { claims, totals } = data;
  const visible = claims.filter((c) => filter === "ALL" || c.status === filter);
  const awaitingDecision = (totals.byStatus.PENDING_REVIEW ?? 0) + (totals.byStatus.CLARIFICATION_REQUESTED ?? 0);
  const needsAttention = claims.filter((c) => !c.latestReview || c.latestReview.aiUncertain).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Expense claims</h1>
          <p className="text-sm text-slate-500">Rule checks and AI suggestions help you review. Every decision is yours.</p>
        </div>
        <Link href="/claims/new" className={buttonClass("primary")}>
          New claim
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total claimed"
          value={formatMoney(totals.total, totals.currency)}
          hint={
            totals.unconvertedCount
              ? `${totals.unconvertedCount} claim(s) in unsupported currencies excluded`
              : "Converted at policy rates (§13)"
          }
        />
        <Stat label="Claims" value={String(totals.claimCount)} />
        <Stat label="Awaiting decision" value={String(awaitingDecision)} />
        <Stat label="Not reviewed or uncertain" value={String(needsAttention)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm ring-1 ${
              filter === f ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f === "ALL" ? "All" : STATUS_LABELS[f]}
            <span className="ml-1 opacity-70">{f === "ALL" ? claims.length : (totals.byStatus[f] ?? 0)}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState title={claims.length === 0 ? "No claims yet" : "No claims with this status"}>
          {claims.length === 0 && (
            <Link href="/claims/new" className="underline">
              Submit the first claim
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Claimant</th>
                <th className="px-4 py-3">Expense</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">AI suggestion</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((claim) => (
                <ClaimRow key={claim.id} claim={claim} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClaimRow({ claim }: { claim: ClaimListItem }) {
  const review = claim.latestReview;
  const category = claim.finalCategory ?? review?.aiCategory ?? (claim.category || "Unclassified");
  const inBase = toBaseAmount(claim.amount, claim.currency);

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 align-top">
        <Link href={`/claims/${claim.id}`} className="font-medium text-slate-900 hover:underline">
          {claim.claimant || "(no claimant)"}
        </Link>
        <div className="text-xs text-slate-500">{claim.expenseDate}</div>
      </td>
      <td className="max-w-xs px-4 py-3 align-top">
        <div className="truncate">{claim.description}</div>
        <div className="text-xs text-slate-500">
          {category}
          {claim.finalCategory ? " · set by reviewer" : ""}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right align-top">
        <div>{formatMoney(claim.amount, claim.currency)}</div>
        {claim.currency !== BASE_CURRENCY && (
          <div className="text-xs text-slate-500">
            {inBase === null ? "unsupported currency" : `≈ ${formatMoney(inBase, BASE_CURRENCY)}`}
          </div>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        {review ? (
          <div className="flex flex-wrap items-center gap-1">
            <VerdictBadge verdict={review.aiVerdict} />
            {review.aiUncertain && <Badge tone="amber">Uncertain</Badge>}
            {review.aiSource === "FALLBACK" && <Badge>Rule-based</Badge>}
          </div>
        ) : (
          <span className="text-xs text-slate-400">Not reviewed yet</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <StatusBadge status={claim.status} />
      </td>
    </tr>
  );
}