"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  apiGet,
  apiFormData,
  describeApiError,
  type ApiErrorPresentation,
} from "@/lib/api";
import type { Client, PaginatedResponse } from "@/lib/types";
import { formatCOP } from "@/lib/utils";
import { usePageTitle } from "@/lib/page-title";
import { useAuth } from "@/lib/auth";
import { PrintReceiptButton } from "@/components/print-receipt";
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
type Receiver = { id: number; name: string; phone: string | null };
type NonCodPaymentType = "post_sale" | "prepaid" | "mercado_libre";
type CreatedPickup = {
  data: {
    id: number;
    pickup_code: string;
    intake_mode: IntakeMode;
    status?: string;
    package_count?: number;
    packages?: Array<{
      package_index: number;
      guide_number?: string | null;
      shipment?: {
        id: number;
        display_code: string;
        tracking_code: string;
        recipient_name: string;
        recipient_phone: string;
        recipient_address: string;
        recipient_zone: string | null;
        payment_type: "cash_on_delivery" | "post_sale" | "prepaid" | "mercado_libre";
        cod_amount: number | null;
        shipping_cost: number;
        driver_fee: number | null;
        created_at: string;
      } | null;
    }>;
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
  sizeCode: "small" | "medium" | "large";
  fragile: boolean;
  notes: string;
  receptionResult: ReceptionResult;
  exceptionNotes: string;
  evidencePhoto: File | null;
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
    sizeCode: "small",
    fragile: false,
    notes: "",
    receptionResult: "received",
    exceptionNotes: "",
    evidencePhoto: null,
  };
}

function appendFormDataValue(formData: FormData, key: string, value: unknown): void {
  if (value === null || value === undefined) return;
  if (value instanceof File || value instanceof Blob) {
    formData.append(key, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendFormDataValue(formData, `${key}[${index}]`, item));
    return;
  }
  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => {
      appendFormDataValue(formData, `${key}[${childKey}]`, childValue);
    });
    return;
  }
  if (typeof value === "boolean") {
    formData.append(key, value ? "1" : "0");
    return;
  }
  formData.append(key, String(value));
}

