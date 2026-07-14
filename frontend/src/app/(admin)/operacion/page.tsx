"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { usePageTitle } from "@/lib/page-title";
import { useToast } from "@/components/toast";
import {
  controlClass,
  EmptyState,
  FormField,
  MetricCard,
  OperationsCard,
  OperationsHeader,
  primaryButtonClass,
  StatusBadge,
  textareaClass,
} from "@/components/operations-ui";

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

function statusTone(status: string): "success" | "route" | "pending" | "issue" | "neutral" {
  if (status === "completed") return "success";
  if (["assigned", "accepted", "in_progress"].includes(status)) return "route";
  if (status === "pending" || status === "partially_completed") return "pending";
  if (status === "failed") return "issue";
  return "neutral";
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
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ shipment: "", type: "return_to_hub", location: "", driver: "", route: "", reason: "recipient_unavailable", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
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
      showToast(error instanceof Error ? error.message : "No se pudo cargar la operación.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const visible = useMemo(() => tasks.filter((task) => filter === "all" || task.task_type === filter), [filter, tasks]);
  const stats = useMemo(() => ({
    active: tasks.filter((task) => ["assigned", "accepted", "in_progress"].includes(task.status)).length,
    returns: tasks.filter((task) => task.task_type.startsWith("return_")).length,
    failed: tasks.filter((task) => task.status === "failed").length,
  }), [tasks]);

  async function submit(event: FormEvent) {
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
      if (form.route) await apiSend(`/routes/${form.route}/task-stops`, "POST", { operational_task_id: created.data.id });
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
    <div className="animate-fade-in space-y-4">
      <OperationsHeader
        title="Control de operación"
        description="Consulta las tareas mixtas, crea devoluciones y conserva la trazabilidad entre guía, piloto, ruta y sede."
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Tareas activas" value={stats.active} tone="route" />
        <MetricCard label="Devoluciones" value={stats.returns} tone="pending" />
        <MetricCard label="Tareas fallidas" value={stats.failed} tone="issue" />
      </section>

      <OperationsCard title="Nueva devolución" description="Registra el retorno de una guía y, si corresponde, asígnala a un piloto o ruta.">
        <form onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="ID de la guía"><input className={controlClass} required type="number" min="1" value={form.shipment} onChange={(event) => setForm({ ...form, shipment: event.target.value })} /></FormField>
            <FormField label="Destino de la devolución">
              <select className={controlClass} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                <option value="return_to_hub">Sede Danhei</option>
                <option value="return_to_client">Cliente remitente</option>
              </select>
            </FormField>
            {form.type === "return_to_hub" ? (
              <FormField label="Sede que recibe">
                <select className={controlClass} required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })}>
                  <option value="">Selecciona una sede</option>
                  {locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </FormField>
            ) : null}
            <FormField label="Piloto responsable">
              <select className={controlClass} value={form.driver} onChange={(event) => setForm({ ...form, driver: event.target.value, route: "" })}>
                <option value="">Asignar después</option>
                {drivers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </FormField>
            <FormField label="Ruta">
              <select className={controlClass} value={form.route} onChange={(event) => setForm({ ...form, route: event.target.value })}>
                <option value="">Sin ruta</option>
                {routes.filter((route) => !form.driver || route.driver_id === Number(form.driver)).map((route) => <option key={route.id} value={route.id}>#{route.id} · {route.zone || "Sin zona"} · {route.status}</option>)}
              </select>
            </FormField>
            <FormField label="Causal"><input className={controlClass} required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></FormField>
            <FormField className="md:col-span-2" label="Notas"><textarea className={textareaClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></FormField>
          </div>
          <div className="mt-4 flex justify-end">
            <button disabled={saving} className={`${primaryButtonClass} w-full sm:w-auto`}>{saving ? "Creando…" : "Crear devolución"}</button>
          </div>
        </form>
      </OperationsCard>

      <OperationsCard
        title="Tareas auditables"
        description={`${visible.length} resultado(s) en el filtro actual`}
        action={
          <select aria-label="Filtrar tareas por tipo" className={`${controlClass} sm:w-56`} value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Todas las tareas</option>
            <option value="client_pickup">Recogidas</option>
            <option value="return_to_hub">Devolución a sede</option>
            <option value="return_to_client">Devolución al cliente</option>
            <option value="cash_handoff">Entrega de recaudo</option>
          </select>
        }
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Cargando tareas…</p>
        ) : visible.length === 0 ? (
          <EmptyState>No hay tareas para este filtro.</EmptyState>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#2a2a3e]">
            {visible.map((task) => (
              <article key={task.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">{task.task_code} · {labels[task.task_type] || task.task_type}</p>
                  <p className="mt-1 truncate font-semibold text-slate-900 dark:text-[#e0e0e0]">{task.shipment?.display_code || task.customer?.company || task.customer?.name || "Sin referencia"}</p>
                  <p className="mt-1 text-xs text-slate-500">{task.outcome_code || "Sin causal"}{task.notes ? ` · ${task.notes}` : ""}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="text-sm font-semibold">{task.assigned_driver?.name || "Sin piloto"}</span>
                  <StatusBadge label={statusLabels[task.status] || task.status} tone={statusTone(task.status)} />
                </div>
              </article>
            ))}
          </div>
        )}
      </OperationsCard>
    </div>
  );
}
