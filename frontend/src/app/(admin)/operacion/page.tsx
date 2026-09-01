"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { usePageTitle } from "@/lib/page-title";
import { useToast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  KpiCard,
  MobileListCard,
  Select,
  StatusBadge,
  Textarea,
  type BadgeTone,
} from "@/components/ui";

type Driver = { id: number; name: string };
type Route = { id: number; driver_id: number; status: string; zone?: string | null };
type Location = { id: number; name: string };
type Task = {
  id: number;
  task_code: string;
  task_type: string;
  status: string;
  outcome_code?: string | null;
  notes?: string | null;
  customer?: { name: string; company?: string | null } | null;
  shipment?: { display_code: string } | null;
  assigned_driver?: Driver | null;
};

const labels: Record<string, string> = {
  client_pickup: "Recogida",
  hub_intake: "Ingreso a sede",
  delivery: "Entrega",
  return_to_hub: "Devolución a sede",
  return_to_client: "Devolución al cliente",
  cash_handoff: "Entrega de recaudo",
};

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  assigned: "Asignada",
  accepted: "Aceptada",
  in_progress: "En curso",
  completed: "Completada",
  partially_completed: "Parcial",
  failed: "Fallida",
};

function statusTone(status: string): BadgeTone {
  if (status === "completed") return "success";
  if (["assigned", "accepted", "in_progress"].includes(status)) return "info";
  if (status === "pending" || status === "partially_completed") return "warning";
  if (status === "failed") return "danger";
  return "neutral";
}

function taskReference(task: Task): string {
  return task.shipment?.display_code || task.customer?.company || task.customer?.name || "Sin referencia";
}

function taskMeta(task: Task): string {
  const driver = task.assigned_driver?.name || "Sin piloto";
  const reason = task.outcome_code || "Sin causal";
  return `${driver} · ${reason}${task.notes ? ` · ${task.notes}` : ""}`;
}