export default function NuevoIngresoPage() {
  usePageTitle("Nuevo ingreso | Danhei Express");
  const { user } = useAuth();
  const nextPackageKey = useRef(2);
  const idempotencyRef = useRef<{ key: string; fingerprint: string } | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [receiverOptions, setReceiverOptions] = useState<Receiver[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [clientId, setClientId] = useState("");
  const [mode] = useState<IntakeMode>("walk_in_at_hub");
  const [locationId, setLocationId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [deliveredByName, setDeliveredByName] = useState("");
  const [deliveredByPhone, setDeliveredByPhone] = useState("");
  const [deliveredByRelationship, setDeliveredByRelationship] = useState("");
  const [deliveredByNotes, setDeliveredByNotes] = useState("");
  const [receiverSearch, setReceiverSearch] = useState("");
  const [receivedByUserId, setReceivedByUserId] = useState("");
  const [receiverLookupLoading, setReceiverLookupLoading] = useState(false);
  const [receiverLookupMessage, setReceiverLookupMessage] = useState("");
  const [defaultShippingCost, setDefaultShippingCost] = useState("12500");
  const [defaultDriverFee, setDefaultDriverFee] = useState("0");
  const [nonCodPaymentType, setNonCodPaymentType] = useState<NonCodPaymentType>("post_sale");
  const [packages, setPackages] = useState<PackageDraft[]>([emptyPackage(1)]);
  const [submitting, setSubmitting] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [error, setError] = useState<ApiErrorPresentation | null>(null);
  const [created, setCreated] = useState<CreatedPickup["data"] | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      apiGet<PaginatedResponse<Client>>("/clients?per_page=100"),
      apiGet<{ data: Location[] }>("/service-locations"),
      apiGet<{ data: Receiver[] }>("/pickup-intakes/receivers"),
    ])
      .then(([clientResult, locationResult, receiverResult]) => {
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

        if (receiverResult.status === "fulfilled") {
          setReceiverOptions(receiverResult.value.data ?? []);
        } else {
          failures.push("empleados receptores");
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

  async function findReceiver() {
    const search = receiverSearch.trim();
    if (!search) {
      setReceivedByUserId("");
      setReceiverLookupMessage("");
      return;
    }

    setReceiverLookupLoading(true);
    setReceiverLookupMessage("");
    try {
      const response = await apiGet<{ data: Receiver[] }>(`/pickup-intakes/receivers?search=${encodeURIComponent(search)}`);
      const matches = response.data ?? [];
      setReceiverOptions(matches);
      if (matches.length === 1) {
        setReceivedByUserId(String(matches[0].id));
        setReceiverSearch(matches[0].phone || matches[0].name);
        setReceiverLookupMessage(`Receptor identificado: ${matches[0].name}.`);
      } else if (matches.length === 0) {
        setReceivedByUserId("");
        setReceiverLookupMessage("No encontramos un empleado habilitado. El ingreso quedará a nombre de la sesión actual.");
      } else {
        setReceivedByUserId("");
        setReceiverLookupMessage("Hay varias coincidencias; selecciona el receptor en la lista.");
      }
    } catch {
      setReceivedByUserId("");
      setReceiverLookupMessage("No se pudo consultar el empleado. El ingreso quedará a nombre de la sesión actual.");
    } finally {
      setReceiverLookupLoading(false);
    }
  }

  const selectedReceiver = receiverOptions.find((receiver) => String(receiver.id) === receivedByUserId) ?? null;

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
    setContactName("");
    setContactPhone("");
    setSpecialInstructions("");
    setDeliveredByName("");
    setDeliveredByPhone("");
    setDeliveredByRelationship("");
    setDeliveredByNotes("");
    setReceiverSearch("");
    setReceivedByUserId("");
    setReceiverLookupMessage("");
    setDefaultShippingCost("12500");
    setDefaultDriverFee("0");
    setNonCodPaymentType("post_sale");
    setPackages([emptyPackage(nextPackageKey.current)]);
    nextPackageKey.current += 1;
    idempotencyRef.current = null;
    setCreated(null);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreated(null);

    if (packages.some((item) => !item.recipientName.trim() || !item.recipientPhone.trim() || !item.deliveryAddress.trim())) {
      setError({
        message: "Completa destinatario, teléfono y dirección de todos los paquetes.",
        code: "client_validation_error",
        retryable: false,
      });
      return;
    }

    if (mode === "walk_in_at_hub" && packages.some((item) => item.receptionResult === "rejected" && !item.evidencePhoto)) {
      setError({
        message: "Cada paquete rechazado debe incluir una foto de evidencia.",
        code: "client_validation_error",
        retryable: false,
      });
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
      size_code: item.sizeCode,
      special_handling_notes: item.notes.trim() || null,
      ...(mode === "walk_in_at_hub"
        ? {
            reception_result: item.receptionResult,
            physical_condition: item.receptionResult === "rejected" ? "unknown" : "intact",
            exception_code: item.receptionResult === "rejected" ? "REJECTED_AT_HUB" : null,
            exception_notes: item.receptionResult === "rejected" ? item.exceptionNotes.trim() || null : null,
            evidence_photo: item.evidencePhoto,
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
    const payload = {
      ...commonPayload,
      received_by_user_id: receivedByUserId ? Number(receivedByUserId) : null,
      delivered_by_name: deliveredByName.trim() || null,
      delivered_by_phone: deliveredByPhone.trim() || null,
      delivered_by_relationship: deliveredByRelationship.trim() || null,
      delivered_by_notes: deliveredByNotes.trim() || null,
      default_shipping_cost: Number(defaultShippingCost) || 0,
      default_driver_fee: Number(defaultDriverFee) || 0,
      non_cod_payment_type: nonCodPaymentType,
    };

    const fingerprintPayload = {
      ...payload,
      packages: packagePayload.map((item) => ({
        ...item,
        evidence_photo: item.evidence_photo
          ? { name: item.evidence_photo.name, size: item.evidence_photo.size, type: item.evidence_photo.type, lastModified: item.evidence_photo.lastModified }
          : null,
      })),
    };
    const fingerprint = JSON.stringify(fingerprintPayload);
    if (!idempotencyRef.current || idempotencyRef.current.fingerprint !== fingerprint) {
      idempotencyRef.current = { key: crypto.randomUUID(), fingerprint };
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => appendFormDataValue(formData, key, value));
      const response = await apiFormData<CreatedPickup>(
        mode === "walk_in_at_hub" ? "/pickup-intakes/walk-in/complete" : "/pickup-intakes",
        "POST",
        formData,
        { "Idempotency-Key": idempotencyRef.current.key },
        { idempotent: true, retries: 1 },
      );
      setCreated(response.data);
      idempotencyRef.current = null;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(describeApiError(caught, "No fue posible registrar el ingreso."));
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
        description="Recibe paquetes directamente en una sede Danhei. El ingreso, la guía y la custodia quedan trazados en una sola operación."
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
                {created.intake_mode === "walk_in_at_hub"
                  ? "Los paquetes aceptados ya tienen guía, recepción y custodia en sede."
                  : "La solicitud quedó lista para revisión, materialización y asignación operativa."}
              </p>
              {created.packages?.length ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Guías generadas</p>
                  {created.packages.map((item) => {
                    const shipment = item.shipment;
                    const guide = item.guide_number || shipment?.display_code || "Pendiente";
                    return (
                      <div key={item.package_index} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">Paquete {item.package_index}: {guide}</span>
                        {shipment ? <PrintReceiptButton shipment={shipment} label="Imprimir guía" /> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
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
          title="1. Sede y cliente"
          description="El ingreso de esta pantalla siempre ocurre en una sede. La dirección seleccionada será la primera custodia del paquete."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Cliente">
              <select className={controlClass} required disabled={loadingLookups} value={clientId} onChange={(event) => setClientId(event.target.value)}>
                <option value="">Selecciona un cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}{client.company ? ` — ${client.company}` : ""}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Sede Danhei">
              <select className={controlClass} required disabled={loadingLookups || locations.length === 0} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">{locations.length === 0 && !loadingLookups ? "No hay sedes activas" : "Selecciona una sede"}</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name} — {location.address_line1}</option>
                ))}
              </select>
            </FormField>
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

        <OperationsCard title="2. Cliente y persona que entrega" description="El cliente es el responsable comercial del envío. El contacto identifica al remitente o a quien entrega el paquete en nombre del cliente.">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Contacto del cliente/remitente"><input className={controlClass} required value={contactName} onChange={(event) => setContactName(event.target.value)} /></FormField>
            <FormField label="Teléfono del cliente/remitente"><input className={controlClass} required type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></FormField>
            <FormField className="md:col-span-2" label="Instrucciones generales" hint="Información que aplica a todo el ingreso.">
              <textarea className={textareaClass} value={specialInstructions} onChange={(event) => setSpecialInstructions(event.target.value)} />
            </FormField>
          </div>
        </OperationsCard>

        <OperationsCard title="3. Trazabilidad de recepción" description="La sesión actual siempre queda como quien registra. Si otra persona recibe físicamente, búscala por teléfono o nombre para dejar ambas identidades.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Registrado por la sesión</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{user?.name || "Usuario autenticado"}</p>
              {user?.phone ? <p className="mt-1 text-slate-500 dark:text-slate-400">{user.phone}</p> : null}
            </div>
            <FormField label="Teléfono o nombre del receptor físico" hint="Opcional. Si queda vacío, se usa la sesión actual.">
              <div className="flex gap-2">
                <input className={`${controlClass} min-w-0`} value={receiverSearch} onChange={(event) => { setReceiverSearch(event.target.value); setReceivedByUserId(""); setReceiverLookupMessage(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void findReceiver(); } }} />
                <button type="button" disabled={receiverLookupLoading || !receiverSearch.trim()} onClick={() => void findReceiver()} className={secondaryButtonClass}>{receiverLookupLoading ? "Buscando…" : "Buscar"}</button>
              </div>
            </FormField>
            {receiverOptions.length > 0 ? (
              <FormField label="Empleado que recibe físicamente">
                <select className={controlClass} value={receivedByUserId} onChange={(event) => { setReceivedByUserId(event.target.value); const match = receiverOptions.find((receiver) => String(receiver.id) === event.target.value); if (match) setReceiverSearch(match.phone || match.name); }}>
                  <option value="">Usar la sesión actual</option>
                  {receiverOptions.map((receiver) => <option key={receiver.id} value={receiver.id}>{receiver.name}{receiver.phone ? ` — ${receiver.phone}` : ""}</option>)}
                </select>
              </FormField>
            ) : null}
            {selectedReceiver ? <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Receptor físico: {selectedReceiver.name}{selectedReceiver.phone ? ` · ${selectedReceiver.phone}` : ""}</p> : null}
            {receiverLookupMessage ? <p className="text-sm text-slate-600 dark:text-slate-300">{receiverLookupMessage}</p> : null}
          </div>
        </OperationsCard>

        {mode === "walk_in_at_hub" ? (
          <OperationsCard title="4. Recepción y cobro" description="Confirma la recepción en sede y define cómo se cobra el servicio cuando el paquete no es contraentrega.">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Tercero que trae el paquete" hint="Déjalo vacío si es la misma persona de contacto."><input className={controlClass} value={deliveredByName} onChange={(event) => setDeliveredByName(event.target.value)} /></FormField>
              <FormField label="Teléfono del tercero"><input className={controlClass} type="tel" value={deliveredByPhone} onChange={(event) => setDeliveredByPhone(event.target.value)} /></FormField>
              <FormField label="Relación con el cliente" hint="Ejemplo: titular, empleado, mensajero."><input className={controlClass} value={deliveredByRelationship} onChange={(event) => setDeliveredByRelationship(event.target.value)} /></FormField>
              <FormField label="Observación de custodia"><input className={controlClass} value={deliveredByNotes} onChange={(event) => setDeliveredByNotes(event.target.value)} /></FormField>
              <FormField label="Costo de envío por paquete"><input className={controlClass} min="0" step="1" type="number" value={defaultShippingCost} onChange={(event) => setDefaultShippingCost(event.target.value)} /></FormField>
              <FormField label="Pago al piloto por paquete" hint="Normalmente 0 al recibir en sede; la entrega se causará según la regla financiera."><input className={controlClass} min="0" step="1" type="number" value={defaultDriverFee} onChange={(event) => setDefaultDriverFee(event.target.value)} /></FormField>
              <FormField label="Modalidad para paquetes sin contraentrega" hint="La etiqueta visible es operativa; el código interno conserva el contrato financiero.">
                <select className={controlClass} value={nonCodPaymentType} onChange={(event) => setNonCodPaymentType(event.target.value as NonCodPaymentType)}>
                  <option value="post_sale">Cobro al cliente (post-venta)</option>
                  <option value="prepaid">Servicio ya pagado</option>
                  <option value="mercado_libre">Mercado Libre Flex</option>
                </select>
              </FormField>
            </div>
          </OperationsCard>
        ) : null}

        <OperationsCard
          title="5. Paquetes del ingreso"
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
                  <FormField label="Tamaño del paquete" hint="Por ahora solo se controla tamaño; el peso queda fuera del ingreso.">
                    <select className={controlClass} value={item.sizeCode} onChange={(event) => updatePackage(item.key, { sizeCode: event.target.value as PackageDraft["sizeCode"] })}>
                      <option value="small">Pequeño</option>
                      <option value="medium">Mediano</option>
                      <option value="large">Grande</option>
                    </select>
                  </FormField>
                  <FormField label="Valor contraentrega (COD)" hint="Usa 0 si no requiere recaudo."><input className={controlClass} min="0" step="1" type="number" value={item.codAmount} onChange={(event) => updatePackage(item.key, { codAmount: event.target.value })} /></FormField>
                  <FormField label="Resultado en mostrador">
                    <select
                      className={controlClass}
                      value={item.receptionResult}
                      onChange={(event) => {
                        const receptionResult = event.target.value as ReceptionResult;
                        updatePackage(item.key, {
                          receptionResult,
                          ...(receptionResult === "received" ? { exceptionNotes: "" } : {}),
                          ...(receptionResult === "received" ? { evidencePhoto: null } : {}),
                        });
                      }}
                    >
                      <option value="received">Aceptado y recibido</option>
                      <option value="rejected">Rechazado</option>
                    </select>
                  </FormField>
                  {mode === "walk_in_at_hub" && item.receptionResult === "rejected" ? (
                    <FormField className="md:col-span-2" label="Foto obligatoria de la novedad" hint="JPG, PNG o WEBP de máximo 5 MB.">
                      <input className="block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required onChange={(event) => updatePackage(item.key, { evidencePhoto: event.target.files?.[0] ?? null })} />
                      {item.evidencePhoto ? <p className="mt-1 text-xs text-slate-600">{item.evidencePhoto.name}</p> : null}
                    </FormField>
                  ) : null}
                  <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-[#2a2a3e] dark:text-slate-200">
                    <input type="checkbox" checked={item.fragile} onChange={(event) => updatePackage(item.key, { fragile: event.target.checked })} />
                    Paquete frágil
                  </label>
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
        {error ? (
          <div
            role="alert"
            aria-label="Error al registrar el ingreso"
            className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-950 shadow-sm dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600 dark:text-rose-300">
              {error.code === "operational_intake_unavailable"
                ? "Actualización del servidor pendiente"
                : "No se pudo registrar el ingreso"}
            </p>
            <p className="mt-2 text-sm leading-6 text-rose-800 dark:text-rose-200">{error.message}</p>
            {error.code === "operational_intake_unavailable" ? (
              <p className="mt-2 text-sm font-semibold leading-6 text-rose-800 dark:text-rose-200">
                El paquete no se registró. Completa el despliegue de la API y vuelve a intentarlo una sola vez.
              </p>
            ) : null}
            {typeof error.missingComponentsCount === "number" && error.missingComponentsCount > 0 ? (
              <p className="mt-2 text-xs text-rose-700 dark:text-rose-200">
                Componentes pendientes en la base de datos: {error.missingComponentsCount}.
              </p>
            ) : null}
            {error.deployment?.commit || error.deployment?.phase ? (
              <p className="mt-2 text-xs text-rose-700 dark:text-rose-200">
                Servidor: {error.deployment.status}
                {error.deployment.commit ? ` · versión ${error.deployment.commit.slice(0, 12)}` : ""}
                {error.deployment.phase ? ` · fase ${error.deployment.phase}` : ""}
              </p>
            ) : null}
            {error.reference ? (
              <p className="mt-3 text-xs font-semibold text-rose-700 dark:text-rose-200">
                Referencia para soporte:{" "}
                <code className="rounded bg-white/70 px-2 py-1 font-mono text-[11px] dark:bg-black/20">
                  {error.reference}
                </code>
              </p>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}
