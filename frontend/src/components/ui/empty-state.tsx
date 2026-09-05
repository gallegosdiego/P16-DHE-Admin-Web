import type { ReactNode } from "react";
import { cx } from "./cx";

export type EmptyStateProps = {
  /** Icono lineal opcional (SVG). */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Acción opcional (normalmente un <Button>). */
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-edge bg-surface px-6 py-10 text-center",
        className
      )}
    >
      {icon ? (
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          {icon}
        </div>
      ) : null}
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-secondary">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
