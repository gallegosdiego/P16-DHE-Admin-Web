import type { ReactNode } from "react";
import { cx } from "./cx";

export type MobileListCardProps = {
  /** Línea principal (p. ej. código de guía o nombre del cliente). */
  title: ReactNode;
  /** Línea secundaria (p. ej. destinatario o dirección). */
  subtitle?: ReactNode;
  /** Metadatos pequeños (p. ej. fecha · zona). */
  meta?: ReactNode;
  /** Chip de estado (normalmente un <StatusBadge>). */
  status?: ReactNode;
  /** Acción al pie (botón o enlace). */
  action?: ReactNode;
  /** Convierte toda la tarjeta en un área pulsable. */
  onClick?: () => void;
  className?: string;
};

/** Tarjeta vertical para listados en móvil (reemplaza filas de tabla). */
export function MobileListCard({ title, subtitle, meta, status, action, onClick, className }: MobileListCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{title}</p>
          {subtitle ? <p className="mt-0.5 truncate text-sm text-ink-secondary">{subtitle}</p> : null}
        </div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      {meta ? <p className="mt-2 text-xs text-ink-secondary">{meta}</p> : null}
      {action ? <div className="mt-3 border-t border-edge pt-3">{action}</div> : null}
    </>
  );

  const baseClasses = cx("rounded-card border border-edge bg-surface p-4 shadow-soft", className);

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cx(
          baseClasses,
          "admin-touch-target block w-full text-left transition-colors duration-150 hover:border-brand/40",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        )}
      >
        {content}
      </button>
    );
  }

  return <div className={baseClasses}>{content}</div>;
}
