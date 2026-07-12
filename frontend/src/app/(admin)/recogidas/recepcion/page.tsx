"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiJson, apiSend } from "@/lib/api";
import { usePageTitle } from "@/lib/page-title";

type ItemResult = "received" | "missing" | "rejected";
type Package = { id: number; package_index: number; recipient_name: string; guide_number?: string | null; shipment_id?: number | null };
type Task = {
  id: number;
  status: "pending" | "assigned" | "accepted" | "in_progress" | "completed";
  pickup_request?: { pickup_code: string; package_count: number; contact_name: string; packages: Package[] };
  service_location?: { name: string; address_line1: string } | null;
};
type Batch = { id: number; batch_code: string; status: string; expected_packages: number; items: Array<{ id: number; pickup_package_id: number; pickup_package: Package }> };

export default function RecepcionSedePage() {
  usePageTitle("Recepción en sede | Danhei Express");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [operator, setOperator] = useState("Operación Danhei");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [results, setResults] = useState<Record<number, ItemResult>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await apiGet<{ data: Task[] }>("/operational-tasks?task_type=hub_intake&per_page=100");
    setTasks(response.data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch(() => setMessage("No se pudieron cargar las recepciones de sede."));
  }, [load]);

  async function assign(task: Task) {
    setBusy(task.id);
    try {
      await apiSend(`/operational-tasks/${task.id}/assign`, "POST", {
        assignee_type: "hub_operator",
        assigned_executor_name: operator,
      });
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible asignar la recepción.");
    } finally { setBusy(null); }
  }

  async function transition(task: Task, status: "accepted" | "in_progress") {
    setBusy(task.id);
    try {
      await apiSend(`/operational-tasks/${task.id}/transition`, "POST", { status });
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible actualizar la recepción.");
    } finally { setBusy(null); }
  }

  async function openBatch(task: Task) {
    setBusy(task.id);
    try {
      const response = await apiSend<{ data: Batch }>(`/operational-tasks/${task.id}/batch`, "POST", {});
      setBatch(response.data);
      setResults(Object.fromEntries(response.data.items.map((item) => [item.pickup_package_id, "received"])));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible abrir el lote.");
    } finally { setBusy(null); }
  }

  async function closeBatch() {
    if (!batch) return;
    setBusy(-1);
    try {
      await apiJson(`/operational-pickup-batches/${batch.id}/reconcile`, "POST", {
        items: batch.items.map((item) => ({
          pickup_package_id: item.pickup_package_id,
          result: results[item.pickup_package_id] ?? "received",
          exception_code: results[item.pickup_package_id] === "missing" ? "NOT_DELIVERED_AT_HUB" : results[item.pickup_package_id] === "rejected" ? "REJECTED_AT_HUB" : null,
        })),
      });
      setMessage("Recepción conciliada y custodia registrada.");
      setBatch(null);
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible cerrar el lote.");
    } finally { setBusy(null); }
  }

  return <div className="animate-fade-in space-y-4">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      <Link href="/recogidas" className="text-sm font-semibold text-emerald-600">← Volver a recogidas</Link>
      <h1 className="mt-3 text-2xl font-bold">Recepción en sede</h1>
      <p className="mt-2 text-sm text-slate-500">Para entregas planificadas o personas que llegan sin solicitud previa.</p>
    </header>
    <label className="block rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">Operador que recibe<input className="mt-2 w-full" value={operator} onChange={(event) => setOperator(event.target.value)} /></label>
    {message && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{message}</p>}
    <section className="grid gap-3">{tasks.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-500 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">No hay entregas pendientes en sede.</p> : tasks.map((task) => <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold text-emerald-600">{task.pickup_request?.pickup_code}</p><h2 className="mt-1 font-bold">{task.service_location?.name || "Sede"}</h2><p className="mt-1 text-sm text-slate-500">{task.pickup_request?.package_count} paquete(s) · {task.pickup_request?.contact_name}</p></div>{task.status === "pending" && <button disabled={busy === task.id} onClick={() => void assign(task)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Asignar recepción</button>}{task.status === "assigned" && <button disabled={busy === task.id} onClick={() => void transition(task, "accepted")} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white">Aceptar</button>}{task.status === "accepted" && <button disabled={busy === task.id} onClick={() => void transition(task, "in_progress")} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white">Iniciar recepción</button>}{task.status === "in_progress" && <button disabled={busy === task.id} onClick={() => void openBatch(task)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Conciliar paquetes</button>}</div></article>)}</section>
    {batch && <section className="rounded-3xl border-2 border-emerald-500 bg-white p-5 dark:bg-[#1a1a2e]"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Lote {batch.batch_code}</h2><p className="text-sm text-slate-500">{batch.expected_packages} paquete(s) esperados</p></div><button onClick={() => setBatch(null)} className="text-sm font-semibold text-slate-500">Cerrar</button></div><div className="mt-4 grid gap-2">{batch.items.map((item) => <label key={item.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_180px] dark:border-[#2a2a3e]"><span><strong>{item.pickup_package.guide_number || `Paquete ${item.pickup_package.package_index}`}</strong><small className="block text-slate-500">{item.pickup_package.recipient_name}</small></span><select value={results[item.pickup_package_id] ?? "received"} onChange={(event) => setResults((current) => ({ ...current, [item.pickup_package_id]: event.target.value as ItemResult }))}><option value="received">Recibido</option><option value="missing">Faltante</option><option value="rejected">Rechazado</option></select></label>)}</div><button disabled={busy === -1} onClick={() => void closeBatch()} className="mt-4 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white">{busy === -1 ? "Cerrando…" : "Cerrar recepción"}</button></section>}
  </div>;
}
