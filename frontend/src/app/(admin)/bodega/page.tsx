"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, describeApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import { formatDateShort, shipmentStatusLabel } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  HelpTip,
  KpiCard,
  MobileListCard,
  SearchInput,
  Select,
  StatusBadge,
  TableScroller,
} from "@/components/ui";
import type {
  DispatchBoardResponse,
  DispatchSizeCode,
} from "@/lib/types";

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className || "h-4 w-4 fill-none stroke-current stroke-2"}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className || "h-5 w-5 fill-none stroke-current stroke-2"}>
      <path d="m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4ZM3.5 7v10l8.5 4 8.5-4V7" />
    </svg>
  );
}

function formatPaymentLabel(type?: string | null): string {
  if (!type) return "No especificado";
  switch (type) {
    case "cash_on_delivery":
      return "Pago contra entrega";
    case "post_sale":
      return "Cobro post entrega";
    case "prepaid":
      return "Prepago";
    case "mercado_libre":
      return "Mercado Libre";
    default:
      return type;
  }
}

export default function BodegaPage() {
  usePageTitle("Bodega | Danhei Express");
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DispatchBoardResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sizeFilter, setSizeFilter] = useState<"all" | DispatchSizeCode>("all");
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await apiGet<DispatchBoardResponse>("/routes/dispatch-board?limit=500");
      setData(response);
    } catch (error) {
      showToast(describeApiError(error, "No fue posible cargar el inventario de bodega.").message, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  // Grupos filtrados y ordenados ("Sin zona" de primero si existe)
  const processedGroups = useMemo(() => {
    if (!data?.groups) return [];

    const query = searchQuery.trim().toLowerCase();

    return data.groups
      .map((group) => {
        // Filtrar paquetes dentro de cada grupo según búsqueda y tamaño
        const filteredItems = group.items.filter((item) => {
          if (sizeFilter !== "all" && item.size_code !== sizeFilter) {
            return false;
          }
          if (query) {
            const matchesCode = (item.display_code || "").toLowerCase().includes(query) ||
                                (item.tracking_code || "").toLowerCase().includes(query);
            const matchesRecipient = (item.recipient_name || "").toLowerCase().includes(query);
            const matchesAddress = (item.recipient_address || "").toLowerCase().includes(query);
            const matchesZone = (item.recipient_zone || "").toLowerCase().includes(query);
            const matchesDriver = (item.custody?.new_custodian_name || "").toLowerCase().includes(query);
            if (!matchesCode && !matchesRecipient && !matchesAddress && !matchesZone && !matchesDriver) {
              return false;
            }
          }
          return true;
        });

        const key = `${group.zone || "__sin_zona__"}|${group.city || "__sin_ciudad__"}`;
        const isSinZona = !group.zone || group.zone.trim().toLowerCase() === "sin zona";

        return {
          key,
          zone: group.zone,
          city: group.city,
          displayName: group.zone ? group.zone : "Sin zona",
          isSinZona,
          total: group.total, // Conteo original de la API
          filteredTotal: filteredItems.length,
          fragileCount: group.fragile_count,
          bySize: group.by_size,
          items: filteredItems,
        };
      })
      .filter((g) => g.filteredTotal > 0 || (searchQuery === "" && sizeFilter === "all"))
      .sort((a, b) => {
        // "Sin zona" siempre de primero
        if (a.isSinZona && !b.isSinZona) return -1;
        if (!a.isSinZona && b.isSinZona) return 1;
        return a.displayName.localeCompare(b.displayName, "es-CO");
      });
  }, [data, searchQuery, sizeFilter]);

  // Derivación directa de activeGroup sin necesidad de un useEffect que haga setState
  const activeGroup = useMemo(() => {
    if (selectedGroupKey) {
      const match = processedGroups.find((g) => g.key === selectedGroupKey);
      if (match) return match;
    }
    return processedGroups[0] || null;
  }, [processedGroups, selectedGroupKey]);

  const toggleAccordion = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-label="Cargando bodega">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-80" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="No fue posible cargar el inventario de bodega"
        description="Comprueba la conexión con la API e inténtalo de nuevo."
        action={
          <Button onClick={() => void loadData(true)}>
            Reintentar
          </Button>
        }
      />
    );
  }

  const sinZonaGroup = processedGroups.find((g) => g.isSinZona);
  const sinZonaCount = sinZonaGroup ? sinZonaGroup.total : 0;

  return (
    <div className="min-w-0 animate-fade-in space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold leading-tight text-ink md:text-3xl">
              Bodega
            </h1>
            <HelpTip
              topic="Organización física de bodega"
              text="Muestra los paquetes en custodia física de sede agrupados por localidad para organizar estanterías y preparar salidas de pilotos."
            />
          </div>
          <p className="mt-1 text-sm text-ink-secondary">
            Organización física por localidades y zonas de destino
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            aria-label="Actualizar inventario de bodega"
          >
            <span className="sm:hidden" aria-hidden="true">↻</span>
            <span>{refreshing ? "Actualizando..." : "Actualizar"}</span>
          </Button>
        </div>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4" aria-label="Resumen de bodega">
        <KpiCard
          label="Total en bodega"
          value={data.summary.total}
          support="Paquetes en sede"
          tone="teal"
        />
        <KpiCard
          label="Localidades"
          value={data.groups.filter((g) => g.zone && g.zone.toLowerCase() !== "sin zona").length}
          support="Zonas con carga"
          tone="default"
        />
        <KpiCard
          label="Sin zona"
          value={sinZonaCount}
          support={sinZonaCount > 0 ? "Por clasificar" : "Todo asignado"}
          tone={sinZonaCount > 0 ? "warning" : "success"}
        />
        <KpiCard
          label="Frágiles"
          value={data.summary.fragile}
          support={`${data.summary.missing_coordinates} sin coordenadas`}
          tone={data.summary.fragile > 0 ? "warning" : "default"}
        />
      </section>

      {/* Filtros y búsqueda */}
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_200px]">
          <SearchInput
            placeholder="Buscar por guía, destinatario, dirección o piloto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Buscar en inventario de bodega"
          />
          <Select
            value={sizeFilter}
            onChange={(e) => setSizeFilter(e.target.value as "all" | DispatchSizeCode)}
            aria-label="Filtrar por tamaño de paquete"
          >
            <option value="all">Todos los tamaños</option>
            <option value="small">Pequeño</option>
            <option value="medium">Mediano</option>
            <option value="large">Grande</option>
          </Select>
        </div>
      </Card>

      {/* Alerta de "Sin zona" si existen paquetes */}
      {sinZonaCount > 0 && !searchQuery && sizeFilter === "all" ? (
        <div className="flex items-center justify-between gap-3 rounded-card border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">⚠️</span>
            <div>
              <strong>Trabajo pendiente en operación:</strong> Hay {sinZonaCount} {sinZonaCount === 1 ? "paquete" : "paquetes"} sin localidad asignada en bodega.
            </div>
          </div>
          <Link href="/bodega/por-revisar">
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0 border-amber-500/40 text-amber-900 hover:bg-amber-500/20 dark:text-amber-200"
            >
              Ver sin zona
            </Button>
          </Link>
        </div>
      ) : null}

      {/* Contenido Principal: Dos vistas (Escritorio split vs Móvil accordion/cards) */}
      {processedGroups.length === 0 ? (
        <EmptyState
          title="No hay paquetes que coincidan con los filtros"
          description="Intenta cambiar el término de búsqueda o el filtro de tamaño."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearchQuery("");
                setSizeFilter("all");
              }}
            >
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <>
          {/* ── VISTA ESCRITORIO (>= lg): Panel izquierdo de localidades + Panel derecho con tabla ── */}
          <div className="hidden lg:grid lg:grid-cols-[320px_1fr] lg:gap-6 lg:items-start">
            {/* Lista de Localidades */}
            <div className="space-y-2 rounded-panel border border-edge bg-surface p-3 shadow-card">
              <div className="border-b border-edge px-3 pb-2 pt-1 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                  Localidades ({processedGroups.length})
                </span>
                <span className="text-xs font-medium text-ink-secondary">
                  Paquetes
                </span>
              </div>
              <div className="max-h-[calc(100vh-320px)] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
                {processedGroups.map((group) => {
                  const isSelected = group.key === (activeGroup?.key ?? "");
                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => setSelectedGroupKey(group.key)}
                      className={`group flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-150 ${
                        isSelected
                          ? "border-brand bg-brand-soft font-bold text-brand shadow-sm"
                          : group.isSinZona
                          ? "border-amber-500/30 bg-amber-500/5 text-amber-900 hover:border-amber-500/60 dark:text-amber-300"
                          : "border-transparent text-ink hover:border-edge hover:bg-app-secondary"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          {group.isSinZona ? (
                            <span className="text-xs text-amber-600 dark:text-amber-400" title="Requiere asignación de zona">⚠️</span>
                          ) : null}
                          <span className="truncate">{group.displayName}</span>
                        </div>
                        {group.city && group.city !== "Bogotá" && !group.isSinZona ? (
                          <span className="block text-[11px] font-normal text-ink-secondary">
                            {group.city}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {group.fragileCount > 0 ? (
                          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-amber-700 dark:text-amber-400" title={`${group.fragileCount} frágiles`}>
                            {group.fragileCount}F
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            isSelected
                              ? "bg-brand text-white"
                              : group.isSinZona
                              ? "bg-amber-500/20 text-amber-800 dark:text-amber-300"
                              : "bg-app-secondary text-ink-secondary"
                          }`}
                        >
                          {group.total}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Listado Detallado de Paquetes de la Localidad Seleccionada */}
            {activeGroup ? (
              <Card
                title={`${activeGroup.displayName} (${activeGroup.total} ${activeGroup.total === 1 ? "paquete" : "paquetes"}${
                  searchQuery || sizeFilter !== "all" ? ` · ${activeGroup.items.length} coincidencia(s)` : ""
                })`}
                headerAction={
                  <div className="flex items-center gap-2">
                    {activeGroup.isSinZona ? (
                      <Badge tone="warning">Sin localidad asignada</Badge>
                    ) : (
                      <Badge tone="teal">{activeGroup.city || "Bogotá"}</Badge>
                    )}
                  </div>
                }
              >
                {activeGroup.items.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-secondary">
                    No hay paquetes en esta localidad que coincidan con la búsqueda.
                  </p>
                ) : (
                  <TableScroller>
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-edge text-ink-secondary">
                          <th className="pb-3 pl-1 font-semibold">Guía</th>
                          <th className="pb-3 font-semibold">Destinatario</th>
                          <th className="pb-3 font-semibold">Dirección</th>
                          <th className="pb-3 font-semibold">Localidad / Zona</th>
                          <th className="pb-3 font-semibold">Estado</th>
                          <th className="pb-3 font-semibold">Custodia / Piloto</th>
                          <th className="pb-3 pr-1 font-semibold">Ingreso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-edge text-ink">
                        {activeGroup.items.map((shipment) => (
                          <tr key={shipment.id} className="transition-colors hover:bg-app-secondary/60">
                            {/* Guía */}
                            <td className="py-3 pl-1 font-medium">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-ink">{shipment.display_code}</span>
                                {shipment.is_fragile ? (
                                  <span className="inline-flex rounded bg-amber-500/20 px-1 py-0.2 text-[10px] font-bold text-amber-800 dark:text-amber-300" title="Frágil">
                                    F
                                  </span>
                                ) : null}
                              </div>
                              <span className="text-[10px] text-ink-secondary">{shipment.size_label}</span>
                            </td>

                            {/* Destinatario */}
                            <td className="py-3">
                              <p className="font-semibold text-ink truncate max-w-[150px]">{shipment.recipient_name || "Sin nombre"}</p>
                              {shipment.recipient_phone ? (
                                <p className="text-[11px] text-ink-secondary">{shipment.recipient_phone}</p>
                              ) : null}
                            </td>

                            {/* Dirección */}
                            <td className="py-3">
                              <p className="max-w-[220px] truncate text-ink">{shipment.recipient_address || "Sin dirección"}</p>
                              {shipment.payment_type ? (
                                <p className="text-[10px] text-ink-secondary">{formatPaymentLabel(shipment.payment_type)}</p>
                              ) : null}
                            </td>

                            {/* Localidad / Zona */}
                            <td className="py-3">
                              <span className={shipment.recipient_zone ? "text-ink font-medium" : "text-amber-700 font-semibold dark:text-amber-400"}>
                                {shipment.recipient_zone || "Sin zona"}
                              </span>
                              {shipment.recipient_city && shipment.recipient_city !== "Bogotá" ? (
                                <span className="block text-[10px] text-ink-secondary">{shipment.recipient_city}</span>
                              ) : null}
                            </td>

                            {/* Estado */}
                            <td className="py-3">
                              <StatusBadge
                                status={shipment.status}
                                label={shipmentStatusLabel(shipment.status)}
                              />
                            </td>

                            {/* Custodia / Piloto */}
                            <td className="py-3">
                              {shipment.custody?.new_custodian_type === "driver" ? (
                                <Badge tone="success">
                                  Piloto: {shipment.custody.new_custodian_name || "Asignado"}
                                </Badge>
                              ) : (
                                <Badge tone="info">
                                  En sede
                                </Badge>
                              )}
                            </td>

                            {/* Fecha Ingreso */}
                            <td className="py-3 pr-1 text-ink-secondary whitespace-nowrap">
                              {formatDateShort(shipment.created_at || "")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroller>
                )}
              </Card>
            ) : null}
          </div>

          {/* ── VISTA MÓVIL (< lg): Acordeón de localidades con tarjetas apilables ── */}
          <div className="space-y-3 lg:hidden">
            {processedGroups.map((group) => {
              const isExpanded = expandedKeys.has(group.key);
              return (
                <div
                  key={group.key}
                  className={`rounded-panel border bg-surface shadow-card transition-colors ${
                    group.isSinZona ? "border-amber-500/40" : "border-edge"
                  }`}
                >
                  {/* Botón Cabecera de Acordeón */}
                  <button
                    type="button"
                    onClick={() => toggleAccordion(group.key)}
                    className="admin-touch-target flex w-full items-center justify-between p-4 text-left"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        group.isSinZona ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-brand-soft text-brand"
                      }`}>
                        <PackageIcon />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {group.isSinZona ? <span className="text-xs">⚠️</span> : null}
                          <p className="truncate font-display text-base font-bold text-ink">
                            {group.displayName}
                          </p>
                        </div>
                        <p className="text-xs text-ink-secondary">
                          {group.city || "Bogotá"} · {group.total} {group.total === 1 ? "paquete" : "paquetes"}
                          {group.fragileCount > 0 ? ` · ${group.fragileCount} frágil(es)` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        group.isSinZona ? "bg-amber-500/20 text-amber-800 dark:text-amber-300" : "bg-brand-soft text-brand"
                      }`}>
                        {group.total}
                      </span>
                      <ChevronDownIcon
                        className={`h-5 w-5 text-ink-secondary transition-transform duration-200 ${
                          isExpanded ? "rotate-180 text-brand" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {/* Lista de Tarjetas Móviles cuando está desplegado */}
                  {isExpanded ? (
                    <div className="border-t border-edge bg-app-secondary/40 p-3 space-y-2.5 animate-fade-in">
                      {group.items.length === 0 ? (
                        <p className="py-4 text-center text-xs text-ink-secondary">
                          Sin coincidencias con los filtros aplicados.
                        </p>
                      ) : (
                        group.items.map((shipment) => (
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
                            status={
                              <StatusBadge
                                status={shipment.status}
                                label={shipmentStatusLabel(shipment.status)}
                              />
                            }
                            meta={
                              <span className="block space-y-1 text-xs">
                                <span className="flex flex-wrap items-center gap-1.5">
                                  {shipment.custody?.new_custodian_type === "driver" ? (
                                    <Badge tone="success">
                                      Piloto: {shipment.custody.new_custodian_name || "Asignado"}
                                    </Badge>
                                  ) : (
                                    <Badge tone="info">En sede</Badge>
                                  )}
                                  <Badge tone="neutral">{shipment.size_label}</Badge>
                                  {shipment.payment_type ? (
                                    <span className="text-[11px] text-ink-secondary">
                                      · {formatPaymentLabel(shipment.payment_type)}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="block text-[11px] text-ink-secondary">
                                  Ingreso: {formatDateShort(shipment.created_at || "")}
                                </span>
                              </span>
                            }
                          />
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
