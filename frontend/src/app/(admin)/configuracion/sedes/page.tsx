"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiJson } from "@/lib/api";
import { usePageTitle } from "@/lib/page-title";

type Location = {
  id: number;
  code: string;
  name: string;
  location_type: string;
  address_line1: string;
  city: string;
  contact_phone?: string | null;
  is_active: boolean;
};

export default function SedesPage() {
  usePageTitle("Sedes operativas | Danhei Express");
  const [locations, setLocations] = useState<Location[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Bogotá");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await apiGet<{ data: Location[] }>("/service-locations?include_inactive=1");
      setLocations(response.data ?? []);
    } catch {
      setError("No se pudieron cargar las sedes.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiJson<{ data: Location }>("/service-locations", "POST", {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        location_type: "danhei_hub",
        address_line1: address.trim(),
        city: city.trim(),
        contact_phone: phone.trim() || null,
        is_active: true,
      });
      setCode("");
      setName("");
      setAddress("");
      setPhone("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible crear la sede.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-4">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <Link className="text-sm font-semibold text-sky-600 dark:text-sky-400" href="/configuracion">← Volver a configuración</Link>
        <h1 className="mt-3 text-2xl font-bold">Sedes operativas</h1>
        <p className="mt-2 text-sm text-slate-500">Puntos autorizados para entrega planificada o ingreso espontáneo de paquetes.</p>
      </header>

      <form className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] sm:grid-cols-2" onSubmit={submit}>
        <h2 className="sm:col-span-2 text-lg font-semibold">Agregar sede</h2>
        <Field label="Código"><input required maxLength={40} value={code} onChange={(event) => setCode(event.target.value)} placeholder="HUB-CENTRAL" /></Field>
        <Field label="Nombre"><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Sede principal" /></Field>
        <Field label="Dirección"><input required value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
        <Field label="Ciudad"><input required value={city} onChange={(event) => setCity(event.target.value)} /></Field>
        <Field label="Teléfono"><input value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
        <div className="flex items-end"><button disabled={submitting} className="min-h-11 rounded-xl bg-sky-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60" type="submit">{submitting ? "Guardando…" : "Guardar sede"}</button></div>
        {error && <p className="sm:col-span-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      </form>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h2 className="text-lg font-semibold">Catálogo actual</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {locations.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay sedes configuradas.</p> : locations.map((location) => (
            <article key={location.id} className="rounded-2xl border border-slate-200 p-4 dark:border-[#2a2a3e]">
              <div className="flex items-start justify-between gap-3"><div><p className="font-bold">{location.name}</p><p className="text-xs font-semibold text-sky-600">{location.code}</p></div><span className={`rounded-full px-2 py-1 text-xs ${location.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{location.is_active ? "Activa" : "Inactiva"}</span></div>
              <p className="mt-2 text-sm text-slate-500">{location.address_line1}, {location.city}</p>
              {location.contact_phone && <p className="mt-1 text-sm text-slate-500">{location.contact_phone}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1 text-sm font-semibold"><span className="block">{label}</span>{children}</label>;
}
