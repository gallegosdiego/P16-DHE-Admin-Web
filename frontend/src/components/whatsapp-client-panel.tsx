"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { toTitle } from "@/lib/utils";
import type {
  ClientAddress,
  ClientWhatsAppSettingsDTO,
  CustomerWhatsAppContactDTO,
  CustomerWhatsAppStatus,
  WhatsAppPermission,
} from "@/lib/types";

type Props = {
  clientId: number;
  clientName: string;
  addresses: ClientAddress[];
};

type SettingsFormState = {
  status: CustomerWhatsAppStatus;
  cod_enabled: boolean;
  automatic_package_limit: number;
  manual_review_package_limit: number;
  automatic_cod_limit: number;
  manual_review_cod_limit: number;
  automatic_cod_total_limit: number;
  allowed_windows: string[];
  default_pickup_address_id: number | null;
  suspension_reason: string;
};

type ContactFormState = {
  id: number | null;
  wa_id: string;
  phone: string;
  display_name: string;
  role: string;
  status: "AUTHORIZED" | "SUSPENDED" | "REVOKED";
  permissions: WhatsAppPermission[];
};

const windowOptions = [
  { value: "today_am", label: "Primera jornada" },
  { value: "today_pm", label: "Segunda jornada" },
  { value: "next_available", label: "Proxima disponible" },
  { value: "next_business_day", label: "Siguiente dia operativo" },
] as const;

const permissionOptions: Array<{ value: WhatsAppPermission; label: string }> = [
  { value: "CREATE_PICKUP", label: "Crear recogidas" },
  { value: "VIEW_OWN_PICKUPS", label: "Ver solicitudes propias" },
  { value: "USE_SAVED_ADDRESSES", label: "Usar direcciones guardadas" },
  { value: "CREATE_COD_SHIPMENT", label: "Solicitar COD" },
  { value: "CANCEL_UNASSIGNED_PICKUP", label: "Cancelar sin asignar" },
];

const defaultSettingsForm: SettingsFormState = {
  status: "DISABLED",
  cod_enabled: false,
  automatic_package_limit: 5,
  manual_review_package_limit: 20,
  automatic_cod_limit: 500000,
  manual_review_cod_limit: 1000000,
  automatic_cod_total_limit: 2000000,
  allowed_windows: ["today_am", "today_pm"],
  default_pickup_address_id: null,
  suspension_reason: "",
};

const defaultContactForm: ContactFormState = {
  id: null,
  wa_id: "",
  phone: "",
  display_name: "",
  role: "",
  status: "AUTHORIZED",
  permissions: ["CREATE_PICKUP", "VIEW_OWN_PICKUPS", "USE_SAVED_ADDRESSES"],
};

const statusTone: Record<CustomerWhatsAppStatus, string> = {
  DISABLED: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  PENDING_CONFIGURATION: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  SUSPENDED: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
};

