"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  apiGet,
  apiFormData,
  describeApiError,
  type ApiErrorPresentation,
} from "@/lib/api";
import type { Client, PaginatedResponse, Zone } from "@/lib/types";
import { formatCOP } from "@/lib/utils";
import { usePageTitle } from "@/lib/page-title";
import { useToast } from "@/components/toast";
import { useAuth } from "@/lib/auth";
import {
  CollapsibleSection,
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
  deliveryZone: string;
  deliveryComplement: string;
  deliveryCity: string;
  codAmount: string;
  sizeCode: "small" | "medium" | "large";
  fragile: boolean;
  notes: string;
  receptionResult: ReceptionResult;
  exceptionNotes: string;
  evidencePhoto: File | null;
  detailsOpen: boolean;
};

const modes: Array<{
  value: IntakeMode;
  eyebrow: string;
  label: string;
  detail: string;
}> = [
  {
    value: "walk_in_at_hub",
    eyebrow: "Ya está en mostrador",
    label: "Recibir ahora",
    detail: "La persona llegó con los paquetes: guía, recepción y custodia en una sola operación.",
  },
  {
    value: "pickup_at_client_location",
    eyebrow: "Danhei recoge",
    label: "Recoger donde el cliente",
    detail: "Se crea la solicitud y después se asigna un piloto o empleado Danhei.",
  },
  {
    value: "planned_dropoff_at_hub",
    eyebrow: "El cliente avisa",
    label: "El cliente lleva a sede",
    detail: "Mostrador verá los paquetes esperados antes de recibirlos.",
  },
];

const nonCodPaymentLabels: Record<NonCodPaymentType, string> = {
  post_sale: "Cobro al cliente (post-venta)",
  prepaid: "Servicio ya pagado",
  mercado_libre: "Mercado Libre Flex",
};

