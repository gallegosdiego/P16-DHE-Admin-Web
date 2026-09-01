import { cx } from "./cx";

export type StepperProps = {
  /** Etiquetas de los pasos, en orden. */
  steps: string[];
  /** Índice (base 0) del paso activo. */
  current: number;
  className?: string;
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current stroke-[3]">
      <path d="m5 12 5 5L19 8" />
    </svg>
  );
}

/**
 * Pasos numerados horizontales: activo en brand, completado con check, pendientes en gris.
 * En mobile muestra una versión compacta ("Paso X de N" + barra de progreso).
 */
export function Stepper({ steps, current, className }: StepperProps) {
  const safeCurrent = Math.min(Math.max(current, 0), steps.length - 1);

  return (
    <div className={className}>
      {/* Desktop: pasos numerados */}
      <ol className="hidden items-center gap-2 md:flex" aria-label="Progreso">
        {steps.map((step, index) => {
          const isCompleted = index < safeCurrent;
          const isActive = index === safeCurrent;
          return (
            <li key={step} className="flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden="true" className={cx("h-px w-8", isCompleted || isActive ? "bg-brand" : "bg-edge")} />
              ) : null}
              <span
                className="flex items-center gap-2"
                aria-current={isActive ? "step" : undefined}
              >
                <span
                  className={cx(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                    isActive && "bg-brand text-white",
                    isCompleted && "bg-brand-soft text-brand",
                    !isActive && !isCompleted && "border border-edge bg-surface text-ink-secondary"
                  )}
                >
                  {isCompleted ? <CheckIcon /> : index + 1}
                </span>
                <span
                  className={cx(
                    "text-sm",
                    isActive ? "font-semibold text-ink" : isCompleted ? "font-medium text-ink" : "text-ink-secondary"
                  )}
                >
                  {step}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {/* Mobile: versión compacta */}
      <div className="md:hidden" aria-label="Progreso">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-ink">{steps[safeCurrent]}</p>
          <p className="text-xs font-medium text-ink-secondary">
            Paso {safeCurrent + 1} de {steps.length}
          </p>
        </div>
        <div className="mt-2 flex gap-1.5">
          {steps.map((step, index) => (
            <span
              key={step}
              aria-hidden="true"
              className={cx(
                "h-1.5 flex-1 rounded-full",
                index < safeCurrent ? "bg-brand-soft" : index === safeCurrent ? "bg-brand" : "bg-edge"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
