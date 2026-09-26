/**
 * Historial unificado del paquete.
 *
 * La API nueva expone `GET /shipments/{id}/timeline` (contrato 2026-09-26).
 * Mientras esa ruta no esté desplegada (404/405) el panel arma los mismos
 * ítems aquí, con los datos que ya trae `GET /shipments/{id}`:
 * `events` (cambios de estado), `custody_events` (quién lo tiene) y
 * `delivery_attempts` (+ sus fotos). Mismos `kind` y títulos que el backend.
 *
 * Sin imports con alias ni dependencias de React: se puede probar en Node.
 */

import { shipmentStatusLabel } from "./utils";

export const TIMELINE_KINDS = [
  "created",
  "received_hub",
  "handed_to_driver",
  "transferred",
  "route_assigned",
  "in_transit",
  "delivered",
  "delivery_failed",
  "returned_by_driver",
  "return_confirmed",
  "back_to_hub",
  "status_change",
  "photo_added",
  "cod_collected",
  "cod_settled",
  "driver_paid",
  "returned_sender",
  "cancelled",
] as const;

export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export type TimelinePhoto = {
  id: number | string;
  url: string;
  type?: string | null;
};

export type TimelineItem = {
  id: string;
  at: string;
  kind: TimelineKind;
  title: string;
  detail?: string | null;
  actor?: string | null;
  from?: string | null;
  to?: string | null;
  photos: TimelinePhoto[];
};

/* ------------------------------------------------------------------ */
/* Forma (parcial y tolerante) del detalle que devuelve GET /shipments/{id} */
/* ------------------------------------------------------------------ */

export type RawEvidence = {
  id: number;
  evidence_type?: string | null;
  url?: string | null;
  original_path?: string | null;
  sealed_path?: string | null;
  delivery_attempt_id?: number | null;
  captured_at?: string | null;
  created_at?: string | null;
  created_by?: number | null;
  metadata_json?: Record<string, unknown> | null;
};

export type RawStatusEvent = {
  id: number;
  from_status?: string | null;
  to_status?: string | null;
  description?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  user?: { id?: number; name?: string | null } | null;
};

export type RawCustodyEvent = {
  id: number;
  event_type: string;
  previous_custodian_type?: string | null;
  previous_custodian_name?: string | null;
  new_custodian_type?: string | null;
  new_custodian_name?: string | null;
  physical_condition?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  actor?: { id?: number; name?: string | null } | null;
  metadata_json?: Record<string, unknown> | null;
};

export type RawDeliveryAttempt = {
  id: number;
  attempt_number?: number | null;
  status?: string | null;
  failure_cause_code?: string | null;
  notes?: string | null;
  recipient_name?: string | null;
  cod_collected_amount?: number | null;
  finished_at?: string | null;
  arrived_at?: string | null;
  started_at?: string | null;
  created_at?: string | null;
  driver?: { id?: number; name?: string | null } | null;
  evidence?: RawEvidence[] | null;
};

export type TimelineSourceShipment = {
  id: number;
  status?: string | null;
  created_at?: string | null;
  recipient_name?: string | null;
  issue_note?: string | null;
  intake_photo?: string | null;
  evidence_photo?: string | null;
  created_by_user?: { name?: string | null } | null;
  events?: RawStatusEvent[] | null;
  custody_events?: RawCustodyEvent[] | null;
  delivery_attempts?: RawDeliveryAttempt[] | null;
  evidence?: RawEvidence[] | null;
};

export type UrlResolver = (value?: string | null) => string | null;

const identityResolver: UrlResolver = (value) => (value && value.trim() ? value.trim() : null);

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function clean(value?: string | null): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

