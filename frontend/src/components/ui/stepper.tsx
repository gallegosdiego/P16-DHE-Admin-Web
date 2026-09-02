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
      {/* Desktop: cajas [n Etiqueta] con conectores fucsia de ancho IGUAL
          (las cajas no crecen; solo las líneas reparten el espacio). El
          conector que entra al paso activo lleva la luz de avance corriendo
          de izquierda a derecha, como una señal de desvío. */}
      <ol className="hidden items-center md:flex" aria-label="Progreso">
        {steps.map((step, index) => {
          const isCompleted = index < safeCurrent;
          const isActive = index === safeCurrent;
          const connectorDone = index <= safeCurrent; // línea ya recorrida
          // La luz corre en la línea que SALE del paso activo hacia el
          // siguiente: invita a avanzar, como una señal de desvío.
          const connectorNext = index === safeCurrent + 1;
          return (
            <li key={step} className="contents">
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={cx(
                    "mx-2 h-0.5 min-w-6 flex-1 rounded-full",
                    connectorNext
                      ? "stepper-chase"
                      : connectorDone
                        ? "bg-brand"
                        : "bg-brand/20"
                  )}
                />
              ) : null}
              <span
                aria-current={isActive ? "step" : undefined}
                className={cx(
                  "flex shrink-0 items-center gap-2 rounded-button border px-4 py-2 text-sm",
                  isActive && "border-brand bg-brand font-semibold text-white shadow-soft",
                  isCompleted && "border-brand/40 bg-surface font-medium text-brand",
                  !isActive && !isCompleted && "border-edge bg-surface text-ink-secondary"
                )}
              >
                {isCompleted ? (
                  <CheckIcon />
                ) : (
                  <span className={cx("text-xs font-bold", isActive ? "text-white" : "text-ink-secondary")}>
                    {index + 1}
                  </span>
                )}
                <span>{step}</span>
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
