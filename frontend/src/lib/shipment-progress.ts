/**
 * Barra de estados 1-2-3 del paquete (contrato 2026-09-26, sección 2).
 *
 * Misma lógica en el panel (P16), el portal del cliente (P14) y el rastreo de
 * la landing (P13): los repos no comparten código, así que este archivo se
 * copia tal cual en P14 `lib/shipment-progress.ts`. Si cambias uno, cambia el otro.
 *
 * Pasos (izquierda → derecha):
 *   1 Recibido      registered / confirmed / pickup_scheduled / picked_up
 *   2 En bodega     in_warehouse
 *   3 Con el piloto handed_to_driver / assigned_to_route
 *   4 En camino     in_transit
 *   5 Entregado     delivered
 *
 * Estados de salida:
 *   issue     → se marca el paso donde iba (último estado conocido en los
 *               eventos; si no hay, «Con el piloto») con aviso «Novedad: <nota>».
 *   returned  → la barra se corta donde iba: los pasos alcanzados quedan
 *               completados y ninguno queda activo. Aviso «Devuelto al remitente».
 *   cancelled → igual que returned, con aviso «Cancelado».
 *
 * Sin imports ni React: se prueba en Node.
 */

export const SHIPMENT_PROGRESS_STEPS = [
  { key: "received", label: "Recibido", statuses: ["registered", "confirmed", "pickup_scheduled", "picked_up"] },
  { key: "warehouse", label: "En bodega", statuses: ["in_warehouse"] },
  { key: "driver", label: "Con el piloto", statuses: ["handed_to_driver", "assigned_to_route"] },
  { key: "on_the_way", label: "En camino", statuses: ["in_transit"] },
  { key: "delivered", label: "Entregado", statuses: ["delivered"] },
] as const;

export type ShipmentProgressStepKey = (typeof SHIPMENT_PROGRESS_STEPS)[number]["key"];

/** Paso donde se marca una novedad cuando los eventos no dicen dónde iba. */
const ISSUE_FALLBACK_STEP = 2;

export type ShipmentProgressEvent = {
  /** Estado al que pasó el paquete (`to_status` / `status`). */
  status?: string | null;
  /** Fecha ISO del cambio. */
  at?: string | null;
  /** Descripción del evento; se usa como nota de la novedad si no hay otra. */
  note?: string | null;
};

export type ShipmentProgressStepState = "done" | "current" | "issue" | "upcoming";

export type ShipmentProgressStep = {
  index: number;
  number: number;
  key: ShipmentProgressStepKey;
  label: string;
  state: ShipmentProgressStepState;
  /** Es el paso donde está el paquete ahora (aria-current). */
  current: boolean;
  /** Última vez que el paquete entró a este paso, si se sabe. */
  at: string | null;
};

export type ShipmentProgressOutcome = "normal" | "delivered" | "issue" | "returned" | "cancelled";

export type ShipmentProgressNotice = {
  tone: "warning" | "neutral";
  text: string;
};

export type ShipmentProgressView = {
  /** false si el estado no es de envío conocido: no se pinta la barra. */
  known: boolean;
  outcome: ShipmentProgressOutcome;
  /** Paso donde está (o donde iba al cortarse). -1 si no se sabe. */
  reachedIndex: number;
  steps: ShipmentProgressStep[];
  notice: ShipmentProgressNotice | null;
};

export function progressStepIndexForStatus(status?: string | null): number {
  if (!status) return -1;
  return SHIPMENT_PROGRESS_STEPS.findIndex((step) => (step.statuses as readonly string[]).includes(status));
}

function clean(value?: string | null): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

function timeOf(value?: string | null): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

/** Orden cronológico estable; los eventos sin fecha conservan su posición relativa. */
function chronological(events: ShipmentProgressEvent[]): ShipmentProgressEvent[] {
  return events
    .map((event, position) => ({ event, position, time: timeOf(event.at) }))
    .sort((a, b) => {
      if (!Number.isNaN(a.time) && !Number.isNaN(b.time) && a.time !== b.time) return a.time - b.time;
      return a.position - b.position;
    })
    .map(({ event }) => event);
}