export function WhatsAppClientPanel({ clientId, clientName, addresses }: Props) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [settings, setSettings] = useState<ClientWhatsAppSettingsDTO | null>(null);
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>(defaultSettingsForm);
  const [contactForm, setContactForm] = useState<ContactFormState>(defaultContactForm);
  const [error, setError] = useState("");

  const availableAddresses = useMemo(() => addresses || [], [addresses]);

  const loadSettings = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiGet<ClientWhatsAppSettingsDTO>(`/clients/${clientId}/whatsapp-settings`);
      setSettings(response);
      setSettingsForm({
        status: response.status,
        cod_enabled: response.cod_enabled,
        automatic_package_limit: response.automatic_package_limit,
        manual_review_package_limit: response.manual_review_package_limit,
        automatic_cod_limit: response.automatic_cod_limit,
        manual_review_cod_limit: response.manual_review_cod_limit,
        automatic_cod_total_limit: response.automatic_cod_total_limit,
        allowed_windows: response.allowed_windows || [],
        default_pickup_address_id: response.default_pickup_address_id,
        suspension_reason: "",
      });
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar WhatsApp.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const toggleWindow = (windowCode: string) => {
    setSettingsForm((prev) => ({
      ...prev,
      allowed_windows: prev.allowed_windows.includes(windowCode)
        ? prev.allowed_windows.filter((value) => value !== windowCode)
        : [...prev.allowed_windows, windowCode],
    }));
  };

  const togglePermission = (permission: WhatsAppPermission) => {
    setContactForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((value) => value !== permission)
        : [...prev.permissions, permission],
    }));
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingSettings(true);
    try {
      const response = await apiSend<ClientWhatsAppSettingsDTO>(
        `/clients/${clientId}/whatsapp-settings`,
        "PUT",
        {
          ...settingsForm,
          default_pickup_address_id: settingsForm.default_pickup_address_id || null,
        }
      );
      setSettings(response);
      setSettingsForm((prev) => ({
        ...prev,
        status: response.status,
        suspension_reason: "",
      }));
      showToast(`Configuracion WhatsApp guardada para ${clientName}`, "success");
    } catch (saveError) {
      showToast(saveError instanceof Error ? saveError.message : "No se pudo guardar configuracion", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const saveContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingContact(true);
    try {
      const path = contactForm.id
        ? `/clients/${clientId}/whatsapp-contacts/${contactForm.id}`
        : `/clients/${clientId}/whatsapp-contacts`;
      const method = contactForm.id ? "PUT" : "POST";

      await apiSend<CustomerWhatsAppContactDTO>(path, method, {
        wa_id: contactForm.wa_id,
        phone: contactForm.phone,
        display_name: contactForm.display_name,
        role: contactForm.role,
        status: contactForm.status,
        permissions: contactForm.permissions,
      });

      showToast(contactForm.id ? "Contacto WhatsApp actualizado" : "Contacto WhatsApp creado", "success");
      setContactForm(defaultContactForm);
      await loadSettings();
    } catch (saveError) {
      showToast(saveError instanceof Error ? saveError.message : "No se pudo guardar contacto", "error");
    } finally {
      setSavingContact(false);
    }
  };

  const editContact = (contact: CustomerWhatsAppContactDTO) => {
    setContactForm({
      id: contact.id,
      wa_id: contact.wa_id || "",
      phone: contact.phone || "",
      display_name: contact.display_name || "",
      role: contact.role || "",
      status: contact.status === "AUTHORIZED" ? "AUTHORIZED" : contact.status === "REVOKED" ? "REVOKED" : "SUSPENDED",
      permissions: contact.permissions || [],
    });
  };

  const suspendContact = async (contact: CustomerWhatsAppContactDTO) => {
    const confirmed = window.confirm(`Suspender el contacto ${contact.display_name || contact.phone || contact.wa_id}?`);
    if (!confirmed) return;

    try {
      await apiSend<{ message: string }>(
        `/clients/${clientId}/whatsapp-contacts/${contact.id}/suspend`,
        "POST",
        {}
      );
      showToast("Contacto suspendido", "success");
      await loadSettings();
    } catch (suspendError) {
      showToast(suspendError instanceof Error ? suspendError.message : "No se pudo suspender contacto", "error");
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 dark:bg-[#23233b]" />
        <Skeleton className="h-44 dark:bg-[#23233b]" />
        <Skeleton className="h-44 dark:bg-[#23233b]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => void loadSettings()}
          className="mt-3 rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold dark:border-rose-500/40"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-[#2a2a3e] dark:bg-[#16162a]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Canal WhatsApp
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-[#e0e0e0]">
              Configuracion operativa por cliente
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Activa el canal, define limites y controla que contactos pueden solicitar recogidas.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone[settingsForm.status]}`}>
            {toTitle(settingsForm.status)}
          </span>
        </div>
      </section>

      <form onSubmit={saveSettings} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Estado del canal</span>
            <select
              value={settingsForm.status}
              onChange={(event) =>
                setSettingsForm((prev) => ({
                  ...prev,
                  status: event.target.value as CustomerWhatsAppStatus,
                }))
              }
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            >
              <option value="DISABLED">Disabled</option>
              <option value="PENDING_CONFIGURATION">Pending configuration</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </label>

          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-[#2a2a3e]">
            <input
              type="checkbox"
              checked={settingsForm.cod_enabled}
              onChange={(event) => setSettingsForm((prev) => ({ ...prev, cod_enabled: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-primary"
            />
            <span className="font-medium text-slate-700 dark:text-slate-200">Permitir solicitudes con COD</span>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Limite automatico de paquetes</span>
            <input
              type="number"
              min={1}
              value={settingsForm.automatic_package_limit}
              onChange={(event) => setSettingsForm((prev) => ({ ...prev, automatic_package_limit: Number(event.target.value) }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Limite manual de paquetes</span>
            <input
              type="number"
              min={1}
              value={settingsForm.manual_review_package_limit}
              onChange={(event) => setSettingsForm((prev) => ({ ...prev, manual_review_package_limit: Number(event.target.value) }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Limite automatico COD por paquete</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={settingsForm.automatic_cod_limit}
              onChange={(event) => setSettingsForm((prev) => ({ ...prev, automatic_cod_limit: Number(event.target.value) }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Limite manual COD por paquete</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={settingsForm.manual_review_cod_limit}
              onChange={(event) => setSettingsForm((prev) => ({ ...prev, manual_review_cod_limit: Number(event.target.value) }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
          </label>

          <label className="space-y-1 text-sm lg:col-span-2">
            <span className="font-medium text-slate-700 dark:text-slate-200">Limite automatico COD total</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={settingsForm.automatic_cod_total_limit}
              onChange={(event) => setSettingsForm((prev) => ({ ...prev, automatic_cod_total_limit: Number(event.target.value) }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
          </label>

          <div className="space-y-2 lg:col-span-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Jornadas permitidas</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {windowOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-[#2a2a3e]"
                >
                  <input
                    type="checkbox"
                    checked={settingsForm.allowed_windows.includes(option.value)}
                    onChange={() => toggleWindow(option.value)}
                    className="h-4 w-4 rounded border-slate-300 text-primary"
                  />
                  <span className="text-slate-700 dark:text-slate-200">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="space-y-1 text-sm lg:col-span-2">
            <span className="font-medium text-slate-700 dark:text-slate-200">Direccion por defecto de recogida</span>
            <select
              value={settingsForm.default_pickup_address_id || ""}
              onChange={(event) =>
                setSettingsForm((prev) => ({
                  ...prev,
                  default_pickup_address_id: event.target.value ? Number(event.target.value) : null,
                }))
              }
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            >
              <option value="">Sin direccion fija</option>
              {availableAddresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {(address.label || "Direccion")} - {address.address}
                </option>
              ))}
            </select>
          </label>

          {settingsForm.status === "SUSPENDED" ? (
            <label className="space-y-1 text-sm lg:col-span-2">
              <span className="font-medium text-slate-700 dark:text-slate-200">Motivo de suspension</span>
              <input
                value={settingsForm.suspension_reason}
                onChange={(event) => setSettingsForm((prev) => ({ ...prev, suspension_reason: event.target.value }))}
                placeholder="Motivo operativo o de seguridad"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
            </label>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            disabled={savingSettings}
            className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
          >
            {savingSettings ? "Guardando..." : "Guardar configuracion"}
          </button>
        </div>
      </form>

      <section className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Contactos autorizados</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Solo estos numeros podran pedir recogidas por WhatsApp.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">
              {settings?.contacts.length || 0} contactos
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {(settings?.contacts || []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-[#2a2a3e] dark:text-slate-400">
                Todavia no hay contactos autorizados para este cliente.
              </div>
            ) : (
              settings?.contacts.map((contact) => (
                <article
                  key={contact.id}
                  className="rounded-xl border border-slate-200 p-4 dark:border-[#2a2a3e]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">
                        {contact.display_name || contact.phone || contact.wa_id || "Contacto sin nombre"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {contact.phone || "Sin telefono"} {contact.wa_id ? `• wa_id ${contact.wa_id}` : ""}
                      </p>
                      {contact.role ? (
                        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Rol: {contact.role}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">
                        {toTitle(contact.status)}
                      </span>
                      <button
                        type="button"
                        onClick={() => editContact(contact)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                      >
                        Editar
                      </button>
                      {contact.status !== "SUSPENDED" ? (
                        <button
                          type="button"
                          onClick={() => void suspendContact(contact)}
                          className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 transition-all duration-150 active:scale-95 dark:border-rose-500/40 dark:text-rose-300"
                        >
                          Suspender
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {(contact.permissions || []).map((permission) => (
                      <span
                        key={`${contact.id}-${permission}`}
                        className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary"
                      >
                        {toTitle(permission)}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <form onSubmit={saveContact} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">
                {contactForm.id ? "Editar contacto" : "Nuevo contacto autorizado"}
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                La habilitacion se controla solo desde el panel administrativo.
              </p>
            </div>
            {contactForm.id ? (
              <button
                type="button"
                onClick={() => setContactForm(defaultContactForm)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
              >
                Limpiar
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">wa_id</span>
              <input
                value={contactForm.wa_id}
                onChange={(event) => setContactForm((prev) => ({ ...prev, wa_id: event.target.value }))}
                placeholder="573001112233"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Telefono</span>
              <input
                value={contactForm.phone}
                onChange={(event) => setContactForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="3001112233"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Nombre visible</span>
              <input
                value={contactForm.display_name}
                onChange={(event) => setContactForm((prev) => ({ ...prev, display_name: event.target.value }))}
                placeholder="Maria Lopez"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Rol</span>
              <input
                value={contactForm.role}
                onChange={(event) => setContactForm((prev) => ({ ...prev, role: event.target.value }))}
                placeholder="Operaciones, despacho, comercial..."
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Estado</span>
              <select
                value={contactForm.status}
                onChange={(event) =>
                  setContactForm((prev) => ({
                    ...prev,
                    status: event.target.value as ContactFormState["status"],
                  }))
                }
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              >
                <option value="AUTHORIZED">Authorized</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="REVOKED">Revoked</option>
              </select>
            </label>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Permisos</p>
              <div className="grid gap-2">
                {permissionOptions.map((permission) => (
                  <label
                    key={permission.value}
                    className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-[#2a2a3e]"
                  >
                    <input
                      type="checkbox"
                      checked={contactForm.permissions.includes(permission.value)}
                      onChange={() => togglePermission(permission.value)}
                      className="h-4 w-4 rounded border-slate-300 text-primary"
                    />
                    <span className="text-slate-700 dark:text-slate-200">{permission.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              disabled={savingContact}
              className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
            >
              {savingContact ? "Guardando..." : contactForm.id ? "Actualizar contacto" : "Crear contacto"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
