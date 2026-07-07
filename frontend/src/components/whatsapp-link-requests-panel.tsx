"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { formatDate, toTitle } from "@/lib/utils";
import type {
  Client,
  PaginatedResponse,
  WhatsAppLinkRequestDTO,
  WhatsAppPermission,
} from "@/lib/types";

type ApproveFormState = {
  customer_id: number | "";
  role: string;
  permissions: WhatsAppPermission[];
};

const permissionOptions: Array<{ value: WhatsAppPermission; label: string }> = [
  { value: "CREATE_PICKUP", label: "Crear recogidas" },
  { value: "VIEW_OWN_PICKUPS", label: "Ver solicitudes propias" },
  { value: "USE_SAVED_ADDRESSES", label: "Usar direcciones guardadas" },
  { value: "CREATE_COD_SHIPMENT", label: "Solicitar COD" },
  { value: "CANCEL_UNASSIGNED_PICKUP", label: "Cancelar sin asignar" },
];

const defaultApproveForm: ApproveFormState = {
  customer_id: "",
  role: "",
  permissions: ["CREATE_PICKUP", "VIEW_OWN_PICKUPS", "USE_SAVED_ADDRESSES"],
};

export function WhatsAppLinkRequestsPanel() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<WhatsAppLinkRequestDTO[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState("");
  const [expandedApproveId, setExpandedApproveId] = useState<number | null>(null);
  const [expandedRejectId, setExpandedRejectId] = useState<number | null>(null);
  const [approveForm, setApproveForm] = useState<ApproveFormState>(defaultApproveForm);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [requestResponse, clientResponse] = await Promise.all([
        apiGet<PaginatedResponse<WhatsAppLinkRequestDTO>>("/whatsapp/link-requests?per_page=50"),
        apiGet<PaginatedResponse<Client>>("/clients?per_page=100"),
      ]);
      setRequests(requestResponse.data || []);
      setClients(clientResponse.data || []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar vinculaciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, []);

  const openApprove = (request: WhatsAppLinkRequestDTO) => {
    setExpandedRejectId(null);
    setRejectReason("");
    setRejectNotes("");
    setExpandedApproveId(request.id);
    setApproveForm({
      customer_id: request.requested_customer_id || "",
      role: "",
      permissions: ["CREATE_PICKUP", "VIEW_OWN_PICKUPS", "USE_SAVED_ADDRESSES"],
    });
  };

  const openReject = (requestId: number) => {
    setExpandedApproveId(null);
    setExpandedRejectId(requestId);
    setRejectReason("");
    setRejectNotes("");
  };

  const togglePermission = (permission: WhatsAppPermission) => {
    setApproveForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((value) => value !== permission)
        : [...prev.permissions, permission],
    }));
  };

  const approveRequest = async (event: FormEvent<HTMLFormElement>, requestId: number) => {
    event.preventDefault();
    setSubmittingId(requestId);
    try {
      await apiSend<WhatsAppLinkRequestDTO>(
        `/whatsapp/link-requests/${requestId}/approve`,
        "POST",
        {
          customer_id: approveForm.customer_id || null,
          role: approveForm.role,
          permissions: approveForm.permissions,
        }
      );
      showToast("Solicitud aprobada y contacto vinculado", "success");
      setExpandedApproveId(null);
      await loadData();
    } catch (approveError) {
      showToast(approveError instanceof Error ? approveError.message : "No se pudo aprobar solicitud", "error");
    } finally {
      setSubmittingId(null);
    }
  };

  const rejectRequest = async (event: FormEvent<HTMLFormElement>, requestId: number) => {
    event.preventDefault();
    setSubmittingId(requestId);
    try {
      await apiSend<WhatsAppLinkRequestDTO>(
        `/whatsapp/link-requests/${requestId}/reject`,
        "POST",
        {
          reason: rejectReason,
          notes: rejectNotes,
        }
      );
      showToast("Solicitud rechazada", "success");
      setExpandedRejectId(null);
      await loadData();
    } catch (rejectError) {
      showToast(rejectError instanceof Error ? rejectError.message : "No se pudo rechazar solicitud", "error");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Vinculacion WhatsApp
          </p>
          <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">
            Solicitudes de numeros no autorizados
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Revisa telefonos nuevos y decide si deben operar una cuenta existente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
        >
          Recargar bandeja
        </button>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 dark:bg-[#23233b]" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      ) : requests.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-[#2a2a3e] dark:text-slate-400">
          No hay solicitudes de vinculacion pendientes en este momento.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {requests.map((request) => (
            <article
              key={request.id}
              className="rounded-2xl border border-slate-200 p-4 dark:border-[#2a2a3e]"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">
                      {request.whatsapp_contact?.display_name || request.requested_company_name || "Solicitud sin nombre"}
                    </p>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                      {toTitle(request.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {request.whatsapp_contact?.phone || request.requested_by_phone || "Sin telefono"}{" "}
                    {request.whatsapp_contact?.wa_id ? `• wa_id ${request.whatsapp_contact.wa_id}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                    Cliente sugerido:{" "}
                    <strong>
                      {request.requested_customer?.name || request.requested_company_name || "Sin cliente asociado"}
                    </strong>
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Creada {formatDate(request.created_at)}
                  </p>
                  {request.notes ? (
                    <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-[#16162a] dark:text-slate-300">
                      {request.notes}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openApprove(request)}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition-all duration-150 active:scale-95"
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => openReject(request.id)}
                    className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 transition-all duration-150 active:scale-95 dark:border-rose-500/40 dark:text-rose-300"
                  >
                    Rechazar
                  </button>
                </div>
              </div>

              {expandedApproveId === request.id ? (
                <form onSubmit={(event) => void approveRequest(event, request.id)} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <label className="space-y-1 text-sm lg:col-span-2">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Cliente a vincular</span>
                      <select
                        value={approveForm.customer_id}
                        onChange={(event) =>
                          setApproveForm((prev) => ({
                            ...prev,
                            customer_id: event.target.value ? Number(event.target.value) : "",
                          }))
                        }
                        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-[#e0e0e0]"
                      >
                        <option value="">Selecciona un cliente</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name} {client.company ? `• ${client.company}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm lg:col-span-2">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Rol interno del contacto</span>
                      <input
                        value={approveForm.role}
                        onChange={(event) => setApproveForm((prev) => ({ ...prev, role: event.target.value }))}
                        placeholder="Operaciones, comercial, bodega..."
                        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-[#e0e0e0]"
                      />
                    </label>

                    <div className="space-y-2 lg:col-span-2">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Permisos iniciales</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {permissionOptions.map((permission) => (
                          <label
                            key={`${request.id}-${permission.value}`}
                            className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-[#2a2a3e]"
                          >
                            <input
                              type="checkbox"
                              checked={approveForm.permissions.includes(permission.value)}
                              onChange={() => togglePermission(permission.value)}
                              className="h-4 w-4 rounded border-slate-300 text-primary"
                            />
                            <span className="text-slate-700 dark:text-slate-200">{permission.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedApproveId(null)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={submittingId === request.id}
                      className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
                    >
                      {submittingId === request.id ? "Aprobando..." : "Confirmar aprobacion"}
                    </button>
                  </div>
                </form>
              ) : null}

              {expandedRejectId === request.id ? (
                <form onSubmit={(event) => void rejectRequest(event, request.id)} className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
                  <div className="grid gap-3">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-rose-800 dark:text-rose-200">Motivo de rechazo</span>
                      <input
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        placeholder="Numero no autorizado, cliente no identificado..."
                        className="h-11 w-full rounded-lg border border-rose-300 px-3 text-sm dark:border-rose-500/40 dark:bg-[#1a1a2e] dark:text-[#e0e0e0]"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-rose-800 dark:text-rose-200">Notas</span>
                      <textarea
                        value={rejectNotes}
                        onChange={(event) => setRejectNotes(event.target.value)}
                        placeholder="Observacion operativa para seguimiento"
                        className="min-h-24 w-full rounded-lg border border-rose-300 px-3 py-2 text-sm dark:border-rose-500/40 dark:bg-[#1a1a2e] dark:text-[#e0e0e0]"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedRejectId(null)}
                      className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 transition-all duration-150 active:scale-95 dark:border-rose-500/40 dark:text-rose-300"
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={submittingId === request.id || rejectReason.trim().length === 0}
                      className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
                    >
                      {submittingId === request.id ? "Rechazando..." : "Confirmar rechazo"}
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
