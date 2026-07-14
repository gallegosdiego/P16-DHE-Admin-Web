"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP, formatDate, toTitle } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
import { usePageTitle } from "@/lib/page-title";
import { whatsappAdminUiEnabled } from "@/lib/features";
import { MetricCard, OperationsHeader } from "@/components/operations-ui";
import type {
  PickupReadinessResponse,
  PickupRequestDTO,
  PickupRequestListResponse,
  PickupRequestStatus,
} from "@/lib/types";

type StatusFilter = "all" | PickupRequestStatus;
type DetailActionTab = "overview" | "review" | "materialize" | "cancel";

const statusTabs: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "pending_review", label: "Pendiente revision" },
  { value: "needs_customer_input", label: "Pedir datos" },
  { value: "accepted", label: "Aprobadas" },
  { value: "ready_for_assignment", label: "Listas para operar" },
  { value: "cancelled", label: "Canceladas" },
];

const requestedFieldOptions = [
  { value: "pickup_address_line1", label: "Direccion de recogida" },
  { value: "contact_name", label: "Nombre de contacto" },
  { value: "contact_phone", label: "Telefono de contacto" },
  { value: "delivery_address_line1", label: "Direccion de entrega" },
  { value: "recipient_phone", label: "Telefono de destinatario" },
  { value: "requested_cod_amount", label: "Monto COD" },
] as const;

const paymentTypeOptions = [
  { value: "post_sale", label: "Cobro post entrega" },
  { value: "prepaid", label: "Prepago" },
  { value: "cash_on_delivery", label: "Contra entrega" },
  { value: "mercado_libre", label: "Mercado Libre" },
] as const;

const emptySummary = {
  total: 0,
  pending_review: 0,
  needs_customer_input: 0,
  accepted: 0,
  ready_for_assignment: 0,
  cancelled: 0,
};

const emptyMeta = { current_page: 1, last_page: 1, per_page: 20, total: 0 };
const emptyReadiness: PickupReadinessResponse = {
  status: "configuration_pending",
  status_label: "Configuracion pendiente",
  outbound_enabled: false,
  can_send_live: false,
  ready_checks: 0,
  required_checks: 0,
  supported_pickup_cities_count: 0,
  recommended_next_step: "Completar configuracion para probar el canal.",
  checks: [],
};

const statusTone: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  needs_customer_input: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  ready_for_assignment: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  cancelled: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
};

const visibleStatusTone: Record<string, string> = {
  request_received: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  pending_review: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  delivery_confirmed: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300",
};

const coverageTone: Record<string, string> = {
  IN_COVERAGE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  NEAR_BOUNDARY: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  OUT_OF_COVERAGE: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  UNRESOLVED: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
};

const messageStatusTone: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  simulated: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300",
  accepted: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  sent: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  read: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  failed: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
};

