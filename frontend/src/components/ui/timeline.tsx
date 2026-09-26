import type { ReactNode } from "react";
import type { BadgeTone } from "./badge";
import { cx } from "./cx";

export type TimelineEntryPhoto = {
  id: number | string;
  url: string;
  alt?: string;
};

export type TimelineEntry = {
  id: string;
  /** Fecha y hora ya formateadas para leer ("26 sep · 10:32 a. m."). */
  when: string;
  /** Fecha ISO para el atributo dateTime. */
  dateTime?: string;
  title: string;
  detail?: string | null;
  actor?: string | null;
  /** Custodia: quién lo tenía y quién lo tiene ahora. */
  from?: string | null;
  to?: string | null;
  tone?: BadgeTone;
  icon?: ReactNode;
  photos?: TimelineEntryPhoto[];
};

export type TimelineProps = {
  entries: TimelineEntry[];
  /** Se llama al tocar una miniatura (para abrir el visor). */
  onPhotoClick?: (entry: TimelineEntry, photoIndex: number) => void;
  /** Resalta la última entrada (lo más reciente). */
  highlightLast?: boolean;
  className?: string;
};

const dotTone: Record<BadgeTone, string> = {
  brand: "bg-brand text-white",
  info: "bg-info text-white",
  success: "bg-success text-white",
  warning: "bg-warning text-ink",
  danger: "bg-danger text-white",
  teal: "bg-teal text-white",
  neutral: "bg-ink-secondary text-white",
};

/** Historial vertical: punto de color por tipo, fecha y hora, título, detalle, responsable y fotos. */
export function Timeline({ entries, onPhotoClick, highlightLast = true, className }: TimelineProps) {
  return (
    <ol className={cx("relative space-y-0", className)} aria-label="Historial">
      {entries.map((entry, index) => {
        const last = index === entries.length - 1;
        return (
          <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0" data-testid="timeline-entry">
            {!last ? <span aria-hidden="true" className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-edge" /> : null}
            <span
              aria-hidden="true"
              className={cx(
                "relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                dotTone[entry.tone ?? "neutral"],
                last && highlightLast && "ring-4 ring-brand-soft"
              )}
            >
              {entry.icon ?? <span className="h-2 w-2 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <time dateTime={entry.dateTime} className="block text-xs font-medium text-ink-secondary">
                {entry.when}
              </time>
              <p className={cx("text-sm font-semibold text-ink", last && highlightLast && "font-display text-base")}>
                {entry.title}
              </p>
              {entry.from && entry.to && !entry.title.includes(entry.from) ? (
                <p className="mt-0.5 text-xs text-ink-secondary">
                  {entry.from} <span aria-hidden="true">→</span>
                  <span className="sr-only">pasó a</span> {entry.to}
                </p>
              ) : null}
              {entry.detail ? <p className="mt-0.5 text-sm text-ink-secondary">{entry.detail}</p> : null}
              {entry.actor && !(entry.detail ?? "").includes(entry.actor) ? (
                <p className="mt-0.5 text-xs text-ink-secondary">Por {entry.actor}</p>
              ) : null}
              {entry.photos && entry.photos.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {entry.photos.map((photo, photoIndex) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => onPhotoClick?.(entry, photoIndex)}
                      className="h-16 w-16 overflow-hidden rounded-button border border-edge bg-app-secondary focus-visible:outline-2 focus-visible:outline-brand"
                      aria-label={`Ver foto ${photoIndex + 1} de «${entry.title}»`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={photo.alt ?? ""} loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
