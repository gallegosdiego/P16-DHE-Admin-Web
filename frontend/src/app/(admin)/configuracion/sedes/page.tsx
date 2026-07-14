"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiGet, apiJson } from "@/lib/api";
import { usePageTitle } from "@/lib/page-title";
import {
  controlClass,
  EmptyState,
  FormField,
  InlineNotice,
  OperationsCard,
  OperationsHeader,
  primaryButtonClass,
  StatusBadge,
} from "@/components/operations-ui";

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
      <OperationsHeader
        backHref="/configuracion"
        backLabel="Volver a configuración"
        eyebrow="Configuración operativa"
        title="Sedes operativas"
        description="Administra los puntos autorizados para entregas planificadas, ingresos espontáneos y traspasos de custodia."
      />

      <form onSubmit={submit}>
        <OperationsCard title="Agregar sede" description="Completa la información básica del punto de operación.">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Código" hint="Identificador interno corto, por ejemplo HUB-CENTRAL."><input className={controlClass} required maxLength={40} value={code} onChange={(event) => setCode(event.target.value)} placeholder="HUB-CENTRAL" /></FormField>
            <FormField label="Nombre"><input className={controlClass} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Sede principal" /></FormField>
            <FormField label="Dirección"><input className={controlClass} required value={address} onChange={(event) => setAddress(event.target.value)} /></FormField>
            <FormField label="Ciudad"><input className={controlClass} required value={city} onChange={(event) => setCity(event.target.value)} /></FormField>
            <FormField label="Teléfono de contacto"><input className={controlClass} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></FormField>
          </div>
          {error ? <div className="mt-4"><InlineNotice tone="error">{error}</InlineNotice></div> : null}
          <div className="mt-4 flex justify-end">
            <button disabled={submitting} className={`${primaryButtonClass} w-full sm:w-auto`} type="submit">{submitting ? "Guardando…" : "Guardar sede"}</button>
          </div>
        </OperationsCard>
      </form>

      <OperationsCard title="Catálogo actual" description={`${locations.length} sede(s) registrada(s)`}>
        {locations.length === 0 ? (
          <EmptyState>Todavía no hay sedes configuradas.</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {locations.map((location) => (
              <article key={location.id} className="rounded-xl border border-slate-200 p-4 dark:border-[#2a2a3e]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-[#e0e0e0]">{location.name}</p>
                    <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-primary">{location.code}</p>
                  </div>
                  <StatusBadge label={location.is_active ? "Activa" : "Inactiva"} tone={location.is_active ? "success" : "neutral"} />
                </div>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{location.address_line1}, {location.city}</p>
                {location.contact_phone ? <p className="mt-1 text-sm text-slate-500">Tel. {location.contact_phone}</p> : null}
              </article>
            ))}
          </div>
        )}
      </OperationsCard>
    </div>
  );
}
