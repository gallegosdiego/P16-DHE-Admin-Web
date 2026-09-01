"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import {
  apiGet,
  apiJson,
  apiSend,
  describeApiError,
  type ApiErrorPresentation,
} from "@/lib/api";
import { formatCOP, formatDate, toTitle } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { usePageTitle } from "@/lib/page-title";
import { whatsappAdminUiEnabled } from "@/lib/features";
import { PrintReceptionReceiptButton } from "@/components/print-reception-receipt";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  KpiCard,
  MobileListCard,
  SearchInput,
  Select,
  StatusBadge,
  Stepper,
  Textarea,
  type BadgeTone,
} from "@/components/ui";
import type {
  PickupReadinessResponse,
  PickupIntakeMode,
  PickupReceptionReceiptDTO,
  PickupRequestDTO,
  PickupRequestListResponse,
  PickupRequestStatus,
} from "@/lib/types";

type StatusFilter = "all" | PickupRequestStatus;
type DetailActionTab = "overview" | "package" | "review" | "materialize" | "cancel";
type IntakeModeFilter = "all" | PickupIntakeMode;
type PipelineStep = { key: string; label: string; hint?: ReactNode };

const intakeModeTabs: Array<{ value: IntakeModeFilter; label: string }> = [
  { value: "all", label: "Todas las vías" },
  { value: "pickup_at_client_location", label: "Danhei recoge" },
  { value: "planned_dropoff_at_hub", label: "Entrega programada" },
  { value: "walk_in_at_hub", label: "Ingreso en mostrador" },
];

const intakeModeLabels: Record<PickupIntakeMode, string> = {
  pickup_at_client_location: "Danhei recoge en el cliente",
  planned_dropoff_at_hub: "Entrega programada en sede",
  walk_in_at_hub: "Ingreso inmediato en mostrador",
};

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
  submitted: 0,
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

const statusTone: Record<string, BadgeTone> = {
  draft: "neutral",
  submitted: "brand",
  pending_review: "brand",
  needs_customer_input: "warning",
  accepted: "success",
  ready_for_assignment: "teal",
  assigned: "teal",
  driver_on_the_way: "info",
  partially_picked_up: "info",
  picked_up: "success",
  not_picked_up: "danger",
  cancelled: "neutral",
};

const visibleStatusTone: Record<string, BadgeTone> = {
  request_received: "neutral",
  pending_review: "brand",
  accepted: "success",
  delivery_confirmed: "info",
};

const coverageTone: Record<string, BadgeTone> = {
  IN_COVERAGE: "success",
  NEAR_BOUNDARY: "warning",
  OUT_OF_COVERAGE: "danger",
  UNRESOLVED: "neutral",
};

const messageStatusTone: Record<string, BadgeTone> = {
  queued: "neutral",
  simulated: "brand",
  accepted: "info",
  sent: "info",
  delivered: "success",
  read: "success",
  failed: "danger",
};

