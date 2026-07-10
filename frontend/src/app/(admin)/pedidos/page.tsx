"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP, formatDate, shipmentStatusLabel } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
import { ShipmentTimeline } from "@/components/shipment-timeline";
import { PrintReceiptButton } from "@/components/print-receipt";
import { AddressBuilder } from "@/components/address-builder";
import {
  EMPTY_STRUCTURED_ADDRESS,
  assessStructuredAddress,
  buildStructuredAddressMeta,
  composeStructuredAddressPreview,
  type AddressInputMode,
  type StructuredAddressForm,
} from "@/lib/address-builder";
import { usePageTitle } from "@/lib/page-title";
import type {
  Client,
  Driver,
  PaginatedResponse,
  PaymentType,
  Shipment,
  ShipmentGeodataRepairResponse,
  ShipmentGeoSummaryResponse,
  ShipmentEvent,
  ShipmentStatus,
  Zone,
} from "@/lib/types";

type ShipmentListItem = Partial<Shipment> & {
  id: number;
  display_code: string;
  status: ShipmentStatus;
  created_at: string;
  client_name?: string;
  client_phone?: string;
  driver_name?: string | null;
};

type ShipmentDetail = ShipmentListItem & {
  events?: Array<Partial<ShipmentEvent> & { id: number; occurred_at?: string }>;
};

const tabs: Array<{ label: string; value: "all" | ShipmentStatus }> = [
  { label: "Todos", value: "all" },
  { label: "En ruta", value: "in_transit" },
  { label: "Pendiente", value: "registered" },
  { label: "Novedad", value: "issue" },
  { label: "Entregado", value: "delivered" },
];

const statusBadge: Record<string, string> = {
  registered: "bg-amber-50 text-pending",
  confirmed: "bg-blue-50 text-route",
  pickup_scheduled: "bg-blue-50 text-route",
  picked_up: "bg-blue-50 text-route",
  in_warehouse: "bg-purple-50 text-purple-700",
  assigned_to_route: "bg-blue-50 text-route",
  in_transit: "animate-pulse bg-blue-50 text-route",
  delivered: "bg-emerald-50 text-delivered",
  issue: "bg-rose-50 text-issue",
  returned: "bg-slate-100 text-slate-700",
  cancelled: "bg-slate-100 text-slate-700",
};

const paymentLabel: Record<PaymentType, string> = {
  cash_on_delivery: "Contra entrega",
  post_sale: "Cobro post entrega",
  prepaid: "Prepago",
  mercado_libre: "Mercado Libre",
};

const paymentTooltip: Record<PaymentType, string> = {
  cash_on_delivery:
    "El piloto cobra al destinatario y luego entrega a la empresa",
  post_sale: "Se factura al cliente después de la entrega",
  prepaid: "El cliente ya pagó el envío",
  mercado_libre: "Mercado Libre paga después de confirmar la entrega",
};

type CreateShipmentForm = {
  client_id: number;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  recipient_zone: string;
  recipient_city: string;
  recipient_lat: number | null;
  recipient_lng: number | null;
  payment_type: PaymentType;
  shipping_cost: number;
  cod_amount: number;
  driver_fee: number;
  driver_id: string;
  delivery_instructions: string;
  notes: string;
  address_mode: AddressInputMode;
  structured_address: StructuredAddressForm;
};

type MoneyFieldName = "shipping_cost" | "cod_amount" | "driver_fee";

type MoneyDraftState = Record<MoneyFieldName, string>;

type AddressPreviewCandidate = {
  label: string;
  formatted_address: string;
  lat: number;
  lng: number;
  provider: string;
  query: string;
};

type AddressPreviewResponse = {
  address: string;
  city: string | null;
  zone: string | null;
  recipient_lat: number | null;
  recipient_lng: number | null;
  has_coordinates: boolean;
  geocoding_pending: boolean;
  candidates: AddressPreviewCandidate[];
  message: string;
};

const defaultForm: CreateShipmentForm = {
  client_id: 0,
  recipient_name: "",
  recipient_phone: "",
  recipient_address: "",
  recipient_zone: "",
  recipient_city: "Bogotá",
  recipient_lat: null,
  recipient_lng: null,
  payment_type: "cash_on_delivery" as PaymentType,
  shipping_cost: 11500,
  cod_amount: 0,
  driver_fee: 3000,
  driver_id: "",
  delivery_instructions: "",
  notes: "",
  address_mode: "structured",
  structured_address: EMPTY_STRUCTURED_ADDRESS,
};

function buildMoneyDrafts(form: Pick<CreateShipmentForm, MoneyFieldName>): MoneyDraftState {
  return {
    shipping_cost: String(form.shipping_cost ?? 0),
    cod_amount: String(form.cod_amount ?? 0),
    driver_fee: String(form.driver_fee ?? 0),
  };
}

