"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { usePageTitle } from "@/lib/page-title";
import type { PaginatedResponse, UserListItem } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MobileListCard,
  Select,
  StatusBadge,
} from "@/components/ui";

type Driver = { id: number; name: string; status: string; phone: string };
type DriverResponse = Driver[] | { data: Driver[] };
type ServiceLocation = { id: number; name: string; address_line1: string };
type Task = {
  id: number;
  task_code: string;
  status: string;
  scheduled_date?: string | null;
  customer?: { name: string; company?: string | null } | null;
  pickup_request?: {
    pickup_code: string;
    pickup_address_line1: string;
    package_count: number;
    packages: Array<{ id: number; shipment_id?: number | null }>;
  } | null;
  assigned_driver?: Driver | null;
  assigned_user?: { id: number; name: string; phone?: string | null } | null;
  assignee_type?: string | null;
  assigned_executor_name?: string | null;
};

function messageTone(message: string): "success" | "warning" | "info" {
  if (/no fue|no se|selecciona|escribe|materializa|aprueba/i.test(message)) return "warning";
  if (/asignada|registrado|aparece|identidad/i.test(message)) return "success";
  return "info";
}

function taskLabel(task: Task) {
  return task.pickup_request?.pickup_code || task.task_code;
}

function taskSubtitle(task: Task) {
  return task.customer?.company || task.customer?.name || "Cliente";
}

function taskMeta(task: Task) {
  return `${task.pickup_request?.pickup_address_line1 || "Dirección no registrada"} · ${task.pickup_request?.package_count ?? 0} paquete(s)`;
}

function assignmentLabel(task: Task) {
  return task.assigned_driver?.name || task.assigned_user?.name || task.assigned_executor_name || task.status;
}

