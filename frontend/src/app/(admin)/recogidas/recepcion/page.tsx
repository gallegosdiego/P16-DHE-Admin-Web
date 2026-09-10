"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFormData, apiGet, apiSend } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/page-title";
import { formatCOP, formatDate } from "@/lib/utils";
import { PrintReceptionReceiptButton } from "@/components/print-reception-receipt";
import type { PickupReceptionReceiptDTO, Zone } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  CurrencyInput,
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
type PackagePaymentType = "cash_on_delivery" | "post_sale" | "prepaid" | "mercado_libre";

type Package = { id: number; package_index: number; recipient_name: string; guide_number?: string | null; shipment_id?: number | null };
type Task = {
  id: number;
  status: "pending" | "assigned" | "accepted" | "in_progress" | "completed";
  pickup_request?: { pickup_code: string; package_count: number; contact_name: string; packages: Package[] };
  service_location?: { name: string; address_line1: string } | null;
};
type Batch = { id: number; batch_code: string; status: string; expected_packages: number; items: Array<{ id: number; pickup_package_id: number; pickup_package: Package }> };

export interface UndeclaredPackageDraft {
  tempId: string;
  recipient_name: string;
  recipient_phone: string;
  delivery_address_line1: string;
  delivery_address_complement: string;
  delivery_zone: string;
  delivery_city: string;
  payment_type: PackagePaymentType;
  is_cod: boolean;
  requested_cod_amount: number;
  is_fragile: boolean;
  package_type: string;
  size_code: string;
  approx_weight_kg: string;
  special_handling_notes: string;
  physical_condition: PhysicalCondition;
  exception_code: string;
  exception_notes: string;
  evidence_photo: File | null;
}

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
  return /no se|no fue|adjunta|selecciona|error|imposible|requerido|obligatoria/i.test(message);
}

function createEmptyUndeclaredPackage(): UndeclaredPackageDraft {
  return {
    tempId: "undec-" + Math.random().toString(36).substring(2, 9),
    recipient_name: "",
    recipient_phone: "",
    delivery_address_line1: "",
    delivery_address_complement: "",
    delivery_zone: "",
    delivery_city: "Bogotá",
    payment_type: "cash_on_delivery",
    is_cod: false,
    requested_cod_amount: 0,
    is_fragile: false,
    package_type: "Paquete",
    size_code: "small",
    approx_weight_kg: "",
    special_handling_notes: "",
    physical_condition: "intact",
    exception_code: "SURPLUS_UNANNOUNCED_PACKAGE",
    exception_notes: "",
    evidence_photo: null,
  };
}

