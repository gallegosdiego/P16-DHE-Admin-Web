"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend, apiPost, describeApiError } from "@/lib/api";
import { usePageTitle } from "@/lib/page-title";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import type {
  AddressPreviewCandidate,
  AddressPreviewResponse,
  PaginatedResponse,
  Shipment,
  ShipmentGeoSummaryResponse,
  Zone,
} from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  HelpTip,
  Input,
  KpiCard,
  MobileListCard,
  SearchInput,
  Select,
  TableScroller,
} from "@/components/ui";

function formatDateShort(isoString: string): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function getReasonLabel(shipment: Shipment): string {
  if (shipment.geocoding_reason_label) {
    return shipment.geocoding_reason_label;
  }
  if (!shipment.recipient_address || shipment.recipient_address.trim().length === 0) {
    return "Dirección vacía";
  }
  if (shipment.geocoding_reason === "address_too_short") {
    return "Dirección demasiado corta";
  }
  if (shipment.geocoding_reason === "provider_no_match") {
    return "Proveedor sin coincidencia";
  }
  if (shipment.geocoding_reason === "missing_location_context") {
    return "Sin contexto de zona/ciudad";
  }
  if (!shipment.recipient_zone) {
    return "Sin zona asignada";
  }
  if (!shipment.recipient_lat || !shipment.recipient_lng) {
    return "Sin coordenadas";
  }
  return "Revisión requerida";
}

function getReasonBadgeTone(shipment: Shipment): "warning" | "danger" | "neutral" | "info" {
  if (shipment.geocoding_status === "blocked") return "danger";
  if (!shipment.recipient_zone) return "warning";
  if (!shipment.recipient_lat || !shipment.recipient_lng) return "warning";
  return "neutral";
}

