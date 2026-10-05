import { Card } from "@/components/ui";
import { describeEvent, formatDateTime } from "@/lib/format";
import type { AuditEvent } from "@/lib/types";

const DOT_COLORS: Record<string, string> = {
  CLAIM_CREATED: "bg-slate-400",
  VALIDATION_RUN: "bg-sky-400",
  AI_REVIEW_COMPLETED: "bg-violet-500",
  AI_REVIEW_FALLBACK: "bg-amber-500",
  DECISION_MADE: "bg-emerald-500",
};

export function HistoryTimeline({ events }: { events: AuditEvent[] }) {
  return (
    <Card title="History">
      {events.length === 0 ? (
        <p className="text-sm text-slate-500">No history yet.</p>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="flex gap-3 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_COLORS[event.type] ?? "bg-slate-300"}`} />
              <div>
                <p>{describeEvent(event)}</p>
                <p className="text-xs text-slate-500">
                  {event.actor} · {formatDateTime(event.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}