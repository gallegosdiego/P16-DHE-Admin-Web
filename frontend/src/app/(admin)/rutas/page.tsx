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

type MonitorPoint = {
  x: number;
  y: number;
  label: string;
  kind: "driver" | "stop";
  status?: string;
  order?: number;
  current?: boolean;
};

const MONITOR_WIDTH = 320;
const MONITOR_HEIGHT = 180;
const MONITOR_PADDING = 18;

const hasStopCoordinates = (lat?: number | null, lng?: number | null) =>
  Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

const ageLabel = (ageSeconds?: number | null) => {
  if (ageSeconds === null || ageSeconds === undefined) return "sin hora";
  if (ageSeconds < 60) return "hace menos de 1 min";
  if (ageSeconds < 3600) return `hace ${Math.floor(ageSeconds / 60)} min`;
  return `hace ${Math.floor(ageSeconds / 3600)} h`;
};

const stopTone = (status?: string, current?: boolean) => {
  if (current) return "#d1007f";
  if (status === "completed") return "#16a34a";
  return "#f59e0b";
};

function buildMonitorGeometry(route: DailyRoute) {
  const orderedStops = [...route.stops]
    .filter((stop) => hasStopCoordinates(stop.shipment.recipient_lat, stop.shipment.recipient_lng))
    .sort((left, right) => left.sort_order - right.sort_order);

  const driverLocation = route.driver_location;
  const rawPoints = [
    ...orderedStops.map((stop) => ({
      lat: Number(stop.shipment.recipient_lat),
      lng: Number(stop.shipment.recipient_lng),
    })),
    ...(driverLocation ? [{ lat: driverLocation.lat, lng: driverLocation.lng }] : []),
  ];

  if (rawPoints.length === 0) {
    return null;
  }

  const minLat = Math.min(...rawPoints.map((point) => point.lat));
  const maxLat = Math.max(...rawPoints.map((point) => point.lat));
  const minLng = Math.min(...rawPoints.map((point) => point.lng));
  const maxLng = Math.max(...rawPoints.map((point) => point.lng));
  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);
  const scaleX = (lng: number) =>
    MONITOR_PADDING + ((lng - minLng) / lngSpan) * (MONITOR_WIDTH - MONITOR_PADDING * 2);
  const scaleY = (lat: number) =>
    MONITOR_HEIGHT - MONITOR_PADDING - ((lat - minLat) / latSpan) * (MONITOR_HEIGHT - MONITOR_PADDING * 2);

  const pendingStops = [...route.stops]
    .filter((stop) => stop.status !== "completed")
    .sort((left, right) => left.sort_order - right.sort_order);
  const currentStopId = pendingStops[0]?.id ?? null;

  const stopPoints: MonitorPoint[] = orderedStops.map((stop) => ({
    x: scaleX(Number(stop.shipment.recipient_lng)),
    y: scaleY(Number(stop.shipment.recipient_lat)),
    label: stop.shipment.display_code,
    kind: "stop",
    status: stop.status,
    order: stop.sort_order,
    current: stop.id === currentStopId,
  }));

  const driverPoint: MonitorPoint | null = driverLocation
    ? {
        x: scaleX(driverLocation.lng),
        y: scaleY(driverLocation.lat),
        label: route.driver?.name || "Piloto",
        kind: "driver",
      }
    : null;

  const routePath = stopPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  const currentStopPoint =
    currentStopId !== null ? stopPoints.find((point) => point.current) ?? null : null;

  const driverToCurrentPath =
    driverPoint && currentStopPoint
      ? `M ${driverPoint.x.toFixed(1)} ${driverPoint.y.toFixed(1)} L ${currentStopPoint.x.toFixed(1)} ${currentStopPoint.y.toFixed(1)}`
      : null;

  return {
    stopPoints,
    driverPoint,
    routePath,
    driverToCurrentPath,
  };
}

