"use client";

import { FormEvent, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP, formatDate, shipmentStatusLabel } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
import { ShipmentTimeline } from "@/components/shipment-timeline";
import { PrintReceiptButton } from "@/components/print-receipt";
import { usePageTitle } from "@/lib/page-title";
import type {
  Client,
  Driver,
  PaginatedResponse,
  PaymentType,
  Shipment,
  ShipmentEvent,
  ShipmentStatus,
} from "@/lib/types";

type ShipmentListItem = Partial<Shipment> & {
  id: number;
  display_code: string;
  status: ShipmentStatus;
  created_at: string;
  client_name?: string;
  client_phone?: string;
  driver_name?: string | null;
};

type ShipmentDetail = ShipmentListItem & {
  events?: Array<Partial<ShipmentEvent> & { id: number; occurred_at?: string }>;
};

const tabs: Array<{ label: string; value: "all" | ShipmentStatus }> = [
  { label: "Todos", value: "all" },
  { label: "En ruta", value: "in_transit" },
  { label: "Pendiente", value: "registered" },
  { label: "Novedad", value: "issue" },
  { label: "Entregado", value: "delivered" },
];

const statusBadge: Record<string, string> = {
  registered: "bg-amber-50 text-pending",
  confirmed: "bg-blue-50 text-route",
  pickup_scheduled: "bg-blue-50 text-route",
  picked_up: "bg-blue-50 text-route",
  in_warehouse: "bg-purple-50 text-purple-700",
  assigned_to_route: "bg-blue-50 text-route",
  in_transit: "animate-pulse bg-blue-50 text-route",
  delivered: "bg-emerald-50 text-delivered",
  issue: "bg-rose-50 text-issue",
  returned: "bg-slate-100 text-slate-700",
  cancelled: "bg-slate-100 text-slate-700",
};

const paymentLabel: Record<PaymentType, string> = {
  cash_on_delivery: "Contra entrega",
  post_sale: "Cobro post entrega",
  prepaid: "Prepago",
  mercado_libre: "Mercado Libre",
};

const paymentTooltip: Record<PaymentType, string> = {
  cash_on_delivery:
    "El piloto cobra al destinatario y luego entrega a la empresa",
  post_sale: "Se factura al cliente después de la entrega",
  prepaid: "El cliente ya pagó el envío",
  mercado_libre: "Mercado Libre paga después de confirmar la entrega",
};

const defaultForm = {
  client_id: 0,
  recipient_name: "",
  recipient_phone: "",
  recipient_address: "",
  recipient_zone: "",
  payment_type: "cash_on_delivery" as PaymentType,
  shipping_cost: 11500,
  cod_amount: 0,
  driver_fee: 3000,
  driver_id: "",
  delivery_instructions: "",
  notes: "",
};

const fieldControlClass =
  "h-10 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]";
const MAX_INTAKE_PHOTO_BYTES = 4 * 1024 * 1024;
const INTAKE_PHOTO_MAX_EDGE = 1600;

