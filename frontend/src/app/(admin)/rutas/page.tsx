"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiJson, apiSend, describeApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import { routeStopStatusLabel } from "@/lib/utils";
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
      className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    };
  }

  if (custody?.new_custodian_type === "hub") {
    return {
      label: "En sede",
      detail: custody.new_custodian_name || "Custodia en sede",
      className: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    };
  }

  return {
    label: "Sin custodia",
    detail: "No hay un evento de custodia disponible",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  };
}

function routeHealth(route: DailyRoute): RouteHealth {
  const pendingStops = route.stops.filter((stop) => stop.status === "pending");
  const issueStops = route.stops.filter((stop) => stop.status === "issue");
  const missingGeoStops = pendingStops.filter(
    (stop) => !hasStopCoordinates(stop.shipment.recipient_lat, stop.shipment.recipient_lng)
  );
  const streetGeometry =
    decodeGooglePolyline(route.route_geometry?.overview_polyline).length > 1
    || (route.route_geometry?.legs ?? []).some((leg) => decodeGooglePolyline(leg.encoded_polyline).length > 1);

  return {
    pendingStops: pendingStops.length,
    issueStops: issueStops.length,
    missingGeoStops: missingGeoStops.length,
    missingGeoCodes: missingGeoStops.map(
      (stop) => stop.shipment.display_code || `#${stop.shipment.id}`
    ),
    hasLiveLocation: Boolean(route.driver_location),
    locationFreshness: route.driver_location ? route.driver_location.freshness : "missing",
    hasStreetGeometry: streetGeometry,
  };
}

function routeAttentionLevel(health: RouteHealth): AttentionLevel {
  if (!health.hasLiveLocation || health.missingGeoStops > 0) {
    return "critical";
  }

  if (health.locationFreshness === "stale" || health.issueStops > 0 || !health.hasStreetGeometry) {
    return "warning";
  }

  return "healthy";
}

function freshnessPresentation(route: DailyRoute): {
  tone: FreshnessTone;
  label: string;
  chipClassName: string;
} {
  if (!route.driver_location) {
    return {
      tone: "missing",
      label: "Sin señal",
      chipClassName: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
    };
  }

  if (route.driver_location.freshness === "live") {
    return {
      tone: "live",
      label: "Ping vivo",
      chipClassName: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    };
  }

  if (route.driver_location.freshness === "recent") {
    return {
      tone: "recent",
      label: "Señal reciente",
      chipClassName: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    };
  }

  return {
    tone: "stale",
    label: "Ubicación vencida",
    chipClassName: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  };
}

function routeAttentionScore(route: DailyRoute, health: RouteHealth): number {
  const freshness = freshnessPresentation(route).tone;
  const level = routeAttentionLevel(health);

  const levelScore = level === "critical" ? 3000 : level === "warning" ? 2000 : 1000;
  const freshnessScore = freshness === "missing" ? 500 : freshness === "stale" ? 250 : freshness === "recent" ? 80 : 0;
  const issueScore = health.issueStops * 40;
  const missingGeoScore = health.missingGeoStops * 35;
  const pendingScore = Math.min(health.pendingStops, 20) * 3;
  const ageScore = Math.min(route.driver_location?.age_seconds ?? 0, 3600) / 60;

  return levelScore + freshnessScore + issueScore + missingGeoScore + pendingScore + ageScore;
}

function attentionToneClasses(level: AttentionLevel | "info"): string {
  switch (level) {
    case "critical":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";
    case "healthy":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200";
  }
}

function buildMonitorTimeline(route: DailyRoute, health: RouteHealth): MonitorTimelineItem[] {
  const orderedStops = [...route.stops].sort((left, right) => left.sort_order - right.sort_order);
  const pendingStops = orderedStops.filter((stop) => stop.status === "pending");
  const completedStops = orderedStops.filter((stop) => stop.status === "completed");
  const currentStop = pendingStops[0] ?? null;
  const nextStop = pendingStops[1] ?? null;
  const recentCompleted = completedStops.slice(-2).reverse();
  const items: MonitorTimelineItem[] = [];

  items.push({
    key: "route-status",
    title:
      route.status === "active"
        ? "Ruta en curso"
        : route.status === "planned"
          ? "Ruta lista para salir"
          : "Ruta completada",
    detail: `${route.completed_stops}/${route.total_stops} completadas en ${route.zone || "sin zona"}.`,
    tone: route.status === "completed" ? "healthy" : route.status === "active" ? "info" : "warning",
  });

  items.push({
    key: "driver-ping",
    title: route.driver_location ? "Último ping del piloto" : "Sin tracking vivo",
    detail: route.driver_location
      ? `Ubicación ${ageLabel(route.driver_location.age_seconds)}. Frescura ${route.driver_location.freshness}.`
      : "El celular aún no ha reportado ubicación reciente a la operación.",
    tone: route.driver_location ? (health.locationFreshness === "live" ? "healthy" : "warning") : "critical",
  });

  if (currentStop) {
    items.push({
      key: `current-${currentStop.id}`,
      title: `Parada actual #${currentStop.sort_order}`,
      detail: `${currentStop.shipment.display_code} • ${currentStop.shipment.recipient_name || "Sin destinatario"} • ${currentStop.shipment.recipient_address || "Sin dirección"}`,
      tone: "info",
    });
  }

  if (nextStop) {
    items.push({
      key: `next-${nextStop.id}`,
      title: `Siguiente parada #${nextStop.sort_order}`,
      detail: `${nextStop.shipment.display_code} • ${nextStop.shipment.recipient_name || "Sin destinatario"}`,
      tone: "healthy",
    });
  }

  if (health.missingGeoStops > 0) {
    items.push({
      key: "missing-geo",
      title: "Geometría degradada",
      detail: `${health.missingGeoStops} parada(s) pendiente(s) sin coordenadas listas para ruta/mapa.`,
      tone: "critical",
    });
  }

  recentCompleted.forEach((stop) => {
    items.push({
      key: `completed-${stop.id}`,
      title: `Entregado #${stop.sort_order}`,
      detail: `${stop.shipment.display_code} • ${stop.shipment.recipient_name || "Sin destinatario"}`,
      tone: "healthy",
    });
  });

  return items.slice(0, 6);
}

