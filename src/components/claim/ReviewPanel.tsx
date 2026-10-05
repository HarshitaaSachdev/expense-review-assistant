import Link from "next/link";
import { Badge, Card, VerdictBadge } from "@/components/ui";
import { formatDateTime, formatPercent } from "@/lib/format";
import type { Review } from "@/lib/types";
import type { Severity } from "@/lib/validation/rules";

const SEVERITY: Record<Severity, { tone: "red" | "amber" | "slate"; label: string }> = {
  error: { tone: "red", label: "Blocking" },
  warning: { tone: "amber", label: "Check" },
  info: { tone: "slate", label: "Info" },
};

function PolicyRef({ refId }: { refId: string }) {
  return (
    <Link href={`/policy#clause-${refId}`} className="font-mono text-xs text-sky-700 hover:underline">
      §{refId}
    </Link>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium uppercase text-slate-500">{children}</div>;
}

export function RuleFindings({ review }: { review: Review }) {
  const findings = review.validationFindings;
  return (
    <Card title="Rule checks" actions={<span className="text-xs text-slate-500">Computed by code, not AI</span>}>
      {findings.length === 0 ? (
        <p className="text-sm text-emerald-700">
          ✓ All rule checks passed: required fields, dates, receipt, category limit, duplicates.
        </p>
      ) : (
        <ul className="space-y-2">
          {findings.map((finding, index) => (
            <li key={`${finding.code}-${index}`} className="flex flex-wrap items-start gap-2 text-sm">
              <Badge tone={SEVERITY[finding.severity].tone}>{SEVERITY[finding.severity].label}</Badge>
              <span className="flex-1">{finding.message}</span>
              {finding.policyRef && <PolicyRef refId={finding.policyRef} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AiReviewPanel({ review }: { review: Review }) {
  const isFallback = review.aiSource === "FALLBACK";
  const confidence = review.aiConfidence ?? 0;
  const citations = review.aiCitations ?? [];
  const questions = review.aiQuestions ?? [];
  const notes = review.aiNotes ?? [];

  return (
    <Card
      title="AI review"
      actions={
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {isFallback ? <Badge tone="amber">Rule-based fallback</Badge> : <Badge tone="purple">{review.aiModel}</Badge>}
          <span>{formatDateTime(review.createdAt)}</span>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        {isFallback && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900" role="alert">
            The AI was unavailable{review.aiError ? ` (${review.aiError})` : ""}. This is a rule-based result and needs a
            manual review. You can re-run the review later.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{isFallback ? "Category (unverified)" : "Suggested category"}</Label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-medium">{review.aiCategory ?? "No suggestion"}</span>
              {review.aiUncertain && <Badge tone="amber">Uncertain</Badge>}
            </div>
          </div>
          <div>
            <Label>Confidence</Label>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-slate-100">
                <div
                  className={`h-2 rounded-full ${review.aiUncertain ? "bg-amber-400" : "bg-emerald-500"}`}
                  style={{ width: `${Math.round(confidence * 100)}%` }}
                />
              </div>
              <span className="w-10 text-right tabular-nums">{formatPercent(confidence)}</span>
            </div>
          </div>
        </div>

        {review.aiUncertain && review.aiUncertaintyReason && (
          <p className="rounded-md bg-amber-50 p-2 text-amber-900">
            <span className="font-medium">Why uncertain:</span> {review.aiUncertaintyReason}
          </p>
        )}

        <div>
          <Label>Assessment</Label>
          <div className="mt-1 space-y-1">
            <VerdictBadge verdict={review.aiVerdict} />
            <p>{review.aiExplanation}</p>
          </div>
        </div>

        {questions.length > 0 && (
          <div>
            <Label>Questions for the claimant</Label>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <Label>Policy evidence</Label>
          {citations.length === 0 ? (
            <p className="mt-1 text-slate-500">No policy clauses cited.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {citations.map((citation) => (
                <li key={citation.ref} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <PolicyRef refId={citation.ref} />
                    <span>{citation.section}</span>
                  </div>
                  <blockquote className="mt-1 border-l-2 border-slate-300 pl-3 italic text-slate-700">{citation.text}</blockquote>
                  <p className="mt-1 text-slate-600">
                    <span className="font-medium">Why it applies:</span> {citation.reason}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {notes.length > 0 && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <Label>Guardrail adjustments to the AI output</Label>
            <ul className="mt-1 list-disc pl-5 text-slate-600">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {review.aiRetrievedRefs && review.aiRetrievedRefs.length > 0 && (
          <p className="text-xs text-slate-500">Policy clauses given to the AI: {review.aiRetrievedRefs.join(", ")}</p>
        )}
      </div>
    </Card>
  );
}