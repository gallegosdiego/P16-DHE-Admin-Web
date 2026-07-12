"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/lib/api";
import { usePageTitle } from "@/lib/page-title";

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
      <header className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <Link href="/recogidas" className="text-sm font-semibold text-emerald-600">← Volver a recogidas</Link>
        <h1 className="mt-3 text-2xl font-bold">Asignación de recogidas</h1>
        <p className="mt-2 text-sm text-slate-500">Solo se asignan solicitudes cuyas guías ya fueron materializadas.</p>
      </header>

      {message && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{message}</p>}
      <section className="grid gap-3">
        {tasks.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-500 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">No hay tareas de recogida.</p> : tasks.map((task) => {
          const materialized = task.pickup_request?.packages.every((item) => item.shipment_id != null) ?? false;
          return <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div><p className="text-xs font-bold text-emerald-600">{task.pickup_request?.pickup_code || task.task_code}</p><h2 className="mt-1 font-bold">{task.customer?.company || task.customer?.name || "Cliente"}</h2><p className="mt-1 text-sm text-slate-500">{task.pickup_request?.pickup_address_line1} · {task.pickup_request?.package_count ?? 0} paquete(s)</p><p className={`mt-2 text-xs font-semibold ${materialized ? "text-emerald-600" : "text-amber-600"}`}>{materialized ? "Guías listas" : "Primero aprueba y materializa las guías"}</p></div>
              {task.status === "pending" ? <div className="grid min-w-80 gap-2"><div className="flex gap-2"><select className="flex-1" value={selection[task.id] ?? ""} onChange={(event) => setSelection((current) => ({ ...current, [task.id]: event.target.value }))}><option value="">Selecciona piloto</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select><button disabled={!materialized || busy === task.id} onClick={() => void assignDriver(task)} className="rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50">Piloto</button></div><div className="flex gap-2"><input className="flex-1" placeholder="Recolector autorizado" value={collectors[task.id] ?? ""} onChange={(event) => setCollectors((current) => ({ ...current, [task.id]: event.target.value }))} /><button disabled={!materialized || busy === task.id} onClick={() => void assignCollector(task)} className="rounded-xl bg-sky-600 px-4 text-sm font-bold text-white disabled:opacity-50">Recolector</button></div></div> : <p className="rounded-full bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{task.assigned_driver?.name || task.status}</p>}
              {task.status === "pending" ? <div className="grid min-w-80 gap-2"><div className="flex gap-2"><select className="flex-1" value={selection[task.id] ?? ""} onChange={(event) => setSelection((current) => ({ ...current, [task.id]: event.target.value }))}><option value="">Selecciona piloto</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select><button disabled={!materialized || busy === task.id} onClick={() => void assignDriver(task)} className="rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50">Piloto</button></div><div className="flex gap-2"><input className="flex-1" placeholder="Recolector autorizado" value={collectors[task.id] ?? ""} onChange={(event) => setCollectors((current) => ({ ...current, [task.id]: event.target.value }))} /><button disabled={!materialized || busy === task.id} onClick={() => void assignCollector(task)} className="rounded-xl bg-sky-600 px-4 text-sm font-bold text-white disabled:opacity-50">Recolector</button></div></div> : <p className="rounded-full bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{task.assigned_driver?.name || task.assigned_executor_name || task.status}</p>}
            </div>
            {task.assignee_type === "authorized_collector" && ["completed", "partially_completed"].includes(task.status) && <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-[#2a2a3e]"><select value={handoverLocations[task.id] ?? ""} onChange={(event) => setHandoverLocations((current) => ({ ...current, [task.id]: event.target.value }))}><option value="">Sede que recibe</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><button disabled={busy === task.id} onClick={() => void handoverToHub(task)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Registrar traspaso a sede</button></div>}
          </article>;
        })}
      </section>
    </div>
  );
}
