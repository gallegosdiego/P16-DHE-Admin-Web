"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFormData, apiGet, apiSend } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/page-title";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  HelpTip,
  MobileListCard,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";

type ItemResult = "received" | "missing" | "rejected";
type PhysicalCondition = "intact" | "observed_damage" | "unknown";
type Package = { id: number; package_index: number; recipient_name: string; guide_number?: string | null; shipment_id?: number | null };
type Task = {
  id: number;
  status: "pending" | "assigned" | "accepted" | "in_progress" | "completed";
  pickup_request?: { pickup_code: string; package_count: number; contact_name: string; packages: Package[] };
  service_location?: { name: string; address_line1: string } | null;
};
type Batch = { id: number; batch_code: string; status: string; expected_packages: number; items: Array<{ id: number; pickup_package_id: number; pickup_package: Package }> };

const statusLabels: Record<Task["status"], string> = {
  pending: "Pendiente",
  assigned: "Asignada",
  accepted: "Aceptada",
  in_progress: "En curso",
  completed: "Completada",
};

function taskTone(status: Task["status"]): "brand" | "info" | "success" | "warning" {
  if (status === "in_progress") return "info";
  if (status === "completed") return "success";
  if (status === "pending") return "warning";
  return "brand";
}

function messageIsError(message: string) {
  return /no se|no fue|adjunta|selecciona|error|imposible/i.test(message);
}

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
  const [physicalConditions, setPhysicalConditions] = useState<Record<number, PhysicalCondition>>({});
  const [exceptionNotes, setExceptionNotes] = useState<Record<number, string>>({});
  const [evidenceFiles, setEvidenceFiles] = useState<Record<number, File | null>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    const response = await apiGet<{ data: Task[] }>("/operational-tasks?task_type=hub_intake&per_page=100");
    setTasks((response.data ?? []).filter((task) => ["pending", "assigned", "accepted", "in_progress"].includes(task.status)));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((caught) => setLoadError(caught instanceof Error ? caught.message : "No se pudieron cargar las recepciones de sede."));
  }, [load]);

  async function assign(task: Task) {
    setBusy(task.id);
    setMessage("");
    try {
      await apiSend(`/operational-tasks/${task.id}/assign`, "POST", {
        assignee_type: "hub_operator",
        assigned_user_id: user?.id,
      });
      setMessage("Recepción asignada a tu usuario.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible asignar la recepción.");
    } finally { setBusy(null); }
  }

  async function transition(task: Task, status: "accepted" | "in_progress") {
    setBusy(task.id);
    setMessage("");
    try {
      await apiSend(`/operational-tasks/${task.id}/transition`, "POST", { status });
      setMessage(status === "accepted" ? "Tarea aceptada." : "Recepción iniciada.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible actualizar la recepción.");
    } finally { setBusy(null); }
  }

  async function openBatch(task: Task) {
    setBusy(task.id);
    setMessage("");
    try {
      const response = await apiSend<{ data: Batch }>(`/operational-tasks/${task.id}/batch`, "POST", {
        delivered_by_name: deliveredByName.trim() || null,
        delivered_by_phone: deliveredByPhone.trim() || null,
        delivered_by_relationship: deliveredByRelationship.trim() || null,
        delivered_by_notes: deliveredByNotes.trim() || null,
      });
      setBatch(response.data);
      setResults(Object.fromEntries(response.data.items.map((item) => [item.pickup_package_id, "received"])));
      setPhysicalConditions(Object.fromEntries(response.data.items.map((item) => [item.pickup_package_id, "intact"])));
      setExceptionNotes({});
      setEvidenceFiles({});
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible abrir el lote.");
    } finally { setBusy(null); }
  }

  async function closeBatch() {
    if (!batch) return;
    const missingEvidence = batch.items.find((item) => {
      const result = results[item.pickup_package_id] ?? "received";
      const hasDifference = result !== "received" || physicalConditions[item.pickup_package_id] === "observed_damage";
      return hasDifference && !evidenceFiles[item.pickup_package_id];
    });
    if (missingEvidence) {
      setMessage("Adjunta una foto para cada faltante, rechazo o diferencia física antes de cerrar.");
      return;
    }

    setBusy(-1);
    setMessage("");
    try {
      const formData = new FormData();
      batch.items.forEach((item, index) => {
        const result = results[item.pickup_package_id] ?? "received";
        const physicalCondition = physicalConditions[item.pickup_package_id] ?? "intact";
        const prefix = `items[${index}]`;
        formData.append(`${prefix}[pickup_package_id]`, String(item.pickup_package_id));
        formData.append(`${prefix}[result]`, result);
        formData.append(`${prefix}[physical_condition]`, result === "received" ? physicalCondition : "unknown");
        if (result === "missing") formData.append(`${prefix}[exception_code]`, "NOT_DELIVERED_AT_HUB");
        if (result === "rejected") formData.append(`${prefix}[exception_code]`, "REJECTED_AT_HUB");
        const notes = exceptionNotes[item.pickup_package_id]?.trim();
        if (notes) formData.append(`${prefix}[exception_notes]`, notes);
        const evidence = evidenceFiles[item.pickup_package_id];
        if (evidence) formData.append(`${prefix}[evidence_photo]`, evidence);
      });

      await apiFormData(`/operational-pickup-batches/${batch.id}/reconcile`, "POST", formData);
      setMessage("Recepción conciliada y custodia registrada.");
      setBatch(null);
      setPhysicalConditions({});
      setExceptionNotes({});
      setEvidenceFiles({});
      setDeliveredByName("");
      setDeliveredByPhone("");
      setDeliveredByRelationship("");
      setDeliveredByNotes("");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible cerrar el lote.");
    } finally { setBusy(null); }
  }

  const actionFor = (task: Task) => {
    if (task.status === "pending") return <Button type="button" size="md" className="w-full" disabled={busy === task.id || !user?.id} onClick={() => void assign(task)}>Asignarme recepción</Button>;
    if (task.status === "assigned") return <Button type="button" size="md" className="w-full" disabled={busy === task.id} onClick={() => void transition(task, "accepted")}>Aceptar tarea</Button>;
    if (task.status === "accepted") return <Button type="button" size="md" className="w-full" disabled={busy === task.id} onClick={() => void transition(task, "in_progress")}>Iniciar recepción</Button>;
    return <Button type="button" size="md" className="w-full" disabled={busy === task.id} onClick={() => void openBatch(task)}>Conciliar paquetes</Button>;
  };

  return (
    <div className="min-w-0 animate-fade-in space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/recogidas" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal hover:underline">← Volver a ingresos</Link>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-brand">Operación Danhei</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">Recepción programada en sede</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">Recibe las entregas anunciadas y concilia cada paquete antes de aceptar la custodia. Los ingresos sin aviso se registran desde Nuevo ingreso.</p>
        </div>
        <Link href="/recogidas/nueva" className="inline-flex min-h-11 items-center justify-center rounded-button bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">Ingreso sin aviso</Link>
      </header>

      <Card title="Responsables de la recepción" headerAction={<div className="flex items-center gap-2"><Badge tone="teal">Custodia verificable</Badge><HelpTip topic="Responsables" text="El usuario autenticado recibe por Danhei. Identifica al tercero solo cuando otra persona lleva los paquetes." /></div>}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-input border border-edge bg-app-secondary p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Recibe por Danhei</p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">{user?.name || "Usuario autenticado"}</p>
            <p className="mt-1 text-xs text-ink-secondary">{user?.email || "Identidad verificada por sesión"}</p>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <label htmlFor="delivered_by_name_reception" className="text-sm font-medium text-ink">Nombre de quien entrega</label>
              <HelpTip topic="Quien entrega" text="Déjalo vacío si entrega directamente el contacto del cliente." />
            </div>
            <Input id="delivered_by_name_reception" value={deliveredByName} onChange={(event) => setDeliveredByName(event.target.value)} />
          </div>
          <Input label="Teléfono de quien entrega" type="tel" value={deliveredByPhone} onChange={(event) => setDeliveredByPhone(event.target.value)} />
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <label htmlFor="delivered_by_relationship_reception" className="text-sm font-medium text-ink">Relación con el cliente</label>
              <HelpTip topic="Relación con el cliente" text="Ejemplo: empleado, mensajero o autorizado." />
            </div>
            <Input id="delivered_by_relationship_reception" value={deliveredByRelationship} onChange={(event) => setDeliveredByRelationship(event.target.value)} />
          </div>
          <Input wrapperClassName="md:col-span-2" label="Observación de custodia" value={deliveredByNotes} onChange={(event) => setDeliveredByNotes(event.target.value)} />
        </div>
      </Card>

      {message ? <div role="status" className={`rounded-input border p-3 text-sm ${messageIsError(message) ? "border-danger/25 bg-danger/10 text-danger" : "border-success/25 bg-success/10 text-success"}`}>{message}</div> : null}

      {loadError ? (
        <Card title="Recepciones disponibles">
          <div role="alert" className="rounded-input border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
            <p className="font-semibold">No se pudieron cargar las recepciones de sede.</p>
            <p className="mt-1 text-danger/80">{loadError}</p>
            <Button variant="secondary" size="md" className="mt-3" onClick={() => void load()}>Reintentar</Button>
          </div>
        </Card>
      ) : tasks.length === 0 ? (
        <EmptyState title="No hay entregas pendientes en sede" description="Las tareas de recepción anunciadas aparecerán aquí cuando estén listas para operar." />
      ) : (
        <Card title="Entregas pendientes en sede" headerAction={<Badge tone="brand">{tasks.length}</Badge>}>
          <div className="hidden space-y-3 md:block">
            {tasks.map((task) => (
              <article key={task.id} className="flex items-center justify-between gap-4 rounded-input border border-edge bg-surface p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-display text-base font-semibold text-ink">{task.pickup_request?.pickup_code || `Recepción #${task.id}`}</p><StatusBadge status={task.status} label={statusLabels[task.status]} tone={taskTone(task.status)} /></div>
                  <p className="mt-1 text-sm font-semibold text-ink">{task.service_location?.name || "Sede"}</p>
                  <p className="mt-1 text-sm text-ink-secondary">{task.pickup_request?.package_count ?? 0} paquete(s) · {task.pickup_request?.contact_name || "Sin contacto"}</p>
                </div>
                <div className="w-56 shrink-0">{actionFor(task)}</div>
              </article>
            ))}
          </div>
          <div className="space-y-3 md:hidden">
            {tasks.map((task) => (
              <MobileListCard key={task.id} title={task.pickup_request?.pickup_code || `Recepción #${task.id}`} subtitle={task.service_location?.name || "Sede"} meta={`${task.pickup_request?.package_count ?? 0} paquete(s) · ${task.pickup_request?.contact_name || "Sin contacto"}`} status={<StatusBadge status={task.status} label={statusLabels[task.status]} tone={taskTone(task.status)} />} action={actionFor(task)} />
            ))}
          </div>
        </Card>
      )}

      {batch ? (
        <Card title={`Lote ${batch.batch_code}`} headerAction={<Button type="button" variant="ghost" size="md" className="border border-edge" onClick={() => setBatch(null)}>Cancelar</Button>}>
          <p className="mb-4 text-sm text-ink-secondary">{batch.expected_packages} paquete(s) esperados. Confirma el resultado individual antes de cerrar.</p>
          <div className="space-y-3">
            {batch.items.map((item) => {
              const result = results[item.pickup_package_id] ?? "received";
              const condition = physicalConditions[item.pickup_package_id] ?? "intact";
              const hasDifference = result !== "received" || condition === "observed_damage";
              return (
                <article key={item.id} className="rounded-input border border-edge p-4">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px_200px] lg:items-start">
                    <div><p className="font-display text-sm font-semibold text-ink">{item.pickup_package.guide_number || `Paquete ${item.pickup_package.package_index}`}</p><p className="mt-1 text-xs text-ink-secondary">{item.pickup_package.recipient_name}</p></div>
                    <Select label="Resultado" value={result} onChange={(event) => { const next = event.target.value as ItemResult; setResults((current) => ({ ...current, [item.pickup_package_id]: next })); setPhysicalConditions((current) => ({ ...current, [item.pickup_package_id]: next === "received" ? "intact" : "unknown" })); }}>
                      <option value="received">Recibido</option><option value="missing">Faltante</option><option value="rejected">Rechazado</option>
                    </Select>
                    <Select label="Condición física" value={condition} disabled={result !== "received"} onChange={(event) => setPhysicalConditions((current) => ({ ...current, [item.pickup_package_id]: event.target.value as PhysicalCondition }))}>
                      <option value="intact">Intacto</option><option value="observed_damage">Diferencia / daño</option><option value="unknown">No verificada</option>
                    </Select>
                  </div>
                  {hasDifference ? (
                    <div className="mt-4 grid gap-4 rounded-input border border-danger/25 bg-danger/10 p-4 md:grid-cols-2">
                      <label className="space-y-1 text-sm"><span className="font-medium text-ink">Foto obligatoria de la novedad</span><input className="block min-h-11 w-full rounded-input border border-edge bg-surface px-3 py-2 text-sm text-ink" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setEvidenceFiles((current) => ({ ...current, [item.pickup_package_id]: event.target.files?.[0] ?? null }))} />{evidenceFiles[item.pickup_package_id] ? <span className="block text-xs text-ink-secondary">{evidenceFiles[item.pickup_package_id]?.name}</span> : null}<span className="block text-xs text-ink-secondary">JPG, PNG o WEBP de máximo 5 MB.</span></label>
                      <div>
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <label htmlFor={`exception_notes_${item.pickup_package_id}`} className="text-sm font-medium text-ink">Detalle de la novedad</label>
                          <HelpTip topic="Detalle de novedad" text="La causal se registra automáticamente; agrega contexto si hace falta." />
                        </div>
                        <Textarea id={`exception_notes_${item.pickup_package_id}`} value={exceptionNotes[item.pickup_package_id] ?? ""} onChange={(event) => setExceptionNotes((current) => ({ ...current, [item.pickup_package_id]: event.target.value }))} />
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          <div className="mt-5 flex justify-end"><Button type="button" size="lg" className="w-full sm:w-auto" disabled={busy === -1} onClick={() => void closeBatch()}>{busy === -1 ? "Cerrando…" : "Cerrar recepción"}</Button></div>
        </Card>
      ) : null}
    </div>
  );
}
