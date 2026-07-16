"use client";

import { FormEvent, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/page-title";
import { useToast } from "@/components/toast";
import { WhatsAppLinkRequestsPanel } from "@/components/whatsapp-link-requests-panel";
import { apiSend } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { whatsappAdminUiEnabled } from "@/lib/features";
import { FinancialRateRulesPanel } from "@/components/financial/rate-rules-panel";

export default function ConfiguracionPage() {
  usePageTitle("Configuración | Danhei Express");
  const { user } = useAuth();
  const { showToast } = useToast();
  const { theme, setTheme, toggleTheme } = useTheme();

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
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Configuración</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Parámetros del sistema administrativo</p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Tema</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Cambia el tema y verifica el resultado en vivo.
        </p>
        <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-all duration-150 active:scale-95 ${
              theme === "light"
                ? "border-primary bg-primary/10 text-primary"
                : "border-slate-300 text-slate-700 dark:border-[#2a2a3e] dark:text-slate-200"
            }`}
          >
            Claro
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-all duration-150 active:scale-95 ${
              theme === "dark"
                ? "border-primary bg-primary/10 text-primary"
                : "border-slate-300 text-slate-700 dark:border-[#2a2a3e] dark:text-slate-200"
            }`}
          >
            Oscuro
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:text-slate-200 dark:hover:bg-[#1f1f35]"
          >
            Alternar tema
          </button>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">
            Tema actual: {theme === "dark" ? "Oscuro" : "Claro"}
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Perfil</h2>
        <form onSubmit={saveProfile} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Nombre</span>
            <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" placeholder="Nombre visible" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Email</span>
            <input value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" placeholder="correo@dominio.com" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Teléfono</span>
            <input value={String(profile.phone || "")} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" placeholder="+57..." />
          </label>
          <div className="grid sm:col-span-3 sm:flex sm:justify-end">
            <button disabled={profileSaving} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60">{profileSaving ? "Guardando..." : "Guardar"}</button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Cambiar contraseña</h2>
        <form onSubmit={changePassword} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Actual</span>
            <input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" placeholder="Contraseña actual" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Nueva</span>
            <input type="password" value={passwordForm.next} onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" placeholder="Mínimo 8 caracteres" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Confirmación</span>
            <input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" placeholder="Repite la nueva contraseña" />
          </label>
          <div className="grid sm:col-span-3 sm:flex sm:justify-end">
            <button disabled={passwordSaving} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm transition-all duration-150 active:scale-95 disabled:opacity-60 dark:border-[#2a2a3e] dark:text-slate-200 dark:hover:bg-[#1f1f35]">{passwordSaving ? "Cambiando..." : "Cambiar"}</button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Empresa</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e] sm:col-span-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white">{nombreIniciales}</div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">{empresa.razon}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">NIT: {empresa.nit}</p>
            </div>
          </div>
          <input value={empresa.razon} onChange={(e) => setEmpresa({ ...empresa, razon: e.target.value })} className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" placeholder="Razón social" />
          <input value={empresa.nit} onChange={(e) => setEmpresa({ ...empresa, nit: e.target.value })} className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" placeholder="NIT" />
          <input value={empresa.direccion} onChange={(e) => setEmpresa({ ...empresa, direccion: e.target.value })} className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" placeholder="Dirección" />
          <input value={empresa.telefono} onChange={(e) => setEmpresa({ ...empresa, telefono: e.target.value })} className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" placeholder="Teléfono" />
          <input value={empresa.email} onChange={(e) => setEmpresa({ ...empresa, email: e.target.value })} className="h-11 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2 dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" placeholder="Email" />
        </div>
      </section>

      <FinancialRateRulesPanel />

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Sistema de guías</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input value="DHE + YYYYMMDD + NNNNN" readOnly className="h-11 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" />
          <input value="00007" readOnly className="h-11 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" />
          <input value="DHE" readOnly className="h-11 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" />
        </div>
      </section>
      {whatsappAdminUiEnabled ? <WhatsAppLinkRequestsPanel /> : null}
    </div>
  );
}

