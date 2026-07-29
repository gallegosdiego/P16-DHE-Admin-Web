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

function generateInternalCode(name: string, locationType: string, locations: Location[], editingId: number | null): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "SEDE";
  const prefix = locationType === "partner_point" ? "PTO" : "HUB";
  const base = `${prefix}-${slug}`.slice(0, 40);
  let candidate = base;
  let suffix = 2;

  while (locations.some((location) => location.id !== editingId && location.code === candidate)) {
    const tail = `-${suffix}`;
    candidate = `${base.slice(0, 40 - tail.length)}${tail}`;
    suffix += 1;
  }

  return candidate;
}

export default function SedesPage() {
  usePageTitle("Sedes operativas | Danhei Express");
  const [locations, setLocations] = useState<Location[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [locationType, setLocationType] = useState("danhei_hub");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Bogotá");
  const [phone, setPhone] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);
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

  function clearForm() {
    setEditingId(null);
    setCode("");
    setName("");
    setLocationType("danhei_hub");
    setAddress("");
    setCity("Bogotá");
    setPhone("");
    setIsActive(true);
  }

  function editLocation(location: Location) {
    setEditingId(location.id);
    setCode(location.code);
    setName(location.name);
    setLocationType(location.location_type);
    setAddress(location.address_line1);
    setCity(location.city);
    setPhone(location.contact_phone ?? "");
    setIsActive(location.is_active);
    setError("");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiJson<{ data: Location }>(editingId ? `/service-locations/${editingId}` : "/service-locations", editingId ? "PUT" : "POST", {
        code: code.trim().toUpperCase() || undefined,
        name: name.trim(),
        location_type: locationType,
        address_line1: address.trim(),
        city: city.trim(),
        contact_phone: phone.trim() || null,
        is_active: isActive,
      });
      clearForm();
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
        <OperationsCard title={editingId ? "Editar sede" : "Agregar sede"} description="El código se genera automáticamente para uso interno; el nombre es el que verá el personal.">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Código interno" hint="Se genera desde el tipo y el nombre. No es la etiqueta visual."><input className={`${controlClass} bg-slate-50 uppercase dark:bg-[#16162a]`} readOnly maxLength={40} value={code || generateInternalCode(name, locationType, locations, editingId)} placeholder="Se genera al escribir el nombre" /></FormField>
            <FormField label="Nombre visible"><input className={controlClass} required value={name} onChange={(event) => { const nextName = event.target.value; setName(nextName); setCode(generateInternalCode(nextName, locationType, locations, editingId)); }} placeholder="Sede principal" /></FormField>
            <FormField label="Tipo de sede"><select className={controlClass} value={locationType} onChange={(event) => { const nextType = event.target.value; setLocationType(nextType); setCode(generateInternalCode(name, nextType, locations, editingId)); }}><option value="danhei_hub">Hub Danhei</option><option value="partner_point">Punto aliado</option></select></FormField>
            <FormField label="Dirección"><input className={controlClass} required value={address} onChange={(event) => setAddress(event.target.value)} /></FormField>
            <FormField label="Ciudad"><input className={controlClass} required value={city} onChange={(event) => setCity(event.target.value)} /></FormField>
            <FormField label="Teléfono de contacto"><input className={controlClass} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></FormField>
            {editingId ? <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Sede activa</label> : null}
          </div>
          {error ? <div className="mt-4"><InlineNotice tone="error">{error}</InlineNotice></div> : null}
          <div className="mt-4 flex justify-end">
            {editingId ? <button disabled={submitting} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-[#2a2a3e]" type="button" onClick={clearForm}>Cancelar</button> : null}
            <button disabled={submitting} className={`${primaryButtonClass} w-full sm:w-auto`} type="submit">{submitting ? "Guardando…" : editingId ? "Actualizar sede" : "Guardar sede"}</button>
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
                <button type="button" onClick={() => editLocation(location)} className="mt-3 text-sm font-semibold text-primary underline underline-offset-2">Editar sede</button>
              </article>
            ))}
          </div>
        )}
      </OperationsCard>
    </div>
  );
}