export default function TareasRecogidaPage() {
  usePageTitle("Asignación de recogidas | Danhei Express");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [locations, setLocations] = useState<ServiceLocation[]>([]);
  const [employees, setEmployees] = useState<UserListItem[]>([]);
  const [selection, setSelection] = useState<Record<number, string>>({});
  const [employeeSelection, setEmployeeSelection] = useState<Record<number, string>>({});
  const [collectors, setCollectors] = useState<Record<number, string>>({});
  const [handoverLocations, setHandoverLocations] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    const [taskResponse, driverResponse, locationResponse, userResponse] = await Promise.all([
      apiGet<{ data: Task[] }>("/operational-tasks?task_type=client_pickup&per_page=100"),
      apiGet<DriverResponse>("/drivers?per_page=100&status=active"),
      apiGet<{ data: ServiceLocation[] }>("/service-locations"),
      apiGet<PaginatedResponse<UserListItem>>("/users?per_page=100"),
    ]);
    setTasks(taskResponse.data ?? []);
    setDrivers(Array.isArray(driverResponse) ? driverResponse : driverResponse.data ?? []);
    setLocations(locationResponse.data ?? []);
    setEmployees((userResponse.data ?? []).filter((employee) =>
      employee.role_names.some((role) => ["superadmin", "administrador", "operador"].includes(role))
    ));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((caught) => setLoadError(caught instanceof Error ? caught.message : "No se pudieron cargar las tareas."));
  }, [load]);

  async function assignDriver(task: Task) {
    const driverId = Number(selection[task.id]);
    if (!driverId) {
      setMessage("Selecciona un piloto.");
      return;
    }
    setBusy(task.id);
    setMessage("");
    try {
      await apiSend(`/operational-tasks/${task.id}/assign`, "POST", {
        assignee_type: "danhei_driver",
        assigned_driver_id: driverId,
        scheduled_date: new Date().toISOString().slice(0, 10),
      });
      setMessage("Tarea asignada. Ya aparece en P15 para el piloto.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible asignar.");
    } finally {
      setBusy(null);
    }
  }

  async function assignCollector(task: Task) {
    const name = collectors[task.id]?.trim();
    if (!name) {
      setMessage("Escribe el nombre del recolector autorizado.");
      return;
    }
    setBusy(task.id);
    setMessage("");
    try {
      await apiSend(`/operational-tasks/${task.id}/assign`, "POST", {
        assignee_type: "authorized_collector",
        assigned_executor_name: name,
        scheduled_date: new Date().toISOString().slice(0, 10),
      });
      setMessage("Tarea asignada al recolector. La recepción en sede registrará el traspaso de custodia.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible asignar el recolector.");
    } finally {
      setBusy(null);
    }
  }

  async function assignEmployee(task: Task) {
    const employeeId = Number(employeeSelection[task.id]);
    if (!employeeId) {
      setMessage("Selecciona un empleado Danhei.");
      return;
    }
    setBusy(task.id);
    setMessage("");
    try {
      await apiSend(`/operational-tasks/${task.id}/assign`, "POST", {
        assignee_type: "danhei_employee",
        assigned_user_id: employeeId,
        scheduled_date: new Date().toISOString().slice(0, 10),
      });
      setMessage("Tarea asignada al empleado Danhei con identidad verificable.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible asignar el empleado.");
    } finally {
      setBusy(null);
    }
  }

  async function handoverToHub(task: Task) {
    const serviceLocationId = Number(handoverLocations[task.id]);
    if (!serviceLocationId) {
      setMessage("Selecciona la sede que recibió los paquetes.");
      return;
    }
    setBusy(task.id);
    setMessage("");
    try {
      await apiSend(`/operational-tasks/${task.id}/handover-to-hub`, "POST", { service_location_id: serviceLocationId });
      setMessage("Traspaso recolector → sede registrado en la cadena de custodia.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible registrar el traspaso.");
    } finally {
      setBusy(null);
    }
  }

  const taskActions = (task: Task, materialized: boolean) => (
    <div className="space-y-4 rounded-input border border-edge bg-app-secondary p-4">
      <div>
        <Select label="Asignar a piloto Danhei" value={selection[task.id] ?? ""} onChange={(event) => setSelection((current) => ({ ...current, [task.id]: event.target.value }))}>
          <option value="">Selecciona un piloto</option>
          {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
        </Select>
        <Button type="button" className="mt-2 w-full" disabled={!materialized || busy === task.id} onClick={() => void assignDriver(task)}>Asignar piloto</Button>
      </div>
      <div className="border-t border-edge pt-4">
        <Select label="O asignar a empleado Danhei" value={employeeSelection[task.id] ?? ""} onChange={(event) => setEmployeeSelection((current) => ({ ...current, [task.id]: event.target.value }))}>
          <option value="">Selecciona un empleado</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
        </Select>
        <Button type="button" variant="secondary" className="mt-2 w-full" disabled={!materialized || busy === task.id} onClick={() => void assignEmployee(task)}>Asignar empleado</Button>
      </div>
      <div className="border-t border-edge pt-4">
        <Input label="O asignar a recolector autorizado" placeholder="Nombre completo" value={collectors[task.id] ?? ""} onChange={(event) => setCollectors((current) => ({ ...current, [task.id]: event.target.value }))} />
        <Button type="button" variant="secondary" className="mt-2 w-full" disabled={!materialized || busy === task.id} onClick={() => void assignCollector(task)}>Asignar recolector</Button>
      </div>
      {!materialized ? <p className="text-xs font-semibold text-ink-secondary">Aprueba la solicitud y materializa sus guías para habilitar la asignación.</p> : null}
    </div>
  );

  const handoverFor = (task: Task) => {
    if (task.assignee_type !== "authorized_collector" || !["completed", "partially_completed"].includes(task.status)) return null;
    return (
      <div className="border-t border-edge pt-4">
        <p className="mb-3 font-display text-sm font-semibold text-ink">Traspaso de custodia a sede</p>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Select aria-label="Sede que recibe" value={handoverLocations[task.id] ?? ""} onChange={(event) => setHandoverLocations((current) => ({ ...current, [task.id]: event.target.value }))}>
            <option value="">Selecciona la sede que recibe</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </Select>
          <Button type="button" disabled={busy === task.id} onClick={() => void handoverToHub(task)}>Registrar traspaso</Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-w-0 animate-fade-in space-y-6">
      <header>
        <Link href="/recogidas" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal hover:underline">← Volver a ingresos</Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-brand">Operación Danhei</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">Asignación de recogidas</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">Asigna cada solicitud a un piloto, empleado Danhei o recolector autorizado. La forma de ingreso no cambia cuando cambia el responsable.</p>
      </header>

      {message ? (
        <div role="status" className={`rounded-input border p-3 text-sm ${messageTone(message) === "success" ? "border-success/25 bg-success/10 text-success" : messageTone(message) === "warning" ? "border-warning/35 bg-warning/15 text-ink" : "border-info/25 bg-info/10 text-teal"}`}>
          {message}
          {message.includes("materializa") ? <> Hazlo desde el detalle de la solicitud en <Link href="/recogidas" className="font-semibold underline underline-offset-2">la bandeja de ingresos</Link>, pestaña «Materializar».</> : null}
        </div>
      ) : null}

      {loadError ? (
        <Card title="Tareas de recogida">
          <div role="alert" className="rounded-input border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
            <p className="font-semibold">No se pudieron cargar las tareas.</p>
            <p className="mt-1 text-danger/80">{loadError}</p>
            <Button variant="secondary" size="md" className="mt-3" onClick={() => void load()}>Reintentar</Button>
          </div>
        </Card>
      ) : tasks.length === 0 ? (
        <EmptyState title="No hay tareas de recogida pendientes" description="Las solicitudes materializadas aparecerán aquí para asignarlas a un responsable." />
      ) : (
        <Card title="Tareas de recogida" headerAction={<Badge tone="brand">{tasks.length}</Badge>}>
          <div className="hidden space-y-3 md:block">
            {tasks.map((task) => {
              const packages = task.pickup_request?.packages ?? [];
              const materialized = packages.length > 0 && packages.every((item) => item.shipment_id != null);
              const status = materialized ? "Guías listas" : "Guías pendientes";
              const statusTone = materialized ? "success" : "warning";
              return (
                <article key={task.id} className="rounded-input border border-edge bg-surface p-4 md:p-5">
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><p className="font-display text-base font-semibold text-ink">{taskLabel(task)}</p><StatusBadge status={materialized ? "ready" : "pending"} label={status} tone={statusTone} /></div>
                      <p className="mt-2 text-sm font-semibold text-ink">{taskSubtitle(task)}</p>
                      <p className="mt-1 text-sm leading-6 text-ink-secondary">{taskMeta(task)}</p>
                    </div>
                    {task.status === "pending" ? taskActions(task, materialized) : <div className="flex items-start justify-start lg:justify-end"><StatusBadge status="active" label={assignmentLabel(task)} tone="info" /></div>}
                  </div>
                  {handoverFor(task) ? <div className="mt-5">{handoverFor(task)}</div> : null}
                </article>
              );
            })}
          </div>
          <div className="space-y-3 md:hidden">
            {tasks.map((task) => {
              const packages = task.pickup_request?.packages ?? [];
              const materialized = packages.length > 0 && packages.every((item) => item.shipment_id != null);
              const action = task.status === "pending" ? taskActions(task, materialized) : handoverFor(task);
              return (
                <MobileListCard
                  key={task.id}
                  title={taskLabel(task)}
                  subtitle={taskSubtitle(task)}
                  meta={taskMeta(task)}
                  status={<StatusBadge status={materialized ? "ready" : "pending"} label={materialized ? "Guías listas" : "Guías pendientes"} tone={materialized ? "success" : "warning"} />}
                  action={action}
                />
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
