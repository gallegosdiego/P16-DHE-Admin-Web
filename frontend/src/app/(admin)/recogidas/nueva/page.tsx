"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiJson } from "@/lib/api";
import type { Client, PaginatedResponse } from "@/lib/types";
import { formatCOP } from "@/lib/utils";
import { usePageTitle } from "@/lib/page-title";
import {
  controlClass,
  FormField,
  InlineNotice,
  OperationsCard,
  OperationsHeader,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/components/operations-ui";

type IntakeMode = "pickup_at_client_location" | "planned_dropoff_at_hub" | "walk_in_at_hub";
type ReceptionResult = "received" | "rejected";
type Location = { id: number; code: string; name: string; address_line1: string; city: string };
type CreatedPickup = {
  data: {
    id: number;
    pickup_code: string;
    intake_mode: IntakeMode;
    status?: string;
    package_count?: number;
  };
};

type PackageDraft = {
  key: number;
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  deliveryComplement: string;
  deliveryCity: string;
  codAmount: string;
  fragile: boolean;
  notes: string;
  receptionResult: ReceptionResult;
  exceptionNotes: string;
};

const modes: Array<{
  value: IntakeMode;
  eyebrow: string;
  label: string;
  detail: string;
  outcome: string;
}> = [
  {
    value: "pickup_at_client_location",
    eyebrow: "Danhei recoge",
    label: "Recoger en el local del cliente",
    detail: "El cliente solicita que Danhei vaya por los paquetes.",
    outcome: "Después podrás asignar un piloto o un empleado Danhei.",
  },
  {
    value: "planned_dropoff_at_hub",
    eyebrow: "El cliente avisa",
    label: "Enviar o llevar a una sede",
    detail: "El cliente programa la entrega en una sede Danhei.",
    outcome: "Mostrador verá los paquetes esperados antes de recibirlos.",
  },
  {
    value: "walk_in_at_hub",
    eyebrow: "Ya está en mostrador",
    label: "Recibir ahora, sin aviso previo",
    detail: "La persona llegó con los paquetes y deben registrarse de inmediato.",
    outcome: "Solicitud, guías aceptadas, recepción y custodia quedan en una operación.",
  },
];

function emptyPackage(key: number): PackageDraft {
  return {
    key,
    recipientName: "",
    recipientPhone: "",
    deliveryAddress: "",
    deliveryComplement: "",
    deliveryCity: "Bogotá",
    codAmount: "0",
    fragile: false,
    notes: "",
    receptionResult: "received",
    exceptionNotes: "",
  };
}

export default function NuevoIngresoPage() {
  usePageTitle("Nuevo ingreso | Danhei Express");
  const nextPackageKey = useRef(2);
  const idempotencyRef = useRef<{ key: string; fingerprint: string } | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [clientId, setClientId] = useState("");
  const [mode, setMode] = useState<IntakeMode>("pickup_at_client_location");
  const [locationId, setLocationId] = useState("");
  const [plannedAt, setPlannedAt] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupComplement, setPickupComplement] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [deliveredByName, setDeliveredByName] = useState("");
  const [deliveredByPhone, setDeliveredByPhone] = useState("");
  const [deliveredByRelationship, setDeliveredByRelationship] = useState("");
  const [deliveredByNotes, setDeliveredByNotes] = useState("");
  const [defaultShippingCost, setDefaultShippingCost] = useState("12500");
  const [defaultDriverFee, setDefaultDriverFee] = useState("0");
  const [packages, setPackages] = useState<PackageDraft[]>([emptyPackage(1)]);
  const [submitting, setSubmitting] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedPickup["data"] | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      apiGet<PaginatedResponse<Client>>("/clients?per_page=100"),
      apiGet<{ data: Location[] }>("/service-locations"),
    ])
      .then(([clientResult, locationResult]) => {
        if (!active) return;
        const failures: string[] = [];

        if (clientResult.status === "fulfilled") {
          const nextClients = clientResult.value.data ?? [];
          setClients(nextClients);
          if (nextClients[0]) setClientId(String(nextClients[0].id));
        } else {
          failures.push("clientes");
        }

        if (locationResult.status === "fulfilled") {
          const nextLocations = locationResult.value.data ?? [];
          setLocations(nextLocations);
          const preferredLocation = nextLocations.find((location) => location.code === "HUB-PRINCIPAL") ?? nextLocations[0];
          if (preferredLocation) setLocationId(String(preferredLocation.id));
        } else {
          failures.push("sedes");
        }

        setLookupError(
          failures.length > 0
            ? `No se pudieron cargar ${failures.join(" ni ")}. Actualiza la página o revisa la configuración.`
            : "",
        );
      })
      .finally(() => {
        if (active) setLoadingLookups(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedMode = modes.find((option) => option.value === mode) ?? modes[0];
  const requiresLocation = mode !== "pickup_at_client_location";
  const missingLocation = requiresLocation && !loadingLookups && locations.length === 0;
  const totalCod = useMemo(
    () => packages.reduce((total, item) => total + (Number(item.codAmount) || 0), 0),
    [packages]
  );
  const acceptedPackages = useMemo(
    () => packages.filter((item) => mode !== "walk_in_at_hub" || item.receptionResult === "received").length,
    [mode, packages]
  );

  function updatePackage(key: number, patch: Partial<PackageDraft>) {
    setPackages((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addPackage() {
    const key = nextPackageKey.current;
    nextPackageKey.current += 1;
    setPackages((current) => [...current, emptyPackage(key)]);
  }

  function removePackage(key: number) {
    setPackages((current) => (current.length === 1 ? current : current.filter((item) => item.key !== key)));
  }

  function resetForm() {
    setMode("pickup_at_client_location");
    setPlannedAt("");
    setPickupAddress("");
    setPickupComplement("");
    setContactName("");
    setContactPhone("");
    setSpecialInstructions("");
    setDeliveredByName("");
    setDeliveredByPhone("");
    setDeliveredByRelationship("");
    setDeliveredByNotes("");
    setDefaultShippingCost("12500");
    setDefaultDriverFee("0");
    setPackages([emptyPackage(nextPackageKey.current)]);
    nextPackageKey.current += 1;
    idempotencyRef.current = null;
    setCreated(null);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreated(null);

    if (packages.some((item) => !item.recipientName.trim() || !item.recipientPhone.trim() || !item.deliveryAddress.trim())) {
      setError("Completa destinatario, teléfono y dirección de todos los paquetes.");
      return;
    }

    const packagePayload = packages.map((item) => ({
      recipient_name: item.recipientName.trim(),
      recipient_phone: item.recipientPhone.trim(),
      delivery_address_line1: item.deliveryAddress.trim(),
      delivery_address_complement: item.deliveryComplement.trim() || null,
      delivery_city: item.deliveryCity.trim() || "Bogotá",
      is_cod: Number(item.codAmount) > 0,
      requested_cod_amount: Number(item.codAmount) || 0,
      is_fragile: item.fragile,
      special_handling_notes: item.notes.trim() || null,
      ...(mode === "walk_in_at_hub"
        ? {
            reception_result: item.receptionResult,
            exception_code: item.receptionResult === "rejected" ? "REJECTED_AT_HUB" : null,
            exception_notes: item.exceptionNotes.trim() || null,
          }
        : {}),
    }));

    const commonPayload = {
      customer_id: Number(clientId),
      service_location_id: mode === "pickup_at_client_location" ? null : Number(locationId),
      contact_name: contactName.trim(),
      contact_phone: contactPhone.trim(),
      special_instructions: specialInstructions.trim() || null,
      packages: packagePayload,
    };
    const payload = mode === "walk_in_at_hub"
      ? {
          ...commonPayload,
          delivered_by_name: deliveredByName.trim() || null,
          delivered_by_phone: deliveredByPhone.trim() || null,
          delivered_by_relationship: deliveredByRelationship.trim() || null,
          delivered_by_notes: deliveredByNotes.trim() || null,
          default_shipping_cost: Number(defaultShippingCost) || 0,
          default_driver_fee: Number(defaultDriverFee) || 0,
          non_cod_payment_type: "post_sale",
        }
      : {
          ...commonPayload,
          source: "admin",
          intake_mode: mode,
          planned_dropoff_at: mode === "planned_dropoff_at_hub" ? new Date(plannedAt).toISOString() : null,
          pickup_address_line1: mode === "pickup_at_client_location" ? pickupAddress.trim() : null,
          pickup_address_complement: mode === "pickup_at_client_location" ? pickupComplement.trim() || null : null,
          pickup_city: "Bogotá",
        };

    const fingerprint = JSON.stringify(payload);
    if (!idempotencyRef.current || idempotencyRef.current.fingerprint !== fingerprint) {
      idempotencyRef.current = { key: crypto.randomUUID(), fingerprint };
    }

    setSubmitting(true);
    try {
      const response = await apiJson<CreatedPickup>(
        mode === "walk_in_at_hub" ? "/pickup-intakes/walk-in/complete" : "/pickup-intakes",
        "POST",
        payload,
        { "Idempotency-Key": idempotencyRef.current.key },
        { idempotent: true, retries: 1 }
      );
      setCreated(response.data);
      idempotencyRef.current = null;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible registrar el ingreso.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-4">
      <OperationsHeader
        backHref="/recogidas"
        backLabel="Volver a ingresos"
        eyebrow="Entrada única"
        title="Nuevo ingreso de paquetes"
        description="Registra cómo llegarán los paquetes a Danhei. La solicitud, la recepción y las guías conservan una sola trazabilidad desde el primer momento."
        actions={[{ href: "/configuracion/sedes", label: "Administrar sedes" }]}
      />

      {created ? (
        <OperationsCard className="border-emerald-300 dark:border-emerald-500/40">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                Ingreso registrado
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{created.pickup_code}</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {mode === "walk_in_at_hub"
                  ? "Los paquetes aceptados ya tienen guía, recepción y custodia en sede."
                  : "La solicitud quedó lista para revisión, materialización y asignación operativa."}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link href="/recogidas" className={primaryButtonClass}>Ver ingreso</Link>
              <button type="button" onClick={resetForm} className={secondaryButtonClass}>Registrar otro</button>
            </div>
          </div>
        </OperationsCard>
      ) : null}

      <form className="space-y-4" onSubmit={submit}>
        <OperationsCard
          title="1. ¿Cómo llegan los paquetes?"
          description="Escoge la situación real. Quién ejecuta una recogida se asigna después, sin cambiar el origen de la solicitud."
        >
          <fieldset>
            <legend className="sr-only">Forma de ingreso</legend>
            <div className="grid gap-3 lg:grid-cols-3">
              {modes.map((option) => {
                const selected = mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setMode(option.value)}
                    className={`min-h-44 rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-primary/25 ${
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/15"
                        : "border-slate-200 hover:border-primary/30 hover:bg-slate-50 dark:border-[#2a2a3e] dark:hover:bg-[#202035]"
                    }`}
                  >
                    <span className={`text-[11px] font-bold uppercase tracking-[0.18em] ${selected ? "text-primary" : "text-slate-500 dark:text-slate-400"}`}>
                      {option.eyebrow}
                    </span>
                    <strong className="mt-2 block text-base text-slate-900 dark:text-slate-100">{option.label}</strong>
                    <span className="mt-2 block text-sm leading-5 text-slate-600 dark:text-slate-300">{option.detail}</span>
                    <span className="mt-3 block text-xs leading-5 text-slate-500 dark:text-slate-400">{option.outcome}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <FormField label="Cliente">
              <select className={controlClass} required disabled={loadingLookups} value={clientId} onChange={(event) => setClientId(event.target.value)}>
                <option value="">Selecciona un cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}{client.company ? ` — ${client.company}` : ""}</option>
                ))}
              </select>
            </FormField>

            {mode === "pickup_at_client_location" ? (
              <FormField label="Dirección de recogida">
                <input className={controlClass} required value={pickupAddress} onChange={(event) => setPickupAddress(event.target.value)} placeholder="Dirección del local" />
              </FormField>
            ) : (
              <FormField label="Sede Danhei">
                <select className={controlClass} required disabled={loadingLookups || locations.length === 0} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                  <option value="">{locations.length === 0 && !loadingLookups ? "No hay sedes activas" : "Selecciona una sede"}</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>{location.name} — {location.address_line1}</option>
                  ))}
                </select>
              </FormField>
            )}

            {mode === "pickup_at_client_location" ? (
              <FormField label="Complemento de recogida" hint="Local, piso, bodega o referencia.">
                <input className={controlClass} value={pickupComplement} onChange={(event) => setPickupComplement(event.target.value)} />
              </FormField>
            ) : null}

            {mode === "planned_dropoff_at_hub" ? (
              <FormField label="Fecha y hora estimada">
                <input className={controlClass} required type="datetime-local" value={plannedAt} onChange={(event) => setPlannedAt(event.target.value)} />
              </FormField>
            ) : null}
          </div>

          {missingLocation ? (
            <div className="mt-4">
              <InlineNotice tone="warning">
                No hay una sede activa para recibir paquetes.{" "}
                <Link className="font-bold underline underline-offset-2" href="/configuracion/sedes">
                  Configura una sede
                </Link>{" "}
                y vuelve a este ingreso.
              </InlineNotice>
            </div>
          ) : null}
        </OperationsCard>

        <OperationsCard title="2. Contacto del ingreso" description="Persona que atiende la recogida o responde por la entrega en sede.">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Nombre completo"><input className={controlClass} required value={contactName} onChange={(event) => setContactName(event.target.value)} /></FormField>
            <FormField label="Teléfono"><input className={controlClass} required type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></FormField>
            <FormField className="md:col-span-2" label="Instrucciones generales" hint="Información que aplica a todo el ingreso.">
              <textarea className={textareaClass} value={specialInstructions} onChange={(event) => setSpecialInstructions(event.target.value)} />
            </FormField>
          </div>
        </OperationsCard>

        {mode === "walk_in_at_hub" ? (
          <OperationsCard title="3. Entrega física en mostrador" description="Identifica a quien llegó con los paquetes y los valores usados para crear las guías aceptadas.">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Nombre de quien entrega" hint="Déjalo vacío si es la misma persona de contacto."><input className={controlClass} value={deliveredByName} onChange={(event) => setDeliveredByName(event.target.value)} /></FormField>
              <FormField label="Teléfono de quien entrega"><input className={controlClass} type="tel" value={deliveredByPhone} onChange={(event) => setDeliveredByPhone(event.target.value)} /></FormField>
              <FormField label="Relación con el cliente" hint="Ejemplo: titular, empleado, mensajero."><input className={controlClass} value={deliveredByRelationship} onChange={(event) => setDeliveredByRelationship(event.target.value)} /></FormField>
              <FormField label="Observación de custodia"><input className={controlClass} value={deliveredByNotes} onChange={(event) => setDeliveredByNotes(event.target.value)} /></FormField>
              <FormField label="Costo de envío por paquete"><input className={controlClass} min="0" step="1" type="number" value={defaultShippingCost} onChange={(event) => setDefaultShippingCost(event.target.value)} /></FormField>
              <FormField label="Pago al piloto por paquete" hint="Normalmente 0 al recibir en sede; la entrega se causará según la regla financiera."><input className={controlClass} min="0" step="1" type="number" value={defaultDriverFee} onChange={(event) => setDefaultDriverFee(event.target.value)} /></FormField>
            </div>
          </OperationsCard>
        ) : null}

        <OperationsCard
          title={`${mode === "walk_in_at_hub" ? "4" : "3"}. Paquetes del ingreso`}
          description="Registra todos los paquetes de esta solicitud. Cada paquete aceptado producirá como máximo una guía."
          action={<button type="button" onClick={addPackage} className={secondaryButtonClass}>+ Agregar paquete</button>}
        >
          <div className="space-y-4">
            {packages.map((item, index) => (
              <fieldset key={item.key} className="rounded-xl border border-slate-200 p-4 dark:border-[#2a2a3e]">
                <legend className="px-2 text-sm font-bold text-slate-900 dark:text-slate-100">Paquete {index + 1}</legend>
                <div className="mb-4 flex justify-end">
                  <button type="button" disabled={packages.length === 1} onClick={() => removePackage(item.key)} className="text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-rose-300">
                    Quitar paquete
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Destinatario"><input className={controlClass} required value={item.recipientName} onChange={(event) => updatePackage(item.key, { recipientName: event.target.value })} /></FormField>
                  <FormField label="Teléfono del destinatario"><input className={controlClass} required type="tel" value={item.recipientPhone} onChange={(event) => updatePackage(item.key, { recipientPhone: event.target.value })} /></FormField>
                  <FormField className="md:col-span-2" label="Dirección de entrega"><input className={controlClass} required value={item.deliveryAddress} onChange={(event) => updatePackage(item.key, { deliveryAddress: event.target.value })} /></FormField>
                  <FormField label="Complemento"><input className={controlClass} value={item.deliveryComplement} onChange={(event) => updatePackage(item.key, { deliveryComplement: event.target.value })} /></FormField>
                  <FormField label="Ciudad"><input className={controlClass} required value={item.deliveryCity} onChange={(event) => updatePackage(item.key, { deliveryCity: event.target.value })} /></FormField>
                  <FormField label="Valor contraentrega (COD)" hint="Usa 0 si no requiere recaudo."><input className={controlClass} min="0" step="1" type="number" value={item.codAmount} onChange={(event) => updatePackage(item.key, { codAmount: event.target.value })} /></FormField>
                  {mode === "walk_in_at_hub" ? (
                    <FormField label="Resultado en mostrador">
                      <select className={controlClass} value={item.receptionResult} onChange={(event) => updatePackage(item.key, { receptionResult: event.target.value as ReceptionResult })}>
                        <option value="received">Aceptado y recibido</option>
                        <option value="rejected">Rechazado</option>
                      </select>
                    </FormField>
                  ) : (
                    <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-[#2a2a3e] dark:text-slate-200">
                      <input type="checkbox" checked={item.fragile} onChange={(event) => updatePackage(item.key, { fragile: event.target.checked })} />
                      Paquete frágil
                    </label>
                  )}
                  <FormField className="md:col-span-2" label={item.receptionResult === "rejected" && mode === "walk_in_at_hub" ? "Motivo del rechazo" : "Manejo especial"}>
                    <textarea className={textareaClass} required={mode === "walk_in_at_hub" && item.receptionResult === "rejected"} value={item.receptionResult === "rejected" && mode === "walk_in_at_hub" ? item.exceptionNotes : item.notes} onChange={(event) => updatePackage(item.key, item.receptionResult === "rejected" && mode === "walk_in_at_hub" ? { exceptionNotes: event.target.value } : { notes: event.target.value })} />
                  </FormField>
                </div>
              </fieldset>
            ))}
          </div>
        </OperationsCard>

        <OperationsCard className="sticky bottom-3 z-10 border-primary/30 shadow-lg">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-xs text-slate-500">Vía</p><p className="mt-1 text-sm font-bold">{selectedMode.eyebrow}</p></div>
              <div><p className="text-xs text-slate-500">Paquetes</p><p className="mt-1 text-sm font-bold">{acceptedPackages}/{packages.length} aceptados</p></div>
              <div><p className="text-xs text-slate-500">COD esperado</p><p className="mt-1 text-sm font-bold">{formatCOP(totalCod)}</p></div>
            </div>
            <button disabled={submitting || loadingLookups || created !== null || (requiresLocation && !locationId)} className={`${primaryButtonClass} w-full lg:min-w-52`} type="submit">
              {submitting ? "Registrando…" : mode === "walk_in_at_hub" ? "Registrar y recibir" : "Crear ingreso"}
            </button>
          </div>
        </OperationsCard>

        {lookupError ? <InlineNotice tone="error">{lookupError}</InlineNotice> : null}
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      </form>
    </div>
  );
}
