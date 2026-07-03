"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type { Driver, DriverDetail, DriverDocumentAlertLevel, PaginatedResponse } from "@/lib/types";

function PilotIcon({ path, className = "h-4 w-4" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} fill-none stroke-current stroke-2`}>
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const iconPaths = {
  trash: "M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13M10 11v5M14 11v5",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM11 18h2",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff: "M3 3l18 18M10.6 10.6A3 3 0 0 0 14 14M7.5 7.8C4 9.5 2 12 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8M12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.4",
};

type DriverForm = {
  id: number;
  name: string;
  phone: string;
  email: string;
  password: string;
  has_user_access: boolean;
  vehicle: string;
  plate: string;
  zone: string;
  per_package_rate: number;
};

const formDefault: DriverForm = {
  id: 0,
  name: "",
  phone: "",
  email: "",
  password: "",
  has_user_access: false,
  vehicle: "",
  plate: "",
  zone: "",
  per_package_rate: 3000,
};

const driverDocumentStatusLabel: Record<string, string> = {
  ok: "Completo",
  complete: "Completo",
  missing: "Faltantes",
  warning: "Por vencer",
  expired: "Vencido",
  critical: "Crítico",
};

const driverDocumentStatusStyles: Record<DriverDocumentAlertLevel, string> = {
  ok: "bg-emerald-50 text-delivered dark:bg-emerald-500/10 dark:text-emerald-300",
  missing: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  warning: "bg-amber-50 text-pending dark:bg-amber-500/10 dark:text-amber-300",
  expired: "bg-rose-50 text-issue dark:bg-rose-500/10 dark:text-rose-300",
};

export default function ConductoresPage() {
  usePageTitle("Pilotos Repartidores | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggleLoadingId, setToggleLoadingId] = useState<number | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trashedDrivers, setTrashedDrivers] = useState<Driver[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [documentFilter, setDocumentFilter] = useState<
    "all" | "critical" | "missing" | "warning" | "expired" | "complete"
  >("all");
  const [modal, setModal] = useState<"create" | "edit" | "detail" | null>(null);
  const [form, setForm] = useState<DriverForm>(formDefault);
  const [selected, setSelected] = useState<DriverDetail | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (documentFilter !== "all") params.set("document_status", documentFilter);
      const response = await apiGet<PaginatedResponse<Driver> | Driver[]>(
        `/drivers${params.toString() ? `?${params.toString()}` : ""}`
      );
      setDrivers(Array.isArray(response) ? response : response.data || []);
    } catch {
      setDrivers([]);
      showToast("No se pudieron cargar pilotos", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, documentFilter]);

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

  const summary = useMemo(() => {
    return {
      active: drivers.filter((driver) => driver.status !== "inactive").length,
      assigned: drivers.reduce(
        (sum, driver) => sum + Number(driver.active_shipments_count || 0),
        0
      ),
      delivered: drivers.reduce(
        (sum, driver) => sum + Number(driver.delivered_today_count || 0),
        0
      ),
      criticalDocuments: drivers.filter((driver) => driver.document_status && driver.document_status !== "ok").length,
    };
  }, [drivers]);

  const closeModal = () => {
    setModal(null);
    setForm(formDefault);
    setShowPassword(false);
  };

  const loadTrashed = async () => {
    try {
      const data = await apiGet<Driver[]>("/drivers-trashed");
      setTrashedDrivers(Array.isArray(data) ? data : []);
    } catch {
      setTrashedDrivers([]);
    }
  };

  const deleteDriver = async (id: number) => {
    setDeleting(true);
    try {
      await apiSend(`/drivers/${id}/delete`, "POST", {});
      showToast("Piloto enviado a la papelera", "success");
      setConfirmDeleteId(null);
      closeModal();
      await loadDrivers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo eliminar el piloto", "error");
    } finally {
      setDeleting(false);
    }
  };

  const restoreDriver = async (id: number) => {
    try {
      await apiSend(`/drivers/${id}/restore`, "POST", {});
      showToast("Piloto restaurado", "success");
      await loadTrashed();
      await loadDrivers();
    } catch {
      showToast("No se pudo restaurar", "error");
    }
  };

  const submitDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: Partial<DriverForm> = { ...form };
      if (!payload.password) delete payload.password;
      delete payload.has_user_access;
      if (form.id) {
        await apiSend(`/drivers/${form.id}`, "PUT", payload);
        showToast("Piloto actualizado", "success");
      } else {
        await apiSend("/drivers", "POST", payload);
        showToast("Piloto creado con acceso a la app", "success");
      }
      closeModal();
      await loadDrivers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo guardar piloto", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (id: number) => {
    try {
      setToggleLoadingId(id);
      await apiSend(`/drivers/${id}/toggle-status`, "POST", {});
      showToast("Estado del piloto actualizado", "success");
      await loadDrivers();
    } catch {
      showToast("No se pudo cambiar estado del piloto", "error");
    } finally {
      setToggleLoadingId(null);
    }
  };

  const openDetail = async (id: number) => {
    try {
      const detail = await apiGet<DriverDetail>(`/drivers/${id}`);
      setSelected(detail);
      setModal("detail");
    } catch {
      showToast("No se pudo cargar detalle", "error");
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">PILOTOS <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">repartidores</span></h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Equipo operativo con datos en tiempo real.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | "active" | "inactive")
            }
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          <select
            value={documentFilter}
            onChange={(event) =>
              setDocumentFilter(event.target.value as "all" | "critical" | "missing" | "warning" | "expired" | "complete")
            }
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
          >
            <option value="all">Expediente: todos</option>
            <option value="critical">Expediente crítico</option>
            <option value="missing">Con faltantes</option>
            <option value="warning">Por vencer</option>
            <option value="expired">Vencidos</option>
            <option value="complete">Completos</option>
          </select>
          <button
            onClick={() => {
              setForm(formDefault);
              setModal("create");
            }}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
          >
            Nuevo piloto
          </button>
          <button
            onClick={() => { setShowTrash(!showTrash); if (!showTrash) void loadTrashed(); }}
            className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-all duration-150 active:scale-95 ${
              showTrash
                ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                : "border-slate-300 text-slate-600 dark:border-[#2a2a3e] dark:text-slate-300"
            }`}
          >
            <PilotIcon path={iconPaths.trash} />
            Papelera
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Activos</p>
          <p className="mt-1 text-xl font-bold text-delivered">{summary.active}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Pedidos asignados</p>
          <p className="mt-1 text-xl font-bold text-route">{summary.assigned}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Entregas hoy</p>
          <p className="mt-1 text-xl font-bold text-primary">{summary.delivered}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Expediente crítico</p>
          <p className="mt-1 text-xl font-bold text-issue">{summary.criticalDocuments}</p>
        </article>
      </section>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-48" />
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-slate-400">
          No hay pilotos para este filtro.
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {drivers.map((driver) => (
            <article
              key={driver.id}
              className="rounded-xl border border-slate-200 bg-white p-4 transition-shadow duration-200 hover:shadow-md dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {driver.initials}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">{driver.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{driver.phone}</p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    driver.status === "inactive"
                      ? "bg-slate-100 text-slate-600"
                      : "bg-emerald-50 text-delivered dark:bg-emerald-400/20 dark:text-emerald-300"
                  }`}
                >
                  {driver.status === "inactive" ? "Inactivo" : "Activo"}
                </span>
              </div>
              <div className="mt-3 text-sm text-slate-700 dark:text-slate-300">
                <p>
                  <strong>Vehiculo:</strong> {driver.vehicle || "-"}
                </p>
                <p>
                  <strong>Placa:</strong> {driver.plate || "-"}
                </p>
                <p>
                  <strong>Zona:</strong> {driver.zone || "-"}
                </p>
                <p className="break-words">
                  <strong>Correo app:</strong>{" "}
                  <span className="break-all">{driver.user?.email || "Sin acceso configurado"}</span>
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-500/20 dark:text-slate-300">
                  Asignados: {driver.active_shipments_count || 0}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-500/20 dark:text-slate-300">
                  Entregados: {driver.delivered_today_count || 0}
                </span>
                {driver.document_status ? (
                  <span className={`rounded-full px-2 py-1 ${driverDocumentStatusStyles[driver.document_status]}`}>
                    Expediente: {driverDocumentStatusLabel[driver.document_status]}
                  </span>
                ) : null}
              </div>
              {driver.documents ? (
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  <p>
                    Documentos: {driver.documents.count_present}/{driver.documents.count_required}
                    {" · "}faltantes {driver.documents.count_missing}
                    {" · "}alertas {driver.documents.count_warning + driver.documents.count_expired}
                  </p>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => openDetail(driver.id)}
                  className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                >
                  Detalle
                </button>
                <Link
                  href={`/conductores/${driver.id}`}
                  className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                >
                  Ver pagina
                </Link>
                <Link
                  href={`/conductores/${driver.id}?section=history`}
                  className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                >
                  Historial
                </Link>
                <button
                  onClick={() => {
                    setForm({
                      id: driver.id,
                      name: driver.name,
                      phone: driver.phone,
                      email: driver.user?.email || "",
                      password: "",
                      has_user_access: Boolean(driver.user?.email),
                      vehicle: driver.vehicle || "",
                      plate: driver.plate || "",
                      zone: driver.zone || "",
                      per_package_rate: driver.per_package_rate || 3000,
                    });
                    setModal("edit");
                  }}
                  className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                >
                  Editar
                </button>
                <button
                  disabled={toggleLoadingId === driver.id}
                  onClick={() => toggleStatus(driver.id)}
                  className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 disabled:opacity-60 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                >
                  {toggleLoadingId === driver.id
                    ? "Guardando..."
                    : driver.status === "inactive"
                      ? "Activar"
                      : "Inactivar"}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {/* Papelera */}
      {showTrash && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-500/20 dark:bg-rose-500/5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-rose-700 dark:text-rose-300">
            <PilotIcon path={iconPaths.trash} />
            Papelera - Pilotos eliminados
          </h3>
          {trashedDrivers.length === 0 ? (
            <p className="text-sm text-slate-500">La papelera está vacía.</p>
          ) : (
            <div className="space-y-2">
              {trashedDrivers.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-rose-200 bg-white p-3 dark:border-rose-500/20 dark:bg-[#1a1a2e]">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{d.name}</p>
                    <p className="text-xs text-slate-500">{d.phone} · {d.vehicle || "-"} · {d.zone || "-"}</p>
                  </div>
                  <button
                    onClick={() => restoreDriver(d.id)}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-all duration-150 active:scale-95 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modal === "create" || modal === "edit" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <form
            onSubmit={submitDriver}
            className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl"
          >
            <h2 className="text-lg font-bold dark:text-[#e0e0e0]">
              {modal === "create" ? "Nuevo piloto repartidor" : "Editar piloto"}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Nombre completo</label>
                <input
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Ej: Juan Pérez"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Teléfono</label>
                <input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="Ej: 320 111 2222"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Vehículo</label>
                <input
                  value={form.vehicle}
                  onChange={(event) => setForm({ ...form, vehicle: event.target.value })}
                  placeholder="Ej: Moto, Furgón"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Placa</label>
                <input
                  value={form.plate}
                  onChange={(event) => setForm({ ...form, plate: event.target.value })}
                  placeholder="Ej: ABC123"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Zona base</label>
                <input
                  value={form.zone}
                  onChange={(event) => setForm({ ...form, zone: event.target.value })}
                  placeholder="Ej: Chapinero"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Tarifa por paquete ($)</label>
                <input
                  type="number"
                  value={form.per_package_rate}
                  onChange={(event) =>
                    setForm({ ...form, per_package_rate: Number(event.target.value) })
                  }
                  placeholder="3000"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </div>

              {/* Acceso App Piloto */}
              <div className="sm:col-span-2">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                  <PilotIcon path={iconPaths.phone} />
                  Acceso App Piloto
                </p>
                <hr className="border-slate-200 dark:border-[#2a2a3e]" />
              </div>
              <p className="text-xs text-slate-400 sm:col-span-2" style={{ margin: '4px 0 12px' }}>
                {modal === "create"
                  ? "El piloto usará este correo y contraseña para iniciar sesión en la app móvil."
                  : "Puedes cambiar el correo o contraseña del piloto."}
              </p>
              {modal === "edit" && !form.has_user_access ? (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-300 sm:col-span-2">
                  Este piloto todavia no tiene acceso a la app. Define correo y contrasena para crearlo.
                </p>
              ) : null}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Correo electrónico *</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="piloto@ejemplo.com"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {modal === "create" || !form.has_user_access ? "Contraseña *" : "Nueva contraseña (opcional)"}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    required={modal === "create" || (modal === "edit" && !form.has_user_access)}
                    minLength={6}
                    placeholder={modal === "create" || !form.has_user_access ? "Mínimo 6 caracteres" : "Dejar vacío para no cambiar"}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <PilotIcon path={showPassword ? iconPaths.eyeOff : iconPaths.eye} className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div>
                {modal === "edit" && form.id ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(form.id)}
                    className="flex items-center gap-2 rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-600 transition-all duration-150 hover:bg-rose-50 active:scale-95 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    <PilotIcon path={iconPaths.trash} />
                    Eliminar piloto
                  </button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                >
                  Cancelar
                </button>
                <button
                  disabled={saving}
                  className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {modal === "detail" && selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <div className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">{selected.name}</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <strong>Telefono:</strong> {selected.phone}
              </p>
              <p>
                <strong>Vehiculo:</strong> {selected.vehicle || "-"}
              </p>
              <p>
                <strong>Placa:</strong> {selected.plate || "-"}
              </p>
              <p>
                <strong>Zona:</strong> {selected.zone || "-"}
              </p>
              <p className="break-words sm:col-span-2">
                <strong>Correo app:</strong>{" "}
                <span className="break-all">{selected.user?.email || "Sin acceso configurado"}</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 sm:col-span-2">
                La contraseña no se muestra por seguridad. Puedes actualizarla desde Editar.
              </p>
            </div>
            {selected.today_summary ? (
              <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm dark:border-[#2a2a3e]">
                <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">Resumen del dia</p>
                <p>Asignados: {selected.today_summary.assigned}</p>
                <p>Entregados: {selected.today_summary.delivered}</p>
                <p>Recaudado: {formatCOP(selected.today_summary.cash_collected)}</p>
                <p>Pendiente recaudo: {formatCOP(selected.today_summary.pending_cash)}</p>
                <p>Ganancia: {formatCOP(selected.today_summary.earnings)}</p>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setModal(null)}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal de confirmación eliminar */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl animate-fade-in dark:bg-[#1a1a2e]">
            <h3 className="text-base font-bold text-slate-900 dark:text-[#e0e0e0]">¿Eliminar piloto?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              El piloto será enviado a la papelera. También se desactivará su acceso a la app.
              Puedes restaurarlo después desde la papelera.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e]"
              >
                Cancelar
              </button>
              <button
                disabled={deleting}
                onClick={() => deleteDriver(confirmDeleteId)}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
              >
                {deleting ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
