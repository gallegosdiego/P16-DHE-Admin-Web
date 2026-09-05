import type { ReactNode } from "react";
import { cx } from "./cx";

export type BadgeTone = "brand" | "info" | "success" | "warning" | "danger" | "teal" | "neutral";

/**
 * Chips de estado según el libro de marca: fondo suave + texto del color del estado.
 * Para info/cyan el texto usa Deep Teal (el cyan puro no alcanza contraste AA sobre fondo claro).
 */
export const badgeToneClasses: Record<BadgeTone, string> = {
  brand: "bg-brand-soft text-brand",
  info: "bg-info/15 text-teal",
  success: "bg-success/15 text-success",
  warning: "bg-warning/25 text-ink",
  danger: "bg-danger/10 text-danger",
  teal: "bg-teal/10 text-teal",
  neutral: "bg-ink/8 text-ink-secondary",
};

export type BadgeProps = {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
};

export function Badge({ tone = "neutral", className, children }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        badgeToneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
