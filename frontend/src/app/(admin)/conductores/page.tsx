"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type { Driver, DriverDetail, PaginatedResponse } from "@/lib/types";

type DriverForm = {
  id: number;
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  zone: string;
  per_package_rate: number;
};

const formDefault: DriverForm = {
  id: 0,
  name: "",
  phone: "",
  vehicle: "",
  plate: "",
  zone: "",
  per_package_rate: 3000,
};

export default function ConductoresPage() {
  usePageTitle("Conductores | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggleLoadingId, setToggleLoadingId] = useState<number | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [modal, setModal] = useState<"create" | "edit" | "detail" | null>(null);
  const [form, setForm] = useState<DriverForm>(formDefault);
  const [selected, setSelected] = useState<DriverDetail | null>(null);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const response = await apiGet<PaginatedResponse<Driver> | Driver[]>(
        `/drivers${params.toString() ? `?${params.toString()}` : ""}`
      );
      setDrivers(Array.isArray(response) ? response : response.data || []);
    } catch {
      setDrivers([]);
      showToast("No se pudieron cargar conductores", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

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
    };
  }, [drivers]);

  const closeModal = () => {
    setModal(null);
    setForm(formDefault);
  };

  const submitDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (form.id) {
        await apiSend(`/drivers/${form.id}`, "PUT", form);
        showToast("Conductor actualizado", "success");
      } else {
        await apiSend("/drivers", "POST", form);
        showToast("Conductor creado", "success");
      }
      closeModal();
      await loadDrivers();
    } catch {
      showToast("No se pudo guardar conductor", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (id: number) => {
    try {
      setToggleLoadingId(id);
      await apiSend(`/drivers/${id}/toggle-status`, "POST", {});
      showToast("Estado del conductor actualizado", "success");
      await loadDrivers();
    } catch {
      showToast("No se pudo cambiar estado", "error");
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
          <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Conductores</h1>
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
          <button
            onClick={() => {
              setForm(formDefault);
              setModal("create");
            }}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
          >
            Nuevo conductor
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
      </section>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-48" />
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-slate-400">
          No hay conductores para este filtro.
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
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-500/20 dark:text-slate-300">
                  Asignados: {driver.active_shipments_count || 0}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-500/20 dark:text-slate-300">
                  Entregados: {driver.delivered_today_count || 0}
                </span>
              </div>
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
                <button
                  onClick={() => {
                    setForm({
                      id: driver.id,
                      name: driver.name,
                      phone: driver.phone,
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

      {modal === "create" || modal === "edit" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <form
            onSubmit={submitDriver}
            className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl"
          >
            <h2 className="text-lg font-bold dark:text-[#e0e0e0]">
              {modal === "create" ? "Nuevo conductor" : "Editar conductor"}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Nombre"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0] sm:col-span-2"
              />
              <input
                required
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="Telefono"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              <input
                required
                value={form.vehicle}
                onChange={(event) => setForm({ ...form, vehicle: event.target.value })}
                placeholder="Vehiculo"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              <input
                required
                value={form.plate}
                onChange={(event) => setForm({ ...form, plate: event.target.value })}
                placeholder="Placa"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              <input
                required
                value={form.zone}
                onChange={(event) => setForm({ ...form, zone: event.target.value })}
                placeholder="Zona base"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              <input
                type="number"
                value={form.per_package_rate}
                onChange={(event) =>
                  setForm({ ...form, per_package_rate: Number(event.target.value) })
                }
                placeholder="Tarifa por paquete"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0] sm:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
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
    </div>
  );
}
