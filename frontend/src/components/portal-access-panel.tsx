"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiRequestError, apiGet, apiJson, describeApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Badge, Button, Input, type BadgeTone } from "@/components/ui";

/*
 * Acceso de un cliente al portal (https://portal.danheiexpress.com).
 * Solo lo da el equipo: superadmin y administrador. La contraseña se genera en la
 * API y se enseña una sola vez, para copiarla o enviarla por WhatsApp.
 */

export type PortalAccessStatus = "sin_acceso" | "activo" | "desactivado";

export type PortalAccessUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  last_login_at: string | null;
  created_at: string | null;
};

type AccessDetail = {
  status: PortalAccessStatus;
  user: PortalAccessUser | null;
  suggestion: { name: string; email: string; phone: string | null };
  email_enabled: boolean;
  portal_url: string;
};

type Credentials = {
  user: PortalAccessUser;
  password: string;
  email_sent: boolean;
  email_problem: string | null;
  whatsapp_url: string | null;
  portal_url: string;
  kind: "granted" | "reset";
};

const MANAGER_ROLES = ["superadmin", "administrador", "admin"];

/** Solo superadmin y administrador gestionan accesos al portal. */
export function useCanManagePortalAccess(): boolean {
  const { user } = useAuth();
  return useMemo(() => (user?.roles ?? []).some((role) => MANAGER_ROLES.includes(String(role))), [user]);
}

export const portalStatusLabel: Record<PortalAccessStatus, string> = {
  sin_acceso: "Sin acceso",
  activo: "Portal activo",
  desactivado: "Portal desactivado",
};

export const portalStatusTone: Record<PortalAccessStatus, BadgeTone> = {
  sin_acceso: "neutral",
  activo: "success",
  desactivado: "warning",
};

export function PortalStatusBadge({ status }: { status: PortalAccessStatus }) {
  return <Badge tone={portalStatusTone[status]}>{portalStatusLabel[status]}</Badge>;
}

function KeyIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7" /><path d="m17 6 2.5 2.5" /><path d="m14.5 8.5 2 2" /></svg>;
}

function lastLoginText(user: PortalAccessUser): string {
  return user.last_login_at ? `Último ingreso: ${formatDate(user.last_login_at)}` : "Aún no ha entrado al portal";
}

type DialogProps = {
  clientId: number;
  clientName: string;
  open: boolean;
  onClose: () => void;
  /** Se llama cuando cambia el estado (para refrescar badges en la lista o la ficha). */
  onChanged?: (status: PortalAccessStatus) => void;
};

