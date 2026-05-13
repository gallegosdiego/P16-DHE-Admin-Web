import { formatDate } from "@/lib/utils";
import type { ShipmentEvent } from "@/lib/types";

const statusTone: Record<string, string> = {
  registered: "bg-slate-400",
  confirmed: "bg-blue-500",
  in_transit: "bg-orange-500",
  delivered: "bg-emerald-500",
  issue: "bg-rose-500",
  returned: "bg-purple-500",
  cancelled: "bg-slate-600",
};

export function ShipmentTimeline({ events }: { events: ShipmentEvent[] }) {
  if (!events.length) {
    return <p className="text-sm text-slate-500">Sin eventos de seguimiento.</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((event, index) => {
        const dotClass = statusTone[event.to_status] || "bg-slate-400";
        const isIssue = event.to_status === "issue";
        return (
          <div
            key={event.id}
            className={`relative pl-8 ${isIssue ? "rounded-lg bg-rose-50 p-2" : ""}`}
          >
            {index < events.length - 1 ? (
              <span className="absolute left-[10px] top-6 h-[calc(100%-4px)] w-[2px] bg-slate-200" />
            ) : null}
            <span className={`absolute left-0 top-1 h-5 w-5 rounded-full ${dotClass}`} />
            <p className="text-sm font-semibold text-slate-900">
              {event.description || event.to_status}
            </p>
            <p className="text-xs text-slate-500">{formatDate(event.occurred_at)}</p>
          </div>
        );
      })}
    </div>
  );
}
