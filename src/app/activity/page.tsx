"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, buttonClass, EmptyState, ErrorBox, Spinner } from "@/components/ui";
import { describeEvent, formatDateTime } from "@/lib/format";
import type { AuditEvent } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const TYPES = {
  ALL: "All",
  CLAIM_CREATED: "Submitted",
  VALIDATION_RUN: "Rule checks",
  AI_REVIEW_COMPLETED: "AI reviews",
  AI_REVIEW_FALLBACK: "AI fallbacks",
  DECISION_MADE: "Decisions",
} as const;
type TypeFilter = keyof typeof TYPES;

const TYPE_TONES: Record<string, "slate" | "blue" | "purple" | "amber" | "green"> = {
  CLAIM_CREATED: "slate",
  VALIDATION_RUN: "blue",
  AI_REVIEW_COMPLETED: "purple",
  AI_REVIEW_FALLBACK: "amber",
  DECISION_MADE: "green",
};

export default function ActivityPage() {
  const { data, error, loading, reload } = useApi<{ events: AuditEvent[] }>("/api/activity");
  const [filter, setFilter] = useState<TypeFilter>("ALL");

  if (loading && !data) return <Spinner label="Loading activity…" />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const events = data.events.filter((e) => filter === "ALL" || e.type === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Activity log</h1>
          <p className="text-sm text-slate-500">Every submission, rule check, AI review and decision, newest first.</p>
        </div>
        <button onClick={reload} disabled={loading} className={buttonClass("secondary")}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(TYPES) as TypeFilter[]).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-sm ring-1 ${
              filter === key ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {TYPES[key]}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <EmptyState title="No activity yet" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Claim</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((event) => (
                <tr key={event.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDateTime(event.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={TYPE_TONES[event.type] ?? "slate"}>
                      {TYPES[event.type as TypeFilter] ?? event.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {event.claim ? (
                      <Link href={`/claims/${event.claim.id}`} className="hover:underline">
                        {event.claim.claimant || "(no claimant)"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">{describeEvent(event)}</td>
                  <td className="px-4 py-3 text-slate-500">{event.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}