function sanitizeIntegerDraft(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function parseIntegerDraft(value: string, fallback = 0): number {
  const sanitized = sanitizeIntegerDraft(value);
  return sanitized === "" ? fallback : Number.parseInt(sanitized, 10);
}

const fieldControlClass =
  "h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]";
const MAX_INTAKE_PHOTO_BYTES = 4 * 1024 * 1024;
const INTAKE_PHOTO_MAX_EDGE = 1600;

function normalizeRecipientAddressInput(address: string, zone?: string, city?: string): string {
  const contexts = [zone, city]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  let normalized = address.trim();
  if (!normalized) return "";

  contexts.forEach((context) => {
    const escaped = context.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalized = normalized.replace(new RegExp(`(?:\\s*,\\s*|\\s*-\\s*|\\s+)${escaped}$`, "i"), "").trim();
  });

  normalized = normalized
    .replace(/\bcll\b|\bcl\b|\bcalle\b/gi, "calle")
    .replace(/\bcra\b|\bkr\b|\bkra\b|\bcarrera\b/gi, "carrera")
    .replace(/\bdiag\b|\bdiagonal\b/gi, "diagonal")
    .replace(/\btv\b|\btransv\b|\btransversal\b/gi, "transversal")
    .replace(/\bav\b|\bavenida\b/gi, "avenida")
    .replace(/\bno\b|\bnro\b|\bnum\b|\bnumero\b/gi, "#")
    .replace(/\s*#\s*/g, " # ")
    .replace(/#\s*(\d+[a-z]?)\s+(\d+[a-z]?)(\b|$)/gi, "# $1-$2$3")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,.-]+|[,.-]+$/g, "");

  return normalized;
}

function normalizeLocationToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function inferZoneFromAddress(address: string, zones: Zone[]): Zone | null {
  const searchText = ` ${address.toLocaleLowerCase("es-CO")} `;

  return [...zones]
    .filter((zone) => zone.is_active)
    .sort((left, right) => right.name.length - left.name.length)
    .find((zone) => searchText.includes(` ${zone.name.toLocaleLowerCase("es-CO")} `)) || null;
}

function buildSinglePointMap(lat: number, lng: number) {
  const latDelta = 0.012;
  const lngDelta = 0.018;
  const south = lat - latDelta;
  const north = lat + latDelta;
  const west = lng - lngDelta;
  const east = lng + lngDelta;
  const params = new URLSearchParams({
    bbox: [west, south, east, north].map((value) => value.toFixed(6)).join(","),
    layer: "mapnik",
    marker: `${lat.toFixed(6)},${lng.toFixed(6)}`,
  });

  return {
    embedUrl: `https://www.openstreetmap.org/export/embed.html?${params.toString()}`,
    openStreetMapUrl: `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=16/${lat.toFixed(6)}/${lng.toFixed(6)}`,
  };
}

function sameCoordinates(
  leftLat: number | null | undefined,
  leftLng: number | null | undefined,
  rightLat: number | null | undefined,
  rightLng: number | null | undefined
) {
  if (
    typeof leftLat !== "number"
    || typeof leftLng !== "number"
    || typeof rightLat !== "number"
    || typeof rightLng !== "number"
  ) {
    return false;
  }

  return Math.abs(leftLat - rightLat) < 0.000001 && Math.abs(leftLng - rightLng) < 0.000001;
}

function providerLabel(provider: string) {
  if (provider === "google") return "Google";
  if (provider === "nominatim") return "OpenStreetMap";
  if (provider === "fallback") return "Aproximada";
  return "Geo";
}

function assessRecipientAddressInput(address: string) {
  const normalized = normalizeRecipientAddressInput(address);

  if (!normalized) {
    return {
      blocking: false,
      tone: "muted" as const,
      message: "Escribe una dirección real de entrega, por ejemplo: Calle 22 #10-54.",
    };
  }

  if (normalized.length < 8) {
    return {
      blocking: true,
      tone: "danger" as const,
      message: "La dirección está muy corta. Agrega una vía y una referencia más precisa.",
    };
  }

  const hasDigits = /\d/.test(normalized);
  const hasGeoKeyword = /\b(km|kilometro|kilómetro|vereda|via|vía|finca|lote|manzana|etapa|sector|barrio|parcela|parcelacion|parcelación)\b/i.test(normalized);
  const hasHouseMarker = normalized.includes("#");

  if (!hasDigits && !hasGeoKeyword) {
    return {
      blocking: true,
      tone: "danger" as const,
      message: "Falta una referencia ubicable. Agrega numeración, kilómetro, vereda o una referencia geográfica.",
    };
  }

  if (!hasHouseMarker && hasDigits) {
    return {
      blocking: false,
      tone: "warning" as const,
      message: "Se ve mejor si agregas la numeración completa con # para mejorar la geolocalización.",
    };
  }

  return {
    blocking: false,
    tone: "success" as const,
    message: "Dirección lista para intentar geolocalización automática.",
  };
}

function getShipmentGeoBadge(shipment: Partial<Shipment>) {
  if (shipment.has_coordinates !== false) {
    return null;
  }

  if (shipment.geocoding_status === "blocked") {
    return {
      label: shipment.geocoding_reason_label || "Revisar dirección",
      className: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
    };
  }

  if (shipment.geocoding_pending) {
    return {
      label: "Geo pendiente",
      className: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    };
  }

  return {
    label: shipment.geocoding_reason_label || "Sin coordenadas",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  };
}

function FormField({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`space-y-1 ${className}`}>
      <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block text-[11px] leading-4 text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

async function prepareIntakePhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecciona una imagen valida.");
  }

  const supportedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
  if (file.size <= MAX_INTAKE_PHOTO_BYTES && supportedMimeTypes.includes(file.type)) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("No se pudo optimizar la foto. Intenta con JPG, PNG o WEBP.");
  }

  const maxEdge = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, INTAKE_PHOTO_MAX_EDGE / maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("No se pudo preparar la foto.");
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (nextBlob) resolve(nextBlob);
        else reject(new Error("No se pudo comprimir la foto."));
      },
      "image/jpeg",
      0.78
    );
  });

  if (blob.size > MAX_INTAKE_PHOTO_BYTES) {
    throw new Error("La foto sigue pesando demasiado. Usa una imagen mas liviana.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "foto-paquete";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

const getStatusAction = (status: ShipmentStatus) => {
  if (status === "in_transit") {
    return {
      next: "delivered" as ShipmentStatus,
      description: "Entregado",
      label: "Entregar",
    };
  }
  if (status === "issue") {
    return {
      next: "in_transit" as ShipmentStatus,
      description: "Reintento de entrega",
      label: "Reintentar",
    };
  }
  return null;
};

export default function PedidosPage() {
  usePageTitle("Pedidos | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);
  const [assignLoadingId, setAssignLoadingId] = useState<number | null>(null);
  const [shipments, setShipments] = useState<ShipmentListItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tab, setTab] = useState<"all" | ShipmentStatus>("all");
  const [search, setSearch] = useState("");
  const [driverId, setDriverId] = useState("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [modal, setModal] = useState<"create" | "detail" | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [moneyDrafts, setMoneyDrafts] = useState<MoneyDraftState>(() => buildMoneyDrafts(defaultForm));
  const [intakePhoto, setIntakePhoto] = useState<File | null>(null);
  const [intakePhotoInputKey, setIntakePhotoInputKey] = useState(0);
  const [intakePreviewUrl, setIntakePreviewUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<ShipmentDetail | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [geoSummary, setGeoSummary] = useState<ShipmentGeoSummaryResponse | null>(null);
  const [geoRepairing, setGeoRepairing] = useState(false);
  const [addressPreview, setAddressPreview] = useState<AddressPreviewResponse | null>(null);
  const [addressPreviewLoading, setAddressPreviewLoading] = useState(false);
  const [addressPreviewError, setAddressPreviewError] = useState("");
  const previewRequestKeyRef = useRef("");

  const buildShipmentParams = (includePage = true) => {
    const params = new URLSearchParams();
    if (includePage) params.set("page", String(page));
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
    params.set("date_from", today);
    params.set("date_to", today);
    if (tab !== "all") params.set("status", tab);
    if (search.trim()) params.set("search", search.trim());
    if (driverId !== "all") params.set("driver_id", driverId);
    return params;
  };

  const loadLookups = async () => {
    try {
      const [clientsRes, driversRes, zonesRes] = await Promise.all([
        apiGet<PaginatedResponse<Client> | Client[]>("/clients"),
        apiGet<PaginatedResponse<Driver> | Driver[]>("/drivers"),
        apiGet<Zone[]>("/zones"),
      ]);
      setClients(Array.isArray(clientsRes) ? clientsRes : clientsRes.data || []);
      setDrivers(Array.isArray(driversRes) ? driversRes : driversRes.data || []);
      setZones(zonesRes || []);
      setLookupError("");
    } catch {
      setClients([]);
      setDrivers([]);
      setZones([]);
      setLookupError("No se pudieron cargar clientes, pilotos y zonas.");
    }
  };

  const zoneOptions = useMemo(
    () =>
      [...zones]
        .filter((zone) => zone.is_active)
        .sort((left, right) => left.name.localeCompare(right.name, "es")),
    [zones]
  );

  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          zoneOptions
            .map((zone) => zone.city?.trim())
            .filter((city): city is string => Boolean(city))
        )
      ).sort((left, right) => left.localeCompare(right, "es")),
    [zoneOptions]
  );

  const availableCityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          ["Bogotá", ...cityOptions, form.recipient_city.trim()]
            .map((city) => city.trim())
            .filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right, "es")),
    [cityOptions, form.recipient_city]
  );

  const filteredZoneOptions = useMemo(() => {
    const selectedCity = form.recipient_city.trim();
    if (!selectedCity) return zoneOptions;

    const filtered = zoneOptions.filter(
      (zone) => normalizeLocationToken(zone.city || "") === normalizeLocationToken(selectedCity)
    );

    return filtered.length > 0 ? filtered : zoneOptions;
  }, [form.recipient_city, zoneOptions]);

  const applyZoneSelection = (zoneValue: string) => {
    const normalizedValue = zoneValue.trim();
    const matchedZone = filteredZoneOptions.find(
      (zone) => normalizeLocationToken(zone.name) === normalizeLocationToken(normalizedValue)
    );

    setForm((current) => ({
      ...current,
      recipient_zone: matchedZone?.name ?? zoneValue,
      recipient_city: matchedZone?.city?.trim() || current.recipient_city,
      recipient_lat: null,
      recipient_lng: null,
    }));
  };

  const applyCitySelection = (cityValue: string) => {
    const normalizedCity = cityValue.trim();
    const matchedCity = cityOptions.find(
      (city) => normalizeLocationToken(city) === normalizeLocationToken(normalizedCity)
    );
    const nextCity = matchedCity ?? cityValue;
    const cityFilteredZones = zoneOptions.filter(
      (zone) => normalizeLocationToken(zone.city || "") === normalizeLocationToken(nextCity)
    );

    setForm((current) => {
      const currentZone = current.recipient_zone.trim();
      const nextAddress = current.address_mode === "structured"
        ? composeStructuredAddressPreview(buildStructuredAddressMeta(current.structured_address))
        : current.recipient_address;
      const inferredZone = !currentZone && nextAddress
        ? inferZoneFromAddress(nextAddress, cityFilteredZones.length > 0 ? cityFilteredZones : zoneOptions)
        : null;

      if (!currentZone) {
        return {
          ...current,
          recipient_city: nextCity,
          recipient_zone: inferredZone?.name ?? current.recipient_zone,
          recipient_lat: null,
          recipient_lng: null,
        };
      }

      const zoneBelongsToCity = zoneOptions.some(
        (zone) =>
          normalizeLocationToken(zone.name) === normalizeLocationToken(currentZone)
          && normalizeLocationToken(zone.city || "") === normalizeLocationToken(nextCity)
      );

      return {
        ...current,
        recipient_city: nextCity,
        recipient_zone: zoneBelongsToCity ? current.recipient_zone : "",
        recipient_lat: null,
        recipient_lng: null,
      };
    });
  };

  const loadShipments = async () => {
    setLoading(true);
    try {
      const params = buildShipmentParams();
      const geoParams = buildShipmentParams(false);
      geoParams.set("sample_limit", "5");
      const [response, geo] = await Promise.all([
        apiGet<PaginatedResponse<ShipmentListItem>>(`/shipments?${params.toString()}`),
        apiGet<ShipmentGeoSummaryResponse>(`/shipments/geo-summary?${geoParams.toString()}`),
      ]);
      setShipments(response.data || []);
      setGeoSummary(geo);
      setMeta({
        current_page: response.current_page || 1,
        last_page: response.last_page || 1,
        total: response.total || 0,
      });
    } catch {
      setShipments([]);
      setGeoSummary(null);
      setMeta({ current_page: 1, last_page: 1, total: 0 });
      showToast("No se pudo cargar pedidos", "error");
    } finally {
      setLoading(false);
    }
  };

  const repairVisibleGeodata = async () => {
    const candidateIds = Array.from(
      new Set(shipments.filter((item) => !item.has_coordinates).map((item) => item.id).slice(0, 25))
    );

    if (candidateIds.length === 0) {
      showToast("No hay pedidos visibles por reparar en este filtro.", "info");
      return;
    }

    setGeoRepairing(true);
    try {
      const response = await apiSend<ShipmentGeodataRepairResponse>("/shipments/repair-geodata", "POST", {
        shipment_ids: candidateIds,
      });

      showToast(response.message || "Reparación geográfica ejecutada", response.summary.repaired > 0 ? "success" : "info");
      await loadShipments();
    } catch {
      showToast("No se pudo reintentar la geocodificación visible.", "error");
    } finally {
      setGeoRepairing(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLookups();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadShipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, driverId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("quickAction") === "new") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModal("create");
      params.delete("quickAction");
      const next = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intakePreviewUrl) {
        URL.revokeObjectURL(intakePreviewUrl);
      }
    };
  }, [intakePreviewUrl]);

  const clearIntakePhoto = () => {
    setIntakePhoto(null);
    setIntakePreviewUrl(null);
    setIntakePhotoInputKey((value) => value + 1);
  };

  const syncMoneyDraft = (field: MoneyFieldName, nextValue: string) => {
    const sanitized = sanitizeIntegerDraft(nextValue);
    setMoneyDrafts((current) => ({ ...current, [field]: sanitized }));
    setForm((current) => ({
      ...current,
      [field]: parseIntegerDraft(sanitized, 0),
    }));
  };

  const normalizeMoneyDraft = (field: MoneyFieldName) => {
    setMoneyDrafts((current) => {
      const normalized = String(parseIntegerDraft(current[field], 0));
      return { ...current, [field]: normalized };
    });
  };

  const handleIntakePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      clearIntakePhoto();
      return;
    }

    try {
      const prepared = await prepareIntakePhoto(file);
      setIntakePhoto(prepared);
      setIntakePreviewUrl(URL.createObjectURL(prepared));
      if (prepared.size < file.size) {
        showToast("Foto optimizada para subir mas rapido", "info");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo preparar la foto.";
      clearIntakePhoto();
      showToast(msg, "error");
    }
  };

  const setPaymentType = (paymentType: PaymentType) => {
    setForm((current) => ({
      ...current,
      payment_type: paymentType,
      cod_amount: paymentType === "cash_on_delivery" ? current.cod_amount : 0,
    }));
    if (paymentType !== "cash_on_delivery") {
      setMoneyDrafts((current) => ({ ...current, cod_amount: "0" }));
    }
  };

  const addressAssessment = useMemo(
    () => assessRecipientAddressInput(form.recipient_address),
    [form.recipient_address]
  );
  const structuredAddressAssessment = useMemo(
    () => assessStructuredAddress(form.structured_address),
    [form.structured_address]
  );
  const structuredAddressMeta = useMemo(
    () => buildStructuredAddressMeta(form.structured_address),
    [form.structured_address]
  );
  const structuredAddressPreview = useMemo(
    () => composeStructuredAddressPreview(structuredAddressMeta),
    [structuredAddressMeta]
  );
  const locationSourceAddress = form.address_mode === "structured"
    ? structuredAddressPreview
    : form.recipient_address;
  const normalizedPreviewAddress = useMemo(
    () => normalizeRecipientAddressInput(locationSourceAddress, form.recipient_zone, form.recipient_city),
    [form.recipient_city, form.recipient_zone, locationSourceAddress]
  );
  const inferredZoneFromAddress = useMemo(
    () => inferZoneFromAddress(
      normalizedPreviewAddress,
      filteredZoneOptions
    ),
    [filteredZoneOptions, normalizedPreviewAddress]
  );
  const previewEligible = modal === "create"
    && form.recipient_city.trim().length >= 2
    && normalizedPreviewAddress.trim().length >= 5;
  const selectedAddressCandidate = useMemo(() => {
    if (!addressPreview) return null;

    return (
      addressPreview.candidates.find((candidate) =>
        sameCoordinates(
          form.recipient_lat,
          form.recipient_lng,
          candidate.lat,
          candidate.lng
        )
      ) ?? addressPreview.candidates[0] ?? null
    );
  }, [addressPreview, form.recipient_lat, form.recipient_lng]);
  const addressPreviewMap = useMemo(() => {
    if (selectedAddressCandidate) {
      return buildSinglePointMap(selectedAddressCandidate.lat, selectedAddressCandidate.lng);
    }

    if (typeof addressPreview?.recipient_lat === "number" && typeof addressPreview?.recipient_lng === "number") {
      return buildSinglePointMap(addressPreview.recipient_lat, addressPreview.recipient_lng);
    }

    return null;
  }, [addressPreview, selectedAddressCandidate]);

  useEffect(() => {
    const city = form.recipient_city.trim();
    const address = normalizedPreviewAddress.trim();

    if (!previewEligible) {
      previewRequestKeyRef.current = "";
      return;
    }

    const payload: Record<string, unknown> = {
      recipient_address: address,
      recipient_city: city,
      recipient_zone: form.recipient_zone.trim() || null,
      address_mode: form.address_mode,
      limit: 4,
    };

    if (form.address_mode === "structured" && structuredAddressMeta) {
      payload.address_road_type = structuredAddressMeta.road_type;
      payload.address_road_number = structuredAddressMeta.road_number;
      payload.address_road_suffix = structuredAddressMeta.road_suffix;
      payload.address_cross_number = structuredAddressMeta.cross_number;
      payload.address_cross_suffix = structuredAddressMeta.cross_suffix;
      payload.address_property_number = structuredAddressMeta.property_number;
      payload.address_property_suffix = structuredAddressMeta.property_suffix;
      payload.address_unit_details = structuredAddressMeta.unit_details;
      payload.address_neighborhood = structuredAddressMeta.neighborhood;
      payload.address_reference = structuredAddressMeta.reference;
    }

    const requestKey = JSON.stringify(payload);
    previewRequestKeyRef.current = requestKey;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      const runPreview = async () => {
        setAddressPreviewLoading(true);
        try {
          const response = await apiSend<AddressPreviewResponse>("/shipments/address-preview", "POST", payload);
          if (cancelled || previewRequestKeyRef.current !== requestKey) {
            return;
          }

          setAddressPreview(response);
          setAddressPreviewError("");
          setForm((current) => {
            const currentAddress = normalizeRecipientAddressInput(
              current.address_mode === "structured"
                ? composeStructuredAddressPreview(buildStructuredAddressMeta(current.structured_address))
                : current.recipient_address,
              current.recipient_zone,
              current.recipient_city
            );

            if (currentAddress !== address || current.address_mode !== form.address_mode) {
              return current;
            }

            const primaryCandidate = response.candidates[0] ?? null;
            const nextLat = primaryCandidate?.lat ?? response.recipient_lat ?? null;
            const nextLng = primaryCandidate?.lng ?? response.recipient_lng ?? null;
            const nextZone = current.recipient_zone.trim() || response.zone || inferredZoneFromAddress?.name || "";
            const nextCity = response.city || current.recipient_city;

            if (
              current.recipient_zone === nextZone
              && current.recipient_city === nextCity
              && (
                (current.recipient_lat === null && nextLat === null)
                || sameCoordinates(current.recipient_lat, current.recipient_lng, nextLat, nextLng)
              )
            ) {
              return current;
            }

            return {
              ...current,
              recipient_zone: nextZone,
              recipient_city: nextCity,
              recipient_lat: nextLat,
              recipient_lng: nextLng,
            };
          });
        } catch (error: unknown) {
          if (cancelled || previewRequestKeyRef.current !== requestKey) {
            return;
          }

          const message = error instanceof Error ? error.message : "No se pudo previsualizar la dirección.";
          setAddressPreview(null);
          setAddressPreviewError(message);
        } finally {
          if (!cancelled && previewRequestKeyRef.current === requestKey) {
            setAddressPreviewLoading(false);
          }
        }
      };

      void runPreview();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    form.address_mode,
    form.recipient_city,
    form.recipient_zone,
    inferredZoneFromAddress?.name,
    modal,
    normalizedPreviewAddress,
    previewEligible,
    structuredAddressMeta,
  ]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    void loadShipments();
  };

  const createShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const normalizedAddress = form.address_mode === "structured"
        ? structuredAddressPreview
        : normalizeRecipientAddressInput(
            form.recipient_address,
            form.recipient_zone,
            form.recipient_city
          );
      const addressReview = form.address_mode === "structured"
        ? structuredAddressAssessment
        : assessRecipientAddressInput(normalizedAddress);

      if (addressReview.blocking) {
        throw new Error(addressReview.message);
      }

      if (form.address_mode === "structured" && !structuredAddressMeta) {
        throw new Error("Completa la dirección guiada antes de guardar el pedido.");
      }

      const zoneValue = form.recipient_zone.trim() || inferredZoneFromAddress?.name || "";
      const cityValue = form.recipient_city.trim() || inferredZoneFromAddress?.city?.trim() || null;

      const shippingCost = parseIntegerDraft(moneyDrafts.shipping_cost, 0);
      const codAmount = form.payment_type === "cash_on_delivery"
        ? parseIntegerDraft(moneyDrafts.cod_amount, 0)
        : 0;
      const driverFee = parseIntegerDraft(moneyDrafts.driver_fee, 0);

      const payload: Record<string, unknown> = {
        client_id: Number(form.client_id),
        recipient_name: form.recipient_name.trim(),
        recipient_phone: form.recipient_phone.trim(),
        recipient_address: normalizedAddress,
        recipient_zone: zoneValue,
        recipient_city: cityValue,
        recipient_lat: typeof form.recipient_lat === "number" ? form.recipient_lat : null,
        recipient_lng: typeof form.recipient_lng === "number" ? form.recipient_lng : null,
        delivery_instructions: form.delivery_instructions.trim() || null,
        payment_type: form.payment_type,
        shipping_cost: shippingCost,
        cod_amount: codAmount,
        driver_fee: driverFee,
        driver_id: form.driver_id ? Number(form.driver_id) : null,
        notes: form.notes.trim(),
      };
      if (form.address_mode === "structured" && structuredAddressMeta) {
        payload.address_mode = "structured";
        payload.address_road_type = structuredAddressMeta.road_type;
        payload.address_road_number = structuredAddressMeta.road_number;
        payload.address_road_suffix = structuredAddressMeta.road_suffix;
        payload.address_cross_number = structuredAddressMeta.cross_number;
        payload.address_cross_suffix = structuredAddressMeta.cross_suffix;
        payload.address_property_number = structuredAddressMeta.property_number;
        payload.address_property_suffix = structuredAddressMeta.property_suffix;
        payload.address_unit_details = structuredAddressMeta.unit_details;
        payload.address_neighborhood = structuredAddressMeta.neighborhood;
        payload.address_reference = structuredAddressMeta.reference;
      } else {
        payload.address_mode = "manual";
      }
      if (intakePhoto) payload.intake_photo = intakePhoto;
      await apiSend("/shipments", "POST", payload);
      showToast("Envío creado", "success");
      setModal(null);
      setForm(defaultForm);
      setMoneyDrafts(buildMoneyDrafts(defaultForm));
      setAddressPreview(null);
      setAddressPreviewError("");
      clearIntakePhoto();
      await loadShipments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      showToast(`No se pudo crear el envío: ${msg}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id: number) => {
    try {
      const detail = await apiGet<ShipmentDetail>(`/shipments/${id}`);
      setSelected(detail);
      setModal("detail");
    } catch {
      showToast("No se pudo cargar detalle", "error");
    }
  };

  const changeStatus = async (id: number, status: ShipmentStatus, description: string) => {
    if (status === "returned" || status === "cancelled") {
      const shipment = shipments.find((item) => item.id === id);
      const ok = window.confirm(
        `¿Estás seguro de marcar ${shipment?.display_code || "este envío"} como ${shipmentStatusLabel(status)}? Esta acción no se puede deshacer.`
      );
      if (!ok) return;
    }
    try {
      setStatusLoadingId(id);
      await apiSend(`/shipments/${id}/status`, "POST", { status, description });
      showToast("Estado cambiado", "success");
      await loadShipments();
    } catch {
      showToast("No se pudo cambiar estado", "error");
    } finally {
      setStatusLoadingId(null);
    }
  };

  const assignDriver = async (id: number, nextDriverId: number) => {
    try {
      setAssignLoadingId(id);
      await apiSend(`/shipments/${id}/assign`, "POST", { driver_id: nextDriverId });
      showToast("Piloto asignado", "success");
      await loadShipments();
    } catch {
      showToast("No se pudo asignar piloto", "error");
    } finally {
      setAssignLoadingId(null);
    }
  };

  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);

  const deleteShipment = async (id: number, code: string) => {
    if (!window.confirm(`¿Eliminar el pedido ${code}? Esta acción no se puede deshacer.`)) return;
    setDeleteLoadingId(id);
    try {
      try {
        await apiSend(`/shipments/${id}`, "DELETE", {});
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (!msg.includes("DELETE method is not supported") && !msg.includes("405")) {
          throw err;
        }
        await apiSend(`/shipments/${id}/delete`, "POST", {});
      }
      showToast("Pedido eliminado", "success");
      await loadShipments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      showToast(`No se pudo eliminar: ${msg}`, "error");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const geocodedCount = shipments.filter((item) => item.recipient_lat && item.recipient_lng).length;
  const routeReadyCount = shipments.filter((item) => item.recipient_lat && item.recipient_lng && item.driver_id).length;

  function formatReceiptTime(input: string): string {
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return "--";
    return new Intl.DateTimeFormat("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Bogota",
    }).format(date);
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Pedidos</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Gestión operativa de envíos</p>
            {lookupError ? (
              <p className="mt-1 text-xs font-semibold text-issue">{lookupError}</p>
            ) : null}
          </div>
          <form onSubmit={submitSearch} className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar guía, cliente o dirección"
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
            <button className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]">
              Buscar
            </button>
            <button
              type="button"
              onClick={() => setModal("create")}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
            >
              Nuevo pedido
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:max-w-2xl">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          Estado
          <select
            value={tab}
            onChange={(event) => {
              setTab(event.target.value as "all" | ShipmentStatus);
              setPage(1);
            }}
            className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
          >
            {tabs.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          Piloto
          <select
            value={driverId}
            onChange={(event) => {
              setDriverId(event.target.value);
              setPage(1);
            }}
            className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
          >
            <option value="all">Todos los pilotos</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>{driver.name}</option>
            ))}
          </select>
        </label>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Cobertura geogr?fica
          <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">Informaci?n para planificaci?n de rutas</span>
        </summary>
        <div className="grid gap-3 border-t border-slate-200 p-4 text-sm dark:border-[#2a2a3e] sm:grid-cols-4">
          <p><span className="block text-xs text-slate-500">Con coordenadas</span><strong>{geocodedCount}</strong></p>
          <p><span className="block text-xs text-slate-500">Geolocalizaci?n pendiente</span><strong>{shipments.length - geocodedCount}</strong></p>
          <p><span className="block text-xs text-slate-500">Listos para rutas</span><strong>{routeReadyCount}</strong></p>
          {(geoSummary?.summary.without_coordinates ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => void repairVisibleGeodata()}
              disabled={geoRepairing}
              className="min-h-10 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
            >
              {geoRepairing ? "Reparando..." : "Reintentar geocodificaci?n visible"}
            </button>
          ) : null}
        </div>
      </details>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : shipments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-slate-400">
          No hay pedidos para este filtro.
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Mostrando {shipments.length} de {meta.total} resultados
          </p>

          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#2a2a3e] dark:bg-[#1a1a2e] lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-[1150px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-[#16162a] dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Guía</th>
                    <th className="px-3 py-3">Cliente</th>
                    <th className="px-3 py-3">Dirección</th>
                    <th className="px-3 py-3">Zona</th>
                    <th className="px-3 py-3">Estado</th>
                    <th className="px-3 py-3">Piloto</th>
                    <th className="px-3 py-3">Pago</th>
                    <th className="px-3 py-3">Hora de recepcion</th>
                    <th className="px-3 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((item) => {
                    const action = getStatusAction(item.status);
                    const geoBadge = getShipmentGeoBadge(item);
                    return (
                    <tr key={item.id} className="border-t border-slate-100 dark:border-[#2a2a3e]">
                      <td className="px-3 py-3 font-semibold dark:text-[#e0e0e0]">{item.display_code}</td>
                      <td className="px-3 py-3">
                        <p className="font-semibold dark:text-[#e0e0e0]">
                          {item.client_name || item.client?.name || item.recipient_name || "Cliente"}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.client_phone || item.client?.phone || item.recipient_phone || "--"}
                        </p>
                      </td>
                      <td className="px-3 py-3 dark:text-slate-300">
                        <div>
                          <p>{item.recipient_address}</p>
                          {geoBadge ? (
                            <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${geoBadge.className}`}>
                              {geoBadge.label}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 dark:text-slate-300">
                        <div>
                          <p>{item.recipient_zone || "Sin zona"}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {item.recipient_city || "Sin ciudad"}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            statusBadge[item.status] || "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {shipmentStatusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 dark:text-slate-300">
                        {item.driver_name || item.driver?.name || "Sin asignar"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <span
                            title={paymentTooltip[item.payment_type || "cash_on_delivery"]}
                            className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300"
                          >
                            {paymentLabel[item.payment_type || "cash_on_delivery"]}
                          </span>
                          <span>{formatCOP(Number(item.cod_amount || item.shipping_cost || 0))}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 dark:text-slate-300">{formatReceiptTime(item.created_at)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openDetail(item.id)}
                            title="Ver detalle"
                            aria-label={`Ver detalle de ${item.display_code}`}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-[#2a2a3e] dark:text-slate-300 dark:hover:bg-[#1f1f35]"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
                              <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                              <circle cx="12" cy="12" r="2.5" />
                            </svg>
                          </button>
                          {action ? (
                            <button
                              type="button"
                              disabled={statusLoadingId === item.id}
                              onClick={() => changeStatus(item.id, action.next, action.description)}
                              title={action.label}
                              aria-label={`${action.label}: ${item.display_code}`}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-route hover:bg-blue-50 disabled:opacity-60 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
                                <path d="m5 12 4 4L19 6" />
                              </svg>
                            </button>
                          ) : null}
                          {drivers.length > 0 ? (
                            <select
                              aria-label={`Asignar piloto a ${item.display_code}`}
                              disabled={assignLoadingId === item.id}
                              onChange={(event) => {
                                const nextDriverId = Number(event.target.value);
                                if (nextDriverId) assignDriver(item.id, nextDriverId);
                                event.target.value = "";
                              }}
                              className="h-10 max-w-32 rounded-lg border border-slate-300 px-2 text-xs dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                            >
                              <option value="">{assignLoadingId === item.id ? "Guardando..." : "Piloto"}</option>
                              {drivers.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                            </select>
                          ) : null}
                          <button
                            type="button"
                            disabled={deleteLoadingId === item.id}
                            onClick={() => deleteShipment(item.id, item.display_code || item.tracking_code || `#${item.id}`)}
                            title="Eliminar pedido"
                            aria-label={`Eliminar ${item.display_code}`}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-300 text-red-500 hover:bg-red-50 disabled:opacity-60 dark:border-red-500/40 dark:hover:bg-red-500/10"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
                              <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 lg:hidden">
            {shipments.map((item) => {
              const action = getStatusAction(item.status);
              const geoBadge = getShipmentGeoBadge(item);
              return (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-3 transition-shadow duration-200 hover:shadow-md dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">{item.display_code}</p>
                    <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                      {item.client_name || item.client?.name || item.recipient_name || "Cliente"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {item.client_phone || item.client?.phone || item.recipient_phone || "--"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                      statusBadge[item.status] || "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {shipmentStatusLabel(item.status)}
                  </span>
                </div>

                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Entrega</p>
                  <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                    {item.recipient_name || item.client_name || "Sin destinatario"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.recipient_address}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">
                      {item.recipient_zone || "Sin zona"}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {item.recipient_city || "Sin ciudad"}
                    </span>
                    {geoBadge ? (
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${geoBadge.className}`}>
                        {geoBadge.label}
                      </span>
                    ) : null}
                  </div>
                  {item.geocoding_reason_label ? (
                    <p className="mt-2 text-[11px] font-medium text-rose-600 dark:text-rose-300">
                      {item.geocoding_reason_label}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-100 p-2 dark:border-[#2a2a3e]">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Pago</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        title={paymentTooltip[item.payment_type || "cash_on_delivery"]}
                        className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300"
                      >
                        {paymentLabel[item.payment_type || "cash_on_delivery"]}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {formatCOP(Number(item.cod_amount || item.shipping_cost || 0))}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-100 p-2 dark:border-[#2a2a3e]">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Operacion</p>
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                      {item.driver_name || item.driver?.name || "Sin asignar"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(item.created_at)}</p>
                  </div>
                </div>

                {drivers.length > 0 ? (
                  <select
                    disabled={assignLoadingId === item.id}
                    onChange={(e) => {
                      const dId = Number(e.target.value);
                      if (dId) assignDriver(item.id, dId);
                      e.target.value = "";
                    }}
                    className="mt-3 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                  >
                    <option value="">
                      {assignLoadingId === item.id ? "Guardando..." : "Asignar piloto..."}
                    </option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                ) : null}

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openDetail(item.id)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-xs dark:border-[#2a2a3e]"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
                      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                      <circle cx="12" cy="12" r="2.5" />
                    </svg>
                    Detalle
                  </button>
                  {action ? (
                    <button
                      type="button"
                      disabled={statusLoadingId === item.id}
                      onClick={() => changeStatus(item.id, action.next, action.description)}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-xs text-route disabled:opacity-60 dark:border-[#2a2a3e]"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
                        <path d="m5 12 4 4L19 6" />
                      </svg>
                      {statusLoadingId === item.id ? "Guardando..." : action.label}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={deleteLoadingId === item.id}
                    onClick={() => deleteShipment(item.id, item.display_code || item.tracking_code || `#${item.id}`)}
                    title="Eliminar pedido"
                    aria-label={`Eliminar ${item.display_code}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-300 text-red-500 disabled:opacity-60 dark:border-red-500/40"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
                      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
                    </svg>
                  </button>
                </div>
              </article>
              );
            })}
          </div>

          <Pagination currentPage={meta.current_page} lastPage={meta.last_page} onPageChange={setPage} />
        </>
      )}

      {modal === "create" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <form
            onSubmit={createShipment}
            className="mobile-modal-safe-area h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl"
          >
            <h2 className="text-lg font-bold dark:text-[#e0e0e0]">Nuevo pedido</h2>
            <div className="mt-4 space-y-5">
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-[#2a2a3e]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Remitente y destinatario
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <FormField label="Cliente remitente" className="sm:col-span-2">
                    <select
                      required
                      value={form.client_id}
                      onChange={(event) => setForm({ ...form, client_id: Number(event.target.value) })}
                      className={fieldControlClass}
                    >
                      <option value={0}>Selecciona cliente</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Nombre del destinatario">
                    <input
                      required
                      value={form.recipient_name}
                      onChange={(event) => setForm({ ...form, recipient_name: event.target.value })}
                      placeholder="Ej: Carlos Pérez"
                      className={fieldControlClass}
                    />
                  </FormField>
                  <FormField label="Teléfono del destinatario">
                    <input
                      required
                      value={form.recipient_phone}
                      onChange={(event) => setForm({ ...form, recipient_phone: event.target.value })}
                      placeholder="Ej: 3001234567"
                      className={fieldControlClass}
                    />
                  </FormField>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4 dark:border-[#2a2a3e]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Ubicación de entrega
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <FormField
                    label="Ciudad de entrega"
                    className="sm:col-span-2"
                    hint="Primero define la ciudad. Luego el sistema te ayuda a ubicar la dirección y deducir la zona."
                  >
                    <select
                      required
                      value={form.recipient_city}
                      onChange={(event) => applyCitySelection(event.target.value)}
                      className={fieldControlClass}
                    >
                      <option value="">Selecciona ciudad</option>
                      {availableCityOptions.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <div className="space-y-3 sm:col-span-2">
                    <FormField
                      label="Captura de dirección"
                      hint="Usa el constructor guiado como opción principal. Si la dirección es rural o especial, cambia a manual."
                    >
                      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-[#111124]">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              address_mode: "structured",
                              recipient_lat: null,
                              recipient_lng: null,
                            }))
                          }
                          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                            form.address_mode === "structured"
                              ? "bg-white text-fuchsia-700 shadow-sm dark:bg-[#1b1b31] dark:text-fuchsia-300"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          Guiada
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              address_mode: "manual",
                              recipient_lat: null,
                              recipient_lng: null,
                            }))
                          }
                          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                            form.address_mode === "manual"
                              ? "bg-white text-fuchsia-700 shadow-sm dark:bg-[#1b1b31] dark:text-fuchsia-300"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          Manual
                        </button>
                      </div>
                    </FormField>

                    {form.address_mode === "structured" ? (
                      <AddressBuilder
                        value={form.structured_address}
                        onChange={(next) =>
                          setForm((current) => {
                            const preview = composeStructuredAddressPreview(buildStructuredAddressMeta(next));
                            const inferredZone = !current.recipient_zone.trim() && preview
                              ? inferZoneFromAddress(preview, filteredZoneOptions)
                              : null;

                            return {
                              ...current,
                              structured_address: next,
                              recipient_address: preview || current.recipient_address,
                              recipient_zone: inferredZone?.name ?? current.recipient_zone,
                              recipient_city: inferredZone?.city?.trim() || current.recipient_city,
                              recipient_lat: null,
                              recipient_lng: null,
                            };
                          })
                        }
                        inputClassName={fieldControlClass}
                      />
                    ) : (
                      <FormField
                        label="Dirección manual"
                        hint={
                          !form.recipient_zone.trim() && inferredZoneFromAddress
                            ? `${addressAssessment.message} Zona detectada: ${inferredZoneFromAddress.name}${inferredZoneFromAddress.city ? ` (${inferredZoneFromAddress.city})` : ""}.`
                            : addressAssessment.message
                        }
                      >
                        <input
                          required
                          value={form.recipient_address}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              recipient_address: event.target.value,
                              recipient_lat: null,
                              recipient_lng: null,
                            })
                          }
                          onBlur={(event) =>
                            setForm((current) => {
                              const normalizedAddress = normalizeRecipientAddressInput(
                                event.target.value,
                                current.recipient_zone,
                                current.recipient_city
                              );
                              const inferredZone = !current.recipient_zone.trim()
                                ? inferZoneFromAddress(normalizedAddress, filteredZoneOptions)
                                : null;

                              return {
                                ...current,
                                recipient_address: normalizedAddress,
                                recipient_zone: inferredZone?.name ?? current.recipient_zone,
                                recipient_city: inferredZone?.city?.trim() || current.recipient_city,
                                recipient_lat: null,
                                recipient_lng: null,
                              };
                            })
                          }
                          placeholder="Ej: Calle 22 #10-54"
                          className={`${fieldControlClass} ${
                            addressAssessment.tone === "danger"
                              ? "border-rose-400"
                              : addressAssessment.tone === "warning"
                                ? "border-amber-400"
                                : addressAssessment.tone === "success"
                                  ? "border-emerald-300"
                                  : ""
                          }`}
                        />
                      </FormField>
                    )}

                    <div className="rounded-2xl border border-dashed border-slate-200 p-4 dark:border-[#2a2a3e]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            Dirección final
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {normalizedPreviewAddress || "Completa la dirección para verla lista."}
                          </p>
                          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-300">
                            {previewEligible
                              ? addressPreview?.message || "Buscando ubicación sugerida para esta dirección."
                              : "La dirección estructurada se usará para geolocalización y ruteo."}
                          </p>
                        </div>
                        {previewEligible && selectedAddressCandidate ? (
                          <span className="rounded-full bg-fuchsia-50 px-3 py-1 text-[11px] font-semibold text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-200">
                            {providerLabel(selectedAddressCandidate.provider)}
                          </span>
                        ) : null}
                      </div>

                      {previewEligible && addressPreviewLoading ? (
                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                          Buscando coincidencias y ubicando la dirección...
                        </p>
                      ) : null}

                      {previewEligible && addressPreviewError ? (
                        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                          {addressPreviewError}
                        </p>
                      ) : null}

                      {previewEligible && addressPreview && addressPreview.candidates.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            Coincidencias sugeridas
                          </p>
                          <div className="space-y-2">
                            {addressPreview.candidates.map((candidate, index) => {
                              const active = sameCoordinates(
                                form.recipient_lat,
                                form.recipient_lng,
                                candidate.lat,
                                candidate.lng
                              );

                              return (
                                <button
                                  key={`${candidate.provider}-${candidate.lat}-${candidate.lng}-${index}`}
                                  type="button"
                                  onClick={() =>
                                    setForm((current) => ({
                                      ...current,
                                      recipient_lat: candidate.lat,
                                      recipient_lng: candidate.lng,
                                      recipient_zone: current.recipient_zone.trim() || addressPreview.zone || inferredZoneFromAddress?.name || "",
                                      recipient_city: addressPreview.city || current.recipient_city,
                                    }))
                                  }
                                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                                    active
                                      ? "border-fuchsia-400 bg-fuchsia-50 dark:border-fuchsia-400 dark:bg-fuchsia-500/10"
                                      : "border-slate-200 hover:border-fuchsia-200 hover:bg-slate-50 dark:border-[#2a2a3e] dark:hover:bg-[#141428]"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                        {candidate.label}
                                      </p>
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {candidate.lat.toFixed(6)}, {candidate.lng.toFixed(6)}
                                      </p>
                                    </div>
                                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-200">
                                      {providerLabel(candidate.provider)}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 rounded-2xl border border-slate-200 p-3 dark:border-[#2a2a3e]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            Vista previa del punto
                          </p>
                          {previewEligible && addressPreviewMap ? (
                            <a
                              href={addressPreviewMap.openStreetMapUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold text-fuchsia-700 hover:text-fuchsia-800 dark:text-fuchsia-300"
                            >
                              Abrir mapa
                            </a>
                          ) : null}
                        </div>
                        {previewEligible && addressPreviewMap ? (
                          <div className="relative mt-3 h-56 overflow-hidden rounded-xl">
                            <iframe
                              src={addressPreviewMap.embedUrl}
                              title="Vista previa de dirección"
                              className="absolute inset-0 h-full w-full border-0"
                              loading="lazy"
                              referrerPolicy="no-referrer-when-downgrade"
                            />
                            <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-fuchsia-200/70 dark:ring-fuchsia-500/20" />
                          </div>
                        ) : (
                          <div className="mt-3 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:bg-[#111124] dark:text-slate-400">
                            {previewEligible
                              ? "Selecciona una coincidencia o completa mejor la dirección para ver el punto en el mapa."
                              : "Define ciudad y una dirección suficiente para habilitar la vista previa del mapa."}
                          </div>
                        )}
                      </div>
                    </div>

                    <FormField
                      label="Zona de entrega"
                      hint="Se completa automáticamente según la ciudad y la dirección resuelta. Igual puedes ajustarla antes de guardar."
                    >
                      <select
                        value={form.recipient_zone}
                        onChange={(event) => applyZoneSelection(event.target.value)}
                        className={fieldControlClass}
                      >
                        <option value="">Selecciona zona</option>
                        {form.recipient_zone.trim()
                          && !filteredZoneOptions.some((zone) => zone.name === form.recipient_zone.trim()) ? (
                            <option value={form.recipient_zone}>{form.recipient_zone}</option>
                          ) : null}
                        {filteredZoneOptions.map((zone) => (
                          <option key={zone.id} value={zone.name}>
                            {zone.name}{zone.city ? ` · ${zone.city}` : ""}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4 dark:border-[#2a2a3e]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Valores del pedido
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FormField label="Tipo de pago" hint={paymentTooltip[form.payment_type]}>
              <select
                value={form.payment_type}
                onChange={(event) =>
                  setPaymentType(event.target.value as PaymentType)
                }
                className={fieldControlClass}
              >
                <option value="cash_on_delivery">Contra entrega</option>
                <option value="post_sale">Cobro post entrega</option>
                <option value="prepaid">Prepago</option>
                <option value="mercado_libre">Mercado Libre</option>
              </select>
              </FormField>
              <FormField label="Costo del envío">
              <input
                type="text"
                inputMode="numeric"
                value={moneyDrafts.shipping_cost}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => syncMoneyDraft("shipping_cost", event.target.value)}
                onBlur={() => normalizeMoneyDraft("shipping_cost")}
                className={fieldControlClass}
                placeholder="Costo envío"
              />
              </FormField>
              <FormField
                label="Valor a cobrar al entregar"
                hint={form.payment_type === "cash_on_delivery" ? "Solo aplica para contra entrega." : "No aplica para este tipo de pago."}
              >
              <input
                type="text"
                inputMode="numeric"
                value={moneyDrafts.cod_amount}
                disabled={form.payment_type !== "cash_on_delivery"}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => syncMoneyDraft("cod_amount", event.target.value)}
                onBlur={() => normalizeMoneyDraft("cod_amount")}
                className={`${fieldControlClass} disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-[#111124]`}
                placeholder="Monto COD"
              />
              </FormField>
              <FormField label="Pago al piloto">
              <input
                type="text"
                inputMode="numeric"
                value={moneyDrafts.driver_fee}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => syncMoneyDraft("driver_fee", event.target.value)}
                onBlur={() => normalizeMoneyDraft("driver_fee")}
                className={fieldControlClass}
                placeholder="Pago piloto"
              />
              </FormField>
                </div>
              </div>
              <FormField label="Piloto asignado" className="sm:col-span-2">
              <select
                value={form.driver_id}
                onChange={(event) => setForm({ ...form, driver_id: event.target.value })}
                className={fieldControlClass}
              >
                <option value="">Sin asignar</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
              </FormField>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Foto del paquete (opcional)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    key={intakePhotoInputKey}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleIntakePhotoChange}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                  />
                  {intakePhoto && (
                    <button
                      type="button"
                      onClick={clearIntakePhoto}
                      className="shrink-0 text-xs text-red-500 hover:text-red-700"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                {intakePhoto && intakePreviewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={intakePreviewUrl}
                    alt="Preview"
                    className="mt-2 h-32 w-auto rounded-lg border border-slate-200 object-cover dark:border-[#2a2a3e]"
                  />
                )}
              </div>
              <FormField label="Instrucciones de entrega" className="sm:col-span-2">
              <textarea
                value={form.delivery_instructions}
                onChange={(event) => setForm({ ...form, delivery_instructions: event.target.value })}
                placeholder="Instrucciones de entrega (ej: dejar en porter?a, llamar antes)"
                className="min-h-16 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              </FormField>
              <FormField label="Observaciones internas" className="sm:col-span-2">
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Observaciones internas"
                className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              </FormField>
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setAddressPreview(null);
                  setAddressPreviewError("");
                  setModal(null);
                }}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
              >
                Cancelar
              </button>
              <button
                disabled={saving}
                className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Crear envío"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {modal === "detail" && selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <div className="mobile-modal-safe-area h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl">
            <h2 className="text-lg font-bold dark:text-[#e0e0e0]">{selected.display_code}</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <strong>Cliente:</strong>{" "}
                {selected.client_name || selected.client?.name || selected.recipient_name}
              </p>
              <p>
                <strong>Piloto:</strong>{" "}
                {selected.driver_name || selected.driver?.name || "Sin asignar"}
              </p>
              <p className="sm:col-span-2">
                <strong>Dirección:</strong> {selected.recipient_address}
              </p>
              {selected.recipient_address_meta?.unit_details ? (
                <p>
                  <strong>Complemento:</strong> {selected.recipient_address_meta.unit_details}
                </p>
              ) : null}
              {selected.recipient_address_meta?.neighborhood ? (
                <p>
                  <strong>Barrio:</strong> {selected.recipient_address_meta.neighborhood}
                </p>
              ) : null}
              {selected.recipient_address_meta?.reference ? (
                <p className="sm:col-span-2">
                  <strong>Referencia:</strong> {selected.recipient_address_meta.reference}
                </p>
              ) : null}
              <p>
                <strong>Estado:</strong> {shipmentStatusLabel(selected.status)}
              </p>
              <p>
                <strong>Monto:</strong> {formatCOP(Number(selected.cod_amount || selected.shipping_cost || 0))}
              </p>
            </div>
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">Timeline</p>
              {(selected.events || []).length === 0 ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Sin eventos registrados.</p>
              ) : (
                <ShipmentTimeline
                  events={(selected.events || []).map((event) => ({
                    id: event.id,
                    shipment_id: selected.id,
                    user_id: 0,
                    from_status: event.from_status || null,
                    to_status: event.to_status || selected.status,
                    description: event.description || "Cambio de estado",
                    metadata: null,
                    occurred_at:
                      event.occurred_at || selected.created_at || new Date().toISOString(),
                  }))}
                />
              )}
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <PrintReceiptButton shipment={selected} />
              <button
                type="button"
                onClick={() => setModal(null)}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35] sm:ml-2"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

