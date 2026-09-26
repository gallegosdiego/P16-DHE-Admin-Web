import {
  formatProgressDate,
  type ShipmentProgressStep,
  type ShipmentProgressView,
} from "@/lib/shipment-progress";
import { cx } from "./cx";

const stateText: Record<ShipmentProgressStep["state"], string> = {
  done: "completado",
  current: "paso actual",
  issue: "con novedad",
  upcoming: "pendiente",
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current stroke-3 sm:h-4 sm:w-4">
      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StepDate({ iso }: { iso: string | null }) {
  const date = formatProgressDate(iso);
  if (!date) return null;
  return (
    <span className="mt-0.5 block text-[10px] leading-tight text-ink-secondary sm:text-xs">
      <time dateTime={iso ?? undefined}>
        <span className="block">{date.day}</span>
        <span className="block">{date.time}</span>
      </time>
    </span>
  );
}

export type ShipmentProgressBarProps = {
  progress: ShipmentProgressView;
  className?: string;
};

/**
 * Barra horizontal de estados 1-2-3 (Recibido → Entregado), como en las apps
 * de rastreo. Cabe en 360 px: círculos más pequeños y etiquetas que bajan de línea.
 */
export function ShipmentProgressBar({ progress, className }: ShipmentProgressBarProps) {
  if (!progress.known) return null;
  const { steps, notice } = progress;

  return (
    <div className={className} data-testid="shipment-progress" data-outcome={progress.outcome}>
      <ol aria-label="Progreso del envío" className="grid grid-cols-5">
        {steps.map((step, index) => {
          const next = steps[index + 1];
          const lineFilled = next ? next.state !== "upcoming" : false;
          return (
            <li
              key={step.key}
              aria-current={step.current ? "step" : undefined}
              data-state={step.state}
              className="relative flex min-w-0 flex-col items-center px-0.5 text-center"
            >
              {next ? (
                <span
                  aria-hidden="true"
                  className={cx(
                    "absolute left-1/2 top-3.5 h-0.5 w-full sm:top-[18px]",
                    lineFilled ? "bg-brand" : "bg-edge"
                  )}
                />
              ) : null}
              <span
                aria-hidden="true"
                className={cx(
                  "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-display text-xs font-bold sm:h-9 sm:w-9 sm:text-sm",
                  step.state === "done" && "border-brand bg-brand text-white",
                  step.state === "current" && "border-brand bg-surface text-brand ring-4 ring-brand-soft",
                  step.state === "issue" && "border-warning bg-warning text-ink ring-4 ring-warning/25",
                  step.state === "upcoming" && "border-edge bg-surface text-ink-secondary"
                )}
              >
                {step.state === "done" ? <CheckIcon /> : step.number}
              </span>
              <span
                className={cx(
                  "mt-1.5 block text-[11px] font-semibold leading-tight sm:text-xs",
                  step.state === "upcoming" ? "text-ink-secondary" : "text-ink"
                )}
              >
                {step.label}
                <span className="sr-only">
                  {`: paso ${step.number} de ${steps.length}, ${stateText[step.state]}`}
                </span>
              </span>
              {step.state === "done" ? <StepDate iso={step.at} /> : null}
            </li>
          );
        })}
      </ol>

      {notice ? (
        <p
          data-testid="shipment-progress-notice"
          className={cx(
            "mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-ink",
            notice.tone === "warning" ? "border-warning/60 bg-warning/15" : "border-edge bg-app-secondary"
          )}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 fill-none stroke-current stroke-2">
            {notice.tone === "warning" ? (
              <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            ) : (
              <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9h8" />
            )}
          </svg>
          <span>{notice.text}</span>
        </p>
      ) : null}
    </div>
  );
}
