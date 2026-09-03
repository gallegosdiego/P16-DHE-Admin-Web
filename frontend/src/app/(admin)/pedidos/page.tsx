"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiJson, apiSend, describeApiError } from "@/lib/api";
import {
  formatCOP,
  formatDateInput,
  formatDateShort,
  shipmentStatusLabel,
  stalledLabel,
} from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
import { ShipmentTimeline } from "@/components/shipment-timeline";
import { PrintReceiptButton } from "@/components/print-receipt";
import { AddressBuilder } from "@/components/address-builder";
import {
  Card,
  KpiCard,
  StatusBadge,
  Badge,
  Button,
  Input,
  CurrencyInput,
  HelpTip,
  Select,
  SearchInput,
  Textarea,
  EmptyState,
  TableScroller,
} from "@/components/ui";
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

const paymentLabel: Record<PaymentType, string> = {
  cash_on_delivery: "Contra entrega",
  post_sale: "Cobro post entrega",
  prepaid: "Prepago",
  mercado_libre: "Mercado Libre",
};

const paymentTooltip: Record<PaymentType, string> = {
  cash_on_delivery: "El piloto cobra al destinatario y luego entrega a la empresa",
  post_sale: "Se factura al cliente después de la entrega",
  prepaid: "El cliente ya pagó el envío",
  mercado_libre: "Mercado Libre paga después de confirmar la entrega",
};

