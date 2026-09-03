"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  apiGet,
  apiPost,
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
  Button,
  Card,
  Input,
  CurrencyInput,
  HelpTip,
  Select,
  Textarea,
  Stepper,
  StatusBadge,
  cx,
} from "@/components/ui";
import {
  CollapsibleSection,
  InlineNotice,
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

type ZoneScope = "bogota" | "alrededores";

function isBogotaCity(city?: string | null): boolean {
  if (!city) return true;
  const normalized = city.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized === "bogota" || normalized === "bogota d.c." || normalized === "bogota dc";
}

type PackagePaymentType = "cash_on_delivery" | "post_sale" | "prepaid" | "mercado_libre";

const packagePaymentOptions: Array<{ value: PackagePaymentType; label: string }> = [
  { value: "cash_on_delivery", label: "Contra entrega" },
  { value: "post_sale", label: "Cobro post entrega" },
  { value: "prepaid", label: "Prepago" },
  { value: "mercado_libre", label: "Mercado Libre" },
];

const packagePaymentLabels: Record<PackagePaymentType, string> = {
  cash_on_delivery: "Contra entrega",
  post_sale: "Cobro post entrega",
  prepaid: "Prepago",
  mercado_libre: "Mercado Libre",
};

type PackageDraft = {
  key: number;
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  deliveryScope: ZoneScope;
  deliveryZone: string;
  deliveryComplement: string;
  deliveryCity: string;
  paymentType: PackagePaymentType;
  codAmount: string;
  sizeCode: "small" | "medium" | "large";
  fragile: boolean;
  notes: string;
  receptionResult: ReceptionResult;
  exceptionNotes: string;
  evidencePhoto: File | null;
  detailsOpen: boolean;
  detectedZone?: string | null;
  isDetectingZone?: boolean;
  detectionMessage?: string | null;
  userSelectedZone?: boolean;
};

const modes: Array<{
  value: IntakeMode;
  eyebrow: string;
  label: string;
  detail: string;
}> = [
  {
    value: "walk_in_at_hub",
    eyebrow: "Mostrador",
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

const STEP_LABELS = ["Datos", "Ingreso", "Destino", "Confirmar"];

function emptyPackage(
  key: number,
  template?: Pick<PackageDraft, "deliveryCity" | "sizeCode" | "paymentType"> & { deliveryScope?: ZoneScope }
): PackageDraft {
  return {
    key,
    recipientName: "",
    recipientPhone: "",
    deliveryAddress: "",
    deliveryScope: template?.deliveryScope ?? "bogota",
    deliveryZone: "",
    deliveryComplement: "",
    deliveryCity: template?.deliveryCity ?? "Bogotá",
    paymentType: template?.paymentType ?? "cash_on_delivery",
    codAmount: "0",
    sizeCode: template?.sizeCode ?? "small",
    fragile: false,
    notes: "",
    receptionResult: "received",
    exceptionNotes: "",
    evidencePhoto: null,
    detailsOpen: false,
    detectedZone: null,
    isDetectingZone: false,
    detectionMessage: null,
    userSelectedZone: false,
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

  // Flow Step State (0: Datos, 1: Destino, 2: Servicio, 3: Confirmar)
  const [currentStep, setCurrentStep] = useState(0);

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
  // Tarifas de serie (QA 2026-09-02): envío $10.000 y pago al piloto $7.000
  // por paquete; el operador puede ajustarlas por ingreso.
  const [defaultShippingCost, setDefaultShippingCost] = useState("10000");
  const [defaultDriverFee, setDefaultDriverFee] = useState("7000");
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
  const selectedLocation = locations.find((loc) => String(loc.id) === locationId) ?? null;

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
        .filter((item) => (!isWalkIn || item.receptionResult === "received") && item.paymentType === "cash_on_delivery")
        .reduce((total, item) => total + (Number(item.codAmount) || 0), 0),
    [isWalkIn, packages]
  );
  const acceptedPackages = useMemo(
    () => packages.filter((item) => !isWalkIn || item.receptionResult === "received").length,
    [isWalkIn, packages]
  );
  const totalShipping = (Number(defaultShippingCost) || 0) * acceptedPackages;

  function updatePackage(key: number, patch: Partial<PackageDraft>) {
    setPackages((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function detectPackageLocation(itemKey: number, addressCandidate?: string) {
    const target = packages.find((p) => p.key === itemKey);
    if (!target) return;
    const address = (addressCandidate ?? target.deliveryAddress).trim();
    if (address.length < 5) return;
    if (target.userSelectedZone) return; // Si el operario ya eligió zona manualmente, no sobreescribir
    if (target.deliveryScope !== "bogota") return; // Si es fuera de Bogotá, no forzar localidad

    updatePackage(itemKey, { isDetectingZone: true, detectionMessage: null });
    try {
      const response = await apiPost<{
        detected_zone: string | null;
        locality: string | null;
        neighborhood: string | null;
        is_real: boolean;
        reason: string | null;
      }>("/shipments/detect-location", {
        address,
        city: "Bogotá",
      });

      if (response.detected_zone) {
        updatePackage(itemKey, {
          deliveryZone: response.detected_zone,
          detectedZone: response.detected_zone,
          detectionMessage: `Localidad detectada: ${response.detected_zone}${response.neighborhood ? ` (${response.neighborhood})` : ""}`,
          isDetectingZone: false,
        });
      } else {
        updatePackage(itemKey, {
          detectedZone: null,
          detectionMessage: response.reason || null,
          isDetectingZone: false,
        });
      }
    } catch {
      updatePackage(itemKey, {
        isDetectingZone: false,
      });
    }
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
      return [
        ...current,
        emptyPackage(key, last ? { deliveryCity: last.deliveryCity, sizeCode: last.sizeCode, deliveryScope: last.deliveryScope, paymentType: last.paymentType } : undefined),
      ];
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
    setDefaultShippingCost("10000");
    setDefaultDriverFee("7000");
    setPackages([emptyPackage(nextPackageKey.current)]);
    nextPackageKey.current += 1;
    setLastAddedKey(null);
    idempotencyRef.current = null;
    setError(null);
    setCurrentStep(0);
  }

  function validateStep(stepIndex: number): boolean {
    setError(null);

    // Step 0: Datos -> Siempre válido (cliente e instrucciones son opcionales)
    if (stepIndex === 0) {
      return true;
    }

    // Step 1: Ingreso (Sede de recepción o punto de recogida)
    if (stepIndex === 1) {
      if (requiresLocation && !locationId) {
        setError({
          message: "Selecciona la sede Danhei donde ingresan los paquetes.",
          code: "client_validation_error",
          retryable: false,
        });
        return false;
      }
      if (isPickup && !pickupAddress.trim()) {
        setError({
          message: "Indica la dirección donde Danhei recogerá los paquetes.",
          code: "client_validation_error",
          retryable: false,
        });
        return false;
      }
      if (isPlanned && !plannedDropoffAt) {
        setError({
          message: "Indica la fecha estimada en que el cliente llevará los paquetes a la sede.",
          code: "client_validation_error",
          retryable: false,
        });
        return false;
      }
      return true;
    }

    // Step 2: Destino (Paquetes y datos del destinatario)
    if (stepIndex === 2) {
      if (packages.some((item) => !item.recipientName.trim() || !item.recipientPhone.trim() || !item.deliveryAddress.trim())) {
        setError({
          message: "Completa destinatario, teléfono y dirección de todos los paquetes.",
          code: "client_validation_error",
          retryable: false,
        });
        return false;
      }
      if (isWalkIn && packages.some((item) => item.receptionResult === "rejected" && !item.evidencePhoto)) {
        setError({
          message: "Cada paquete rechazado debe incluir una foto de evidencia.",
          code: "client_validation_error",
          retryable: false,
        });
        return false;
      }
      return true;
    }

    return true;
  }

  function handleNextStep() {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(STEP_LABELS.length - 1, prev + 1));
    }
  }

  function handlePrevStep() {
    setError(null);
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Solo se procesa el envío a la API cuando estamos en el paso final (Confirmar)
    if (currentStep !== STEP_LABELS.length - 1) {
      return;
    }

    // Re-validar todos los pasos por seguridad
    if (!validateStep(1) || !validateStep(2)) {
      return;
    }

    const packagePayload = packages.map((item) => ({
      recipient_name: item.recipientName.trim(),
      recipient_phone: item.recipientPhone.trim(),
      delivery_address_line1: item.deliveryAddress.trim(),
      delivery_zone: item.deliveryZone || null,
      delivery_address_complement: item.deliveryComplement.trim() || null,
      delivery_city: item.deliveryCity.trim() || "Bogotá",
      payment_type: item.paymentType,
      is_cod: item.paymentType === "cash_on_delivery",
      requested_cod_amount: item.paymentType === "cash_on_delivery" ? Number(item.codAmount) || 0 : 0,
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
    <div className="animate-fade-in space-y-6">
      {/* Encabezado compacto (QA 2026-09-02): tarjeta propia de una sola fila
          —estilo KPI— con el título en letra de título y la explicación
          detrás del símbolo de ayuda. */}
      <Card className="!py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href="/recogidas"
            className="shrink-0 text-sm font-semibold text-brand transition-colors duration-150 hover:text-brand-hover"
          >
            ← Ingresos
          </Link>
          <span aria-hidden="true" className="hidden h-5 w-px bg-edge sm:block" />
          <h2 className="min-w-0 truncate font-display text-xl font-bold text-ink md:text-2xl">
            Nuevo ingreso
          </h2>
          <HelpTip
            topic="Nuevo ingreso"
            text="Entrada única: elige cómo ingresan los paquetes y completa la información en 4 sencillos pasos."
          />
        </div>
      </Card>

      {/* Stepper superior */}
      <Card>
        <Stepper steps={STEP_LABELS} current={currentStep} />
      </Card>

      <form noValidate className="space-y-6" onSubmit={submit}>
        {/* PASO 0: DATOS DE INGRESO Y CLIENTE */}
        {currentStep === 0 && (
          <div className="space-y-6 animate-fade-in">
            <Card
              title="¿Cómo ingresan los paquetes?"
              headerAction={<HelpTip topic="Vías de ingreso" text="Selecciona cómo ingresa el paquete: Mostrador (ingreso directo en sede), Recogida (Danhei recoge en cliente) o Avisado (entrega programada en sede)." />}
            >
              <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Vía de ingreso">
                {modes.map((option, optionIndex) => {
                  const active = option.value === mode;
                  return (
                    <div
                      key={option.value}
                      className={cx(
                        "flex items-center justify-between rounded-card border px-4 py-3 transition-all duration-150",
                        active
                          ? "border-brand bg-brand-soft/50 ring-2 ring-brand/20"
                          : "border-edge bg-surface hover:border-brand/40"
                      )}
                    >
                      <button
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
                        className="flex-1 text-left"
                      >
                        <p className="text-sm font-bold text-ink">{option.eyebrow}</p>
                      </button>
                      <HelpTip topic={option.eyebrow} text={option.detail} />
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card
              title="Cliente (Contacto de cobro)"
              headerAction={
                selectedClient ? (
                  <StatusBadge label="Cliente seleccionado" tone="success" />
                ) : (
                  <StatusBadge label="Sin cliente maestro" tone="warning" />
                )
              }
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <label htmlFor="client_id_select" className="text-sm font-medium text-ink">Cliente maestro</label>
                    <HelpTip topic="Cliente maestro" text="El cliente a quien se le facturará el servicio de envío." />
                  </div>
                  <Select
                    id="client_id_select"
                    disabled={loadingLookups}
                    value={clientId}
                    onChange={(event) => handleClientSelection(event.target.value)}
                  >
                    <option value="">Sin cliente maestro — revisión pendiente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                        {client.company ? ` — ${client.company}` : ""}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {selectedClient ? (
                <p className="mt-3 text-sm font-semibold text-emerald-700">
                  Se cobra a: {selectedClient.name}
                  {selectedClient.company ? ` · ${selectedClient.company}` : ""}
                  {selectedClient.phone ? ` · ${selectedClient.phone}` : ""}
                </p>
              ) : (
                <div className="mt-3">
                  <InlineNotice tone="warning">
                    Sin cliente maestro, la guía quedará en «Pendientes por identificar cliente». Registra los datos de contacto si los conoces.
                  </InlineNotice>
                </div>
              )}

              <div className="mt-4">
                <CollapsibleSection
                  title="Contacto, remitente e instrucciones generales"
                  hint={
                    contactName || senderCompany
                      ? `${contactName || "Sin contacto"}${senderCompany ? ` · ${senderCompany}` : ""}${specialInstructions ? " · con instrucciones" : ""}`
                      : "Opcional. Se completa al elegir un cliente o manualmente."
                  }
                  defaultOpen={Boolean(contactName || senderCompany || specialInstructions)}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      label="Contacto del cliente / remitente"
                      value={contactName}
                      onChange={(event) => setContactName(event.target.value)}
                    />
                    <Input
                      label="Teléfono del cliente / remitente"
                      type="tel"
                      value={contactPhone}
                      onChange={(event) => setContactPhone(event.target.value)}
                    />
                    <Input
                      label="Empresa / razón social del remitente"
                      value={senderCompany}
                      onChange={(event) => setSenderCompany(event.target.value)}
                    />
                    <Input
                      label="Correo del contacto"
                      type="email"
                      value={contactEmail}
                      onChange={(event) => setContactEmail(event.target.value)}
                    />
                    <div className="md:col-span-2">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <label htmlFor="special_instructions_input" className="text-sm font-medium text-ink">Instrucciones generales</label>
                        <HelpTip topic="Instrucciones generales" text="Información relevante que aplica a todo este ingreso." />
                      </div>
                      <Textarea
                        id="special_instructions_input"
                        value={specialInstructions}
                        onChange={(event) => setSpecialInstructions(event.target.value)}
                      />
                    </div>
                  </div>
                </CollapsibleSection>
              </div>
            </Card>
          </div>
        )}

        {/* PASO 1: INGRESO Y UBICACIÓN */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-fade-in">
            <Card title={isPickup ? "Dirección de recogida" : isPlanned ? "Sede Danhei de ingreso y fecha esperada" : "Sede Danhei de ingreso"}>
              <div className="grid gap-4 md:grid-cols-2">
                {requiresLocation ? (
                  <Select
                    label="Sede Danhei"
                    required
                    disabled={loadingLookups || locations.length === 0}
                    value={locationId}
                    onChange={(event) => setLocationId(event.target.value)}
                  >
                    <option value="">{locations.length === 0 && !loadingLookups ? "No hay sedes activas" : "Selecciona una sede"}</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name} — {location.address_line1}
                      </option>
                    ))}
                  </Select>
                ) : null}

                {isPlanned ? (
                  <Input
                    label="Fecha estimada de entrega en sede"
                    required
                    type="date"
                    value={plannedDropoffAt}
                    onChange={(event) => setPlannedDropoffAt(event.target.value)}
                  />
                ) : null}

                {isPickup ? (
                  <>
                    <Input
                      label="Dirección de recogida"
                      required
                      value={pickupAddress}
                      onChange={(event) => setPickupAddress(event.target.value)}
                    />
                    <Input
                      label="Complemento"
                      hint="Apto, oficina, torre, etc."
                      value={pickupComplement}
                      onChange={(event) => setPickupComplement(event.target.value)}
                    />
                    <Input
                      label="Ciudad de recogida"
                      value={pickupCity}
                      onChange={(event) => setPickupCity(event.target.value)}
                    />
                  </>
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
            </Card>
          </div>
        )}

        {/* PASO 2: DESTINO Y PAQUETES */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-fade-in">
            <Card
              title="Paquetes y Destino de Entrega"
              headerAction={
                <Button variant="secondary" size="sm" onClick={addPackage}>
                  + Agregar paquete
                </Button>
              }
            >
              <div className="space-y-4">
                {packages.map((item, index) => {
                  const rejected = isWalkIn && item.receptionResult === "rejected";
                  return (
                    <fieldset
                      key={item.key}
                      className={cx(
                        "rounded-card border p-4 transition-all duration-150",
                        rejected ? "border-danger/40 bg-danger/5" : "border-edge bg-surface"
                      )}
                    >
                      <legend className="px-2 text-sm font-bold text-ink">
                        Paquete {index + 1}
                        {rejected ? (
                          <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-bold text-danger">
                            Rechazado
                          </span>
                        ) : null}
                      </legend>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          label="Nombre del destinatario"
                          required
                          autoFocus={item.key === lastAddedKey}
                          value={item.recipientName}
                          onChange={(event) => updatePackage(item.key, { recipientName: event.target.value })}
                        />
                        <Input
                          label="Teléfono del destinatario"
                          required
                          type="tel"
                          value={item.recipientPhone}
                          onChange={(event) => updatePackage(item.key, { recipientPhone: event.target.value })}
                        />
                        <Input
                          label="Dirección de entrega"
                          required
                          hint={
                            item.detectionMessage
                              ? item.detectionMessage
                              : item.deliveryCity.trim() && item.deliveryCity.trim() !== "Bogotá"
                                ? `Ciudad: ${item.deliveryCity.trim()}`
                                : "Bogotá — Escribe la dirección y se detectará la localidad"
                          }
                          value={item.deliveryAddress}
                          onChange={(event) =>
                            updatePackage(item.key, {
                              deliveryAddress: event.target.value,
                              ...(item.userSelectedZone ? {} : { detectedZone: null, detectionMessage: null }),
                            })
                          }
                          onBlur={() => void detectPackageLocation(item.key)}
                        />
                        <Select
                          label="Tipo de paquete"
                          value={item.paymentType}
                          onChange={(event) => {
                            const nextType = event.target.value as PackagePaymentType;
                            updatePackage(item.key, {
                              paymentType: nextType,
                              ...(nextType !== "cash_on_delivery" ? { codAmount: "0" } : {}),
                            });
                          }}
                        >
                          {packagePaymentOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>

                        {item.paymentType === "cash_on_delivery" ? (
                          <div className="md:col-span-2">
                            <div className="mb-1.5 flex items-center gap-1.5">
                              <label htmlFor={`cod_amount_${item.key}`} className="text-sm font-medium text-ink">Cobro contraentrega</label>
                              <HelpTip topic="Cobro contraentrega" text="Usa $0 o déjalo vacío si el monto está pendiente por definir." />
                            </div>
                            <CurrencyInput
                              id={`cod_amount_${item.key}`}
                              min={0}
                              value={Number(item.codAmount) || 0}
                              onValueChange={(val) => updatePackage(item.key, { codAmount: String(val) })}
                            />
                          </div>
                        ) : null}

                        <div className="md:col-span-2">
                          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-ink">Zona / sector</span>
                              <HelpTip topic="Zona / sector" text="Al elegirla, la ciudad se ajusta automáticamente." />
                            </div>
                            <div className="flex items-center gap-2">
                              {item.isDetectingZone ? (
                                <span className="text-xs text-brand animate-pulse">Detectando localidad...</span>
                              ) : item.detectedZone ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                  ✨ Localidad detectada: {item.detectedZone}
                                </span>
                              ) : null}
                              {item.deliveryScope === "bogota" && item.deliveryAddress.trim().length >= 5 ? (
                                <button
                                  type="button"
                                  onClick={() => void detectPackageLocation(item.key)}
                                  className="text-xs font-semibold text-brand hover:underline"
                                >
                                  Detectar
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label htmlFor={`delivery_scope_${item.key}`} className="mb-1 block text-xs font-semibold text-ink-secondary">
                                Ámbito
                              </label>
                              <Select
                                id={`delivery_scope_${item.key}`}
                                value={item.deliveryScope}
                                onChange={(event) => {
                                  const nextScope = event.target.value as ZoneScope;
                                  updatePackage(item.key, {
                                    deliveryScope: nextScope,
                                    deliveryZone: "",
                                    userSelectedZone: false,
                                    detectedZone: null,
                                    detectionMessage: null,
                                    ...(nextScope === "bogota" ? { deliveryCity: "Bogotá" } : {}),
                                  });
                                }}
                              >
                                <option value="bogota">Bogotá</option>
                                <option value="alrededores">Alrededores</option>
                              </Select>
                            </div>
                            <div>
                              <label htmlFor={`delivery_zone_${item.key}`} className="mb-1 block text-xs font-semibold text-ink-secondary">
                                Zona
                              </label>
                              <Select
                                id={`delivery_zone_${item.key}`}
                                value={item.deliveryZone}
                                onChange={(event) => {
                                  const zoneName = event.target.value;
                                  const zone = zones.find((candidate) => candidate.name === zoneName);
                                  updatePackage(item.key, {
                                    deliveryZone: zoneName,
                                    userSelectedZone: true,
                                    detectedZone: null,
                                    ...(zone ? { deliveryCity: zone.city?.trim() || (item.deliveryScope === "alrededores" ? "Alrededores" : "Bogotá") } : {}),
                                  });
                                }}
                              >
                                <option value="">Pendiente por zona — se asigna luego</option>
                                {zones
                                  .filter((candidate) =>
                                    item.deliveryScope === "alrededores"
                                      ? !isBogotaCity(candidate.city)
                                      : isBogotaCity(candidate.city)
                                  )
                                  .map((zone) => (
                                    <option key={zone.id} value={zone.name}>
                                      {item.deliveryScope === "alrededores"
                                        ? `${zone.name} — ${zone.city || "Alrededores"}`
                                        : zone.name}
                                    </option>
                                  ))}
                              </Select>
                            </div>
                          </div>
                        </div>
                      </div>

                      {item.detailsOpen ? (
                        <div className="mt-4 grid gap-4 rounded-card border border-edge bg-app-secondary p-4 md:grid-cols-2">
                          <Input
                            label="Complemento de dirección"
                            value={item.deliveryComplement}
                            onChange={(event) => updatePackage(item.key, { deliveryComplement: event.target.value })}
                          />
                          <div>
                            <div className="mb-1.5 flex items-center gap-1.5">
                              <label htmlFor={`delivery_city_${item.key}`} className="text-sm font-medium text-ink">Ciudad</label>
                              <HelpTip topic="Ciudad" text="La decide la zona elegida." />
                            </div>
                            <Input
                              id={`delivery_city_${item.key}`}
                              value={item.deliveryCity}
                              readOnly
                              disabled
                            />
                          </div>
                          <Select
                            label="Tamaño del paquete"
                            value={item.sizeCode}
                            onChange={(event) => updatePackage(item.key, { sizeCode: event.target.value as PackageDraft["sizeCode"] })}
                          >
                            <option value="small">Pequeño</option>
                            <option value="medium">Mediano</option>
                            <option value="large">Grande</option>
                          </Select>
                          <label className="flex min-h-11 items-center gap-3 rounded-input border border-edge px-3 text-sm font-semibold text-ink">
                            <input
                              type="checkbox"
                              checked={item.fragile}
                              onChange={(event) => updatePackage(item.key, { fragile: event.target.checked })}
                            />
                            Paquete frágil
                          </label>
                          <Textarea
                            wrapperClassName="md:col-span-2"
                            label="Manejo especial"
                            value={item.notes}
                            onChange={(event) => updatePackage(item.key, { notes: event.target.value })}
                          />
                        </div>
                      ) : null}

                      {rejected ? (
                        <div className="mt-4 grid gap-4 rounded-card border border-danger/30 bg-danger/10 p-4 md:grid-cols-2">
                          <Textarea
                            wrapperClassName="md:col-span-2"
                            label="Motivo del rechazo"
                            value={item.exceptionNotes}
                            onChange={(event) => updatePackage(item.key, { exceptionNotes: event.target.value })}
                          />
                          <div className="md:col-span-2">
                            <label className="mb-1.5 block text-sm font-semibold text-ink">
                              Foto obligatoria de evidencia *
                            </label>
                            <input
                              className="block w-full text-sm text-ink"
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              capture="environment"
                              required
                              onChange={(event) => updatePackage(item.key, { evidencePhoto: event.target.files?.[0] ?? null })}
                            />
                            {item.evidencePhoto ? (
                              <p className="mt-1 text-xs text-ink-secondary">{item.evidencePhoto.name}</p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold">
                        <button
                          type="button"
                          className="text-brand hover:underline"
                          onClick={() => updatePackage(item.key, { detailsOpen: !item.detailsOpen })}
                        >
                          {item.detailsOpen ? "Ocultar detalles" : "Más detalles (ciudad, tamaño, frágil…)"}
                        </button>
                        {isWalkIn ? (
                          item.receptionResult === "received" ? (
                            <button
                              type="button"
                              className="text-danger hover:underline"
                              onClick={() => updatePackage(item.key, { receptionResult: "rejected" })}
                            >
                              Marcar rechazo
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-success hover:underline"
                              onClick={() => updatePackage(item.key, { receptionResult: "received", exceptionNotes: "", evidencePhoto: null })}
                            >
                              Volver a aceptado
                            </button>
                          )
                        ) : null}
                        <button
                          type="button"
                          disabled={packages.length === 1}
                          onClick={() => removePackage(item.key)}
                          className="text-danger disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Quitar paquete
                        </button>
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </Card>

            {isWalkIn ? (
              <CollapsibleSection
                title="Cobro del servicio"
                hint={`Envío ${formatCOP(Number(defaultShippingCost) || 0)} por paquete · Piloto ${formatCOP(Number(defaultDriverFee) || 0)}`}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <CurrencyInput
                    label="Costo de envío por paquete"
                    min={0}
                    value={Number(defaultShippingCost) || 0}
                    onValueChange={(val) => setDefaultShippingCost(String(val))}
                  />
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <label htmlFor="default_driver_fee_input" className="text-sm font-medium text-ink">Pago al piloto por paquete</label>
                      <HelpTip topic="Pago al piloto" text="Normalmente 0 al recibir en sede." />
                    </div>
                    <CurrencyInput
                      id="default_driver_fee_input"
                      min={0}
                      value={Number(defaultDriverFee) || 0}
                      onValueChange={(val) => setDefaultDriverFee(String(val))}
                    />
                  </div>
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
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-secondary">Tercero que trae los paquetes</p>
                    <div className="mt-2 grid gap-4 md:grid-cols-2">
                      <div>
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <label htmlFor="delivered_by_name_input" className="text-sm font-medium text-ink">Nombre del tercero</label>
                          <HelpTip topic="Nombre del tercero" text="Déjalo vacío si es el remitente." />
                        </div>
                        <Input
                          id="delivered_by_name_input"
                          value={deliveredByName}
                          onChange={(event) => setDeliveredByName(event.target.value)}
                        />
                      </div>
                      <Input
                        label="Teléfono del tercero"
                        type="tel"
                        value={deliveredByPhone}
                        onChange={(event) => setDeliveredByPhone(event.target.value)}
                      />
                      <div>
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <label htmlFor="delivered_by_relationship_input" className="text-sm font-medium text-ink">Relación con el cliente</label>
                          <HelpTip topic="Relación con el cliente" text="Ej: titular, mensajero, familiar." />
                        </div>
                        <Input
                          id="delivered_by_relationship_input"
                          value={deliveredByRelationship}
                          onChange={(event) => setDeliveredByRelationship(event.target.value)}
                        />
                      </div>
                      <Input
                        label="Observación de custodia"
                        value={deliveredByNotes}
                        onChange={(event) => setDeliveredByNotes(event.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-secondary">Empleado que recibe físicamente</p>
                    <div className="mt-2 grid gap-4 md:grid-cols-2">
                      <div className="rounded-card border border-edge bg-app-secondary p-4 text-sm">
                        <p className="text-xs font-bold uppercase tracking-wide text-ink-secondary">Registrado por la sesión</p>
                        <p className="mt-1 font-semibold text-ink">{user?.name || "Usuario autenticado"}</p>
                        {user?.phone ? <p className="mt-1 text-ink-secondary">{user.phone}</p> : null}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-ink">Teléfono o nombre del receptor físico</label>
                        <div className="flex gap-2">
                          <Input
                            className="min-w-0"
                            value={receiverSearch}
                            onChange={(event) => {
                              setReceiverSearch(event.target.value);
                              setReceivedByUserId("");
                              setReceiverLookupMessage("");
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void findReceiver();
                              }
                            }}
                          />
                          <Button
                            variant="secondary"
                            disabled={receiverLookupLoading || !receiverSearch.trim()}
                            onClick={() => void findReceiver()}
                          >
                            {receiverLookupLoading ? "Buscando…" : "Buscar"}
                          </Button>
                        </div>
                      </div>

                      {receiverOptions.length > 0 ? (
                        <Select
                          label="Empleado que recibe físicamente"
                          value={receivedByUserId}
                          onChange={(event) => {
                            setReceivedByUserId(event.target.value);
                            const match = receiverOptions.find((receiver) => String(receiver.id) === event.target.value);
                            if (match) setReceiverSearch(match.phone || match.name);
                          }}
                        >
                          <option value="">Usar la sesión actual</option>
                          {receiverOptions.map((receiver) => (
                            <option key={receiver.id} value={receiver.id}>
                              {receiver.name}
                              {receiver.phone ? ` — ${receiver.phone}` : ""}
                            </option>
                          ))}
                        </Select>
                      ) : null}
                      {selectedReceiver ? (
                        <p className="text-sm font-semibold text-emerald-700">
                          Receptor físico: {selectedReceiver.name}
                          {selectedReceiver.phone ? ` · ${selectedReceiver.phone}` : ""}
                        </p>
                      ) : null}
                      {receiverLookupMessage ? (
                        <p className="text-sm text-ink-secondary">{receiverLookupMessage}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </CollapsibleSection>
            ) : null}
          </div>
        )}

        {/* PASO 3: RESUMEN Y CONFIRMACIÓN */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-fade-in">
            <Card title="Resumen general del ingreso">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Vía de ingreso & Cliente */}
                <div className="space-y-3 rounded-card border border-edge bg-app-secondary p-4">
                  <h3 className="font-display text-sm font-bold uppercase tracking-wide text-brand">Vía de ingreso y Cliente</h3>
                  <div className="text-sm space-y-1 text-ink">
                    <p><strong className="text-ink-secondary">Vía:</strong> {selectedMode.label} ({selectedMode.eyebrow})</p>
                    <p>
                      <strong className="text-ink-secondary">Cliente:</strong>{" "}
                      {selectedClient ? `${selectedClient.name} ${selectedClient.company ? `(${selectedClient.company})` : ""}` : "Sin cliente maestro"}
                    </p>
                    {contactName ? <p><strong className="text-ink-secondary">Contacto:</strong> {contactName} ({contactPhone || "Sin tel"})</p> : null}
                    {senderCompany ? <p><strong className="text-ink-secondary">Remitente:</strong> {senderCompany}</p> : null}
                    {specialInstructions ? <p><strong className="text-ink-secondary">Instrucciones:</strong> {specialInstructions}</p> : null}
                  </div>
                </div>

                {/* Ubicación / Sede */}
                <div className="space-y-3 rounded-card border border-edge bg-app-secondary p-4">
                  <h3 className="font-display text-sm font-bold uppercase tracking-wide text-brand">Ubicación y Sede</h3>
                  <div className="text-sm space-y-1 text-ink">
                    {requiresLocation ? (
                      <p>
                        <strong className="text-ink-secondary">Sede Danhei:</strong>{" "}
                        {selectedLocation ? `${selectedLocation.name} (${selectedLocation.address_line1})` : "Sin sede"}
                      </p>
                    ) : null}
                    {isPlanned ? <p><strong className="text-ink-secondary">Fecha estimada:</strong> {plannedDropoffAt}</p> : null}
                    {isPickup ? (
                      <>
                        <p><strong className="text-ink-secondary">Dirección recogida:</strong> {pickupAddress}</p>
                        {pickupComplement ? <p><strong className="text-ink-secondary">Complemento:</strong> {pickupComplement}</p> : null}
                        <p><strong className="text-ink-secondary">Ciudad:</strong> {pickupCity}</p>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Lista de Paquetes Resumen */}
              <div className="mt-6 space-y-3">
                <h3 className="font-display text-base font-bold text-ink">
                  Paquetes a registrar ({packages.length})
                </h3>
                <div className="space-y-3">
                  {packages.map((item, idx) => (
                    <div key={item.key} className="rounded-card border border-edge bg-surface p-4 text-sm space-y-1">
                      <div className="flex items-center justify-between font-bold text-ink">
                        <span>Paquete {idx + 1}: {item.recipientName}</span>
                        {isWalkIn && item.receptionResult === "rejected" ? (
                          <StatusBadge label="Rechazado" status="issue" />
                        ) : (
                          <StatusBadge label="Aceptado" tone="success" />
                        )}
                      </div>
                      <p className="text-ink-secondary">📱 {item.recipientPhone} · 📍 {item.deliveryAddress} {item.deliveryZone ? `(${item.deliveryZone})` : ""} · {item.deliveryCity}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-ink pt-1">
                        <span className="rounded bg-app-secondary px-2 py-0.5 text-brand">{packagePaymentLabels[item.paymentType]}</span>
                        {item.paymentType === "cash_on_delivery" ? (
                          Number(item.codAmount) > 0 ? (
                            <span>Cobro: {formatCOP(Number(item.codAmount))}</span>
                          ) : (
                            <span className="text-amber-600">Cobro: Monto pendiente</span>
                          )
                        ) : null}
                        <span>Tamaño: {item.sizeCode}</span>
                        {item.fragile ? <span className="text-brand">Frágil</span> : null}
                        {item.notes ? <span>Nota: {item.notes}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totales y cobros */}
              <div className="mt-6 grid gap-3 sm:grid-cols-3 rounded-card border border-brand/20 bg-brand-soft/30 p-4">
                <div>
                  <p className="text-xs font-medium text-ink-secondary">Total Paquetes</p>
                  <p className="text-lg font-bold text-ink">{isWalkIn ? `${acceptedPackages}/${packages.length} aceptados` : packages.length}</p>
                </div>
                {isWalkIn ? (
                  <div>
                    <p className="text-xs font-medium text-ink-secondary">Costo Envío Total</p>
                    <p className="text-lg font-bold text-brand">{formatCOP(totalShipping)}</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs font-medium text-ink-secondary">Cobro total esperado</p>
                  <p className="text-lg font-bold text-ink">{formatCOP(totalCod)}</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Acciones e Indicadores Inferiores */}
        <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-edge bg-surface p-4 shadow-card md:static md:mx-0 md:mb-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 text-xs text-ink-secondary">
              <span>Vía: <strong>{selectedMode.eyebrow}</strong></span>
              <span>Paquetes: <strong>{packages.length}</strong></span>
              <span>Cobro: <strong>{formatCOP(totalCod)}</strong></span>
            </div>

            <div className="flex items-center gap-3">
              {currentStep > 0 ? (
                <Button key="btn-nav-prev" variant="secondary" size="md" onClick={handlePrevStep} disabled={submitting}>
                  Anterior
                </Button>
              ) : null}

              {currentStep < STEP_LABELS.length - 1 ? (
                <Button key="btn-nav-next" variant="primary" size="md" onClick={handleNextStep} disabled={submitting || loadingLookups}>
                  Continuar
                </Button>
              ) : (
                <Button key="btn-nav-submit" variant="primary" size="md" type="submit" disabled={submitting || loadingLookups || (requiresLocation && !locationId)}>
                  {submitting ? "Registrando…" : isWalkIn ? "Confirmar y recibir" : "Confirmar envío"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {lookupError ? <InlineNotice tone="error">{lookupError}</InlineNotice> : null}
        {error ? (
          <div
            role="alert"
            aria-label="Error al registrar el ingreso"
            className="rounded-card border border-danger/30 bg-danger/10 p-5 text-ink shadow-sm"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-danger">
              {error.code === "operational_intake_unavailable"
                ? "Actualización del servidor pendiente"
                : "No se pudo registrar el ingreso"}
            </p>
            <p className="mt-2 text-sm leading-6 text-ink">{error.message}</p>
            {error.code === "operational_intake_unavailable" ? (
              <p className="mt-2 text-sm font-semibold leading-6 text-ink">
                El paquete no se registró. Completa el despliegue de la API y vuelve a intentarlo una sola vez.
              </p>
            ) : null}
            {typeof error.missingComponentsCount === "number" && error.missingComponentsCount > 0 ? (
              <p className="mt-2 text-xs text-ink-secondary">
                Componentes pendientes en la base de datos: {error.missingComponentsCount}.
              </p>
            ) : null}
            {error.deployment?.commit || error.deployment?.phase ? (
              <p className="mt-2 text-xs text-ink-secondary">
                Servidor: {error.deployment.status}
                {error.deployment.commit ? ` · versión ${error.deployment.commit.slice(0, 12)}` : ""}
                {error.deployment.phase ? ` · fase ${error.deployment.phase}` : ""}
              </p>
            ) : null}
            {error.reference ? (
              <p className="mt-3 text-xs font-semibold text-ink-secondary">
                Referencia para soporte:{" "}
                <code className="rounded bg-app-secondary px-2 py-1 font-mono text-[11px]">
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
