"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { usePageTitle } from "@/lib/page-title";
import {
  controlClass,
  EmptyState,
  FormField,
  InlineNotice,
  OperationsHeader,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from "@/components/operations-ui";

type Driver = { id: number; name: string; status: string; phone: string };
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
  assignee_type?: string | null;
  assigned_executor_name?: string | null;
};

export default function TareasRecogidaPage() {
  usePageTitle("Asignación de recogidas | Danhei Express");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [locations, setLocations] = useState<ServiceLocation[]>([]);
  const [selection, setSelection] = useState<Record<number, string>>({});
  const [collectors, setCollectors] = useState<Record<number, string>>({});
  const [handoverLocations, setHandoverLocations] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [taskResponse, driverResponse, locationResponse] = await Promise.all([
      apiGet<{ data: Task[] }>("/operational-tasks?task_type=client_pickup&per_page=100"),
      apiGet<{ data: Driver[] }>("/drivers?per_page=100&status=active"),
      apiGet<{ data: ServiceLocation[] }>("/service-locations"),
    ]);
    setTasks(taskResponse.data ?? []);
    setDrivers(driverResponse.data ?? []);
    setLocations(locationResponse.data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch(() => setMessage("No se pudieron cargar las tareas."));
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

  async function handoverToHub(task: Task) {
    const serviceLocationId = Number(handoverLocations[task.id]);
    if (!serviceLocationId) {
      setMessage("Selecciona la sede que recibió los paquetes.");
      return;
    }
    setBusy(task.id);
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

  return (
    <div className="animate-fade-in space-y-4">
      <OperationsHeader
        backHref="/recogidas"
        backLabel="Volver a recogidas"
        title="Asignación de recogidas"
        description="Asigna cada solicitud a un piloto Danhei o a un recolector autorizado. Las guías deben estar materializadas antes de iniciar la ejecución."
      />

      {message ? <InlineNotice>{message}</InlineNotice> : null}
      <section className="grid gap-3">
        {tasks.length === 0 ? <EmptyState>No hay tareas de recogida pendientes.</EmptyState> : tasks.map((task) => {
          const materialized = task.pickup_request?.packages.every((item) => item.shipment_id != null) ?? false;
          return <article key={task.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">{task.pickup_request?.pickup_code || task.task_code}</p>
                  <StatusBadge label={materialized ? "Guías listas" : "Guías pendientes"} tone={materialized ? "success" : "pending"} />
                </div>
                <h2 className="mt-2 font-bold text-slate-900 dark:text-[#e0e0e0]">{task.customer?.company || task.customer?.name || "Cliente"}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{task.pickup_request?.pickup_address_line1 || "Dirección no registrada"}</p>
                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">{task.pickup_request?.package_count ?? 0} paquete(s)</p>
              </div>

              {task.status === "pending" ? (
                <div className="space-y-4 rounded-xl bg-slate-50 p-4 dark:bg-[#16162a]">
                  <div>
                    <FormField label="Asignar a piloto Danhei">
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <select className={controlClass} value={selection[task.id] ?? ""} onChange={(event) => setSelection((current) => ({ ...current, [task.id]: event.target.value }))}>
                          <option value="">Selecciona un piloto</option>
                          {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                        </select>
                        <button type="button" disabled={!materialized || busy === task.id} onClick={() => void assignDriver(task)} className={primaryButtonClass}>Asignar piloto</button>
                      </div>
                    </FormField>
                  </div>
                  <div className="border-t border-slate-200 pt-4 dark:border-[#2a2a3e]">
                    <FormField label="O asignar a recolector autorizado">
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <input className={controlClass} placeholder="Nombre completo" value={collectors[task.id] ?? ""} onChange={(event) => setCollectors((current) => ({ ...current, [task.id]: event.target.value }))} />
                        <button type="button" disabled={!materialized || busy === task.id} onClick={() => void assignCollector(task)} className={secondaryButtonClass}>Asignar recolector</button>
                      </div>
                    </FormField>
                  </div>
                  {!materialized ? <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Aprueba la solicitud y materializa sus guías para habilitar la asignación.</p> : null}
                </div>
              ) : (
                <div className="flex items-start justify-start lg:justify-end">
                  <StatusBadge label={task.assigned_driver?.name || task.assigned_executor_name || task.status} tone="route" />
                </div>
              )}
            </div>
            {task.assignee_type === "authorized_collector" && ["completed", "partially_completed"].includes(task.status) ? (
              <div className="mt-5 border-t border-slate-200 pt-4 dark:border-[#2a2a3e]">
                <p className="mb-3 text-sm font-bold">Traspaso de custodia a sede</p>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:max-w-2xl">
                  <select aria-label="Sede que recibe" className={controlClass} value={handoverLocations[task.id] ?? ""} onChange={(event) => setHandoverLocations((current) => ({ ...current, [task.id]: event.target.value }))}>
                    <option value="">Selecciona la sede que recibe</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                  <button type="button" disabled={busy === task.id} onClick={() => void handoverToHub(task)} className={primaryButtonClass}>Registrar traspaso</button>
                </div>
              </div>
            ) : null}
          </article>;
        })}
      </section>
    </div>
  );
}