export function buildShipmentProgress(input: {
  status?: string | null;
  events?: ShipmentProgressEvent[] | null;
  /** Nota de la novedad (p. ej. `issue_note` del paquete). */
  issueNote?: string | null;
  /** Respaldo para la fecha del paso "Entregado" si no hay evento `delivered`. */
  deliveredAt?: string | null;
}): ShipmentProgressView {
  const status = clean(input.status) ?? "";
  const events = chronological((input.events ?? []).filter((event) => event && clean(event.status)));

  // Última vez que el paquete entró a cada paso.
  const stepDates: Array<string | null> = SHIPMENT_PROGRESS_STEPS.map(() => null);
  let lastKnownIndex = -1;
  for (const event of events) {
    const index = progressStepIndexForStatus(event.status);
    if (index < 0) continue;
    lastKnownIndex = index;
    if (clean(event.at)) stepDates[index] = clean(event.at);
  }
  const deliveredIndex = progressStepIndexForStatus("delivered");
  if (!stepDates[deliveredIndex] && clean(input.deliveredAt)) stepDates[deliveredIndex] = clean(input.deliveredAt);

  const directIndex = progressStepIndexForStatus(status);
  let outcome: ShipmentProgressOutcome;
  let reachedIndex: number;
  let notice: ShipmentProgressNotice | null = null;

  if (status === "issue") {
    outcome = "issue";
    reachedIndex = lastKnownIndex >= 0 ? lastKnownIndex : ISSUE_FALLBACK_STEP;
    const lastIssueNote = [...events].reverse().find((event) => event.status === "issue");
    const note = clean(input.issueNote) ?? clean(lastIssueNote?.note);
    notice = { tone: "warning", text: note ? `Novedad: ${note}` : "Novedad" };
  } else if (status === "returned" || status === "cancelled") {
    outcome = status;
    // Todo paquete fue al menos recibido: sin eventos, el corte queda en el paso 1.
    reachedIndex = lastKnownIndex >= 0 ? lastKnownIndex : 0;
    notice = { tone: "neutral", text: status === "returned" ? "Devuelto al remitente" : "Cancelado" };
  } else if (directIndex >= 0) {
    outcome = directIndex === SHIPMENT_PROGRESS_STEPS.length - 1 ? "delivered" : "normal";
    reachedIndex = directIndex;
  } else {
    return {
      known: false,
      outcome: "normal",
      reachedIndex: -1,
      steps: SHIPMENT_PROGRESS_STEPS.map((step, index) => ({
        index,
        number: index + 1,
        key: step.key,
        label: step.label,
        state: "upcoming",
        current: false,
        at: null,
      })),
      notice: null,
    };
  }

  const cut = outcome === "returned" || outcome === "cancelled";

  const steps = SHIPMENT_PROGRESS_STEPS.map((step, index): ShipmentProgressStep => {
    let state: ShipmentProgressStepState;
    if (index < reachedIndex) state = "done";
    else if (index > reachedIndex) state = "upcoming";
    else if (cut || outcome === "delivered") state = "done";
    else if (outcome === "issue") state = "issue";
    else state = "current";

    return {
      index,
      number: index + 1,
      key: step.key,
      label: step.label,
      state,
      current: !cut && index === reachedIndex,
      // La fecha solo acompaña a los pasos que ya se alcanzaron.
      at: index <= reachedIndex ? stepDates[index] : null,
    };
  });

  return { known: true, outcome, reachedIndex, steps, notice };
}

/** «26 sep» + «3:15 p. m.» en hora de Bogotá, para mostrar en dos líneas angostas. */
export function formatProgressDate(iso?: string | null): { day: string; time: string } | null {
  const time = timeOf(iso);
  if (Number.isNaN(time)) return null;
  const date = new Date(time);
  const zone = { timeZone: "America/Bogota" } as const;
  const parts = new Intl.DateTimeFormat("es-CO", { ...zone, day: "numeric", month: "short" }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  // es-CO escribe «26 de sept.»: se deja en «26 sep» para que quepa en móvil.
  const month = (parts.find((part) => part.type === "month")?.value ?? "").replace(/\./g, "").slice(0, 3);
  return {
    day: `${day} ${month}`.trim(),
    time: new Intl.DateTimeFormat("es-CO", { ...zone, hour: "numeric", minute: "2-digit" }).format(date),
  };
}
