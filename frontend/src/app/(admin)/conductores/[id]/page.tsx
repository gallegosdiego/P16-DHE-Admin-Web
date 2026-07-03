"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { billingTypeLabel, driverStatusLabel, formatCOP, routeStatusLabel, shipmentStatusLabel } from "@/lib/utils";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import { PrintReceiptButton } from "@/components/print-receipt";
import { useToast } from "@/components/toast";
import type {
  DriverDetail,
  DriverDocumentAlertLevel,
  DriverDocumentKey,
  DriverHistoryDayDetail,
  DriverHistoryDaySummary,
  DriverHistorySummary,
  PaginatedResponse,
  Shipment,
  ShipmentStatus,
} from "@/lib/types";

type DriverDetailExt = DriverDetail & {
  shipments?: Array<Partial<Shipment> & { id: number; display_code: string }>;
};

type ShipmentLite = Partial<Shipment> & { id: number; display_code: string; status: ShipmentStatus };

const statusBadge: Record<string, string> = {
  delivered: "bg-emerald-50 text-delivered",
  in_transit: "bg-blue-50 text-route",
  issue: "bg-rose-50 text-issue",
  registered: "bg-amber-50 text-pending",
};

const documentAlertStyles: Record<DriverDocumentAlertLevel, string> = {
  ok: "bg-emerald-50 text-delivered dark:bg-emerald-500/10 dark:text-emerald-300",
  warning: "bg-amber-50 text-pending dark:bg-amber-500/10 dark:text-amber-300",
  expired: "bg-rose-50 text-issue dark:bg-rose-500/10 dark:text-rose-300",
  missing: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
};

const documentAlertLabels: Record<DriverDocumentAlertLevel, string> = {
  ok: "OK",
  warning: "Atencion",
  expired: "Vencido",
  missing: "Faltante",
};

const historyStatusFilters = [
  { key: "all", label: "Todo" },
  { key: "issues", label: "Con novedad" },
  { key: "pending", label: "Con pendientes" },
  { key: "completed", label: "Cerradas" },
] as const;