function emptyPackage(key: number, template?: Pick<PackageDraft, "deliveryCity" | "sizeCode">): PackageDraft {
  return {
    key,
    recipientName: "",
    recipientPhone: "",
    deliveryAddress: "",
    deliveryZone: "",
    deliveryComplement: "",
    deliveryCity: template?.deliveryCity ?? "Bogotá",
    codAmount: "0",
    sizeCode: template?.sizeCode ?? "small",
    fragile: false,
    notes: "",
    receptionResult: "received",
    exceptionNotes: "",
    evidencePhoto: null,
    detailsOpen: false,
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
  const router = useRouter();
  const { showToast } = useToast();
  const nextPackageKey = useRef(2);
  const modeButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [lastAddedKey, setLastAddedKey] = useState<number | null>(null);
  const idempotencyRef = useRef<{ key: string; fingerprint: string } | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [receiverOptions, setReceiverOptions] = useState<Receiver[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [mode, setMode] = useState<IntakeMode>("walk_in_at_hub");
  const [clientId, setClientId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupComplement, setPickupComplement] = useState("");
  const [pickupCity, setPickupCity] = useState("Bogotá");
  const [plannedDropoffAt, setPlannedDropoffAt] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [senderCompany, setSenderCompany] = useState("");
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
  const [zones, setZones] = useState<Zone[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [error, setError] = useState<ApiErrorPresentation | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      apiGet<PaginatedResponse<Client>>("/clients?per_page=100"),
      apiGet<{ data: Location[] }>("/service-locations"),
      apiGet<{ data: Receiver[] }>("/pickup-intakes/receivers"),
      apiGet<Zone[]>("/zones?active=1"),
    ])
      .then(([clientResult, locationResult, receiverResult, zoneResult]) => {
        if (!active) return;
        const failures: string[] = [];

        if (clientResult.status === "fulfilled") {
          const nextClients = clientResult.value.data ?? [];
          setClients(nextClients);
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

        if (zoneResult.status === "fulfilled") {
          setZones(Array.isArray(zoneResult.value) ? zoneResult.value : []);
        }
        // Sin catalogo de zonas el formulario sigue operable: el selector
        // queda en «Sin zona definida» y no se bloquea ningun mostrador.

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
  const selectedClient = clients.find((client) => String(client.id) === clientId) ?? null;

  function handleClientSelection(nextClientId: string): void {
    setClientId(nextClientId);
    const nextClient = clients.find((client) => String(client.id) === nextClientId);
    setContactName(nextClient?.name || "");
    setContactPhone(nextClient?.phone || "");
    setContactEmail(nextClient?.email || "");
    setSenderCompany(nextClient?.company || "");
  }

  const isWalkIn = mode === "walk_in_at_hub";
  const isPickup = mode === "pickup_at_client_location";
  const isPlanned = mode === "planned_dropoff_at_hub";
  const requiresLocation = !isPickup;
  const selectedMode = modes.find((option) => option.value === mode) ?? modes[0];
  const missingLocation = requiresLocation && !loadingLookups && locations.length === 0;
  const totalCod = useMemo(
    () =>
      packages
        .filter((item) => !isWalkIn || item.receptionResult === "received")
        .reduce((total, item) => total + (Number(item.codAmount) || 0), 0),
    [isWalkIn, packages]
  );
  const acceptedPackages = useMemo(
    () => packages.filter((item) => !isWalkIn || item.receptionResult === "received").length,
    [isWalkIn, packages]
  );
  const hasNonCodPackages = useMemo(
    () => packages.some((item) => item.receptionResult === "received" && !(Number(item.codAmount) > 0)),
    [packages]
  );
  const totalShipping = (Number(defaultShippingCost) || 0) * acceptedPackages;

  function updatePackage(key: number, patch: Partial<PackageDraft>) {
    setPackages((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function handleModeSelection(nextMode: IntakeMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError(null);
    if (nextMode !== "walk_in_at_hub") {
      setPackages((current) =>
        current.map((item) =>
          item.receptionResult === "rejected"
            ? { ...item, receptionResult: "received", exceptionNotes: "", evidencePhoto: null }
            : item,
        ),
      );
    }
  }

  function addPackage() {
    const key = nextPackageKey.current;
    nextPackageKey.current += 1;
    setLastAddedKey(key);
    setPackages((current) => {
      const last = current[current.length - 1];
      return [...current, emptyPackage(key, last ? { deliveryCity: last.deliveryCity, sizeCode: last.sizeCode } : undefined)];
    });
  }

  function removePackage(key: number) {
    setPackages((current) => (current.length === 1 ? current : current.filter((item) => item.key !== key)));
  }

  function resetForm() {
    setClientId("");
    setPickupAddress("");
    setPickupComplement("");
    setPickupCity("Bogotá");
    setPlannedDropoffAt("");
    setContactName("");
    setContactPhone("");
    setContactEmail("");
    setSenderCompany("");
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
    setLastAddedKey(null);
    idempotencyRef.current = null;
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (packages.some((item) => !item.recipientName.trim() || !item.recipientPhone.trim() || !item.deliveryAddress.trim())) {
      setError({
        message: "Completa destinatario, teléfono y dirección de todos los paquetes.",
        code: "client_validation_error",
        retryable: false,
      });
      return;
    }

    if (isPickup && !pickupAddress.trim()) {
      setError({
        message: "Indica la dirección donde Danhei recogerá los paquetes.",
        code: "client_validation_error",
        retryable: false,
      });
      return;
    }

    if (isPlanned && !plannedDropoffAt) {
      setError({
        message: "Indica la fecha estimada en que el cliente llevará los paquetes a la sede.",
        code: "client_validation_error",
        retryable: false,
      });
      return;
    }

    if (isWalkIn && packages.some((item) => item.receptionResult === "rejected" && !item.evidencePhoto)) {
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
      // La zona alimenta el mapa del piloto y ancla la geocodificación al
      // sector correcto — por eso vive junto a la dirección y no plegada.
      delivery_zone: item.deliveryZone || null,
      delivery_address_complement: item.deliveryComplement.trim() || null,
      delivery_city: item.deliveryCity.trim() || "Bogotá",
      is_cod: Number(item.codAmount) > 0,
      requested_cod_amount: Number(item.codAmount) || 0,
      is_fragile: item.fragile,
      size_code: item.sizeCode,
      special_handling_notes: item.notes.trim() || null,
      ...(isWalkIn
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
      customer_id: clientId ? Number(clientId) : null,
      service_location_id: isPickup ? null : Number(locationId),
      contact_name: contactName.trim() || null,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
      sender_company: senderCompany.trim() || null,
      special_instructions: specialInstructions.trim() || null,
      packages: packagePayload,
    };
    const payload = isWalkIn
      ? {
          ...commonPayload,
          received_by_user_id: receivedByUserId ? Number(receivedByUserId) : null,
          delivered_by_name: deliveredByName.trim() || null,
          delivered_by_phone: deliveredByPhone.trim() || null,
          delivered_by_relationship: deliveredByRelationship.trim() || null,
          delivered_by_notes: deliveredByNotes.trim() || null,
          default_shipping_cost: Number(defaultShippingCost) || 0,
          default_driver_fee: Number(defaultDriverFee) || 0,
          non_cod_payment_type: nonCodPaymentType,
        }
      : {
          ...commonPayload,
          source: "admin",
          intake_mode: mode,
          pickup_address_line1: isPickup ? pickupAddress.trim() : null,
          pickup_address_complement: isPickup ? pickupComplement.trim() || null : null,
          pickup_city: isPickup ? pickupCity.trim() || "Bogotá" : null,
          planned_dropoff_at: isPlanned ? plannedDropoffAt : null,
        };

    const fingerprintPayload = {
      ...payload,
      packages: packagePayload.map((item) => ({
        ...item,
        evidence_photo:
          "evidence_photo" in item && item.evidence_photo
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
        isWalkIn ? "/pickup-intakes/walk-in/complete" : "/pickup-intakes",
        "POST",
        formData,
        { "Idempotency-Key": idempotencyRef.current.key },
        { idempotent: true, retries: 1 },
      );
      idempotencyRef.current = null;
      const data = response.data;
      const guides = (data.packages ?? [])
        .map((item) => item.guide_number || item.shipment?.display_code)
        .filter(Boolean);
      // Confirmar y salir: quedarse en el formulario con los datos puestos
      // hacia parecer que el registro no ocurrio (QA del 31/08). Las guias
      // recien creadas se ven e imprimen desde /pedidos.
      if (isWalkIn) {
        showToast(
          `Ingreso ${data.pickup_code} registrado: ${guides.length === 1 ? `guía ${guides[0]} creada` : `${guides.length} guías creadas`} con recepción y custodia.`,
          "success",
        );
        resetForm();
        router.push("/pedidos");
      } else {
        showToast(
          `Solicitud ${data.pickup_code} creada. Quedó en la bandeja de ingresos para revisión y asignación.`,
          "success",
        );
        resetForm();
        router.push("/recogidas");
      }
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
        description="Elige cómo ingresan los paquetes y registra lo esencial; todo lo demás tiene valores por defecto."
      />

      <form noValidate className="space-y-4" onSubmit={submit}>
        <OperationsCard title="¿Cómo ingresan los paquetes?">
          <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Vía de ingreso">
            {modes.map((option, optionIndex) => {
              const active = option.value === mode;
              return (
                <button
                  key={option.value}
                  ref={(node) => {
                    modeButtonRefs.current[optionIndex] = node;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => handleModeSelection(option.value)}
                  onKeyDown={(event) => {
                    let nextIndex: number | null = null;
                    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (optionIndex + 1) % modes.length;
                    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (optionIndex + modes.length - 1) % modes.length;
                    if (nextIndex === null) return;
                    event.preventDefault();
                    handleModeSelection(modes[nextIndex].value);
                    modeButtonRefs.current[nextIndex]?.focus();
                  }}
                  className={`rounded-xl border p-4 text-left transition ${
                    active
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-slate-200 hover:border-primary/40 dark:border-[#2a2a3e]"
                  }`}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{option.eyebrow}</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">{option.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{option.detail}</p>
                </button>
              );
            })}
          </div>
        </OperationsCard>

        <OperationsCard
          title={isPickup ? "Cliente y dirección de recogida" : isPlanned ? "Cliente, sede y fecha" : "Cliente y sede"}
          description="El cliente es el contacto de cobro: a él se le facturará el servicio."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Cliente (contacto de cobro)">
              <select className={controlClass} disabled={loadingLookups} value={clientId} onChange={(event) => handleClientSelection(event.target.value)}>
                <option value="">Sin cliente maestro — revisión pendiente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}{client.company ? ` — ${client.company}` : ""}</option>
                ))}
              </select>
            </FormField>
            {requiresLocation ? (
              <FormField label="Sede Danhei">
                <select className={controlClass} required disabled={loadingLookups || locations.length === 0} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                  <option value="">{locations.length === 0 && !loadingLookups ? "No hay sedes activas" : "Selecciona una sede"}</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>{location.name} — {location.address_line1}</option>
                  ))}
                </select>
              </FormField>
            ) : null}
            {isPlanned ? (
              <FormField label="Fecha estimada de entrega en sede">
                <input className={controlClass} required type="date" value={plannedDropoffAt} onChange={(event) => setPlannedDropoffAt(event.target.value)} />
              </FormField>
            ) : null}
            {isPickup ? (
              <>
                <FormField label="Dirección de recogida"><input className={controlClass} required value={pickupAddress} onChange={(event) => setPickupAddress(event.target.value)} /></FormField>
                <FormField label="Complemento"><input className={controlClass} value={pickupComplement} onChange={(event) => setPickupComplement(event.target.value)} /></FormField>
                <FormField label="Ciudad de recogida"><input className={controlClass} value={pickupCity} onChange={(event) => setPickupCity(event.target.value)} /></FormField>
              </>
            ) : null}
          </div>

          {selectedClient ? (
            <p className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              Se cobra a: {selectedClient.name}
              {selectedClient.company ? ` · ${selectedClient.company}` : ""}
              {selectedClient.phone ? ` · ${selectedClient.phone}` : ""}
            </p>
          ) : (
            <div className="mt-3">
              <InlineNotice tone="warning">
                Sin cliente maestro, la guía quedará en «Pendientes por identificar cliente» y el cobro no tendrá responsable hasta vincularla. Si conoces al remitente, registra sus datos abajo.
              </InlineNotice>
            </div>
          )}

          <div className="mt-4">
            <CollapsibleSection
              title="Contacto, remitente e instrucciones"
              hint={
                contactName || senderCompany
                  ? `${contactName || "Sin contacto"}${senderCompany ? ` · ${senderCompany}` : ""}${specialInstructions ? " · con instrucciones" : ""}`
                  : "Opcional. Se completa solo al elegir un cliente."
              }
              defaultOpen={false}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Contacto del cliente/remitente"><input className={controlClass} value={contactName} onChange={(event) => setContactName(event.target.value)} /></FormField>
                <FormField label="Teléfono del cliente/remitente"><input className={controlClass} type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></FormField>
                <FormField label="Empresa / razón social del remitente"><input className={controlClass} value={senderCompany} onChange={(event) => setSenderCompany(event.target.value)} /></FormField>
                <FormField label="Correo del contacto"><input className={controlClass} type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></FormField>
                <FormField className="md:col-span-2" label="Instrucciones generales" hint="Información que aplica a todo el ingreso.">
                  <textarea className={textareaClass} value={specialInstructions} onChange={(event) => setSpecialInstructions(event.target.value)} />
                </FormField>
              </div>
            </CollapsibleSection>
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

        <OperationsCard
          title="Paquetes"
          description="Destinatario, teléfono y dirección son lo único obligatorio. Cada paquete aceptado produce una guía."
          action={<button type="button" onClick={addPackage} className={secondaryButtonClass}>+ Agregar paquete</button>}
        >
          <div className="space-y-4">
            {packages.map((item, index) => {
              const rejected = isWalkIn && item.receptionResult === "rejected";
              return (
                <fieldset
                  key={item.key}
                  className={`rounded-xl border p-4 ${rejected ? "border-rose-300 dark:border-rose-500/40" : "border-slate-200 dark:border-[#2a2a3e]"}`}
                >
                  <legend className="px-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                    Paquete {index + 1}
                    {rejected ? <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">Rechazado</span> : null}
                  </legend>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Destinatario">
                      <input
                        className={controlClass}
                        required
                        autoFocus={item.key === lastAddedKey}
                        value={item.recipientName}
                        onChange={(event) => updatePackage(item.key, { recipientName: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Teléfono del destinatario"><input className={controlClass} required type="tel" value={item.recipientPhone} onChange={(event) => updatePackage(item.key, { recipientPhone: event.target.value })} /></FormField>
                    <FormField label="Dirección de entrega" hint={item.deliveryCity.trim() && item.deliveryCity.trim() !== "Bogotá" ? `Ciudad: ${item.deliveryCity.trim()}` : "Bogotá"}><input className={controlClass} required value={item.deliveryAddress} onChange={(event) => updatePackage(item.key, { deliveryAddress: event.target.value })} /></FormField>
                    <FormField label="Zona / sector" hint="Garantiza la ciudad y el sector del mapa; al elegirla, la ciudad se ajusta sola.">
                      <select
                        className={controlClass}
                        value={item.deliveryZone}
                        onChange={(event) => {
                          const zoneName = event.target.value;
                          const zone = zones.find((candidate) => candidate.name === zoneName);
                          // La zona manda sobre la ciudad: elegir «Suba» con la
                          // ciudad en otra parte dejaria la garantia rota.
                          updatePackage(item.key, {
                            deliveryZone: zoneName,
                            ...(zone ? { deliveryCity: zone.city?.trim() || "Bogotá" } : {}),
                          });
                        }}
                      >
                        <option value="">Sin zona definida</option>
                        {zones.map((zone) => (
                          <option key={zone.id} value={zone.name}>{zone.name}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Valor contraentrega (COD)" hint="Usa 0 si no requiere recaudo."><input className={controlClass} min="0" step="1" type="number" value={item.codAmount} onChange={(event) => updatePackage(item.key, { codAmount: event.target.value })} /></FormField>
                  </div>

                  {item.detailsOpen ? (
                    <div className="mt-4 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                      <FormField label="Complemento de dirección"><input className={controlClass} value={item.deliveryComplement} onChange={(event) => updatePackage(item.key, { deliveryComplement: event.target.value })} /></FormField>
                      <FormField label="Ciudad"><input className={controlClass} value={item.deliveryCity} onChange={(event) => updatePackage(item.key, { deliveryCity: event.target.value })} /></FormField>
                      <FormField label="Tamaño del paquete" hint="Por ahora solo se controla tamaño; el peso queda fuera del ingreso.">
                        <select className={controlClass} value={item.sizeCode} onChange={(event) => updatePackage(item.key, { sizeCode: event.target.value as PackageDraft["sizeCode"] })}>
                          <option value="small">Pequeño</option>
                          <option value="medium">Mediano</option>
                          <option value="large">Grande</option>
                        </select>
                      </FormField>
                      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-[#2a2a3e] dark:text-slate-200">
                        <input type="checkbox" checked={item.fragile} onChange={(event) => updatePackage(item.key, { fragile: event.target.checked })} />
                        Paquete frágil
                      </label>
                      <FormField className="md:col-span-2" label="Manejo especial">
                        <textarea className={textareaClass} value={item.notes} onChange={(event) => updatePackage(item.key, { notes: event.target.value })} />
                      </FormField>
                    </div>
                  ) : null}

                  {rejected ? (
                    <div className="mt-4 grid gap-4 rounded-lg border border-rose-200 bg-rose-50 p-4 md:grid-cols-2 dark:border-rose-500/30 dark:bg-rose-500/10">
                      <FormField className="md:col-span-2" label="Motivo del rechazo">
                        <textarea className={textareaClass} value={item.exceptionNotes} onChange={(event) => updatePackage(item.key, { exceptionNotes: event.target.value })} />
                      </FormField>
                      <FormField className="md:col-span-2" label="Foto obligatoria de la novedad" hint="JPG, PNG o WEBP de máximo 5 MB.">
                        <input className="block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required onChange={(event) => updatePackage(item.key, { evidencePhoto: event.target.files?.[0] ?? null })} />
                        {item.evidencePhoto ? <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{item.evidencePhoto.name}</p> : null}
                      </FormField>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold">
                    <button type="button" className="text-primary hover:underline" onClick={() => updatePackage(item.key, { detailsOpen: !item.detailsOpen })}>
                      {item.detailsOpen ? "Ocultar detalles" : "Más detalles (ciudad, tamaño, frágil…)"}
                    </button>
                    {isWalkIn ? (
                      item.receptionResult === "received" ? (
                        <button type="button" className="text-rose-600 hover:underline dark:text-rose-300" onClick={() => updatePackage(item.key, { receptionResult: "rejected" })}>
                          Marcar rechazo
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-emerald-700 hover:underline dark:text-emerald-300"
                          onClick={() => updatePackage(item.key, { receptionResult: "received", exceptionNotes: "", evidencePhoto: null })}
                        >
                          Volver a aceptado
                        </button>
                      )
                    ) : null}
                    <button type="button" disabled={packages.length === 1} onClick={() => removePackage(item.key)} className="text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-rose-300">
                      Quitar paquete
                    </button>
                  </div>
                </fieldset>
              );
            })}
          </div>
        </OperationsCard>

        {isWalkIn ? (
          <CollapsibleSection
            title="Cobro del servicio"
            hint={`Envío ${formatCOP(Number(defaultShippingCost) || 0)} por paquete · Piloto ${formatCOP(Number(defaultDriverFee) || 0)}${hasNonCodPackages ? ` · Sin COD: ${nonCodPaymentLabels[nonCodPaymentType]}` : ""}`}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Costo de envío por paquete"><input className={controlClass} min="0" step="1" type="number" value={defaultShippingCost} onChange={(event) => setDefaultShippingCost(event.target.value)} /></FormField>
              <FormField label="Pago al piloto por paquete" hint="Normalmente 0 al recibir en sede; la entrega se causará según la regla financiera."><input className={controlClass} min="0" step="1" type="number" value={defaultDriverFee} onChange={(event) => setDefaultDriverFee(event.target.value)} /></FormField>
              {hasNonCodPackages ? (
                <FormField label="Modalidad para paquetes sin contraentrega" hint="La etiqueta visible es operativa; el código interno conserva el contrato financiero.">
                  <select className={controlClass} value={nonCodPaymentType} onChange={(event) => setNonCodPaymentType(event.target.value as NonCodPaymentType)}>
                    {Object.entries(nonCodPaymentLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </FormField>
              ) : null}
            </div>
          </CollapsibleSection>
        ) : null}

        {isWalkIn ? (
          <CollapsibleSection
            title="¿Entrega o recibe otra persona?"
            hint={
              deliveredByName || selectedReceiver
                ? `${deliveredByName ? `Entrega: ${deliveredByName}` : ""}${deliveredByName && selectedReceiver ? " · " : ""}${selectedReceiver ? `Recibe: ${selectedReceiver.name}` : ""}`
                : `Opcional. Por defecto el ingreso queda a nombre de ${user?.name || "la sesión actual"}.`
            }
          >
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tercero que trae los paquetes</p>
                <div className="mt-2 grid gap-4 md:grid-cols-2">
                  <FormField label="Nombre del tercero" hint="Déjalo vacío si es la misma persona de contacto."><input className={controlClass} value={deliveredByName} onChange={(event) => setDeliveredByName(event.target.value)} /></FormField>
                  <FormField label="Teléfono del tercero"><input className={controlClass} type="tel" value={deliveredByPhone} onChange={(event) => setDeliveredByPhone(event.target.value)} /></FormField>
                  <FormField label="Relación con el cliente" hint="Ejemplo: titular, empleado, mensajero."><input className={controlClass} value={deliveredByRelationship} onChange={(event) => setDeliveredByRelationship(event.target.value)} /></FormField>
                  <FormField label="Observación de custodia"><input className={controlClass} value={deliveredByNotes} onChange={(event) => setDeliveredByNotes(event.target.value)} /></FormField>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Empleado que recibe físicamente</p>
                <div className="mt-2 grid gap-4 md:grid-cols-2">
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
              </div>
            </div>
          </CollapsibleSection>
        ) : null}

        <OperationsCard className="sticky bottom-3 z-10 border-primary/30 shadow-lg">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className={`grid gap-3 ${isWalkIn ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
              <div><p className="text-xs text-slate-500">Vía</p><p className="mt-1 text-sm font-bold">{selectedMode.eyebrow}</p></div>
              <div>
                <p className="text-xs text-slate-500">Paquetes</p>
                <p className="mt-1 text-sm font-bold">{isWalkIn ? `${acceptedPackages}/${packages.length} aceptados` : packages.length}</p>
              </div>
              {isWalkIn ? (
                <div><p className="text-xs text-slate-500">Cobro de envío</p><p className="mt-1 text-sm font-bold">{formatCOP(totalShipping)}</p></div>
              ) : null}
              <div><p className="text-xs text-slate-500">COD esperado</p><p className="mt-1 text-sm font-bold">{formatCOP(totalCod)}</p></div>
            </div>
            <button disabled={submitting || loadingLookups || (requiresLocation && !locationId)} className={`${primaryButtonClass} w-full lg:min-w-52`} type="submit">
              {submitting ? "Registrando…" : isWalkIn ? "Registrar y recibir" : "Crear ingreso"}
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
