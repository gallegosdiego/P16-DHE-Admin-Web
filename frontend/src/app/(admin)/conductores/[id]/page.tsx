"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiSend, describeApiError } from "@/lib/api";
import { resolveApiAssetUrl } from "@/lib/assets";
import { billingTypeLabel, driverStatusLabel, formatCOP, routeStatusLabel, shipmentStatusLabel } from "@/lib/utils";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import { PrintReceiptButton } from "@/components/print-receipt";
import { useToast } from "@/components/toast";
import type { DriverDetail, DriverDocumentAlertLevel, DriverDocumentKey, DriverHistoryDayDetail, DriverHistoryDaySummary, DriverHistorySummary, PaginatedResponse, Shipment, ShipmentStatus } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Input, KpiCard, MobileListCard, SearchInput, Select, StatusBadge } from "@/components/ui";

type DriverDetailExt = DriverDetail & { shipments?: Array<Partial<Shipment> & { id: number; display_code: string }> };
type ShipmentLite = Partial<Shipment> & { id: number; display_code: string; status: ShipmentStatus };

const documentAlertLabels: Record<DriverDocumentAlertLevel, string> = { ok: "Completo", warning: "Por vencer", expired: "Vencido", missing: "Faltante" };
const documentAlertTones: Record<DriverDocumentAlertLevel, "success" | "warning" | "danger" | "neutral"> = { ok: "success", warning: "warning", expired: "danger", missing: "neutral" };
const historyStatusFilters = [{ key: "all", label: "Todo" }, { key: "issues", label: "Con novedad" }, { key: "pending", label: "Con pendientes" }, { key: "completed", label: "Cerradas" }] as const;
const historyShipmentStatusFilters = [{ key: "all", label: "Todos" }, { key: "delivered", label: "Entregados" }, { key: "issue", label: "Novedad" }, { key: "other", label: "Otros" }] as const;

function shipmentTone(status: string | undefined): "success" | "info" | "danger" | "neutral" {
  if (status === "delivered") return "success";
  if (status === "in_transit") return "info";
  if (status === "issue") return "danger";
  return "neutral";
}