function FormField({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`space-y-1 ${className}`}>
      <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block text-[11px] leading-4 text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

async function prepareIntakePhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecciona una imagen valida.");
  }

  const supportedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
  if (file.size <= MAX_INTAKE_PHOTO_BYTES && supportedMimeTypes.includes(file.type)) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("No se pudo optimizar la foto. Intenta con JPG, PNG o WEBP.");
  }

  const maxEdge = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, INTAKE_PHOTO_MAX_EDGE / maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("No se pudo preparar la foto.");
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (nextBlob) resolve(nextBlob);
        else reject(new Error("No se pudo comprimir la foto."));
      },
      "image/jpeg",
      0.78
    );
  });

  if (blob.size > MAX_INTAKE_PHOTO_BYTES) {
    throw new Error("La foto sigue pesando demasiado. Usa una imagen mas liviana.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "foto-paquete";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

const getStatusAction = (status: ShipmentStatus) => {
  if (status === "in_transit") {
    return {
      next: "delivered" as ShipmentStatus,
      description: "Entregado",
      label: "Entregar",
    };
  }
  if (status === "issue") {
    return {
      next: "in_transit" as ShipmentStatus,
      description: "Reintento de entrega",
      label: "Reintentar",
    };
  }
  return null;
};

export default function PedidosPage() {
  usePageTitle("Pedidos | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);
  const [assignLoadingId, setAssignLoadingId] = useState<number | null>(null);
  const [shipments, setShipments] = useState<ShipmentListItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tab, setTab] = useState<"all" | ShipmentStatus>("all");
  const [search, setSearch] = useState("");
  const [driverId, setDriverId] = useState("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [modal, setModal] = useState<"create" | "detail" | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [intakePhoto, setIntakePhoto] = useState<File | null>(null);
  const [intakePhotoInputKey, setIntakePhotoInputKey] = useState(0);
  const [intakePreviewUrl, setIntakePreviewUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<ShipmentDetail | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchDriverId, setBatchDriverId] = useState("");
  const [batchStatus, setBatchStatus] = useState<ShipmentStatus>("in_transit");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [lookupError, setLookupError] = useState("");

  const loadLookups = async () => {
    try {
      const [clientsRes, driversRes] = await Promise.all([
        apiGet<PaginatedResponse<Client> | Client[]>("/clients"),
        apiGet<PaginatedResponse<Driver> | Driver[]>("/drivers"),
      ]);
      setClients(Array.isArray(clientsRes) ? clientsRes : clientsRes.data || []);
      setDrivers(Array.isArray(driversRes) ? driversRes : driversRes.data || []);
      setLookupError("");
    } catch {
      setClients([]);
      setDrivers([]);
      setLookupError("No se pudieron cargar clientes y pilotos.");
    }
  };

  const loadShipments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (tab !== "all") params.set("status", tab);
      if (search.trim()) params.set("search", search.trim());
      if (driverId !== "all") params.set("driver_id", driverId);
      const response = await apiGet<PaginatedResponse<ShipmentListItem>>(
        `/shipments?${params.toString()}`
      );
      setShipments(response.data || []);
      setSelectedIds([]);
      setMeta({
        current_page: response.current_page || 1,
        last_page: response.last_page || 1,
        total: response.total || 0,
      });
    } catch {
      setShipments([]);
      setMeta({ current_page: 1, last_page: 1, total: 0 });
      showToast("No se pudo cargar pedidos", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLookups();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadShipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, driverId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("quickAction") === "new") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModal("create");
      params.delete("quickAction");
      const next = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intakePreviewUrl) {
        URL.revokeObjectURL(intakePreviewUrl);
      }
    };
  }, [intakePreviewUrl]);

  const clearIntakePhoto = () => {
    setIntakePhoto(null);
    setIntakePreviewUrl(null);
    setIntakePhotoInputKey((value) => value + 1);
  };

  const handleIntakePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      clearIntakePhoto();
      return;
    }

    try {
      const prepared = await prepareIntakePhoto(file);
      setIntakePhoto(prepared);
      setIntakePreviewUrl(URL.createObjectURL(prepared));
      if (prepared.size < file.size) {
        showToast("Foto optimizada para subir mas rapido", "info");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo preparar la foto.";
      clearIntakePhoto();
      showToast(msg, "error");
    }
  };

  const setPaymentType = (paymentType: PaymentType) => {
    setForm((current) => ({
      ...current,
      payment_type: paymentType,
      cod_amount: paymentType === "cash_on_delivery" ? current.cod_amount : 0,
    }));
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    void loadShipments();
  };

  const createShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        client_id: Number(form.client_id),
        recipient_name: form.recipient_name,
        recipient_phone: form.recipient_phone,
        recipient_address: form.recipient_address,
        recipient_zone: form.recipient_zone,
        delivery_instructions: form.delivery_instructions || null,
        payment_type: form.payment_type,
        shipping_cost: Number(form.shipping_cost),
        cod_amount: Number(form.cod_amount),
        driver_fee: Number(form.driver_fee),
        driver_id: form.driver_id ? Number(form.driver_id) : null,
        notes: form.notes,
      };
      if (intakePhoto) payload.intake_photo = intakePhoto;
      await apiSend("/shipments", "POST", payload);
      showToast("Envío creado", "success");
      setModal(null);
      setForm(defaultForm);
      clearIntakePhoto();
      await loadShipments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      showToast(`No se pudo crear el envío: ${msg}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id: number) => {
    try {
      const detail = await apiGet<ShipmentDetail>(`/shipments/${id}`);
      setSelected(detail);
      setModal("detail");
    } catch {
      showToast("No se pudo cargar detalle", "error");
    }
  };

  const changeStatus = async (id: number, status: ShipmentStatus, description: string) => {
    if (status === "returned" || status === "cancelled") {
      const shipment = shipments.find((item) => item.id === id);
      const ok = window.confirm(
        `¿Estás seguro de marcar ${shipment?.display_code || "este envío"} como ${shipmentStatusLabel(status)}? Esta acción no se puede deshacer.`
      );
      if (!ok) return;
    }
    try {
      setStatusLoadingId(id);
      await apiSend(`/shipments/${id}/status`, "POST", { status, description });
      showToast("Estado cambiado", "success");
      await loadShipments();
    } catch {
      showToast("No se pudo cambiar estado", "error");
    } finally {
      setStatusLoadingId(null);
    }
  };

  const assignDriver = async (id: number, nextDriverId: number) => {
    try {
      setAssignLoadingId(id);
      await apiSend(`/shipments/${id}/assign`, "POST", { driver_id: nextDriverId });
      showToast("Piloto asignado", "success");
      await loadShipments();
    } catch {
      showToast("No se pudo asignar piloto", "error");
    } finally {
      setAssignLoadingId(null);
    }
  };

  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);

  const deleteShipment = async (id: number, code: string) => {
    if (!window.confirm(`¿Eliminar el pedido ${code}? Esta acción no se puede deshacer.`)) return;
    setDeleteLoadingId(id);
    try {
      try {
        await apiSend(`/shipments/${id}`, "DELETE", {});
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (!msg.includes("DELETE method is not supported") && !msg.includes("405")) {
          throw err;
        }
        await apiSend(`/shipments/${id}/delete`, "POST", {});
      }
      showToast("Pedido eliminado", "success");
      await loadShipments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      showToast(`No se pudo eliminar: ${msg}`, "error");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const summary = useMemo(() => {
    const zones = new Set(shipments.map((item) => item.recipient_zone || "Sin zona")).size;
    const assigned = shipments.filter((item) => item.driver_id).length;
    const receivable = shipments.reduce((sum, item) => sum + Number(item.cod_amount || 0), 0);
    return { zones, assigned, receivable };
  }, [shipments]);

  const allSelectedOnPage =
    shipments.length > 0 && shipments.every((item) => selectedIds.includes(item.id));

  const toggleSelectAll = () => {
    if (allSelectedOnPage) {
      setSelectedIds((prev) => prev.filter((id) => !shipments.some((item) => item.id === id)));
      return;
    }
    const ids = shipments.map((item) => item.id);
    setSelectedIds((prev) => [...new Set([...prev, ...ids])]);
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const clearBatch = () => {
    setSelectedIds([]);
    setBatchDriverId("");
    setBatchStatus("in_transit");
    setBatchProgress({ done: 0, total: 0 });
  };

  const runBatchAssign = async () => {
    if (!batchDriverId || selectedIds.length === 0) return;
    setBatchLoading(true);
    setBatchProgress({ done: 0, total: selectedIds.length });
    try {
      const response = await apiSend<{ updated: number; message: string }>(
        "/shipments/batch-assign",
        "POST",
        {
          shipment_ids: selectedIds,
          driver_id: Number(batchDriverId),
        }
      );
      setBatchProgress({ done: selectedIds.length, total: selectedIds.length });
      showToast(response.message || `${selectedIds.length} envío(s) asignados`, "success");
      clearBatch();
      await loadShipments();
    } catch {
      showToast("No se pudo ejecutar la asignación masiva", "error");
    } finally {
      setBatchLoading(false);
    }
  };

  const runBatchStatus = async () => {
    if (selectedIds.length === 0) return;
    if (batchStatus === "returned" || batchStatus === "cancelled") {
      const ok = window.confirm(
        `Vas a marcar ${selectedIds.length} envío(s) como ${shipmentStatusLabel(batchStatus)}. Esta acción puede ser irreversible.`
      );
      if (!ok) return;
    }
    setBatchLoading(true);
    setBatchProgress({ done: 0, total: selectedIds.length });
    try {
      const response = await apiSend<{ success: number; failed: number; message: string }>(
        "/shipments/batch-status",
        "POST",
        {
          shipment_ids: selectedIds,
          status: batchStatus,
          description: `Cambio masivo a ${shipmentStatusLabel(batchStatus)}`,
        }
      );
      setBatchProgress({ done: selectedIds.length, total: selectedIds.length });
      if (response.failed > 0) {
        showToast(
          `${response.success} actualizados, ${response.failed} con error`,
          "info"
        );
      } else {
        showToast(response.message || `${selectedIds.length} envío(s) actualizados`, "success");
      }
      clearBatch();
      await loadShipments();
    } catch {
      showToast("No se pudo ejecutar el cambio masivo de estado", "error");
    } finally {
      setBatchLoading(false);
    }
  };

  const runBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    const ok = window.confirm(
      `¿Eliminar permanentemente ${selectedIds.length} envío(s)? Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    setBatchLoading(true);
    setBatchProgress({ done: 0, total: selectedIds.length });
    try {
      const response = await apiSend<{ deleted: number; skipped: number; errors: string[]; message: string }>(
        "/shipments/batch-delete",
        "POST",
        { shipment_ids: selectedIds }
      );
      setBatchProgress({ done: selectedIds.length, total: selectedIds.length });
      if (response.skipped > 0) {
        showToast(
          `${response.deleted} eliminados, ${response.skipped} omitidos (liquidación financiera)`,
          "info"
        );
      } else {
        showToast(response.message || `${response.deleted} envío(s) eliminados`, "success");
      }
      clearBatch();
      await loadShipments();
    } catch {
      showToast("No se pudieron eliminar los envíos", "error");
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Pedidos</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Gestión operativa de envíos</p>
            {lookupError ? (
              <p className="mt-1 text-xs font-semibold text-issue">{lookupError}</p>
            ) : null}
          </div>
          <form onSubmit={submitSearch} className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar guía, cliente o dirección"
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
            <button className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]">
              Buscar
            </button>
            <button
              type="button"
              onClick={() => setModal("create")}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
            >
              Nuevo pedido
            </button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setTab(item.value);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ${
              tab === item.value
                ? "bg-primary/10 text-primary"
                : "border border-slate-200 bg-white text-slate-600 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-slate-300"
            }`}
          >
            {item.label}
          </button>
        ))}
        <select
          value={driverId}
          onChange={(event) => setDriverId(event.target.value)}
          className="h-9 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
        >
          <option value="all">Todos los pilotos</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Pedidos filtrados</p>
          <p className="mt-1 text-xl font-bold dark:text-[#e0e0e0]">{meta.total}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Zonas activas</p>
          <p className="mt-1 text-xl font-bold text-route">{summary.zones}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Asignados</p>
          <p className="mt-1 text-xl font-bold text-delivered">{summary.assigned}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Por cobrar</p>
          <p className="mt-1 text-xl font-bold text-purple-600">{formatCOP(summary.receivable)}</p>
        </article>
      </section>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : shipments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-slate-400">
          No hay pedidos para este filtro.
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Mostrando {shipments.length} de {meta.total} resultados
          </p>
          {selectedIds.length > 0 ? (
            <p className="text-sm font-semibold text-primary">{selectedIds.length} seleccionados</p>
          ) : null}

          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#2a2a3e] dark:bg-[#1a1a2e] lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-[1150px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-[#16162a] dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={allSelectedOnPage}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-3 py-3">Guía</th>
                    <th className="px-3 py-3">Cliente</th>
                    <th className="px-3 py-3">Dirección</th>
                    <th className="px-3 py-3">Zona</th>
                    <th className="px-3 py-3">Estado</th>
                    <th className="px-3 py-3">Piloto</th>
                    <th className="px-3 py-3">Pago</th>
                    <th className="px-3 py-3">Hora</th>
                    <th className="px-3 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((item) => {
                    const action = getStatusAction(item.status);
                    return (
                    <tr key={item.id} className="border-t border-slate-100 dark:border-[#2a2a3e]">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelectOne(item.id)}
                        />
                      </td>
                      <td className="px-3 py-3 font-semibold dark:text-[#e0e0e0]">{item.display_code}</td>
                      <td className="px-3 py-3">
                        <p className="font-semibold dark:text-[#e0e0e0]">
                          {item.client_name || item.client?.name || item.recipient_name || "Cliente"}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.client_phone || item.client?.phone || item.recipient_phone || "--"}
                        </p>
                      </td>
                      <td className="px-3 py-3 dark:text-slate-300">{item.recipient_address}</td>
                      <td className="px-3 py-3 dark:text-slate-300">{item.recipient_zone}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            statusBadge[item.status] || "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {shipmentStatusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 dark:text-slate-300">
                        {item.driver_name || item.driver?.name || "Sin asignar"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <span
                            title={paymentTooltip[item.payment_type || "cash_on_delivery"]}
                            className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300"
                          >
                            {paymentLabel[item.payment_type || "cash_on_delivery"]}
                          </span>
                          <span>{formatCOP(Number(item.cod_amount || item.shipping_cost || 0))}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 dark:text-slate-300">{formatDate(item.created_at)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          <button
                            onClick={() => openDetail(item.id)}
                            className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                          >
                            Detalle
                          </button>
                          {action ? (
                            <button
                              disabled={statusLoadingId === item.id}
                              onClick={() =>
                                changeStatus(item.id, action.next, action.description)
                              }
                              className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 disabled:opacity-60 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                            >
                              {statusLoadingId === item.id ? "Guardando..." : action.label}
                            </button>
                          ) : (
                            <span className="inline-flex min-h-11 items-center rounded border border-slate-200 px-2 py-1 text-xs text-slate-400">
                              Sin acción
                            </span>
                          )}
                          {drivers.length > 0 ? (
                            <select
                              disabled={assignLoadingId === item.id}
                              onChange={(e) => {
                                const dId = Number(e.target.value);
                                if (dId) assignDriver(item.id, dId);
                                e.target.value = "";
                              }}
                              className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                            >
                              <option value="">
                                {assignLoadingId === item.id ? "Guardando..." : "Asignar →"}
                              </option>
                              {drivers.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <button
                            disabled={deleteLoadingId === item.id}
                            onClick={() => deleteShipment(item.id, item.display_code || item.tracking_code || `#${item.id}`)}
                            className="min-h-11 rounded border border-red-400 px-2 py-1 text-xs text-red-400 transition-all duration-150 hover:bg-red-500/10 active:scale-95 disabled:opacity-60 dark:border-red-500/40 dark:text-red-400"
                          >
                            {deleteLoadingId === item.id ? "..." : "✕"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 lg:hidden">
            {shipments.map((item) => {
              const action = getStatusAction(item.status);
              return (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-3 transition-shadow duration-200 hover:shadow-md dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"
              >
                <label className="mb-3 inline-flex min-h-11 items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelectOne(item.id)}
                  />
                  Seleccionar
                </label>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">{item.display_code}</p>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      statusBadge[item.status] || "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {shipmentStatusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  {item.client_name || item.recipient_name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{item.recipient_address}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    title={paymentTooltip[item.payment_type || "cash_on_delivery"]}
                    className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300"
                  >
                    {paymentLabel[item.payment_type || "cash_on_delivery"]}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatCOP(Number(item.cod_amount || item.shipping_cost || 0))}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {item.driver_name || item.driver?.name || "Sin asignar"}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => openDetail(item.id)}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-center text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                  >
                    Detalle
                  </button>
                  {action ? (
                    <button
                      type="button"
                      disabled={statusLoadingId === item.id}
                      onClick={() => changeStatus(item.id, action.next, action.description)}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-center text-xs transition-all duration-150 active:scale-95 disabled:opacity-60 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                    >
                      {statusLoadingId === item.id ? "Guardando..." : action.label}
                    </button>
                  ) : (
                    <span className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-center text-xs text-slate-400">
                      Sin acción
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={deleteLoadingId === item.id}
                    onClick={() => deleteShipment(item.id, item.display_code || item.tracking_code || `#${item.id}`)}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-red-400 px-3 py-2 text-center text-xs text-red-400 transition-all duration-150 hover:bg-red-500/10 active:scale-95 disabled:opacity-60 dark:border-red-500/40 dark:text-red-400"
                  >
                    {deleteLoadingId === item.id ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
              </article>
              );
            })}
          </div>

          <Pagination currentPage={meta.current_page} lastPage={meta.last_page} onPageChange={setPage} />
        </>
      )}

      {modal === "create" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <form
            onSubmit={createShipment}
            className="mobile-modal-safe-area h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl"
          >
            <h2 className="text-lg font-bold dark:text-[#e0e0e0]">Nuevo pedido</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <FormField label="Cliente remitente">
                <select
                  required
                  value={form.client_id}
                  onChange={(event) => setForm({ ...form, client_id: Number(event.target.value) })}
                  className={fieldControlClass}
                >
                  <option value={0}>Selecciona cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Nombre del destinatario">
                <input
                  required
                  value={form.recipient_name}
                  onChange={(event) => setForm({ ...form, recipient_name: event.target.value })}
                  placeholder="Ej: Carlos Perez"
                  className={fieldControlClass}
                />
              </FormField>
              <FormField label="Telefono del destinatario">
                <input
                  required
                  value={form.recipient_phone}
                  onChange={(event) => setForm({ ...form, recipient_phone: event.target.value })}
                  placeholder="Ej: 3001234567"
                  className={fieldControlClass}
                />
              </FormField>
              <FormField label="Zona de entrega">
                <input
                  required
                  value={form.recipient_zone}
                  onChange={(event) => setForm({ ...form, recipient_zone: event.target.value })}
                  placeholder="Ej: Chapinero"
                  className={fieldControlClass}
                />
              </FormField>
              <FormField label="Direccion de entrega" className="sm:col-span-2">
              <input
                required
                value={form.recipient_address}
                onChange={(event) => setForm({ ...form, recipient_address: event.target.value })}
                placeholder="Ej: Calle 22 #10-54"
                className={fieldControlClass}
              />
              </FormField>
              <FormField label="Tipo de pago" hint={paymentTooltip[form.payment_type]}>
              <select
                value={form.payment_type}
                onChange={(event) =>
                  setPaymentType(event.target.value as PaymentType)
                }
                className={fieldControlClass}
              >
                <option value="cash_on_delivery">Contra entrega</option>
                <option value="post_sale">Cobro post entrega</option>
                <option value="prepaid">Prepago</option>
                <option value="mercado_libre">Mercado Libre</option>
              </select>
              </FormField>
              <FormField label="Costo del envio">
              <input
                type="number"
                value={form.shipping_cost}
                onChange={(event) => setForm({ ...form, shipping_cost: Number(event.target.value) })}
                className={fieldControlClass}
                placeholder="Costo envío"
              />
              </FormField>
              <FormField
                label="Valor a cobrar al entregar"
                hint={form.payment_type === "cash_on_delivery" ? "Solo aplica para contra entrega." : "No aplica para este tipo de pago."}
              >
              <input
                type="number"
                min={0}
                value={form.cod_amount}
                disabled={form.payment_type !== "cash_on_delivery"}
                onChange={(event) => setForm({ ...form, cod_amount: Number(event.target.value) })}
                className={`${fieldControlClass} disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-[#111124]`}
                placeholder="Monto COD"
              />
              </FormField>
              <FormField label="Pago al piloto">
              <input
                type="number"
                min={0}
                value={form.driver_fee}
                onChange={(event) => setForm({ ...form, driver_fee: Number(event.target.value) })}
                className={fieldControlClass}
                placeholder="Pago piloto"
              />
              </FormField>
              <FormField label="Piloto asignado" className="sm:col-span-2">
              <select
                value={form.driver_id}
                onChange={(event) => setForm({ ...form, driver_id: event.target.value })}
                className={fieldControlClass}
              >
                <option value="">Sin asignar</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
              </FormField>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Foto del paquete (opcional)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    key={intakePhotoInputKey}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleIntakePhotoChange}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                  />
                  {intakePhoto && (
                    <button
                      type="button"
                      onClick={clearIntakePhoto}
                      className="shrink-0 text-xs text-red-500 hover:text-red-700"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                {intakePhoto && intakePreviewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={intakePreviewUrl}
                    alt="Preview"
                    className="mt-2 h-32 w-auto rounded-lg border border-slate-200 object-cover dark:border-[#2a2a3e]"
                  />
                )}
              </div>
              <FormField label="Instrucciones de entrega" className="sm:col-span-2">
              <textarea
                value={form.delivery_instructions}
                onChange={(event) => setForm({ ...form, delivery_instructions: event.target.value })}
                placeholder="Instrucciones de entrega (ej: dejar en portería, llamar antes)"
                className="min-h-16 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              </FormField>
              <FormField label="Observaciones internas" className="sm:col-span-2">
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Observaciones internas"
                className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              </FormField>
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
              >
                Cancelar
              </button>
              <button
                disabled={saving}
                className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Crear envío"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {modal === "detail" && selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <div className="mobile-modal-safe-area h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl">
            <h2 className="text-lg font-bold dark:text-[#e0e0e0]">{selected.display_code}</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <strong>Cliente:</strong>{" "}
                {selected.client_name || selected.client?.name || selected.recipient_name}
              </p>
              <p>
                <strong>Piloto:</strong>{" "}
                {selected.driver_name || selected.driver?.name || "Sin asignar"}
              </p>
              <p className="sm:col-span-2">
                <strong>Dirección:</strong> {selected.recipient_address}
              </p>
              <p>
                <strong>Estado:</strong> {shipmentStatusLabel(selected.status)}
              </p>
              <p>
                <strong>Monto:</strong> {formatCOP(Number(selected.cod_amount || selected.shipping_cost || 0))}
              </p>
            </div>
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">Timeline</p>
              {(selected.events || []).length === 0 ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Sin eventos registrados.</p>
              ) : (
                <ShipmentTimeline
                  events={(selected.events || []).map((event) => ({
                    id: event.id,
                    shipment_id: selected.id,
                    user_id: 0,
                    from_status: event.from_status || null,
                    to_status: event.to_status || selected.status,
                    description: event.description || "Cambio de estado",
                    metadata: null,
                    occurred_at:
                      event.occurred_at || selected.created_at || new Date().toISOString(),
                  }))}
                />
              )}
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <PrintReceiptButton shipment={selected} />
              <button
                type="button"
                onClick={() => setModal(null)}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35] sm:ml-2"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="admin-bottom-sheet-safe-area fixed bottom-0 left-0 right-0 z-40 max-h-[75dvh] overflow-y-auto border-t border-slate-200 bg-white p-3 shadow-lg dark:border-[#2a2a3e] dark:bg-[#16162a]">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {selectedIds.length} seleccionados
              {batchLoading ? ` - Procesando ${batchProgress.done}/${batchProgress.total}` : ""}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <select
                value={batchDriverId}
                onChange={(event) => setBatchDriverId(event.target.value)}
                className="col-span-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-[#e0e0e0] sm:col-span-1 sm:w-auto"
              >
                <option value="">Asignar piloto...</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={batchLoading || !batchDriverId}
                onClick={() => void runBatchAssign()}
                className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 disabled:opacity-60 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35] sm:w-auto"
              >
                Asignar piloto
              </button>
              <select
                value={batchStatus}
                onChange={(event) => setBatchStatus(event.target.value as ShipmentStatus)}
                className="col-span-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-[#e0e0e0] sm:col-span-1 sm:w-auto"
              >
                <option value="in_transit">En ruta</option>
                <option value="delivered">Entregado</option>
                <option value="issue">Novedad</option>
                <option value="returned">Devuelto</option>
                <option value="cancelled">Cancelado</option>
              </select>
              <button
                type="button"
                disabled={batchLoading}
                onClick={() => void runBatchStatus()}
                className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 disabled:opacity-60 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35] sm:w-auto"
              >
                Cambiar estado
              </button>
              <button
                type="button"
                disabled={batchLoading}
                onClick={() => void runBatchDelete()}
                className="min-h-11 w-full rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition-all duration-150 active:scale-95 disabled:opacity-60 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 sm:w-auto"
              >
                Eliminar
              </button>
              <button
                type="button"
                disabled={batchLoading}
                onClick={clearBatch}
                className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 disabled:opacity-60 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35] sm:w-auto"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