function RouteMonitorCard({ route }: { route: DailyRoute }) {
  const orderedStops = useMemo(
    () => [...route.stops].sort((left, right) => left.sort_order - right.sort_order),
    [route.stops]
  );
  const pendingStops = orderedStops.filter((stop) => stop.status !== "completed");
  const currentStop = pendingStops[0] ?? null;
  const nextStop = pendingStops[1] ?? null;
  const geometry = useMemo(() => buildMonitorGeometry(route), [route]);

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
        <span className="rounded-full bg-white px-2 py-1 dark:bg-[#1a1a2e]">
          Completadas: {route.completed_stops}
        </span>
        <span className="rounded-full bg-white px-2 py-1 dark:bg-[#1a1a2e]">
          Pendientes: {Math.max(route.total_stops - route.completed_stops, 0)}
        </span>
        <span
          className={`rounded-full px-2 py-1 font-semibold ${
            route.driver_location?.freshness === "live"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          }`}
        >
          {route.driver_location ? `Ubicación ${ageLabel(route.driver_location.age_seconds)}` : "Sin ubicación viva"}
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          {geometry ? (
            <svg viewBox={`0 0 ${MONITOR_WIDTH} ${MONITOR_HEIGHT}`} className="h-44 w-full">
              <rect x="0" y="0" width={MONITOR_WIDTH} height={MONITOR_HEIGHT} rx="16" fill="transparent" />
              {geometry.routePath ? (
                <path d={geometry.routePath} fill="none" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
              ) : null}
              {geometry.driverToCurrentPath ? (
                <path
                  d={geometry.driverToCurrentPath}
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth="2"
                  strokeDasharray="6 5"
                  strokeLinecap="round"
                />
              ) : null}
              {geometry.stopPoints.map((point) => (
                <g key={`${point.kind}-${point.order}-${point.label}`}>
                  <circle cx={point.x} cy={point.y} r={point.current ? 9 : 7} fill={stopTone(point.status, point.current)} />
                  <text
                    x={point.x}
                    y={point.y + 3}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="700"
                    fill="#fff"
                  >
                    {point.order}
                  </text>
                </g>
              ))}
              {geometry.driverPoint ? (
                <g>
                  <circle cx={geometry.driverPoint.x} cy={geometry.driverPoint.y} r="10" fill="#0ea5e9" />
                  <circle cx={geometry.driverPoint.x} cy={geometry.driverPoint.y} r="16" fill="none" stroke="#38bdf8" strokeOpacity="0.35" strokeWidth="4" />
                </g>
              ) : null}
            </svg>
          ) : (
            <div className="flex h-44 items-center justify-center text-center text-xs text-slate-500 dark:text-slate-400">
              No hay coordenadas suficientes para dibujar la ruta.
            </div>
          )}
        </div>

        <div className="space-y-2 text-xs">
          <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Parada actual</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              {currentStop ? `${currentStop.shipment.display_code} · ${currentStop.shipment.recipient_name || "Sin destinatario"}` : "Ruta finalizada"}
            </p>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              {currentStop?.shipment.recipient_address || "Sin dirección"}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Siguiente parada</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              {nextStop ? `${nextStop.shipment.display_code} · ${nextStop.shipment.recipient_name || "Sin destinatario"}` : "No hay siguiente parada"}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Piloto</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              {route.driver?.name || "Sin piloto"}
            </p>
            <p className="mt-1 break-all text-slate-500 dark:text-slate-400">
              {route.driver_location
                ? `${route.driver_location.lat.toFixed(5)}, ${route.driver_location.lng.toFixed(5)}`
                : "Sin ubicación reportada"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [expandedRouteId, setExpandedRouteId] = useState<number | null>(null);

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
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedRouteId((current) => (current === route.id ? null : route.id))}
                              className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e]"
                            >
                              {expandedRouteId === route.id ? "Ocultar" : "Monitoreo"}
                            </button>
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

                        {expandedRouteId === route.id ? <RouteMonitorCard route={route} /> : null}

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