export default function PorRevisarPage() {
  usePageTitle("Ubicación por revisar | Bodega");
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [geoSummary, setGeoSummary] = useState<ShipmentGeoSummaryResponse["summary"] | null>(null);

  // Filtros locales
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "no_coords" | "no_zone" | "blocked">("all");

  // Catálogo dinámico de zonas
  const [zonesCatalog, setZonesCatalog] = useState<Zone[]>([]);
  const [zonesLoadFailed, setZonesLoadFailed] = useState(false);

  // Modal de corrección
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);
  const [formAddress, setFormAddress] = useState("");
  const [formCity, setFormCity] = useState("Bogotá");
  const [formZone, setFormZone] = useState("");
  const [formLat, setFormLat] = useState<number | null>(null);
  const [formLng, setFormLng] = useState<number | null>(null);

  // Verificación / Candidatos
  const [verifying, setVerifying] = useState(false);
  const [candidates, setCandidates] = useState<AddressPreviewCandidate[]>([]);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 1. Cargar envíos sin coordenadas, resumen geográfico y catálogo oficial de zonas
      const [shipmentsRes, geoSummaryRes, zonesRes] = await Promise.all([
        apiGet<PaginatedResponse<Shipment>>("/shipments?has_coordinates=0&per_page=100"),
        apiGet<ShipmentGeoSummaryResponse>("/shipments/geo-summary").catch(() => null),
        apiGet<Zone[]>("/zones").catch(() => null),
      ]);

      const items = Array.isArray(shipmentsRes?.data)
        ? shipmentsRes.data
        : Array.isArray(shipmentsRes)
        ? (shipmentsRes as unknown as Shipment[])
        : [];

      setShipments(items);
      if (geoSummaryRes?.summary) {
        setGeoSummary(geoSummaryRes.summary);
      }

      if (Array.isArray(zonesRes)) {
        setZonesCatalog(zonesRes.filter((z) => z.is_active));
        setZonesLoadFailed(false);
      } else {
        setZonesLoadFailed(true);
        showToast("No se pudo cargar el catálogo de zonas; puedes ingresar la zona manualmente.", "error");
      }
    } catch (err) {
      const errorPresentation = describeApiError(err, "No fue posible cargar los envíos por revisar.");
      showToast(errorPresentation.message, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  // Orden: más antiguos primero
  const sortedAndFilteredShipments = useMemo(() => {
    let list = [...shipments];

    // Orden más antiguos primero
    list.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeA - timeB;
    });

    // Filtro por tipo
    if (filterType === "no_coords") {
      list = list.filter((s) => !s.recipient_lat || !s.recipient_lng);
    } else if (filterType === "no_zone") {
      list = list.filter((s) => !s.recipient_zone || s.recipient_zone.trim() === "");
    } else if (filterType === "blocked") {
      list = list.filter(
        (s) =>
          s.geocoding_status === "blocked" ||
          s.geocoding_reason === "address_too_short" ||
          s.geocoding_reason === "missing_address"
      );
    }

    // Búsqueda por texto
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          (s.display_code && s.display_code.toLowerCase().includes(query)) ||
          (s.tracking_code && s.tracking_code.toLowerCase().includes(query)) ||
          (s.recipient_name && s.recipient_name.toLowerCase().includes(query)) ||
          (s.recipient_address && s.recipient_address.toLowerCase().includes(query)) ||
          (s.recipient_zone && s.recipient_zone.toLowerCase().includes(query))
      );
    }

    return list;
  }, [shipments, filterType, searchQuery]);

  // Contadores de métricas
  const kpis = useMemo(() => {
    const total = geoSummary?.needs_location_review ?? shipments.length;
    const noCoords = shipments.filter((s) => !s.recipient_lat || !s.recipient_lng).length;
    const noZone = shipments.filter((s) => !s.recipient_zone || s.recipient_zone.trim() === "").length;
    const blocked = shipments.filter(
      (s) =>
        s.geocoding_status === "blocked" ||
        s.geocoding_reason === "address_too_short" ||
        s.geocoding_reason === "missing_address"
    ).length;

    return { total, noCoords, noZone, blocked };
  }, [shipments, geoSummary]);

  // Abrir modal de corrección
  function openCorrection(shipment: Shipment) {
    setEditingShipment(shipment);
    setFormAddress(shipment.recipient_address || "");
    setFormCity(shipment.recipient_city || "Bogotá");
    setFormZone(shipment.recipient_zone || "");
    setFormLat(shipment.recipient_lat ? Number(shipment.recipient_lat) : null);
    setFormLng(shipment.recipient_lng ? Number(shipment.recipient_lng) : null);
    setCandidates([]);
    setPreviewMessage(null);
  }

  function closeCorrection() {
    setEditingShipment(null);
    setCandidates([]);
    setPreviewMessage(null);
  }

  // Verificar dirección con API
  async function handleVerifyAddress() {
    if (!formAddress.trim()) {
      showToast("Ingresa una dirección para verificar.", "info");
      return;
    }

    setVerifying(true);
    setPreviewMessage(null);
    setCandidates([]);

    try {
      const payload = {
        recipient_address: formAddress.trim(),
        recipient_city: formCity.trim() || "Bogotá",
        recipient_zone: formZone.trim() || undefined,
        limit: 4,
      };

      const res = await apiPost<AddressPreviewResponse>("/shipments/address-preview", payload);

      if (res) {
        if (res.candidates && res.candidates.length > 0) {
          setCandidates(res.candidates);
        } else if (res.has_coordinates && res.recipient_lat && res.recipient_lng) {
          setCandidates([
            {
              label: res.address || formAddress,
              formatted_address: res.address || formAddress,
              lat: res.recipient_lat,
              lng: res.recipient_lng,
              zone: res.zone || formZone,
              confidence: "exact",
              provider: "geocoder",
            },
          ]);
        }

        if (res.zone && !formZone) {
          setFormZone(res.zone);
        }
        if (res.recipient_lat && res.recipient_lng) {
          setFormLat(res.recipient_lat);
          setFormLng(res.recipient_lng);
        }

        setPreviewMessage(res.message || (res.candidates?.length ? "Candidatos encontrados." : null));
      }
    } catch (err) {
      const errorPresentation = describeApiError(err, "No se pudo verificar la dirección.");
      setPreviewMessage(errorPresentation.message);
    } finally {
      setVerifying(false);
    }
  }

  // Seleccionar candidato
  function applyCandidate(c: AddressPreviewCandidate) {
    if (c.formatted_address || c.label) {
      setFormAddress(c.formatted_address || c.label);
    }
    if (c.zone) {
      setFormZone(c.zone);
    }
    if (c.lat != null) setFormLat(c.lat);
    if (c.lng != null) setFormLng(c.lng);
    showToast("Candidato seleccionado.", "info");
  }

  // Guardar corrección
  async function handleSaveCorrection() {
    if (!editingShipment) return;
    if (!formAddress.trim()) {
      showToast("La dirección es obligatoria.", "info");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        recipient_address: formAddress.trim(),
        recipient_city: formCity.trim() || "Bogotá",
        recipient_zone: formZone.trim() || null,
      };

      if (formLat != null && formLng != null) {
        payload.recipient_lat = formLat;
        payload.recipient_lng = formLng;
      }

      await apiSend(`/shipments/${editingShipment.id}`, "PUT", payload);
      showToast(`Envío ${editingShipment.display_code} corregido y re-geocodificado con éxito.`, "success");

      // Remover el envío corregido de la lista local inmediatamente
      setShipments((prev) => prev.filter((s) => s.id !== editingShipment.id));
      closeCorrection();

      // Recargar datos en segundo plano
      void loadData(true);
    } catch (err) {
      const errorPresentation = describeApiError(err, "No fue posible guardar la corrección.");
      showToast(errorPresentation.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 animate-fade-in space-y-6">
      {/* Encabezado y Navegación */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2">
            <Link
              href="/bodega"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand transition-colors hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              ← Volver a Bodega
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Ubicación por revisar
            </h1>
            <HelpTip text="Bandeja de envíos que requieren corrección de dirección, asignación de zona o desambiguación geográfica para poder entrar a las rutas de despacho." />
          </div>
          <p className="mt-1 text-sm text-ink-secondary">
            Envíos pendientes de geocodificación o sin zona asignada. Ordenados por antigüedad (los más viejos primero).
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={loading || refreshing}
          >
            {refreshing ? "Actualizando…" : "Actualizar"}
          </Button>
        </div>
      </header>

      {/* Tarjetas de Métricas Superiores */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <KpiCard
          label="Total por revisar"
          value={kpis.total}
          tone="warning"
          support="Total en bandeja"
        />
        <KpiCard
          label="Sin coordenadas"
          value={kpis.noCoords}
          tone="default"
          support="Pendientes de mapa"
        />
        <KpiCard
          label="Sin zona asignada"
          value={kpis.noZone}
          tone="warning"
          support="Falta localidad"
        />
        <KpiCard
          label="Dirección bloqueada"
          value={kpis.blocked}
          tone="danger"
          support="Corta o sin contexto"
        />
      </section>

      {/* Barra de Filtros y Búsqueda */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-md">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por guía, destinatario, dirección..."
              aria-label="Buscar en bandeja por revisar"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-secondary">Filtrar:</span>
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={`rounded-button px-2.5 py-1 text-xs font-semibold transition-colors ${
                filterType === "all"
                  ? "bg-brand text-white"
                  : "bg-surface border border-edge text-ink hover:bg-app-secondary"
              }`}
            >
              Todos ({shipments.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("no_coords")}
              className={`rounded-button px-2.5 py-1 text-xs font-semibold transition-colors ${
                filterType === "no_coords"
                  ? "bg-brand text-white"
                  : "bg-surface border border-edge text-ink hover:bg-app-secondary"
              }`}
            >
              Sin coordenadas ({kpis.noCoords})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("no_zone")}
              className={`rounded-button px-2.5 py-1 text-xs font-semibold transition-colors ${
                filterType === "no_zone"
                  ? "bg-brand text-white"
                  : "bg-surface border border-edge text-ink hover:bg-app-secondary"
              }`}
            >
              Sin zona ({kpis.noZone})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("blocked")}
              className={`rounded-button px-2.5 py-1 text-xs font-semibold transition-colors ${
                filterType === "blocked"
                  ? "bg-brand text-white"
                  : "bg-surface border border-edge text-ink hover:bg-app-secondary"
              }`}
            >
              Bloqueados ({kpis.blocked})
            </button>
          </div>
        </div>
      </Card>

      {/* Estados de Carga y Vacío */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
        </div>
      ) : sortedAndFilteredShipments.length === 0 ? (
        <EmptyState
          title="Bandeja limpia"
          description={
            searchQuery || filterType !== "all"
              ? "No se encontraron envíos que coincidan con los filtros aplicados."
              : "No hay envíos pendientes de revisión geográfica en este momento. Todos los paquetes cuentan con zona y coordenadas."
          }
          action={
            searchQuery || filterType !== "all" ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setFilterType("all");
                }}
              >
                Limpiar filtros
              </Button>
            ) : (
              <Link href="/bodega">
                <Button size="sm">Ir a Bodega</Button>
              </Link>
            )
          }
        />
      ) : (
        <>
          {/* Vista Desktop (1280px): Tabla detallada */}
          <div className="hidden lg:block">
            <Card
              title={`Envíos por revisar (${sortedAndFilteredShipments.length})`}
              headerAction={
                <span className="text-xs text-ink-secondary">
                  Orden: más antiguos primero
                </span>
              }
            >
              <TableScroller>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-edge text-ink-secondary">
                      <th className="pb-3 pl-1 font-semibold">Guía</th>
                      <th className="pb-3 font-semibold">Destinatario</th>
                      <th className="pb-3 font-semibold">Dirección original</th>
                      <th className="pb-3 font-semibold">Ciudad / Zona actual</th>
                      <th className="pb-3 font-semibold">Motivo del problema</th>
                      <th className="pb-3 font-semibold">Ingreso</th>
                      <th className="pb-3 pr-1 text-right font-semibold">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge text-ink">
                    {sortedAndFilteredShipments.map((shipment) => {
                      const reasonLabel = getReasonLabel(shipment);
                      const badgeTone = getReasonBadgeTone(shipment);

                      return (
                        <tr
                          key={shipment.id}
                          className="transition-colors hover:bg-app-secondary/60"
                        >
                          {/* Guía */}
                          <td className="py-3 pl-1 font-medium">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-ink">{shipment.display_code}</span>
                              {shipment.is_fragile ? (
                                <span
                                  className="inline-flex rounded bg-amber-500/20 px-1 py-0.2 text-[10px] font-bold text-amber-800 dark:text-amber-300"
                                  title="Frágil"
                                >
                                  F
                                </span>
                              ) : null}
                            </div>
                            <span className="block text-[11px] text-ink-secondary">
                              {shipment.tracking_code}
                            </span>
                          </td>

                          {/* Destinatario */}
                          <td className="py-3">
                            <p className="font-semibold text-ink max-w-[140px] truncate">
                              {shipment.recipient_name || "Sin nombre"}
                            </p>
                            <p className="text-[11px] text-ink-secondary">
                              {shipment.recipient_phone || "Sin teléfono"}
                            </p>
                          </td>

                          {/* Dirección original */}
                          <td className="py-3 max-w-[220px]">
                            <p className="font-mono text-xs text-ink truncate" title={shipment.recipient_address}>
                              {shipment.recipient_address || "Sin dirección"}
                            </p>
                            {shipment.client?.name ? (
                              <p className="text-[11px] text-ink-secondary truncate">
                                Cliente: {shipment.client.name}
                              </p>
                            ) : null}
                          </td>

                          {/* Ciudad / Zona actual */}
                          <td className="py-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-ink">
                                {shipment.recipient_city || "Bogotá"}
                              </span>
                              {shipment.recipient_zone ? (
                                <span className="text-[11px] text-ink-secondary">
                                  {shipment.recipient_zone}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                                  ⚠️ Sin zona
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Motivo del problema */}
                          <td className="py-3">
                            <Badge tone={badgeTone}>{reasonLabel}</Badge>
                          </td>

                          {/* Ingreso */}
                          <td className="py-3 text-[11px] text-ink-secondary whitespace-nowrap">
                            {formatDateShort(shipment.created_at || "")}
                          </td>

                          {/* Acción */}
                          <td className="py-3 pr-1 text-right">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openCorrection(shipment)}
                            >
                              Corregir
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroller>
            </Card>
          </div>

          {/* Vista Mobile (375px): Tarjetas Apiladas */}
          <div className="space-y-3 lg:hidden">
            <div className="px-1 text-xs font-bold uppercase tracking-wider text-ink-secondary">
              Envíos por revisar ({sortedAndFilteredShipments.length})
            </div>
            {sortedAndFilteredShipments.map((shipment) => {
              const reasonLabel = getReasonLabel(shipment);
              const badgeTone = getReasonBadgeTone(shipment);

              return (
                <MobileListCard
                  key={shipment.id}
                  title={
                    <span className="inline-flex items-center gap-2">
                      <span className="font-bold text-ink">{shipment.display_code}</span>
                      {shipment.is_fragile ? (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                          Frágil
                        </span>
                      ) : null}
                    </span>
                  }
                  subtitle={`${shipment.recipient_name || "Sin nombre"} · ${shipment.recipient_address || "Sin dirección"}`}
                  status={<Badge tone={badgeTone}>{reasonLabel}</Badge>}
                  meta={
                    <span className="block space-y-1 text-xs">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={shipment.recipient_zone ? "neutral" : "warning"}>
                          {shipment.recipient_zone || "Sin zona"}
                        </Badge>
                        <span className="text-[11px] text-ink-secondary">
                          {shipment.recipient_city || "Bogotá"}
                        </span>
                      </span>
                      <span className="block text-[11px] text-ink-secondary">
                        Ingreso: {formatDateShort(shipment.created_at || "")}
                      </span>
                    </span>
                  }
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={() => openCorrection(shipment)}
                    >
                      Corregir ubicación
                    </Button>
                  }
                />
              );
            })}
          </div>
        </>
      )}

      {/* Modal / Diálogo de Corrección de Ubicación en el Sitio */}
      {editingShipment ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-xs transition-opacity sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Corregir ubicación ${editingShipment.display_code}`}
        >
          <Card
            className="max-h-[95vh] w-full overflow-y-auto rounded-t-card sm:max-w-2xl sm:rounded-card animate-fade-in"
            title={`Corregir ubicación: ${editingShipment.display_code}`}
            headerAction={
              <button
                type="button"
                onClick={closeCorrection}
                className="rounded-full p-1 text-ink-secondary hover:bg-app-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            }
          >
            <div className="space-y-4 pt-1">
              {/* Información actual del envío */}
              <div className="rounded-lg border border-edge bg-app-secondary/40 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">
                    Destinatario: {editingShipment.recipient_name || "Sin nombre"} ({editingShipment.recipient_phone || "Sin teléfono"})
                  </span>
                  <Badge tone={getReasonBadgeTone(editingShipment)}>
                    {getReasonLabel(editingShipment)}
                  </Badge>
                </div>
                <p className="text-ink-secondary font-mono text-[11px]">
                  Original: {editingShipment.recipient_address || "Sin dirección"}
                </p>
              </div>

              {/* Formulario de edición */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-secondary mb-1">
                    Dirección de entrega
                  </label>
                  <Input
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="Ej. Calle 145 # 118 - 30 Apto 402"
                    aria-label="Dirección de entrega"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-ink-secondary mb-1">
                      Ciudad
                    </label>
                    <Input
                      value={formCity}
                      onChange={(e) => setFormCity(e.target.value)}
                      placeholder="Bogotá"
                      aria-label="Ciudad de entrega"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-ink-secondary mb-1">
                      Zona / Localidad
                    </label>
                    {!zonesLoadFailed && zonesCatalog.length > 0 ? (
                      <Select
                        value={formZone}
                        onChange={(e) => setFormZone(e.target.value)}
                        aria-label="Zona o localidad"
                      >
                        <option value="">Seleccionar localidad...</option>
                        {zonesCatalog.map((zone) => (
                          <option key={zone.id} value={zone.name}>
                            {zone.name}{zone.city && zone.city !== "Bogotá" ? ` (${zone.city})` : ""}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        value={formZone}
                        onChange={(e) => setFormZone(e.target.value)}
                        placeholder="Escribe la localidad..."
                        aria-label="Zona o localidad"
                      />
                    )}
                  </div>
                </div>

                {/* Botón de verificación geográfica */}
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full border-brand/50 text-brand hover:bg-brand-soft"
                    onClick={() => void handleVerifyAddress()}
                    disabled={verifying || !formAddress.trim()}
                  >
                    {verifying ? "Consultando candidatos..." : "Verificar dirección (Geocodificar)"}
                  </Button>
                </div>

                {/* Mensaje de respuesta del preview */}
                {previewMessage ? (
                  <p className="text-xs text-ink-secondary italic bg-app-secondary/40 p-2 rounded">
                    {previewMessage}
                  </p>
                ) : null}

                {/* Lista de Candidatos Desambiguados */}
                {candidates.length > 0 ? (
                  <div className="space-y-2 rounded-lg border border-edge bg-surface p-3">
                    <div className="flex items-center justify-between border-b border-edge pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-ink">
                        Candidatos encontrados ({candidates.length})
                      </span>
                      <span className="text-[11px] text-ink-secondary">
                        Selecciona el correcto
                      </span>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {candidates.map((c, index) => {
                        const isExact = c.confidence === "exact";
                        const isAmbiguous = c.confidence === "ambiguous";

                        return (
                          <div
                            key={index}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-edge p-2.5 transition-colors hover:border-brand/40 hover:bg-app-secondary/50"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                {isExact ? (
                                  <Badge tone="success">Exacto</Badge>
                                ) : isAmbiguous ? (
                                  <Badge tone="warning">Ambiguo / Múltiples zonas</Badge>
                                ) : (
                                  <Badge tone="warning">Aproximado</Badge>
                                )}
                                {c.zone ? (
                                  <Badge tone="neutral">{c.zone}</Badge>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs font-semibold text-ink line-clamp-2">
                                {c.formatted_address || c.label}
                              </p>
                              {c.lat && c.lng ? (
                                <p className="text-[10px] text-ink-secondary font-mono">
                                  Coords: {c.lat.toFixed(5)}, {c.lng.toFixed(5)} · Proveedor: {c.provider || "geocoder"}
                                </p>
                              ) : null}
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="shrink-0"
                              onClick={() => applyCandidate(c)}
                            >
                              Usar candidato
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Coordenadas actuales asignadas */}
                {formLat && formLng ? (
                  <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                    <span>
                      ✓ Coordenadas listas: {formLat.toFixed(5)}, {formLng.toFixed(5)}
                    </span>
                    {formZone ? <span className="font-semibold">Zona: {formZone}</span> : null}
                  </div>
                ) : null}
              </div>

              {/* Botones de acción del modal */}
              <div className="mt-6 flex items-center justify-end gap-2 border-t border-edge pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeCorrection}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSaveCorrection()}
                  disabled={saving || !formAddress.trim()}
                >
                  {saving ? "Guardando y re-geocodificando..." : "Guardar corrección"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
