"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import { routeStopStatusLabel } from "@/lib/utils";
import type { DailyRoute, Driver, PaginatedResponse } from "@/lib/types";

const lanes: Array<{ key: DailyRoute["status"]; label: string }> = [
  { key: "planned", label: "Planificada" },
  { key: "active", label: "Activa" },
  { key: "completed", label: "Completada" },
];

type RoutableShipment = {
  id: number;
  display_code: string;
  recipient_name?: string | null;
  recipient_address?: string | null;
  recipient_zone?: string | null;
};

export default function RutasPage() {
  usePageTitle("Monitor de Rutas | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<DailyRoute[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverFilter, setDriverFilter] = useState("all");
  const [dragStop, setDragStop] = useState<{ routeId: number; stopId: number } | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newRouteDriverId, setNewRouteDriverId] = useState("");
  const [newRouteZone, setNewRouteZone] = useState("");
  const [routableShipments, setRoutableShipments] = useState<RoutableShipment[]>([]);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<number[]>([]);
  const [routableLoading, setRoutableLoading] = useState(false);
  const [routeSaving, setRouteSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [routesRes, driversRes] = await Promise.all([
        apiGet<DailyRoute[]>("/routes"),
        apiGet<PaginatedResponse<Driver> | Driver[]>("/drivers"),
      ]);

      setRoutes(routesRes || []);
      setDrivers(Array.isArray(driversRes) ? driversRes : driversRes.data || []);
    } catch {
      setRoutes([]);
      setDrivers([]);
      showToast("No se pudieron cargar rutas", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverFilter]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadData();
    }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverFilter]);

  const grouped = useMemo(() => {
    const filtered =
      driverFilter === "all"
        ? routes
        : routes.filter((route) => String(route.driver?.id) === driverFilter);
    return {
      planned: filtered.filter((route) => route.status === "planned"),
      active: filtered.filter((route) => route.status === "active"),
      completed: filtered.filter((route) => route.status === "completed"),
    };
  }, [routes, driverFilter]);

  const startRoute = async (routeId: number) => {
    try {
      await apiSend(`/routes/${routeId}/start`, "POST", {});
      showToast("Ruta activada", "success");
      await loadData();
    } catch {
      showToast("No se pudo activar la ruta", "error");
    }
  };

  const loadRoutableShipments = async (driverId: string) => {
    setRoutableLoading(true);
    try {
      const params = new URLSearchParams({ per_page: "100" });
      if (driverId) params.set("driver_id", driverId);
      const response = await apiGet<PaginatedResponse<RoutableShipment>>(
        `/routes/routable-shipments?${params.toString()}`
      );
      setRoutableShipments(response.data || []);
      setSelectedShipmentIds((current) =>
        current.filter((id) => (response.data || []).some((shipment) => shipment.id === id))
      );
    } catch {
      setRoutableShipments([]);
      showToast("No se pudieron cargar paradas disponibles", "error");
    } finally {
      setRoutableLoading(false);
    }
  };

  const openCreateRoute = () => {
    const firstDriverId = drivers[0]?.id ? String(drivers[0].id) : "";
    setNewRouteDriverId(firstDriverId);
    setNewRouteZone("");
    setSelectedShipmentIds([]);
    setCreateModalOpen(true);
    void loadRoutableShipments(firstDriverId);
  };

  const toggleShipment = (shipmentId: number) => {
    setSelectedShipmentIds((current) =>
      current.includes(shipmentId)
        ? current.filter((id) => id !== shipmentId)
        : [...current, shipmentId]
    );
  };

  const createRoute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newRouteDriverId) {
      showToast("Selecciona un piloto", "error");
      return;
    }
    if (selectedShipmentIds.length === 0) {
      showToast("Selecciona al menos una parada", "error");
      return;
    }

    setRouteSaving(true);
    try {
      await apiSend("/routes", "POST", {
        driver_id: Number(newRouteDriverId),
        zone: newRouteZone || null,
        shipment_ids: selectedShipmentIds,
      });
      showToast("Ruta creada", "success");
      setCreateModalOpen(false);
      await loadData();
    } catch {
      showToast("No se pudo crear la ruta", "error");
    } finally {
      setRouteSaving(false);
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
          ? { ...item, stops: ordered.map((stop, index) => ({ ...stop, sort_order: index + 1 })) }
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Rutas diarias</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Seguimiento en tiempo real de las rutas de los pilotos
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={driverFilter}
              onChange={(event) => setDriverFilter(event.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
            >
              <option value="all">Todos los pilotos</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={openCreateRoute}
              className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
            >
              Nueva ruta
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-72" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max gap-4 md:grid md:min-w-0 md:grid-cols-3">
            {lanes.map((lane) => (
              <article
                key={lane.key}
                className="w-[310px] rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] md:w-auto"
              >
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{lane.label}</h2>
                <div className="mt-3 space-y-3">
                  {grouped[lane.key].map((route) => {
                    const orderedStops = [...route.stops].sort((a, b) => a.sort_order - b.sort_order);
                    return (
                      <div key={route.id} className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold dark:text-[#e0e0e0]">Ruta #{route.id}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {route.driver?.name || "Sin piloto"} • {route.zone || "Sin zona"}
                            </p>
                          </div>
                          {route.status === "planned" ? (
                            <button
                              type="button"
                              onClick={() => void startRoute(route.id)}
                              className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e]"
                            >
                              Iniciar
                            </button>
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
                              className="cursor-grab rounded-lg border border-slate-200 p-2 text-xs hover:border-primary/50 dark:border-[#2a2a3e]"
                            >
                              <p className="font-semibold dark:text-[#e0e0e0]">{stop.shipment.display_code}</p>
                              <p className="text-slate-500 dark:text-slate-400">{stop.shipment.recipient_name || "Sin destinatario"}</p>
                              <p className="text-slate-500 dark:text-slate-400">{stop.shipment.recipient_address || "Sin direccion"}</p>
                              <div className="mt-2 flex items-center justify-between">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">
                                  {routeStopStatusLabel(stop.status)}
                                </span>
                                {stop.status !== "completed" ? (
                                  <button
                                    type="button"
                                    onClick={() => void completeStop(route.id, stop.id)}
                                    className="rounded border border-slate-300 px-2 py-0.5 dark:border-[#2a2a3e]"
                                  >
                                    Completar
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {grouped[lane.key].length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-[#2a2a3e]">
                      Sin rutas
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <form
            onSubmit={createRoute}
            className="mobile-modal-safe-area h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold dark:text-[#e0e0e0]">Nueva ruta</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Selecciona piloto y paquetes para planificar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="admin-touch-target rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e]"
                aria-label="Cerrar nueva ruta"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Piloto
                </span>
                <select
                  required
                  value={newRouteDriverId}
                  onChange={(event) => {
                    const nextDriverId = event.target.value;
                    setNewRouteDriverId(nextDriverId);
                    setSelectedShipmentIds([]);
                    void loadRoutableShipments(nextDriverId);
                  }}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
                >
                  <option value="">Selecciona piloto</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Zona de ruta
                </span>
                <input
                  value={newRouteZone}
                  onChange={(event) => setNewRouteZone(event.target.value)}
                  placeholder="Ej: Norte"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
                />
              </label>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">
                  Paradas disponibles
                </h3>
                <span className="text-xs text-slate-500">
                  {selectedShipmentIds.length} seleccionadas
                </span>
              </div>

              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {routableLoading ? (
                  <Skeleton className="h-24" />
                ) : routableShipments.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-[#2a2a3e]">
                    No hay paradas disponibles para este piloto.
                  </p>
                ) : (
                  routableShipments.map((shipment) => (
                    <label
                      key={shipment.id}
                      className="flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm transition-colors duration-150 hover:border-primary/60 dark:border-[#2a2a3e]"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5"
                        checked={selectedShipmentIds.includes(shipment.id)}
                        onChange={() => toggleShipment(shipment.id)}
                      />
                      <span>
                        <span className="block font-semibold text-slate-900 dark:text-[#e0e0e0]">
                          {shipment.display_code}
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {shipment.recipient_name || "Sin destinatario"} · {shipment.recipient_address || "Sin dirección"}
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {shipment.recipient_zone || "Sin zona"}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e]"
              >
                Cancelar
              </button>
              <button
                disabled={routeSaving}
                className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
              >
                {routeSaving ? "Creando..." : "Crear ruta"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
