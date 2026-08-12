"use client";

import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { apiGet, apiJson, describeApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useEffect, useMemo, useState } from "react";

type IntegrationSetting = {
  key: string;
  group: string;
  label: string;
  help: string;
  secret: boolean;
  configured: boolean;
  source: "panel" | "servidor" | "sin_configurar";
  preview: string | null;
};

const ORIGEN: Record<IntegrationSetting["source"], { texto: string; clase: string }> = {
  panel: {
    texto: "Guardada aquí",
    clase: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
  servidor: {
    texto: "En el servidor",
    clase: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  },
  sin_configurar: {
    texto: "Sin configurar",
    clase: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  },
};

export function IntegrationSettingsPanel() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [settings, setSettings] = useState<IntegrationSetting[] | null>(null);
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);

  const esSuperadmin = useMemo(
    () => (user?.roles ?? []).some((rol) => String(rol) === "superadmin"),
    [user]
  );

  useEffect(() => {
    let vigente = true;

    const cargar = async () => {
      try {
        const data = await apiGet<{ settings: IntegrationSetting[] }>("/settings/integrations");
        if (vigente) setSettings(data.settings);
      } catch (error) {
        if (!vigente) return;
        showToast(describeApiError(error, "No se pudo cargar la configuración").message, "error");
        setSettings([]);
      }
    };

    cargar();

    // Evita actualizar el estado si el panel se desmonta antes de que responda.
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = async (setting: IntegrationSetting) => {
    const valor = borradores[setting.key] ?? "";
    setGuardando(setting.key);
    try {
      const data = await apiJson<{ settings: IntegrationSetting[] }>(
        "/settings/integrations",
        "PUT",
        { key: setting.key, value: valor }
      );
      setSettings(data.settings);
      setBorradores((prev) => ({ ...prev, [setting.key]: "" }));
      showToast(valor ? "Credencial actualizada" : "Se volvió al valor del servidor", "success");
    } catch (error) {
      showToast(describeApiError(error, "No se pudo guardar").message, "error");
    } finally {
      setGuardando(null);
    }
  };

  const grupos = useMemo(() => {
    if (!settings) return [];
    const mapa = new Map<string, IntegrationSetting[]>();
    for (const setting of settings) {
      mapa.set(setting.group, [...(mapa.get(setting.group) ?? []), setting]);
    }
    return [...mapa.entries()];
  }, [settings]);

  if (settings === null) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">
        Credenciales de integración
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Se guardan cifradas y <strong>no se pueden volver a ver</strong>: solo cambiar. Si dejas un
        campo vacío y guardas, vuelve a usarse el valor configurado en el servidor.
      </p>

      {!esSuperadmin && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Solo un superadministrador puede modificar las credenciales marcadas como secretas.
        </p>
      )}

      {grupos.map(([grupo, items]) => (
        <div key={grupo} className="mt-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {grupo}
          </h3>
          <div className="mt-2 space-y-3">
            {items.map((setting) => {
              const bloqueado = setting.secret && !esSuperadmin;
              const origen = ORIGEN[setting.source];

              return (
                <div
                  key={setting.key}
                  className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">
                      {setting.label}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${origen.clase}`}>
                      {origen.texto}
                    </span>
                    {setting.preview && (
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {setting.preview}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{setting.help}</p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      type={setting.secret ? "password" : "text"}
                      autoComplete="off"
                      disabled={bloqueado}
                      value={borradores[setting.key] ?? ""}
                      onChange={(e) =>
                        setBorradores((prev) => ({ ...prev, [setting.key]: e.target.value }))
                      }
                      placeholder={
                        bloqueado
                          ? "Requiere superadministrador"
                          : setting.configured
                            ? "Escribe un valor nuevo para reemplazarla"
                            : "Sin configurar"
                      }
                      className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-100 dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0] dark:disabled:bg-[#12121f]"
                    />
                    <button
                      type="button"
                      disabled={bloqueado || guardando === setting.key}
                      onClick={() => guardar(setting)}
                      className="min-h-11 rounded-lg bg-[#d1007f] px-4 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-50"
                    >
                      {guardando === setting.key ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
