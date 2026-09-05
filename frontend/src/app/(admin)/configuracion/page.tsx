"use client";

import { FormEvent, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/page-title";
import { useToast } from "@/components/toast";
import { WhatsAppLinkRequestsPanel } from "@/components/whatsapp-link-requests-panel";
import { apiSend } from "@/lib/api";
import { whatsappAdminUiEnabled } from "@/lib/features";
import { FinancialRateRulesPanel } from "@/components/financial/rate-rules-panel";
import { IntegrationSettingsPanel } from "@/components/integration-settings-panel";
import { ErrorEventsPanel } from "@/components/error-events-panel";
import { Card, Input, Button } from "@/components/ui";

export default function ConfiguracionPage() {
  usePageTitle("Configuración | Danhei Express");
  const { user } = useAuth();
  const { showToast } = useToast();

  const [profile, setProfile] = useState({
    name: user?.name || "Admin Danhei",
    email: user?.email || "admin@danheiexpress.com",
    phone: user?.phone || "+57 311 220 6587",
  });
  const [profileSaving, setProfileSaving] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [empresa, setEmpresa] = useState({
    razon: "DANHEI EXPRESS S.A.S.",
    nit: "902043789-9",
    direccion: "Cl 13 #15-48, Local 64",
    telefono: "+57 311 220 6587",
    email: "operaciones@danheiexpress.com",
  });

  const nombreIniciales = useMemo(() => {
    const words = (empresa.razon || "DE").split(" ").filter(Boolean);
    return (words[0]?.[0] || "D") + (words[1]?.[0] || "E");
  }, [empresa.razon]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileSaving(true);
    try {
      await apiSend("/me", "PUT", profile);
      showToast("Perfil actualizado", "success");
    } catch {
      showToast("No se pudo actualizar el perfil", "error");
    } finally {
      setProfileSaving(false);
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordForm.next.length < 8) {
      showToast("La nueva contraseña debe tener mínimo 8 caracteres", "error");
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      showToast("La confirmación no coincide", "error");
      return;
    }
    setPasswordSaving(true);
    try {
      await apiSend("/me/password", "PUT", {
        current_password: passwordForm.current,
        password: passwordForm.next,
        password_confirmation: passwordForm.confirm,
      });
      showToast("Contraseña actualizada", "success");
      setPasswordForm({ current: "", next: "", confirm: "" });
    } catch {
      showToast("No se pudo actualizar la contraseña", "error");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      <Card>
        <h1 className="font-display text-lg font-bold text-ink">Configuración</h1>
        <p className="text-sm text-muted">Parámetros del sistema administrativo</p>
      </Card>

      <Card title="Perfil">
        <form onSubmit={saveProfile} className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Nombre"
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            placeholder="Nombre visible"
          />
          <Input
            label="Email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            placeholder="correo@dominio.com"
          />
          <Input
            label="Teléfono"
            value={String(profile.phone || "")}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            placeholder="+57..."
          />
          <div className="grid sm:col-span-3 sm:flex sm:justify-end">
            <Button type="submit" disabled={profileSaving}>
              {profileSaving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Cambiar contraseña">
        <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Actual"
            type="password"
            value={passwordForm.current}
            onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
            placeholder="Contraseña actual"
          />
          <Input
            label="Nueva"
            type="password"
            value={passwordForm.next}
            onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })}
            placeholder="Mínimo 8 caracteres"
          />
          <Input
            label="Confirmación"
            type="password"
            value={passwordForm.confirm}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
            placeholder="Repite la nueva contraseña"
          />
          <div className="grid sm:col-span-3 sm:flex sm:justify-end">
            <Button variant="secondary" type="submit" disabled={passwordSaving}>
              {passwordSaving ? "Cambiando..." : "Cambiar"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Empresa">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-button border border-edge p-3 sm:col-span-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-button bg-brand text-lg font-bold text-white">
              {nombreIniciales}
            </div>
            <div>
              <p className="font-semibold text-ink">{empresa.razon}</p>
              <p className="text-xs text-muted">NIT: {empresa.nit}</p>
            </div>
          </div>
          <Input
            value={empresa.razon}
            onChange={(e) => setEmpresa({ ...empresa, razon: e.target.value })}
            placeholder="Razón social"
          />
          <Input
            value={empresa.nit}
            onChange={(e) => setEmpresa({ ...empresa, nit: e.target.value })}
            placeholder="NIT"
          />
          <Input
            value={empresa.direccion}
            onChange={(e) => setEmpresa({ ...empresa, direccion: e.target.value })}
            placeholder="Dirección"
          />
          <Input
            value={empresa.telefono}
            onChange={(e) => setEmpresa({ ...empresa, telefono: e.target.value })}
            placeholder="Teléfono"
          />
          <Input
            value={empresa.email}
            onChange={(e) => setEmpresa({ ...empresa, email: e.target.value })}
            placeholder="Email"
            wrapperClassName="sm:col-span-2"
          />
        </div>
      </Card>

      <IntegrationSettingsPanel />

      <ErrorEventsPanel />

      <FinancialRateRulesPanel />

      <Card title="Sistema de guías">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input value="DHE + YYYYMMDD + NNNNN" readOnly className="bg-app-secondary" />
          <Input value="00007" readOnly className="bg-app-secondary" />
          <Input value="DHE" readOnly className="bg-app-secondary" />
        </div>
      </Card>
      {whatsappAdminUiEnabled ? <WhatsAppLinkRequestsPanel /> : null}
    </div>
  );
}
