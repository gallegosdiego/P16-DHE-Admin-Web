"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiJson } from "@/lib/api";
import type { Client, PaginatedResponse } from "@/lib/types";
import { usePageTitle } from "@/lib/page-title";
import {
  controlClass,
  FormField,
  InlineNotice,
  OperationsCard,
  OperationsHeader,
  primaryButtonClass,
} from "@/components/operations-ui";

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
      <OperationsHeader
        backHref="/recogidas"
        backLabel="Volver a recogidas"
        title="Nueva solicitud manual"
        description="Registra una recogida en el cliente o el ingreso de paquetes a una sede Danhei. WhatsApp no es necesario para completar este flujo."
        actions={[{ href: "/configuracion/sedes", label: "Administrar sedes" }]}
      />

      <form className="space-y-4" onSubmit={submit}>
        <OperationsCard title="Origen de la solicitud" description="Selecciona el cliente y la forma en que Danhei recibirá los paquetes.">
          <FormField label="Cliente">
            <select className={controlClass} required value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">Selecciona un cliente</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.company ? ` — ${client.company}` : ""}</option>)}
            </select>
          </FormField>

          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Forma de ingreso</legend>
            <div className="grid gap-3 lg:grid-cols-3">
              {modes.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={mode === option.value}
                  onClick={() => setMode(option.value)}
                  className={`min-h-28 rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-primary/25 ${mode === option.value ? "border-primary bg-primary/5 ring-1 ring-primary/15" : "border-slate-200 hover:border-primary/30 hover:bg-slate-50 dark:border-[#2a2a3e] dark:hover:bg-[#202035]"}`}
                >
                  <strong className={mode === option.value ? "block text-primary" : "block"}>{option.label}</strong>
                  <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{option.detail}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-4">
            {mode === "pickup_at_client_location" ? (
              <FormField label="Dirección de recogida">
                <input className={controlClass} required value={pickupAddress} onChange={(event) => setPickupAddress(event.target.value)} />
              </FormField>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Sede Danhei">
                  <select className={controlClass} required value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                    <option value="">Selecciona una sede</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name} — {location.address_line1}</option>)}
                  </select>
                </FormField>
                {mode === "planned_dropoff_at_hub" ? (
                  <FormField label="Fecha y hora estimada">
                    <input className={controlClass} required type="datetime-local" value={plannedAt} onChange={(event) => setPlannedAt(event.target.value)} />
                  </FormField>
                ) : null}
              </div>
            )}
          </div>
        </OperationsCard>

        <OperationsCard title="Persona de contacto" description="Datos de quien entrega los paquetes o atiende la recogida.">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Nombre completo"><input className={controlClass} required value={contactName} onChange={(event) => setContactName(event.target.value)} /></FormField>
            <FormField label="Teléfono"><input className={controlClass} required type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></FormField>
          </div>
        </OperationsCard>

        <OperationsCard title="Primer paquete" description="La solicitud puede ampliarse después; registra aquí la primera guía esperada.">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Nombre del destinatario"><input className={controlClass} required value={recipientName} onChange={(event) => setRecipientName(event.target.value)} /></FormField>
            <FormField label="Teléfono del destinatario"><input className={controlClass} required type="tel" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} /></FormField>
            <FormField className="md:col-span-2" label="Dirección de entrega"><input className={controlClass} required value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} /></FormField>
            <FormField label="Valor contraentrega (COD)" hint="Déjalo en 0 si el paquete no requiere recaudo."><input className={controlClass} type="number" min="0" step="1" value={codAmount} onChange={(event) => setCodAmount(event.target.value)} /></FormField>
          </div>
        </OperationsCard>

        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        {created ? <InlineNotice tone="success">Solicitud <strong>{created.pickup_code}</strong> creada correctamente.</InlineNotice> : null}
        <div className="flex justify-end">
          <button disabled={submitting} className={`${primaryButtonClass} w-full sm:w-auto`} type="submit">{submitting ? "Creando…" : "Crear solicitud"}</button>
        </div>
      </form>
    </div>
  );
}