const mercatorY = (lat: number) => {
  const safeLat = Math.max(-85, Math.min(85, lat));
  const radians = (safeLat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
};

function decodeGooglePolyline(encoded: string | null | undefined): GeoPoint[] {
  if (!encoded) return [];

  const coordinates: GeoPoint[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    latitude += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    longitude += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    coordinates.push({
      lat: latitude / 1e5,
      lng: longitude / 1e5,
    });
  }

  return coordinates;
}

function mergePolylineSegments(segments: GeoPoint[][]): GeoPoint[] {
  const merged: GeoPoint[] = [];

  for (const segment of segments) {
    for (const point of segment) {
      const last = merged[merged.length - 1];
      if (!last || last.lat !== point.lat || last.lng !== point.lng) {
        merged.push(point);
      }
    }
  }

  return merged;
}

function buildRoutePathCoordinates(route: DailyRoute, orderedStops: DailyRoute["stops"]): GeoPoint[] {
  const overview = decodeGooglePolyline(route.route_geometry?.overview_polyline);
  if (overview.length > 1) {
    return overview;
  }

  const legSegments = (route.route_geometry?.legs ?? [])
    .map((leg) => decodeGooglePolyline(leg.encoded_polyline))
    .filter((segment) => segment.length > 1);

  if (legSegments.length > 0) {
    return mergePolylineSegments(legSegments);
  }

  return orderedStops.map((stop) => ({
    lat: Number(stop.shipment.recipient_lat),
    lng: Number(stop.shipment.recipient_lng),
  }));
}

function buildMonitorGeometry(route: DailyRoute) {
  const orderedStops = [...route.stops]
    .filter((stop) => hasStopCoordinates(stop.shipment.recipient_lat, stop.shipment.recipient_lng))
    .sort((left, right) => left.sort_order - right.sort_order);

  const driverLocation = route.driver_location;
  const routePathCoordinates = buildRoutePathCoordinates(route, orderedStops);
  const rawPoints = [
    ...routePathCoordinates,
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
  const latPadding = latSpan * 0.22;
  const lngPadding = lngSpan * 0.22;
  const south = Math.max(-85, minLat - latPadding);
  const north = Math.min(85, maxLat + latPadding);
  const west = minLng - lngPadding;
  const east = maxLng + lngPadding;
  const southMercator = mercatorY(south);
  const northMercator = mercatorY(north);

  const projectPoint = ({ lat, lng }: GeoPoint) => {
    const xPercent = ((lng - west) / Math.max(east - west, 0.0001)) * 100;
    const yPercent =
      ((northMercator - mercatorY(lat)) / Math.max(northMercator - southMercator, 0.0001)) * 100;

    return {
      xPercent: Math.max(0, Math.min(100, xPercent)),
      yPercent: Math.max(0, Math.min(100, yPercent)),
    };
  };

  const pendingStops = [...route.stops]
    .filter((stop) => stop.status === "pending")
    .sort((left, right) => left.sort_order - right.sort_order);
  const currentStopId = pendingStops[0]?.id ?? null;

  const stopPoints: MonitorPoint[] = orderedStops.map((stop) => ({
    ...projectPoint({
      lat: Number(stop.shipment.recipient_lat),
      lng: Number(stop.shipment.recipient_lng),
    }),
    label: stop.shipment.display_code,
    kind: "stop",
    status: stop.status,
    order: stop.sort_order,
    current: stop.id === currentStopId,
  }));

  const driverPoint: MonitorPoint | null = driverLocation
    ? {
        ...projectPoint({ lat: driverLocation.lat, lng: driverLocation.lng }),
        label: route.driver?.name || "Piloto",
        kind: "driver",
      }
    : null;

  const routePath =
    routePathCoordinates.length > 1
      ? routePathCoordinates
          .map((point, index) => {
            const projected = projectPoint(point);
            return `${index === 0 ? "M" : "L"} ${projected.xPercent.toFixed(2)} ${projected.yPercent.toFixed(2)}`;
          })
          .join(" ")
      : null;

  const currentStopPoint =
    currentStopId !== null ? stopPoints.find((point) => point.current) ?? null : null;

  const driverToCurrentPath =
    driverPoint && currentStopPoint
      ? `M ${driverPoint.xPercent.toFixed(2)} ${driverPoint.yPercent.toFixed(2)} L ${currentStopPoint.xPercent.toFixed(2)} ${currentStopPoint.yPercent.toFixed(2)}`
      : null;

  const embedParams = new URLSearchParams({
    bbox: [west, south, east, north].map((value) => value.toFixed(6)).join(","),
    layer: "mapnik",
  });
  const focusPoint = driverLocation
    ? { lat: driverLocation.lat, lng: driverLocation.lng }
    : routePathCoordinates[0] ?? rawPoints[0];

  return {
    stopPoints,
    driverPoint,
    routePath,
    driverToCurrentPath,
    hasStreetGeometry:
      decodeGooglePolyline(route.route_geometry?.overview_polyline).length > 1
      || (route.route_geometry?.legs ?? []).some((leg) => decodeGooglePolyline(leg.encoded_polyline).length > 1),
    embedUrl: `https://www.openstreetmap.org/export/embed.html?${embedParams.toString()}`,
    openStreetMapUrl: focusPoint
      ? `https://www.openstreetmap.org/?mlat=${focusPoint.lat.toFixed(6)}&mlon=${focusPoint.lng.toFixed(6)}#map=14/${focusPoint.lat.toFixed(6)}/${focusPoint.lng.toFixed(6)}`
      : "https://www.openstreetmap.org",
  };
}

function RouteMonitorCard({ route, className = "mt-3" }: { route: DailyRoute; className?: string }) {
  const orderedStops = useMemo(
    () => [...route.stops].sort((left, right) => left.sort_order - right.sort_order),
    [route.stops]
  );
  const pendingStops = orderedStops.filter((stop) => stop.status === "pending");
  const issueStops = orderedStops.filter((stop) => stop.status === "issue");
  const pendingPreview = pendingStops.slice(0, 5);
  const currentStop = pendingStops[0] ?? null;
  const nextStop = pendingStops[1] ?? null;
  const geometry = useMemo(() => buildMonitorGeometry(route), [route]);
  const health = useMemo(() => routeHealth(route), [route]);
  const attentionLevel = useMemo(() => routeAttentionLevel(health), [health]);
  const monitorTimeline = useMemo(() => buildMonitorTimeline(route, health), [route, health]);
  const remainingStops = health.pendingStops;
  const metrics = route.route_metrics ?? null;
  const geometrySourceLabel = geometry?.hasStreetGeometry ? "Ruta vial real" : "Trazo aproximado";
  const freshnessUi = freshnessPresentation(route);
  const latestPingLabel = route.driver_location ? ageLabel(route.driver_location.age_seconds) : "sin señal";
  const latestPingAbsoluteLabel = route.driver_location
    ? absoluteDateTimeLabel(route.driver_location.updated_at)
    : "Esperando primer ping del celular";

  return (
    <div className={`${className} rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]`}>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
        <span className={`rounded-full border px-2 py-1 font-semibold ${attentionToneClasses(attentionLevel)}`}>
          {attentionLevel === "healthy" ? "Operación estable" : attentionLevel === "warning" ? "Atención operativa" : "Riesgo operativo"}
        </span>
        <span className="rounded-full bg-white px-2 py-1 dark:bg-[#1a1a2e]">
          Completadas: {route.completed_stops}
        </span>
        <span className="rounded-full bg-white px-2 py-1 dark:bg-[#1a1a2e]">
          Pendientes: {remainingStops}
        </span>
        {issueStops.length > 0 ? (
          <span className="rounded-full bg-rose-50 px-2 py-1 font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            Novedades: {issueStops.length}
          </span>
        ) : null}
        {health.missingGeoStops > 0 ? (
          <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            {health.missingGeoStops} sin geo
          </span>
        ) : null}
        <span className={`rounded-full px-2 py-1 font-semibold ${freshnessUi.chipClassName}`}>
          {route.driver_location ? `${freshnessUi.label} - ${latestPingLabel}` : freshnessUi.label}
        </span>
        {geometry ? (
          <span
            className={`rounded-full px-2 py-1 font-semibold ${
              geometry.hasStreetGeometry
                ? "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
                : "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
            }`}
          >
            {geometrySourceLabel}
          </span>
        ) : null}
      </div>

      {health.missingGeoStops > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="font-semibold">Paradas sin coordenadas listas para mapa</p>
          <p className="mt-1">
            {health.missingGeoCodes.join(", ")}. Estas paradas pueden degradar el mapa del piloto o dejar la ruta en modo aproximado.
          </p>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_320px]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 md:hidden">
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Piloto</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {route.driver?.name || "Sin piloto"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{freshnessUi.label}</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Último ping</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{latestPingLabel}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{latestPingAbsoluteLabel}</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Parada actual</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {currentStop ? currentStop.shipment.recipient_name || "Sin destinatario" : "Ruta finalizada"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {currentStop?.shipment.display_code || "Sin código"}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Siguiente</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {nextStop ? nextStop.shipment.recipient_name || "Sin destinatario" : "No hay siguiente"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {nextStop?.shipment.display_code || `${remainingStops} pendientes`}
              </p>
            </div>
          </div>

          <div className="hidden gap-3 md:grid md:grid-cols-2 2xl:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Piloto</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {route.driver?.name || "Sin piloto"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {route.driver_location ? `Ubicación ${latestPingLabel}` : "Sin ubicación viva"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {route.driver_location ? `Reportado ${latestPingAbsoluteLabel}` : latestPingAbsoluteLabel}
              </p>
              <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">
                {route.driver_location
                  ? `${route.driver_location.lat.toFixed(5)}, ${route.driver_location.lng.toFixed(5)}`
                  : "Esperando reporte del celular"}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Parada actual</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {currentStop ? currentStop.shipment.recipient_name || "Sin destinatario" : "Ruta finalizada"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {currentStop?.shipment.display_code || "Sin código"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {currentStop?.shipment.recipient_address || "Sin dirección"}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Siguiente parada</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {nextStop ? nextStop.shipment.recipient_name || "Sin destinatario" : "No hay siguiente"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {nextStop?.shipment.display_code || "Sin código"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {nextStop?.shipment.recipient_address || "La ruta ya va cerrando"}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Resumen de ruta</p>
              <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <p>{remainingStops} pendientes</p>
                <p>
                  Total: {metrics?.total_distance_km !== null && metrics?.total_distance_km !== undefined ? `${metrics.total_distance_km} km` : "sin distancia"}
                  {" - "}
                  {metrics?.total_duration_min !== null && metrics?.total_duration_min !== undefined ? `~${metrics.total_duration_min} min` : "sin duración"}
                </p>
                <p>
                  Restante: {metrics?.remaining_distance_km !== null && metrics?.remaining_distance_km !== undefined ? `${metrics.remaining_distance_km} km` : "sin distancia"}
                  {" - "}
                  {metrics?.remaining_duration_min !== null && metrics?.remaining_duration_min !== undefined ? `~${metrics.remaining_duration_min} min` : "sin duración"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 pt-1">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Mapa operativo de la ruta</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Visualiza el recorrido, la posición del piloto y la secuencia actual.
                </p>
              </div>
              {geometry ? (
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-200">
                    {geometrySourceLabel}
                  </span>
                  <a
                    href={geometry.openStreetMapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-500/20 dark:text-slate-200 dark:hover:bg-slate-500/30"
                  >
                    Abrir mapa
                  </a>
                </div>
              ) : null}
            </div>

            {geometry ? (
              <div className="relative h-72 overflow-hidden rounded-xl">
                <iframe
                  src={geometry.embedUrl}
                  title={`Mapa de ruta ${route.id}`}
                  className="absolute inset-0 h-full w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <div className="pointer-events-none absolute inset-0 bg-white/5" />
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                  {geometry.routePath ? (
                    <path
                      d={geometry.routePath}
                      fill="none"
                      stroke={geometry.hasStreetGeometry ? "#0ea5e9" : "#94a3b8"}
                      strokeWidth={geometry.hasStreetGeometry ? 1.8 : 1.5}
                      strokeDasharray={geometry.hasStreetGeometry ? undefined : "2.8 2.2"}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {geometry.driverToCurrentPath ? (
                    <path
                      d={geometry.driverToCurrentPath}
                      fill="none"
                      stroke="#d1007f"
                      strokeWidth="1.3"
                      strokeDasharray="3 2.2"
                      strokeLinecap="round"
                    />
                  ) : null}
                </svg>

                {geometry.stopPoints.map((point) => (
                  <div
                    key={`${point.kind}-${point.order}-${point.label}`}
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${point.xPercent}%`, top: `${point.yPercent}%` }}
                  >
                    {point.current ? (
                      <span className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-fuchsia-500/30" />
                    ) : null}
                    <span
                      className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow"
                      style={{ backgroundColor: stopTone(point.status, point.current) }}
                    >
                      {point.order}
                    </span>
                  </div>
                ))}

                {geometry.driverPoint ? (
                  <div
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${geometry.driverPoint.xPercent}%`, top: `${geometry.driverPoint.yPercent}%` }}
                  >
                    <span className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-sky-400/30" />
                    <span className="relative block h-5 w-5 rounded-full border-2 border-white bg-sky-500 shadow" />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center text-center text-xs text-slate-500 dark:text-slate-400">
                No hay coordenadas suficientes para dibujar el mapa real de esta ruta.
              </div>
            )}
          </div>

          <div className="space-y-3 md:hidden">
            <details className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]" open>
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 dark:text-slate-100">
                Estado del tracking
              </summary>
              <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <span>Ubicación</span>
                  <span className={`rounded-full px-2 py-1 font-semibold ${freshnessUi.chipClassName}`}>{latestPingLabel}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Geometría</span>
                  <span className={`rounded-full px-2 py-1 font-semibold ${
                    health.hasStreetGeometry
                      ? "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
                      : "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
                  }`}>
                    {geometrySourceLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Pendientes</span>
                  <strong className="text-slate-900 dark:text-slate-100">{remainingStops}</strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Novedades</span>
                  <strong className="text-slate-900 dark:text-slate-100">{health.issueStops}</strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Sin coordenadas</span>
                  <strong className="text-slate-900 dark:text-slate-100">{health.missingGeoStops}</strong>
                </div>
              </div>
            </details>

            <details className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 dark:text-slate-100">
                Secuencia pendiente
              </summary>
              <div className="mt-3 space-y-2 text-xs">
                {pendingPreview.length > 0 ? pendingPreview.map((stop) => (
                  <div key={stop.id} className="rounded-lg border border-slate-200 p-2 dark:border-[#2a2a3e]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">
                          #{stop.sort_order} · {stop.shipment.recipient_name || "Sin destinatario"}
                        </p>
                        <p className="mt-1 text-slate-500 dark:text-slate-400">{stop.shipment.display_code}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">
                        {routeStopStatusLabel(stop.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                      {stop.shipment.recipient_address || "Sin dirección"}
                    </p>
                  </div>
                )) : (
                  <p className="text-slate-500 dark:text-slate-400">No quedan paradas pendientes.</p>
                )}
              </div>
            </details>

            <details className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 dark:text-slate-100">
                Línea operativa
              </summary>
              <div className="mt-3 space-y-2">
                {monitorTimeline.map((item) => (
                  <div key={item.key} className={`rounded-lg border p-2 text-xs ${attentionToneClasses(item.tone)}`}>
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 leading-5">{item.detail}</p>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>

        <aside className="hidden space-y-3 lg:block">
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Estado del tracking</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Ubicación</span>
                <span className={`rounded-full px-2 py-1 font-semibold ${
                  route.driver_location?.freshness === "live"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                }`}>
                  {route.driver_location ? latestPingLabel : "sin señal"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Geometría</span>
                <span className={`rounded-full px-2 py-1 font-semibold ${
                  health.hasStreetGeometry
                    ? "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
                    : "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
                }`}>
                  {geometrySourceLabel}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Pendientes</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{remainingStops}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Novedades</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{health.issueStops}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Sin coordenadas</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{health.missingGeoStops}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Secuencia pendiente</p>
            <div className="mt-3 space-y-2">
              {pendingPreview.length > 0 ? pendingPreview.map((stop) => (
                <div key={stop.id} className="rounded-lg border border-slate-200 p-2 dark:border-[#2a2a3e]">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">
                        #{stop.sort_order} · {stop.shipment.recipient_name || "Sin destinatario"}
                      </p>
                      <p className="mt-1 text-slate-500 dark:text-slate-400">{stop.shipment.display_code}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">
                      {routeStopStatusLabel(stop.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-500 dark:text-slate-400">
                    {stop.shipment.recipient_address || "Sin dirección"}
                  </p>
                </div>
              )) : (
                <p className="text-slate-500 dark:text-slate-400">No quedan paradas pendientes.</p>
              )}
            </div>
            {pendingStops.length > pendingPreview.length ? (
              <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                +{pendingStops.length - pendingPreview.length} paradas adicionales en la ruta.
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Línea operativa</p>
            <div className="mt-3 space-y-2">
              {monitorTimeline.map((item) => (
                <div
                  key={item.key}
                  className={`rounded-lg border p-2 ${attentionToneClasses(item.tone)}`}
                >
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 leading-5">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function RutasPage() {
  usePageTitle("Monitor de Rutas | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
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
  const [focusedActiveRouteId, setFocusedActiveRouteId] = useState<number | null>(null);
  const [handoverStopKey, setHandoverStopKey] = useState<string | null>(null);
  const [handoverNotes, setHandoverNotes] = useState("");
  const [handoverBusyKey, setHandoverBusyKey] = useState<string | null>(null);
  const [dispatchBoard, setDispatchBoard] = useState<DispatchBoardResponse | null>(null);
  const [dispatchBoardLoading, setDispatchBoardLoading] = useState(false);
  const [dispatchSizeFilter, setDispatchSizeFilter] = useState<DispatchSizeCode | "all">("all");
  const [dispatchZoneFilter, setDispatchZoneFilter] = useState("all");
  const [dispatchBoardError, setDispatchBoardError] = useState<string | null>(null);
  const [dispatchSelectedShipmentIds, setDispatchSelectedShipmentIds] = useState<number[]>([]);
  const [dispatchSelectedDriverIds, setDispatchSelectedDriverIds] = useState<number[]>([]);
  const [dispatchMaxPackagesPerDriver, setDispatchMaxPackagesPerDriver] = useState("");
  const [dispatchProposal, setDispatchProposal] = useState<DispatchProposalResponse | null>(null);
  const [dispatchProposalLoading, setDispatchProposalLoading] = useState(false);
  const [dispatchProposalError, setDispatchProposalError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<DispatchManifestResponse | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);

  const loadDispatchBoard = async () => {
    setDispatchBoardLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (dispatchSizeFilter !== "all") params.set("size_code", dispatchSizeFilter);
      if (dispatchZoneFilter !== "all") params.set("zone", dispatchZoneFilter);
      const response = await apiGet<DispatchBoardResponse>(`/routes/dispatch-board?${params.toString()}`);
      setDispatchBoard(response);
      const visibleShipmentIds = new Set(response.shipments.map((shipment) => shipment.id));
      setDispatchSelectedShipmentIds((current) => current.filter((id) => visibleShipmentIds.has(id)));
      setDispatchBoardError(null);
    } catch (error) {
      setDispatchBoard(null);
      setDispatchBoardError(
        describeApiError(error, "El tablero de custodia aún no está disponible en el servidor.").message
      );
    } finally {
      setDispatchBoardLoading(false);
    }
  };

  const toggleDispatchShipment = (shipmentId: number) => {
    setDispatchSelectedShipmentIds((current) => current.includes(shipmentId)
      ? current.filter((id) => id !== shipmentId)
      : [...current, shipmentId]);
  };

  const toggleDispatchDriver = (driverId: number) => {
    setDispatchSelectedDriverIds((current) => current.includes(driverId)
      ? current.filter((id) => id !== driverId)
      : [...current, driverId]);
  };

  const requestDispatchProposal = async () => {
    if (dispatchSelectedDriverIds.length === 0) {
      showToast("Selecciona al menos un piloto", "error");
      return;
    }
    if (dispatchSelectedShipmentIds.length === 0) {
      showToast("Selecciona al menos un paquete en custodia", "error");
      return;
    }

    setDispatchProposalLoading(true);
    setDispatchProposalError(null);
    try {
      const body: Record<string, unknown> = {
        driver_ids: dispatchSelectedDriverIds,
        shipment_ids: dispatchSelectedShipmentIds,
      };
      if (dispatchMaxPackagesPerDriver.trim()) {
        body.max_packages_per_driver = Number(dispatchMaxPackagesPerDriver);
      }

      const response = await apiJson<DispatchProposalResponse>(
        "/routes/dispatch-proposals/preview",
        "POST",
        body,
      );
      setDispatchProposal(response);
    } catch (error) {
      const presentation = describeApiError(error, "No se pudo calcular la propuesta de despacho.");
      setDispatchProposalError(presentation.message);
      setDispatchProposal(null);
    } finally {
      setDispatchProposalLoading(false);
    }
  };

  const openManifest = async (routeId: number) => {
    setManifestLoading(true);
    setManifestError(null);
    try {
      const response = await apiGet<DispatchManifestResponse>(`/routes/${routeId}/manifest`);
      setManifest(response);
    } catch (error) {
      const presentation = describeApiError(error, "No se pudo generar el manifiesto.");
      setManifestError(presentation.message);
      setManifest(null);
    } finally {
      setManifestLoading(false);
    }
  };

  const loadData = async (options?: { silent?: boolean; notifyOnError?: boolean }) => {
    const silent = options?.silent ?? false;
    const notifyOnError = options?.notifyOnError ?? true;

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [routesRes, driversRes] = await Promise.all([
        apiGet<DailyRoute[]>("/routes"),
        apiGet<PaginatedResponse<Driver> | Driver[]>("/drivers"),
      ]);

      setRoutes(routesRes || []);
      setDrivers(Array.isArray(driversRes) ? driversRes : driversRes.data || []);
      setLastUpdatedAt(new Date());
    } catch {
      if (!silent) {
        setRoutes([]);
        setDrivers([]);
      }
      if (notifyOnError) {
        showToast("No se pudieron cargar rutas", "error");
      }
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData({ notifyOnError: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDispatchBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchSizeFilter, dispatchZoneFilter]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadData({ silent: true, notifyOnError: false });
      void loadDispatchBoard();
    }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const routeHealthById = useMemo(() => (
    new Map(routes.map((route) => [route.id, routeHealth(route)]))
  ), [routes]);

  const sortedActiveRoutes = useMemo(() => (
    [...grouped.active].sort((left, right) => {
      const leftHealth = routeHealthById.get(left.id) ?? routeHealth(left);
      const rightHealth = routeHealthById.get(right.id) ?? routeHealth(right);

      return routeAttentionScore(right, rightHealth) - routeAttentionScore(left, leftHealth);
    })
  ), [grouped.active, routeHealthById]);

  const routeHealthSummary = useMemo(() => {
    const filteredRoutes = [
      ...grouped.planned,
      ...grouped.active,
      ...grouped.completed,
    ];
    const activeRoutes = filteredRoutes.filter((route) => route.status === "active");

    const degradedGeo = filteredRoutes.filter((route) => (routeHealthById.get(route.id)?.missingGeoStops ?? 0) > 0);
    const trackingAttention = activeRoutes.filter((route) => {
      const freshness = routeHealthById.get(route.id)?.locationFreshness ?? "missing";
      return freshness !== "live";
    });
    const noSignal = activeRoutes.filter((route) => {
      const freshness = routeHealthById.get(route.id)?.locationFreshness ?? "missing";
      return freshness === "missing";
    });
    const staleLocation = activeRoutes.filter((route) => {
      const freshness = routeHealthById.get(route.id)?.locationFreshness ?? "missing";
      return freshness === "stale";
    });
    const recentLocation = activeRoutes.filter((route) => {
      const freshness = routeHealthById.get(route.id)?.locationFreshness ?? "missing";
      return freshness === "recent";
    });
    const approximateGeometry = activeRoutes.filter((route) => {
      const health = routeHealthById.get(route.id);
      return Boolean(health && health.pendingStops > 0 && !health.hasStreetGeometry);
    });
    const critical = activeRoutes.filter((route) => {
      const health = routeHealthById.get(route.id);
      return health ? routeAttentionLevel(health) === "critical" : false;
    });
    const warning = activeRoutes.filter((route) => {
      const health = routeHealthById.get(route.id);
      return health ? routeAttentionLevel(health) === "warning" : false;
    });
    const healthy = activeRoutes.filter((route) => {
      const health = routeHealthById.get(route.id);
      return health ? routeAttentionLevel(health) === "healthy" : false;
    });

    return {
      total: filteredRoutes.length,
      active: activeRoutes.length,
      degradedGeo: degradedGeo.length,
      trackingAttention: trackingAttention.length,
      noSignal: noSignal.length,
      staleLocation: staleLocation.length,
      recentLocation: recentLocation.length,
      approximateGeometry: approximateGeometry.length,
      critical: critical.length,
      warning: warning.length,
      healthy: healthy.length,
    };
  }, [grouped, routeHealthById]);

  const activeRoutes = sortedActiveRoutes;

  const focusedActiveRoute = useMemo(
    () => activeRoutes.find((route) => route.id === focusedActiveRouteId) ?? activeRoutes[0] ?? null,
    [activeRoutes, focusedActiveRouteId]
  );

  const openLiveMonitor = (routeId: number) => {
    setFocusedActiveRouteId(routeId);
    if (typeof document !== "undefined") {
      document.getElementById("route-live-monitor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const toggleRouteDetails = (route: DailyRoute) => {
    if (route.status === "active") {
      openLiveMonitor(route.id);
      return;
    }

    setExpandedRouteId((current) => (current === route.id ? null : route.id));
  };

  const startRoute = async (routeId: number) => {
    try {
      await apiSend(`/routes/${routeId}/start`, "POST", {});
      showToast("Ruta activada", "success");
      await loadData();
    } catch (error) {
      const presentation = describeApiError(error, "No se pudo activar la ruta");
      if (presentation.code === "route_custody_pending") {
        showToast("Hay paquetes sin aceptar. Revisa el manifiesto.", "error");
        void openManifest(routeId);
        return;
      }

      showToast(presentation.message, "error");
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

  const handoverStopToDriver = async (routeId: number, stopId: number) => {
    const notes = handoverNotes.trim();
    if (!notes) {
      showToast("Escribe una nota para justificar la entrega manual", "error");
      return;
    }

    const key = `${routeId}:${stopId}`;
    setHandoverBusyKey(key);

    try {
      const idempotencyKey = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `route-handover-${routeId}-${stopId}`;

      await apiJson(
        `/routes/${routeId}/stops/${stopId}/handover`,
        "POST",
        { notes, physical_condition: "unknown" },
        { "Idempotency-Key": idempotencyKey },
        { retries: 1, idempotent: true }
      );
      showToast("Paquete entregado al piloto y custodia actualizada", "success");
      setHandoverStopKey(null);
      setHandoverNotes("");
      await loadData({ silent: true, notifyOnError: true });
    } catch (error) {
      const presentation = describeApiError(error, "No se pudo registrar la entrega al piloto");
      showToast(presentation.message, "error");
    } finally {
      setHandoverBusyKey(null);
    }
  };

  const renderHandoverControls = (route: DailyRoute, stop: RouteStop) => {
    const key = `${route.id}:${stop.id}`;
    const custodyUi = custodyPresentation(stop);
    const alreadyWithDriver = stop.shipment.custody?.new_custodian_type === "driver";
    const hasHubCustody = stop.shipment.custody?.new_custodian_type === "hub";
    const canDispatch = (route.status === "planned" || route.status === "active")
      && stop.status === "pending"
      && !alreadyWithDriver
      && hasHubCustody;

    return (
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${custodyUi.className}`}>
            {custodyUi.label}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{custodyUi.detail}</span>
        </div>

        {canDispatch ? (
          handoverStopKey === key ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                Confirmar entrega física al piloto
              </p>
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                Esta alternativa deja registro porque no se escaneó la guía.
              </p>
              <textarea
                value={handoverNotes}
                onChange={(event) => setHandoverNotes(event.target.value)}
                rows={2}
                maxLength={280}
                placeholder="Ej. Piloto recibió el paquete en mostrador; escáner no disponible."
                className="mt-2 w-full rounded border border-amber-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-primary dark:border-amber-500/40 dark:bg-[#16162a] dark:text-slate-100"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handoverStopToDriver(route.id, stop.id)}
                  disabled={handoverBusyKey === key}
                  className="rounded bg-primary px-2 py-1 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {handoverBusyKey === key ? "Guardando..." : "Confirmar entrega"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHandoverStopKey(null);
                    setHandoverNotes("");
                  }}
                  disabled={handoverBusyKey === key}
                  className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-[#2a2a3e] dark:text-slate-200"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setHandoverStopKey(key);
                setHandoverNotes("");
              }}
              className="rounded border border-primary/40 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5"
            >
              Despachar al piloto
            </button>
          )
        ) : (route.status === "planned" || route.status === "active")
          && stop.status === "pending"
          && !alreadyWithDriver
          && !hasHubCustody ? (
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            Requiere custodia de sede antes del despacho
          </span>
        ) : null}
      </div>
    );
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
    const insertionIndex = from < to ? to - 1 : to;
    ordered.splice(insertionIndex, 0, moved);

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
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {lastUpdatedAt
                ? `Última actualización ${lastUpdatedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                : "Esperando primera sincronización"}
              {refreshing ? " • sincronizando..." : ""}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={driverFilter}
              onChange={(event) => setDriverFilter(event.target.value)}
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
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
              onClick={() => {
                void loadData({ silent: true, notifyOnError: true });
                void loadDispatchBoard();
              }}
              className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:text-slate-200"
            >
              {refreshing ? "Actualizando..." : "Actualizar"}
            </button>
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Rutas filtradas</p>
          <p className="mt-1 text-xl font-bold dark:text-[#e0e0e0]">{routeHealthSummary.total}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Activas</p>
          <p className="mt-1 text-xl font-bold text-route">{routeHealthSummary.active}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Con geo incompleta</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{routeHealthSummary.degradedGeo}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Tracking en atención</p>
          <p className="mt-1 text-xl font-bold text-rose-600">{routeHealthSummary.trackingAttention}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Trazo aproximado</p>
          <p className="mt-1 text-xl font-bold text-orange-600">{routeHealthSummary.approximateGeometry}</p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Custodia en sede</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Paquetes recibidos físicamente y disponibles para proponer un despacho por zona y tamaño.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={dispatchZoneFilter}
              onChange={(event) => {
                setDispatchZoneFilter(event.target.value);
                setDispatchProposal(null);
                setDispatchProposalError(null);
              }}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
            >
              <option value="all">Todas las zonas</option>
              {Object.keys(dispatchBoard?.summary.by_zone ?? {}).sort().map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
            <select
              value={dispatchSizeFilter}
              onChange={(event) => {
                setDispatchSizeFilter(event.target.value as DispatchSizeCode | "all");
                setDispatchProposal(null);
                setDispatchProposalError(null);
              }}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
            >
              <option value="all">Todos los tamaños</option>
              <option value="small">Pequeños</option>
              <option value="medium">Medianos</option>
              <option value="large">Grandes</option>
            </select>
            <button
              type="button"
              onClick={() => void loadDispatchBoard()}
              disabled={dispatchBoardLoading}
              className="min-h-10 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary disabled:opacity-60"
            >
              {dispatchBoardLoading ? "Consultando..." : "Actualizar custodia"}
            </button>
          </div>
        </div>

        {dispatchBoardLoading && !dispatchBoard ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : dispatchBoardError ? (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
            <span>{dispatchBoardError}</span>
            <button
              type="button"
              onClick={() => void loadDispatchBoard()}
              className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold dark:border-amber-500/40"
            >
              Comprobar de nuevo
            </button>
          </div>
        ) : dispatchBoard ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Disponibles</p>
                <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{dispatchBoard.summary.total}</p>
              </div>
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/30 dark:bg-sky-500/10">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Pequeños</p>
                <p className="mt-1 text-xl font-bold text-sky-800 dark:text-sky-200">{dispatchBoard.summary.by_size.small}</p>
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Medianos</p>
                <p className="mt-1 text-xl font-bold text-indigo-800 dark:text-indigo-200">{dispatchBoard.summary.by_size.medium}</p>
              </div>
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-500/30 dark:bg-violet-500/10">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Grandes</p>
                <p className="mt-1 text-xl font-bold text-violet-800 dark:text-violet-200">{dispatchBoard.summary.by_size.large}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Frágiles / sin geo</p>
                <p className="mt-1 text-xl font-bold text-amber-800 dark:text-amber-200">
                  {dispatchBoard.summary.fragile} / {dispatchBoard.summary.missing_coordinates}
                </p>
              </div>
            </div>

            {dispatchBoard.groups.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-[#2a2a3e]">
                No hay paquetes en custodia de sede con estos filtros.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {dispatchBoard.groups.map((group) => (
                  <details key={`${group.zone ?? "none"}-${group.city ?? "none"}`} className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {group.zone || "Sin zona"} · {group.city || "Sin ciudad"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {group.total} paquetes · {group.fragile_count} frágiles · {group.by_size.small} pequeños / {group.by_size.medium} medianos / {group.by_size.large} grandes
                          </p>
                        </div>
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">Ver paquetes</span>
                      </div>
                    </summary>
                    <div className="mt-3 space-y-2">
                      {group.items.map((shipment) => (
                        <div key={shipment.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs dark:border-[#2a2a3e] dark:bg-[#16162a]">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2">
                              <input
                                type="checkbox"
                                checked={dispatchSelectedShipmentIds.includes(shipment.id)}
                                onChange={() => toggleDispatchShipment(shipment.id)}
                                aria-label={`Seleccionar ${shipment.display_code}`}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                              />
                              <div>
                              <p className="font-semibold text-slate-900 dark:text-slate-100">{shipment.display_code}</p>
                              <p className="text-slate-500 dark:text-slate-400">{shipment.recipient_name} · {shipment.recipient_address}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-700 dark:bg-[#1a1a2e] dark:text-slate-200">{shipment.size_label}</span>
                              {shipment.is_fragile ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">Frágil</span> : null}
                            </div>
                          </div>
                          <p className="mt-1 text-slate-500 dark:text-slate-400">
                            {shipment.approx_weight_kg !== null ? `${shipment.approx_weight_kg} kg · ` : ""}{shipment.recipient_lat === null || shipment.recipient_lng === null ? "Sin coordenadas" : "Coordenadas listas"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}

            <div className="mt-5 rounded-xl border border-primary/20 bg-primary/[0.03] p-3 dark:border-primary/30 dark:bg-primary/[0.06]">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Proponer despacho</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Selecciona paquetes y pilotos. La propuesta es referencial y no crea rutas ni cambia custodias.
                  </p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-primary dark:bg-[#1a1a2e]">
                  Solo lectura
                </span>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                <fieldset className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                  <legend className="px-1 text-xs font-semibold text-slate-700 dark:text-slate-200">Pilotos disponibles</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {drivers.filter((driver) => driver.status === "active" || driver.status === "route").map((driver) => (
                      <label key={driver.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={dispatchSelectedDriverIds.includes(driver.id)}
                          onChange={() => toggleDispatchDriver(driver.id)}
                          aria-label={`Seleccionar piloto ${driver.name}`}
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span className="truncate">{driver.name}</span>
                        <span className="text-[10px] text-slate-400">{driver.zone || "sin zona"}</span>
                      </label>
                    ))}
                  </div>
                  {drivers.filter((driver) => driver.status === "active" || driver.status === "route").length === 0 ? (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">No hay pilotos activos disponibles.</p>
                  ) : null}
                </fieldset>

                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Carga seleccionada</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                    {dispatchSelectedShipmentIds.length} paquete(s)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setDispatchSelectedShipmentIds(dispatchBoard.shipments.map((shipment) => shipment.id))}
                      className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-[#3a3a4e] dark:text-slate-200"
                    >
                      Seleccionar todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setDispatchSelectedShipmentIds([])}
                      className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-[#3a3a4e] dark:text-slate-200"
                    >
                      Limpiar
                    </button>
                  </div>
                  <label className="mt-3 block text-xs text-slate-500 dark:text-slate-400">
                    Límite opcional por piloto
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={dispatchMaxPackagesPerDriver}
                      onChange={(event) => setDispatchMaxPackagesPerDriver(event.target.value)}
                      placeholder="Capacidad estimada"
                      className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-xs text-slate-800 dark:border-[#3a3a4e] dark:bg-[#1a1a2e] dark:text-slate-100"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void requestDispatchProposal()}
                  disabled={dispatchProposalLoading}
                  className="min-h-10 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {dispatchProposalLoading ? "Calculando..." : "Calcular propuesta"}
                </button>
              </div>

              {dispatchProposalError ? (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                  {dispatchProposalError}
                </p>
              ) : null}

              {dispatchProposal ? (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Candidatos</p>
                      <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{dispatchProposal.totals.candidates}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300">Propuestos</p>
                      <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200">{dispatchProposal.totals.assigned}</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-500/30 dark:bg-amber-500/10">
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">Sin asignar</p>
                      <p className="text-lg font-bold text-amber-800 dark:text-amber-200">{dispatchProposal.totals.unassigned}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-2">
                    {dispatchProposal.proposals.map((proposal) => (
                      <article key={proposal.driver.id} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{proposal.driver.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {proposal.driver.vehicle || "Vehículo sin definir"} · {proposal.driver.zone || "sin zona"}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-[#24243a] dark:text-slate-200">
                            {proposal.assigned_count}/{proposal.capacity.available_before_proposal} paquetes
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          {proposal.estimated_distance_km !== null ? `${proposal.estimated_distance_km} km estimados` : "Sin origen geográfico"}
                          {proposal.estimated_duration_min !== null ? ` · ${proposal.estimated_duration_min} min` : ""}
                          {` · ${proposal.optimization_source}`}
                        </p>
                        {proposal.warnings.map((warning) => (
                          <p key={warning} className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{warning}</p>
                        ))}
                        <ol className="mt-2 space-y-1 text-xs text-slate-700 dark:text-slate-200">
                          {proposal.shipments.map((shipment) => (
                            <li key={shipment.id} className="flex gap-2 rounded-md bg-slate-50 px-2 py-1 dark:bg-[#1a1a2e]">
                              <span className="font-semibold text-primary">{shipment.sequence}.</span>
                              <span className="min-w-0 truncate">{shipment.display_code} · {shipment.recipient_name || "Sin destinatario"}</span>
                              {!shipment.has_coordinates ? <span className="ml-auto text-[10px] text-amber-600">sin geo</span> : null}
                            </li>
                          ))}
                        </ol>
                      </article>
                    ))}
                  </div>

                  {dispatchProposal.unassigned.length > 0 ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                      {dispatchProposal.unassigned.length} paquete(s) quedaron sin asignar por capacidad disponible.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </section>

      {!loading && activeRoutes.length > 0 ? (
        <section
          id="route-live-monitor"
          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Centro de monitoreo activo</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Seguimiento operativo del piloto, su ubicacion reportada y la siguiente secuencia de entrega.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                {activeRoutes.length} rutas activas
              </span>
              <span className="rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                {routeHealthSummary.critical} criticas
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {routeHealthSummary.warning} en atencion
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                {routeHealthSummary.healthy} estables
              </span>
              <span className="rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                {routeHealthSummary.noSignal} sin señal
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {routeHealthSummary.staleLocation} vencidas
              </span>
              <span className="rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                {routeHealthSummary.recentLocation} recientes
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {routeHealthSummary.degradedGeo} con geo incompleta
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="order-1 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Pilotos en monitoreo</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    En celular, toca un piloto para enfocar su ruta y leer su estado operativo sin perder contexto.
                  </p>
                </div>
                <div className="mt-3 flex gap-3 overflow-x-auto pb-1 xl:block xl:space-y-2 xl:overflow-visible xl:pb-0">
                  {activeRoutes.map((route) => {
                    const health = routeHealthById.get(route.id) ?? routeHealth(route);
                    const freshnessUi = freshnessPresentation(route);
                    const currentStop = [...route.stops]
                      .filter((stop) => stop.status !== "completed")
                      .sort((left, right) => left.sort_order - right.sort_order)[0] ?? null;
                    const isFocused = focusedActiveRoute?.id === route.id;

                    return (
                      <button
                        key={route.id}
                        type="button"
                        onClick={() => openLiveMonitor(route.id)}
                        className={`min-w-[260px] shrink-0 rounded-xl border p-3 text-left transition xl:w-full ${
                          isFocused
                            ? "border-primary bg-primary/5 shadow-sm dark:border-primary"
                            : "border-slate-200 bg-white hover:border-primary/40 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {route.driver?.name || `Ruta #${route.id}`}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Ruta #{route.id} • {route.zone || "Sin zona"}
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${freshnessUi.chipClassName}`}>
                            {route.driver_location ? `${freshnessUi.label} - ${ageLabel(route.driver_location.age_seconds)}` : freshnessUi.label}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">
                            {health.pendingStops} pendientes
                          </span>
                          {health.issueStops > 0 ? (
                            <span className="rounded-full bg-rose-50 px-2 py-1 font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                              {health.issueStops} novedades
                            </span>
                          ) : null}
                          {health.missingGeoStops > 0 ? (
                            <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                              {health.missingGeoStops} sin geo
                            </span>
                          ) : null}
                          {!health.hasStreetGeometry ? (
                            <span className="rounded-full bg-orange-50 px-2 py-1 font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                              trazo aproximado
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                          <span className="font-semibold">Parada actual:</span>{" "}
                          {currentStop
                            ? `${currentStop.shipment.display_code} • ${currentStop.shipment.recipient_name || "Sin destinatario"}`
                            : "Sin parada pendiente"}
                        </p>
                        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                          {route.driver_location
                            ? `Último ping ${ageLabel(route.driver_location.age_seconds)} - ${absoluteDateTimeLabel(route.driver_location.updated_at)}`
                            : "Esperando señal del piloto"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            <div className="order-2">
              {focusedActiveRoute ? (
                <RouteMonitorCard route={focusedActiveRoute} className="mt-0" />
              ) : (
                <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 text-center text-sm text-slate-500 dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-slate-400">
                  No hay una ruta activa lista para monitorear.
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-72" />
          ))}
        </div>
      ) : (
        <section className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <h2 className="text-base font-bold text-slate-900 dark:text-[#e0e0e0]">Tablero de estados</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Vista operativa adaptada para celular y escritorio, priorizando estado, accion y lectura rapida.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {lanes.map((lane) => (
              <article
                key={lane.key}
                className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{lane.label}</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {laneDescription[lane.key]}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">
                    {grouped[lane.key].length}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {grouped[lane.key].map((route) => {
                    const orderedStops = [...route.stops].sort((a, b) => a.sort_order - b.sort_order);
                    const mobileStopPreview = orderedStops.slice(0, 2);
                    const pilotCustodyStops = orderedStops.filter(
                      (stop) => stop.shipment.custody?.new_custodian_type === "driver"
                    ).length;
                    const hubCustodyStops = orderedStops.filter(
                      (stop) => stop.shipment.custody?.new_custodian_type === "hub"
                    ).length;
                    const pendingCustodyStops = orderedStops.length - pilotCustodyStops;
                    const health = routeHealthById.get(route.id) ?? routeHealth(route);
                    return (
                      <div key={route.id} className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold dark:text-[#e0e0e0]">Ruta #{route.id}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {route.driver?.name || "Sin piloto"} • {route.zone || "Sin zona"}
                            </p>
                          </div>
                          <div className="hidden sm:flex sm:flex-col sm:items-stretch sm:gap-2 md:flex-row md:items-center">
                            <button
                              type="button"
                              onClick={() => toggleRouteDetails(route)}
                              className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e]"
                            >
                              {route.status === "active"
                                ? focusedActiveRoute?.id === route.id
                                  ? "En monitor"
                                  : "Abrir monitor"
                                : expandedRouteId === route.id
                                  ? "Ocultar"
                                  : "Detalles"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void openManifest(route.id)}
                              className="rounded border border-primary/40 px-2 py-1 text-xs font-semibold text-primary dark:border-primary/50"
                            >
                              Manifiesto
                            </button>
                            {route.status === "planned" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (pendingCustodyStops > 0) {
                                    void openManifest(route.id);
                                    return;
                                  }
                                  void startRoute(route.id);
                                }}
                                className={`rounded border px-2 py-1 text-xs dark:border-[#2a2a3e] ${pendingCustodyStops > 0 ? "border-primary/40 font-semibold text-primary" : "border-slate-300"}`}
                              >
                                {pendingCustodyStops > 0 ? "Revisar custodia" : "Iniciar"}
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

                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                            {pilotCustodyStops}/{orderedStops.length} con piloto
                          </span>
                          {hubCustodyStops > 0 ? (
                            <span className="rounded-full bg-sky-50 px-2 py-1 font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                              {hubCustodyStops} en sede
                            </span>
                          ) : null}
                          {pendingCustodyStops > 0 ? (
                            <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                              {pendingCustodyStops} custodia pendiente
                            </span>
                          ) : null}
                          {health.missingGeoStops > 0 ? (
                            <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                              {health.missingGeoStops} sin geo
                            </span>
                          ) : null}
                          {health.locationFreshness === "missing" && route.status === "active" ? (
                            <span className="rounded-full bg-rose-50 px-2 py-1 font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                              Sin ubicación
                            </span>
                          ) : null}
                          {health.locationFreshness === "stale" && route.status === "active" ? (
                            <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                              Ubicación vencida
                            </span>
                          ) : null}
                          {health.locationFreshness === "recent" && route.status === "active" ? (
                            <span className="rounded-full bg-sky-50 px-2 py-1 font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                              Señal reciente
                            </span>
                          ) : null}
                          {route.status === "active" && health.pendingStops > 0 && !health.hasStreetGeometry ? (
                            <span className="rounded-full bg-orange-50 px-2 py-1 font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                              Trazo aproximado
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 grid gap-2 sm:hidden">
                          <button
                            type="button"
                            onClick={() => toggleRouteDetails(route)}
                            className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:text-slate-200"
                          >
                            {route.status === "active"
                              ? focusedActiveRoute?.id === route.id
                                ? "Ver monitor actual"
                                : "Abrir monitor"
                              : expandedRouteId === route.id
                                ? "Ocultar detalles"
                                : "Ver detalles"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void openManifest(route.id)}
                            className="min-h-11 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary transition-all duration-150 active:scale-95"
                          >
                            Ver manifiesto
                          </button>
                          {route.status === "planned" ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (pendingCustodyStops > 0) {
                                  void openManifest(route.id);
                                  return;
                                }
                                void startRoute(route.id);
                              }}
                              className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 active:scale-95 ${pendingCustodyStops > 0 ? "border border-primary/40 text-primary" : "bg-primary text-white"}`}
                            >
                              {pendingCustodyStops > 0 ? "Revisar custodia" : "Iniciar ruta"}
                            </button>
                          ) : null}
                        </div>

                        {expandedRouteId === route.id && route.status !== "active" ? <RouteMonitorCard route={route} /> : null}

                        <div className="mt-3 space-y-2 md:hidden">
                          {mobileStopPreview.map((stop) => (
                            <div
                              key={`mobile-preview-${stop.id}`}
                              className="rounded-lg border border-slate-200 p-2 text-xs dark:border-[#2a2a3e]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-semibold dark:text-[#e0e0e0]">{stop.shipment.display_code}</p>
                                  <p className="text-slate-500 dark:text-slate-400">{stop.shipment.recipient_name || "Sin destinatario"}</p>
                                </div>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">
                                  {routeStopStatusLabel(stop.status)}
                                </span>
                              </div>
                              <p className="mt-1 text-slate-500 dark:text-slate-400">{stop.shipment.recipient_address || "Sin dirección"}</p>
                              {renderHandoverControls(route, stop)}
                            </div>
                          ))}
                          {orderedStops.length > mobileStopPreview.length ? (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              +{orderedStops.length - mobileStopPreview.length} paradas adicionales. Usa detalles o monitor para profundizar.
                            </p>
                          ) : null}
                        </div>

                        <div className="mt-3 hidden space-y-2 md:block">
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
                              <p className="text-slate-500 dark:text-slate-400">{stop.shipment.recipient_address || "Sin dirección"}</p>
                              {renderHandoverControls(route, stop)}
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
        </section>
      )}

      {manifestLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" role="status">
          <div className="rounded-xl bg-white px-5 py-4 text-sm font-semibold text-slate-800 shadow-xl dark:bg-[#1a1a2e] dark:text-slate-100">
            Generando manifiesto...
          </div>
        </div>
      ) : null}

      {manifestError ? (
        <div className="fixed bottom-4 right-4 z-[60] max-w-sm rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 shadow-lg dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200" role="alert">
          {manifestError}
        </div>
      ) : null}

      {manifest ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="manifest-title">
          <section className="mobile-modal-safe-area h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 shadow-xl dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Manifiesto de despacho</p>
                <h2 id="manifest-title" className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{manifest.manifest_code}</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Ruta #{manifest.route.id} · {manifest.route.driver?.name || "Sin piloto"} · {manifest.route.zone || "Sin zona"} · {manifest.route.date}
                </p>
              </div>
              <div className="flex gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-10 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
                >
                  Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => setManifest(null)}
                  className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e]"
                  aria-label="Cerrar manifiesto"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Total</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{manifest.custody.total}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">Aceptados por piloto</p>
                <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200">{manifest.custody.accepted_by_pilot}</p>
              </div>
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/30 dark:bg-sky-500/10">
                <p className="text-[11px] text-sky-700 dark:text-sky-300">Siguen en sede</p>
                <p className="text-lg font-bold text-sky-800 dark:text-sky-200">{manifest.custody.in_hub}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="text-[11px] text-amber-700 dark:text-amber-300">Pendientes</p>
                <p className="text-lg font-bold text-amber-800 dark:text-amber-200">{manifest.custody.pending}</p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-[#2a2a3e]">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-[#16162a] dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Guía</th>
                    <th className="px-3 py-2">Destinatario</th>
                    <th className="px-3 py-2">Dirección</th>
                    <th className="px-3 py-2">Cobro</th>
                    <th className="px-3 py-2">Custodia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a3e]">
                  {manifest.items.map((item) => (
                    <tr key={item.route_stop_id} className="text-slate-700 dark:text-slate-200">
                      <td className="px-3 py-2 font-semibold text-primary">{item.sequence}</td>
                      <td className="px-3 py-2 font-semibold">{item.guide.display_code || item.guide.tracking_code || "Sin guía"}</td>
                      <td className="px-3 py-2">{item.recipient.name || "Sin destinatario"}<br /><span className="text-[11px] text-slate-500">{item.recipient.phone || "Sin teléfono"}</span></td>
                      <td className="max-w-xs px-3 py-2">{item.recipient.address || "Sin dirección"}<br /><span className="text-[11px] text-slate-500">{item.recipient.zone || "Sin zona"} · {item.recipient.city || "Sin ciudad"}</span></td>
                      <td className="px-3 py-2">{item.collection.payment_type || "Sin definir"}{item.collection.cod_amount ? <><br /><span className="font-semibold">${item.collection.cod_amount.toLocaleString("es-CO")}</span></> : null}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${item.custody.scan_confirmed ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"}`}>
                          {item.custody.scan_confirmed ? "Con piloto" : item.custody.state === "in_hub" ? "En sede" : "Sin confirmar"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
              Generado {absoluteDateTimeLabel(manifest.generated_at)}. Este manifiesto es una vista operativa; la aceptación física se confirma con escaneo o entrega manual autorizada.
            </p>
          </section>
        </div>
      ) : null}

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
                          {shipment.recipient_name || "Sin destinatario"} • {shipment.recipient_address || "Sin dirección"}
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



