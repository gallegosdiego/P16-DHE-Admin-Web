"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiJson } from "@/lib/api";
import type { Client, PaginatedResponse } from "@/lib/types";
import { usePageTitle } from "@/lib/page-title";

type IntakeMode = "pickup_at_client_location" | "planned_dropoff_at_hub" | "walk_in_at_hub";
type Location = { id: number; name: string; address_line1: string; city: string };
type CreatedPickup = { data: { id: number; pickup_code: string; intake_mode: IntakeMode } };

const modes: Array<{ value: IntakeMode; label: string; detail: string }> = [
  { value: "pickup_at_client_location", label: "Recoger en el cliente", detail: "Se creará una tarea para piloto o recolector." },
  { value: "planned_dropoff_at_hub", label: "Entrega planificada en sede", detail: "El cliente avisa antes de llevar los paquetes." },
  { value: "walk_in_at_hub", label: "Ingreso espontáneo", detail: "La persona llegó a la sede sin solicitud previa." },
];

export default function NuevaRecogidaPage() {
  usePageTitle("Nueva recogida | Danhei Express");
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [clientId, setClientId] = useState("");
  const [mode, setMode] = useState<IntakeMode>("pickup_at_client_location");
  const [locationId, setLocationId] = useState("");
  const [plannedAt, setPlannedAt] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [codAmount, setCodAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedPickup["data"] | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<PaginatedResponse<Client>>("/clients?per_page=100"),
      apiGet<{ data: Location[] }>("/service-locations"),
    ]).then(([clientResponse, locationResponse]) => {
      setClients(clientResponse.data ?? []);
      setLocations(locationResponse.data ?? []);
      if (clientResponse.data?.[0]) setClientId(String(clientResponse.data[0].id));
      if (locationResponse.data?.[0]) setLocationId(String(locationResponse.data[0].id));
    }).catch(() => setError("No se pudieron cargar clientes o sedes."));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreated(null);
    setSubmitting(true);
    try {
      const response = await apiJson<CreatedPickup>("/pickup-intakes", "POST", {
        customer_id: Number(clientId),
        source: mode === "walk_in_at_hub" ? "hub_walk_in" : "admin",
        intake_mode: mode,
        service_location_id: mode === "pickup_at_client_location" ? null : Number(locationId),
        planned_dropoff_at: mode === "planned_dropoff_at_hub" ? new Date(plannedAt).toISOString() : null,
        pickup_address_line1: mode === "pickup_at_client_location" ? pickupAddress : null,
        pickup_city: "Bogotá",
        contact_name: contactName,
        contact_phone: contactPhone,
        packages: [{
          recipient_name: recipientName,
          recipient_phone: recipientPhone,
          delivery_address_line1: deliveryAddress,
          delivery_city: "Bogotá",
          is_cod: Number(codAmount) > 0,
          requested_cod_amount: Number(codAmount) || 0,
        }],
      }, { "Idempotency-Key": crypto.randomUUID() });
      setCreated(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible crear la solicitud.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-4">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-sm font-semibold text-emerald-600 dark:text-emerald-400" href="/recogidas">← Volver a recogidas</Link>
          <Link className="text-sm font-semibold text-sky-600 dark:text-sky-400" href="/configuracion/sedes">Administrar sedes</Link>
        </div>
        <h1 className="mt-3 text-2xl font-bold">Nueva solicitud manual</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Registra cualquiera de las tres formas de ingreso sin depender de WhatsApp.</p>
      </header>

      <form className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]" onSubmit={submit}>
        <label className="block space-y-1 text-sm font-semibold">Cliente
          <select required value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">Selecciona un cliente</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.company ? ` — ${client.company}` : ""}</option>)}
          </select>
        </label>

        <div className="grid gap-3 lg:grid-cols-3">
          {modes.map((option) => <button key={option.value} type="button" onClick={() => setMode(option.value)} className={`rounded-2xl border p-4 text-left ${mode === option.value ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" : "border-slate-200 dark:border-[#2a2a3e]"}`}><strong className="block">{option.label}</strong><span className="mt-1 block text-xs text-slate-500">{option.detail}</span></button>)}
        </div>

        {mode === "pickup_at_client_location" ? (
          <Field label="Dirección de recogida"><input required value={pickupAddress} onChange={(event) => setPickupAddress(event.target.value)} /></Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sede"><select required value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Selecciona una sede</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} — {location.address_line1}</option>)}</select></Field>
            {mode === "planned_dropoff_at_hub" && <Field label="Fecha y hora estimada"><input required type="datetime-local" value={plannedAt} onChange={(event) => setPlannedAt(event.target.value)} /></Field>}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Persona que entrega o atiende"><input required value={contactName} onChange={(event) => setContactName(event.target.value)} /></Field>
          <Field label="Teléfono"><input required value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></Field>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4 dark:border-[#2a2a3e]">
          <h2 className="mb-3 font-semibold">Primer paquete</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input required placeholder="Destinatario" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
            <input required placeholder="Teléfono destinatario" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} />
            <input required placeholder="Dirección de entrega" value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} />
            <Field label="Valor COD"><input type="number" min="0" value={codAmount} onChange={(event) => setCodAmount(event.target.value)} /></Field>
          </div>
        </div>

        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        {created && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Solicitud <strong>{created.pickup_code}</strong> creada correctamente.</p>}
        <button disabled={submitting} className="min-h-11 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60" type="submit">{submitting ? "Creando…" : "Crear solicitud"}</button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1 text-sm font-semibold"><span className="block">{label}</span>{children}</label>;
}