function timeOf(value?: string | null): number {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function evidenceUrl(evidence: RawEvidence, resolve: UrlResolver): string | null {
  return clean(evidence.url) ? resolve(evidence.url) : resolve(evidence.original_path ?? evidence.sealed_path ?? null);
}

function toPhotos(list: RawEvidence[] | null | undefined, resolve: UrlResolver): TimelinePhoto[] {
  return (list ?? [])
    .map((evidence): TimelinePhoto | null => {
      const url = evidenceUrl(evidence, resolve);
      return url ? { id: evidence.id, url, type: evidence.evidence_type ?? null } : null;
    })
    .filter((photo): photo is TimelinePhoto => photo !== null);
}

const conditionLabels: Record<string, string> = {
  good: "buena",
  ok: "buena",
  damaged: "con daño",
  opened: "abierto",
  wet: "mojado",
};

function conditionText(value?: string | null): string | null {
  const key = clean(value);
  if (!key) return null;
  return `condición: ${conditionLabels[key.toLowerCase()] ?? key}`;
}

function noteOf(metadata?: Record<string, unknown> | null): string | null {
  const note = metadata?.note ?? metadata?.notes;
  return typeof note === "string" ? clean(note) : null;
}

function joinDetail(...parts: Array<string | null | undefined>): string | null {
  const values = parts.map((part) => clean(part ?? null)).filter((part): part is string => Boolean(part));
  return values.length ? values.join(" · ") : null;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
}

/* ------------------------------------------------------------------ */
/* Mapeos                                                              */
/* ------------------------------------------------------------------ */

function statusEventToItem(event: RawStatusEvent, shipment: TimelineSourceShipment): TimelineItem | null {
  const at = clean(event.occurred_at) ?? clean(event.created_at);
  const to = clean(event.to_status);
  if (!at || !to) return null;

  const description = clean(event.description);
  const actor = clean(event.user?.name ?? null);
  let kind: TimelineKind = "status_change";
  let title = shipmentStatusLabel(to);

  switch (to) {
    case "registered":
      if (!clean(event.from_status)) {
        kind = "created";
        title = "Paquete registrado";
      }
      break;
    case "in_warehouse":
      kind = "received_hub";
      title = "Recibido en bodega";
      break;
    case "handed_to_driver":
      kind = "handed_to_driver";
      title = "Entregado al piloto";
      break;
    case "assigned_to_route":
      kind = "route_assigned";
      title = "Asignado a una ruta";
      break;
    case "in_transit":
      kind = "in_transit";
      title = "Salió a ruta";
      break;
    case "delivered":
      kind = "delivered";
      title = "Entregado al destinatario";
      break;
    case "issue":
      kind = "delivery_failed";
      title = `No se pudo entregar: ${description ?? clean(shipment.issue_note) ?? "novedad"}`;
      break;
    case "returned":
      kind = "returned_sender";
      title = "Devuelto al remitente";
      break;
    case "cancelled":
      kind = "cancelled";
      title = "Cancelado";
      break;
    case "picked_up":
      title = "Recogido donde el cliente";
      break;
    default:
      title = `Cambió a «${shipmentStatusLabel(to)}»`;
  }

  // La descripción solo suma si dice algo distinto del título.
  const detail =
    description && to !== "issue" && description.toLowerCase() !== title.toLowerCase() ? description : null;

  return {
    id: `status:${event.id}`,
    at,
    kind,
    title,
    detail,
    actor,
    from: null,
    to: null,
    photos: [],
  };
}

function custodyEventToItem(event: RawCustodyEvent): TimelineItem | null {
  const at = clean(event.occurred_at) ?? clean(event.created_at);
  if (!at) return null;

  const from = clean(event.previous_custodian_name);
  const to = clean(event.new_custodian_name);
  const actor = clean(event.actor?.name ?? null);
  const note = noteOf(event.metadata_json);
  let kind: TimelineKind = "status_change";
  let title = "Cambio de custodia";

  switch (event.event_type) {
    case "assigned_to_driver":
      kind = "handed_to_driver";
      title = to ? `Entregado a ${to}` : "Entregado al piloto";
      break;
    case "custody_transferred":
    case "custody_transfer":
      kind = "transferred";
      title = from && to ? `Pasó de ${from} a ${to}` : to ? `Pasó a ${to}` : "Cambió de piloto";
      break;
    case "returned_by_driver":
      kind = "returned_by_driver";
      title = from ? `${from} lo devolvió a bodega` : "El piloto lo devolvió a bodega";
      break;
    case "return_confirmed_at_hub":
      kind = "return_confirmed";
      title = "Bodega confirmó la devolución";
      break;
    case "warehouse_return":
    case "return_received_at_hub":
      kind = "back_to_hub";
      title = "Devuelto a bodega";
      break;
    case "collector_handover_to_hub":
    case "received_at_hub":
      kind = "received_hub";
      title = "Recibido en bodega";
      break;
    case "picked_up_from_client":
      kind = "status_change";
      title = "Recogido donde el cliente";
      break;
    case "delivery_completed":
      kind = "delivered";
      title = to ? `Entregado a ${to}` : "Entregado al destinatario";
      break;
    case "delivery_attempt_failed":
      kind = "delivery_failed";
      title = "No se pudo entregar";
      break;
    case "return_completed_to_client":
      kind = "returned_sender";
      title = "Devuelto al remitente";
      break;
    default:
      title = to ? `Ahora lo tiene ${to}` : "Cambio de custodia";
  }

  const scannedBy = actor && kind === "transferred" ? `Escaneado por ${actor}` : null;

  return {
    id: `custody:${event.id}`,
    at,
    kind,
    title,
    detail: joinDetail(scannedBy, conditionText(event.physical_condition), note),
    actor,
    from,
    to,
    photos: [],
  };
}

function attemptToItem(
  attempt: RawDeliveryAttempt,
  shipment: TimelineSourceShipment,
  resolve: UrlResolver
): TimelineItem | null {
  const at =
    clean(attempt.finished_at) ?? clean(attempt.arrived_at) ?? clean(attempt.started_at) ?? clean(attempt.created_at);
  if (!at) return null;

  const delivered = attempt.status === "delivered";
  const recipient = clean(attempt.recipient_name) ?? clean(shipment.recipient_name);
  const reason = clean(attempt.notes) ?? clean(shipment.issue_note);
  const cod = Number(attempt.cod_collected_amount ?? 0);

  return {
    id: `attempt:${attempt.id}`,
    at,
    kind: delivered ? "delivered" : "delivery_failed",
    title: delivered
      ? recipient
        ? `Entregado a ${recipient}`
        : "Entregado al destinatario"
      : `No se pudo entregar${reason ? `: ${reason}` : ""}`,
    detail: joinDetail(delivered ? reason : null, delivered && cod > 0 ? `Cobró ${formatMoney(cod)}` : null),
    actor: clean(attempt.driver?.name ?? null),
    from: null,
    to: null,
    photos: toPhotos(attempt.evidence, resolve),
  };
}

/** Significado común para deduplicar estado vs custodia. */
function meaningOf(kind: TimelineKind): string | null {
  switch (kind) {
    case "received_hub":
    case "back_to_hub":
    case "return_confirmed":
    case "returned_by_driver":
      return "hub";
    case "handed_to_driver":
    case "transferred":
      return "driver";
    case "delivered":
      return "delivered";
    case "delivery_failed":
      return "failed";
    case "returned_sender":
      return "returned";
    default:
      return null;
  }
}

const DEDUPE_WINDOW_MS = 2 * 60 * 1000;

function isNear(left: string, right: string): boolean {
  const a = timeOf(left);
  const b = timeOf(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= DEDUPE_WINDOW_MS;
}

function sortAscending(items: TimelineItem[]): TimelineItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const a = timeOf(left.item.at);
      const b = timeOf(right.item.at);
      if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b;
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

/**
 * Arma el historial en el cliente a partir del detalle del paquete.
 * Orden cronológico ascendente (lo más viejo arriba), igual que la API.
 */
export function buildTimelineFromShipment(
  shipment: TimelineSourceShipment,
  resolve: UrlResolver = identityResolver
): TimelineItem[] {
  const attempts = shipment.delivery_attempts ?? [];
  const attemptsById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const usedAttemptIds = new Set<number>();

  // 1. Custodia: la fuente más rica ("quién lo tiene").
  const custodyItems: TimelineItem[] = [];
  for (const event of shipment.custody_events ?? []) {
    const item = custodyEventToItem(event);
    if (!item) continue;

    // Los intentos de entrega también dejan un evento de custodia; se funden
    // en uno solo para no repetir "Entregado" dos veces.
    const attemptId = Number(event.metadata_json?.delivery_attempt_id ?? Number.NaN);
    const attempt = Number.isFinite(attemptId) ? attemptsById.get(attemptId) : undefined;
    if (attempt) {
      usedAttemptIds.add(attempt.id);
      const attemptItem = attemptToItem(attempt, shipment, resolve);
      if (attemptItem) {
        item.title = attemptItem.title;
        item.detail = joinDetail(attemptItem.detail, item.detail);
        item.photos = attemptItem.photos;
        item.actor = item.actor ?? attemptItem.actor;
      }
    }
    custodyItems.push(item);
  }

  // 2. Intentos de entrega que no quedaron ligados a un evento de custodia.
  const attemptItems: TimelineItem[] = [];
  for (const attempt of attempts) {
    if (usedAttemptIds.has(attempt.id)) continue;
    const item = attemptToItem(attempt, shipment, resolve);
    if (!item) continue;
    const duplicate = custodyItems.some(
      (custody) => meaningOf(custody.kind) === meaningOf(item.kind) && isNear(custody.at, item.at)
    );
    if (duplicate) {
      const target = custodyItems.find(
        (custody) => meaningOf(custody.kind) === meaningOf(item.kind) && isNear(custody.at, item.at)
      );
      if (target) target.photos = [...target.photos, ...item.photos];
      continue;
    }
    attemptItems.push(item);
  }

  // 3. Cambios de estado: se omiten cuando repiten un hecho de custodia/intento.
  const richItems = [...custodyItems, ...attemptItems];
  const statusItems: TimelineItem[] = [];
  for (const event of shipment.events ?? []) {
    const item = statusEventToItem(event, shipment);
    if (!item) continue;
    const meaning = meaningOf(item.kind);
    const duplicate =
      meaning !== null &&
      richItems.some((rich) => meaningOf(rich.kind) === meaning && isNear(rich.at, item.at));
    if (duplicate) continue;
    statusItems.push(item);
  }

  // Si no hubo evento de creación, el registro del paquete abre la historia.
  const hasCreated = statusItems.some((item) => item.kind === "created");
  const createdAt = clean(shipment.created_at);
  if (!hasCreated && createdAt) {
    statusItems.unshift({
      id: `shipment:${shipment.id}`,
      at: createdAt,
      kind: "created",
      title: "Paquete registrado",
      detail: null,
      actor: clean(shipment.created_by_user?.name ?? null),
      from: null,
      to: null,
      photos: [],
    });
  }

  // 4. Fotos agregadas después (sin intento de entrega).
  const looseItems: TimelineItem[] = [];
  for (const evidence of shipment.evidence ?? []) {
    if (evidence.delivery_attempt_id) continue;
    if (evidence.evidence_type !== "late_photo") continue;
    const url = evidenceUrl(evidence, resolve);
    const at = clean(evidence.captured_at) ?? clean(evidence.created_at);
    if (!url || !at) continue;
    looseItems.push({
      id: `evidence:${evidence.id}`,
      at,
      kind: "photo_added",
      title: "Foto agregada",
      detail: noteOf(evidence.metadata_json),
      actor: null,
      from: null,
      to: null,
      photos: [{ id: evidence.id, url, type: evidence.evidence_type }],
    });
  }

  const items = sortAscending([...statusItems, ...richItems, ...looseItems]);

  // La foto de ingreso acompaña al primer paso del paquete.
  const intakeUrl = resolve(shipment.intake_photo ?? null);
  if (intakeUrl && items.length > 0) {
    const first = items.find((item) => item.kind === "created" || item.kind === "received_hub") ?? items[0];
    first.photos = [{ id: "intake", url: intakeUrl, type: "intake_photo" }, ...first.photos];
  }

  return items;
}

/** Normaliza la respuesta de `GET /shipments/{id}/timeline`. Devuelve null si no tiene la forma esperada. */
export function normalizeTimelineResponse(payload: unknown, resolve: UrlResolver = identityResolver): TimelineItem[] | null {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return null;

  const kinds = new Set<string>(TIMELINE_KINDS);
  const items: TimelineItem[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const at = typeof entry.at === "string" ? entry.at : null;
    const title = typeof entry.title === "string" ? entry.title : null;
    if (!at || !title) continue;
    const kind = typeof entry.kind === "string" && kinds.has(entry.kind) ? (entry.kind as TimelineKind) : "status_change";
    const photos = Array.isArray(entry.photos)
      ? (entry.photos as Array<Record<string, unknown>>)
          .map((photo, index): TimelinePhoto | null => {
            const url = resolve(typeof photo?.url === "string" ? photo.url : null);
            return url
              ? {
                  id: (typeof photo.id === "number" || typeof photo.id === "string" ? photo.id : index) as number | string,
                  url,
                  type: typeof photo.type === "string" ? photo.type : null,
                }
              : null;
          })
          .filter((photo): photo is TimelinePhoto => photo !== null)
      : [];
    const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
    items.push({
      id: typeof entry.id === "string" || typeof entry.id === "number" ? String(entry.id) : `${kind}:${at}`,
      at,
      kind,
      title,
      detail: text(entry.detail),
      actor: text(entry.actor),
      from: text(entry.from),
      to: text(entry.to),
      photos,
    });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* Galería de fotos                                                    */
/* ------------------------------------------------------------------ */

export type ShipmentPhotoGroup = "intake" | "delivery" | "issue" | "late" | "other";

export type ShipmentPhoto = TimelinePhoto & {
  group: ShipmentPhotoGroup;
  label: string;
  at?: string | null;
};

const photoGroupLabels: Record<ShipmentPhotoGroup, string> = {
  intake: "Ingreso",
  delivery: "Entrega",
  issue: "Novedad",
  late: "Agregada después",
  other: "Foto",
};

function groupOfType(type?: string | null): ShipmentPhotoGroup {
  switch (type) {
    case "intake_photo":
      return "intake";
    case "delivery_photo":
    case "evidence_photo":
      return "delivery";
    case "issue_photo":
      return "issue";
    case "late_photo":
      return "late";
    default:
      return "other";
  }
}

/**
 * Todas las fotos del paquete, sin repetir URL: ingreso, entrega, novedad y
 * las agregadas después. Acepta el historial ya armado para reutilizar sus fotos.
 */
export function collectShipmentPhotos(
  shipment: TimelineSourceShipment,
  timeline: TimelineItem[] = [],
  resolve: UrlResolver = identityResolver
): ShipmentPhoto[] {
  const seen = new Set<string>();
  const photos: ShipmentPhoto[] = [];
  const push = (photo: TimelinePhoto, fallbackGroup: ShipmentPhotoGroup, at?: string | null) => {
    if (!photo.url || seen.has(photo.url)) return;
    seen.add(photo.url);
    const byType = groupOfType(photo.type);
    const group = byType === "other" ? fallbackGroup : byType;
    photos.push({ ...photo, group, label: photoGroupLabels[group], at: at ?? null });
  };

  const intakeUrl = resolve(shipment.intake_photo ?? null);
  if (intakeUrl) push({ id: "intake", url: intakeUrl, type: "intake_photo" }, "intake", shipment.created_at);

  for (const item of timeline) {
    const fallback: ShipmentPhotoGroup =
      item.kind === "delivered" ? "delivery" : item.kind === "delivery_failed" ? "issue" : item.kind === "photo_added" ? "late" : "other";
    for (const photo of item.photos) push(photo, fallback, item.at);
  }

  for (const attempt of shipment.delivery_attempts ?? []) {
    const fallback: ShipmentPhotoGroup = attempt.status === "delivered" ? "delivery" : "issue";
    for (const photo of toPhotos(attempt.evidence, resolve)) push(photo, fallback, attempt.finished_at);
  }

  for (const evidence of shipment.evidence ?? []) {
    const url = evidenceUrl(evidence, resolve);
    if (!url) continue;
    push({ id: evidence.id, url, type: evidence.evidence_type }, "other", evidence.captured_at ?? evidence.created_at);
  }

  const legacyEvidence = resolve(shipment.evidence_photo ?? null);
  if (legacyEvidence) push({ id: "evidence_photo", url: legacyEvidence, type: "evidence_photo" }, "delivery");

  return photos;
}

/* ------------------------------------------------------------------ */
/* Fechas y resumen en una línea                                       */
/* ------------------------------------------------------------------ */

const BOGOTA = "America/Bogota";

function bogotaDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BOGOTA, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** "10:32 a. m." en hora de Bogotá. */
export function formatClock(iso?: string | null): string | null {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: BOGOTA }).format(date);
}

/** "Hoy", "Ayer" o "24 sep" (con año si no es el actual). */
export function formatDayLabel(iso?: string | null, now: Date = new Date()): string | null {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const key = bogotaDayKey(date);
  if (key === bogotaDayKey(now)) return "Hoy";
  if (key === bogotaDayKey(new Date(now.getTime() - 86_400_000))) return "Ayer";
  const sameYear = key.slice(0, 4) === bogotaDayKey(now).slice(0, 4);
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: BOGOTA,
  })
    .format(date)
    .replace(".", "");
}

