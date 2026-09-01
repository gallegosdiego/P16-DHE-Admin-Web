"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiGet, apiJson } from "@/lib/api";
import { usePageTitle } from "@/lib/page-title";
import {
  Badge,
  Card,
  Input,
  Select,
  Button,
  EmptyState,
} from "@/components/ui";

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
      <Card>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-lg font-bold text-ink">Sedes operativas</h1>
          <p className="text-sm text-muted">
            Administra los puntos autorizados para entregas planificadas, ingresos espontáneos y traspasos de custodia.
          </p>
        </div>
      </Card>

      <form onSubmit={submit}>
        <Card
          title={editingId ? "Editar sede" : "Agregar sede"}
          headerAction={
            <span className="text-xs text-muted">
              El código se genera automáticamente para uso interno
            </span>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Código interno"
              hint="Se genera desde el tipo y el nombre"
              readOnly
              value={code || generateInternalCode(name, locationType, locations, editingId)}
              className="bg-app-secondary uppercase font-mono"
            />
            <Input
              label="Nombre visible"
              required
              value={name}
              onChange={(event) => {
                const nextName = event.target.value;
                setName(nextName);
                setCode(generateInternalCode(nextName, locationType, locations, editingId));
              }}
              placeholder="Sede principal"
            />
            <Select
              label="Tipo de sede"
              value={locationType}
              onChange={(event) => {
                const nextType = event.target.value;
                setLocationType(nextType);
                setCode(generateInternalCode(name, nextType, locations, editingId));
              }}
            >
              <option value="danhei_hub">Hub Danhei</option>
              <option value="partner_point">Punto aliado</option>
            </Select>
            <Input
              label="Dirección"
              required
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
            <Input
              label="Ciudad"
              required
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
            <Input
              label="Teléfono de contacto"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            {editingId ? (
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                  className="h-4 w-4 rounded border-edge text-brand focus:ring-brand"
                />
                Sede activa
              </label>
            ) : null}
          </div>
          {error ? (
            <div className="mt-4 rounded-button border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
              {error}
            </div>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            {editingId ? (
              <Button variant="ghost" disabled={submitting} onClick={clearForm}>
                Cancelar
              </Button>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando…" : editingId ? "Actualizar sede" : "Guardar sede"}
            </Button>
          </div>
        </Card>
      </form>

      <Card
        title="Catálogo actual"
        headerAction={
          <span className="text-xs font-semibold text-muted">
            {locations.length} sede(s) registrada(s)
          </span>
        }
      >
        {locations.length === 0 ? (
          <EmptyState title="Sin sedes" description="Todavía no hay sedes configuradas." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {locations.map((location) => (
              <article key={location.id} className="rounded-card border border-edge p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-ink">{location.name}</p>
                    <p className="mt-0.5 font-mono text-xs font-bold uppercase tracking-wide text-brand">
                      {location.code}
                    </p>
                  </div>
                  <Badge tone={location.is_active ? "success" : "neutral"}>
                    {location.is_active ? "Activa" : "Inactiva"}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-ink/80">
                  {location.address_line1}, {location.city}
                </p>
                {location.contact_phone ? (
                  <p className="mt-1 text-sm text-muted">Tel. {location.contact_phone}</p>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editLocation(location)}
                  className="mt-3 p-0 text-brand hover:underline"
                >
                  Editar sede
                </Button>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