type CreateShipmentForm = {
  client_id: number;
  sender_name: string;
  sender_phone: string;
  sender_email: string;
  sender_company: string;
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
  sender_name: "",
  sender_phone: "",
  sender_email: "",
  sender_company: "",
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

  return (
    [...zones]
      .filter((zone) => zone.is_active)
      .sort((left, right) => right.name.length - left.name.length)
      .find((zone) => searchText.includes(` ${zone.name.toLocaleLowerCase("es-CO")} `)) || null
  );
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
    typeof leftLat !== "number" ||
    typeof leftLng !== "number" ||
    typeof rightLat !== "number" ||
    typeof rightLng !== "number"
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
  const hasGeoKeyword =
    /\b(km|kilometro|kilómetro|vereda|via|vía|finca|lote|manzana|etapa|sector|barrio|parcela|parcelacion|parcelación)\b/i.test(
      normalized
    );
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
  usePageTitle("Paquetes | Danhei Express");

  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);
  const [assignLoadingId, setAssignLoadingId] = useState<number | null>(null);
  const [handoverLoadingId, setHandoverLoadingId] = useState<number | null>(null);
  const [handoverTarget, setHandoverTarget] = useState<{ id: number; code: string } | null>(null);
  const [handoverNotes, setHandoverNotes] = useState("");
  const [handedOverIds, setHandedOverIds] = useState<Set<number>>(new Set());
  const [shipments, setShipments] = useState<ShipmentListItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tab, setTab] = useState<"all" | ShipmentStatus>("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
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
  const [pendingCodShipments, setPendingCodShipments] = useState<ShipmentListItem[]>([]);
  const [pendingCodLoading, setPendingCodLoading] = useState(false);
  const [pendingCodAmounts, setPendingCodAmounts] = useState<Record<number, string>>({});
  const [savingPendingCodId, setSavingPendingCodId] = useState<number | null>(null);
  const [detailCodAmount, setDetailCodAmount] = useState<string>("");
  const [savingDetailCod, setSavingDetailCod] = useState(false);
  const previewRequestKeyRef = useRef("");
  const shipmentsRequestSequence = useRef(0);

  const buildShipmentParams = (includePage = true) => {
    const params = new URLSearchParams();
    if (includePage) params.set("page", String(page));
    const today = formatDateInput();
    params.set("date_from", today);
    params.set("date_to", today);
    if (tab !== "all") params.set("status", tab);
    if (appliedSearch.trim()) params.set("search", appliedSearch.trim());
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
      const nextAddress =
        current.address_mode === "structured"
          ? composeStructuredAddressPreview(buildStructuredAddressMeta(current.structured_address))
          : current.recipient_address;
      const inferredZone =
        !currentZone && nextAddress
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
          normalizeLocationToken(zone.name) === normalizeLocationToken(currentZone) &&
          normalizeLocationToken(zone.city || "") === normalizeLocationToken(nextCity)
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
    const requestSequence = ++shipmentsRequestSequence.current;
    setLoading(true);
    try {
      const params = buildShipmentParams();
      const geoParams = buildShipmentParams(false);
      geoParams.set("sample_limit", "5");
      const [response, geo] = await Promise.all([
        apiGet<PaginatedResponse<ShipmentListItem>>(`/shipments?${params.toString()}`),
        apiGet<ShipmentGeoSummaryResponse>(`/shipments/geo-summary?${geoParams.toString()}`),
      ]);

      if (requestSequence !== shipmentsRequestSequence.current) return;

      setShipments(response.data || []);
      setGeoSummary(geo);
      setMeta({
        current_page: response.current_page || 1,
        last_page: response.last_page || 1,
        total: response.total || 0,
      });
    } catch {
      if (requestSequence !== shipmentsRequestSequence.current) return;

      setShipments([]);
      setGeoSummary(null);
      setMeta({ current_page: 1, last_page: 1, total: 0 });
      showToast("No se pudo cargar pedidos", "error");
    } finally {
      if (requestSequence === shipmentsRequestSequence.current) {
        setLoading(false);
      }
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

      showToast(
        response.message || "Reparación geográfica ejecutada",
        response.summary.repaired > 0 ? "success" : "info"
      );
      await loadShipments();
    } catch {
      showToast("No se pudo reintentar la geocodificación visible.", "error");
    } finally {
      setGeoRepairing(false);
    }
  };

  const loadPendingCodShipments = async () => {
    setPendingCodLoading(true);
    try {
      const response = await apiGet<PaginatedResponse<ShipmentListItem>>("/shipments?pending_cod=1&per_page=50");
      setPendingCodShipments(response.data || []);
    } catch {
      setPendingCodShipments([]);
    } finally {
      setPendingCodLoading(false);
    }
  };

  const savePendingCodAmount = async (shipmentId: number, customAmount?: number) => {
    const rawVal = customAmount !== undefined ? String(customAmount) : pendingCodAmounts[shipmentId];
    const amount = Number(rawVal) || 0;
    if (amount <= 0) {
      showToast("Ingresa un monto válido mayor a 0", "error");
      return;
    }
    setSavingPendingCodId(shipmentId);
    try {
      await apiSend(`/shipments/${shipmentId}`, "PUT", { cod_amount: amount });
      showToast("Monto contraentrega asignado", "success");
      setPendingCodAmounts((current) => {
        const next = { ...current };
        delete next[shipmentId];
        return next;
      });
      if (selected && selected.id === shipmentId) {
        setSelected({ ...selected, cod_amount: amount });
      }
      await Promise.all([loadPendingCodShipments(), loadShipments()]);
    } catch (error) {
      showToast(describeApiError(error, "No se pudo actualizar el monto.").message, "error");
    } finally {
      setSavingPendingCodId(null);
    }
  };

  const saveDetailCodAmount = async () => {
    if (!selected) return;
    const amount = Number(detailCodAmount) || 0;
    if (amount <= 0) {
      showToast("Ingresa un monto válido mayor a 0", "error");
      return;
    }
    setSavingDetailCod(true);
    try {
      await apiSend(`/shipments/${selected.id}`, "PUT", { cod_amount: amount });
      showToast("Monto contraentrega actualizado", "success");
      setSelected({ ...selected, cod_amount: amount });
      await Promise.all([loadPendingCodShipments(), loadShipments()]);
    } catch (error) {
      showToast(describeApiError(error, "No se pudo actualizar el monto.").message, "error");
    } finally {
      setSavingDetailCod(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLookups();
    void loadPendingCodShipments();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadShipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, driverId, appliedSearch]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("quickAction") === "new") {
      router.replace("/recogidas/nueva");
    }
  }, [router]);

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
  const locationSourceAddress =
    form.address_mode === "structured" ? structuredAddressPreview : form.recipient_address;
  const normalizedPreviewAddress = useMemo(
    () => normalizeRecipientAddressInput(locationSourceAddress, form.recipient_zone, form.recipient_city),
    [form.recipient_city, form.recipient_zone, locationSourceAddress]
  );
  const inferredZoneFromAddress = useMemo(
    () => inferZoneFromAddress(normalizedPreviewAddress, filteredZoneOptions),
    [filteredZoneOptions, normalizedPreviewAddress]
  );
  const previewEligible =
    modal === "create" && form.recipient_city.trim().length >= 2 && normalizedPreviewAddress.trim().length >= 5;
  const selectedAddressCandidate = useMemo(() => {
    if (!addressPreview) return null;

    return (
      addressPreview.candidates.find((candidate) =>
        sameCoordinates(form.recipient_lat, form.recipient_lng, candidate.lat, candidate.lng)
      ) ??
      addressPreview.candidates[0] ??
      null
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
            const nextZone =
              current.recipient_zone.trim() || response.zone || inferredZoneFromAddress?.name || "";
            const nextCity = response.city || current.recipient_city;

            if (
              current.recipient_zone === nextZone &&
              current.recipient_city === nextCity &&
              ((current.recipient_lat === null && nextLat === null) ||
                sameCoordinates(current.recipient_lat, current.recipient_lng, nextLat, nextLng))
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
    setAppliedSearch(search.trim());
    setPage(1);
  };

  const createShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const normalizedAddress =
        form.address_mode === "structured"
          ? structuredAddressPreview
          : normalizeRecipientAddressInput(form.recipient_address, form.recipient_zone, form.recipient_city);
      const addressReview =
        form.address_mode === "structured"
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
      const codAmount = form.payment_type === "cash_on_delivery" ? parseIntegerDraft(moneyDrafts.cod_amount, 0) : 0;
      const driverFee = parseIntegerDraft(moneyDrafts.driver_fee, 0);

      const payload: Record<string, unknown> = {
        client_id: form.client_id > 0 ? Number(form.client_id) : null,
        sender_name: form.sender_name.trim() || null,
        sender_phone: form.sender_phone.trim() || null,
        sender_email: form.sender_email.trim() || null,
        sender_company: form.sender_company.trim() || null,
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
      setDetailCodAmount(String(detail.cod_amount ?? 0));
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

  const openHandover = (id: number, code: string) => {
    setHandoverTarget({ id, code });
    setHandoverNotes("Piloto recibió el paquete en bodega.");
  };

  const confirmHandover = async () => {
    if (!handoverTarget || !handoverNotes.trim()) return;
    const { id } = handoverTarget;
    try {
      setHandoverLoadingId(id);
      await apiJson(
        `/shipments/${id}/handover-to-driver`,
        "POST",
        { notes: handoverNotes.trim() },
        { "Idempotency-Key": crypto.randomUUID() },
        { retries: 1, idempotent: true }
      );
      showToast("Paquete entregado al piloto: custodia registrada.", "success");
      setHandedOverIds((current) => new Set(current).add(id));
      setHandoverTarget(null);
      setHandoverNotes("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No fue posible registrar la entrega.", "error");
    } finally {
      setHandoverLoadingId(null);
    }
  };

  const assignDriver = async (id: number, nextDriverId: number | null) => {
    try {
      setAssignLoadingId(id);
      await apiSend(`/shipments/${id}/assign`, "POST", { driver_id: nextDriverId });
      showToast(nextDriverId === null ? "Piloto retirado del envío" : "Piloto asignado", "success");
      await loadShipments();
    } catch {
      showToast(
        nextDriverId === null ? "No se pudo retirar el piloto" : "No se pudo asignar piloto",
        "error"
      );
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
      if (page > 1 && shipments.length === 1) {
        setPage(page - 1);
      } else {
        await loadShipments();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      showToast(`No se pudo eliminar: ${msg}`, "error");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const geocodedCount = shipments.filter((item) => item.has_coordinates === true).length;
  const routeReadyCount = shipments.filter((item) => item.has_coordinates === true && item.driver_id != null).length;
  const inTransitCount = shipments.filter((item) => item.status === "in_transit").length;
  const deliveredCount = shipments.filter((item) => item.status === "delivered").length;
  const issueCount = shipments.filter((item) => item.status === "issue").length;

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
    <div className="animate-fade-in space-y-6">
      {/* Header Bar */}
      <Card flush className="p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Paquetes</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Consulta y gestiona las guías creadas desde el ingreso de paquetes.
            </p>
            {lookupError ? <p className="mt-1 text-xs font-semibold text-danger">{lookupError}</p> : null}
          </div>
          <form onSubmit={submitSearch} className="flex w-full flex-col gap-2.5 sm:flex-row lg:w-auto">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar guía, cliente o dirección"
              className="w-full sm:w-64"
            />
            <Button variant="secondary" type="submit">
              Buscar
            </Button>
            <Button variant="primary" type="button" onClick={() => router.push("/recogidas/nueva")}>
              Nuevo ingreso
            </Button>
          </form>
        </div>
      </Card>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Guías Hoy" value={meta.total} support="Registradas en sistema" tone="brand" />
        <KpiCard label="En Ruta" value={inTransitCount} support="En despacho activo" tone="info" />
        <KpiCard label="Entregados" value={deliveredCount} support="Completados exitosos" tone="success" />
        <KpiCard label="Novedades" value={issueCount} support="Atención requerida" tone={issueCount > 0 ? "danger" : "default"} />
      </div>

      {/* Filter and Coverage Controls */}
      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
          <Select
            label="Estado del envío"
            value={tab}
            onChange={(event) => {
              setTab(event.target.value as "all" | ShipmentStatus);
              setPage(1);
            }}
          >
            {tabs.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          <Select
            label="Piloto asignado"
            value={driverId}
            onChange={(event) => {
              setDriverId(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos los pilotos</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Coverage details */}
        <details className="group rounded-card border border-edge bg-bg-secondary/40">
          <summary className="flex cursor-pointer items-center justify-between p-3.5 text-sm font-semibold text-ink">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-brand stroke-2">
                <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>Cobertura geográfica y ruteo</span>
            </div>
            <span className="text-xs font-normal text-ink-secondary group-open:hidden">Planificación de rutas</span>
          </summary>
          <div className="grid gap-4 border-t border-edge p-4 text-sm sm:grid-cols-4">
            <div>
              <span className="block text-xs text-ink-secondary">Con coordenadas</span>
              <strong className="font-display text-lg font-bold text-ink">{geocodedCount}</strong>
            </div>
            <div>
              <span className="block text-xs text-ink-secondary">Geo pendiente</span>
              <strong className="font-display text-lg font-bold text-ink">{shipments.length - geocodedCount}</strong>
            </div>
            <div>
              <span className="block text-xs text-ink-secondary">Listos para rutas</span>
              <strong className="font-display text-lg font-bold text-ink">{routeReadyCount}</strong>
            </div>
            {(geoSummary?.summary.without_coordinates ?? 0) > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void repairVisibleGeodata()}
                disabled={geoRepairing}
                className="h-auto min-h-9 w-full text-center sm:w-auto"
              >
                {geoRepairing ? "Reparando..." : "Reintentar geocodificación"}
              </Button>
            ) : null}
          </div>
        </details>
      </Card>

      {/* Banner / Card para Guías Contra entrega con Monto Pendiente */}
      {pendingCodShipments.length > 0 && (
        <Card
          title="Envíos contra entrega con monto pendiente"
          headerAction={
            <Badge tone="warning">
              {pendingCodShipments.length} {pendingCodShipments.length === 1 ? "pendiente" : "pendientes"}
            </Badge>
          }
          className="border-amber-500/30 bg-amber-500/5"
        >
          <p className="text-xs text-ink-secondary mb-3">
            Estos envíos contra entrega tienen monto $0. Debes definir el valor a cobrar antes de que puedan salir a ruta o entregarse.
          </p>
          <div className="divide-y divide-edge rounded-card border border-edge bg-surface">
            {pendingCodShipments.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-bold text-ink">{item.display_code}</span>
                    <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                      Monto pendiente
                    </span>
                    <StatusBadge status={item.status} label={shipmentStatusLabel(item.status)} />
                  </div>
                  <p className="mt-1 text-xs text-ink-secondary">
                    Destino: <strong className="text-ink">{item.recipient_name}</strong> · 📱 {item.recipient_phone} · 📍 {item.recipient_address} ({item.recipient_city || "Bogotá"})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-36">
                    <CurrencyInput
                      min={0}
                      value={Number(pendingCodAmounts[item.id] ?? (item.cod_amount || 0))}
                      onValueChange={(val) =>
                        setPendingCodAmounts((curr) => ({ ...curr, [item.id]: String(val) }))
                      }
                    />
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={savingPendingCodId === item.id || !(Number(pendingCodAmounts[item.id]) > 0)}
                    onClick={() => void savePendingCodAmount(item.id)}
                  >
                    {savingPendingCodId === item.id ? "..." : "Guardar"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Main Content Area */}
      {loading ? (
        <Card className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-card" />
          ))}
        </Card>
      ) : shipments.length === 0 ? (
        <EmptyState
          title="No hay envíos para este filtro"
          description="Ajusta el filtro de búsqueda o estado para visualizar más resultados."
          action={
            <Button variant="secondary" onClick={() => { setTab("all"); setSearch(""); setAppliedSearch(""); setDriverId("all"); }}>
              Ver todos los envíos
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-medium text-ink-secondary">
              Mostrando {shipments.length} de {meta.total} resultados
            </p>
          </div>

          {/* Desktop Table View */}
          <Card flush className="hidden overflow-hidden lg:block">
            <TableScroller>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-edge bg-bg-secondary/60 font-sans text-xs uppercase tracking-wider text-ink-secondary">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold">Guía</th>
                    <th className="px-4 py-3.5 font-semibold">Cliente</th>
                    <th className="px-4 py-3.5 font-semibold">Destinatario</th>
                    <th className="px-4 py-3.5 font-semibold">Dirección</th>
                    <th className="px-4 py-3.5 font-semibold">Zona</th>
                    <th className="px-4 py-3.5 font-semibold">Estado</th>
                    <th className="px-4 py-3.5 font-semibold">Piloto</th>
                    <th className="px-4 py-3.5 font-semibold">Pago</th>
                    <th className="px-4 py-3.5 font-semibold">Recepción</th>
                    <th className="px-4 py-3.5 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {shipments.map((item) => {
                    const action = getStatusAction(item.status);
                    return (
                      <tr key={item.id} className="transition-colors duration-150 hover:bg-brand-soft/20">
                        <td className="px-4 py-3.5">
                          <p className="font-display font-bold text-ink">{item.display_code}</p>
                          <p className="mt-0.5 text-xs text-ink-secondary">
                            {formatDateShort(item.created_at)}
                            {stalledLabel(item.created_at, item.status) ? (
                              <>
                                {" · "}
                                <span className="font-semibold text-warning">
                                  {stalledLabel(item.created_at, item.status)}
                                </span>
                              </>
                            ) : null}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-ink">
                            {item.client_name || item.client?.name || item.sender_name || item.sender_company || "Sin cliente vinculado"}
                          </p>
                          <p className="text-xs text-ink-secondary">
                            {item.client_phone || item.client?.phone || item.sender_phone || item.recipient_phone || "--"}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-ink">{item.recipient_name || "Sin destinatario"}</p>
                          <p className="text-xs text-ink-secondary">{item.recipient_phone || "--"}</p>
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3.5 text-ink-secondary" title={item.recipient_address ?? ""}>
                          {item.recipient_address}
                        </td>
                        <td className="px-4 py-3.5 text-ink-secondary">{item.recipient_zone || "Sin zona"}</td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={item.status} label={shipmentStatusLabel(item.status)} />
                        </td>
                        <td className="px-4 py-3.5 text-ink-secondary">
                          {item.driver_name || item.driver?.name || "Sin asignar"}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-0.5">
                            <span
                              title={paymentTooltip[item.payment_type || "cash_on_delivery"]}
                              className="inline-flex w-fit text-xs font-medium text-ink-secondary"
                            >
                              {paymentLabel[item.payment_type || "cash_on_delivery"]}
                            </span>
                            {item.payment_type === "cash_on_delivery" && (!item.cod_amount || item.cod_amount <= 0) ? (
                              <span className="inline-flex w-fit rounded bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                                Monto pendiente
                              </span>
                            ) : (
                              <span className="font-semibold text-ink">
                                {formatCOP(Number(item.cod_amount || item.shipping_cost || 0))}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-ink-secondary">{formatReceiptTime(item.created_at)}</td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDetail(item.id)}
                              title="Ver detalle"
                              aria-label={`Ver detalle de ${item.display_code}`}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
                                <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                                <circle cx="12" cy="12" r="2.5" />
                              </svg>
                            </Button>
                            {action ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={statusLoadingId === item.id}
                                onClick={() => changeStatus(item.id, action.next, action.description)}
                                title={action.label}
                                aria-label={`${action.label}: ${item.display_code}`}
                              >
                                {action.label}
                              </Button>
                            ) : null}
                            {item.driver_id != null && !handedOverIds.has(item.id) && ["in_warehouse", "assigned_to_route"].includes(item.status) ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={handoverLoadingId === item.id}
                                onClick={() => openHandover(item.id, item.display_code)}
                                title="Entregar al piloto (registra custodia)"
                                aria-label={`Entregar ${item.display_code} al piloto`}
                              >
                                {handoverLoadingId === item.id ? "..." : "Entregar"}
                              </Button>
                            ) : null}
                            {drivers.length > 0 ? (
                              <select
                                aria-label={`Asignar piloto a ${item.display_code}`}
                                disabled={assignLoadingId === item.id}
                                value={item.driver_id != null ? String(item.driver_id) : ""}
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  if (raw === "none") {
                                    if (item.driver_id != null) assignDriver(item.id, null);
                                    return;
                                  }
                                  const nextDriverId = Number(raw);
                                  if (nextDriverId && nextDriverId !== item.driver_id) assignDriver(item.id, nextDriverId);
                                }}
                                className="h-9 max-w-[120px] rounded-lg border border-edge bg-surface px-2 text-xs text-ink outline-none focus:border-brand"
                              >
                                <option value="" disabled>
                                  {assignLoadingId === item.id ? "Guardando..." : "Piloto"}
                                </option>
                                {/* Sin piloto: permite corregir una asignación equivocada. */}
                                {item.driver_id != null ? <option value="none">Sin piloto (quitar)</option> : null}
                                {drivers.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={deleteLoadingId === item.id}
                              onClick={() => deleteShipment(item.id, item.display_code || item.tracking_code || `#${item.id}`)}
                              title="Eliminar pedido"
                              aria-label={`Eliminar ${item.display_code}`}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
                                <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
                              </svg>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroller>
          </Card>

          {/* Mobile Card List View (< 1024px) */}
          <div className="space-y-3 lg:hidden">
            {shipments.map((item) => {
              const action = getStatusAction(item.status);
              return (
                <Card key={item.id} className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-base font-bold text-ink">{item.display_code}</p>
                      <p className="mt-0.5 text-xs text-ink-secondary">
                        {formatDateShort(item.created_at)}
                        {stalledLabel(item.created_at, item.status) ? (
                          <>
                            {" · "}
                            <span className="font-semibold text-warning">
                              {stalledLabel(item.created_at, item.status)}
                            </span>
                          </>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-ink">
                        {item.client_name || item.client?.name || item.sender_name || item.sender_company || "Sin cliente vinculado"}
                      </p>
                      <p className="text-xs text-ink-secondary">
                        {item.client_phone || item.client?.phone || item.sender_phone || item.recipient_phone || "--"}
                      </p>
                    </div>
                    <StatusBadge status={item.status} label={shipmentStatusLabel(item.status)} />
                  </div>

                  <div className="rounded-card border border-edge bg-bg-secondary/40 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary">Destino</p>
                    <p className="mt-0.5 text-sm font-semibold text-ink">
                      {item.recipient_name || item.client_name || "Sin destinatario"}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-secondary">{item.recipient_address}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{item.recipient_zone || "Sin zona"}</Badge>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-card border border-edge p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary">Pago</p>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-ink-secondary">
                          {paymentLabel[item.payment_type || "cash_on_delivery"]}
                        </span>
                        {item.payment_type === "cash_on_delivery" && (!item.cod_amount || item.cod_amount <= 0) ? (
                          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                            Monto pendiente
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-ink">
                            {formatCOP(Number(item.cod_amount || item.shipping_cost || 0))}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-card border border-edge p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary">Recepción</p>
                      <p className="mt-1 text-xs font-medium text-ink">
                        {item.driver_name || item.driver?.name || "Sin asignar"}
                      </p>
                      <p className="text-[11px] text-ink-secondary">{formatReceiptTime(item.created_at)}</p>
                    </div>
                  </div>

                  {drivers.length > 0 ? (
                    <Select
                      disabled={assignLoadingId === item.id}
                      value={item.driver_id != null ? String(item.driver_id) : ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "none") {
                          if (item.driver_id != null) assignDriver(item.id, null);
                          return;
                        }
                        const dId = Number(raw);
                        if (dId && dId !== item.driver_id) assignDriver(item.id, dId);
                      }}
                    >
                      <option value="" disabled>
                        {assignLoadingId === item.id ? "Guardando..." : "Asignar piloto..."}
                      </option>
                      {item.driver_id != null ? <option value="none">Sin piloto (quitar)</option> : null}
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  ) : null}

                  {item.driver_id != null && !handedOverIds.has(item.id) && ["in_warehouse", "assigned_to_route"].includes(item.status) ? (
                    <Button
                      variant="secondary"
                      disabled={handoverLoadingId === item.id}
                      onClick={() => openHandover(item.id, item.display_code)}
                      className="w-full"
                    >
                      {handoverLoadingId === item.id ? "Registrando..." : "Entregar al piloto (custodia)"}
                    </Button>
                  ) : null}

                  <div className="flex items-center gap-2 pt-1">
                    <Button variant="secondary" onClick={() => openDetail(item.id)} className="flex-1">
                      Detalle
                    </Button>
                    {action ? (
                      <Button
                        variant="primary"
                        disabled={statusLoadingId === item.id}
                        onClick={() => changeStatus(item.id, action.next, action.description)}
                        className="flex-1"
                      >
                        {statusLoadingId === item.id ? "Guardando..." : action.label}
                      </Button>
                    ) : null}
                    <Button
                      variant="danger"
                      disabled={deleteLoadingId === item.id}
                      onClick={() => deleteShipment(item.id, item.display_code || item.tracking_code || `#${item.id}`)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
                        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
                      </svg>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          <Pagination currentPage={meta.current_page} lastPage={meta.last_page} onPageChange={setPage} />
        </div>
      )}

      {/* Handover Modal */}
      {handoverTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-xs transition-opacity sm:items-center sm:p-4">
          <Card className="mobile-modal-safe-area w-full max-w-md rounded-t-card bg-surface p-6 shadow-xl sm:rounded-card">
            <h2 className="font-display text-lg font-bold text-ink">Entregar {handoverTarget.code} al piloto</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              Entrega manual sin escaneo: la nota queda en la cadena de custodia explicando cómo se hizo el traspaso.
            </p>
            <Textarea
              autoFocus
              label="Nota obligatoria"
              value={handoverNotes}
              onChange={(event) => setHandoverNotes(event.target.value)}
              rows={3}
              maxLength={280}
              wrapperClassName="mt-4"
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={handoverLoadingId === handoverTarget.id}
                onClick={() => {
                  setHandoverTarget(null);
                  setHandoverNotes("");
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                disabled={handoverLoadingId === handoverTarget.id || !handoverNotes.trim()}
                onClick={() => void confirmHandover()}
              >
                {handoverLoadingId === handoverTarget.id ? "Registrando..." : "Confirmar entrega"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Create Modal */}
      {modal === "create" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-xs transition-opacity sm:items-center sm:p-4">
          <form
            onSubmit={createShipment}
            className="mobile-modal-safe-area h-[100dvh] w-full overflow-y-auto rounded-none bg-surface p-6 shadow-xl sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-card"
          >
            <h2 className="font-display text-xl font-bold text-ink">Creación directa excepcional</h2>
            <div className="mt-5 space-y-5">
              <Card className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                  Remitente y destinatario
                </p>
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <label htmlFor="create_client_id_select" className="text-sm font-medium text-ink">Cliente / contacto de cobro (opcional)</label>
                    <HelpTip topic="Cliente de cobro" text="Si aún no existe en el maestro, deja esta opción vacía. La guía seguirá el flujo y quedará en Pendientes por identificar cliente." />
                  </div>
                  <Select
                    id="create_client_id_select"
                    value={form.client_id}
                    onChange={(event) => {
                      const nextClientId = Number(event.target.value);
                      const selectedClient = clients.find((client) => client.id === nextClientId);
                      setForm({
                        ...form,
                        client_id: nextClientId,
                        sender_name: selectedClient?.name || "",
                        sender_phone: selectedClient?.phone || "",
                        sender_email: selectedClient?.email || "",
                        sender_company: selectedClient?.company || "",
                      });
                    }}
                  >
                    <option value={0}>Sin cliente maestro — revisión pendiente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                        {client.company ? " · " + client.company : ""}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Nombre del remitente"
                    value={form.sender_name}
                    onChange={(event) => setForm({ ...form, sender_name: event.target.value })}
                    placeholder="Nombre o persona que remite"
                  />
                  <Input
                    label="Teléfono del remitente"
                    value={form.sender_phone}
                    onChange={(event) => setForm({ ...form, sender_phone: event.target.value })}
                    placeholder="Teléfono de contacto"
                  />
                  <Input
                    type="email"
                    label="Correo del remitente"
                    value={form.sender_email}
                    onChange={(event) => setForm({ ...form, sender_email: event.target.value })}
                    placeholder="correo@empresa.com"
                  />
                  <Input
                    label="Empresa / razón social"
                    value={form.sender_company}
                    onChange={(event) => setForm({ ...form, sender_company: event.target.value })}
                    placeholder="Puede ser otra empresa"
                  />
                  <Input
                    required
                    label="Nombre del destinatario *"
                    value={form.recipient_name}
                    onChange={(event) => setForm({ ...form, recipient_name: event.target.value })}
                    placeholder="Ej: Carlos Pérez"
                  />
                  <Input
                    required
                    label="Teléfono del destinatario *"
                    value={form.recipient_phone}
                    onChange={(event) => setForm({ ...form, recipient_phone: event.target.value })}
                    placeholder="Ej: 3001234567"
                  />
                </div>
              </Card>

              <Card className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                  Ubicación de entrega
                </p>
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <label htmlFor="create_recipient_city_select" className="text-sm font-medium text-ink">Ciudad de entrega <span className="ml-0.5 text-brand">*</span></label>
                    <HelpTip topic="Ciudad de entrega" text="Primero define la ciudad. Luego el sistema te ayuda a ubicar la dirección y deducir la zona." />
                  </div>
                  <Select
                    id="create_recipient_city_select"
                    required
                    value={form.recipient_city}
                    onChange={(event) => applyCitySelection(event.target.value)}
                  >
                    <option value="">Selecciona ciudad</option>
                    {availableCityOptions.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <span className="block text-xs font-semibold text-ink">Captura de dirección</span>
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-bg-secondary p-1">
                      <Button
                        type="button"
                        variant={form.address_mode === "structured" ? "primary" : "ghost"}
                        size="sm"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            address_mode: "structured",
                            recipient_lat: null,
                            recipient_lng: null,
                          }))
                        }
                      >
                        Guiada
                      </Button>
                      <Button
                        type="button"
                        variant={form.address_mode === "manual" ? "primary" : "ghost"}
                        size="sm"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            address_mode: "manual",
                            recipient_lat: null,
                            recipient_lng: null,
                          }))
                        }
                      >
                        Manual
                      </Button>
                    </div>
                  </div>

                  {form.address_mode === "structured" ? (
                    <AddressBuilder
                      value={form.structured_address}
                      inputClassName="h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink outline-none focus:border-brand"
                      onChange={(next) =>
                        setForm((current) => {
                          const preview = composeStructuredAddressPreview(buildStructuredAddressMeta(next));
                          const inferredZone =
                            !current.recipient_zone.trim() && preview
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
                    />
                  ) : (
                    <Input
                      required
                      label="Dirección manual *"
                      hint={
                        !form.recipient_zone.trim() && inferredZoneFromAddress
                          ? `${addressAssessment.message} Zona detectada: ${inferredZoneFromAddress.name}${inferredZoneFromAddress.city ? ` (${inferredZoneFromAddress.city})` : ""}.`
                          : addressAssessment.message
                      }
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
                    />
                  )}

                  <div className="rounded-card border border-dashed border-edge p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                          Dirección resuelta
                        </p>
                        <p className="mt-1 font-sans text-sm font-semibold text-ink">
                          {normalizedPreviewAddress || "Completa la dirección para verla lista."}
                        </p>
                        <p className="mt-1 text-xs text-success">
                          {previewEligible
                            ? addressPreview?.message || "Buscando ubicación sugerida..."
                            : "La dirección estructurada se usará para geolocalización y ruteo."}
                        </p>
                      </div>
                      {previewEligible && selectedAddressCandidate ? (
                        <Badge tone="info">{providerLabel(selectedAddressCandidate.provider)}</Badge>
                      ) : null}
                    </div>

                    {previewEligible && addressPreviewLoading ? (
                      <p className="mt-3 text-xs text-ink-secondary">Buscando coincidencias...</p>
                    ) : null}

                    {previewEligible && addressPreviewError ? (
                      <p className="mt-3 rounded-card bg-danger-soft p-3 text-xs text-danger">
                        {addressPreviewError}
                      </p>
                    ) : null}

                    {previewEligible && addressPreview && addressPreview.candidates.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
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
                                    recipient_zone:
                                      current.recipient_zone.trim() ||
                                      addressPreview.zone ||
                                      inferredZoneFromAddress?.name ||
                                      "",
                                    recipient_city: addressPreview.city || current.recipient_city,
                                  }))
                                }
                                className={`w-full rounded-card border p-3 text-left transition-colors duration-150 ${
                                  active ? "border-brand bg-brand-soft" : "border-edge hover:border-brand/40"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-ink">{candidate.label}</p>
                                    <p className="mt-0.5 text-xs text-ink-secondary">
                                      {candidate.lat.toFixed(6)}, {candidate.lng.toFixed(6)}
                                    </p>
                                  </div>
                                  <Badge tone="neutral">{providerLabel(candidate.provider)}</Badge>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-card border border-edge p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                          Mapa del punto
                        </p>
                        {previewEligible && addressPreviewMap ? (
                          <a
                            href={addressPreviewMap.openStreetMapUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-brand hover:underline"
                          >
                            Abrir mapa
                          </a>
                        ) : null}
                      </div>
                      {previewEligible && addressPreviewMap ? (
                        <div className="relative mt-3 h-52 overflow-hidden rounded-card">
                          <iframe
                            src={addressPreviewMap.embedUrl}
                            title="Vista previa de dirección"
                            className="absolute inset-0 h-full w-full border-0"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        </div>
                      ) : (
                        <div className="mt-3 rounded-card bg-bg-secondary p-4 text-center text-xs text-ink-secondary">
                          Define la ciudad y la dirección completa para activar el mapa.
                        </div>
                      )}
                    </div>
                  </div>

                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <label htmlFor="create_recipient_zone_select" className="text-sm font-medium text-ink">Zona de entrega</label>
                    <HelpTip topic="Zona de entrega" text="Se completa automáticamente según la ciudad y la dirección resuelta." />
                  </div>
                  <Select
                    id="create_recipient_zone_select"
                    value={form.recipient_zone}
                    onChange={(event) => applyZoneSelection(event.target.value)}
                  >
                    <option value="">Selecciona zona</option>
                    {form.recipient_zone.trim() &&
                    !filteredZoneOptions.some((zone) => zone.name === form.recipient_zone.trim()) ? (
                      <option value={form.recipient_zone}>{form.recipient_zone}</option>
                    ) : null}
                    {filteredZoneOptions.map((zone) => (
                      <option key={zone.id} value={zone.name}>
                        {zone.name}
                        {zone.city ? ` · ${zone.city}` : ""}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </Card>

              <Card className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-secondary">Valores del pedido</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Tipo de pago"
                    hint={paymentTooltip[form.payment_type]}
                    value={form.payment_type}
                    onChange={(event) => setPaymentType(event.target.value as PaymentType)}
                  >
                    <option value="cash_on_delivery">Contra entrega</option>
                    <option value="post_sale">Cobro post entrega</option>
                    <option value="prepaid">Prepago</option>
                    <option value="mercado_libre">Mercado Libre</option>
                  </Select>
                  <Input
                    label="Costo del envío"
                    type="text"
                    inputMode="numeric"
                    value={moneyDrafts.shipping_cost}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => syncMoneyDraft("shipping_cost", event.target.value)}
                    onBlur={() => normalizeMoneyDraft("shipping_cost")}
                    placeholder="Costo envío"
                  />
                  <Input
                    label="Valor a cobrar al entregar"
                    hint={
                      form.payment_type === "cash_on_delivery"
                        ? "Solo aplica para contra entrega."
                        : "No aplica para este tipo de pago."
                    }
                    type="text"
                    inputMode="numeric"
                    value={moneyDrafts.cod_amount}
                    disabled={form.payment_type !== "cash_on_delivery"}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => syncMoneyDraft("cod_amount", event.target.value)}
                    onBlur={() => normalizeMoneyDraft("cod_amount")}
                    placeholder="Monto COD"
                  />
                  <Input
                    label="Pago al piloto"
                    type="text"
                    inputMode="numeric"
                    value={moneyDrafts.driver_fee}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => syncMoneyDraft("driver_fee", event.target.value)}
                    onBlur={() => normalizeMoneyDraft("driver_fee")}
                    placeholder="Pago piloto"
                  />
                </div>
              </Card>

              <Select
                label="Piloto asignado"
                value={form.driver_id}
                onChange={(event) => setForm({ ...form, driver_id: event.target.value })}
              >
                <option value="">Sin asignar</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </Select>

              <div className="space-y-1">
                <span className="block text-xs font-semibold text-ink">Foto del paquete (opcional)</span>
                <div className="flex items-center gap-3">
                  <input
                    key={intakePhotoInputKey}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleIntakePhotoChange}
                    className="h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-xs file:font-semibold file:text-brand"
                  />
                  {intakePhoto && (
                    <Button variant="ghost" size="sm" onClick={clearIntakePhoto} className="text-danger">
                      Quitar
                    </Button>
                  )}
                </div>
                {intakePhoto && intakePreviewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={intakePreviewUrl}
                    alt="Preview"
                    className="mt-2 h-32 w-auto rounded-card border border-edge object-cover"
                  />
                )}
              </div>

              <Textarea
                label="Instrucciones de entrega"
                value={form.delivery_instructions}
                onChange={(event) => setForm({ ...form, delivery_instructions: event.target.value })}
                placeholder="Instrucciones de entrega (ej: dejar en portería, llamar antes)"
              />
              <Textarea
                label="Observaciones internas"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Observaciones internas"
              />
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setAddressPreview(null);
                  setAddressPreviewError("");
                  setModal(null);
                }}
              >
                Cancelar
              </Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Crear guía directa"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Detail Modal */}
      {modal === "detail" && selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-xs transition-opacity sm:items-center sm:p-4">
          <Card className="mobile-modal-safe-area h-[100dvh] w-full overflow-y-auto rounded-none bg-surface p-6 shadow-xl sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-card">
            <div className="flex items-center justify-between border-b border-edge pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-secondary">Detalle de guía</p>
                <h2 className="font-display text-2xl font-bold text-ink">{selected.display_code}</h2>
              </div>
              <StatusBadge status={selected.status} label={shipmentStatusLabel(selected.status)} />
            </div>

            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-card border border-edge p-3">
                <span className="block text-xs text-ink-secondary">Cliente / Remitente</span>
                <strong className="text-ink">
                  {selected.client_name || selected.client?.name || selected.recipient_name}
                </strong>
              </div>
              <div className="rounded-card border border-edge p-3">
                <span className="block text-xs text-ink-secondary">Piloto Asignado</span>
                <strong className="text-ink">
                  {selected.driver_name || selected.driver?.name || "Sin asignar"}
                </strong>
              </div>
              <div className="rounded-card border border-edge p-3 sm:col-span-2">
                <span className="block text-xs text-ink-secondary">Dirección de Entrega</span>
                <strong className="text-ink">{selected.recipient_address}</strong>
                {selected.recipient_address_meta?.unit_details ? (
                  <p className="mt-1 text-xs text-ink-secondary">
                    Complemento: {selected.recipient_address_meta.unit_details}
                  </p>
                ) : null}
                {selected.recipient_address_meta?.neighborhood ? (
                  <p className="text-xs text-ink-secondary">
                    Barrio: {selected.recipient_address_meta.neighborhood}
                  </p>
                ) : null}
                {selected.recipient_address_meta?.reference ? (
                  <p className="text-xs text-ink-secondary">
                    Referencia: {selected.recipient_address_meta.reference}
                  </p>
                ) : null}
              </div>
              <div className="rounded-card border border-edge p-3 sm:col-span-2">
                <span className="block text-xs text-ink-secondary">Cobro y Cobranza ({paymentLabel[selected.payment_type || "cash_on_delivery"]})</span>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  {selected.payment_type === "cash_on_delivery" && (!selected.cod_amount || selected.cod_amount <= 0) ? (
                    <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                      Monto pendiente por definir
                    </span>
                  ) : (
                    <strong className="text-ink font-display text-lg">
                      {formatCOP(Number(selected.cod_amount || selected.shipping_cost || 0))}
                    </strong>
                  )}
                </div>

                {selected.payment_type === "cash_on_delivery" ? (
                  <div className="mt-3 flex items-center gap-2 border-t border-edge pt-3">
                    <div className="w-40">
                      <CurrencyInput
                        min={0}
                        value={Number(detailCodAmount) || 0}
                        onValueChange={(val) => setDetailCodAmount(String(val))}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={savingDetailCod || !(Number(detailCodAmount) > 0)}
                      onClick={() => void saveDetailCodAmount()}
                    >
                      {savingDetailCod ? "Guardando..." : "Actualizar monto"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 border-t border-edge pt-4">
              <h3 className="font-display text-base font-bold text-ink">Timeline de eventos</h3>
              <div className="mt-3">
                {(selected.events || []).length === 0 ? (
                  <p className="text-xs text-ink-secondary">Sin eventos registrados.</p>
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
                      occurred_at: event.occurred_at || selected.created_at || new Date().toISOString(),
                    }))}
                  />
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <PrintReceiptButton shipment={selected} />
              <Button variant="secondary" onClick={() => setModal(null)}>
                Cerrar
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