/** "Hoy · 10:32 a. m." / "24 sep · 3:15 p. m." */
export function formatTimelineWhen(iso?: string | null, now: Date = new Date()): string {
  const day = formatDayLabel(iso, now);
  const clock = formatClock(iso);
  if (!day || !clock) return iso ?? "";
  return `${day} · ${clock}`;
}

/** "desde las 10:32 a. m." hoy, "desde ayer 4:10 p. m." o "desde el 24 sep, 9:00 a. m.". */
function sinceText(iso: string | null | undefined, now: Date): string | null {
  const day = formatDayLabel(iso, now);
  const clock = formatClock(iso);
  if (!day || !clock) return null;
  if (day === "Hoy") return `desde las ${clock}`;
  if (day === "Ayer") return `desde ayer ${clock}`;
  return `desde el ${day}, ${clock}`;
}

function atText(prefix: string, iso: string | null | undefined, now: Date): string {
  const day = formatDayLabel(iso, now);
  const clock = formatClock(iso);
  if (!day || !clock) return prefix;
  if (day === "Hoy") return `${prefix} hoy ${clock}`;
  if (day === "Ayer") return `${prefix} ayer ${clock}`;
  return `${prefix} el ${day}, ${clock}`;
}

export type SummarySource = {
  status?: string | null;
  created_at?: string | null;
  delivered_at?: string | null;
  issue_note?: string | null;
  driver_name?: string | null;
  driver?: { name?: string | null } | null;
};