/** Ventana de acceso al portal: dar acceso, contraseña nueva, activar/desactivar. */
export function PortalAccessDialog({ clientId, clientName, open, onClose, onChanged }: DialogProps) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<AccessDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", sendEmail: true });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "grant" | "reset" | "toggle">("");
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<AccessDetail>(`/clients/${clientId}/portal-access`);
      setDetail(data);
      setForm({
        name: data.suggestion.name || "",
        email: data.suggestion.email || "",
        phone: data.suggestion.phone || "",
        sendEmail: data.email_enabled,
      });
    } catch (err) {
      setError(describeApiError(err, "No se pudo consultar el acceso al portal.").message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (!open) return;
    // Cada apertura empieza limpia y se sincroniza con la API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCredentials(null);
    setConfirmReset(false);
    setFieldErrors({});
    setCopied(false);
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function grant(event: FormEvent) {
    event.preventDefault();
    setBusy("grant");
    setFieldErrors({});
    try {
      const result = await apiJson<Omit<Credentials, "kind">>(`/clients/${clientId}/portal-access`, "POST", {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        send_email: form.sendEmail,
      });
      setCredentials({ ...result, kind: "granted" });
      setDetail((current) => current ? { ...current, status: "activo", user: result.user } : current);
      onChanged?.("activo");
      showToast("Acceso al portal creado", "success");
    } catch (err) {
      const errors = err instanceof ApiRequestError ? err.fieldErrors : undefined;
      if (errors) {
        setFieldErrors(Object.fromEntries(Object.entries(errors).map(([key, value]) => [key, value[0]])));
      }
      showToast(describeApiError(err, "No se pudo dar el acceso.").message, "error");
    } finally {
      setBusy("");
    }
  }

  async function resetPassword() {
    setBusy("reset");
    try {
      const result = await apiJson<Omit<Credentials, "kind">>(`/clients/${clientId}/portal-access/password`, "POST", {
        send_email: detail?.email_enabled ?? false,
      });
      setCredentials({ ...result, kind: "reset" });
      setConfirmReset(false);
      showToast("Contraseña nueva generada", "success");
    } catch (err) {
      showToast(describeApiError(err, "No se pudo generar la contraseña.").message, "error");
    } finally {
      setBusy("");
    }
  }

  async function toggleActive() {
    if (!detail?.user) return;
    const next = !detail.user.active;
    setBusy("toggle");
    try {
      const result = await apiJson<{ status: PortalAccessStatus; user: PortalAccessUser }>(`/clients/${clientId}/portal-access/active`, "POST", { active: next });
      setDetail({ ...detail, status: result.status, user: result.user });
      onChanged?.(result.status);
      showToast(next ? "Acceso reactivado" : "Acceso desactivado: ya no puede entrar", next ? "success" : "info");
    } catch (err) {
      showToast(describeApiError(err, "No se pudo cambiar el acceso.").message, "error");
    } finally {
      setBusy("");
    }
  }

  async function copyPassword() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(credentials.password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("No se pudo copiar: selecciónala a mano.", "error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="portal-access-title" className="max-h-[100dvh] w-full overflow-y-auto rounded-t-card bg-surface p-5 shadow-card sm:max-h-[90vh] sm:max-w-lg sm:rounded-card md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Portal de clientes</p>
            <h2 id="portal-access-title" className="mt-1 truncate font-display text-xl font-bold text-ink">{clientName}</h2>
          </div>
          <Button type="button" variant="ghost" aria-label="Cerrar" onClick={onClose}>×</Button>
        </div>

        {loading ? <p className="mt-6 text-sm text-ink-secondary">Consultando el acceso…</p> : null}

        {error ? (
          <div className="mt-5 rounded-input border border-danger/30 bg-danger/10 p-4 text-sm text-danger" role="alert">
            <p>{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>Reintentar</Button>
          </div>
        ) : null}

        {credentials ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-card border border-success/30 bg-success/10 p-4 text-sm text-ink">
              <p className="font-semibold">{credentials.kind === "reset" ? "Contraseña nueva lista." : "Acceso creado."} Entrégasela al cliente ahora: no se volverá a mostrar.</p>
            </div>
            <dl className="space-y-3 rounded-card border border-edge bg-app-secondary p-4 text-sm">
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Portal</dt><dd className="mt-1 break-all text-ink">{credentials.portal_url}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Usuario</dt><dd className="mt-1 break-all font-medium text-ink">{credentials.user.email}</dd></div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Contraseña</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="rounded-input bg-surface px-3 py-2 font-mono text-lg font-semibold tracking-wider text-brand">{credentials.password}</code>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void copyPassword()}>{copied ? "Copiada" : "Copiar"}</Button>
                </dd>
              </div>
            </dl>
            {credentials.email_sent ? <p className="text-sm text-success">También se envió por correo a {credentials.user.email}.</p> : credentials.email_problem ? <p className="text-sm text-ink-secondary">{credentials.email_problem}</p> : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {credentials.whatsapp_url ? (
                <a href={credentials.whatsapp_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-button border border-success/40 bg-success/15 px-4 text-sm font-semibold text-ink hover:bg-success/25"><svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2 text-success" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L4 20l.9-3.7A8.5 8.5 0 1 1 20.5 11.7Z" /></svg>Enviar por WhatsApp</a>
              ) : <p className="text-xs text-ink-secondary sm:mr-auto sm:self-center">El cliente no tiene celular: entrega los datos por otro medio.</p>}
              <Button type="button" variant="secondary" onClick={onClose}>Listo</Button>
            </div>
          </div>
        ) : null}

        {!credentials && !loading && detail && detail.status === "sin_acceso" ? (
          <form onSubmit={grant} className="mt-5 space-y-4">
            <p className="text-sm text-ink-secondary">Revisa o completa los datos de la persona que va a entrar. Tomamos lo que ya está en la ficha; la contraseña se genera sola.</p>
            <Input label="Nombre de quien entra" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} error={fieldErrors.name} placeholder="Nombre y apellido" />
            <Input label="Correo (será su usuario)" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} error={fieldErrors.email} placeholder="correo@empresa.com" />
            <Input label="Celular" hint="Para enviarle los datos por WhatsApp." value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} error={fieldErrors.phone} placeholder="3001234567" inputMode="tel" />
            {detail.email_enabled ? (
              <label className="flex items-start gap-2 text-sm text-ink"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={form.sendEmail} onChange={(event) => setForm({ ...form, sendEmail: event.target.checked })} /> Enviarle también los datos por correo</label>
            ) : null}
            {fieldErrors.client ? <p className="text-sm text-danger">{fieldErrors.client}</p> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={busy !== ""}><KeyIcon />{busy === "grant" ? "Creando acceso…" : "Dar acceso al portal"}</Button>
            </div>
          </form>
        ) : null}

        {!credentials && !loading && detail?.user ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-card border border-edge p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">{detail.user.name}</p>
                <PortalStatusBadge status={detail.status} />
              </div>
              <p className="mt-1 break-all text-sm text-ink-secondary">{detail.user.email}{detail.user.phone ? ` · ${detail.user.phone}` : ""}</p>
              <p className="mt-2 text-xs text-ink-secondary">{lastLoginText(detail.user)}</p>
            </div>

            {confirmReset ? (
              <div className="rounded-card border border-warning/35 bg-warning/15 p-4 text-sm text-ink">
                <p>La contraseña actual dejará de funcionar y se cerrarán sus sesiones abiertas.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy !== ""} onClick={() => void resetPassword()}>{busy === "reset" ? "Generando…" : "Sí, generar contraseña nueva"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>Cancelar</Button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Button type="button" variant={detail.user.active ? "ghost" : "primary"} className={detail.user.active ? "text-danger hover:bg-danger/10" : ""} disabled={busy !== ""} onClick={() => void toggleActive()}>
                {busy === "toggle" ? "Guardando…" : detail.user.active ? "Desactivar acceso" : "Reactivar acceso"}
              </Button>
              {detail.user.active && !confirmReset ? <Button type="button" variant="secondary" disabled={busy !== ""} onClick={() => setConfirmReset(true)}><KeyIcon />Contraseña nueva</Button> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Botón para la ficha o la lista que abre la ventana. Invisible para quien no puede gestionar accesos. */
export function PortalAccessButton({ clientId, clientName, status, onChanged, size = "md", label }: {
  clientId: number;
  clientName: string;
  status?: PortalAccessStatus | null;
  onChanged?: (status: PortalAccessStatus) => void;
  size?: "sm" | "md";
  label?: string;
}) {
  const canManage = useCanManagePortalAccess();
  const [open, setOpen] = useState(false);

  if (!canManage) return null;

  const text = label ?? (status === "activo" ? "Acceso al portal" : status === "desactivado" ? "Portal desactivado" : "Dar acceso al portal");

  return (
    <>
      <Button type="button" variant="secondary" size={size} onClick={() => setOpen(true)} aria-label={`${text}: ${clientName}`}>
        <KeyIcon />{text}
      </Button>
      <PortalAccessDialog clientId={clientId} clientName={clientName} open={open} onClose={() => setOpen(false)} onChanged={onChanged} />
    </>
  );
}

export type PortalAccessRow = {
  client: { id: number; name: string; company: string | null; email: string | null; phone: string | null; is_active: boolean };
  status: PortalAccessStatus;
  user: PortalAccessUser | null;
  last_credentials_at: string | null;
  last_credentials_kind: string | null;
};

/** Estado del portal de todos los clientes (solo para quien gestiona accesos). */
export function usePortalAccessList() {
  const canManage = useCanManagePortalAccess();
  const [rows, setRows] = useState<PortalAccessRow[]>([]);
  const [loading, setLoading] = useState(canManage);
  const [error, setError] = useState("");

  const loaded = useRef(false);

  // Solo la primera carga muestra esqueletos: las recargas son silenciosas para no
  // desmontar una fila con la ventana abierta (la contraseña se ve una sola vez).
  const reload = useCallback(async () => {
    if (!canManage) return;
    if (!loaded.current) setLoading(true);
    setError("");
    try {
      const data = await apiGet<{ data: PortalAccessRow[] }>("/portal-access");
      setRows(data.data);
      loaded.current = true;
    } catch (err) {
      setError(describeApiError(err, "No se pudo cargar el estado del portal.").message);
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    // Carga inicial desde la API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const statusById = useMemo(() => Object.fromEntries(rows.map((row) => [row.client.id, row.status])) as Record<number, PortalAccessStatus>, [rows]);

  return { canManage, rows, statusById, loading, error, reload, setRows };
}