export default function ConductorDetallePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const historySectionRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [driver, setDriver] = useState<DriverDetailExt | null>(null);
  const [tab, setTab] = useState<"all" | "delivered" | "pending" | "issue">("all");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [unassigned, setUnassigned] = useState<ShipmentLite[]>([]);
  const [selectedShipment, setSelectedShipment] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<DriverHistoryDaySummary[]>([]);
  const [historySummary, setHistorySummary] = useState<DriverHistorySummary | null>(null);
  const [historyExpandedDate, setHistoryExpandedDate] = useState<string | null>(null);
  const [historyDetails, setHistoryDetails] = useState<Record<string, DriverHistoryDayDetail>>({});
  const [historyDetailLoadingDate, setHistoryDetailLoadingDate] = useState<string | null>(null);
  const [historyDayQuery, setHistoryDayQuery] = useState("");
  const [historyDayStatusFilter, setHistoryDayStatusFilter] = useState<(typeof historyStatusFilters)[number]["key"]>("all");
  const [historyShipmentQuery, setHistoryShipmentQuery] = useState("");
  const [historyShipmentStatusFilter, setHistoryShipmentStatusFilter] = useState<(typeof historyShipmentStatusFilters)[number]["key"]>("all");
  const [documentFiles, setDocumentFiles] = useState<Partial<Record<DriverDocumentKey, File | null>>>({});
  const [documentExpiryDrafts, setDocumentExpiryDrafts] = useState<Partial<Record<DriverDocumentKey, string>>>({});
  const [documentsSaving, setDocumentsSaving] = useState(false);
  const [documentInputResetKey, setDocumentInputResetKey] = useState(0);

  usePageTitle(driver ? `${driver.name} | Pilotos | Danhei Express` : "Piloto | Danhei Express");

  const loadDriverDetail = async () => {
    if (!params.id) return;
    setLoading(true);
    setError("");
    try { setDriver(await apiGet<DriverDetailExt>(`/drivers/${params.id}`)); }
    catch (requestError) { setDriver(null); setError(describeApiError(requestError, "No se pudo cargar el detalle del piloto.").message); }
    finally { setLoading(false); }
  };

  const loadUnassigned = async () => {
    try { const response = await apiGet<PaginatedResponse<ShipmentLite>>("/shipments?driver_id=null&per_page=50"); setUnassigned(response.data || []); }
    catch { try { const fallback = await apiGet<PaginatedResponse<ShipmentLite>>("/shipments?status=registered&per_page=50"); setUnassigned((fallback.data || []).filter((item) => !item.driver_id)); } catch { setUnassigned([]); } }
  };

  const loadHistory = async () => {
    if (!params.id) return;
    setHistoryLoading(true);
    try { const response = await apiGet<PaginatedResponse<DriverHistoryDaySummary> & { summary?: DriverHistorySummary }>(`/drivers/${params.id}/history?per_page=12`); setHistory(response.data || []); setHistorySummary(response.summary ?? null); }
    catch { setHistory([]); setHistorySummary(null); }
    finally { setHistoryLoading(false); }
  };

  const loadHistoryDetail = async (routeDate: string) => {
    if (!params.id || historyDetails[routeDate]) return;
    setHistoryDetailLoadingDate(routeDate);
    try { const detail = await apiGet<DriverHistoryDayDetail>(`/drivers/${params.id}/history/${routeDate}`); setHistoryDetails((current) => ({ ...current, [routeDate]: detail })); }
    catch { showToast("No se pudo cargar ese historial", "error"); }
    finally { setHistoryDetailLoadingDate(null); }
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (params.id) { setHistory([]); setHistoryExpandedDate(null); setHistoryDetails({}); setHistoryDetailLoadingDate(null); void loadDriverDetail(); void loadHistory(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (searchParams.get("section") !== "history") return;
    const timer = setTimeout(() => historySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 180);
    return () => clearTimeout(timer);
  }, [searchParams]);

  useEffect(() => {
    if (!driver) return;
    setDocumentExpiryDrafts(driver.documents.items.reduce<Partial<Record<DriverDocumentKey, string>>>((acc, document) => { if (document.supports_expiry) acc[document.key] = document.expires_at ?? ""; return acc; }, {}));
  }, [driver]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filteredShipments = useMemo(() => {
    const list = (driver?.shipments || []) as ShipmentLite[];
    if (tab === "all") return list;
    if (tab === "delivered") return list.filter((item) => item.status === "delivered");
    if (tab === "issue") return list.filter((item) => item.status === "issue");
    return list.filter((item) => item.status !== "delivered" && item.status !== "issue");
  }, [driver?.shipments, tab]);

  const metrics = useMemo(() => {
    const assigned = Number(driver?.today_summary.assigned || 0);
    const delivered = Number(driver?.today_summary.delivered || 0);
    const rate = assigned > 0 ? Math.round((delivered / assigned) * 100) : 0;
    const cash = Number(driver?.today_summary.cash_collected || 0);
    const pending = Number(driver?.today_summary.pending_cash || 0);
    const total = cash + pending;
    const cashPercent = total > 0 ? Math.round((cash / total) * 100) : 0;
    const issues = ((driver?.shipments || []) as ShipmentLite[]).filter((item) => item.status === "issue").length;
    return { rate, cashPercent, issues };
  }, [driver]);

  const filteredHistory = useMemo(() => {
    const normalizedQuery = historyDayQuery.trim().toLowerCase();
    return history.filter((day) => {
      const matchesQuery = normalizedQuery.length === 0 || [day.route_date, new Date(`${day.route_date}T00:00:00`).toLocaleDateString("es-CO"), ...(day.zones || [])].join(" ").toLowerCase().includes(normalizedQuery);
      const matchesStatus = historyDayStatusFilter === "all" ? true : historyDayStatusFilter === "issues" ? day.issue_stops > 0 : historyDayStatusFilter === "pending" ? day.pending_stops > 0 : day.pending_stops === 0 && day.issue_stops === 0;
      return matchesQuery && matchesStatus;
    });
  }, [history, historyDayQuery, historyDayStatusFilter]);

  const assignShipment = async () => {
    if (!driver || !selectedShipment) return;
    setAssigning(true);
    try { await apiSend(`/shipments/${selectedShipment}/assign`, "POST", { driver_id: driver.id }); showToast("Envío asignado correctamente", "success"); setAssignOpen(false); setSelectedShipment(""); await loadDriverDetail(); }
    catch { showToast("No se pudo asignar el envío", "error"); }
    finally { setAssigning(false); }
  };

  const saveDocuments = async () => {
    if (!driver) return;
    const body: Record<string, unknown> = {};
    const hasFileChanges = Object.values(documentFiles).some(Boolean);
    const hasExpiryChanges = driver.documents.items.some((document) => document.supports_expiry && (documentExpiryDrafts[document.key] ?? "") !== (document.expires_at ?? ""));
    if (!hasFileChanges && !hasExpiryChanges) { showToast("No hay cambios pendientes en el expediente", "error"); return; }
    for (const [key, value] of Object.entries(documentFiles)) if (value) body[key] = value;
    for (const document of driver.documents.items) { if (!document.supports_expiry) continue; const nextValue = documentExpiryDrafts[document.key] ?? ""; if (nextValue !== (document.expires_at ?? "")) body[`${document.key}_expires_at`] = nextValue; }
    setDocumentsSaving(true);
    try { await apiSend(`/drivers/${driver.id}/documents`, "POST", body); showToast("Expediente documental actualizado", "success"); setDocumentFiles({}); setDocumentInputResetKey((current) => current + 1); await loadDriverDetail(); }
    catch (requestError) { showToast(requestError instanceof Error ? requestError.message : "No se pudo guardar el expediente", "error"); }
    finally { setDocumentsSaving(false); }
  };

  const clearDocument = async (documentKey: DriverDocumentKey) => {
    if (!driver) return;
    setDocumentsSaving(true);
    try { await apiSend(`/drivers/${driver.id}/documents`, "POST", { clear_documents: [documentKey] }); showToast("Documento retirado del expediente", "success"); setDocumentFiles((current) => ({ ...current, [documentKey]: null })); setDocumentExpiryDrafts((current) => ({ ...current, [documentKey]: "" })); setDocumentInputResetKey((current) => current + 1); await loadDriverDetail(); }
    catch (requestError) { showToast(requestError instanceof Error ? requestError.message : "No se pudo retirar el documento", "error"); }
    finally { setDocumentsSaving(false); }
  };

  const toggleHistoryDay = (routeDate: string) => {
    setHistoryExpandedDate((current) => { const next = current === routeDate ? null : routeDate; if (next === routeDate) { setHistoryShipmentQuery(""); setHistoryShipmentStatusFilter("all"); void loadHistoryDetail(routeDate); } return next; });
  };

  if (loading) return <Skeleton className="h-64" />;
  if (!driver) return <Card title="No se encontró el piloto"><p className="text-sm text-danger" role="alert">{error || "No se encontró el piloto."}</p><Button className="mt-4" variant="secondary" onClick={() => void loadDriverDetail()}>Reintentar</Button></Card>;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary"><Link href="/conductores" className="font-medium text-brand hover:underline">Pilotos</Link><span aria-hidden="true">/</span><span>{driver.name}</span></div>
      <Card className="border-brand/15"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-soft font-display text-xl font-bold text-brand">{driver.initials}</div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Ficha operativa</p><h1 className="font-display text-2xl font-bold text-ink md:text-3xl">{driver.name}</h1><p className="text-sm text-ink-secondary">{driver.zone || "Sin zona"} · {driver.vehicle || "Sin vehículo"} · {driver.plate || "Sin placa"}</p></div><div className="sm:ml-auto"><StatusBadge status={driver.status} label={driverStatusLabel(driver.status)} tone={driver.status === "inactive" ? "neutral" : driver.status === "route" ? "info" : "success"} /></div></div><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-ink-secondary">Teléfono</dt><dd className="mt-1 font-medium text-ink">{driver.phone || "Sin teléfono"}</dd></div><div><dt className="text-ink-secondary">Correo de la app</dt><dd className="mt-1 break-all font-medium text-ink">{driver.user?.email || "Sin acceso configurado"}</dd></div><div><dt className="text-ink-secondary">Tarifa por paquete</dt><dd className="mt-1 font-medium text-ink">{formatCOP(driver.per_package_rate || 0)}</dd></div><div><dt className="text-ink-secondary">Acceso</dt><dd className="mt-1 font-medium text-ink">{driver.user?.email ? "Habilitado" : "Pendiente"}</dd></div></dl><p className="mt-4 text-xs text-ink-secondary">La contraseña no se muestra por seguridad. Se puede restablecer desde Editar piloto.</p></Card>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><KpiCard label="Asignados" value={driver.today_summary.assigned} support="Jornada de hoy" /><KpiCard label="Entregados" value={driver.today_summary.delivered} support={`${metrics.rate}% de cumplimiento`} tone="success" /><KpiCard label="Recaudo pendiente" value={formatCOP(driver.today_summary.pending_cash)} support="Requiere conciliación" tone="danger" /><KpiCard label="Dinero cobrado" value={formatCOP(driver.today_summary.cash_collected)} support={`${metrics.cashPercent}% del recaudo`} tone="info" /><KpiCard label="Ganancia del día" value={formatCOP(driver.today_summary.earnings)} support="Liquidación estimada" tone="brand" /></section>
      <Card title="Indicadores de jornada"><div className="grid gap-4 md:grid-cols-3"><div><div className="flex items-center justify-between text-sm"><span className="text-ink-secondary">Tasa de entrega</span><strong className="text-ink">{metrics.rate}%</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-app-secondary"><div className="h-2 rounded-full bg-success" style={{ width: `${Math.min(metrics.rate, 100)}%` }} /></div></div><div><div className="flex items-center justify-between text-sm"><span className="text-ink-secondary">Recaudo conciliado</span><strong className="text-ink">{metrics.cashPercent}%</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-app-secondary"><div className="h-2 rounded-full bg-teal" style={{ width: `${Math.min(metrics.cashPercent, 100)}%` }} /></div></div><div><div className="flex items-center justify-between text-sm"><span className="text-ink-secondary">Novedades</span><strong className={metrics.issues > 0 ? "text-danger" : "text-success"}>{metrics.issues}</strong></div><p className="mt-2 text-xs text-ink-secondary">{metrics.issues > 0 ? "Revisar antes de cerrar la jornada" : "Sin novedades registradas"}</p></div></div></Card>

      <Card title="Expediente documental" headerAction={<Badge tone={driver.documents.needs_attention_count > 0 ? "warning" : "success"}>{driver.documents.count_present}/{driver.documents.count_required} · {driver.documents.completion_percent}%</Badge>}><p className="-mt-2 text-sm text-ink-secondary">Licencia, propiedad, SOAT, tecnomecánica y cédula del piloto. Cada estado incluye texto y tono semántico.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Documentos cargados" value={driver.documents.count_present} /><KpiCard label="Pendientes" value={driver.documents.count_missing} tone="warning" /><KpiCard label="Por vencer" value={driver.documents.count_warning} tone="warning" /><KpiCard label="Vencidos" value={driver.documents.count_expired} tone="danger" /></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{driver.documents.items.map((document) => { const documentUrl = resolveApiAssetUrl(document.url); return <article key={document.key} className="rounded-card border border-edge bg-app-secondary p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold text-ink">{document.label}</p><p className="mt-1 text-xs text-ink-secondary">{document.present ? "Documento cargado" : "Pendiente por cargar"}</p></div><StatusBadge status={document.alert_level} label={documentAlertLabels[document.alert_level]} tone={documentAlertTones[document.alert_level]} /></div>{document.alert_message ? <p className="mt-2 text-xs text-ink-secondary">{document.alert_message}</p> : null}{documentUrl ? <a href={documentUrl} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-button border border-edge bg-surface"><img src={documentUrl} alt={document.label} className="h-36 w-full object-cover" /></a> : <div className="mt-3 flex h-36 items-center justify-center rounded-button border border-dashed border-edge bg-surface text-xs text-ink-secondary">Sin imagen cargada</div>}<div className="mt-3 space-y-2">{document.supports_expiry ? <Input label="Vencimiento" type="date" value={documentExpiryDrafts[document.key] ?? ""} onChange={(event) => setDocumentExpiryDrafts((current) => ({ ...current, [document.key]: event.target.value }))} hint={document.expires_at ? `Fecha actual: ${new Date(`${document.expires_at}T00:00:00`).toLocaleDateString("es-CO")}` : "Sin fecha registrada"} /> : null}<input key={`${document.key}-${documentInputResetKey}`} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="block min-h-11 w-full rounded-button border border-edge bg-surface px-3 py-2 text-xs text-ink-secondary file:mr-3 file:rounded-button file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand" onChange={(event) => { const file = event.target.files?.[0] ?? null; setDocumentFiles((current) => ({ ...current, [document.key]: file })); }} />{documentFiles[document.key] ? <p className="text-xs text-ink-secondary">Nuevo archivo: {documentFiles[document.key]?.name}</p> : null}<div className="flex flex-wrap gap-2">{documentUrl ? <Button type="button" variant="danger" size="sm" onClick={() => void clearDocument(document.key)} disabled={documentsSaving}>Quitar</Button> : null}{documentUrl ? <a href={documentUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-button border border-edge bg-surface px-3 text-sm font-semibold text-ink">Abrir</a> : null}</div></div></article>; })}</div><div className="mt-5 flex justify-end"><Button onClick={() => void saveDocuments()} disabled={documentsSaving}>{documentsSaving ? "Guardando expediente…" : "Guardar expediente"}</Button></div></Card>

      <Card title="Envíos asignados hoy" headerAction={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setAssignOpen(true); void loadUnassigned(); }}>Asignar envío</Button><Link href="/conductores" className="inline-flex h-11 items-center rounded-button border border-edge px-4 text-sm font-semibold text-ink">Volver</Link></div>}><div className="mb-4 flex flex-wrap gap-2">{([ ["all", "Todos"], ["delivered", "Entregados"], ["pending", "Pendientes"], ["issue", "Novedad"] ] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`min-h-10 rounded-button border px-3 text-sm font-semibold ${tab === key ? "border-brand bg-brand-soft text-brand" : "border-edge bg-surface text-ink-secondary"}`}>{label}</button>)}</div>{filteredShipments.length === 0 ? <EmptyState title="Sin envíos para este filtro" description="Los envíos asignados al piloto aparecerán aquí." /> : <><div className="hidden overflow-x-auto lg:block"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-ink-secondary"><tr><th className="py-2">Guía</th><th className="py-2">Destinatario</th><th className="py-2">Dirección</th><th className="py-2">Estado</th><th className="py-2">Acción</th></tr></thead><tbody>{filteredShipments.map((shipment) => <tr key={shipment.id} className="border-t border-edge"><td className="py-3 font-display font-semibold text-ink">{shipment.display_code}</td><td className="py-3 text-ink">{shipment.recipient_name || "Sin destinatario"}</td><td className="py-3 text-ink-secondary">{shipment.recipient_address || "-"}</td><td className="py-3"><StatusBadge status={shipment.status} label={shipmentStatusLabel(shipment.status || "registered")} tone={shipmentTone(shipment.status)} /></td><td className="py-3"><PrintReceiptButton shipment={shipment} label="Imprimir guía" /></td></tr>)}</tbody></table></div><div className="space-y-3 lg:hidden">{filteredShipments.map((shipment) => <MobileListCard key={shipment.id} title={shipment.display_code} subtitle={shipment.recipient_name || "Sin destinatario"} meta={shipment.recipient_address || "-"} status={<StatusBadge status={shipment.status} label={shipmentStatusLabel(shipment.status || "registered")} tone={shipmentTone(shipment.status)} />} action={<PrintReceiptButton shipment={shipment} label="Imprimir guía" />} />)}</div></>}</Card>

      <section ref={historySectionRef}><Card title="Historial operativo" headerAction={<Badge tone="neutral">{history.length} jornadas</Badge>}><p className="-mt-2 text-sm text-ink-secondary">Jornadas anteriores con paquetes realmente trabajados.</p>{historySummary ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Jornadas trabajadas" value={historySummary.worked_days} /><KpiCard label="Paquetes completados" value={historySummary.completed_stops} tone="success" /><KpiCard label="COD histórico" value={formatCOP(historySummary.cod_collected)} tone="info" /><KpiCard label="Ganancia histórica" value={formatCOP(historySummary.earnings_total)} tone="brand" /></div> : null}<div className="mt-4 space-y-3"><SearchInput value={historyDayQuery} onChange={(event) => setHistoryDayQuery(event.target.value)} placeholder="Buscar jornada por fecha o zona" /> <div className="flex flex-wrap gap-2">{historyStatusFilters.map((filter) => <button key={filter.key} type="button" onClick={() => setHistoryDayStatusFilter(filter.key)} className={`min-h-10 rounded-button border px-3 text-xs font-semibold ${historyDayStatusFilter === filter.key ? "border-brand bg-brand-soft text-brand" : "border-edge bg-surface text-ink-secondary"}`}>{filter.label}</button>)}</div></div>{historyLoading ? <Skeleton className="mt-4 h-40" /> : filteredHistory.length === 0 ? <EmptyState title={history.length === 0 ? "Aún no hay jornadas históricas" : "No hay jornadas con esos filtros"} description="El historial se actualizará cuando existan rutas cerradas." /> : <div className="mt-4 space-y-3">{filteredHistory.map((day) => { const isExpanded = historyExpandedDate === day.route_date; const detail = historyDetails[day.route_date]; const filteredDetailShipments = detail ? detail.shipments.filter((shipment) => { const normalizedQuery = historyShipmentQuery.trim().toLowerCase(); const matchesQuery = normalizedQuery.length === 0 || [shipment.display_code, shipment.recipient_name || "", shipment.recipient_address || ""].join(" ").toLowerCase().includes(normalizedQuery); const matchesStatus = historyShipmentStatusFilter === "all" ? true : historyShipmentStatusFilter === "other" ? shipment.status !== "delivered" && shipment.status !== "issue" : shipment.status === historyShipmentStatusFilter; return matchesQuery && matchesStatus; }) : []; return <article key={day.route_date} className="rounded-card border border-edge bg-app-secondary p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-display font-semibold text-ink">{new Date(`${day.route_date}T00:00:00`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p><p className="mt-1 text-xs text-ink-secondary">{day.route_count} rutas · {day.shipment_count} paquetes · {day.zones.join(", ") || "Sin zona"}</p></div><div className="flex flex-wrap gap-2"><Badge tone="neutral">{day.completed_stops}/{day.total_stops} completados</Badge><Badge tone="neutral">Ganancia {formatCOP(day.earnings_total)}</Badge><Badge tone="neutral">COD {formatCOP(day.cod_collected)}</Badge><Button variant="secondary" size="sm" onClick={() => toggleHistoryDay(day.route_date)}>{isExpanded ? "Ocultar detalle" : "Ver paquetes"}</Button></div></div><div className="mt-3 grid gap-2 sm:grid-cols-4"><div className="rounded-button bg-surface p-3"><p className="text-xs text-ink-secondary">Entregados</p><p className="mt-1 font-display text-lg font-bold text-success">{day.delivered_count}</p></div><div className="rounded-button bg-surface p-3"><p className="text-xs text-ink-secondary">Pendientes</p><p className="mt-1 font-display text-lg font-bold text-ink">{day.pending_stops}</p></div><div className="rounded-button bg-surface p-3"><p className="text-xs text-ink-secondary">Novedades</p><p className="mt-1 font-display text-lg font-bold text-danger">{day.issue_stops}</p></div><div className="rounded-button bg-surface p-3"><p className="text-xs text-ink-secondary">Estado</p><p className="mt-1 font-semibold text-ink">{routeStatusLabel(day.status)}</p></div></div>{isExpanded ? <div className="mt-4">{historyDetailLoadingDate === day.route_date && !detail ? <Skeleton className="h-28" /> : detail ? <div className="space-y-3"><div className="space-y-3 rounded-card border border-edge bg-surface p-3"><SearchInput value={historyShipmentQuery} onChange={(event) => setHistoryShipmentQuery(event.target.value)} placeholder="Buscar guía, cliente o dirección" /><div className="flex flex-wrap gap-2">{historyShipmentStatusFilters.map((filter) => <button key={`${day.route_date}-${filter.key}`} type="button" onClick={() => setHistoryShipmentStatusFilter(filter.key)} className={`min-h-10 rounded-button border px-3 text-xs font-semibold ${historyShipmentStatusFilter === filter.key ? "border-brand bg-brand-soft text-brand" : "border-edge bg-surface text-ink-secondary"}`}>{filter.label}</button>)}</div><p className="text-xs text-ink-secondary">Mostrando {filteredDetailShipments.length} de {detail.shipments.length} paquetes</p></div>{filteredDetailShipments.length === 0 ? <EmptyState title="No hay paquetes con esos filtros" description="Ajusta la búsqueda para ver otra jornada." /> : <><div className="space-y-3 lg:hidden">{filteredDetailShipments.map((shipment) => <MobileListCard key={`${detail.route_date}-${shipment.stop_id}`} title={shipment.display_code} subtitle={shipment.recipient_name || "Sin destinatario"} meta={`${shipment.recipient_address || "-"} · ${shipment.payment_type === "cash_on_delivery" ? `COD ${formatCOP(shipment.cod_collected_amount ?? shipment.cod_amount ?? 0)}` : billingTypeLabel(shipment.payment_type)}`} status={<StatusBadge status={shipment.status} label={shipmentStatusLabel(shipment.status)} tone={shipmentTone(shipment.status)} />} />)}</div><div className="hidden overflow-x-auto lg:block"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-ink-secondary"><tr><th className="py-2">Ruta</th><th className="py-2">Guía</th><th className="py-2">Destinatario</th><th className="py-2">Dirección</th><th className="py-2">Estado</th><th className="py-2">Pago</th><th className="py-2">Ganancia</th></tr></thead><tbody>{filteredDetailShipments.map((shipment) => <tr key={`${detail.route_date}-${shipment.stop_id}`} className="border-t border-edge"><td className="py-3 text-ink-secondary">#{shipment.route_id}</td><td className="py-3 font-display font-semibold text-ink">{shipment.display_code}</td><td className="py-3 text-ink">{shipment.recipient_name || "Sin destinatario"}</td><td className="py-3 text-ink-secondary">{shipment.recipient_address || "-"}</td><td className="py-3"><StatusBadge status={shipment.status} label={shipmentStatusLabel(shipment.status)} tone={shipmentTone(shipment.status)} /></td><td className="py-3 text-ink">{shipment.payment_type === "cash_on_delivery" ? `COD ${formatCOP(shipment.cod_collected_amount ?? shipment.cod_amount ?? 0)}` : billingTypeLabel(shipment.payment_type)}</td><td className="py-3 text-ink">{formatCOP(shipment.driver_fee ?? 0)}</td></tr>)}</tbody></table></div></>}</div> : null}</div> : null}</article>; })}</div>}</Card></section>

      {assignOpen ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"><Card className="max-h-[100dvh] w-full overflow-y-auto rounded-t-card sm:max-w-xl sm:rounded-card" title="Asignar envío"><p className="text-sm text-ink-secondary">Selecciona un envío sin piloto asignado.</p><Select className="mt-4" aria-label="Envío para asignar" value={selectedShipment} onChange={(event) => setSelectedShipment(event.target.value)}><option value="">Seleccionar envío</option>{unassigned.map((item) => <option key={item.id} value={item.id}>{item.display_code} — {item.recipient_name}</option>)}</Select>{unassigned.length === 0 ? <p className="mt-2 text-xs text-ink-secondary">No hay envíos disponibles para asignar.</p> : null}<div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancelar</Button><Button disabled={!selectedShipment || assigning} onClick={() => void assignShipment()}>{assigning ? "Asignando…" : "Asignar"}</Button></div></Card></div> : null}
    </div>
  );
}
