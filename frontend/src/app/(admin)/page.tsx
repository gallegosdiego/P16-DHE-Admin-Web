"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  KpiCard,
  MobileListCard,
  StatusBadge,
  type BadgeTone,
} from "@/components/ui";
import type {
  DashboardResponse,
  PickupRequestDTO,
  PickupRequestListResponse,
  PickupRequestStatus,
} from "@/lib/types";

const pendingStatuses: PickupRequestStatus[] = [
  "pending_review",
  "needs_customer_input",
  "submitted",
  "accepted",
  "ready_for_assignment",
];

const pickupStatusLabels: Partial<Record<PickupRequestStatus, string>> = {
  draft: "Borrador",
  pending_review: "Pendiente",
  needs_customer_input: "Faltan datos",
  submitted: "Enviada",
  accepted: "Aceptada",
  ready_for_assignment: "Lista para asignar",
  assigned: "Asignada",
  driver_on_the_way: "Piloto en camino",
  partially_picked_up: "Recogida parcial",
  picked_up: "Recogida completa",
  not_picked_up: "No recogida",
  cancelled: "Cancelada",
};

const pickupStatusTones: Partial<Record<PickupRequestStatus, BadgeTone>> = {
  draft: "neutral",
  pending_review: "brand",
  needs_customer_input: "warning",
  submitted: "info",
  accepted: "success",
  ready_for_assignment: "teal",
  assigned: "teal",
  driver_on_the_way: "info",
  partially_picked_up: "warning",
  picked_up: "success",
  not_picked_up: "danger",
  cancelled: "neutral",
};

function ActionIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-2">
      <path d={path} />
    </svg>
  );
}

