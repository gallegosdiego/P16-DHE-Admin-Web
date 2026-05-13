"use client";

import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/page-title";

const zones = [
  "Chapinero",
  "Suba",
  "Kennedy",
  "Engativa",
  "Usaquen",
  "Centro",
  "Bosa",
  "Teusaquillo",
];

function ReadonlyInput({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        value={value}
        readOnly
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-700"
      />
    </label>
  );
}

export default function ConfiguracionPage() {
  usePageTitle("Configuracion | Danhei Express");
  const { user } = useAuth();

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-lg font-bold text-slate-900">Configuracion</h1>
        <p className="text-sm text-slate-500">Parametros del sistema administrativo</p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Perfil</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <ReadonlyInput label="Nombre" value={user?.name || "Admin Danhei"} />
          <ReadonlyInput label="Email" value={user?.email || "admin@danheiexpress.com"} />
          <ReadonlyInput label="Telefono" value="+57 311 220 6587" />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Empresa</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ReadonlyInput label="Razon social" value="DANHEI EXPRESS S.A.S." />
          <ReadonlyInput label="NIT" value="902043789-9" />
          <ReadonlyInput label="Direccion" value="Cl 13 #15-48, Local 64" />
          <ReadonlyInput label="Telefono" value="+57 311 220 6587" />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Tarifas</h2>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
            Proximamente
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ReadonlyInput label="Tarifa base por paquete" value="$11.500" />
          <ReadonlyInput label="Tarifa express" value="$15.000" />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2">Zona</th>
                <th className="py-2">Tarifa</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => (
                <tr key={zone} className="border-t border-slate-100">
                  <td className="py-2">{zone}</td>
                  <td className="py-2">$11.500</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Zonas de cobertura</h2>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
            Proximamente
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {zones.map((zone, index) => (
            <div
              key={zone}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <span>{zone}</span>
              <span
                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  index % 3 === 0
                    ? "bg-slate-100 text-slate-600"
                    : "bg-emerald-50 text-delivered"
                }`}
              >
                {index % 3 === 0 ? "Inactivo" : "Activo"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Sistema de guias</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ReadonlyInput label="Formato actual" value="DHE + YYYYMMDD + NNNNN" />
          <ReadonlyInput label="Ultimo consecutivo" value="DHE2026051300042" />
        </div>
      </section>
    </div>
  );
}