function PickupListErrorNotice({
  error,
  onRetry,
  retrying,
  staleData,
}: {
  error: ApiErrorPresentation;
  onRetry: () => void;
  retrying: boolean;
  staleData: boolean;
}) {
  const schemaPending = error.code === "operational_intake_unavailable";

  return (
    <div
      role="alert"
      aria-label="Error al cargar ingresos de paquetes"
      className="rounded-card border border-danger/25 bg-danger/10 p-5 text-danger shadow-soft"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-danger">
            {schemaPending ? "Actualización del servidor pendiente" : "Consulta no disponible"}
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-ink">
            {schemaPending
              ? "La base de datos operativa no terminó de actualizarse"
              : staleData
              ? "No fue posible actualizar los ingresos"
              : "No fue posible cargar los ingresos de paquetes"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-danger">{error.message}</p>
          {schemaPending ? (
            <p className="mt-2 text-sm font-semibold leading-6 text-danger">
              Completa el despliegue de la API y luego comprueba de nuevo. No se mostrará una lista vacía falsa.
            </p>
          ) : null}
          {typeof error.missingComponentsCount === "number" && error.missingComponentsCount > 0 ? (
            <p className="mt-2 text-xs text-danger">
              Componentes pendientes en la base de datos: {error.missingComponentsCount}.
            </p>
          ) : null}
          {error.deployment?.commit || error.deployment?.phase ? (
            <p className="mt-2 text-xs text-danger">
              Servidor: {error.deployment.status}
              {error.deployment.commit ? ` · versión ${error.deployment.commit.slice(0, 12)}` : ""}
              {error.deployment.phase ? ` · fase ${error.deployment.phase}` : ""}
            </p>
          ) : null}
          {staleData ? (
            <p className="mt-2 text-sm leading-6 text-danger">
              Se conserva visible la última información cargada correctamente.
            </p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-danger">
              La consulta falló; los ceros o una lista vacía no se mostrarán como si fueran datos reales.
            </p>
          )}
          {error.reference ? (
            <p className="mt-3 text-xs font-semibold text-danger">
              Referencia del error:{" "}
              <code className="rounded-input bg-surface/70 px-2 py-1 font-mono text-[11px]">
                {error.reference}
              </code>
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="shrink-0"
        >
          {retrying ? "Comprobando..." : schemaPending ? "Comprobar de nuevo" : "Reintentar"}
        </Button>
      </div>
    </div>
  );
}

export default function RecogidasPage() {
  usePageTitle("Ingreso de paquetes | Danhei Express");

  const { showToast } = useToast();
  const pickupListRequestSequence = useRef(0);
  const detailRequestSequence = useRef(0);
  const [loading, setLoading] = useState(true);
  const [hasLoadedPickups, setHasLoadedPickups] = useState(false);
  const [loadError, setLoadError] = useState<ApiErrorPresentation | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receipt, setReceipt] = useState<PickupReceptionReceiptDTO | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [rows, setRows] = useState<PickupRequestDTO[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [meta, setMeta] = useState(emptyMeta);
  const [readiness, setReadiness] = useState<PickupReadinessResponse>(emptyReadiness);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [intakeMode, setIntakeMode] = useState<IntakeModeFilter>("all");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [detail, setDetail] = useState<PickupRequestDTO | null>(null);
  const [actionTab, setActionTab] = useState<DetailActionTab>("overview");
  const [actionLoading, setActionLoading] = useState(false);
  const [retryingMessageIds, setRetryingMessageIds] = useState<Set<number>>(() => new Set());
  const [requestFields, setRequestFields] = useState<string[]>(["delivery_address_line1"]);
  const [requestReason, setRequestReason] = useState("MISSING_INFORMATION");
  const [requestNotes, setRequestNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("CUSTOMER_CANCELLED");
  const [cancelNotes, setCancelNotes] = useState("");
  const [materializeShippingCost, setMaterializeShippingCost] = useState(12500);
  const [materializeDriverFee, setMaterializeDriverFee] = useState(3500);
  const [materializePaymentType, setMaterializePaymentType] = useState("post_sale");
  const [materializePackageIds, setMaterializePackageIds] = useState<number[]>([]);
  const [newPackage, setNewPackage] = useState({
    recipient_name: "",
    recipient_phone: "",
    delivery_address_line1: "",
    delivery_city: "Bogotá",
    requested_cod_amount: 0,
    is_fragile: false,
    special_handling_notes: "",
  });

  const loadPickups = async (targetPage = page, nextSearch = search) => {
    const requestSequence = ++pickupListRequestSequence.current;
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("per_page", "12");
      if (status !== "all") params.set("status", status);
      if (intakeMode !== "all") params.set("intake_mode", intakeMode);
      if (nextSearch.trim()) params.set("search", nextSearch.trim());

      const response = await apiGet<PickupRequestListResponse>(`/pickup-requests?${params.toString()}`);

      if (requestSequence !== pickupListRequestSequence.current) {
        return;
      }

      setRows(response.data || []);
      setSummary(response.summary || emptySummary);
      setMeta({
        current_page: response.current_page || 1,
        last_page: response.last_page || 1,
        per_page: response.per_page || 12,
        total: response.total || 0,
      });
      setHasLoadedPickups(true);
    } catch (error) {
      if (requestSequence !== pickupListRequestSequence.current) {
        return;
      }

      const failure = describeApiError(
        error,
        "No se pudieron cargar los ingresos de paquetes."
      );
      setLoadError(failure);

      // Los errores de red ya generan un aviso global desde el cliente API.
      if (!["network_error", "request_timeout"].includes(failure.code || "")) {
        showToast(failure.message, "error");
      }
    } finally {
      if (requestSequence === pickupListRequestSequence.current) {
        setLoading(false);
      }
    }
  };

  const loadDetail = async (pickupId: number) => {
    const requestSequence = ++detailRequestSequence.current;
    setDetailLoading(true);
    try {
      const response = await apiGet<PickupRequestDTO>(`/pickup-requests/${pickupId}`);

      if (requestSequence !== detailRequestSequence.current) return;

      setDetail(response);
      setMaterializePackageIds((response.packages || []).filter((item) => item.shipment === null).map((item) => item.id));
    } catch (error) {
      if (requestSequence !== detailRequestSequence.current) return;

      const failure = describeApiError(
        error,
        "No se pudo cargar el detalle de la recogida."
      );
      showToast(failure.message, "error");
    } finally {
      if (requestSequence === detailRequestSequence.current) {
        setDetailLoading(false);
      }
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPickups(page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, intakeMode]);

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
    const normalizedSearch = searchDraft.trim();
    setSearch(normalizedSearch);

    if (page === 1) {
      void loadPickups(1, normalizedSearch);
    } else {
      setPage(1);
    }
  };

  const openDetail = async (pickupId: number) => {
    setDetail(null);
    setReceipt(null);
    setReceiptError(null);
    setMaterializePackageIds([]);
    setActionTab("overview");
    setRequestFields(["delivery_address_line1"]);
    setRequestReason("MISSING_INFORMATION");
    setRequestNotes("");
    setCancelReason("CUSTOMER_CANCELLED");
    setCancelNotes("");
    setNewPackage({
      recipient_name: "",
      recipient_phone: "",
      delivery_address_line1: "",
      delivery_city: "Bogotá",
      requested_cod_amount: 0,
      is_fragile: false,
      special_handling_notes: "",
    });
    await loadDetail(pickupId);
  };

  const closeDetail = () => {
    detailRequestSequence.current += 1;
    setDetail(null);
    setReceipt(null);
    setReceiptError(null);
    setDetailLoading(false);
    setActionTab("overview");
  };

  const loadReceptionReceipt = async (batchId: number) => {
    setReceiptLoading(true);
    setReceipt(null);
    setReceiptError(null);
    try {
      const response = await apiGet<{ data: PickupReceptionReceiptDTO }>(
        `/operational-pickup-batches/${batchId}/receipt`
      );
      setReceipt(response.data);
    } catch (error) {
      setReceipt(null);
      setReceiptError(error instanceof Error ? error.message : "No se pudo cargar el comprobante de recepción.");
    } finally {
      setReceiptLoading(false);
    }
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
    const pendingPackages = (detail.packages || []).filter((item) => item.shipment === null);
    if (pendingPackages.length > 0 && materializePackageIds.length === 0) {
      showToast("Selecciona al menos un paquete pendiente.", "error");
      return;
    }
    setActionLoading(true);
    try {
      const response = await apiSend<{ message: string; pickup_request: PickupRequestDTO }>(
        `/pickup-requests/${detail.id}/materialize-shipments`,
        "POST",
        {
          default_shipping_cost: materializeShippingCost,
          default_driver_fee: materializeDriverFee,
          non_cod_payment_type: materializePaymentType,
          ...(materializePackageIds.length > 0 ? { package_ids: materializePackageIds } : {}),
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

  const addPackage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail) return;
    setActionLoading(true);
    try {
      await apiJson(
        `/pickup-requests/${detail.id}/packages`,
        "POST",
        {
          ...newPackage,
          is_cod: newPackage.requested_cod_amount > 0,
          requested_cod_amount: Number(newPackage.requested_cod_amount) || 0,
          special_handling_notes: newPackage.special_handling_notes.trim() || null,
        },
        { "Idempotency-Key": crypto.randomUUID() },
        { idempotent: true, retries: 1 }
      );
      setNewPackage({
        recipient_name: "",
        recipient_phone: "",
        delivery_address_line1: "",
        delivery_city: "Bogotá",
        requested_cod_amount: 0,
        is_fragile: false,
        special_handling_notes: "",
      });
      await refreshAfterAction(detail.id, "Paquete agregado al ingreso");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo agregar el paquete", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const retryWhatsAppMessage = async (messageId: number) => {
    if (!detail || retryingMessageIds.has(messageId)) return;
    const detailSequence = detailRequestSequence.current;
    setRetryingMessageIds((current) => {
      const next = new Set(current);
      next.add(messageId);
      return next;
    });
    try {
      const response = await apiSend<{ message: string; pickup_request: PickupRequestDTO }>(
        `/pickup-requests/${detail.id}/whatsapp-messages/${messageId}/retry`,
        "POST",
        {}
      );
      if (detailSequence === detailRequestSequence.current) {
        setDetail(response.pickup_request);
      }
      await loadPickups(page, search);
      showToast(response.message || "Se creo una nueva tentativa de mensaje", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo reintentar el mensaje", "error");
    } finally {
      setRetryingMessageIds((current) => {
        const next = new Set(current);
        next.delete(messageId);
        return next;
      });
    }
  };

  const toggleRequestedField = (field: string) => {
    setRequestFields((prev) =>
      prev.includes(field) ? prev.filter((value) => value !== field) : [...prev, field]
    );
  };

  const pipeline = useMemo<{ steps: PipelineStep[]; currentIndex: number; tone: "active" | "blocked" | "cancelled"; toneLabel?: string } | null>(() => {
    if (!detail || detail.intake_mode === "walk_in_at_hub") return null;

    const allMaterialized = detail.shipments_summary.pending_materialization_packages === 0
      && detail.shipments_summary.materialized_packages > 0;
    const steps: PipelineStep[] = [
      { key: "created", label: "Solicitud creada" },
      { key: "review", label: "Revisada y aceptada", hint: "Acéptala en la pestaña Revisión para poder materializar las guías." },
      { key: "materialize", label: "Guías materializadas", hint: "Materialízalas en la pestaña Materializar. Sin guías, la asignación del piloto se rechaza." },
      { key: "assign", label: "Piloto asignado", hint: <>Asigna al responsable en <Link href="/recogidas/tareas" className="font-bold underline underline-offset-2">Asignar tareas</Link>.</> },
      { key: "on_the_way", label: "En camino", hint: "El piloto ya la ve en P15; al iniciar la tarea pasará a en camino." },
      { key: "picked_up", label: "Recogida", hint: "El piloto está en el punto; al confirmar la recogida los paquetes quedan bajo su custodia." },
      { key: "reception", label: "Recibida en sede", hint: <>Cuando lleguen los paquetes, concílialos en <Link href="/recogidas/recepcion" className="font-bold underline underline-offset-2">Recepción</Link>.</> },
    ];

    let currentIndex: number;
    let tone: "active" | "blocked" | "cancelled" = "active";
    let toneLabel: string | undefined;

    switch (detail.status) {
      case "draft":
      case "submitted":
      case "pending_review":
        currentIndex = 1;
        break;
      case "needs_customer_input":
        currentIndex = 1;
        tone = "blocked";
        toneLabel = "Esperando datos del cliente.";
        break;
      case "accepted":
      case "ready_for_assignment":
        currentIndex = allMaterialized ? 3 : 2;
        break;
      case "assigned":
        currentIndex = 4;
        break;
      case "driver_on_the_way":
        currentIndex = 5;
        break;
      case "partially_picked_up":
      case "picked_up":
        currentIndex = 6;
        break;
      case "not_picked_up":
        currentIndex = 5;
        tone = "blocked";
        toneLabel = "La recogida no se pudo completar; revisa la novedad y reprograma.";
        break;
      case "cancelled":
        currentIndex = 1;
        tone = "cancelled";
        toneLabel = "Solicitud cancelada.";
        break;
      default:
        currentIndex = 1;
    }

    return { steps, currentIndex, tone, toneLabel };
  }, [detail]);

  const canApprove = detail ? ["pending_review", "needs_customer_input", "submitted"].includes(detail.status) : false;
  const canMaterialize = detail ? ["accepted", "ready_for_assignment", "assigned", "driver_on_the_way", "partially_picked_up", "picked_up"].includes(detail.status) : false;
  const canAddPackage = detail ? !["assigned", "driver_on_the_way", "partially_picked_up", "picked_up", "not_picked_up", "cancelled"].includes(detail.status) : false;
  const canCancel = detail ? !["cancelled", "picked_up", "partially_picked_up", "not_picked_up"].includes(detail.status) : false;
  const detailContactName = whatsappAdminUiEnabled
    ? detail?.whatsapp_contact?.display_name || detail?.contact_name
    : detail?.contact_name;
  const detailContactPhone = whatsappAdminUiEnabled
    ? detail?.whatsapp_contact?.phone || detail?.contact_phone
    : detail?.contact_phone;
  const receptionBatches = detail?.reception_batches || [];
  const initialListLoading = loading && !hasLoadedPickups;

  const pickupActions = (pickup: PickupRequestDTO) => (
    <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
      {["pending_review", "needs_customer_input", "submitted"].includes(pickup.status) ? (
        <Button
          type="button"
          size="sm"
          onClick={async () => {
            await openDetail(pickup.id);
            setActionTab("review");
          }}
        >
          Revisar
        </Button>
      ) : null}
      {["accepted", "ready_for_assignment", "assigned", "driver_on_the_way", "partially_picked_up", "picked_up"].includes(pickup.status) ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => {
            await openDetail(pickup.id);
            setActionTab("materialize");
          }}
        >
          Crear envíos
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="sm" className="border border-edge" onClick={() => void openDetail(pickup.id)}>
        Ver detalle
      </Button>
    </div>
  );

  return (
    <div className="min-w-0 animate-fade-in space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Operación de ingreso</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">Ingreso de paquetes</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">
            Controla las solicitudes, recogidas y recepciones en sede desde una sola entrada. Cada paquete conserva su guía, estado y custodia.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link href="/recogidas/nueva" className="inline-flex min-h-11 items-center justify-center rounded-button bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
            Nuevo ingreso
          </Link>
          <Link href="/recogidas/tareas" className="inline-flex min-h-11 items-center justify-center rounded-button border border-edge bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-app-secondary">
            Asignar tareas
          </Link>
          <Link href="/recogidas/recepcion" className="inline-flex min-h-11 items-center justify-center rounded-button border border-edge bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-app-secondary">
            Recepción programada
          </Link>
        </div>
      </header>

      {initialListLoading ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Cargando indicadores">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-card bg-app-secondary" />
          ))}
        </section>
      ) : hasLoadedPickups ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen de ingresos">
          <KpiCard label="Total" value={summary.total} />
          <KpiCard
            label="En revisión"
            value={summary.pending_review + (summary.submitted || 0)}
            support={summary.submitted ? summary.submitted + " enviadas incluidas" : undefined}
            tone="brand"
          />
          <KpiCard label="Pedir datos" value={summary.needs_customer_input} tone="warning" />
          <KpiCard label="Listas para operar" value={summary.ready_for_assignment} tone="success" />
        </section>
      ) : null}

      {whatsappAdminUiEnabled ? (
        <Card
          title="Preparación WhatsApp"
          headerAction={<StatusBadge status={readiness.can_send_live ? "ready" : "pending"} label={readiness.can_send_live ? "Lista para enviar" : readiness.status_label} tone={readiness.can_send_live ? "success" : "warning"} />}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm text-ink-secondary">{readiness.recommended_next_step}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 rounded-input bg-app-secondary p-3 text-center">
              <div><p className="text-[11px] uppercase tracking-wide text-ink-secondary">Checks</p><p className="mt-1 font-display text-xl font-bold text-ink">{readiness.ready_checks}/{readiness.required_checks}</p></div>
              <div><p className="text-[11px] uppercase tracking-wide text-ink-secondary">Saliente</p><p className="mt-1 font-display text-xl font-bold text-ink">{readiness.outbound_enabled ? "Sí" : "No"}</p></div>
              <div><p className="text-[11px] uppercase tracking-wide text-ink-secondary">Cobertura</p><p className="mt-1 font-display text-xl font-bold text-ink">{readiness.supported_pickup_cities_count}</p></div>
            </div>
          </div>
          {readiness.checks.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {readiness.checks.map((check) => <Badge key={check.key} tone={check.ready ? "success" : "danger"}>{check.label}</Badge>)}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card title="Filtros de ingresos">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">Estado de la solicitud</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
              {statusTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={status === tab.value}
                  onClick={() => {
                    setStatus(tab.value);
                    setPage(1);
                  }}
                  className={"min-h-11 rounded-full border px-3 text-sm font-semibold transition-colors " + (status === tab.value ? "border-brand/20 bg-brand-soft text-brand" : "border-edge bg-surface text-ink-secondary hover:bg-app-secondary")}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-edge pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">Forma de ingreso</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por vía de ingreso">
              {intakeModeTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={intakeMode === tab.value}
                  onClick={() => {
                    setIntakeMode(tab.value);
                    setPage(1);
                  }}
                  className={"min-h-11 rounded-full border px-3 text-sm font-semibold transition-colors " + (intakeMode === tab.value ? "border-brand/20 bg-brand-soft text-brand" : "border-edge bg-surface text-ink-secondary hover:bg-app-secondary")}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
            <SearchInput
              className="flex-1"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Buscar por código, cliente, teléfono o dirección"
              aria-label="Buscar por código, cliente, teléfono o dirección"
            />
            <Button type="submit" size="md" className="sm:w-32">Buscar</Button>
          </form>
        </div>
      </Card>

      {initialListLoading ? (
        <div className="grid gap-3 xl:grid-cols-2" aria-label="Cargando solicitudes">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-44 animate-pulse rounded-card bg-app-secondary" />)}
        </div>
      ) : loadError && !hasLoadedPickups ? (
        <PickupListErrorNotice error={loadError} onRetry={() => void loadPickups(page, search)} retrying={loading} staleData={false} />
      ) : rows.length === 0 ? (
        <>
          {loadError ? (
            <PickupListErrorNotice error={loadError} onRetry={() => void loadPickups(page, search)} retrying={loading} staleData />
          ) : (
            <EmptyState
              title="No hay solicitudes para este filtro"
              description="Prueba otra combinación de estado, vía de ingreso o búsqueda."
              action={<Link href="/recogidas/nueva" className="inline-flex min-h-11 items-center justify-center rounded-button bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">Nuevo ingreso</Link>}
            />
          )}
        </>
      ) : (
        <>
          {loadError ? <PickupListErrorNotice error={loadError} onRetry={() => void loadPickups(page, search)} retrying={loading} staleData /> : null}
          <Card flush className="overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-app-secondary text-left text-xs uppercase tracking-wide text-ink-secondary">
                  <tr>
                    <th className="px-4 py-3">Solicitud</th>
                    <th className="px-4 py-3">Cliente / ingreso</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Paquetes</th>
                    <th className="px-4 py-3">Cobertura</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((pickup) => (
                    <tr key={pickup.id} className="border-t border-edge align-top">
                      <td className="px-4 py-4">
                        <p className="font-display text-sm font-semibold text-ink">{pickup.pickup_code}</p>
                        <p className="mt-1 text-xs text-ink-secondary">{pickup.submitted_at ? formatDate(pickup.submitted_at) : "Fecha no disponible"}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-ink">{pickup.customer?.name || "Cliente sin nombre"}</p>
                        <p className="mt-1 text-xs text-ink-secondary">{intakeModeLabels[pickup.intake_mode]}</p>
                        <p className="mt-1 text-xs text-ink-secondary">{pickup.contact_name} · {pickup.contact_phone}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge status={pickup.status} label={pickup.status_label} tone={statusTone[pickup.status] ?? "neutral"} />
                          <Badge tone={visibleStatusTone[pickup.customer_visible_status] ?? "neutral"}>{pickup.customer_visible_status_label}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-ink">{pickup.shipments_summary.materialized_packages}/{pickup.shipments_summary.total_packages}</p>
                        <p className="mt-1 text-xs text-ink-secondary">{pickup.shipments_summary.delivered_packages} entregados</p>
                      </td>
                      <td className="px-4 py-4"><Badge tone={coverageTone[pickup.coverage_status] ?? "neutral"}>{pickup.coverage_status_label}</Badge></td>
                      <td className="px-4 py-4">{pickupActions(pickup)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-4 md:hidden">
              {rows.map((pickup) => (
                <MobileListCard
                  key={pickup.id}
                  title={pickup.pickup_code}
                  subtitle={(pickup.customer?.name || "Cliente sin nombre") + " · " + intakeModeLabels[pickup.intake_mode]}
                  meta={pickup.contact_name + " · " + pickup.contact_phone + " · " + pickup.shipments_summary.materialized_packages + "/" + pickup.shipments_summary.total_packages + " paquetes"}
                  status={<div className="flex flex-wrap justify-end gap-1"><StatusBadge status={pickup.status} label={pickup.status_label} tone={statusTone[pickup.status] ?? "neutral"} /><Badge tone={coverageTone[pickup.coverage_status] ?? "neutral"}>{pickup.coverage_status_label}</Badge></div>}
                  action={pickupActions(pickup)}
                />
              ))}
            </div>
          </Card>
          {meta.last_page > 1 ? (
            <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Paginación de solicitudes">
              <Button variant="ghost" size="md" className="border border-edge" disabled={meta.current_page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</Button>
              <span className="text-sm text-ink-secondary">Página {meta.current_page} de {meta.last_page} · {meta.total} solicitudes</span>
              <Button variant="ghost" size="md" className="border border-edge" disabled={meta.current_page >= meta.last_page} onClick={() => setPage((current) => Math.min(meta.last_page, current + 1))}>Siguiente</Button>
            </nav>
          ) : null}
        </>
      )}

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={"Detalle " + detail.pickup_code}>
          <div className="h-[100dvh] w-full overflow-y-auto rounded-none border border-edge bg-surface p-4 shadow-soft animate-fade-in sm:h-auto sm:max-h-[92vh] sm:max-w-6xl sm:rounded-card sm:p-6">
            {detailLoading ? (
              <div className="space-y-3" aria-label="Cargando detalle">
                <div className="h-20 animate-pulse rounded-card bg-app-secondary" />
                <div className="h-80 animate-pulse rounded-card bg-app-secondary" />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 border-b border-edge pb-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-2xl font-bold text-ink">{detail.pickup_code}</h2>
                      <StatusBadge status={detail.status} label={detail.status_label} tone={statusTone[detail.status] ?? "neutral"} />
                      <Badge tone={visibleStatusTone[detail.customer_visible_status] ?? "neutral"}>{detail.customer_visible_status_label}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-ink">{detail.customer?.name || "Cliente"}{detail.customer?.company ? " · " + detail.customer.company : ""}</p>
                    <p className="mt-1 text-sm text-ink-secondary">Contacto: {detailContactName || "No disponible"} · {detailContactPhone || "No disponible"}</p>
                  </div>
                  <div className="grid gap-2 sm:flex sm:flex-wrap">
                    <Button type="button" size="md" variant={actionTab === "overview" ? "secondary" : "ghost"} className={actionTab === "overview" ? "" : "border border-edge"} onClick={() => setActionTab("overview")}>Resumen</Button>
                    <Button type="button" size="md" variant={actionTab === "package" ? "secondary" : "ghost"} className={actionTab === "package" ? "" : "border border-edge"} disabled={!canAddPackage} onClick={() => setActionTab("package")}>Agregar paquete</Button>
                    <Button type="button" size="md" variant={actionTab === "review" ? "secondary" : "ghost"} className={actionTab === "review" ? "" : "border border-edge"} onClick={() => setActionTab("review")}>Revisión</Button>
                    <Button type="button" size="md" variant={actionTab === "materialize" ? "secondary" : "ghost"} className={actionTab === "materialize" ? "" : "border border-edge"} onClick={() => setActionTab("materialize")}>Materializar</Button>
                    <Button type="button" size="md" variant={actionTab === "cancel" ? "secondary" : "ghost"} className={actionTab === "cancel" ? "" : "border border-edge"} onClick={() => setActionTab("cancel")}>Cancelar</Button>
                  </div>
                </div>

                {pipeline ? (
                  <Card title="Ruta operativa" className="mt-4">
                    <Stepper steps={pipeline.steps.map((step) => step.label)} current={pipeline.currentIndex} />
                    {pipeline.toneLabel || pipeline.steps[pipeline.currentIndex]?.hint ? (
                      <p className={"mt-4 rounded-input px-3 py-2 text-sm " + (pipeline.tone === "blocked" ? "bg-warning/15 text-ink" : pipeline.tone === "cancelled" ? "bg-app-secondary text-ink-secondary" : "bg-brand-soft text-brand")}>
                        {pipeline.toneLabel ? <strong>{pipeline.toneLabel} </strong> : null}
                        {pipeline.steps[pipeline.currentIndex]?.hint}
                      </p>
                    ) : null}
                  </Card>
                ) : null}

                <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr,0.75fr]">
                  <div className="space-y-4">
                    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <KpiCard label="COD total" value={formatCOP(detail.requested_cod_total)} />
                      <KpiCard label="Paquetes" value={detail.package_count} />
                      <KpiCard label="Envíos creados" value={detail.shipments_summary.materialized_packages} tone="teal" />
                      <KpiCard label="Entregados" value={detail.shipments_summary.delivered_packages} tone="success" />
                    </section>

                    <Card title="Datos base">
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <p><strong>Cliente:</strong> {detail.customer?.name || "-"}</p>
                        <p><strong>Forma de ingreso:</strong> {intakeModeLabels[detail.intake_mode]}</p>
                        <p><strong>Jornada:</strong> {detail.pickup_window_label}</p>
                        <p><strong>Dirección:</strong> {detail.pickup_address_line1}</p>
                        <p><strong>Zona:</strong> {detail.pickup_zone || "-"}</p>
                        <p><strong>Ciudad:</strong> {detail.pickup_city || "-"}</p>
                        <p><strong>Cobertura:</strong> {detail.coverage_status_label}</p>
                        <p><strong>Contacto:</strong> {detail.contact_name}</p>
                        <p><strong>Teléfono:</strong> {detail.contact_phone}</p>
                      </div>
                      {detail.special_instructions ? <p className="mt-4 rounded-input bg-app-secondary p-3 text-sm text-ink-secondary">{detail.special_instructions}</p> : null}
                    </Card>

                    <Card title="Paquetes">
                      <div className="space-y-3">
                        {(detail.packages || []).map((pkg) => (
                          <article key={pkg.id} className="rounded-input border border-edge p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-display text-sm font-semibold text-ink">Paquete {pkg.package_index}</p>
                                  {pkg.is_cod ? <Badge tone="success">COD {formatCOP(pkg.requested_cod_amount)}</Badge> : null}
                                </div>
                                <p className="mt-2 text-sm text-ink">{pkg.recipient_name} · {pkg.recipient_phone}</p>
                                <p className="mt-1 text-sm text-ink-secondary">{pkg.delivery_address_line1}{pkg.delivery_address_complement ? ", " + pkg.delivery_address_complement : ""}</p>
                                <p className="mt-1 text-xs text-ink-secondary">{pkg.delivery_zone || "Sin zona"} · {pkg.delivery_city || "Sin ciudad"}</p>
                              </div>
                              {pkg.shipment ? (
                                <div className="rounded-input bg-app-secondary px-3 py-2 text-sm">
                                  <p className="font-semibold text-ink">{pkg.shipment.display_code}</p>
                                  <StatusBadge status={pkg.shipment.status} label={pkg.shipment.status_label} />
                                  <p className="mt-1 text-xs text-ink-secondary">{pkg.shipment.driver_name || "Sin piloto"}</p>
                                </div>
                              ) : <div className="rounded-input border border-dashed border-edge px-3 py-2 text-sm text-ink-secondary">Sin envío creado</div>}
                            </div>
                          </article>
                        ))}
                      </div>
                    </Card>

                    <Card title="Recepción y comprobante">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <p className="text-sm text-ink-secondary">La recepción queda respaldada por lote, sede, custodio y resultado individual de cada paquete.</p>
                        {receipt ? <PrintReceptionReceiptButton receipt={receipt} /> : null}
                      </div>
                      <div className="mt-4 space-y-3">
                        {receptionBatches.length === 0 ? (
                          <p className="text-sm text-ink-secondary">Aún no hay una conciliación de recepción para este ingreso.</p>
                        ) : receptionBatches.map((batch) => {
                          const canPrint = batch.status === "completed" || batch.status === "completed_with_differences";
                          const isSelected = receipt?.batch_id === batch.id;
                          return (
                            <article key={batch.id} className="rounded-input border border-edge p-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-display text-sm font-semibold text-ink">{batch.batch_code}</p>
                                    <Badge tone={batch.status === "completed_with_differences" ? "danger" : batch.status === "completed" ? "success" : "warning"}>{batch.status_label}</Badge>
                                  </div>
                                  <p className="mt-1 text-xs text-ink-secondary">{batch.service_location?.name || "Sin sede"} · {batch.received_by?.name || "Sin custodio"} · {batch.expected_packages} esperado(s)</p>
                                  <p className="mt-1 text-xs text-ink-secondary">Recibidos {batch.received_packages} · Rechazados {batch.rejected_packages} · Faltantes {batch.missing_packages}</p>
                                </div>
                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                  {canPrint ? (
                                    <Button type="button" variant="ghost" size="md" className="border border-edge" disabled={receiptLoading} onClick={() => void loadReceptionReceipt(batch.id)}>
                                      {receiptLoading && isSelected ? "Cargando..." : isSelected ? "Actualizar comprobante" : "Ver comprobante"}
                                    </Button>
                                  ) : <Badge tone="warning">Disponible al cerrar conciliación</Badge>}
                                </div>
                              </div>
                              {isSelected && receiptError ? <p className="mt-3 text-xs text-danger">{receiptError}</p> : null}
                              {isSelected && receipt ? <div className="mt-3 flex flex-wrap items-center gap-3 rounded-input bg-app-secondary p-3 text-xs"><span>Comprobante listo para imprimir o guardar como PDF.</span><PrintReceptionReceiptButton receipt={receipt} label="Abrir comprobante" /></div> : null}
                            </article>
                          );
                        })}
                      </div>
                    </Card>

                    <Card title="Historial de revisión">
                      <div className="space-y-3">
                        {(detail.review_events || []).length === 0 ? <p className="text-sm text-ink-secondary">Sin eventos registrados.</p> : (detail.review_events || []).map((event) => (
                          <article key={event.id} className="rounded-input border border-edge p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div><p className="font-semibold text-ink">{toTitle(event.event_type)}</p>{event.reason_code ? <p className="mt-1 text-xs uppercase tracking-wide text-ink-secondary">{toTitle(event.reason_code)}</p> : null}</div>
                              <p className="text-xs text-ink-secondary">{event.occurred_at ? formatDate(event.occurred_at) : "Sin fecha"}</p>
                            </div>
                            {event.notes ? <p className="mt-2 text-sm text-ink-secondary">{event.notes}</p> : null}
                            {(event.requested_fields || []).length > 0 ? <div className="mt-2 flex flex-wrap gap-2">{(event.requested_fields || []).map((field) => <Badge key={event.id + "-" + field} tone="brand">{toTitle(field)}</Badge>)}</div> : null}
                          </article>
                        ))}
                      </div>
                    </Card>

                    {whatsappAdminUiEnabled ? (
                      <Card title="Trazabilidad WhatsApp">
                        <p className="text-sm text-ink-secondary">Salida conversacional y estado devuelto por Meta.</p>
                        <div className="mt-4 space-y-3">
                          {(detail.whatsapp_messages || []).length === 0 ? <p className="text-sm text-ink-secondary">Aún no hay mensajes salientes registrados para esta solicitud.</p> : (detail.whatsapp_messages || []).map((message) => (
                            <article key={message.id} className="rounded-input border border-edge p-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-ink">{message.notification_label || toTitle(message.message_type)}</p>
                                    <Badge tone={messageStatusTone[message.message_status || "queued"] ?? "neutral"}>{toTitle(message.message_status || "queued")}</Badge>
                                    {message.customer_visible_status ? <Badge tone={visibleStatusTone[message.customer_visible_status] ?? "neutral"}>Cliente: {message.customer_visible_status_label}</Badge> : null}
                                  </div>
                                  {message.body ? <p className="text-sm text-ink-secondary">{message.body}</p> : null}
                                  <div className="flex flex-wrap gap-3 text-xs text-ink-secondary"><span>Destino: {message.to || "-"}</span><span>Modo: {message.dispatch_mode || "-"}</span><span>Creado: {message.created_at ? formatDate(message.created_at) : "sin fecha"}</span><span>Enviado: {message.sent_at ? formatDate(message.sent_at) : "pendiente"}</span></div>
                                </div>
                                <div className="text-xs text-ink-secondary sm:text-right">{message.provider_message_id ? <p>Provider ID: {message.provider_message_id}</p> : <p>Sin ID del proveedor</p>}{message.received_at ? <p className="mt-1">Última señal: {formatDate(message.received_at)}</p> : null}</div>
                              </div>
                              {message.last_error ? <div className="mt-3 rounded-input border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{String(message.last_error.message || "El proveedor reportó un error al despachar el mensaje.")}</div> : null}
                              {message.can_retry ? <div className="mt-3 flex justify-end"><Button type="button" variant="ghost" size="md" className="border border-edge" disabled={actionLoading || retryingMessageIds.has(message.id)} onClick={() => void retryWhatsAppMessage(message.id)}>{retryingMessageIds.has(message.id) ? "Procesando..." : "Reintentar envío"}</Button></div> : null}
                            </article>
                          ))}
                        </div>
                      </Card>
                    ) : null}
                  </div>

                  <div className="space-y-4">
                    {actionTab === "overview" ? (
                      <Card title="Centro operativo">
                        <p className="text-sm text-ink-secondary">Usa las acciones para mover la solicitud entre revisión, pedir datos al cliente o crear los envíos reales de operación.</p>
                        <div className="mt-4 grid gap-2">
                          <Button type="button" disabled={!canApprove || actionLoading} onClick={() => void approvePickup()}>Aprobar solicitud</Button>
                          <Button type="button" variant="secondary" onClick={() => setActionTab("review")}>Pedir datos o ajustar revisión</Button>
                          <Button type="button" variant="ghost" className="border border-edge" onClick={() => setActionTab("materialize")}>Materializar en envíos</Button>
                        </div>
                      </Card>
                    ) : null}

                    {actionTab === "package" ? (
                      <Card title="Agregar paquete al ingreso">
                        <p className="text-sm text-ink-secondary">Disponible antes de asignar o iniciar la tarea. El paquete quedará pendiente de materialización.</p>
                        <form onSubmit={addPackage} className="mt-4 space-y-3">
                          <Input required label="Destinatario" value={newPackage.recipient_name} onChange={(event) => setNewPackage((current) => ({ ...current, recipient_name: event.target.value }))} />
                          <Input required label="Teléfono" type="tel" value={newPackage.recipient_phone} onChange={(event) => setNewPackage((current) => ({ ...current, recipient_phone: event.target.value }))} />
                          <Input required label="Dirección de entrega" value={newPackage.delivery_address_line1} onChange={(event) => setNewPackage((current) => ({ ...current, delivery_address_line1: event.target.value }))} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input required label="Ciudad" value={newPackage.delivery_city} onChange={(event) => setNewPackage((current) => ({ ...current, delivery_city: event.target.value }))} />
                            <Input label="Valor COD" type="number" min={0} value={newPackage.requested_cod_amount} onChange={(event) => setNewPackage((current) => ({ ...current, requested_cod_amount: Number(event.target.value) }))} />
                          </div>
                          <label className="flex min-h-11 items-center gap-3 rounded-input border border-edge px-3 text-sm font-medium text-ink"><input type="checkbox" checked={newPackage.is_fragile} onChange={(event) => setNewPackage((current) => ({ ...current, is_fragile: event.target.checked }))} className="h-4 w-4 accent-brand" />Paquete frágil</label>
                          <Textarea label="Manejo especial" value={newPackage.special_handling_notes} onChange={(event) => setNewPackage((current) => ({ ...current, special_handling_notes: event.target.value }))} />
                          <Button type="submit" className="w-full" disabled={!canAddPackage || actionLoading}>{actionLoading ? "Agregando..." : "Agregar paquete"}</Button>
                        </form>
                      </Card>
                    ) : null}

                    {actionTab === "review" ? (
                      <Card title="Revisión manual">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm text-ink-secondary">Solicita información concreta al cliente o aprueba la solicitud cuando esté completa.</p>
                          {canApprove ? <Button type="button" size="sm" disabled={actionLoading} onClick={() => void approvePickup()}>Aprobar ya</Button> : null}
                        </div>
                        <form onSubmit={requestCustomerInput} className="mt-4 space-y-3">
                          <Input label="Motivo" value={requestReason} onChange={(event) => setRequestReason(event.target.value)} />
                          <Textarea label="Notas para operaciones" placeholder="Explica exactamente qué dato falta o qué hay que corregir." value={requestNotes} onChange={(event) => setRequestNotes(event.target.value)} />
                          <fieldset className="space-y-2">
                            <legend className="mb-2 text-sm font-medium text-ink">Campos a pedir</legend>
                            {requestedFieldOptions.map((option) => (
                              <label key={option.value} className="flex min-h-11 items-center gap-3 rounded-input border border-edge px-3 py-2 text-sm text-ink">
                                <input type="checkbox" checked={requestFields.includes(option.value)} onChange={() => toggleRequestedField(option.value)} className="h-4 w-4 accent-brand" />
                                {option.label}
                              </label>
                            ))}
                          </fieldset>
                          <Button type="submit" variant="secondary" className="w-full" disabled={actionLoading}>{actionLoading ? "Guardando..." : "Marcar como requiere datos"}</Button>
                        </form>
                      </Card>
                    ) : null}

                    {actionTab === "materialize" ? (
                      <Card title="Crear envíos operativos">
                        <p className="text-sm text-ink-secondary">Esto crea envíos reales por cada paquete, enlaza guías y deja la solicitud lista para asignación.</p>
                        <form onSubmit={materializeShipments} className="mt-4 space-y-3">
                          {(detail.packages || []).some((item) => item.shipment === null) ? (
                            <fieldset className="space-y-2 rounded-input border border-edge p-3">
                              <legend className="px-1 text-sm font-medium text-ink">Paquetes a materializar</legend>
                              {(detail.packages || []).filter((item) => item.shipment === null).map((item) => (
                                <label key={item.id} className="flex min-h-11 items-center gap-3 rounded-input bg-app-secondary px-3 text-sm text-ink">
                                  <input type="checkbox" checked={materializePackageIds.includes(item.id)} onChange={() => setMaterializePackageIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} className="h-4 w-4 accent-brand" />
                                  <span><strong>Paquete {item.package_index}</strong> · {item.recipient_name}</span>
                                </label>
                              ))}
                            </fieldset>
                          ) : <p className="rounded-input bg-success/10 p-3 text-sm text-success">Todos los paquetes ya tienen guía.</p>}
                          <Input label="Costo de envío por defecto" type="number" min={0} value={materializeShippingCost} onChange={(event) => setMaterializeShippingCost(Number(event.target.value))} />
                          <Input label="Pago al piloto por defecto" type="number" min={0} value={materializeDriverFee} onChange={(event) => setMaterializeDriverFee(Number(event.target.value))} />
                          <Select label="Tipo de pago para paquetes sin COD" value={materializePaymentType} onChange={(event) => setMaterializePaymentType(event.target.value)}>
                            {paymentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </Select>
                          <Button type="submit" variant="secondary" className="w-full" disabled={!canMaterialize || actionLoading || detail.shipments_summary.pending_materialization_packages === 0}>{actionLoading ? "Creando..." : "Crear envíos ahora"}</Button>
                        </form>
                      </Card>
                    ) : null}

                    {actionTab === "cancel" ? (
                      <Card title="Cancelar solicitud" className="border-danger/25 bg-danger/10">
                        <p className="text-sm text-danger">La cancelación cambia el estado operativo de la solicitud. Revisa la causal antes de confirmar.</p>
                        <form onSubmit={cancelPickup} className="mt-4 space-y-3">
                          <Input label="Motivo" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
                          <Textarea label="Notas" value={cancelNotes} onChange={(event) => setCancelNotes(event.target.value)} />
                          <Button type="submit" variant="danger" className="w-full" disabled={!canCancel || actionLoading}>{actionLoading ? "Cancelando..." : "Confirmar cancelación"}</Button>
                        </form>
                      </Card>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <Button type="button" variant="ghost" className="border border-edge" onClick={closeDetail}>Cerrar</Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