function greetingForHour(hour: number): string {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function formatAge(value: string | null | undefined): string | null {
  if (!value) return null;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;

  return `Hace ${Math.floor(hours / 24)} d`;
}

function pickupCustomerLabel(pickup: PickupRequestDTO): string {
  const name = pickup.customer?.name || pickup.contact_name || "Cliente sin nombre";
  return pickup.customer?.company ? `${name} · ${pickup.customer.company}` : name;
}

function pickupStatusLabel(pickup: PickupRequestDTO): string {
  return pickupStatusLabels[pickup.status] || pickup.status_label || "Pendiente";
}

function pickupAge(pickup: PickupRequestDTO): string | null {
  return formatAge(pickup.submitted_at || pickup.created_at || pickup.updated_at);
}

function pendingCount(feed: PickupRequestListResponse | null): number {
  if (!feed?.summary) return 0;

  return pendingStatuses.reduce((total, status) => {
    const count = feed.summary[status as keyof typeof feed.summary];
    return total + (typeof count === "number" ? count : 0);
  }, 0);
}

function isPendingPickup(pickup: PickupRequestDTO): boolean {
  return pendingStatuses.includes(pickup.status);
}

function PendingPickupStatus({ pickup }: { pickup: PickupRequestDTO }) {
  return (
    <StatusBadge
      status={pickup.status}
      label={pickupStatusLabel(pickup)}
      tone={pickupStatusTones[pickup.status]}
    />
  );
}

export default function DashboardPage() {
  usePageTitle("Dashboard | Danhei Express");
  const router = useRouter();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [pendingFeed, setPendingFeed] = useState<PickupRequestListResponse | null>(null);
  const [pendingError, setPendingError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState<number | null>(null);
  const [greeting, setGreeting] = useState("Buenos días");
  const controllers = useRef<Set<AbortController>>(new Set());

  const loadDashboard = async (mode: "initial" | "manual" | "auto", signal?: AbortSignal) => {
    if (mode === "initial") setLoading(true);
    if (mode !== "initial") setRefreshing(true);
    setPendingError(false);

    const pendingRequest = apiGet<PickupRequestListResponse>("/pickup-requests?per_page=6", { signal })
      .then((response) => {
        if (!Array.isArray(response.data) || !response.summary) {
          throw new Error("La bandeja de solicitudes devolvió una respuesta incompleta.");
        }
        return response;
      })
      .catch((error: unknown) => {
        if ((error as Error).name !== "AbortError" && !signal?.aborted) {
          setPendingError(true);
        }
        return null;
      });

    try {
      const [dashboard, pending] = await Promise.all([
        apiGet<DashboardResponse>("/dashboard", { signal }),
        pendingRequest,
      ]);
      if (signal?.aborted) return;

      setData(dashboard);
      if (pending) setPendingFeed(pending);
      setOffline(false);
      setSecondsSinceUpdate(0);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setOffline(true);
      if (!data) setData(null);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const triggerLoad = (mode: "initial" | "manual" | "auto") => {
    const controller = new AbortController();
    controllers.current.add(controller);
    void loadDashboard(mode, controller.signal).finally(() => controllers.current.delete(controller));
  };

  useEffect(() => {
    const activeControllers = controllers.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    triggerLoad("initial");
    const refreshId = window.setInterval(() => triggerLoad("auto"), 30_000);
    return () => {
      window.clearInterval(refreshId);
      activeControllers.forEach((controller) => controller.abort());
      activeControllers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // El saludo se calcula en el navegador para respetar la hora local del equipo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setSecondsSinceUpdate((previous) => typeof previous === "number" ? previous + 1 : previous);
    }, 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const pendingRows = Array.isArray(pendingFeed?.data)
    ? pendingFeed.data.filter(isPendingPickup).slice(0, 5)
    : [];
  const pendingTotal = pendingFeed ? pendingCount(pendingFeed) : null;

  if (loading) {
    return (
      <div className="space-y-6" aria-label="Cargando dashboard">
        <div className="space-y-2">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-5 w-44" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="No fue posible cargar el dashboard"
        description="Comprueba la conexión con la API e inténtalo de nuevo."
        action={(
          <Button onClick={() => triggerLoad("manual")}>
            Reintentar
          </Button>
        )}
      />
    );
  }

  return (
    <div className="min-w-0 animate-fade-in space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold leading-tight text-ink md:text-3xl">
            {greeting}, equipo Danhei
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            <span className="hidden md:inline">Resumen operativo de hoy</span>
            <span className="md:hidden">Tu operación de hoy</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-2 text-xs font-medium text-ink-secondary sm:inline-flex">
            <span className={`h-2 w-2 rounded-full ${offline ? "bg-danger" : "bg-success"}`} aria-hidden="true" />
            {offline ? "Sin conexión" : `Actualizado hace ${secondsSinceUpdate ?? 0}s`}
          </span>
          <Button
            variant="ghost"
            size="md"
            onClick={() => triggerLoad("manual")}
            disabled={refreshing}
            aria-label="Actualizar dashboard"
            className="border border-edge bg-surface text-ink-secondary hover:bg-app-secondary"
          >
            <span className="sm:hidden" aria-hidden="true">↻</span>
            <span>{refreshing ? "Actualizando..." : "Actualizar"}</span>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" aria-label="Indicadores de hoy">
        <KpiCard label="Paquetes hoy" value={data.today.total} />
        <KpiCard label="En ruta" value={data.today.in_transit} tone="info" />
        <KpiCard label="Entregados" value={data.today.delivered} tone="success" />
        <KpiCard label="Incidencias" value={data.today.issue} support="Requieren revisión" tone="danger" />
      </section>

      <Card title="Acciones rápidas">
        <div className="grid gap-2 md:grid-cols-3">
          <Button size="lg" className="w-full" onClick={() => router.push("/recogidas/nueva")}>
            <ActionIcon path="M12 5v14M5 12h14" />
            Ingresar paquete
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => router.push("/recogidas/nueva")}
          >
            <ActionIcon path="M5 5h14v4H5Zm0 6h14v8H5Zm2 2v4h4v-4Z" />
            Nueva recogida
          </Button>
          <div className="hidden md:block">
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => router.push("/recogidas/tareas")}
            >
              <ActionIcon path="M5.5 17H4l2.4-6.5h5.4l1.6 6.5M13 10.5h3.5l2.2 6.5M8 17a2.5 2.5 0 1 1 0-.01M18 17a2.5 2.5 0 1 1 0-.01" />
              Asignar piloto
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title="Solicitudes por completar"
        headerAction={(
          <Badge tone={pendingTotal === null ? "neutral" : "brand"}>
            {pendingTotal === null ? "Pendientes no disponible" : `${pendingTotal} pendientes`}
          </Badge>
        )}
      >
        {pendingError && pendingRows.length === 0 ? (
          <div role="alert" className="rounded-button border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
            <p className="font-semibold">No se pudo cargar la bandeja de solicitudes.</p>
            <p className="mt-1 text-danger/80">La lista no se reemplaza por ceros. Ábrela para volver a intentarlo.</p>
            <Button variant="ghost" size="md" className="mt-3 border border-danger/30 text-danger hover:bg-danger/10" onClick={() => router.push("/recogidas")}>
              Abrir bandeja
            </Button>
          </div>
        ) : pendingRows.length === 0 ? (
          <EmptyState
            title="No hay solicitudes pendientes"
            description="La bandeja de ingresos no tiene solicitudes por completar."
            className="border-0 px-0 py-8 shadow-none"
          />
        ) : (
          <>
            {pendingError ? (
              <p role="status" className="mb-3 rounded-button bg-warning/15 px-3 py-2 text-xs font-medium text-ink">
                No se pudo actualizar la bandeja; se muestra la última información disponible.
              </p>
            ) : null}

            <div className="hidden divide-y divide-edge border-t border-edge md:block">
              {pendingRows.map((pickup) => {
                const age = pickupAge(pickup);
                return (
                  <article key={pickup.id} className="flex items-center gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-sm font-semibold text-ink">{pickup.pickup_code}</p>
                        <PendingPickupStatus pickup={pickup} />
                      </div>
                      <p className="mt-1 truncate text-sm text-ink-secondary">{pickupCustomerLabel(pickup)}</p>
                      <p className="mt-1 text-xs text-ink-secondary">{age || "Antigüedad no disponible"}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => router.push("/recogidas")}
                      aria-label={`Abrir solicitud ${pickup.pickup_code}`}
                    >
                      Abrir
                    </Button>
                  </article>
                );
              })}
            </div>

            <div className="space-y-3 md:hidden">
              <button
                type="button"
                onClick={() => router.push("/recogidas")}
                className="admin-touch-target flex w-full items-center justify-between rounded-button border border-edge bg-app-secondary px-4 text-left text-sm font-semibold text-ink transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <span>{pendingTotal} solicitudes pendientes</span>
                <span aria-hidden="true" className="text-xl leading-none text-brand">›</span>
              </button>
              {pendingRows.map((pickup) => {
                const age = pickupAge(pickup);
                return (
                  <MobileListCard
                    key={pickup.id}
                    title={pickup.pickup_code}
                    subtitle={pickupCustomerLabel(pickup)}
                    meta={age || "Antigüedad no disponible"}
                    status={<PendingPickupStatus pickup={pickup} />}
                    action={(
                      <Button
                        variant="secondary"
                        size="md"
                        className="w-full"
                        onClick={() => router.push("/recogidas")}
                        aria-label={`Abrir solicitud ${pickup.pickup_code}`}
                      >
                        Abrir
                      </Button>
                    )}
                  />
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