export default function RecepcionSedePage() {
  usePageTitle("Recepción en sede | Danhei Express");
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [deliveredByName, setDeliveredByName] = useState("");
  const [deliveredByPhone, setDeliveredByPhone] = useState("");
  const [deliveredByRelationship, setDeliveredByRelationship] = useState("");
  const [deliveredByNotes, setDeliveredByNotes] = useState("");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [results, setResults] = useState<Record<number, ItemResult>>({});
  const [physicalConditions, setPhysicalConditions] = useState<Record<number, PhysicalCondition>>({});
  const [exceptionNotes, setExceptionNotes] = useState<Record<number, string>>({});
  const [evidenceFiles, setEvidenceFiles] = useState<Record<number, File | null>>({});
  
  // Excedentes no declarados
  const [undeclaredPackages, setUndeclaredPackages] = useState<UndeclaredPackageDraft[]>([]);
  const [showUndeclaredForm, setShowUndeclaredForm] = useState(false);
  const [newUndeclared, setNewUndeclared] = useState<UndeclaredPackageDraft>(createEmptyUndeclaredPackage());
  const [formUndeclaredError, setFormUndeclaredError] = useState("");

  // Comprobante post-cierre
  const [closedReceipt, setClosedReceipt] = useState<PickupReceptionReceiptDTO | null>(null);

  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    const [tasksRes, zonesRes] = await Promise.allSettled([
      apiGet<{ data: Task[] }>("/operational-tasks?task_type=hub_intake&per_page=100"),
      apiGet<Zone[]>("/zones?active=1"),
    ]);

    if (tasksRes.status === "fulfilled") {
      setTasks((tasksRes.value.data ?? []).filter((task) => ["pending", "assigned", "accepted", "in_progress"].includes(task.status)));
    } else {
      setLoadError("No se pudieron cargar las recepciones de sede.");
    }

    if (zonesRes.status === "fulfilled") {
      setZones(Array.isArray(zonesRes.value) ? zonesRes.value : []);
    }
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
    setClosedReceipt(null);
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
      setUndeclaredPackages([]);
      setShowUndeclaredForm(false);
      setNewUndeclared(createEmptyUndeclaredPackage());
      setFormUndeclaredError("");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "No fue posible abrir el lote.");
    } finally { setBusy(null); }
  }

  function handleAddUndeclaredSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormUndeclaredError("");

    if (!newUndeclared.recipient_name.trim()) {
      setFormUndeclaredError("El nombre del destinatario es obligatorio.");
      return;
    }
    if (!newUndeclared.recipient_phone.trim()) {
      setFormUndeclaredError("El teléfono del destinatario es obligatorio.");
      return;
    }
    if (!newUndeclared.delivery_address_line1.trim()) {
      setFormUndeclaredError("La dirección de entrega es obligatoria.");
      return;
    }
    if (!newUndeclared.exception_code.trim()) {
      setFormUndeclaredError("La causal de novedad es obligatoria.");
      return;
    }
    if (!newUndeclared.evidence_photo) {
      setFormUndeclaredError("La foto de evidencia es obligatoria para registrar un paquete no declarado.");
      return;
    }

    setUndeclaredPackages((prev) => [...prev, { ...newUndeclared }]);
    setNewUndeclared(createEmptyUndeclaredPackage());
    setShowUndeclaredForm(false);
    setMessage("Paquete no declarado agregado al mostrador.");
  }

  function removeUndeclared(tempId: string) {
    setUndeclaredPackages((prev) => prev.filter((pkg) => pkg.tempId !== tempId));
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

    const missingUndeclaredEvidence = undeclaredPackages.find((pkg) => !pkg.evidence_photo);
    if (missingUndeclaredEvidence) {
      setMessage("Cada paquete no declarado debe tener su foto de evidencia adjunta.");
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

      undeclaredPackages.forEach((pkg, index) => {
        const prefix = `undeclared_packages[${index}]`;
        formData.append(`${prefix}[recipient_name]`, pkg.recipient_name.trim());
        formData.append(`${prefix}[recipient_phone]`, pkg.recipient_phone.trim());
        formData.append(`${prefix}[delivery_address_line1]`, pkg.delivery_address_line1.trim());
        if (pkg.delivery_address_complement.trim()) formData.append(`${prefix}[delivery_address_complement]`, pkg.delivery_address_complement.trim());
        if (pkg.delivery_zone.trim()) formData.append(`${prefix}[delivery_zone]`, pkg.delivery_zone.trim());
        if (pkg.delivery_city.trim()) formData.append(`${prefix}[delivery_city]`, pkg.delivery_city.trim());
        formData.append(`${prefix}[payment_type]`, pkg.payment_type);
        formData.append(`${prefix}[is_cod]`, pkg.payment_type === "cash_on_delivery" ? "1" : "0");
        if (pkg.payment_type === "cash_on_delivery" && pkg.requested_cod_amount > 0) {
          formData.append(`${prefix}[requested_cod_amount]`, String(pkg.requested_cod_amount));
        }
        formData.append(`${prefix}[is_fragile]`, pkg.is_fragile ? "1" : "0");
        if (pkg.package_type.trim()) formData.append(`${prefix}[package_type]`, pkg.package_type.trim());
        if (pkg.size_code.trim()) formData.append(`${prefix}[size_code]`, pkg.size_code.trim());
        if (pkg.approx_weight_kg.trim()) formData.append(`${prefix}[approx_weight_kg]`, pkg.approx_weight_kg.trim());
        if (pkg.special_handling_notes.trim()) formData.append(`${prefix}[special_handling_notes]`, pkg.special_handling_notes.trim());
        formData.append(`${prefix}[physical_condition]`, pkg.physical_condition);
        formData.append(`${prefix}[exception_code]`, pkg.exception_code.trim() || "SURPLUS_UNANNOUNCED_PACKAGE");
        if (pkg.exception_notes.trim()) formData.append(`${prefix}[exception_notes]`, pkg.exception_notes.trim());
        if (pkg.evidence_photo) formData.append(`${prefix}[evidence_photo]`, pkg.evidence_photo);
      });

      await apiFormData<{ data: { id: number } }>(`/operational-pickup-batches/${batch.id}/reconcile`, "POST", formData);
      setMessage("Recepción conciliada y custodia registrada.");
      
      const batchId = batch.id;
      setBatch(null);
      setPhysicalConditions({});
      setExceptionNotes({});
      setEvidenceFiles({});
      setUndeclaredPackages([]);
      setShowUndeclaredForm(false);
      setDeliveredByName("");
      setDeliveredByPhone("");
      setDeliveredByRelationship("");
      setDeliveredByNotes("");
      await load();

      // Cargar comprobante automáticamente
      try {
        const receiptRes = await apiGet<{ data: PickupReceptionReceiptDTO }>(`/operational-pickup-batches/${batchId}/receipt`);
        setClosedReceipt(receiptRes.data);
      } catch {
        // Silencioso, el comprobante se puede ver en la lista general
      }
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

  // Cálculos de conteo en mostrador
  const declaredCount = batch?.expected_packages ?? 0;
  const receivedDeclaredCount = batch ? batch.items.filter((item) => (results[item.pickup_package_id] ?? "received") === "received").length : 0;
  const physicalCounterCount = receivedDeclaredCount + undeclaredPackages.length;
  const hasCountDifference = batch ? declaredCount !== physicalCounterCount : false;

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

      {/* Modal / Card de Comprobante generado */}
      {closedReceipt ? (
        <Card title={`Comprobante de recepción ${closedReceipt.receipt_code}`} headerAction={<PrintReceptionReceiptButton receipt={closedReceipt} label="Imprimir / Guardar PDF" />}>
          <div className="space-y-4">
            <div className="rounded-input border border-success/30 bg-success/10 p-4 text-sm text-ink">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-success">¡Lote conciliado y cerrado con éxito!</p>
                  <p className="text-xs text-ink-secondary mt-0.5">Fecha: {formatDate(closedReceipt.received_at || closedReceipt.generated_at)} · Recibió: {closedReceipt.received_by.name || "Usuario de sesión"}</p>
                </div>
                <Badge tone={closedReceipt.summary.has_differences ? "danger" : "success"}>{closedReceipt.status_label}</Badge>
              </div>
            </div>

            {/* Métricas del comprobante */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-input border border-edge bg-app-secondary p-3 text-center">
                <span className="block text-xs font-semibold uppercase text-ink-secondary">Declarados</span>
                <strong className="text-xl text-ink">{closedReceipt.summary.expected_packages}</strong>
              </div>
              <div className="rounded-input border border-edge bg-app-secondary p-3 text-center">
                <span className="block text-xs font-semibold uppercase text-ink-secondary">Recibidos</span>
                <strong className="text-xl text-success">{closedReceipt.summary.received_packages}</strong>
              </div>
              <div className="rounded-input border border-edge bg-app-secondary p-3 text-center">
                <span className="block text-xs font-semibold uppercase text-ink-secondary">Rechazados</span>
                <strong className="text-xl text-danger">{closedReceipt.summary.rejected_packages}</strong>
              </div>
              <div className="rounded-input border border-edge bg-app-secondary p-3 text-center">
                <span className="block text-xs font-semibold uppercase text-ink-secondary">Faltantes</span>
                <strong className="text-xl text-amber-600 dark:text-amber-400">{closedReceipt.summary.missing_packages}</strong>
              </div>
              <div className="rounded-input border border-edge bg-app-secondary p-3 text-center col-span-2 sm:col-span-1">
                <span className="block text-xs font-semibold uppercase text-brand">Sin declarar</span>
                <strong className="text-xl text-brand">{closedReceipt.summary.undeclared_packages ?? 0}</strong>
              </div>
            </div>

            {/* Lista de ítems en el comprobante */}
            <div className="space-y-2">
              <h4 className="font-display text-sm font-bold text-ink">Detalle de paquetes procesados ({closedReceipt.items.length})</h4>
              <div className="divide-y divide-edge rounded-input border border-edge bg-surface">
                {closedReceipt.items.map((item) => (
                  <div key={item.id} className="p-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong>{item.guide_number || item.tracking_code || `Paquete ${item.package_index || item.id}`}</strong>
                        <Badge tone={item.result === "received" ? (item.exception_code === "SURPLUS_UNANNOUNCED_PACKAGE" ? "brand" : "success") : "danger"}>
                          {item.result_label}
                        </Badge>
                      </div>
                      <p className="text-xs text-ink-secondary mt-0.5">{item.recipient_name} · {item.delivery_address_line1}, {item.delivery_city}</p>
                      {item.exception_notes ? <p className="text-xs text-danger mt-0.5">Nota: {item.exception_notes}</p> : null}
                    </div>
                    {item.evidence && item.evidence.length > 0 && item.evidence[0].url ? (
                      <div className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.evidence[0].url} alt="Foto evidencia" className="h-12 w-12 rounded object-cover border border-edge" />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="button" variant="secondary" size="md" onClick={() => setClosedReceipt(null)}>
                Continuar con otra recepción
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

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
        <Card
          title={`Lote ${batch.batch_code}`}
          headerAction={
            <Button type="button" variant="ghost" size="md" className="border border-edge" onClick={() => setBatch(null)}>
              Cancelar
            </Button>
          }
        >
          {/* Header de contraste de bultos: Declarado vs Mostrador */}
          <div className="mb-6 rounded-input border border-edge bg-app-secondary p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Balance de bultos en mostrador</p>
                <p className="mt-1 text-base font-bold text-ink" data-testid="contrast-header">
                  El cliente declaró <span className="text-brand">{declaredCount}</span> · aquí hay <span className={hasCountDifference ? "text-amber-600 dark:text-amber-400 font-extrabold" : "text-success font-extrabold"}>{physicalCounterCount}</span>
                </p>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  Declarados recibidos: {receivedDeclaredCount} · No declarados: {undeclaredPackages.length}
                  {hasCountDifference ? " (Hay diferencia con la declaración del cliente)" : " (Cantidades coinciden)"}
                </p>
              </div>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setShowUndeclaredForm((v) => !v);
                    setFormUndeclaredError("");
                  }}
                >
                  {showUndeclaredForm ? "Cerrar formulario excedente" : "➕ Agregar paquete no declarado"}
                </Button>
              </div>
            </div>
          </div>

          {/* Formulario para agregar paquete no declarado */}
          {showUndeclaredForm ? (
            <div className="mb-6 rounded-input border-2 border-dashed border-brand/40 bg-brand/5 p-4 sm:p-5">
              <div className="flex items-center justify-between border-b border-edge pb-3">
                <div>
                  <h3 className="font-display text-base font-bold text-brand">Registrar paquete no declarado (Excedente)</h3>
                  <p className="text-xs text-ink-secondary">Registra los datos de entrega y adjunta la foto obligatoria del paquete físico.</p>
                </div>
                <Badge tone="brand">Mostrador</Badge>
              </div>

              {formUndeclaredError ? (
                <div role="alert" className="mt-3 rounded-input border border-danger/25 bg-danger/10 p-3 text-xs text-danger font-semibold">
                  {formUndeclaredError}
                </div>
              ) : null}

              <form noValidate onSubmit={handleAddUndeclaredSubmit} className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    required
                    label="Destinatario"
                    id="undec_recipient_name"
                    value={newUndeclared.recipient_name}
                    onChange={(e) => setNewUndeclared((prev) => ({ ...prev, recipient_name: e.target.value }))}
                    placeholder="Nombre completo"
                  />
                  <Input
                    required
                    label="Teléfono destinatario"
                    id="undec_recipient_phone"
                    type="tel"
                    value={newUndeclared.recipient_phone}
                    onChange={(e) => setNewUndeclared((prev) => ({ ...prev, recipient_phone: e.target.value }))}
                    placeholder="300 123 4567"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    required
                    label="Dirección de entrega"
                    id="undec_address"
                    value={newUndeclared.delivery_address_line1}
                    onChange={(e) => setNewUndeclared((prev) => ({ ...prev, delivery_address_line1: e.target.value }))}
                    placeholder="Calle 100 # 15-20"
                  />
                  <Input
                    label="Complemento dirección"
                    id="undec_complement"
                    value={newUndeclared.delivery_address_complement}
                    onChange={(e) => setNewUndeclared((prev) => ({ ...prev, delivery_address_complement: e.target.value }))}
                    placeholder="Apto 402, Torre 1"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="undec_zone" className="mb-1 block text-sm font-medium text-ink">
                      Zona
                    </label>
                    <Select
                      id="undec_zone"
                      value={newUndeclared.delivery_zone}
                      onChange={(e) => {
                        const zoneName = e.target.value;
                        const z = zones.find((c) => c.name === zoneName);
                        setNewUndeclared((prev) => ({
                          ...prev,
                          delivery_zone: zoneName,
                          delivery_city: z?.city?.trim() || "Bogotá",
                        }));
                      }}
                    >
                      <option value="">Seleccionar zona...</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.name}>
                          {zone.name} {zone.city ? `(${zone.city})` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Input
                    label="Ciudad"
                    id="undec_city"
                    value={newUndeclared.delivery_city}
                    onChange={(e) => setNewUndeclared((prev) => ({ ...prev, delivery_city: e.target.value }))}
                  />
                  <Select
                    label="Tipo de pago"
                    id="undec_payment_type"
                    value={newUndeclared.payment_type}
                    onChange={(e) => {
                      const nextType = e.target.value as PackagePaymentType;
                      setNewUndeclared((prev) => ({
                        ...prev,
                        payment_type: nextType,
                        is_cod: nextType === "cash_on_delivery",
                        ...(nextType !== "cash_on_delivery" ? { requested_cod_amount: 0 } : {}),
                      }));
                    }}
                  >
                    <option value="cash_on_delivery">Pago contra entrega</option>
                    <option value="post_sale">Cobro post entrega</option>
                    <option value="prepaid">Prepago</option>
                    <option value="mercado_libre">Mercado Libre</option>
                  </Select>
                </div>

                {newUndeclared.payment_type === "cash_on_delivery" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CurrencyInput
                      label="Monto de cobro contra entrega"
                      min={0}
                      value={newUndeclared.requested_cod_amount}
                      onValueChange={(val) => setNewUndeclared((prev) => ({ ...prev, requested_cod_amount: val }))}
                    />
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-3">
                  <Select
                    label="Condición física"
                    id="undec_physical_condition"
                    value={newUndeclared.physical_condition}
                    onChange={(e) => setNewUndeclared((prev) => ({ ...prev, physical_condition: e.target.value as PhysicalCondition }))}
                  >
                    <option value="intact">Intacto</option>
                    <option value="observed_damage">Diferencia / daño</option>
                    <option value="unknown">No verificada</option>
                  </Select>
                  <Select
                    label="Causal de novedad"
                    id="undec_exception_code"
                    value={newUndeclared.exception_code}
                    onChange={(e) => setNewUndeclared((prev) => ({ ...prev, exception_code: e.target.value }))}
                  >
                    <option value="SURPLUS_UNANNOUNCED_PACKAGE">Excedente no anunciado (SURPLUS)</option>
                    <option value="EXTRA_UNPLANNED_PACKAGE">Paquete extra no planificado</option>
                    <option value="OTHER">Otro motivo</option>
                  </Select>
                  <div className="flex items-center pt-6">
                    <label className="flex items-center gap-2 text-sm font-medium text-ink cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newUndeclared.is_fragile}
                        onChange={(e) => setNewUndeclared((prev) => ({ ...prev, is_fragile: e.target.checked }))}
                        className="h-4 w-4 rounded border-edge text-brand focus:ring-brand"
                      />
                      <span>Paquete frágil</span>
                    </label>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-input border border-brand/30 bg-surface p-3">
                    <label className="block text-sm font-semibold text-ink mb-1">
                      Foto obligatoria del paquete físico <span className="text-danger">*</span>
                    </label>
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      id="undec_evidence_photo"
                      className="block min-h-11 w-full rounded-input border border-edge bg-app-secondary px-3 py-2 text-xs text-ink file:mr-3 file:rounded file:border-0 file:bg-brand file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-white"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setNewUndeclared((prev) => ({ ...prev, evidence_photo: file }));
                      }}
                    />
                    {newUndeclared.evidence_photo ? (
                      <span className="mt-1 block text-xs text-success font-semibold">✓ Foto seleccionada: {newUndeclared.evidence_photo.name}</span>
                    ) : (
                      <span className="mt-1 block text-xs text-ink-secondary">JPG, PNG o WEBP de máx 5 MB (Cámara o archivo).</span>
                    )}
                  </div>
                  <div>
                    <Textarea
                      label="Notas del excedente / manejo especial"
                      id="undec_notes"
                      value={newUndeclared.exception_notes}
                      onChange={(e) => setNewUndeclared((prev) => ({ ...prev, exception_notes: e.target.value }))}
                      placeholder="Observaciones de empaque, peso o motivo por el cual no estaba anunciado..."
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" size="md" onClick={() => setShowUndeclaredForm(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" size="md">
                    Guardar paquete no declarado
                  </Button>
                </div>
              </form>
            </div>
          ) : null}

          {/* Sección de Paquetes Declarados */}
          <div className="space-y-3">
            <h3 className="font-display text-sm font-bold text-ink uppercase tracking-wider">
              Paquetes declarados por el cliente ({batch.items.length})
            </h3>
            {batch.items.map((item) => {
              const result = results[item.pickup_package_id] ?? "received";
              const condition = physicalConditions[item.pickup_package_id] ?? "intact";
              const hasDifference = result !== "received" || condition === "observed_damage";
              return (
                <article key={item.id} className="rounded-input border border-edge p-4">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px_200px] lg:items-start">
                    <div>
                      <p className="font-display text-sm font-semibold text-ink">{item.pickup_package.guide_number || `Paquete ${item.pickup_package.package_index}`}</p>
                      <p className="mt-1 text-xs text-ink-secondary">{item.pickup_package.recipient_name}</p>
                    </div>
                    <Select
                      label="Resultado"
                      value={result}
                      onChange={(event) => {
                        const next = event.target.value as ItemResult;
                        setResults((current) => ({ ...current, [item.pickup_package_id]: next }));
                        setPhysicalConditions((current) => ({ ...current, [item.pickup_package_id]: next === "received" ? "intact" : "unknown" }));
                      }}
                    >
                      <option value="received">Recibido</option>
                      <option value="missing">Faltante</option>
                      <option value="rejected">Rechazado</option>
                    </Select>
                    <Select
                      label="Condición física"
                      value={condition}
                      disabled={result !== "received"}
                      onChange={(event) => setPhysicalConditions((current) => ({ ...current, [item.pickup_package_id]: event.target.value as PhysicalCondition }))}
                    >
                      <option value="intact">Intacto</option>
                      <option value="observed_damage">Diferencia / daño</option>
                      <option value="unknown">No verificada</option>
                    </Select>
                  </div>
                  {hasDifference ? (
                    <div className="mt-4 grid gap-4 rounded-input border border-danger/25 bg-danger/10 p-4 md:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="font-medium text-ink">Foto obligatoria de la novedad</span>
                        <input
                          className="block min-h-11 w-full rounded-input border border-edge bg-surface px-3 py-2 text-sm text-ink"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          capture="environment"
                          onChange={(event) => setEvidenceFiles((current) => ({ ...current, [item.pickup_package_id]: event.target.files?.[0] ?? null }))}
                        />
                        {evidenceFiles[item.pickup_package_id] ? <span className="block text-xs text-ink-secondary">{evidenceFiles[item.pickup_package_id]?.name}</span> : null}
                        <span className="block text-xs text-ink-secondary">JPG, PNG o WEBP de máximo 5 MB.</span>
                      </label>
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

          {/* Sección de Paquetes Excedentes / No Declarados */}
          {undeclaredPackages.length > 0 ? (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-brand uppercase tracking-wider">
                  Paquetes no declarados recibidos en mostrador ({undeclaredPackages.length})
                </h3>
                <Badge tone="brand">Excedentes</Badge>
              </div>

              <div className="space-y-3">
                {undeclaredPackages.map((pkg, idx) => (
                  <article key={pkg.tempId} className="rounded-input border-2 border-brand/30 bg-brand/5 p-4" data-testid={`undeclared-item-${idx}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="brand">Recibido sin declarar</Badge>
                          <p className="font-display text-sm font-semibold text-ink">{pkg.recipient_name}</p>
                          <span className="text-xs text-ink-secondary">· {pkg.recipient_phone}</span>
                        </div>
                        <p className="mt-1 text-xs text-ink">
                          📍 {pkg.delivery_address_line1}{pkg.delivery_address_complement ? `, ${pkg.delivery_address_complement}` : ""} · {pkg.delivery_zone || "Sin zona"} ({pkg.delivery_city})
                        </p>
                        <p className="mt-1 text-xs text-ink-secondary">
                          Causal: {pkg.exception_code} · Condición: {pkg.physical_condition === "intact" ? "Intacto" : "Diferencia / Daño"}
                          {pkg.payment_type === "cash_on_delivery" && pkg.requested_cod_amount > 0 ? ` · Cobro: ${formatCOP(pkg.requested_cod_amount)}` : ""}
                        </p>
                        {pkg.evidence_photo ? (
                          <p className="mt-1 text-xs text-success font-medium">📷 Foto: {pkg.evidence_photo.name}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-danger/10 border border-danger/20"
                          onClick={() => removeUndeclared(pkg.tempId)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {/* Botón de Cierre de Conciliación */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-edge pt-4">
            <div className="text-xs text-ink-secondary">
              Total a registrar en custodia: <strong>{physicalCounterCount} paquete(s)</strong> ({receivedDeclaredCount} declarados + {undeclaredPackages.length} no declarados).
            </div>
            <Button type="button" size="lg" className="w-full sm:w-auto" disabled={busy === -1} onClick={() => void closeBatch()}>
              {busy === -1 ? "Cerrando recepción…" : "Cerrar recepción"}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

