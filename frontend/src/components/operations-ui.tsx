"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

export const controlClass =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0] dark:disabled:bg-[#202035]";

export const textareaClass =
  "min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]";

export const primaryButtonClass =
  "admin-touch-target inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-[#1a1a2e]";

export const secondaryButtonClass =
  "admin-touch-target inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-slate-200";

type HeaderAction = {
  href: string;
  label: string;
  primary?: boolean;
};

export function OperationsHeader({
  eyebrow = "Operación Danhei",
  title,
  description,
  backHref,
  backLabel,
  actions = [],
}: {
  eyebrow?: string;
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  actions?: HeaderAction[];
}) {
  return (
    <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      {backHref && backLabel ? (
        <Link className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline" href={backHref}>
          <span aria-hidden="true">←</span>&nbsp;{backLabel}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-[#e0e0e0]">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
        </div>
        {actions.length > 0 ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {actions.map((action) => (
              <Link
                className={action.primary ? primaryButtonClass : secondaryButtonClass}
                href={action.href}
                key={action.href}
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function OperationsCard({
  title,
  description,
  children,
  className = "",
  action,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#2a2a3e] dark:bg-[#1a1a2e] ${className}`}>
      {title || description || action ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title ? <h2 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function CollapsibleSection({
  title,
  hint,
  badge,
  defaultOpen = false,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm dark:border-[#2a2a3e] dark:bg-[#1a1a2e] ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-5 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-[#e0e0e0]">{title}</span>
            {badge}
          </span>
          {hint ? <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{hint}</span> : null}
        </span>
        <span aria-hidden="true" className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      <div className={open ? "border-t border-slate-200 p-5 dark:border-[#2a2a3e]" : "hidden"}>{children}</div>
    </section>
  );
}

export function FormField({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function MetricCard({ label, value, tone = "primary" }: { label: string; value: number; tone?: "primary" | "route" | "pending" | "issue" }) {
  const tones = {
    primary: "border-l-primary text-primary",
    route: "border-l-route text-route",
    pending: "border-l-pending text-pending",
    issue: "border-l-issue text-issue",
  };

  return (
    <article className={`rounded-xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm dark:border-y-[#2a2a3e] dark:border-r-[#2a2a3e] ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-[#e0e0e0]">{value}</p>
    </article>
  );
}

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: "success" | "route" | "pending" | "issue" | "neutral" }) {
  const tones = {
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    route: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    issue: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    neutral: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200",
  };

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{label}</span>;
}

export function InlineNotice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" | "error" | "warning" }) {
  const tones = {
    info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
    error: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
    warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  };

  return <div role="status" className={`rounded-lg border p-3 text-sm leading-5 ${tones[tone]}`}>{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-slate-400">
      {children}
    </div>
  );
}

export type PipelineStep = {
  key: string;
  label: string;
  /** Qué hacer para avanzar; solo se muestra en el paso actual. */
  hint?: ReactNode;
};

/**
 * Línea temporal del recorrido de una solicitud: pasos completados, paso
 * actual con su siguiente acción, y pasos futuros. Existe porque el flujo
 * (revisar → materializar → asignar → recoger) vive repartido en varias
 * pantallas y sin esto no se sabe en cuál va ni qué falta.
 */
export function PipelineTimeline({
  steps,
  currentIndex,
  tone = "active",
  toneLabel,
}: {
  steps: PipelineStep[];
  currentIndex: number;
  /** "blocked" pinta el paso actual en ámbar (espera externa o novedad); "cancelled" lo apaga. */
  tone?: "active" | "blocked" | "cancelled";
  toneLabel?: string;
}) {
  const current = steps[Math.min(Math.max(currentIndex, 0), steps.length - 1)];

  return (
    <section aria-label="Estado del recorrido" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      <ol className="flex flex-wrap items-start gap-y-3">
        {steps.map((step, index) => {
          const done = index < currentIndex;
          const isCurrent = index === currentIndex;
          const circle = done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : isCurrent
              ? tone === "blocked"
                ? "border-amber-500 bg-amber-500 text-white"
                : tone === "cancelled"
                  ? "border-slate-400 bg-slate-400 text-white"
                  : "border-primary bg-primary text-white"
              : "border-slate-300 bg-white text-slate-400 dark:border-[#2a2a3e] dark:bg-[#16162a]";

          return (
            <li key={step.key} className="flex min-w-0 flex-1 basis-24 flex-col items-center text-center" aria-current={isCurrent ? "step" : undefined}>
              <div className="flex w-full items-center">
                <div className={`h-0.5 flex-1 ${index === 0 ? "bg-transparent" : done || isCurrent ? "bg-emerald-400" : "bg-slate-200 dark:bg-[#2a2a3e]"}`} />
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${circle}`}>
                  {done ? "✓" : index + 1}
                </span>
                <div className={`h-0.5 flex-1 ${index === steps.length - 1 ? "bg-transparent" : done ? "bg-emerald-400" : "bg-slate-200 dark:bg-[#2a2a3e]"}`} />
              </div>
              <span className={`mt-1.5 px-1 text-[11px] font-semibold leading-tight ${isCurrent ? "text-slate-900 dark:text-slate-100" : done ? "text-emerald-700 dark:text-emerald-300" : "text-slate-400 dark:text-slate-500"}`}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      {toneLabel || current?.hint ? (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${tone === "blocked" ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200" : tone === "cancelled" ? "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300" : "bg-primary/5 text-slate-700 dark:bg-primary/10 dark:text-slate-200"}`}>
          {toneLabel ? <strong>{toneLabel} </strong> : null}
          {current?.hint}
        </p>
      ) : null}
    </section>
  );
}
