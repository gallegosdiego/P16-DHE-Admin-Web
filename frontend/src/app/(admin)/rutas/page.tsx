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
  Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

type RouteHealth = {
  pendingStops: number;
  issueStops: number;
  missingGeoStops: number;
  missingGeoCodes: string[];
  hasLiveLocation: boolean;
  locationFreshness: "live" | "stale" | "missing";
  hasStreetGeometry: boolean;
};

const ageLabel = (ageSeconds?: number | null) => {
  if (ageSeconds === null || ageSeconds === undefined) return "sin hora";
  if (ageSeconds < 60) return "hace menos de 1 min";
  if (ageSeconds < 3600) return `hace ${Math.floor(ageSeconds / 60)} min`;
  return `hace ${Math.floor(ageSeconds / 3600)} h`;
};

const stopTone = (status?: string, current?: boolean) => {
  if (current) return "#d1007f";
  if (status === "completed") return "#16a34a";
  if (status === "issue") return "#dc2626";
  return "#f59e0b";
};

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
  const remainingStops = health.pendingStops;
  const metrics = route.route_metrics ?? null;
  const geometrySourceLabel = geometry?.hasStreetGeometry ? "Ruta vial real" : "Trazo aproximado";

  return (
    <div className={`${className} rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]`}>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
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
        <span
          className={`rounded-full px-2 py-1 font-semibold ${
            route.driver_location?.freshness === "live"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          }`}
        >
          {route.driver_location ? `Ubicaci?n ${ageLabel(route.driver_location.age_seconds)}` : "Sin ubicaci?n viva"}
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

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_320px]">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Piloto</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {route.driver?.name || "Sin piloto"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {route.driver_location
                  ? `Ubicación ${ageLabel(route.driver_location.age_seconds)}`
                  : "Sin ubicación viva"}
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
        </div>

        <aside className="space-y-3">
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
                  {route.driver_location ? ageLabel(route.driver_location.age_seconds) : "sin señal"}
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
  }, [driverFilter]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadData({ silent: true, notifyOnError: false });
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

  const routeHealthById = useMemo(() => (
    new Map(routes.map((route) => [route.id, routeHealth(route)]))
  ), [routes]);

  const routeHealthSummary = useMemo(() => {
    const filteredRoutes = [
      ...grouped.planned,
      ...grouped.active,
      ...grouped.completed,
    ];
    const activeRoutes = filteredRoutes.filter((route) => route.status === "active");

    const degradedGeo = filteredRoutes.filter((route) => (routeHealthById.get(route.id)?.missingGeoStops ?? 0) > 0);
    const missingLiveLocation = activeRoutes.filter(
      (route) => (routeHealthById.get(route.id)?.locationFreshness ?? "missing") !== "live"
    );
    const approximateGeometry = activeRoutes.filter((route) => {
      const health = routeHealthById.get(route.id);
      return Boolean(health && health.pendingStops > 0 && !health.hasStreetGeometry);
    });

    return {
      total: filteredRoutes.length,
      active: activeRoutes.length,
      degradedGeo: degradedGeo.length,
      missingLiveLocation: missingLiveLocation.length,
      approximateGeometry: approximateGeometry.length,
    };
  }, [grouped, routeHealthById]);

  const activeRoutes = grouped.active;

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
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {lastUpdatedAt
                ? `Última actualización ${lastUpdatedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                : "Esperando primera sincronización"}
              {refreshing ? " · sincronizando..." : ""}
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
              onClick={() => void loadData({ silent: true, notifyOnError: true })}
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
          <p className="text-xs text-slate-500 dark:text-slate-400">Sin ubicación viva</p>
          <p className="mt-1 text-xl font-bold text-rose-600">{routeHealthSummary.missingLiveLocation}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Trazo aproximado</p>
          <p className="mt-1 text-xl font-bold text-orange-600">{routeHealthSummary.approximateGeometry}</p>
        </article>
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
                {routeHealthSummary.missingLiveLocation} sin tracking vivo
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {routeHealthSummary.degradedGeo} con geo incompleta
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="order-2 space-y-3 xl:order-1">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Pilotos en monitoreo</p>
                <div className="mt-3 space-y-2">
                  {activeRoutes.map((route) => {
                    const health = routeHealthById.get(route.id) ?? routeHealth(route);
                    const currentStop = [...route.stops]
                      .filter((stop) => stop.status !== "completed")
                      .sort((left, right) => left.sort_order - right.sort_order)[0] ?? null;
                    const isFocused = focusedActiveRoute?.id === route.id;

                    return (
                      <button
                        key={route.id}
                        type="button"
                        onClick={() => openLiveMonitor(route.id)}
                        className={`w-full rounded-xl border p-3 text-left transition ${
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
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                              health.locationFreshness === "live"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                            }`}
                          >
                            {route.driver_location ? ageLabel(route.driver_location.age_seconds) : "sin ubicaci?n"}
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
                            ? `${currentStop.shipment.display_code} · ${currentStop.shipment.recipient_name || "Sin destinatario"}`
                            : "Sin parada pendiente"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            <div className="order-1 xl:order-2">
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
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{lane.label}</h2>
                <div className="mt-3 space-y-3">
                  {grouped[lane.key].map((route) => {
                    const orderedStops = [...route.stops].sort((a, b) => a.sort_order - b.sort_order);
                    const mobileStopPreview = orderedStops.slice(0, 2);
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
                          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
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

                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          {health.missingGeoStops > 0 ? (
                            <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                              {health.missingGeoStops} sin geo
                            </span>
                          ) : null}
                          {health.locationFreshness !== "live" && route.status === "active" ? (
                            <span className="rounded-full bg-rose-50 px-2 py-1 font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                              {health.locationFreshness === "missing" ? "Sin ubicación viva" : "Ubicación vencida"}
                            </span>
                          ) : null}
                          {route.status === "active" && health.pendingStops > 0 && !health.hasStreetGeometry ? (
                            <span className="rounded-full bg-orange-50 px-2 py-1 font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                              Trazo aproximado
                            </span>
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
                              <p className="mt-1 text-slate-500 dark:text-slate-400">{stop.shipment.recipient_address || "Sin direcci?n"}</p>
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
                              <p className="text-slate-500 dark:text-slate-400">{stop.shipment.recipient_address || "Sin direcci?n"}</p>
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