function lastOf(items: TimelineItem[], kinds: TimelineKind[]): TimelineItem | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (kinds.includes(items[index].kind)) return items[index];
  }
  return undefined;
}

/**
 * Resumen en una línea de dónde está el paquete ahora.
 * Usa el ÚLTIMO evento relevante del historial: tras un traspaso entre pilotos
 * la hora es la del piloto actual, no la del primero.
 */
export function shipmentSummaryLine(shipment: SummarySource, timeline: TimelineItem[], now: Date = new Date()): string {
  const status = shipment.status ?? "";
  const driverName = clean(shipment.driver?.name ?? null) ?? clean(shipment.driver_name ?? null);

  switch (status) {
    case "delivered": {
      const item = lastOf(timeline, ["delivered"]);
      return atText("Entregado", item?.at ?? shipment.delivered_at, now);
    }
    case "issue": {
      const item = lastOf(timeline, ["delivery_failed"]);
      const fromTitle = item?.title.replace(/^No se pudo entregar:?\s*/i, "").trim();
      const reason = clean(shipment.issue_note) ?? (fromTitle || null) ?? clean(item?.detail ?? null);
      return reason ? `Novedad abierta: ${reason}` : "Novedad abierta";
    }
    case "handed_to_driver":
    case "assigned_to_route":
    case "in_transit": {
      const item = lastOf(timeline, ["handed_to_driver", "transferred"]);
      const holder = driverName ?? clean(item?.to ?? null);
      const since = sinceText(item?.at, now);
      if (holder && since) return `Con ${holder} ${since}`;
      if (holder) return `Con ${holder}`;
      return status === "in_transit" ? "En ruta" : "Con el piloto";
    }
    case "in_warehouse": {
      const item = lastOf(timeline, ["received_hub", "back_to_hub", "return_confirmed", "returned_by_driver"]);
      const since = sinceText(item?.at ?? shipment.created_at, now);
      return since ? `En bodega ${since}` : "En bodega";
    }
    case "returned":
      return "Devuelto al remitente";
    case "cancelled":
      return "Cancelado";
    case "registered":
    case "confirmed":
    case "pickup_scheduled":
    case "picked_up":
      return atText("Registrado", shipment.created_at, now) + " · aún no llega a bodega";
    default:
      return shipmentStatusLabel(status);
  }
}
