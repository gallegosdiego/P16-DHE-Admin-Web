"use client";

import { useMemo, useState, type ReactNode } from "react";
import { EmptyState, PhotoLightbox, Timeline, type BadgeTone, type LightboxPhoto, type TimelineEntry } from "@/components/ui";
import { formatTimelineWhen, type TimelineItem, type TimelineKind } from "@/lib/shipment-timeline";

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const box = "m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4ZM3.5 7v10l8.5 4 8.5-4V7";
const warehouse = "M3 10 12 4l9 6v10H3V10Zm6 10v-6h6v6";
const hand = "M7 11V6a1.5 1.5 0 0 1 3 0v4m0-1V4.5a1.5 1.5 0 0 1 3 0V10m0-4a1.5 1.5 0 0 1 3 0v5m0-2a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L3.5 13a1.5 1.5 0 0 1 2.5-1.7L7 13";
const swap = "M7 7h13l-4-4M17 17H4l4 4";
const road = "M3 6h15M3 12h11M3 18h7M20 6a2 2 0 1 0 0-.01";
const check = "m5 12.5 4.5 4.5L19 7.5";
const alert = "M12 3 22 20H2L12 3ZM12 9v5M12 17h.01";
const back = "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3";
const camera = "M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z";
const money = "M12 6v12M15.5 8.8c-.8-.7-1.9-1-3.2-1-1.8 0-3 .8-3 2.1 0 3.4 6.5 1.6 6.5 5.1 0 1.4-1.3 2.2-3.3 2.2-1.5 0-2.9-.5-3.8-1.3";
const cross = "M6 6l12 12M18 6 6 18";
const dot = "M12 12h.01";

const kindStyle: Record<TimelineKind, { tone: BadgeTone; icon: string }> = {
  created: { tone: "brand", icon: box },
  received_hub: { tone: "info", icon: warehouse },
  handed_to_driver: { tone: "teal", icon: hand },
  transferred: { tone: "teal", icon: swap },
  route_assigned: { tone: "teal", icon: road },
  in_transit: { tone: "info", icon: road },
  delivered: { tone: "success", icon: check },
  delivery_failed: { tone: "danger", icon: alert },
  returned_by_driver: { tone: "warning", icon: back },
  return_confirmed: { tone: "info", icon: warehouse },
  back_to_hub: { tone: "info", icon: warehouse },
  status_change: { tone: "neutral", icon: dot },
  photo_added: { tone: "brand", icon: camera },
  cod_collected: { tone: "success", icon: money },
  cod_settled: { tone: "success", icon: money },
  driver_paid: { tone: "success", icon: money },
  returned_sender: { tone: "warning", icon: back },
  cancelled: { tone: "neutral", icon: cross },
};

export function ShipmentHistory({ items, emptyAction }: { items: TimelineItem[]; emptyAction?: ReactNode }) {
  const [lightbox, setLightbox] = useState<{ photos: LightboxPhoto[]; index: number } | null>(null);

  const entries = useMemo<TimelineEntry[]>(
    () =>
      items.map((item) => {
        const style = kindStyle[item.kind] ?? kindStyle.status_change;
        return {
          id: item.id,
          when: formatTimelineWhen(item.at),
          dateTime: item.at,
          title: item.title,
          detail: item.detail,
          actor: item.actor,
          from: item.from,
          to: item.to,
          tone: style.tone,
          icon: <Glyph d={style.icon} />,
          photos: item.photos.map((photo) => ({ id: photo.id, url: photo.url, alt: item.title })),
        };
      }),
    [items]
  );

  if (entries.length === 0) {
    return <EmptyState title="Todavía no hay movimientos" description="Cuando el paquete avance, cada paso aparecerá aquí." action={emptyAction} />;
  }

  return (
    <>
      <Timeline
        entries={entries}
        onPhotoClick={(entry, photoIndex) =>
          setLightbox({
            photos: (entry.photos ?? []).map((photo) => ({ id: photo.id, url: photo.url, caption: `${entry.title} · ${entry.when}` })),
            index: photoIndex,
          })
        }
      />
      <PhotoLightbox
        photos={lightbox?.photos ?? []}
        index={lightbox?.index ?? null}
        onChange={(index) => setLightbox((current) => (current && index !== null ? { ...current, index } : null))}
      />
    </>
  );
}
