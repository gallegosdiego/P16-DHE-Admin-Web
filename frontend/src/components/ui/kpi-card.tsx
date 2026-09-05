import type { ReactNode } from "react";
import { cx } from "./cx";

export type KpiTone = "default" | "brand" | "success" | "warning" | "danger" | "info" | "teal";

const supportToneClasses: Record<KpiTone, string> = {
  default: "text-ink-secondary",
  brand: "text-brand",
  success: "text-success",
  warning: "text-ink",
  danger: "text-danger",
  info: "text-teal",
  teal: "text-teal",
};

export type KpiCardProps = {
  label: string;
  value: ReactNode;
  /** Línea de apoyo pequeña bajo el número. */
  support?: ReactNode;
  /** Tono de estado de la línea de apoyo. */
  tone?: KpiTone;
  className?: string;
};

export function KpiCard({ label, value, support, tone = "default", className }: KpiCardProps) {
  return (
    <div className={cx("rounded-card border border-edge bg-surface p-4 shadow-soft md:p-5", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-secondary">{label}</p>
      <p className="mt-1.5 font-display text-3xl font-bold text-ink md:text-4xl">{value}</p>
      {support ? <p className={cx("mt-1 text-xs font-medium", supportToneClasses[tone])}>{support}</p> : null}
    </div>
  );
}