export default function RecogidasPage() {
  usePageTitle("Recogidas | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rows, setRows] = useState<PickupRequestDTO[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [meta, setMeta] = useState(emptyMeta);
  const [readiness, setReadiness] = useState<PickupReadinessResponse>(emptyReadiness);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [detail, setDetail] = useState<PickupRequestDTO | null>(null);
  const [actionTab, setActionTab] = useState<DetailActionTab>("overview");
  const [actionLoading, setActionLoading] = useState(false);
  const [requestFields, setRequestFields] = useState<string[]>(["delivery_address_line1"]);
  const [requestReason, setRequestReason] = useState("MISSING_INFORMATION");
  const [requestNotes, setRequestNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("CUSTOMER_CANCELLED");
  const [cancelNotes, setCancelNotes] = useState("");
  const [materializeShippingCost, setMaterializeShippingCost] = useState(12500);
  const [materializeDriverFee, setMaterializeDriverFee] = useState(3500);
  const [materializePaymentType, setMaterializePaymentType] = useState("post_sale");

  const loadPickups = async (targetPage = page, nextSearch = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("per_page", "12");
      if (status !== "all") params.set("status", status);
      if (nextSearch.trim()) params.set("search", nextSearch.trim());

      const response = await apiGet<PickupRequestListResponse>(`/pickup-requests?${params.toString()}`);
      setRows(response.data || []);
      setSummary(response.summary || emptySummary);
      setMeta({
        current_page: response.current_page || 1,
        last_page: response.last_page || 1,
        per_page: response.per_page || 12,
        total: response.total || 0,
      });
    } catch {
      setRows([]);
      setSummary(emptySummary);
      setMeta(emptyMeta);
      showToast("No se pudieron cargar las recogidas WhatsApp", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (pickupId: number) => {
    setDetailLoading(true);
    try {
      const response = await apiGet<PickupRequestDTO>(`/pickup-requests/${pickupId}`);
      setDetail(response);
    } catch {
      showToast("No se pudo cargar el detalle de la recogida", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPickups(page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  useEffect(() => {
    if (!whatsappAdminUiEnabled) return;

    let active = true;

    apiGet<PickupReadinessResponse>("/pickup-requests/readiness")
      .then((response) => {
        if (active) {
          setReadiness(response);
        }
      })
      .catch(() => {
        if (active) {
          setReadiness(emptyReadiness);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchDraft.trim());
    setPage(1);
    void loadPickups(1, searchDraft.trim());
  };

  const openDetail = async (pickupId: number) => {
    setDetail(null);
    setActionTab("overview");
    setRequestFields(["delivery_address_line1"]);
    setRequestReason("MISSING_INFORMATION");
    setRequestNotes("");
    setCancelReason("CUSTOMER_CANCELLED");
    setCancelNotes("");
    await loadDetail(pickupId);
  };

  const closeDetail = () => {
    setDetail(null);
    setActionTab("overview");
  };

  const refreshAfterAction = async (pickupId: number, toastMessage: string) => {
    await Promise.all([loadPickups(page, search), loadDetail(pickupId)]);
    showToast(toastMessage, "success");
  };

  const approvePickup = async () => {
    if (!detail) return;
    setActionLoading(true);
    try {
      await apiSend(`/pickup-requests/${detail.id}/approve`, "POST", {
        notes: "Aprobada desde operaciones Danhei.",
      });
      await refreshAfterAction(detail.id, "Recogida aprobada");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo aprobar la recogida", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const requestCustomerInput = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail) return;
    setActionLoading(true);
    try {
      await apiSend(`/pickup-requests/${detail.id}/request-input`, "POST", {
        reason_code: requestReason,
        notes: requestNotes,
        requested_fields: requestFields,
      });
      await refreshAfterAction(detail.id, "Recogida enviada a pedir datos");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo actualizar la recogida", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const cancelPickup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail) return;
    setActionLoading(true);
    try {
      await apiSend(`/pickup-requests/${detail.id}/cancel`, "POST", {
        reason_code: cancelReason,
        notes: cancelNotes,
      });
      await refreshAfterAction(detail.id, "Recogida cancelada");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo cancelar la recogida", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const materializeShipments = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail) return;
    setActionLoading(true);
    try {
      const response = await apiSend<{ message: string; pickup_request: PickupRequestDTO }>(
        `/pickup-requests/${detail.id}/materialize-shipments`,
        "POST",
        {
          default_shipping_cost: materializeShippingCost,
          default_driver_fee: materializeDriverFee,
          non_cod_payment_type: materializePaymentType,
        }
      );
      await Promise.all([loadPickups(page, search), loadDetail(detail.id)]);
      showToast(response.message || "Envios creados desde la recogida", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudieron crear los envios", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const retryWhatsAppMessage = async (messageId: number) => {
    if (!detail) return;
    setActionLoading(true);
    try {
      const response = await apiSend<{ message: string; pickup_request: PickupRequestDTO }>(
        `/pickup-requests/${detail.id}/whatsapp-messages/${messageId}/retry`,
        "POST",
        {}
      );
      setDetail(response.pickup_request);
      await loadPickups(page, search);
      showToast(response.message || "Se creo una nueva tentativa de mensaje", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo reintentar el mensaje", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const toggleRequestedField = (field: string) => {
    setRequestFields((prev) =>
      prev.includes(field) ? prev.filter((value) => value !== field) : [...prev, field]
    );
  };

  const canApprove = detail ? ["pending_review", "needs_customer_input", "submitted"].includes(detail.status) : false;
  const canMaterialize = detail ? ["accepted", "ready_for_assignment", "assigned", "driver_on_the_way", "partially_picked_up", "picked_up"].includes(detail.status) : false;
  const canCancel = detail ? !["cancelled", "picked_up", "partially_picked_up", "not_picked_up"].includes(detail.status) : false;
  const detailContactName = whatsappAdminUiEnabled
    ? detail?.whatsapp_contact?.display_name || detail?.contact_name
    : detail?.contact_name;
  const detailContactPhone = whatsappAdminUiEnabled
    ? detail?.whatsapp_contact?.phone || detail?.contact_phone
    : detail?.contact_phone;

  return (
    <div className="animate-fade-in space-y-4">
      <OperationsHeader
        eyebrow="Operación de recogidas"
        title="Recogidas"
        description="Revisa solicitudes de cualquier canal, completa los datos necesarios y conviértelas en operaciones listas para asignar y ejecutar."
        actions={[
          { href: "/recogidas/nueva", label: "Nueva solicitud", primary: true },
          { href: "/recogidas/tareas", label: "Asignar tareas" },
          { href: "/recogidas/recepcion", label: "Recibir en sede" },
        ]}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total" value={summary.total} />
        <MetricCard label="En revisión" value={summary.pending_review} tone="pending" />
        <MetricCard label="Pedir datos" value={summary.needs_customer_input} tone="issue" />
        <MetricCard label="Listas para operar" value={summary.ready_for_assignment} tone="route" />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        {whatsappAdminUiEnabled ? (
          <div
            className={`rounded-2xl border p-4 ${
              readiness.can_send_live
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
            }`}
          >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                Preparacion WhatsApp
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-[#e0e0e0]">
                {readiness.status_label}
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {readiness.recommended_next_step}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-white/70 p-3 dark:bg-[#16162a]/80 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Checks</p>
                <p className="mt-1 text-xl font-bold text-slate-900 dark:text-[#e0e0e0]">
                  {readiness.ready_checks}/{readiness.required_checks}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Saliente</p>
                <p className="mt-1 text-xl font-bold text-slate-900 dark:text-[#e0e0e0]">
                  {readiness.outbound_enabled ? "On" : "Off"}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Cobertura</p>
                <p className="mt-1 text-xl font-bold text-slate-900 dark:text-[#e0e0e0]">
                  {readiness.supported_pickup_cities_count}
                </p>
              </div>
            </div>
          </div>
          {readiness.checks.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {readiness.checks.map((check) => (
                <span
                  key={check.key}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                    check.ready
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300"
                  }`}
                >
                  {check.label}
                </span>
              ))}
            </div>
          ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ${
                status === tab.value
                  ? "bg-primary/10 text-primary"
                  : "border border-slate-200 bg-white text-slate-600 dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Buscar por codigo, cliente, telefono o direccion"
            className="h-11 flex-1 rounded-xl border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
          />
          <button className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]">
            Buscar
          </button>
        </form>
      </section>

      {loading ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 dark:bg-[#23233b]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No hay recogidas que coincidan con este filtro.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-2">
            {rows.map((pickup) => (
              <article
                key={pickup.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-slate-900 dark:text-[#e0e0e0]">
                        {pickup.pickup_code}
                      </p>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone[pickup.status] || "bg-slate-100 text-slate-700"}`}>
                        {pickup.status_label}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${visibleStatusTone[pickup.customer_visible_status] || "bg-slate-100 text-slate-700"}`}>
                        Cliente: {pickup.customer_visible_status_label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                      {pickup.customer?.name || "Cliente sin nombre"}
                      {pickup.customer?.company ? ` - ${pickup.customer.company}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {pickup.contact_name} · {pickup.contact_phone}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${coverageTone[pickup.coverage_status] || "bg-slate-100 text-slate-700"}`}>
                    {pickup.coverage_status_label}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-[#16162a] sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Recogida
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">
                      {pickup.pickup_address_line1}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {(pickup.pickup_zone || "Sin zona")} · {(pickup.pickup_city || "Sin ciudad")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Paquetes
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">
                      {pickup.shipments_summary.materialized_packages}/{pickup.shipments_summary.total_packages} materializados
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {pickup.shipments_summary.delivered_packages} entregados
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      COD solicitado
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">
                      {formatCOP(pickup.requested_cod_total)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {pickup.pickup_window_label}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Recibida {pickup.submitted_at ? formatDate(pickup.submitted_at) : "sin fecha"}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    {["pending_review", "needs_customer_input", "submitted"].includes(pickup.status) ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await openDetail(pickup.id);
                          setActionTab("review");
                        }}
                        className="min-h-11 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
                      >
                        Revisar
                      </button>
                    ) : null}
                    {["accepted", "ready_for_assignment", "assigned", "driver_on_the_way", "partially_picked_up", "picked_up"].includes(pickup.status) ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await openDetail(pickup.id);
                          setActionTab("materialize");
                        }}
                        className="min-h-11 rounded-xl border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-700 transition-all duration-150 active:scale-95 dark:border-emerald-500/30 dark:text-emerald-300"
                      >
                        Crear envios
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void openDetail(pickup.id)}
                      className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                    >
                      Ver detalle
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <Pagination currentPage={meta.current_page} lastPage={meta.last_page} onPageChange={setPage} />
        </>
      )}

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <div className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[92vh] sm:max-w-6xl sm:rounded-3xl">
            {detailLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 dark:bg-[#23233b]" />
                <Skeleton className="h-80 dark:bg-[#23233b]" />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-[#2a2a3e] lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-bold text-slate-900 dark:text-[#e0e0e0]">
                        {detail.pickup_code}
                      </h2>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone[detail.status] || "bg-slate-100 text-slate-700"}`}>
                        {detail.status_label}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${visibleStatusTone[detail.customer_visible_status] || "bg-slate-100 text-slate-700"}`}>
                        {detail.customer_visible_status_label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      {detail.customer?.name || "Cliente"} {detail.customer?.company ? `- ${detail.customer.company}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Contacto: {detailContactName} · {detailContactPhone}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:flex sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => setActionTab("overview")}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold ${actionTab === "overview" ? "bg-primary/10 text-primary" : "border border-slate-300 dark:border-[#2a2a3e] dark:text-slate-300"}`}
                    >
                      Resumen
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionTab("review")}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold ${actionTab === "review" ? "bg-primary/10 text-primary" : "border border-slate-300 dark:border-[#2a2a3e] dark:text-slate-300"}`}
                    >
                      Revision
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionTab("materialize")}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold ${actionTab === "materialize" ? "bg-primary/10 text-primary" : "border border-slate-300 dark:border-[#2a2a3e] dark:text-slate-300"}`}
                    >
                      Materializar
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionTab("cancel")}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold ${actionTab === "cancel" ? "bg-primary/10 text-primary" : "border border-slate-300 dark:border-[#2a2a3e] dark:text-slate-300"}`}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr,0.75fr]">
                  <div className="space-y-4">
                    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">COD total</p>
                        <p className="mt-1 text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">{formatCOP(detail.requested_cod_total)}</p>
                      </article>
                      <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Paquetes</p>
                        <p className="mt-1 text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">{detail.package_count}</p>
                      </article>
                      <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Envios creados</p>
                        <p className="mt-1 text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">{detail.shipments_summary.materialized_packages}</p>
                      </article>
                      <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Entregados</p>
                        <p className="mt-1 text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">{detail.shipments_summary.delivered_packages}</p>
                      </article>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Datos base</h3>
                      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                        <p><strong>Cliente:</strong> {detail.customer?.name || "-"}</p>
                        <p><strong>Jornada:</strong> {detail.pickup_window_label}</p>
                        <p><strong>Direccion:</strong> {detail.pickup_address_line1}</p>
                        <p><strong>Zona:</strong> {detail.pickup_zone || "-"}</p>
                        <p><strong>Ciudad:</strong> {detail.pickup_city || "-"}</p>
                        <p><strong>Cobertura:</strong> {detail.coverage_status_label}</p>
                        <p><strong>Contacto:</strong> {detail.contact_name}</p>
                        <p><strong>Telefono:</strong> {detail.contact_phone}</p>
                      </div>
                      {detail.special_instructions ? (
                        <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-[#16162a] dark:text-slate-300">
                          {detail.special_instructions}
                        </div>
                      ) : null}
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Paquetes</h3>
                      <div className="mt-4 space-y-3">
                        {(detail.packages || []).map((pkg) => (
                          <article key={pkg.id} className="rounded-2xl border border-slate-200 p-4 dark:border-[#2a2a3e]">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">
                                    Paquete {pkg.package_index}
                                  </p>
                                  {pkg.is_cod ? (
                                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                                      COD {formatCOP(pkg.requested_cod_amount)}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                                  {pkg.recipient_name} · {pkg.recipient_phone}
                                </p>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                  {pkg.delivery_address_line1}
                                  {pkg.delivery_address_complement ? `, ${pkg.delivery_address_complement}` : ""}
                                </p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {(pkg.delivery_zone || "Sin zona")} · {(pkg.delivery_city || "Sin ciudad")}
                                </p>
                              </div>
                              {pkg.shipment ? (
                                <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm dark:bg-[#16162a]">
                                  <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">
                                    {pkg.shipment.display_code}
                                  </p>
                                  <p className="mt-1 text-slate-500 dark:text-slate-400">
                                    {pkg.shipment.status_label}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {pkg.shipment.driver_name || "Sin piloto"}
                                  </p>
                                </div>
                              ) : (
                                <div className="rounded-2xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 dark:border-[#2a2a3e] dark:text-slate-400">
                                  Sin envio creado
                                </div>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Historial de revision</h3>
                      <div className="mt-4 space-y-3">
                        {(detail.review_events || []).length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">Sin eventos registrados.</p>
                        ) : (
                          (detail.review_events || []).map((event) => (
                            <article key={event.id} className="rounded-2xl border border-slate-200 p-3 dark:border-[#2a2a3e]">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">
                                    {toTitle(event.event_type)}
                                  </p>
                                  {event.reason_code ? (
                                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                      {toTitle(event.reason_code)}
                                    </p>
                                  ) : null}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {event.occurred_at ? formatDate(event.occurred_at) : "Sin fecha"}
                                </p>
                              </div>
                              {event.notes ? (
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{event.notes}</p>
                              ) : null}
                              {(event.requested_fields || []).length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {(event.requested_fields || []).map((field) => (
                                    <span
                                      key={`${event.id}-${field}`}
                                      className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary"
                                    >
                                      {toTitle(field)}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </article>
                          ))
                        )}
                      </div>
                    </section>

                    {whatsappAdminUiEnabled ? (
                      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <h3 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Trazabilidad WhatsApp</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Salida conversacional y estado devuelto por Meta.
                        </p>
                      </div>
                      <div className="mt-4 space-y-3">
                        {(detail.whatsapp_messages || []).length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Aun no hay mensajes salientes registrados para esta solicitud.
                          </p>
                        ) : (
                          (detail.whatsapp_messages || []).map((message) => (
                            <article key={message.id} className="rounded-2xl border border-slate-200 p-3 dark:border-[#2a2a3e]">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">
                                      {message.notification_label || toTitle(message.message_type)}
                                    </p>
                                    <span
                                      className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                        messageStatusTone[message.message_status || "queued"] || "bg-slate-100 text-slate-700"
                                      }`}
                                    >
                                      {toTitle(message.message_status || "queued")}
                                    </span>
                                    {message.customer_visible_status ? (
                                      <span
                                        className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                          visibleStatusTone[message.customer_visible_status] || "bg-slate-100 text-slate-700"
                                        }`}
                                      >
                                        Cliente: {message.customer_visible_status_label}
                                      </span>
                                    ) : null}
                                  </div>
                                  {message.body ? (
                                    <p className="text-sm text-slate-600 dark:text-slate-300">{message.body}</p>
                                  ) : null}
                                  <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                                    <span>Destino: {message.to || "-"}</span>
                                    <span>Modo: {message.dispatch_mode || "-"}</span>
                                    <span>Creado: {message.created_at ? formatDate(message.created_at) : "sin fecha"}</span>
                                    <span>Enviado: {message.sent_at ? formatDate(message.sent_at) : "pendiente"}</span>
                                  </div>
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 sm:text-right">
                                  {message.provider_message_id ? (
                                    <p>Provider ID: {message.provider_message_id}</p>
                                  ) : (
                                    <p>Sin ID del proveedor</p>
                                  )}
                                  {message.received_at ? <p className="mt-1">Ultima señal: {formatDate(message.received_at)}</p> : null}
                                </div>
                              </div>
                              {message.last_error ? (
                                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                                  {String(message.last_error.message || "El proveedor reporto un error al despachar el mensaje.")}
                                </div>
                              ) : null}
                              {message.can_retry ? (
                                <div className="mt-3 flex justify-end">
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => void retryWhatsAppMessage(message.id)}
                                    className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold transition-all duration-150 active:scale-95 disabled:opacity-50 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                                  >
                                    {actionLoading ? "Procesando..." : "Reintentar envio"}
                                  </button>
                                </div>
                              ) : null}
                            </article>
                          ))
                        )}
                        </div>
                      </section>
                    ) : null}
                  </div>

                  <div className="space-y-4">
                    {actionTab === "overview" ? (
                      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Centro operativo</h3>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                          Usa las acciones de la derecha para mover la solicitud entre revision,
                          pedir datos al cliente o crear los envios reales de operacion.
                        </p>
                        <div className="mt-4 grid gap-2">
                          <button
                            type="button"
                            disabled={!canApprove || actionLoading}
                            onClick={() => void approvePickup()}
                            className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-50"
                          >
                            Aprobar solicitud
                          </button>
                          <button
                            type="button"
                            onClick={() => setActionTab("review")}
                            className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                          >
                            Pedir datos o ajustar revision
                          </button>
                          <button
                            type="button"
                            onClick={() => setActionTab("materialize")}
                            className="min-h-11 rounded-xl border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 transition-all duration-150 active:scale-95 dark:border-emerald-500/30 dark:text-emerald-300"
                          >
                            Materializar en envios
                          </button>
                        </div>
                      </section>
                    ) : null}

                    {actionTab === "review" ? (
                      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Revision manual</h3>
                          {canApprove ? (
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => void approvePickup()}
                              className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-50"
                            >
                              Aprobar ya
                            </button>
                          ) : null}
                        </div>
                        <form onSubmit={requestCustomerInput} className="mt-4 space-y-3">
                          <label className="space-y-1 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-200">Motivo</span>
                            <input
                              value={requestReason}
                              onChange={(event) => setRequestReason(event.target.value)}
                              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                            />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-200">Notas para operaciones</span>
                            <textarea
                              value={requestNotes}
                              onChange={(event) => setRequestNotes(event.target.value)}
                              placeholder="Explica exactamente que dato falta o que hay que corregir."
                              className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                            />
                          </label>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Campos a pedir</p>
                            <div className="grid gap-2">
                              {requestedFieldOptions.map((option) => (
                                <label
                                  key={option.value}
                                  className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-[#2a2a3e]"
                                >
                                  <input
                                    type="checkbox"
                                    checked={requestFields.includes(option.value)}
                                    onChange={() => toggleRequestedField(option.value)}
                                    className="h-4 w-4 rounded border-slate-300 text-primary"
                                  />
                                  <span className="text-slate-700 dark:text-slate-200">{option.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <button
                            disabled={actionLoading}
                            className="min-h-11 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold transition-all duration-150 active:scale-95 disabled:opacity-50 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                          >
                            {actionLoading ? "Guardando..." : "Marcar como requiere datos"}
                          </button>
                        </form>
                      </section>
                    ) : null}

                    {actionTab === "materialize" ? (
                      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Crear envios operativos</h3>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                          Esto crea envios reales por cada paquete, enlaza guias y deja la
                          solicitud lista para asignacion.
                        </p>
                        <form onSubmit={materializeShipments} className="mt-4 space-y-3">
                          <label className="space-y-1 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-200">Costo de envio por defecto</span>
                            <input
                              type="number"
                              min={0}
                              value={materializeShippingCost}
                              onChange={(event) => setMaterializeShippingCost(Number(event.target.value))}
                              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                            />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-200">Pago al piloto por defecto</span>
                            <input
                              type="number"
                              min={0}
                              value={materializeDriverFee}
                              onChange={(event) => setMaterializeDriverFee(Number(event.target.value))}
                              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                            />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-200">Tipo de pago para paquetes sin COD</span>
                            <select
                              value={materializePaymentType}
                              onChange={(event) => setMaterializePaymentType(event.target.value)}
                              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                            >
                              {paymentTypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            disabled={!canMaterialize || actionLoading}
                            className="min-h-11 w-full rounded-xl border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 transition-all duration-150 active:scale-95 disabled:opacity-50 dark:border-emerald-500/30 dark:text-emerald-300"
                          >
                            {actionLoading ? "Creando..." : "Crear envios ahora"}
                          </button>
                        </form>
                      </section>
                    ) : null}

                    {actionTab === "cancel" ? (
                      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
                        <h3 className="text-base font-semibold text-rose-800 dark:text-rose-200">Cancelar solicitud</h3>
                        <form onSubmit={cancelPickup} className="mt-4 space-y-3">
                          <label className="space-y-1 text-sm">
                            <span className="font-medium text-rose-800 dark:text-rose-200">Motivo</span>
                            <input
                              value={cancelReason}
                              onChange={(event) => setCancelReason(event.target.value)}
                              className="h-11 w-full rounded-xl border border-rose-300 px-3 text-sm dark:border-rose-500/40 dark:bg-[#1a1a2e] dark:text-[#e0e0e0]"
                            />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="font-medium text-rose-800 dark:text-rose-200">Notas</span>
                            <textarea
                              value={cancelNotes}
                              onChange={(event) => setCancelNotes(event.target.value)}
                              className="min-h-24 w-full rounded-xl border border-rose-300 px-3 py-2 text-sm dark:border-rose-500/40 dark:bg-[#1a1a2e] dark:text-[#e0e0e0]"
                            />
                          </label>
                          <button
                            disabled={!canCancel || actionLoading}
                            className="min-h-11 w-full rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-50"
                          >
                            {actionLoading ? "Cancelando..." : "Confirmar cancelacion"}
                          </button>
                        </form>
                      </section>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeDetail}
                    className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                  >
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
