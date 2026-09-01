"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend, describeApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import { routeStopStatusLabel } from "@/lib/utils";
import {
  Card,
  KpiCard,
  StatusBadge,
  Badge,
  Button,
  Input,
  Select,
  EmptyState,
} from "@/components/ui";
import type {
  DailyRoute,
  DispatchBoardResponse,
  DispatchManifestResponse,
  DispatchProposalResponse,
  DispatchSizeCode,
  Driver,
  PaginatedResponse,
  RouteStop,
} from "@/lib/types";

const lanes: Array<{ key: DailyRoute["status"]; label: string }> = [
  { key: "planned", label: "Planificada" },
  { key: "active", label: "Activa" },
  { key: "completed", label: "Completada" },
];

const laneDescription: Record<DailyRoute["status"], string> = {
  planned: "Salidas listas para iniciar o ajustar.",
  active: "Rutas vivas para monitoreo y seguimiento.",
  completed: "Jornadas cerradas con trazabilidad operativa.",
};

type RoutableShipment = {
  id: number;
  display_code: string;
  recipient_name?: string | null;
  recipient_address?: string | null;
  recipient_zone?: string | null;
};

type GeoPoint = {
  lat: number;
  lng: number;
};

type MonitorPoint = {
  xPercent: number;
  yPercent: number;
  label: string;
  kind: "driver" | "stop";
  status?: string;
  order?: number;
  current?: boolean;
};

const hasStopCoordinates = (lat?: number | null, lng?: number | null) =>
  lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

type RouteHealth = {
  pendingStops: number;
  issueStops: number;
  missingGeoStops: number;
  missingGeoCodes: string[];
  hasLiveLocation: boolean;
  locationFreshness: "live" | "recent" | "stale" | "missing";
  hasStreetGeometry: boolean;
};

type AttentionLevel = "healthy" | "warning" | "critical";

type MonitorTimelineItem = {
  key: string;
  title: string;
  detail: string;
  tone: AttentionLevel | "info";
};

type FreshnessTone = "live" | "recent" | "stale" | "missing";

const ageLabel = (ageSeconds?: number | null) => {
  if (ageSeconds === null || ageSeconds === undefined) return "sin hora";
  if (ageSeconds < 60) return "hace menos de 1 min";
  if (ageSeconds < 3600) return `hace ${Math.floor(ageSeconds / 60)} min`;
  return `hace ${Math.floor(ageSeconds / 3600)} h`;
};

const absoluteDateTimeLabel = (value?: string | null) => {
  if (!value) return "sin registro";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "sin registro";

  return parsed.toLocaleString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
};

const stopTone = (status?: string, current?: boolean) => {
  if (current) return "#d1007f";
  if (status === "completed") return "#16a34a";
  if (status === "issue") return "#dc2626";
  return "#f59e0b";
};

