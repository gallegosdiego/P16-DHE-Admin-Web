export type AddressInputMode = "structured" | "manual";

export type ShipmentAddressRoadType =
  | "calle"
  | "carrera"
  | "diagonal"
  | "transversal"
  | "avenida"
  | "autopista"
  | "circular"
  | "via"
  | "vereda";

export interface ShipmentAddressMeta {
  mode: "structured";
  road_type: ShipmentAddressRoadType;
  road_number: string;
  road_suffix: string | null;
  cross_number: string;
  cross_suffix: string | null;
  property_number: string;
  property_suffix: string | null;
  unit_details: string | null;
  neighborhood: string | null;
  reference: string | null;
  formatted_address?: string | null;
  zone?: string | null;
  city?: string | null;
  source?: string | null;
}

export interface StructuredAddressForm {
  roadType: ShipmentAddressRoadType;
  roadNumber: string;
  roadSuffix: string;
  crossNumber: string;
  crossSuffix: string;
  propertyNumber: string;
  propertySuffix: string;
  unitDetails: string;
  neighborhood: string;
  reference: string;
}

export const ADDRESS_ROAD_TYPE_OPTIONS: Array<{ value: ShipmentAddressRoadType; label: string }> = [
  { value: "calle", label: "Calle" },
  { value: "carrera", label: "Carrera" },
  { value: "diagonal", label: "Diagonal" },
  { value: "transversal", label: "Transversal" },
  { value: "avenida", label: "Avenida" },
  { value: "autopista", label: "Autopista" },
  { value: "circular", label: "Circular" },
  { value: "via", label: "Vía" },
  { value: "vereda", label: "Vereda" },
];

export const EMPTY_STRUCTURED_ADDRESS: StructuredAddressForm = {
  roadType: "calle",
  roadNumber: "",
  roadSuffix: "",
  crossNumber: "",
  crossSuffix: "",
  propertyNumber: "",
  propertySuffix: "",
  unitDetails: "",
  neighborhood: "",
  reference: "",
};

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function normalizeFreeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function displayRoadType(value: ShipmentAddressRoadType): string {
  return ADDRESS_ROAD_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function hasStructuredAddressCore(value: StructuredAddressForm): boolean {
  return Boolean(value.roadNumber || value.crossNumber || value.propertyNumber);
}

export function isStructuredAddressComplete(value: StructuredAddressForm): boolean {
  return Boolean(
    normalizeToken(value.roadNumber)
    && normalizeToken(value.crossNumber)
    && normalizeToken(value.propertyNumber)
  );
}

export function buildStructuredAddressMeta(value: StructuredAddressForm): ShipmentAddressMeta | null {
  const roadNumber = normalizeToken(value.roadNumber);
  const crossNumber = normalizeToken(value.crossNumber);
  const propertyNumber = normalizeToken(value.propertyNumber);

  if (!roadNumber || !crossNumber || !propertyNumber) {
    return null;
  }

  const roadSuffix = normalizeFreeText(value.roadSuffix);
  const crossSuffix = normalizeFreeText(value.crossSuffix);
  const propertySuffix = normalizeFreeText(value.propertySuffix);
  const unitDetails = normalizeFreeText(value.unitDetails);
  const neighborhood = normalizeFreeText(value.neighborhood);
  const reference = normalizeFreeText(value.reference);

  return {
    mode: "structured",
    road_type: value.roadType,
    road_number: roadNumber,
    road_suffix: roadSuffix || null,
    cross_number: crossNumber,
    cross_suffix: crossSuffix || null,
    property_number: propertyNumber,
    property_suffix: propertySuffix || null,
    unit_details: unitDetails || null,
    neighborhood: neighborhood || null,
    reference: reference || null,
    source: "address_builder_v1",
  };
}

export function composeStructuredAddressPreview(meta: ShipmentAddressMeta | null): string {
  if (!meta) return "";

  const road = [meta.road_number, meta.road_suffix].filter(Boolean).join(" ");
  const cross = [meta.cross_number, meta.cross_suffix].filter(Boolean).join(" ");
  const property = [meta.property_number, meta.property_suffix].filter(Boolean).join(" ");
  const base = `${displayRoadType(meta.road_type)} ${road} # ${cross}-${property}`;
  const extras = [meta.unit_details, meta.neighborhood].filter(Boolean);

  return extras.length > 0 ? `${base}, ${extras.join(", ")}` : base;
}

export function assessStructuredAddress(value: StructuredAddressForm): {
  blocking: boolean;
  tone: "muted" | "warning" | "success" | "danger";
  message: string;
} {
  if (!hasStructuredAddressCore(value)) {
    return {
      blocking: false,
      tone: "muted",
      message: "Selecciona el tipo de vía y completa numeración para generar una dirección estandarizada.",
    };
  }

  if (!isStructuredAddressComplete(value)) {
    return {
      blocking: true,
      tone: "danger",
      message: "Falta completar vía, cruce o número final del predio.",
    };
  }

  return {
    blocking: false,
    tone: "success",
    message: "Dirección estructurada lista para geolocalización y ruteo.",
  };
}
