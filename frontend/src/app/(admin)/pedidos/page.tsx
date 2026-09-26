"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiJson, apiPost, apiSend, describeApiError } from "@/lib/api";
import { formatDateInput, shiftDateInput, shipmentStatusLabel } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
import {
  Card,
  KpiCard,
  StatusBadge,
  Badge,
  Button,
  Input,
  CurrencyInput,
  Select,
  SearchInput,
  Textarea,
  EmptyState,
  FilterChip,
  FilterChipGroup,
} from "@/components/ui";
import { usePageTitle } from "@/lib/page-title";
import type {
  Driver,
  PaginatedResponse,
  ShipmentGeodataRepairResponse,
  ShipmentGeoSummaryResponse,
  ShipmentStatus,
} from "@/lib/types";
import {
  statusFilterKeyFromParam,
  statusFilters,
  type ShipmentListItem,
} from "./_components/labels";
import { ShipmentCards, ShipmentTable, type StatusAction } from "./_components/shipment-list";

type ListMeta = { current_page: number; last_page: number; total: number };

function readInitialParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export default function PedidosPage() {
  usePageTitle("Paquetes | Danhei Express");

  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);
  const [assignLoadingId, setAssignLoadingId] = useState<number | null>(null);
  const [handoverLoadingId, setHandoverLoadingId] = useState<number | null>(null);
  const [handoverTarget, setHandoverTarget] = useState<{ id: number; code: string } | null>(null);
  const [handoverNotes, setHandoverNotes] = useState("");
  const [shipments, setShipments] = useState<ShipmentListItem[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [statusKey, setStatusKey] = useState(() => statusFilterKeyFromParam(readInitialParam("status")));
  const [search, setSearch] = useState(() => readInitialParam("search") ?? "");
  const [appliedSearch, setAppliedSearch] = useState(() => (readInitialParam("search") ?? "").trim());
  const [driverId, setDriverId] = useState("all");
  const [dateFrom, setDateFrom] = useState(() => shiftDateInput(formatDateInput(), -7));
  const [dateTo, setDateTo] = useState(() => formatDateInput());
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<ListMeta>({ current_page: 1, last_page: 1, total: 0 });
  const [lookupError, setLookupError] = useState("");
  const [geoSummary, setGeoSummary] = useState<ShipmentGeoSummaryResponse | null>(null);
  const [geoRepairing, setGeoRepairing] = useState(false);
  const [pendingCodShipments, setPendingCodShipments] = useState<ShipmentListItem[]>([]);
  const [pendingCodAmounts, setPendingCodAmounts] = useState<Record<number, string>>({});
  const [savingPendingCodId, setSavingPendingCodId] = useState<number | null>(null);
  const [openIssues, setOpenIssues] = useState<number | null>(null);
  const [detectingRowId, setDetectingRowId] = useState<number | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);
  const shipmentsRequestSequence = useRef(0);

  const activeFilter = statusFilters.find((filter) => filter.key === statusKey) ?? statusFilters[0];

  const buildShipmentParams = (status: ShipmentStatus | null, includePage = true) => {
    const params = new URLSearchParams();
    if (includePage) params.set("page", String(page));
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (status) params.set("status", status);
    if (appliedSearch.trim()) params.set("search", appliedSearch.trim());
    if (driverId !== "all") params.set("driver_id", driverId);
    return params;
  };

  const loadLookups = async () => {
    try {
      const driversRes = await apiGet<PaginatedResponse<Driver> | Driver[]>("/drivers");
      setDrivers(Array.isArray(driversRes) ? driversRes : driversRes.data || []);
      setLookupError("");
    } catch {
      setDrivers([]);
      setLookupError("No se pudo cargar la lista de pilotos.");
    }
  };

  /**
   * La API filtra por un solo estado. Un filtro que agrupa varios estados
   * (p. ej. "En ruta" = asignado a ruta + en tránsito) consulta cada uno con la
   * misma página y junta los resultados, del más reciente al más viejo.
   */
  const fetchShipmentPage = async (): Promise<{ data: ShipmentListItem[]; meta: ListMeta }> => {
    const statuses: Array<ShipmentStatus | null> = activeFilter.statuses.length > 0 ? activeFilter.statuses : [null];
    const responses = await Promise.all(
      statuses.map((status) =>
        apiGet<PaginatedResponse<ShipmentListItem>>(`/shipments?${buildShipmentParams(status).toString()}`)
      )
    );
    if (responses.length === 1) {
      const [response] = responses;
      return {
        data: response.data || [],
        meta: { current_page: response.current_page || 1, last_page: response.last_page || 1, total: response.total || 0 },
      };
    }
    const data = responses
      .flatMap((response) => response.data || [])
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    return {
      data,
      meta: {
        current_page: page,
        last_page: Math.max(1, ...responses.map((response) => response.last_page || 1)),
        total: responses.reduce((sum, response) => sum + (response.total || 0), 0),
      },
    };
  };

  const loadShipments = async () => {
    const requestSequence = ++shipmentsRequestSequence.current;
    setLoading(true);
    try {
      const geoParams = buildShipmentParams(activeFilter.statuses.length === 1 ? activeFilter.statuses[0] : null, false);
      geoParams.set("sample_limit", "5");
      const [result, geo] = await Promise.all([
        fetchShipmentPage(),
        apiGet<ShipmentGeoSummaryResponse>(`/shipments/geo-summary?${geoParams.toString()}`).catch(() => null),
      ]);

      if (requestSequence !== shipmentsRequestSequence.current) return;

      setShipments(result.data);
      setGeoSummary(geo);
      setMeta(result.meta);
    } catch {
      if (requestSequence !== shipmentsRequestSequence.current) return;

      setShipments([]);
      setGeoSummary(null);
      setMeta({ current_page: 1, last_page: 1, total: 0 });
      showToast("No se pudieron cargar los paquetes", "error");
    } finally {
      if (requestSequence === shipmentsRequestSequence.current) {
        setLoading(false);
      }
    }
  };

  /** Novedades abiertas en total (sin importar fechas): una consulta de 1 fila basta para el conteo. */
  const loadOpenIssues = async () => {
    try {
      const response = await apiGet<PaginatedResponse<ShipmentListItem>>("/shipments?status=issue&per_page=1");
      setOpenIssues(typeof response.total === "number" ? response.total : null);
    } catch {
      setOpenIssues(null);
    }
  };

  const repairVisibleGeodata = async () => {
    const candidateIds = Array.from(
      new Set(shipments.filter((item) => !item.has_coordinates).map((item) => item.id).slice(0, 25))
    );

    if (candidateIds.length === 0) {
      showToast("No hay pedidos visibles por reparar en este filtro.", "info");
      return;
    }

    setGeoRepairing(true);
    try {
      const response = await apiSend<ShipmentGeodataRepairResponse>("/shipments/repair-geodata", "POST", {
        shipment_ids: candidateIds,
      });

      showToast(
        response.message || "Reparación geográfica ejecutada",
        response.summary.repaired > 0 ? "success" : "info"
      );
      await loadShipments();
    } catch {
      showToast("No se pudo reintentar la geocodificación visible.", "error");
    } finally {
      setGeoRepairing(false);
    }
  };

  const loadPendingCodShipments = async () => {
    try {
      const response = await apiGet<PaginatedResponse<ShipmentListItem>>("/shipments?pending_cod=1&per_page=50");
      setPendingCodShipments(response.data || []);
    } catch {
      setPendingCodShipments([]);
    }
  };

  const savePendingCodAmount = async (shipmentId: number) => {
    const amount = Number(pendingCodAmounts[shipmentId]) || 0;
    if (amount <= 0) {
      showToast("Ingresa un monto válido mayor a 0", "error");
      return;
    }
    setSavingPendingCodId(shipmentId);
    try {
      await apiSend(`/shipments/${shipmentId}`, "PUT", { cod_amount: amount });
      showToast("Monto contraentrega asignado", "success");
      setPendingCodAmounts((current) => {
        const next = { ...current };
        delete next[shipmentId];
        return next;
      });
      await Promise.all([loadPendingCodShipments(), loadShipments()]);
    } catch (error) {
      showToast(describeApiError(error, "No se pudo actualizar el monto.").message, "error");
    } finally {
      setSavingPendingCodId(null);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLookups();
    void loadPendingCodShipments();
    void loadOpenIssues();
  }, []);

  // Recarga con cada filtro, incluidas las fechas (antes el cambio de fecha no recargaba).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadShipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey, page, driverId, appliedSearch, dateFrom, dateTo]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("quickAction") === "new") {
      router.replace("/recogidas/nueva");
      return;
    }
    // Enlaces viejos con ?shipment=ID abren la ficha del paquete.
    const legacyId = Number(params.get("shipment") ?? params.get("id"));
    if (Number.isInteger(legacyId) && legacyId > 0) {
      router.replace(`/pedidos/${legacyId}`);
    }
  }, [router]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedSearch(search.trim());
    setPage(1);
  };

  const openDetail = (id: number) => {
    router.push(`/pedidos/${id}`);
  };

  const detectAndApplyShipmentZone = async (shipmentId: number) => {
    setDetectingRowId(shipmentId);
    try {
      const response = await apiPost<{
        message: string;
        shipment: ShipmentListItem;
        detected_zone: string | null;
      }>(`/shipments/${shipmentId}/detect-location`, { mode: "apply" });

      if (response.shipment) {
        setShipments((current) => current.map((s) => (s.id === shipmentId ? { ...s, ...response.shipment } : s)));
        showToast(
          response.shipment.recipient_zone
            ? `Localidad asignada: ${response.shipment.recipient_zone}`
            : "No se pudo detectar automáticamente.",
          response.shipment.recipient_zone ? "success" : "info"
        );
      }
    } catch (error) {
      showToast(describeApiError(error, "No se pudo detectar la ubicación.").message, "error");
    } finally {
      setDetectingRowId(null);
    }
  };

  const changeStatus = async (id: number, action: StatusAction) => {
    const status = action.next;
    if (status === "returned" || status === "cancelled") {
      const shipment = shipments.find((item) => item.id === id);
      const ok = window.confirm(
        `¿Estás seguro de marcar ${shipment?.display_code || "este envío"} como ${shipmentStatusLabel(status)}? Esta acción no se puede deshacer.`
      );
      if (!ok) return;
    }
    try {
      setStatusLoadingId(id);
      await apiSend(`/shipments/${id}/status`, "POST", { status, description: action.description });
      showToast("Estado cambiado", "success");
      await loadShipments();
    } catch {
      showToast("No se pudo cambiar estado", "error");
    } finally {
      setStatusLoadingId(null);
    }
  };

  const openHandover = (id: number, code: string) => {
    setHandoverTarget({ id, code });
    setHandoverNotes("Piloto recibió el paquete en bodega.");
  };

  const confirmHandover = async () => {
    if (!handoverTarget || !handoverNotes.trim()) return;
    const { id } = handoverTarget;
    try {
      setHandoverLoadingId(id);
      await apiJson(
        `/shipments/${id}/handover-to-driver`,
        "POST",
        { notes: handoverNotes.trim() },
        { "Idempotency-Key": crypto.randomUUID() },
        { retries: 1, idempotent: true }
      );
      showToast("Paquete entregado al piloto: custodia registrada.", "success");
      setShipments((current) =>
        current.map((s) => (s.id === id ? { ...s, status: "handed_to_driver" as ShipmentStatus } : s))
      );
      setHandoverTarget(null);
      setHandoverNotes("");
      void loadShipments();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No fue posible registrar la entrega.", "error");
    } finally {
      setHandoverLoadingId(null);
    }
  };

  const assignDriver = async (id: number, nextDriverId: number | null) => {
    try {
      setAssignLoadingId(id);
      await apiSend(`/shipments/${id}/assign`, "POST", { driver_id: nextDriverId });
      showToast(nextDriverId === null ? "Piloto retirado del envío" : "Piloto asignado", "success");
      await loadShipments();
    } catch (error) {
      // La API explica por qué no (p. ej. otro piloto lo tiene en custodia).
      showToast(
        describeApiError(error, nextDriverId === null ? "No se pudo retirar el piloto" : "No se pudo asignar piloto").message,
        "error"
      );
    } finally {
      setAssignLoadingId(null);
    }
  };

  const deleteShipment = async (id: number, code: string) => {
    if (!window.confirm(`¿Eliminar el pedido ${code}? Esta acción no se puede deshacer.`)) return;
    setDeleteLoadingId(id);
    try {
      try {
        await apiSend(`/shipments/${id}`, "DELETE", {});
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (!msg.includes("DELETE method is not supported") && !msg.includes("405")) {
          throw err;
        }
        await apiSend(`/shipments/${id}/delete`, "POST", {});
      }
      showToast("Pedido eliminado", "success");
      if (page > 1 && shipments.length === 1) {
        setPage(page - 1);
      } else {
        await loadShipments();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      showToast(`No se pudo eliminar: ${msg}`, "error");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const geocodedCount = shipments.filter((item) => item.has_coordinates === true).length;
  const routeReadyCount = shipments.filter((item) => item.has_coordinates === true && item.driver_id != null).length;
  const rangeLabel =
    dateFrom && dateTo ? "entre las fechas elegidas" : dateFrom ? "desde la fecha elegida" : dateTo ? "hasta la fecha elegida" : "sin límite de fechas";

  const resetFilters = () => {
    setStatusKey("all");
    setSearch("");
    setAppliedSearch("");
    setDriverId("all");
    setPage(1);
  };

  const listProps = {
    shipments,
    drivers,
    statusLoadingId,
    assignLoadingId,
    handoverLoadingId,
    deleteLoadingId,
    detectingRowId,
    onOpen: openDetail,
    onChangeStatus: (id: number, action: StatusAction) => void changeStatus(id, action),
    onHandover: openHandover,
    onAssign: (id: number, next: number | null) => void assignDriver(id, next),
    onDelete: (id: number, code: string) => void deleteShipment(id, code),
    onDetectZone: (id: number) => void detectAndApplyShipmentZone(id),
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header Bar */}
      <Card flush className="p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Paquetes</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Busca un paquete y ábrelo para ver dónde está, su historial y sus fotos.
            </p>
            {lookupError ? <p className="mt-1 text-xs font-semibold text-danger">{lookupError}</p> : null}
          </div>
          <form onSubmit={submitSearch} className="flex w-full flex-col gap-2.5 sm:flex-row lg:w-auto">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar guía, cliente o dirección"
              className="w-full sm:w-64"
            />
            <Button variant="secondary" type="submit">
              Buscar
            </Button>
            <Button variant="primary" type="button" onClick={() => router.push("/recogidas/nueva")}>
              Nuevo ingreso
            </Button>
          </form>
        </div>
      </Card>

      {/* Números honestos: cada uno dice de dónde sale. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Paquetes en este filtro"
          value={loading ? "…" : meta.total}
          support={activeFilter.key === "all" ? `Todos los estados, ${rangeLabel}` : `${activeFilter.label}, ${rangeLabel}`}
          tone="brand"
        />
        <KpiCard
          label="Novedades abiertas"
          value={openIssues ?? "—"}
          support="En total, sin importar la fecha"
          tone={openIssues ? "danger" : "default"}
        />
        <KpiCard
          label="Contra entrega sin monto"
          value={pendingCodShipments.length}
          support="Falta definir cuánto cobrar"
          tone={pendingCodShipments.length > 0 ? "warning" : "default"}
        />
      </div>

      {/* Filtros */}
      <Card className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-ink">Estado</p>
          <FilterChipGroup label="Filtrar por estado">
            {statusFilters.map((filter) => (
              <FilterChip
                key={filter.key}
                selected={statusKey === filter.key}
                onClick={() => {
                  setStatusKey(filter.key);
                  setPage(1);
                }}
              >
                {filter.label}
              </FilterChip>
            ))}
          </FilterChipGroup>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Piloto asignado"
            value={driverId}
            onChange={(event) => {
              setDriverId(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos los pilotos</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </Select>
          <Input
            label="Desde"
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Hasta"
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
          />
          <Button
            variant="ghost"
            type="button"
            className="self-end"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
          >
            Ver todas las fechas
          </Button>
        </div>

        {/* Coverage details */}
        <details className="group rounded-card border border-edge bg-bg-secondary/40">
          <summary className="flex cursor-pointer items-center justify-between p-3.5 text-sm font-semibold text-ink">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-brand stroke-2">
                <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>Ubicación en el mapa</span>
            </div>
            <span className="text-xs font-normal text-ink-secondary group-open:hidden">De los paquetes de esta página</span>
          </summary>
          <div className="grid gap-4 border-t border-edge p-4 text-sm sm:grid-cols-4">
            <div>
              <span className="block text-xs text-ink-secondary">Ubicados</span>
              <strong className="font-display text-lg font-bold text-ink">{geocodedCount}</strong>
            </div>
            <div>
              <span className="block text-xs text-ink-secondary">Sin ubicar</span>
              <strong className="font-display text-lg font-bold text-ink">{shipments.length - geocodedCount}</strong>
            </div>
            <div>
              <span className="block text-xs text-ink-secondary">Listos para ruta</span>
              <strong className="font-display text-lg font-bold text-ink">{routeReadyCount}</strong>
            </div>
            {(geoSummary?.summary?.without_coordinates ?? 0) > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void repairVisibleGeodata()}
                disabled={geoRepairing}
                className="h-auto min-h-9 w-full text-center sm:w-auto"
              >
                {geoRepairing ? "Buscando..." : "Volver a buscar en el mapa"}
              </Button>
            ) : null}
          </div>
        </details>
      </Card>

      {/* Guías contra entrega con monto pendiente */}
      {pendingCodShipments.length > 0 && (
        <Card
          title="Envíos contra entrega con monto pendiente"
          headerAction={
            <Badge tone="warning">
              {pendingCodShipments.length} {pendingCodShipments.length === 1 ? "pendiente" : "pendientes"}
            </Badge>
          }
          className="border-amber-500/30 bg-amber-500/5"
        >
          <p className="mb-3 text-xs text-ink-secondary">
            Estos envíos contra entrega tienen monto $0. Debes definir el valor a cobrar antes de que puedan salir a ruta o entregarse.
          </p>
          <div className="divide-y divide-edge rounded-card border border-edge bg-surface">
            {pendingCodShipments.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-bold text-ink">{item.display_code}</span>
                    <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                      Monto pendiente
                    </span>
                    <StatusBadge status={item.status} label={shipmentStatusLabel(item.status)} />
                  </div>
                  <p className="mt-1 text-xs text-ink-secondary">
                    Destino: <strong className="text-ink">{item.recipient_name}</strong> · {item.recipient_phone} · {item.recipient_address} ({item.recipient_city || "Bogotá"})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-36">
                    <CurrencyInput
                      min={0}
                      value={Number(pendingCodAmounts[item.id] ?? (item.cod_amount || 0))}
                      onValueChange={(val) => setPendingCodAmounts((curr) => ({ ...curr, [item.id]: String(val) }))}
                    />
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={savingPendingCodId === item.id || !(Number(pendingCodAmounts[item.id]) > 0)}
                    onClick={() => void savePendingCodAmount(item.id)}
                  >
                    {savingPendingCodId === item.id ? "..." : "Guardar"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Listado */}
      {loading ? (
        <Card className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-card" />
          ))}
        </Card>
      ) : shipments.length === 0 ? (
        <EmptyState
          title="No hay paquetes para este filtro"
          description="Prueba con otro estado, otra fecha o quita la búsqueda."
          action={
            <Button variant="secondary" onClick={resetFilters}>
              Ver todos los paquetes
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-medium text-ink-secondary">
              Mostrando {shipments.length} de {meta.total} paquetes
            </p>
          </div>

          <ShipmentTable {...listProps} />
          <ShipmentCards {...listProps} />

          <Pagination currentPage={meta.current_page} lastPage={meta.last_page} onPageChange={setPage} />
        </div>
      )}

      {/* Handover Modal */}
      {handoverTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-xs transition-opacity sm:items-center sm:p-4">
          <Card className="mobile-modal-safe-area w-full max-w-md rounded-t-card bg-surface p-6 shadow-xl sm:rounded-card">
            <h2 className="font-display text-lg font-bold text-ink">Entregar {handoverTarget.code} al piloto</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              Entrega manual sin escaneo: la nota queda en la cadena de custodia explicando cómo se hizo el traspaso.
            </p>
            <Textarea
              autoFocus
              label="Nota obligatoria"
              value={handoverNotes}
              onChange={(event) => setHandoverNotes(event.target.value)}
              rows={3}
              maxLength={280}
              wrapperClassName="mt-4"
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={handoverLoadingId === handoverTarget.id}
                onClick={() => {
                  setHandoverTarget(null);
                  setHandoverNotes("");
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                disabled={handoverLoadingId === handoverTarget.id || !handoverNotes.trim()}
                onClick={() => void confirmHandover()}
              >
                {handoverLoadingId === handoverTarget.id ? "Registrando..." : "Confirmar entrega"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