function custodyPresentation(stop: RouteStop): {
  label: string;
  detail: string;
  className: string;
} {
  const custody = stop.shipment.custody;

  if (custody?.new_custodian_type === "driver") {
    return {
      label: "Con piloto",
      detail: custody.new_custodian_name || "Custodia entregada al piloto",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }

  if (custody?.new_custodian_type === "hub") {
    return {
      label: "En sede",
      detail: custody.new_custodian_name || "Recibido en sede principal",
      className: "bg-sky-50 text-sky-700 border-sky-200",
    };
  }

  return {
    label: "Custodia pendiente",
    detail: "Falta entregar el paquete al piloto en sede",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  };
}

function freshnessPresentation(route: DailyRoute): {
  label: string;
  detail: string;
  tone: FreshnessTone;
  badgeTone: "success" | "warning" | "danger" | "info" | "neutral";
} {
  const location = route.driver_location;

  if (!location) {
    return {
      label: "Sin señal GPS",
      detail: "El celular del piloto no ha enviado ninguna ubicacion hoy.",
      tone: "missing",
      badgeTone: "danger",
    };
  }

  if (location.age_seconds !== null && location.age_seconds < 300) {
    return {
      label: "Señal en vivo",
      detail: `GPS actualizado ${ageLabel(location.age_seconds)} (${absoluteDateTimeLabel(location.updated_at)}).`,
      tone: "live",
      badgeTone: "success",
    };
  }

  if (location.age_seconds !== null && location.age_seconds < 900) {
    return {
      label: "Señal reciente",
      detail: `Último ping ${ageLabel(location.age_seconds)} (${absoluteDateTimeLabel(location.updated_at)}).`,
      tone: "recent",
      badgeTone: "info",
    };
  }

  return {
    label: "Ubicación vencida",
    detail: `Ubicación estancada ${ageLabel(location.age_seconds)}. Verifica señal o batería del piloto.`,
    tone: "stale",
    badgeTone: "warning",
  };
}

function routeHealth(route: DailyRoute): RouteHealth {
  const pendingStops = route.stops.filter((stop) => stop.status === "pending").length;
  const issueStops = route.stops.filter((stop) => stop.status === "issue").length;

  const missingGeoCodes = route.stops
    .filter((stop) => !hasStopCoordinates(stop.shipment.recipient_lat, stop.shipment.recipient_lng))
    .map((stop) => stop.shipment.display_code);

  const missingGeoStops = missingGeoCodes.length;
  const hasLiveLocation = Boolean(route.driver_location);
  const locationFreshness = freshnessPresentation(route).tone;
  const hasStreetGeometry = Boolean(route.route_geometry?.overview_polyline);

  return {
    pendingStops,
    issueStops,
    missingGeoStops,
    missingGeoCodes,
    hasLiveLocation,
    locationFreshness,
    hasStreetGeometry,
  };
}

function routeHealthTone(health: RouteHealth): AttentionLevel {
  if (health.issueStops > 0 || health.locationFreshness === "missing" || health.missingGeoStops > 2) {
    return "critical";
  }

  if (health.locationFreshness === "stale" || health.missingGeoStops > 0 || !health.hasStreetGeometry) {
    return "warning";
  }

  return "healthy";
}

function buildMonitorMap(route: DailyRoute) {
  const stopPoints = route.stops
    .filter((stop) => hasStopCoordinates(stop.shipment.recipient_lat, stop.shipment.recipient_lng))
    .map((stop) => ({
      lat: Number(stop.shipment.recipient_lat),
      lng: Number(stop.shipment.recipient_lng),
      label: `${stop.sort_order}. ${stop.shipment.display_code}`,
      status: stop.status,
      order: stop.sort_order,
    }));

  const driverLat = route.driver_location ? Number(route.driver_location.lat) : null;
  const driverLng = route.driver_location ? Number(route.driver_location.lng) : null;
  const hasDriverPoint = driverLat !== null && driverLng !== null && Number.isFinite(driverLat) && Number.isFinite(driverLng);

  const allPoints: GeoPoint[] = [...stopPoints];
  if (hasDriverPoint) {
    allPoints.push({ lat: driverLat, lng: driverLng });
  }

  if (allPoints.length === 0) {
    return {
      embedUrl: null,
      openStreetMapUrl: null,
      overlayPoints: [] as MonitorPoint[],
      boundsText: "Sin coordenadas disponibles para proyectar el mapa.",
    };
  }

  const lats = allPoints.map((point) => point.lat);
  const lngs = allPoints.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latMargin = Math.max(0.005, (maxLat - minLat) * 0.25);
  const lngMargin = Math.max(0.008, (maxLng - minLng) * 0.25);

  const south = minLat - latMargin;
  const north = maxLat + latMargin;
  const west = minLng - lngMargin;
  const east = maxLng + lngMargin;

  const bbox = [west, south, east, north].map((val) => val.toFixed(6)).join(",");
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
  const openStreetMapUrl = `https://www.openstreetmap.org/#map=13/${((minLat + maxLat) / 2).toFixed(6)}/${((minLng + maxLng) / 2).toFixed(6)}`;

  const currentPendingStop = [...route.stops]
    .filter((stop) => stop.status !== "completed")
    .sort((a, b) => a.sort_order - b.sort_order)[0] ?? null;

  const latSpan = Math.max(0.00001, north - south);
  const lngSpan = Math.max(0.00001, east - west);

  const overlayPoints: MonitorPoint[] = [];

  if (hasDriverPoint) {
    const xPercent = Math.min(95, Math.max(5, ((driverLng - west) / lngSpan) * 100));
    const yPercent = Math.min(95, Math.max(5, ((north - driverLat) / latSpan) * 100));
    overlayPoints.push({
      xPercent,
      yPercent,
      label: `Piloto: ${route.driver?.name || "Asignado"}`,
      kind: "driver",
    });
  }

  stopPoints.forEach((stop) => {
    const xPercent = Math.min(95, Math.max(5, ((stop.lng - west) / lngSpan) * 100));
    const yPercent = Math.min(95, Math.max(5, ((north - stop.lat) / latSpan) * 100));
    overlayPoints.push({
      xPercent,
      yPercent,
      label: stop.label,
      kind: "stop",
      status: stop.status,
      order: stop.order,
      current: currentPendingStop?.sort_order === stop.order,
    });
  });

  return {
    embedUrl,
    openStreetMapUrl,
    overlayPoints,
    boundsText: `Ventana de monitoreo: ${allPoints.length} punto(s) proyectado(s).`,
  };
}

function RouteMonitorCard({ route, className = "" }: { route: DailyRoute; className?: string }) {
  const health = routeHealth(route);
  const overallTone = routeHealthTone(health);
  const freshnessUi = freshnessPresentation(route);
  const mapData = buildMonitorMap(route);

  const orderedStops = [...route.stops].sort((left, right) => left.sort_order - right.sort_order);

  const currentStopIndex = orderedStops.findIndex((stop) => stop.status !== "completed");
  const currentStop = currentStopIndex >= 0 ? orderedStops[currentStopIndex] : null;
  const nextStop = currentStopIndex >= 0 && currentStopIndex + 1 < orderedStops.length ? orderedStops[currentStopIndex + 1] : null;

  const timelineItems: MonitorTimelineItem[] = [];

  if (health.issueStops > 0) {
    timelineItems.push({
      key: "issues",
      title: `${health.issueStops} novedad(es) reportadas`,
      detail: "Revisa la parada afectada antes de autorizar el cierre de jornada.",
      tone: "critical",
    });
  }

  if (freshnessUi.tone === "missing") {
    timelineItems.push({
      key: "gps-missing",
      title: "Sin señal de GPS del celular",
      detail: "La app del repartidor no ha transmitido coordenadas en esta ruta.",
      tone: "critical",
    });
  } else if (freshnessUi.tone === "stale") {
    timelineItems.push({
      key: "gps-stale",
      title: "Ubicación del piloto desactualizada",
      detail: freshnessUi.detail,
      tone: "warning",
    });
  } else {
    timelineItems.push({
      key: "gps-live",
      title: freshnessUi.label,
      detail: freshnessUi.detail,
      tone: "info",
    });
  }

  if (health.missingGeoStops > 0) {
    timelineItems.push({
      key: "missing-geo",
      title: `${health.missingGeoStops} dirección(es) sin geocodificar`,
      detail: `Guías sin coordenadas exactas: ${health.missingGeoCodes.slice(0, 3).join(", ")}${health.missingGeoCodes.length > 3 ? "..." : ""}`,
      tone: health.missingGeoStops > 2 ? "critical" : "warning",
    });
  }

  if (!health.hasStreetGeometry && health.pendingStops > 0) {
    timelineItems.push({
      key: "approx-path",
      title: "Trazo por lÍnea recta",
      detail: "No se generó trazado de calles. El monitor estima distancias directo punto a punto.",
      tone: "warning",
    });
  }

  return (
    <Card className={`space-y-4 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-bold text-ink">
              Ruta #{route.id} • {route.driver?.name || "Sin piloto"}
            </h3>
            <StatusBadge status={route.status} label={route.status === "active" ? "En curso" : route.status === "planned" ? "Planificada" : "Completada"} />
            <Badge tone={freshnessUi.badgeTone}>{freshnessUi.label}</Badge>
          </div>
          <p className="mt-1 text-xs text-ink-secondary">
            {route.zone || "Sin zona"} • {route.route_date} • {route.completed_stops}/{route.total_stops} paradas completadas ({Math.round(route.progress)}%)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {overallTone === "critical" ? (
            <Badge tone="danger">Atención crítica</Badge>
          ) : overallTone === "warning" ? (
            <Badge tone="warning">Advertencia operativa</Badge>
          ) : (
            <Badge tone="success">Operación estable</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-edge bg-bg-secondary/40 p-3">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-secondary">Parada actual</span>
          <p className="mt-1 font-display text-sm font-bold text-ink">
            {currentStop ? `${currentStop.shipment.display_code} · ${currentStop.shipment.recipient_name || "Sin destinatario"}` : "Sin paradas pendientes"}
          </p>
          <p className="mt-0.5 text-xs text-ink-secondary">{currentStop?.shipment.recipient_address || "--"}</p>
        </div>

        <div className="rounded-card border border-edge bg-bg-secondary/40 p-3">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-secondary">Siguiente parada</span>
          <p className="mt-1 font-display text-sm font-bold text-ink">
            {nextStop ? `${nextStop.shipment.display_code} · ${nextStop.shipment.recipient_name || "Sin destinatario"}` : "Última parada en curso"}
          </p>
          <p className="mt-0.5 text-xs text-ink-secondary">{nextStop?.shipment.recipient_address || "--"}</p>
        </div>

        <div className="rounded-card border border-edge bg-bg-secondary/40 p-3">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-secondary">Última señal GPS</span>
          <p className="mt-1 font-display text-sm font-bold text-ink">
            {route.driver_location ? ageLabel(route.driver_location.age_seconds) : "Sin señal"}
          </p>
          <p className="mt-0.5 text-xs text-ink-secondary">{absoluteDateTimeLabel(route.driver_location?.updated_at)}</p>
        </div>
      </div>

      {/* Embedded OpenStreetMap Preview */}
      <div className="relative overflow-hidden rounded-card border border-edge">
        <div className="flex items-center justify-between border-b border-edge bg-bg-secondary/60 px-3 py-2 text-xs">
          <span className="font-semibold text-ink">{mapData.boundsText}</span>
          {mapData.openStreetMapUrl ? (
            <a href={mapData.openStreetMapUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
              Abrir mapa interactivo ↗
            </a>
          ) : null}
        </div>
        <div className="relative h-64 w-full bg-slate-100">
          {mapData.embedUrl ? (
            <iframe
              src={mapData.embedUrl}
              title={`Mapa de monitoreo ruta ${route.id}`}
              className="h-full w-full border-0"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-ink-secondary">
              No hay coordenadas disponibles para proyectar la ruta.
            </div>
          )}

          {/* SVG Polyline Overlay for stops */}
          {mapData.overlayPoints.length > 1 ? (
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <polyline
                fill="none"
                stroke="#d1007f"
                strokeWidth="2.5"
                strokeDasharray="4,4"
                points={mapData.overlayPoints.map((p) => `${p.xPercent}%,${p.yPercent}%`).join(" ")}
              />
            </svg>
          ) : null}

          {/* Map Overlay Markers */}
          {mapData.overlayPoints.map((pt, idx) => (
            <div
              key={idx}
              style={{ left: `${pt.xPercent}%`, top: `${pt.yPercent}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 transform"
            >
              {pt.kind === "driver" ? (
                <div className="flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
                  <span className="h-2 w-2 animate-ping rounded-full bg-white" />
                  <span>{pt.label}</span>
                </div>
              ) : (
                <div
                  style={{ backgroundColor: stopTone(pt.status, pt.current) }}
                  className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white shadow-md ${
                    pt.current ? "ring-4 ring-brand/30" : ""
                  }`}
                  title={pt.label}
                >
                  {pt.order}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline Warnings & Operational Notes */}
      {timelineItems.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-secondary">Diagnóstico de la ruta</p>
          <div className="space-y-1.5">
            {timelineItems.map((item) => (
              <div
                key={item.key}
                className={`flex items-start gap-2.5 rounded-card border p-2.5 text-xs ${
                  item.tone === "critical"
                    ? "border-danger/30 bg-danger-soft text-danger"
                    : item.tone === "warning"
                      ? "border-warning/30 bg-amber-50 text-amber-900"
                      : "border-edge bg-bg-secondary/40 text-ink"
                }`}
              >
                <span className="mt-0.5 font-bold">•</span>
                <div>
                  <strong className="font-semibold">{item.title}: </strong>
                  <span>{item.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export default function RutasPage() {
  usePageTitle("Rutas diarias | Danhei Express");

  const { showToast } = useToast();
  const [routes, setRoutes] = useState<DailyRoute[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [routableShipments, setRoutableShipments] = useState<RoutableShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [driverFilter, setDriverFilter] = useState("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedZone, setSelectedZone] = useState("");
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<number[]>([]);

  const [manifestModalOpen, setManifestModalOpen] = useState(false);
  const [manifestRouteId, setManifestRouteId] = useState<number | null>(null);
  const [manifest, setManifest] = useState<DispatchManifestResponse | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState("");

  const [dispatchBoard, setDispatchBoard] = useState<DispatchBoardResponse | null>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchSizeFilter, setDispatchSizeFilter] = useState<DispatchSizeCode | "all">("all");
  const [dispatchZoneFilter, setDispatchZoneFilter] = useState("");
  const [dispatchSelectedShipmentIds, setDispatchSelectedShipmentIds] = useState<number[]>([]);
  const [dispatchSelectedDriverIds, setDispatchSelectedDriverIds] = useState<number[]>([]);
  const [dispatchMaxPackagesPerDriver, setDispatchMaxPackagesPerDriver] = useState("");
  const [dispatchProposal, setDispatchProposal] = useState<DispatchProposalResponse | null>(null);
  const [dispatchProposalLoading, setDispatchProposalLoading] = useState(false);
  const [dispatchProposalError, setDispatchProposalError] = useState("");

  const [dragStop, setDragStop] = useState<{ routeId: number; stopId: number } | null>(null);
  const [focusedActiveRouteId, setFocusedActiveRouteId] = useState<number | null>(null);
  const [expandedRouteId, setExpandedRouteId] = useState<number | null>(null);

  const loadDispatchBoard = useCallback(async () => {
    setDispatchLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (dispatchSizeFilter !== "all") params.set("size_code", dispatchSizeFilter);
      if (dispatchZoneFilter.trim()) params.set("zone", dispatchZoneFilter.trim());
      const response = await apiGet<DispatchBoardResponse>(`/routes/dispatch-board?${params.toString()}`);
      setDispatchBoard(response);
    } catch (error) {
      showToast(describeApiError(error, "No fue posible cargar el tablero de custodia.").message, "error");
    } finally {
      setDispatchLoading(false);
    }
  }, [dispatchSizeFilter, dispatchZoneFilter, showToast]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [routesRes, driversRes] = await Promise.all([
        apiGet<DailyRoute[]>("/routes"),
        apiGet<PaginatedResponse<Driver> | Driver[]>("/drivers"),
      ]);
      setRoutes(routesRes || []);
      setDrivers(Array.isArray(driversRes) ? driversRes : driversRes.data || []);
    } catch {
      showToast("No se pudieron cargar rutas y pilotos.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
    void loadDispatchBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDispatchBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchSizeFilter, dispatchZoneFilter]);

  useEffect(() => {
    const activeRouteIds = routes.filter((r) => r.status === "active").map((r) => r.id);

    if (activeRouteIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusedActiveRouteId(null);
      return;
    }

    if (focusedActiveRouteId === null || !activeRouteIds.includes(focusedActiveRouteId)) {
      setFocusedActiveRouteId(activeRouteIds[0]);
    }
  }, [focusedActiveRouteId, routes]);

  const activeRoutes = useMemo(() => routes.filter((r) => r.status === "active"), [routes]);

  const routeHealthById = useMemo(() => {
    const map = new Map<number, RouteHealth>();
    routes.forEach((route) => map.set(route.id, routeHealth(route)));
    return map;
  }, [routes]);

  const routeHealthSummary = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let healthy = 0;
    let noSignal = 0;
    let staleLocation = 0;
    let recentLocation = 0;
    let degradedGeo = 0;

    activeRoutes.forEach((route) => {
      const health = routeHealthById.get(route.id) ?? routeHealth(route);
      const tone = routeHealthTone(health);

      if (tone === "critical") critical += 1;
      else if (tone === "warning") warning += 1;
      else healthy += 1;

      if (health.locationFreshness === "missing") noSignal += 1;
      else if (health.locationFreshness === "stale") staleLocation += 1;
      else recentLocation += 1;

      if (health.missingGeoStops > 0 || !health.hasStreetGeometry) degradedGeo += 1;
    });

    return {
      total: activeRoutes.length,
      critical,
      warning,
      healthy,
      noSignal,
      staleLocation,
      recentLocation,
      degradedGeo,
    };
  }, [activeRoutes, routeHealthById]);

  const focusedActiveRoute = useMemo(() => {
    if (focusedActiveRouteId === null) return activeRoutes[0] ?? null;
    return activeRoutes.find((r) => r.id === focusedActiveRouteId) ?? activeRoutes[0] ?? null;
  }, [activeRoutes, focusedActiveRouteId]);

  const requestDispatchProposal = async () => {
    if (dispatchSelectedDriverIds.length === 0) {
      setDispatchProposalError("Selecciona al menos un piloto disponible para simular la propuesta.");
      return;
    }

    setDispatchProposalLoading(true);
    setDispatchProposalError("");

    try {
      const parsedMax = dispatchMaxPackagesPerDriver ? Number(dispatchMaxPackagesPerDriver) : null;
      const payload = {
        driver_ids: dispatchSelectedDriverIds,
        zone: dispatchZoneFilter.trim() || null,
        size_code: dispatchSizeFilter !== "all" ? dispatchSizeFilter : null,
        max_packages_per_driver: Number.isFinite(parsedMax) && parsedMax! > 0 ? parsedMax : null,
        shipment_ids: dispatchSelectedShipmentIds.length > 0 ? dispatchSelectedShipmentIds : null,
      };

      const response = await apiSend<DispatchProposalResponse>("/routes/dispatch-proposals/preview", "POST", payload);
      setDispatchProposal(response);
    } catch (error) {
      setDispatchProposalError(describeApiError(error, "No fue posible calcular la propuesta de despacho.").message);
    } finally {
      setDispatchProposalLoading(false);
    }
  };

  const toggleDispatchShipment = (id: number) => {
    setDispatchSelectedShipmentIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const toggleDispatchDriver = (id: number) => {
    setDispatchSelectedDriverIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const openManifest = async (routeId: number) => {
    setManifestRouteId(routeId);
    setManifestModalOpen(true);
    setManifestLoading(true);
    setManifestError("");
    setManifest(null);
    try {
      const response = await apiGet<DispatchManifestResponse>(`/routes/${routeId}/manifest`);
      setManifest(response);
    } catch (error) {
      setManifestError(describeApiError(error, "No se pudo cargar el manifiesto de la ruta.").message);
    } finally {
      setManifestLoading(false);
    }
  };

  const filteredRoutes = useMemo(() => {
    if (driverFilter === "all") return routes;
    return routes.filter((route) => String(route.driver?.id) === driverFilter);
  }, [routes, driverFilter]);

  const grouped = useMemo(() => {
    const acc: Record<DailyRoute["status"], DailyRoute[]> = {
      planned: [],
      active: [],
      completed: [],
    };
    filteredRoutes.forEach((route) => {
      acc[route.status]?.push(route);
    });
    return acc;
  }, [filteredRoutes]);

  const startRoute = async (id: number) => {
    try {
      await apiSend(`/routes/${id}/start`, "POST", {});
      showToast("Ruta iniciada correctamente", "success");
      await loadData();
    } catch (error) {
      showToast(describeApiError(error, "No se pudo iniciar la ruta").message, "error");
    }
  };

  const openCreateRoute = async () => {
    setSelectedDriverId("");
    setSelectedZone("");
    setSelectedShipmentIds([]);
    setCreateModalOpen(true);
    try {
      const res = await apiGet<PaginatedResponse<RoutableShipment> | RoutableShipment[]>("/routes/routable-shipments");
      const list = Array.isArray(res) ? res : res.data || [];
      setRoutableShipments(list);
    } catch {
      setRoutableShipments([]);
      showToast("No se pudieron cargar los envíos elegibles.", "error");
    }
  };

  const filteredRoutableShipments = useMemo(() => {
    return routableShipments.filter((item) => {
      if (!selectedZone) return true;
      return (item.recipient_zone || "").toLowerCase().includes(selectedZone.toLowerCase());
    });
  }, [routableShipments, selectedZone]);

  const createRoute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDriverId) {
      showToast("Selecciona un piloto.", "error");
      return;
    }
    if (selectedShipmentIds.length === 0) {
      showToast("Selecciona al menos un envío.", "error");
      return;
    }
    try {
      await apiSend("/routes", "POST", {
        driver_id: Number(selectedDriverId),
        zone: selectedZone || null,
        shipment_ids: selectedShipmentIds,
      });
      showToast("Ruta creada con éxito.", "success");
      setCreateModalOpen(false);
      await loadData();
    } catch {
      showToast("No se pudo crear la ruta.", "error");
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

  const handoverStopToDriver = async (routeId: number, stopId: number) => {
    try {
      await apiSend(`/routes/${routeId}/stops/${stopId}/handover`, "POST", {
        notes: "Traspaso confirmado desde pantalla de rutas",
      });
      showToast("Custodia del paquete transferida al piloto.", "success");
      await loadData();
    } catch (error) {
      showToast(describeApiError(error, "No fue posible transferir la custodia del paquete.").message, "error");
    }
  };

  const reorderStops = async (routeId: number, targetStopId: number) => {
    if (!dragStop || dragStop.routeId !== routeId || dragStop.stopId === targetStopId) return;

    const routeToUpdate = routes.find((r) => r.id === routeId);
    if (!routeToUpdate) return;

    const stops = [...routeToUpdate.stops].sort((a, b) => a.sort_order - b.sort_order);
    const fromIndex = stops.findIndex((s) => s.id === dragStop.stopId);
    const toIndex = stops.findIndex((s) => s.id === targetStopId);

    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = stops.splice(fromIndex, 1);
    stops.splice(toIndex, 0, moved);

    const stopIds = stops.map((s) => s.id);

    try {
      await apiSend(`/routes/${routeId}/reorder`, "PUT", { stop_ids: stopIds });
      showToast("Paradas reordenadas", "success");
      await loadData();
    } catch {
      showToast("No se pudo reordenar", "error");
    } finally {
      setDragStop(null);
    }
  };

  const renderHandoverControls = (route: DailyRoute, stop: RouteStop) => {
    const custodyUi = custodyPresentation(stop);

    return (
      <div className="mt-2 space-y-1.5 border-t border-edge pt-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
          <span className={`inline-flex rounded-full px-2 py-0.5 font-bold ${custodyUi.className}`}>
            {custodyUi.label}
          </span>
          <span className="truncate text-ink-secondary" title={custodyUi.detail}>
            {custodyUi.detail}
          </span>
        </div>

        {stop.shipment.custody?.new_custodian_type !== "driver" && stop.status !== "completed" ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handoverStopToDriver(route.id, stop.id)}
            className="w-full text-xs"
          >
            Entregar paquete al piloto
          </Button>
        ) : null}
      </div>
    );
  };

  const openLiveMonitor = (routeId: number) => {
    setFocusedActiveRouteId(routeId);
    const monitorSection = document.getElementById("route-live-monitor");
    if (monitorSection) {
      monitorSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const toggleRouteDetails = (route: DailyRoute) => {
    if (route.status === "active") {
      openLiveMonitor(route.id);
      return;
    }

    setExpandedRouteId((current) => (current === route.id ? null : route.id));
  };

  const totalPlanned = grouped.planned.length;
  const totalActive = grouped.active.length;
  const totalCompleted = grouped.completed.length;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header Bar */}
      <Card flush className="p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Rutas diarias</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Monitorea el avance operativo, asignaciones de custodia y trazado GPS en vivo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Select
              value={driverFilter}
              onChange={(event) => setDriverFilter(event.target.value)}
              className="w-full sm:w-48"
            >
              <option value="all">Todos los pilotos</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={() => void loadData()}>
              Refrescar
            </Button>
            <Button variant="primary" onClick={() => void openCreateRoute()}>
              Nueva ruta
            </Button>
          </div>
        </div>
      </Card>

      {/* KPI Cards Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Rutas Hoy" value={routes.length} support="Jornadas registradas" tone="brand" />
        <KpiCard label="Rutas Activas" value={totalActive} support="En ruta activa con piloto" tone="info" />
        <KpiCard label="Planificadas" value={totalPlanned} support="Listas para salir" tone="warning" />
        <KpiCard label="Completadas" value={totalCompleted} support="Entregas cerradas" tone="success" />
      </div>

      {/* Dispatch Board (Tablero de Custodia de Sede) */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Custodia de sede y despacho</h2>
            <p className="text-xs text-ink-secondary">
              Paquetes recibidos en bodega disponibles para armar salidas o calcular propuestas inteligentes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={dispatchSizeFilter}
              onChange={(e) => setDispatchSizeFilter(e.target.value as DispatchSizeCode | "all")}
              className="w-full sm:w-40"
            >
              <option value="all">Todos los tamaños</option>
              <option value="small">Pequeños (S)</option>
              <option value="medium">Medianos (M)</option>
              <option value="large">Grandes (L)</option>
              <option value="unspecified">Sin definir</option>
            </Select>
            <Input
              placeholder="Filtrar por zona..."
              value={dispatchZoneFilter}
              onChange={(e) => setDispatchZoneFilter(e.target.value)}
              className="w-full sm:w-40"
            />
            <Button variant="ghost" size="sm" onClick={() => void loadDispatchBoard()} disabled={dispatchLoading}>
              {dispatchLoading ? "Cargando..." : "Actualizar bodega"}
            </Button>
          </div>
        </div>

        {dispatchBoard ? (
          <Card className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-5">
              <div className="rounded-card border border-edge bg-bg-secondary/40 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary">Disponibles</span>
                <p className="mt-1 font-display text-2xl font-bold text-ink">{dispatchBoard.summary.total}</p>
              </div>
              <div className="rounded-card border border-info/30 bg-info/5 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal">Pequeños</span>
                <p className="mt-1 font-display text-2xl font-bold text-teal">{dispatchBoard.summary.by_size.small}</p>
              </div>
              <div className="rounded-card border border-brand/30 bg-brand-soft/30 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand">Medianos</span>
                <p className="mt-1 font-display text-2xl font-bold text-brand">{dispatchBoard.summary.by_size.medium}</p>
              </div>
              <div className="rounded-card border border-edge bg-bg-secondary/40 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink">Grandes</span>
                <p className="mt-1 font-display text-2xl font-bold text-ink">{dispatchBoard.summary.by_size.large}</p>
              </div>
              <div className="rounded-card border border-amber-200 bg-amber-50 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Frágiles / sin geo</span>
                <p className="mt-1 font-display text-xl font-bold text-amber-900">
                  {dispatchBoard.summary.fragile} / {dispatchBoard.summary.missing_coordinates}
                </p>
              </div>
            </div>

            {dispatchBoard.groups.length === 0 ? (
              <EmptyState title="No hay paquetes en custodia de sede con estos filtros." />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {dispatchBoard.groups.map((group) => (
                  <details key={`${group.zone ?? "none"}-${group.city ?? "none"}`} className="group rounded-card border border-edge p-3">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-display text-sm font-bold text-ink">
                            {group.zone || "Sin zona"} · {group.city || "Sin ciudad"}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-secondary">
                            {group.total} paquetes · {group.fragile_count} frágiles · {group.by_size.small} P / {group.by_size.medium} M / {group.by_size.large} G
                          </p>
                        </div>
                        <Badge tone="brand">Ver paquetes</Badge>
                      </div>
                    </summary>
                    <div className="mt-3 space-y-2 border-t border-edge pt-3">
                      {group.items.map((shipment) => (
                        <div key={shipment.id} className="rounded-card border border-edge bg-bg-secondary/30 p-2.5 text-xs">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2">
                              <input
                                type="checkbox"
                                checked={dispatchSelectedShipmentIds.includes(shipment.id)}
                                onChange={() => toggleDispatchShipment(shipment.id)}
                                aria-label={`Seleccionar ${shipment.display_code}`}
                                className="mt-0.5 h-4 w-4 rounded border-edge text-brand focus:ring-brand"
                              />
                              <div>
                                <p className="font-display font-bold text-ink">{shipment.display_code}</p>
                                <p className="text-ink-secondary">{shipment.recipient_name} · {shipment.recipient_address}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <Badge tone="neutral">{shipment.size_label}</Badge>
                              {shipment.is_fragile ? <Badge tone="warning">Frágil</Badge> : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}

            {/* Proposal Calculator */}
            <div className="rounded-card border border-brand/30 bg-brand-soft/20 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-display text-sm font-bold text-ink">Proponer despacho inteligente</h3>
                  <p className="mt-0.5 text-xs text-ink-secondary">
                    Selecciona paquetes y pilotos. La propuesta es referencial y no modifica asignaciones automáticamente.
                  </p>
                </div>
                <Badge tone="neutral">Solo lectura</Badge>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_160px_auto] lg:items-end">
                <fieldset className="rounded-card border border-edge bg-surface p-3">
                  <legend className="px-1 text-xs font-bold text-ink">Pilotos disponibles</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {drivers.filter((driver) => driver.status === "active" || driver.status === "route").map((driver) => (
                      <label key={driver.id} className="flex items-center gap-2 text-xs text-ink">
                        <input
                          type="checkbox"
                          checked={dispatchSelectedDriverIds.includes(driver.id)}
                          onChange={() => toggleDispatchDriver(driver.id)}
                          aria-label={`Seleccionar piloto ${driver.name}`}
                          className="h-4 w-4 rounded border-edge text-brand focus:ring-brand"
                        />
                        <span className="truncate">{driver.name}</span>
                        <span className="text-[10px] text-ink-secondary">({driver.zone || "sin zona"})</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="rounded-card border border-edge bg-surface p-3">
                  <p className="text-xs font-bold text-ink">Carga seleccionada</p>
                  <p className="mt-1 font-display text-sm font-bold text-ink">
                    {dispatchSelectedShipmentIds.length} paquete(s)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDispatchSelectedShipmentIds(dispatchBoard.shipments.map((s) => s.id))}
                    >
                      Seleccionar todos
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDispatchSelectedShipmentIds([])}>
                      Limpiar
                    </Button>
                  </div>
                </div>

                <Input
                  type="number"
                  label="Máx. por piloto"
                  placeholder="Ej: 15"
                  value={dispatchMaxPackagesPerDriver}
                  onChange={(e) => setDispatchMaxPackagesPerDriver(e.target.value)}
                />

                <Button
                  variant="primary"
                  onClick={() => void requestDispatchProposal()}
                  disabled={dispatchProposalLoading}
                >
                  {dispatchProposalLoading ? "Calculando..." : "Calcular propuesta"}
                </Button>
              </div>

              {dispatchProposalError ? (
                <p className="mt-3 rounded-card bg-danger-soft p-3 text-xs text-danger">{dispatchProposalError}</p>
              ) : null}

              {dispatchProposal ? (
                <div className="mt-4 space-y-3 border-t border-edge pt-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-card border border-edge bg-surface p-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary">Candidatos</span>
                      <p className="font-display text-lg font-bold text-ink">{dispatchProposal.totals.candidates}</p>
                    </div>
                    <div className="rounded-card border border-emerald-200 bg-emerald-50 p-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Propuestos</span>
                      <p className="font-display text-lg font-bold text-emerald-900">{dispatchProposal.totals.assigned}</p>
                    </div>
                    <div className="rounded-card border border-amber-200 bg-amber-50 p-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Sin asignar</span>
                      <p className="font-display text-lg font-bold text-amber-900">{dispatchProposal.totals.unassigned}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-2">
                    {dispatchProposal.proposals.map((prop) => (
                      <Card key={prop.driver.id} className="space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-display text-sm font-bold text-ink">{prop.driver.name}</p>
                            <p className="text-xs text-ink-secondary">
                              {prop.driver.vehicle || "Vehículo sin definir"} · {prop.driver.zone || "sin zona"}
                            </p>
                          </div>
                          <Badge tone="neutral">
                            {prop.assigned_count}/{prop.capacity.available_before_proposal} paquetes
                          </Badge>
                        </div>
                        <ol className="mt-2 space-y-1 text-xs text-ink">
                          {prop.shipments.map((shipment) => (
                            <li key={shipment.id} className="flex gap-2 rounded-card bg-bg-secondary/40 p-2">
                              <span className="font-bold text-brand">{shipment.sequence}.</span>
                              <span className="min-w-0 truncate">{shipment.display_code} · {shipment.recipient_name || "Sin destinatario"}</span>
                            </li>
                          ))}
                        </ol>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}
      </section>

      {/* Live Monitor Section */}
      {!loading && activeRoutes.length > 0 ? (
        <section id="route-live-monitor" className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-ink">Centro de monitoreo activo</h2>
              <p className="text-xs text-ink-secondary">
                Seguimiento operativo del piloto, su ubicación reportada y la siguiente secuencia de entrega.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="info">{activeRoutes.length} rutas activas</Badge>
              <Badge tone="danger">{routeHealthSummary.critical} críticas</Badge>
              <Badge tone="warning">{routeHealthSummary.warning} en atención</Badge>
              <Badge tone="success">{routeHealthSummary.healthy} estables</Badge>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="order-1 space-y-3">
              <Card className="space-y-3 p-3">
                <p className="font-display text-sm font-bold text-ink">Pilotos en monitoreo</p>
                <div className="space-y-2">
                  {activeRoutes.map((route) => {
                    const health = routeHealthById.get(route.id) ?? routeHealth(route);
                    const freshnessUi = freshnessPresentation(route);
                    const isFocused = focusedActiveRoute?.id === route.id;

                    return (
                      <button
                        key={route.id}
                        type="button"
                        onClick={() => openLiveMonitor(route.id)}
                        className={`w-full rounded-card border p-3 text-left transition-colors duration-150 ${
                          isFocused ? "border-brand bg-brand-soft/30 shadow-soft" : "border-edge hover:border-brand/40 bg-surface"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-display text-sm font-bold text-ink">{route.driver?.name || `Ruta #${route.id}`}</p>
                            <p className="text-xs text-ink-secondary">Ruta #{route.id} • {route.zone || "Sin zona"}</p>
                          </div>
                          <Badge tone={freshnessUi.badgeTone}>{freshnessUi.label}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                          <Badge tone="neutral">{health.pendingStops} pendientes</Badge>
                          {health.issueStops > 0 ? <Badge tone="danger">{health.issueStops} novedades</Badge> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>
            </aside>

            <div className="order-2">
              {focusedActiveRoute ? (
                <RouteMonitorCard route={focusedActiveRoute} />
              ) : (
                <EmptyState title="No hay una ruta activa lista para monitorear." />
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* Main Swimlanes (Status Board) */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-72 w-full rounded-card" />
          ))}
        </div>
      ) : (
        <section className="space-y-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Tablero de estados</h2>
            <p className="text-xs text-ink-secondary">
              Vista operativa por columnas para escritorio y móvil, priorizando lectura rápida y reordenamiento.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {lanes.map((lane) => (
              <Card key={lane.key} className="space-y-3">
                <div className="flex items-start justify-between gap-3 border-b border-edge pb-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-ink">{lane.label}</h3>
                    <p className="mt-0.5 text-xs text-ink-secondary">{laneDescription[lane.key]}</p>
                  </div>
                  <Badge tone="neutral">{grouped[lane.key].length}</Badge>
                </div>

                <div className="space-y-3">
                  {grouped[lane.key].map((route) => {
                    const orderedStops = [...route.stops].sort((a, b) => a.sort_order - b.sort_order);
                    const mobileStopPreview = orderedStops.slice(0, 2);
                    const pilotCustodyStops = orderedStops.filter(
                      (stop) => stop.shipment.custody?.new_custodian_type === "driver"
                    ).length;
                    const pendingCustodyStops = orderedStops.length - pilotCustodyStops;
                    const health = routeHealthById.get(route.id) ?? routeHealth(route);

                    return (
                      <Card key={route.id} className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-display text-base font-bold text-ink">Ruta #{route.id}</p>
                            <p className="text-xs text-ink-secondary">
                              {route.driver?.name || "Sin piloto"} • {route.zone || "Sin zona"}
                            </p>
                          </div>
                          <div className="hidden sm:flex sm:items-center sm:gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleRouteDetails(route)}
                            >
                              {route.status === "active" ? "Monitor" : expandedRouteId === route.id ? "Ocultar" : "Detalles"}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void openManifest(route.id)}
                            >
                              Manifiesto
                            </Button>
                            {route.status === "planned" ? (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                  if (pendingCustodyStops > 0) {
                                    void openManifest(route.id);
                                    return;
                                  }
                                  void startRoute(route.id);
                                }}
                              >
                                {pendingCustodyStops > 0 ? "Revisar custodia" : "Iniciar"}
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-ink-secondary">
                            <span>Progreso</span>
                            <span className="font-semibold text-ink">{route.completed_stops}/{route.total_stops}</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-secondary">
                            <div
                              className="h-full rounded-full bg-brand transition-all duration-300"
                              style={{ width: `${Math.min(100, Math.max(0, route.progress))}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          <Badge tone="success">{pilotCustodyStops}/{orderedStops.length} con piloto</Badge>
                          {pendingCustodyStops > 0 ? <Badge tone="warning">{pendingCustodyStops} custodia pendiente</Badge> : null}
                          {health.missingGeoStops > 0 ? <Badge tone="warning">{health.missingGeoStops} sin geo</Badge> : null}
                        </div>

                        {/* Mobile Actions */}
                        <div className="grid gap-2 sm:hidden">
                          <Button variant="secondary" onClick={() => toggleRouteDetails(route)}>
                            {route.status === "active" ? "Monitor" : "Ver detalles"}
                          </Button>
                          <Button variant="ghost" onClick={() => void openManifest(route.id)}>
                            Manifiesto
                          </Button>
                          {route.status === "planned" ? (
                            <Button
                              variant="primary"
                              onClick={() => {
                                if (pendingCustodyStops > 0) {
                                  void openManifest(route.id);
                                  return;
                                }
                                void startRoute(route.id);
                              }}
                            >
                              {pendingCustodyStops > 0 ? "Revisar custodia" : "Iniciar ruta"}
                            </Button>
                          ) : null}
                        </div>

                        {expandedRouteId === route.id && route.status !== "active" ? <RouteMonitorCard route={route} /> : null}

                        {/* Mobile Stop Preview */}
                        <div className="space-y-2 md:hidden">
                          {mobileStopPreview.map((stop) => (
                            <div key={`mobile-${stop.id}`} className="rounded-card border border-edge p-2.5 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-display font-bold text-ink">{stop.shipment.display_code}</p>
                                  <p className="text-ink-secondary">{stop.shipment.recipient_name || "Sin destinatario"}</p>
                                </div>
                                <StatusBadge status={stop.status} label={routeStopStatusLabel(stop.status)} />
                              </div>
                              {renderHandoverControls(route, stop)}
                            </div>
                          ))}
                        </div>

                        {/* Desktop Drag & Drop Stops List */}
                        <div className="hidden space-y-2 md:block">
                          {orderedStops.map((stop) => (
                            <div
                              key={stop.id}
                              draggable
                              onDragStart={() => setDragStop({ routeId: route.id, stopId: stop.id })}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => void reorderStops(route.id, stop.id)}
                              className="cursor-grab rounded-card border border-edge p-2.5 text-xs transition-colors duration-150 hover:border-brand/50 bg-surface"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-display font-bold text-ink">{stop.shipment.display_code}</p>
                                  <p className="text-ink-secondary">{stop.shipment.recipient_name || "Sin destinatario"}</p>
                                </div>
                                <StatusBadge status={stop.status} label={routeStopStatusLabel(stop.status)} />
                              </div>
                              <p className="mt-1 text-ink-secondary">{stop.shipment.recipient_address || "Sin dirección"}</p>
                              {renderHandoverControls(route, stop)}
                              {stop.status !== "completed" ? (
                                <div className="mt-2 flex justify-end">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => void completeStop(route.id, stop.id)}
                                  >
                                    Completar
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </Card>
                    );
                  })}
                  {grouped[lane.key].length === 0 ? <EmptyState title="Sin rutas" /> : null}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Manifest Modal */}
      {manifestModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-xs transition-opacity sm:items-center sm:p-4">
          <Card className="mobile-modal-safe-area h-[100dvh] w-full overflow-y-auto rounded-none bg-surface p-6 shadow-xl sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-card">
            {manifestLoading ? (
              <div className="space-y-4 p-8 text-center">
                <Skeleton className="mx-auto h-8 w-48 rounded-card" />
                <Skeleton className="mx-auto h-28 w-full rounded-card" />
                <p className="text-xs text-ink-secondary">Cargando manifiesto de despacho de ruta #{manifestRouteId}...</p>
              </div>
            ) : manifestError ? (
              <div className="space-y-4 p-6 text-center">
                <h3 className="font-display text-lg font-bold text-danger">Error al cargar el manifiesto</h3>
                <p className="text-xs text-ink-secondary">{manifestError}</p>
                <div className="flex justify-center gap-2">
                  <Button variant="secondary" onClick={() => manifestRouteId && void openManifest(manifestRouteId)}>
                    Reintentar
                  </Button>
                  <Button variant="ghost" onClick={() => setManifestModalOpen(false)}>
                    Cerrar
                  </Button>
                </div>
              </div>
            ) : manifest ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-edge pb-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-brand">Manifiesto de despacho</p>
                    <h2 className="font-display text-2xl font-bold text-ink">{manifest.manifest_code}</h2>
                    <p className="mt-1 text-xs text-ink-secondary">
                      Ruta #{manifest.route.id} · {manifest.route.driver?.name || "Sin piloto"} · {manifest.route.zone || "Sin zona"} · {manifest.route.date}
                    </p>
                  </div>
                  <div className="flex gap-2 print:hidden">
                    <Button variant="primary" onClick={() => window.print()}>
                      Imprimir
                    </Button>
                    <Button variant="secondary" onClick={() => setManifestModalOpen(false)}>
                      Cerrar
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4 text-center">
                  <div className="rounded-card border border-edge p-3">
                    <span className="text-[10px] font-bold uppercase text-ink-secondary">Total</span>
                    <p className="font-display text-xl font-bold text-ink">{manifest.custody.total}</p>
                  </div>
                  <div className="rounded-card border border-emerald-200 bg-emerald-50 p-3">
                    <span className="text-[10px] font-bold uppercase text-emerald-800">Aceptados por piloto</span>
                    <p className="font-display text-xl font-bold text-emerald-900">{manifest.custody.accepted_by_pilot}</p>
                  </div>
                  <div className="rounded-card border border-sky-200 bg-sky-50 p-3">
                    <span className="text-[10px] font-bold uppercase text-sky-800">Siguen en sede</span>
                    <p className="font-display text-xl font-bold text-sky-900">{manifest.custody.in_hub}</p>
                  </div>
                  <div className="rounded-card border border-amber-200 bg-amber-50 p-3">
                    <span className="text-[10px] font-bold uppercase text-amber-800">Pendientes</span>
                    <p className="font-display text-xl font-bold text-amber-900">{manifest.custody.pending}</p>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-card border border-edge">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-edge bg-bg-secondary/60 uppercase tracking-wider text-ink-secondary">
                      <tr>
                        <th className="px-3 py-2">Sec.</th>
                        <th className="px-3 py-2">Guía</th>
                        <th className="px-3 py-2">Destinatario</th>
                        <th className="px-3 py-2">Dirección</th>
                        <th className="px-3 py-2">Estado Custodia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-edge">
                      {manifest.items.map((item) => (
                        <tr key={item.route_stop_id}>
                          <td className="px-3 py-2 font-bold text-brand">{item.sequence}</td>
                          <td className="px-3 py-2 font-display font-bold text-ink">{item.guide.display_code}</td>
                          <td className="px-3 py-2 text-ink">{item.recipient.name}</td>
                          <td className="px-3 py-2 text-ink-secondary">{item.recipient.address}</td>
                          <td className="px-3 py-2">
                            <Badge tone={item.custody.new_custodian_type === "driver" ? "success" : "warning"}>
                              {item.custody.new_custodian_name || item.custody.state}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </Card>
        </div>
      ) : null}

      {/* Create Route Modal */}
      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-xs transition-opacity sm:items-center sm:p-4">
          <form
            onSubmit={createRoute}
            className="mobile-modal-safe-area h-[100dvh] w-full overflow-y-auto rounded-none bg-surface p-6 shadow-xl sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-card"
          >
            <h2 className="font-display text-xl font-bold text-ink">Crear nueva ruta diaria</h2>
            <div className="mt-4 space-y-4">
              <Select
                required
                label="Piloto *"
                value={selectedDriverId}
                onChange={(event) => setSelectedDriverId(event.target.value)}
              >
                <option value="">Selecciona un piloto</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name} ({driver.zone || "Sin zona"})
                  </option>
                ))}
              </Select>

              <Input
                label="Zona (opcional)"
                value={selectedZone}
                onChange={(event) => setSelectedZone(event.target.value)}
                placeholder="Filtrar envíos por zona (ej: Norte)"
              />

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                  Envíos elegibles ({filteredRoutableShipments.length})
                </p>
                <div className="max-h-60 overflow-y-auto rounded-card border border-edge p-2 space-y-2">
                  {filteredRoutableShipments.map((shipment) => (
                    <label
                      key={shipment.id}
                      className="flex cursor-pointer items-start gap-2.5 rounded-card border border-edge p-2 text-xs hover:border-brand/40"
                    >
                      <input
                        type="checkbox"
                        checked={selectedShipmentIds.includes(shipment.id)}
                        onChange={() =>
                          setSelectedShipmentIds((current) =>
                            current.includes(shipment.id)
                              ? current.filter((id) => id !== shipment.id)
                              : [...current, shipment.id]
                          )
                        }
                        className="mt-0.5 h-4 w-4 rounded border-edge text-brand focus:ring-brand"
                      />
                      <div>
                        <p className="font-display font-bold text-ink">{shipment.display_code}</p>
                        <p className="text-ink-secondary">{shipment.recipient_name} · {shipment.recipient_address}</p>
                      </div>
                    </label>
                  ))}
                  {filteredRoutableShipments.length === 0 ? (
                    <p className="p-3 text-center text-xs text-ink-secondary">No hay envíos elegibles para esta zona.</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setCreateModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" type="submit">
                Crear ruta
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
