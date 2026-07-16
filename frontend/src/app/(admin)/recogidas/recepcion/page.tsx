"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiJson, apiSend } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deliveredByName, setDeliveredByName] = useState("");
  const [deliveredByPhone, setDeliveredByPhone] = useState("");
  const [deliveredByRelationship, setDeliveredByRelationship] = useState("");
  const [deliveredByNotes, setDeliveredByNotes] = useState("");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [results, setResults] = useState<Record<number, ItemResult>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await apiGet<{ data: Task[] }>("/operational-tasks?task_type=hub_intake&per_page=100");
    setTasks((response.data ?? []).filter((task) => ["pending", "assigned", "accepted", "in_progress"].includes(task.status)));
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
        assigned_user_id: user?.id,
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
      const response = await apiSend<{ data: Batch }>(`/operational-tasks/${task.id}/batch`, "POST", {
        delivered_by_name: deliveredByName.trim() || null,
        delivered_by_phone: deliveredByPhone.trim() || null,
        delivered_by_relationship: deliveredByRelationship.trim() || null,
        delivered_by_notes: deliveredByNotes.trim() || null,
      });
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
      setDeliveredByName("");
      setDeliveredByPhone("");
      setDeliveredByRelationship("");
      setDeliveredByNotes("");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible cerrar el lote.");
    } finally { setBusy(null); }
  }

  return (
    <div className="animate-fade-in space-y-4">
      <OperationsHeader
        backHref="/recogidas"
        backLabel="Volver a ingresos"
        title="Recepción programada en sede"
        description="Recibe las entregas anunciadas y concilia cada paquete antes de aceptar la custodia. Los ingresos sin aviso se registran directamente desde Nuevo ingreso."
        actions={[{ href: "/recogidas/nueva", label: "Ingreso sin aviso", primary: true }]}
      />

      <OperationsCard title="Responsables de la recepción" description="El usuario autenticado recibe por Danhei. Identifica al tercero solo cuando otra persona lleva los paquetes.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#2a2a3e] dark:bg-[#16162a]">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recibe por Danhei</p>
            <p className="mt-1 font-bold text-slate-900 dark:text-slate-100">{user?.name || "Usuario autenticado"}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{user?.email || "Identidad verificada por sesión"}</p>
          </div>
          <FormField label="Nombre de quien entrega" hint="Déjalo vacío si entrega directamente el contacto del cliente.">
            <input className={controlClass} value={deliveredByName} onChange={(event) => setDeliveredByName(event.target.value)} />
          </FormField>
          <FormField label="Teléfono de quien entrega"><input className={controlClass} type="tel" value={deliveredByPhone} onChange={(event) => setDeliveredByPhone(event.target.value)} /></FormField>
          <FormField label="Relación con el cliente" hint="Ejemplo: empleado, mensajero o autorizado."><input className={controlClass} value={deliveredByRelationship} onChange={(event) => setDeliveredByRelationship(event.target.value)} /></FormField>
          <FormField className="md:col-span-2" label="Observación de custodia"><input className={controlClass} value={deliveredByNotes} onChange={(event) => setDeliveredByNotes(event.target.value)} /></FormField>
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
                {task.status === "pending" ? <button type="button" disabled={busy === task.id || !user?.id} onClick={() => void assign(task)} className={`${primaryButtonClass} w-full`}>Asignarme recepción</button> : null}
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
