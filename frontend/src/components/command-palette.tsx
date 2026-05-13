"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { toTitle } from "@/lib/utils";
import type { Client, Driver, PaginatedResponse, Shipment } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
};

type QuickAction = {
  id: string;
  label: string;
  to: string;
};

type ShipmentResult = Pick<Shipment, "id" | "display_code" | "status" | "recipient_name">;
type ClientResult = Pick<Client, "id" | "name" | "company" | "billing_type">;
type DriverResult = Pick<Driver, "id" | "name" | "zone" | "status">;

const quickActions: QuickAction[] = [
  { id: "new-order", label: "Nuevo pedido", to: "/pedidos?quickAction=new" },
  { id: "new-client", label: "Nuevo cliente", to: "/clientes?quickAction=new" },
  { id: "new-driver", label: "Nuevo conductor", to: "/conductores?quickAction=new" },
  { id: "new-user", label: "Nuevo usuario", to: "/usuarios?quickAction=new" },
  { id: "issues", label: "Ver novedades", to: "/novedades" },
  { id: "payments", label: "Conciliar pagos", to: "/pagos" },
  { id: "reports", label: "Exportar reporte", to: "/reportes" },
  { id: "metrics", label: "Ver metricas", to: "/metricas" },
  { id: "audit", label: "Abrir auditoria", to: "/auditoria" },
];

const statusTone: Record<string, string> = {
  delivered: "bg-emerald-50 text-delivered",
  in_transit: "bg-blue-50 text-route",
  issue: "bg-rose-50 text-issue",
  registered: "bg-amber-50 text-pending",
};

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [shipments, setShipments] = useState<ShipmentResult[]>([]);
  const [clients, setClients] = useState<ClientResult[]>([]);
  const [drivers, setDrivers] = useState<DriverResult[]>([]);

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
      }
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !search) {
      return;
    }
    const run = async () => {
      setLoading(true);
      try {
        const [s, c, d] = await Promise.all([
          apiGet<PaginatedResponse<ShipmentResult>>(
            `/shipments?search=${encodeURIComponent(search)}&per_page=5`
          ),
          apiGet<PaginatedResponse<ClientResult>>(
            `/clients?search=${encodeURIComponent(search)}&per_page=5`
          ),
          apiGet<PaginatedResponse<DriverResult>>(
            `/drivers?search=${encodeURIComponent(search)}&per_page=5`
          ),
        ]);
        setShipments(s.data || []);
        setClients(c.data || []);
        setDrivers(d.data || []);
      } catch {
        setShipments([]);
        setClients([]);
        setDrivers([]);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [open, search]);

  const filteredActions = useMemo(
    () =>
      quickActions.filter((action) =>
        action.label.toLowerCase().includes((search || query).toLowerCase())
      ),
    [query, search]
  );

  if (!open) return null;

  const navigate = (to: string) => {
    onClose();
    setQuery("");
    router.push(to);
  };

  const noResults =
    search &&
    !loading &&
    shipments.length === 0 &&
    clients.length === 0 &&
    drivers.length === 0 &&
    filteredActions.length === 0;

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center bg-slate-900/60 p-4 pt-20 animate-fade-in">
      <button className="absolute inset-0" type="button" onClick={onClose} aria-label="Cerrar" />
      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 p-3">
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              if (!value.trim()) {
                setShipments([]);
                setClients([]);
                setDrivers([]);
              }
            }}
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            placeholder="Buscar envios, clientes, conductores o acciones..."
          />
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-3 text-sm">
          {loading ? <p className="text-slate-500">Buscando...</p> : null}

          {filteredActions.length ? (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Acciones rapidas
              </p>
              <div className="space-y-1">
                {filteredActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => navigate(action.to)}
                    className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {shipments.length ? (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Envios
              </p>
              <div className="space-y-1">
                {shipments.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/pedidos?search=${encodeURIComponent(item.display_code || "")}`)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-100"
                  >
                    <span>
                      <strong>{item.display_code}</strong> - {item.recipient_name}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        statusTone[item.status] || "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {toTitle(item.status)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {clients.length ? (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Clientes
              </p>
              <div className="space-y-1">
                {clients.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/clientes?search=${encodeURIComponent(item.name)}`)}
                    className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100"
                  >
                    <strong>{item.name}</strong> - {item.company || "-"} - {toTitle(item.billing_type)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {drivers.length ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Conductores
              </p>
              <div className="space-y-1">
                {drivers.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/conductores/${item.id}`)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-100"
                  >
                    <span>
                      <strong>{item.name}</strong> - {item.zone || "Sin zona"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{toTitle(item.status)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {noResults ? (
            <p className="text-slate-500">Sin resultados para &quot;{search}&quot;</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
