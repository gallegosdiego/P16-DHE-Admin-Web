import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export type CardProps = ComponentProps<"div"> & {
  /** Encabezado opcional en Space Grotesk. */
  title?: ReactNode;
  /** Contenido a la derecha del título (acciones, chips…). */
  headerAction?: ReactNode;
  /** Quita el padding interno (para tablas que llegan al borde). */
  flush?: boolean;
};

export function Card({ title, headerAction, flush = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-card border border-edge bg-surface shadow-soft",
        !flush && "p-4 md:p-6",
        className
      )}
      {...props}
    >
      {title || headerAction ? (
        <div className={cx("mb-4 flex items-center justify-between gap-3", flush && "p-4 pb-0 md:p-6 md:pb-0")}>
          {title ? <h2 className="font-display text-base font-semibold text-ink md:text-lg">{title}</h2> : <span />}
          {headerAction}
        </div>
      ) : null}
      {children}
    </div>
  );
}