const historyShipmentStatusFilters = [
  { key: "all", label: "Todos" },
  { key: "delivered", label: "Entregados" },
  { key: "issue", label: "Novedad" },
  { key: "other", label: "Otros" },
] as const;

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

  usePageTitle(
    driver ? `${driver.name} | Pilotos | Danhei Express` : "Piloto | Danhei Express"
  );

  const loadDriverDetail = async () => {
    if (!params.id) return;
    setLoading(true);
    setError("");
    try {
      const response = await apiGet<DriverDetailExt>(`/drivers/${params.id}`);
      setDriver(response);
    } catch {
      setDriver(null);
      setError("No se pudo cargar el detalle del piloto.");
    } finally {
      setLoading(false);
    }
  };

  const loadUnassigned = async () => {
    try {
      const response = await apiGet<PaginatedResponse<ShipmentLite>>("/shipments?driver_id=null&per_page=50");
      setUnassigned(response.data || []);
    } catch {
      try {
        const fallback = await apiGet<PaginatedResponse<ShipmentLite>>("/shipments?status=registered&per_page=50");
        setUnassigned((fallback.data || []).filter((item) => !item.driver_id));
      } catch {
        setUnassigned([]);
      }
    }
  };

  const loadHistory = async () => {
    if (!params.id) return;
    setHistoryLoading(true);
    try {
      const response = await apiGet<PaginatedResponse<DriverHistoryDaySummary> & { summary?: DriverHistorySummary }>(`/drivers/${params.id}/history?per_page=12`);
      setHistory(response.data || []);
      setHistorySummary(response.summary ?? null);
    } catch {
      setHistory([]);
      setHistorySummary(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadHistoryDetail = async (routeDate: string) => {
    if (!params.id || historyDetails[routeDate]) return;
    setHistoryDetailLoadingDate(routeDate);
    try {
      const detail = await apiGet<DriverHistoryDayDetail>(`/drivers/${params.id}/history/${routeDate}`);
      setHistoryDetails((current) => ({ ...current, [routeDate]: detail }));
    } catch {
      showToast("No se pudo cargar ese historial", "error");
    } finally {
      setHistoryDetailLoadingDate(null);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (params.id) {
      setHistory([]);
      setHistoryExpandedDate(null);
      setHistoryDetails({});
      setHistoryDetailLoadingDate(null);
      void loadDriverDetail();
      void loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (searchParams.get("section") !== "history") return;
    const timer = setTimeout(() => {
      historySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 180);

    return () => clearTimeout(timer);
  }, [searchParams]);

  useEffect(() => {
    if (!driver) return;

    setDocumentExpiryDrafts(
      driver.documents.items.reduce<Partial<Record<DriverDocumentKey, string>>>((acc, document) => {
        if (document.supports_expiry) {
          acc[document.key] = document.expires_at ?? "";
        }
        return acc;
      }, {})
    );
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

  const assignShipment = async () => {
    if (!driver || !selectedShipment) return;
    setAssigning(true);
    try {
      await apiSend(`/shipments/${selectedShipment}/assign`, "POST", { driver_id: driver.id });
      showToast("Envío asignado correctamente", "success");
      setAssignOpen(false);
      setSelectedShipment("");
      await loadDriverDetail();
    } catch {
      showToast("No se pudo asignar el envío", "error");
    } finally {
      setAssigning(false);
    }
  };

  const saveDocuments = async () => {
    if (!driver) return;

    const body: Record<string, unknown> = {};
    const hasFileChanges = Object.values(documentFiles).some(Boolean);
    const hasExpiryChanges = driver.documents.items.some((document) => (
      document.supports_expiry
      && (documentExpiryDrafts[document.key] ?? "") !== (document.expires_at ?? "")
    ));

    if (!hasFileChanges && !hasExpiryChanges) {
      showToast("No hay cambios pendientes en el expediente", "error");
      return;
    }

    for (const [key, value] of Object.entries(documentFiles)) {
      if (value) {
        body[key] = value;
      }
    }

    for (const document of driver.documents.items) {
      if (!document.supports_expiry) continue;
      const nextValue = documentExpiryDrafts[document.key] ?? "";
      if (nextValue !== (document.expires_at ?? "")) {
        body[`${document.key}_expires_at`] = nextValue;
      }
    }

    setDocumentsSaving(true);
    try {
      await apiSend(`/drivers/${driver.id}/documents`, "POST", body);
      showToast("Expediente documental actualizado", "success");
      setDocumentFiles({});
      setDocumentInputResetKey((current) => current + 1);
      await loadDriverDetail();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo guardar el expediente", "error");
    } finally {
      setDocumentsSaving(false);
    }
  };

  const clearDocument = async (documentKey: DriverDocumentKey) => {
    if (!driver) return;

    setDocumentsSaving(true);
    try {
      await apiSend(`/drivers/${driver.id}/documents`, "POST", { clear_documents: [documentKey] });
      showToast("Documento retirado del expediente", "success");
      setDocumentFiles((current) => ({ ...current, [documentKey]: null }));
      setDocumentExpiryDrafts((current) => ({ ...current, [documentKey]: "" }));
      setDocumentInputResetKey((current) => current + 1);
      await loadDriverDetail();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo retirar el documento", "error");
    } finally {
      setDocumentsSaving(false);
    }
  };

  const toggleHistoryDay = (routeDate: string) => {
    setHistoryExpandedDate((current) => {
      const next = current === routeDate ? null : routeDate;
      if (next === routeDate) {
        setHistoryShipmentQuery("");
        setHistoryShipmentStatusFilter("all");
        void loadHistoryDetail(routeDate);
      }
      return next;
    });
  };

  const formatHistoryDate = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString("es-CO", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const filteredHistory = useMemo(() => {
    const normalizedQuery = historyDayQuery.trim().toLowerCase();

    return history.filter((day) => {
      const matchesQuery =
        normalizedQuery.length === 0
        || [
          day.route_date,
          formatHistoryDate(day.route_date),
          ...(day.zones || []),
        ].join(" ").toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        historyDayStatusFilter === "all"
          ? true
          : historyDayStatusFilter === "issues"
            ? day.issue_stops > 0
            : historyDayStatusFilter === "pending"
              ? day.pending_stops > 0
              : day.pending_stops === 0 && day.issue_stops === 0;

      return matchesQuery && matchesStatus;
    });
  }, [history, historyDayQuery, historyDayStatusFilter]);

  if (loading) return <Skeleton className="h-64" />;
  if (!driver) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <p className="text-sm text-slate-500 dark:text-slate-400">{error || "No se encontró el piloto."}</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="text-sm text-slate-500 dark:text-slate-400">
        <Link href="/conductores" className="hover:text-slate-700 dark:hover:text-slate-300">
          Pilotos
        </Link>{" "}
        &gt; <span className="text-slate-700 dark:text-slate-300">{driver.name}</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
            {driver.initials}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-[#e0e0e0]">{driver.name}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{driver.zone || "Sin zona"}</p>
          </div>
          <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300 sm:ml-auto">
            {driverStatusLabel(driver.status)}
          </span>
        </div>
        <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
          <p>
            <span className="font-semibold text-slate-700 dark:text-slate-200">Teléfono:</span>{" "}
            {driver.phone || "Sin teléfono"}
          </p>
          <p>
            <span className="font-semibold text-slate-700 dark:text-slate-200">Vehículo:</span>{" "}
            {driver.vehicle || "Sin definir"}
          </p>
          <p>
            <span className="font-semibold text-slate-700 dark:text-slate-200">Placa:</span>{" "}
            {driver.plate || "Sin placa"}
          </p>
          <p>
            <span className="font-semibold text-slate-700 dark:text-slate-200">Zona:</span>{" "}
            {driver.zone || "Sin zona"}
          </p>
          <p className="break-words">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Correo app:</span>{" "}
            <span className="break-all">{driver.user?.email || "Sin acceso configurado"}</span>
          </p>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          La contraseña no se muestra por seguridad. Se puede restablecer desde Editar piloto.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"><p className="text-xs text-slate-500 dark:text-slate-400">Asignados</p><p className="mt-1 text-xl font-bold dark:text-[#e0e0e0]">{driver.today_summary.assigned}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"><p className="text-xs text-slate-500 dark:text-slate-400">Entregados</p><p className="mt-1 text-xl font-bold text-delivered">{driver.today_summary.delivered}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"><p className="text-xs text-slate-500 dark:text-slate-400">Recaudo pendiente</p><p className="mt-1 text-xl font-bold text-pending">{formatCOP(driver.today_summary.pending_cash)}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"><p className="text-xs text-slate-500 dark:text-slate-400">Dinero cobrado</p><p className="mt-1 text-xl font-bold text-route">{formatCOP(driver.today_summary.cash_collected)}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"><p className="text-xs text-slate-500 dark:text-slate-400">Ganancia del día</p><p className="mt-1 text-xl font-bold text-primary">{formatCOP(driver.today_summary.earnings)}</p></article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Tasa de entrega</p>
          <p className="mt-1 text-xl font-bold dark:text-[#e0e0e0]">{metrics.rate}%</p>
          <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-[#16162a]">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${metrics.rate}%` }} />
          </div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Recaudo</p>
          <p className="mt-1 text-xl font-bold dark:text-[#e0e0e0]">{metrics.cashPercent}%</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-[#16162a]">
            <div className="h-2 bg-delivered" style={{ width: `${metrics.cashPercent}%` }} />
          </div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Novedades</p>
          <p className={`mt-1 text-xl font-bold ${metrics.issues > 0 ? "text-issue" : ""}`}>{metrics.issues}</p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Expediente documental</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Licencia, propiedad, SOAT, tecnomecánica y cédula del piloto.
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-right dark:bg-[#16162a]">
            <p className="text-xs text-slate-500 dark:text-slate-400">Completitud</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {driver.documents.count_present}/{driver.documents.count_required} · {driver.documents.completion_percent}%
            </p>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
            <p className="text-xs text-slate-500 dark:text-slate-400">Documentos cargados</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{driver.documents.count_present}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
            <p className="text-xs text-slate-500 dark:text-slate-400">Pendientes</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{driver.documents.count_missing}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
            <p className="text-xs text-slate-500 dark:text-slate-400">Por vencer / sin fecha</p>
            <p className="mt-1 text-lg font-semibold text-pending">{driver.documents.count_warning}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
            <p className="text-xs text-slate-500 dark:text-slate-400">Vencidos</p>
            <p className="mt-1 text-lg font-semibold text-issue">{driver.documents.count_expired}</p>
          </article>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {driver.documents.items.map((document) => (
            <article
              key={document.key}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{document.label}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {document.present ? "Documento cargado" : "Pendiente por cargar"}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${documentAlertStyles[document.alert_level]}`}>
                  {documentAlertLabels[document.alert_level]}
                </span>
              </div>

              {document.alert_message ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{document.alert_message}</p>
              ) : null}

              {document.url ? (
                <a href={document.url} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-lg border border-slate-200 dark:border-[#2a2a3e]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={document.url} alt={document.label} className="h-36 w-full object-cover" />
                </a>
              ) : (
                <div className="mt-3 flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-xs text-slate-400 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-slate-500">
                  Sin imagen cargada
                </div>
              )}

              <div className="mt-3 space-y-2">
                {document.supports_expiry ? (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Vencimiento
                    </label>
                    <input
                      type="date"
                      value={documentExpiryDrafts[document.key] ?? ""}
                      onChange={(event) =>
                        setDocumentExpiryDrafts((current) => ({
                          ...current,
                          [document.key]: event.target.value,
                        }))
                      }
                      className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-slate-100"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {document.expires_at
                        ? `Fecha actual: ${new Date(`${document.expires_at}T00:00:00`).toLocaleDateString("es-CO")}`
                        : "Sin fecha registrada"}
                    </p>
                  </div>
                ) : null}

                <input
                  key={`${document.key}-${documentInputResetKey}`}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:font-semibold file:text-primary dark:text-slate-400"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setDocumentFiles((current) => ({ ...current, [document.key]: file }));
                  }}
                />
                {documentFiles[document.key] ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Nuevo archivo: {documentFiles[document.key]?.name}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  {document.url ? (
                    <button
                      type="button"
                      onClick={() => void clearDocument(document.key)}
                      disabled={documentsSaving}
                      className="min-h-10 rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-600 disabled:opacity-60 dark:border-rose-500/30 dark:text-rose-300"
                    >
                      Quitar
                    </button>
                  ) : null}
                  {document.url ? (
                    <a
                      href={document.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-[#2a2a3e] dark:text-slate-300"
                    >
                      Abrir
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void saveDocuments()}
            disabled={documentsSaving}
            className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {documentsSaving ? "Guardando expediente..." : "Guardar expediente"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Envíos asignados hoy</h2>
          <div className="grid gap-2 sm:flex">
            <button onClick={() => { setAssignOpen(true); void loadUnassigned(); }} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]">Asignar envío</button>
            <Link href="/conductores" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary/20 px-3 py-2 text-sm font-medium text-primary">Volver a pilotos</Link>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={() => setTab("all")} className={`rounded-full px-3 py-1.5 text-sm ${tab === "all" ? "bg-primary/10 text-primary" : "border border-slate-200 dark:border-[#2a2a3e] dark:text-slate-300"}`}>Todos</button>
          <button onClick={() => setTab("delivered")} className={`rounded-full px-3 py-1.5 text-sm ${tab === "delivered" ? "bg-primary/10 text-primary" : "border border-slate-200 dark:border-[#2a2a3e] dark:text-slate-300"}`}>Entregados</button>
          <button onClick={() => setTab("pending")} className={`rounded-full px-3 py-1.5 text-sm ${tab === "pending" ? "bg-primary/10 text-primary" : "border border-slate-200 dark:border-[#2a2a3e] dark:text-slate-300"}`}>Pendientes</button>
          <button onClick={() => setTab("issue")} className={`rounded-full px-3 py-1.5 text-sm ${tab === "issue" ? "bg-primary/10 text-primary" : "border border-slate-200 dark:border-[#2a2a3e] dark:text-slate-300"}`}>Novedad</button>
        </div>
        {filteredShipments.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Sin envíos asignados hoy.</p>
        ) : (
          <div className="space-y-3 md:hidden">
            {filteredShipments.map((shipment) => (
              <article key={shipment.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{shipment.display_code}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{shipment.recipient_name}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs ${statusBadge[shipment.status] || "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300"}`}>
                    {shipmentStatusLabel(shipment.status || "registered")}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{shipment.recipient_address || "-"}</p>
                <div className="mt-3">
                  <PrintReceiptButton shipment={shipment} label="Imprimir guía" />
                </div>
              </article>
            ))}
          </div>
        )}

        {filteredShipments.length > 0 ? (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2">Guía</th><th className="py-2">Destinatario</th><th className="py-2">Dirección</th><th className="py-2">Estado</th><th className="py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredShipments.map((shipment) => (
                  <tr key={shipment.id} className="border-t border-slate-100 dark:border-[#2a2a3e]">
                    <td className="py-2 font-semibold dark:text-[#e0e0e0]">{shipment.display_code}</td>
                    <td className="py-2 dark:text-slate-300">{shipment.recipient_name}</td>
                    <td className="py-2 dark:text-slate-300">{shipment.recipient_address || "-"}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-1 text-xs ${statusBadge[shipment.status] || "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300"}`}>
                        {shipmentStatusLabel(shipment.status || "registered")}
                      </span>
                    </td>
                    <td className="py-2"><PrintReceiptButton shipment={shipment} label="Imprimir guía" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section ref={historySectionRef} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Historial operativo</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Jornadas anteriores del piloto con sus paquetes realmente trabajados.
            </p>
          </div>
        </div>

        {historySummary ? (
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
              <p className="text-xs text-slate-500 dark:text-slate-400">Jornadas trabajadas</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{historySummary.worked_days}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
              <p className="text-xs text-slate-500 dark:text-slate-400">Paquetes completados</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{historySummary.completed_stops}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
              <p className="text-xs text-slate-500 dark:text-slate-400">COD histórico</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{formatCOP(historySummary.cod_collected)}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
              <p className="text-xs text-slate-500 dark:text-slate-400">Ganancia histórica</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{formatCOP(historySummary.earnings_total)}</p>
            </article>
          </div>
        ) : null}

        <div className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <input
              value={historyDayQuery}
              onChange={(event) => setHistoryDayQuery(event.target.value)}
              placeholder="Buscar jornada por fecha o zona"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {historyStatusFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setHistoryDayStatusFilter(filter.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  historyDayStatusFilter === filter.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-300 text-slate-600 dark:border-[#2a2a3e] dark:text-slate-300"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {historyLoading ? (
          <Skeleton className="h-40" />
        ) : filteredHistory.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {history.length === 0
              ? "Aún no hay jornadas históricas para este piloto."
              : "No hay jornadas históricas con esos filtros."}
          </p>
        ) : (
          <div className="space-y-3">
            {filteredHistory.map((day) => {
              const isExpanded = historyExpandedDate === day.route_date;
              const detail = historyDetails[day.route_date];
              const filteredDetailShipments = detail
                ? detail.shipments.filter((shipment) => {
                  const normalizedQuery = historyShipmentQuery.trim().toLowerCase();
                  const matchesQuery =
                    normalizedQuery.length === 0
                    || [
                      shipment.display_code,
                      shipment.recipient_name || "",
                      shipment.recipient_address || "",
                    ].join(" ").toLowerCase().includes(normalizedQuery);

                  const matchesStatus =
                    historyShipmentStatusFilter === "all"
                      ? true
                      : historyShipmentStatusFilter === "other"
                        ? shipment.status !== "delivered" && shipment.status !== "issue"
                        : shipment.status === historyShipmentStatusFilter;

                  return matchesQuery && matchesStatus;
                })
                : [];
              return (
                <article
                  key={day.route_date}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatHistoryDate(day.route_date)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {day.route_count} rutas · {day.shipment_count} paquetes · zonas: {day.zones.join(", ") || "Sin zona"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-[#1a1a2e] dark:text-slate-300">
                        {day.completed_stops}/{day.total_stops} completados
                      </span>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-[#1a1a2e] dark:text-slate-300">
                        Ganancia {formatCOP(day.earnings_total)}
                      </span>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-[#1a1a2e] dark:text-slate-300">
                        COD {formatCOP(day.cod_collected)}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleHistoryDay(day.route_date)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-[#2a2a3e] dark:text-slate-300"
                      >
                        {isExpanded ? "Ocultar detalle" : "Ver paquetes"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-4 text-xs">
                    <div className="rounded-lg bg-white p-2 dark:bg-[#1a1a2e]">
                      <p className="text-slate-500 dark:text-slate-400">Entregados</p>
                      <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{day.delivered_count}</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 dark:bg-[#1a1a2e]">
                      <p className="text-slate-500 dark:text-slate-400">Pendientes</p>
                      <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{day.pending_stops}</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 dark:bg-[#1a1a2e]">
                      <p className="text-slate-500 dark:text-slate-400">Novedades</p>
                      <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{day.issue_stops}</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 dark:bg-[#1a1a2e]">
                      <p className="text-slate-500 dark:text-slate-400">Estado</p>
                      <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{routeStatusLabel(day.status)}</p>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-3">
                      {historyDetailLoadingDate === day.route_date && !detail ? (
                        <Skeleton className="h-28" />
                      ) : detail ? (
                        <div className="space-y-3">
                          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
                            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                              <input
                                value={historyShipmentQuery}
                                onChange={(event) => setHistoryShipmentQuery(event.target.value)}
                                placeholder="Buscar guía, cliente o dirección"
                                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
                              />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {historyShipmentStatusFilters.map((filter) => (
                                <button
                                  key={`${day.route_date}-${filter.key}`}
                                  type="button"
                                  onClick={() => setHistoryShipmentStatusFilter(filter.key)}
                                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                    historyShipmentStatusFilter === filter.key
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-slate-300 text-slate-600 dark:border-[#2a2a3e] dark:text-slate-300"
                                  }`}
                                >
                                  {filter.label}
                                </button>
                              ))}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Mostrando {filteredDetailShipments.length} de {detail.shipments.length} paquetes
                            </p>
                          </div>

                          <div className="space-y-3 md:hidden">
                            {filteredDetailShipments.map((shipment) => (
                              <article key={`${detail.route_date}-${shipment.stop_id}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Ruta #{shipment.route_id}</p>
                                    <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{shipment.display_code}</p>
                                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{shipment.recipient_name || "Sin destinatario"}</p>
                                  </div>
                                  <span className={`rounded-full px-2 py-1 text-xs ${statusBadge[shipment.status] || "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300"}`}>
                                    {shipmentStatusLabel(shipment.status)}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{shipment.recipient_address || "-"}</p>
                                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                                  <div className="rounded-lg bg-white px-3 py-2 dark:bg-[#1a1a2e]">
                                    <p className="text-slate-500 dark:text-slate-400">Pago</p>
                                    <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                                      {shipment.payment_type === "cash_on_delivery"
                                        ? `COD ${formatCOP(shipment.cod_collected_amount ?? shipment.cod_amount ?? 0)}`
                                        : billingTypeLabel(shipment.payment_type)}
                                    </p>
                                  </div>
                                  <div className="rounded-lg bg-white px-3 py-2 dark:bg-[#1a1a2e]">
                                    <p className="text-slate-500 dark:text-slate-400">Ganancia</p>
                                    <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatCOP(shipment.driver_fee ?? 0)}</p>
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>

                          <div className="hidden overflow-x-auto md:block">
                          <table className="w-full min-w-[980px] text-sm">
                            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              <tr>
                                <th className="py-2">Ruta</th>
                                <th className="py-2">Guía</th>
                                <th className="py-2">Destinatario</th>
                                <th className="py-2">Dirección</th>
                                <th className="py-2">Estado</th>
                                <th className="py-2">Pago</th>
                                <th className="py-2">Ganancia</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredDetailShipments.map((shipment) => (
                                <tr key={`${detail.route_date}-${shipment.stop_id}`} className="border-t border-slate-100 dark:border-[#2a2a3e]">
                                  <td className="py-2 dark:text-slate-300">#{shipment.route_id}</td>
                                  <td className="py-2 font-semibold dark:text-slate-100">{shipment.display_code}</td>
                                  <td className="py-2 dark:text-slate-300">{shipment.recipient_name || "Sin destinatario"}</td>
                                  <td className="py-2 dark:text-slate-300">{shipment.recipient_address || "-"}</td>
                                  <td className="py-2">
                                    <span className={`rounded-full px-2 py-1 text-xs ${statusBadge[shipment.status] || "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300"}`}>
                                      {shipmentStatusLabel(shipment.status)}
                                    </span>
                                  </td>
                                  <td className="py-2 dark:text-slate-300">
                                    {shipment.payment_type === "cash_on_delivery"
                                      ? `COD ${formatCOP(shipment.cod_collected_amount ?? shipment.cod_amount ?? 0)}`
                                      : billingTypeLabel(shipment.payment_type)}
                                  </td>
                                  <td className="py-2 dark:text-slate-300">{formatCOP(shipment.driver_fee ?? 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                          {filteredDetailShipments.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">No hay paquetes de esta jornada con esos filtros.</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {assignOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <div className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl">
            <h3 className="text-lg font-bold dark:text-[#e0e0e0]">Asignar envío</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Selecciona un envío sin piloto asignado.</p>
            <select value={selectedShipment} onChange={(e) => setSelectedShipment(e.target.value)} className="mt-3 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]">
              <option value="">Seleccionar envío</option>
              {unassigned.map((item) => (
                <option key={item.id} value={item.id}>{item.display_code} - {item.recipient_name}</option>
              ))}
            </select>
            {unassigned.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">No hay envíos disponibles para asignar.</p>
            ) : null}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={() => setAssignOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]">Cancelar</button>
              <button disabled={!selectedShipment || assigning} onClick={() => void assignShipment()} className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{assigning ? "Asignando..." : "Asignar"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