export default function ControlOperacionPage() {
  usePageTitle("Control operativo | Danhei Express");
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({
    shipment: "",
    type: "return_to_hub",
    location: "",
    driver: "",
    route: "",
    reason: "recipient_unavailable",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [taskRes, driverRes, routeRes, locationRes] = await Promise.all([
        apiGet<{ data: Task[] }>("/operational-tasks?per_page=100"),
        apiGet<{ data: Driver[] }>("/drivers?per_page=100&status=active"),
        apiGet<Route[]>("/routes"),
        apiGet<{ data: Location[] }>("/service-locations"),
      ]);
      setTasks(taskRes.data ?? []);
      setDrivers(driverRes.data ?? []);
      setRoutes(routeRes ?? []);
      setLocations(locationRes.data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar la operación.";
      setLoadError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const visible = useMemo(
    () => tasks.filter((task) => filter === "all" || task.task_type === filter),
    [filter, tasks],
  );
  const stats = useMemo(
    () => ({
      active: tasks.filter((task) => ["assigned", "accepted", "in_progress"].includes(task.status)).length,
      returns: tasks.filter((task) => task.task_type.startsWith("return_")).length,
      failed: tasks.filter((task) => task.status === "failed").length,
    }),
    [tasks],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const shipmentId = Number(form.shipment);
    if (!shipmentId) {
      showToast("Indica el ID de la guía.", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await apiSend<{ data: Task }>(`/shipments/${shipmentId}/returns`, "POST", {
        return_type: form.type,
        service_location_id: form.type === "return_to_hub" ? Number(form.location) || null : null,
        assigned_driver_id: Number(form.driver) || null,
        reason_code: form.reason,
        notes: form.notes || null,
      });
      if (form.route) {
        await apiSend(`/routes/${form.route}/task-stops`, "POST", { operational_task_id: created.data.id });
      }
      showToast(form.route ? "Devolución creada y agregada a la ruta." : "Devolución creada.", "success");
      setForm({ shipment: "", type: "return_to_hub", location: "", driver: "", route: "", reason: "recipient_unavailable", notes: "" });
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo crear la devolución.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 animate-fade-in space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Operación Danhei</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">Control de operación</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">
          Consulta tareas mixtas, crea devoluciones y conserva la trazabilidad entre guía, piloto, ruta y sede.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de operación">
        <KpiCard label="Tareas activas" value={stats.active} tone="info" />
        <KpiCard label="Devoluciones" value={stats.returns} tone="warning" />
        <KpiCard label="Tareas fallidas" value={stats.failed} tone="danger" />
      </section>

      <Card title="Nueva devolución">
        <p className="-mt-2 mb-5 text-sm text-ink-secondary">
          Registra el retorno de una guía y, si corresponde, asígnala a un piloto o ruta.
        </p>
        <form onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="ID de la guía"
              required
              type="number"
              min="1"
              value={form.shipment}
              onChange={(event) => setForm({ ...form, shipment: event.target.value })}
            />
            <Select
              label="Destino de la devolución"
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
            >
              <option value="return_to_hub">Sede Danhei</option>
              <option value="return_to_client">Cliente remitente</option>
            </Select>
            {form.type === "return_to_hub" ? (
              <Select
                label="Sede que recibe"
                required
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
              >
                <option value="">Selecciona una sede</option>
                {locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            ) : null}
            <Select
              label="Piloto responsable"
              value={form.driver}
              onChange={(event) => setForm({ ...form, driver: event.target.value, route: "" })}
            >
              <option value="">Asignar después</option>
              {drivers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
            <Select
              label="Ruta"
              value={form.route}
              onChange={(event) => setForm({ ...form, route: event.target.value })}
            >
              <option value="">Sin ruta</option>
              {routes
                .filter((route) => !form.driver || route.driver_id === Number(form.driver))
                .map((route) => (
                  <option key={route.id} value={route.id}>
                    #{route.id} · {route.zone || "Sin zona"} · {route.status}
                  </option>
                ))}
            </Select>
            <Input
              label="Causal"
              required
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
            />
            <Textarea
              label="Notas"
              wrapperClassName="md:col-span-2"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? "Creando…" : "Crear devolución"}
            </Button>
          </div>
        </form>
      </Card>

      <Card
        title="Tareas auditables"
        headerAction={(
          <div className="w-full sm:w-64">
            <Select
              aria-label="Filtrar tareas por tipo"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">Todas las tareas</option>
              <option value="client_pickup">Recogidas en cliente</option>
              <option value="return_to_hub">Devolución a sede</option>
              <option value="return_to_client">Devolución al cliente</option>
              <option value="cash_handoff">Entrega de recaudo</option>
            </Select>
          </div>
        )}
      >
        <p className="-mt-2 mb-4 text-sm text-ink-secondary">{visible.length} resultado(s) en el filtro actual.</p>
        {loading ? (
          <div className="space-y-3" aria-label="Cargando tareas">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-card bg-app-secondary" />
            ))}
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-input border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
            <p className="font-semibold">No se pudo cargar la operación.</p>
            <p className="mt-1 text-danger/80">{loadError}</p>
            <Button variant="secondary" size="md" className="mt-3" onClick={() => void load()}>
              Reintentar
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title="No hay tareas para este filtro"
            description="Cuando existan tareas operativas aparecerán aquí con su estado y responsable."
          />
        ) : (
          <>
            <div className="hidden divide-y divide-edge md:block">
              {visible.map((task) => (
                <article key={task.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-sm font-semibold text-ink">{task.task_code}</p>
                      <Badge tone="teal">{labels[task.task_type] || task.task_type}</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-ink">{taskReference(task)}</p>
                    <p className="mt-1 text-xs text-ink-secondary">{taskMeta(task)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={task.status} label={statusLabels[task.status] || task.status} tone={statusTone(task.status)} />
                  </div>
                </article>
              ))}
            </div>
            <div className="space-y-3 md:hidden">
              {visible.map((task) => (
                <MobileListCard
                  key={task.id}
                  title={task.task_code}
                  subtitle={taskReference(task)}
                  meta={taskMeta(task)}
                  status={<StatusBadge status={task.status} label={statusLabels[task.status] || task.status} tone={statusTone(task.status)} />}
                />
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
