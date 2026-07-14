"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiJson, apiSend } from "@/lib/api";
import { usePageTitle } from "@/lib/page-title";
import {
  controlClass,
  EmptyState,
  FormField,
  InlineNotice,
  OperationsCard,
  OperationsHeader,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from "@/components/operations-ui";

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

  return (
    <div className="animate-fade-in space-y-4">
      <OperationsHeader
        backHref="/recogidas"
        backLabel="Volver a recogidas"
        title="Recepción en sede"
        description="Recibe entregas planificadas o ingresos espontáneos y concilia cada paquete antes de aceptar la custodia."
      />

      <OperationsCard title="Responsable de recepción" description="Este nombre quedará asociado al movimiento operativo.">
        <div className="max-w-xl">
          <FormField label="Operador que recibe">
            <input className={controlClass} value={operator} onChange={(event) => setOperator(event.target.value)} />
          </FormField>
        </div>
      </OperationsCard>

      {message ? <InlineNotice>{message}</InlineNotice> : null}

      <section className="grid gap-3">
        {tasks.length === 0 ? (
          <EmptyState>No hay entregas pendientes en sede.</EmptyState>
        ) : tasks.map((task) => (
          <article key={task.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">{task.pickup_request?.pickup_code || `Recepción #${task.id}`}</p>
                  <StatusBadge label={task.status} tone={task.status === "in_progress" ? "pending" : "route"} />
                </div>
                <h2 className="mt-2 font-bold text-slate-900 dark:text-[#e0e0e0]">{task.service_location?.name || "Sede"}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{task.pickup_request?.package_count ?? 0} paquete(s) · {task.pickup_request?.contact_name || "Sin contacto"}</p>
              </div>
              <div className="w-full sm:w-auto">
                {task.status === "pending" ? <button type="button" disabled={busy === task.id || !operator.trim()} onClick={() => void assign(task)} className={`${primaryButtonClass} w-full`}>Asignar recepción</button> : null}
                {task.status === "assigned" ? <button type="button" disabled={busy === task.id} onClick={() => void transition(task, "accepted")} className={`${primaryButtonClass} w-full`}>Aceptar tarea</button> : null}
                {task.status === "accepted" ? <button type="button" disabled={busy === task.id} onClick={() => void transition(task, "in_progress")} className={`${primaryButtonClass} w-full`}>Iniciar recepción</button> : null}
                {task.status === "in_progress" ? <button type="button" disabled={busy === task.id} onClick={() => void openBatch(task)} className={`${primaryButtonClass} w-full`}>Conciliar paquetes</button> : null}
              </div>
            </div>
          </article>
        ))}
      </section>

      {batch ? (
        <OperationsCard
          className="border-primary/40"
          title={`Lote ${batch.batch_code}`}
          description={`${batch.expected_packages} paquete(s) esperados. Confirma el resultado individual antes de cerrar.`}
          action={<button type="button" onClick={() => setBatch(null)} className={secondaryButtonClass}>Cancelar</button>}
        >
          <div className="grid gap-2">
            {batch.items.map((item) => (
              <div key={item.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center dark:border-[#2a2a3e]">
                <div>
                  <strong className="text-sm">{item.pickup_package.guide_number || `Paquete ${item.pickup_package.package_index}`}</strong>
                  <p className="mt-0.5 text-xs text-slate-500">{item.pickup_package.recipient_name}</p>
                </div>
                <FormField label="Resultado">
                  <select className={controlClass} value={results[item.pickup_package_id] ?? "received"} onChange={(event) => setResults((current) => ({ ...current, [item.pickup_package_id]: event.target.value as ItemResult }))}>
                    <option value="received">Recibido</option>
                    <option value="missing">Faltante</option>
                    <option value="rejected">Rechazado</option>
                  </select>
                </FormField>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" disabled={busy === -1} onClick={() => void closeBatch()} className={`${primaryButtonClass} w-full sm:w-auto`}>{busy === -1 ? "Cerrando…" : "Cerrar recepción"}</button>
          </div>
        </OperationsCard>
      ) : null}
    </div>
  );
}
