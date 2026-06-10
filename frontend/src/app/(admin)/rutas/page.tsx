"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import { toTitle } from "@/lib/utils";
import type { DailyRoute, Driver, PaginatedResponse, Shipment } from "@/lib/types";

type NewRouteForm = {
  driver_id: number;
  date: string;
  zone: string;
  shipment_ids: number[];
};

const defaultForm: NewRouteForm = {
  driver_id: 0,
  date: new Date().toISOString().slice(0, 10),
  zone: "",
  shipment_ids: [],
};

const lanes: Array<{ key: DailyRoute["status"]; label: string }> = [
  { key: "planned", label: "Planificada" },
  { key: "active", label: "Activa" },
  { key: "completed", label: "Completada" },
];

export default function RutasPage() {
  usePageTitle("Rutas | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [routes, setRoutes] = useState<DailyRoute[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [unassigned, setUnassigned] = useState<Shipment[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<NewRouteForm>(defaultForm);
  const [dragStop, setDragStop] = useState<{ routeId: number; stopId: number } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [routesRes, driversRes, shipmentsRes] = await Promise.all([
        apiGet<DailyRoute[]>("/routes"),
        apiGet<PaginatedResponse<Driver> | Driver[]>("/drivers"),
        apiGet<PaginatedResponse<Shipment>>("/shipments?status=assigned_to_route&per_page=100"),
      ]);
      setRoutes(routesRes || []);
      setDrivers(Array.isArray(driversRes) ? driversRes : driversRes.data || []);
      setUnassigned(shipmentsRes.data || []);
    } catch {
      setRoutes([]);
      setDrivers([]);
      setUnassigned([]);
      showToast("No se pudieron cargar rutas", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    return {
      planned: routes.filter((route) => route.status === "planned"),
      active: routes.filter((route) => route.status === "active"),
      completed: routes.filter((route) => route.status === "completed"),
    };
  }, [routes]);

  const createRoute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.driver_id || form.shipment_ids.length === 0) {
      showToast("Selecciona piloto y al menos una parada", "info");
      return;
    }
    setSaving(true);
    try {
      await apiSend("/routes", "POST", {
        driver_id: form.driver_id,
        date: form.date,
        zone: form.zone || null,
        shipment_ids: form.shipment_ids,
      });
      showToast("Ruta creada", "success");
      setModalOpen(false);
      setForm(defaultForm);
      await loadData();
    } catch {
      showToast("No se pudo crear la ruta", "error");
    } finally {
      setSaving(false);
    }
  };

  const startRoute = async (routeId: number) => {
    try {
      await apiSend(`/routes/${routeId}/start`, "POST", {});
      showToast("Ruta activada", "success");
      await loadData();
    } catch {
      showToast("No se pudo activar la ruta", "error");
    }
  };

  const completeStop = async (routeId: number, stopId: number) => {
    try {
      await apiSend(`/routes/${routeId}/stops/${stopId}/complete`, "POST", {});
      showToast("Parada completada", "success");
      await loadData();
    } catch {
      showToast("No se pudo completar la parada", "error");
    }
  };

  const reorderStops = async (routeId: number, targetStopId: number) => {
    if (!dragStop || dragStop.routeId !== routeId || dragStop.stopId === targetStopId) return;
    const route = routes.find((item) => item.id === routeId);
    if (!route) return;
    const ordered = [...route.stops].sort((a, b) => a.sort_order - b.sort_order);
    const from = ordered.findIndex((item) => item.id === dragStop.stopId);
    const to = ordered.findIndex((item) => item.id === targetStopId);
    if (from < 0 || to < 0) return;
    const moved = ordered.splice(from, 1)[0];
    ordered.splice(to, 0, moved);

    setRoutes((prev) =>
      prev.map((item) =>
        item.id === routeId
          ? {
              ...item,
              stops: ordered.map((stop, index) => ({ ...stop, sort_order: index + 1 })),
            }
          : item
      )
    );

    try {
      await apiSend(`/routes/${routeId}/reorder`, "PUT", { stop_ids: ordered.map((item) => item.id) });
      showToast("Paradas reordenadas", "success");
      await loadData();
    } catch {
      showToast("No se pudo reordenar", "error");
      await loadData();
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Rutas diarias</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Gestión operativa de rutas y paradas</p>
          </div>
          <button type="button" onClick={() => setModalOpen(true)} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
            Nueva ruta
          </button>
        </div>
      </div>

      {loading ? (
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max gap-3 md:grid md:min-w-0 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-72 w-[310px] md:w-auto" />)}
          </div>
        </div>
      ) : (
        <section className="overflow-x-auto pb-1">
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400 md:hidden">← Desliza → para ver todas las columnas</p>
          <div className="flex min-w-max gap-4 md:grid md:min-w-0 md:grid-cols-3">
          {lanes.map((lane) => (
            <article key={lane.key} className="w-[310px] rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] md:w-auto">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{lane.label}</h2>
              <div className="mt-3 space-y-3">
                {grouped[lane.key].map((route) => {
                  const orderedStops = [...route.stops].sort((a, b) => a.sort_order - b.sort_order);
                  return (
                    <div key={route.id} className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold dark:text-[#e0e0e0]">Ruta #{route.id}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{route.driver?.name || "Sin piloto"} • {route.zone || "Sin zona"}</p>
                        </div>
                        {route.status === "planned" ? (
                          <button type="button" onClick={() => void startRoute(route.id)} className="rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:text-slate-200">Iniciar</button>
                        ) : null}
                      </div>

                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>Progreso</span>
                          <span>{route.completed_stops}/{route.total_stops}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-[#16162a]">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, route.progress))}%` }} />
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {orderedStops.map((stop) => (
                          <div
                            key={stop.id}
                            draggable
                            onDragStart={() => setDragStop({ routeId: route.id, stopId: stop.id })}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => void reorderStops(route.id, stop.id)}
                            className="cursor-grab rounded-lg border border-slate-200 p-2 text-xs transition-colors duration-150 hover:border-primary/50 hover:bg-slate-50 active:cursor-grabbing dark:border-[#2a2a3e] dark:hover:bg-[#16162a]"
                          >
                            <p className="font-semibold dark:text-[#e0e0e0]">{stop.shipment.display_code}</p>
                            <p className="text-slate-500 dark:text-slate-400">{stop.shipment.recipient_name || "Sin destinatario"}</p>
                            <p className="text-slate-500 dark:text-slate-400">{stop.shipment.recipient_address || "Sin direccion"}</p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">{toTitle(stop.status)}</span>
                              {stop.status !== "completed" ? (
                                <button type="button" onClick={() => void completeStop(route.id, stop.id)} className="rounded border border-slate-300 px-2 py-0.5 transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:text-slate-200">Completar</button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {grouped[lane.key].length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-[#2a2a3e] dark:text-slate-400">Sin rutas</p>
                ) : null}
              </div>
            </article>
          ))}
          </div>
        </section>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <form onSubmit={createRoute} className="w-full rounded-t-xl bg-white p-5 dark:bg-[#1a1a2e] sm:max-w-2xl sm:rounded-xl">
            <h2 className="text-lg font-bold dark:text-[#e0e0e0]">Nueva ruta</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <select value={form.driver_id} onChange={(event) => setForm((prev) => ({ ...prev, driver_id: Number(event.target.value) }))} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]">
                <option value={0}>Selecciona piloto</option>
                {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
              </select>
              <input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" />
              <input value={form.zone} onChange={(event) => setForm((prev) => ({ ...prev, zone: event.target.value }))} placeholder="Zona (opcional)" className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0] sm:col-span-2" />
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
              <p className="text-sm font-semibold dark:text-[#e0e0e0]">Paradas disponibles</p>
              <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">
                {unassigned.map((shipment) => (
                  <label key={shipment.id} className="flex items-start gap-2 rounded border border-slate-200 p-2 text-xs dark:border-[#2a2a3e]">
                    <input
                      type="checkbox"
                      checked={form.shipment_ids.includes(shipment.id)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setForm((prev) => ({
                          ...prev,
                          shipment_ids: checked
                            ? [...prev.shipment_ids, shipment.id]
                            : prev.shipment_ids.filter((id) => id !== shipment.id),
                        }));
                      }}
                    />
                    <div>
                      <p className="font-semibold dark:text-[#e0e0e0]">{shipment.display_code}</p>
                      <p className="text-slate-500 dark:text-slate-400">{shipment.recipient_name} - {shipment.recipient_address}</p>
                    </div>
                  </label>
                ))}
                {unassigned.length === 0 ? <p className="text-xs text-slate-500 dark:text-slate-400">No hay envíos disponibles para asignar.</p> : null}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:text-slate-200">Cancelar</button>
              <button disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60">{saving ? "Guardando..." : "Crear ruta"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
