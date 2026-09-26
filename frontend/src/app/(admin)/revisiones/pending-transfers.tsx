"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiRequestError, apiGet, apiPost, describeApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Badge, Button, Card } from "@/components/ui";

/**
 * Solicitudes de cambio de piloto que esperan respuesta.
 *
 * Cuando el piloto A ya arrancó ruta con el paquete y el piloto B lo escanea,
 * se le pide a A que acepte. Si A no puede responder (sin celular, sin señal),
 * administración aprueba o rechaza desde aquí. Si la API aún no tiene la ruta
 * (404/405), la tarjeta no se muestra.
 */

type TransferRequest = {
  id: number;
  status: string;
  expires_at: string | null;
  requested_at: string | null;
  shipment: { id: number; display_code: string; recipient_name?: string | null; recipient_address?: string | null } | null;
  from_driver: { id: number; name: string } | null;
  to_driver: { id: number; name: string } | null;
};

function minutesLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60000)) : null;
}

export function PendingTransfers() {
  const { showToast } = useToast();
  const [items, setItems] = useState<TransferRequest[]>([]);
  const [supported, setSupported] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(
    () =>
      apiGet<{ data?: TransferRequest[] }>("/custody-transfers?status=pending")
        .then((res) => setItems(Array.isArray(res?.data) ? res.data : []))
        .catch((err) => {
          if (err instanceof ApiRequestError && (err.status === 404 || err.status === 405 || err.status === 403)) {
            setSupported(false);
            return;
          }
          showToast(describeApiError(err, "No fue posible cargar las solicitudes de cambio de piloto.").message, "error");
        }),
    [showToast],
  );

  useEffect(() => {
    apiGet<{ data?: TransferRequest[] }>("/custody-transfers?status=pending")
      .then((res) => setItems(Array.isArray(res?.data) ? res.data : []))
      .catch((err) => {
        if (err instanceof ApiRequestError && (err.status === 404 || err.status === 405 || err.status === 403)) setSupported(false);
      });
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const respond = async (item: TransferRequest, action: "approve" | "reject") => {
    setBusyId(item.id);
    try {
      await apiPost(`/custody-transfers/${item.id}/${action}`, {});
      showToast(
        action === "approve"
          ? `Listo: el paquete ${item.shipment?.display_code ?? ""} pasó a ${item.to_driver?.name ?? "el nuevo piloto"}.`
          : `Rechazado: el paquete sigue con ${item.from_driver?.name ?? "el piloto actual"}.`,
        "success",
      );
    } catch (err) {
      showToast(describeApiError(err, "No se pudo responder la solicitud.").message, "error");
    } finally {
      setBusyId(null);
      void load();
    }
  };

  if (!supported || items.length === 0) return null;

  return (
    <Card flush className="p-4 md:p-6 space-y-3" data-testid="pending-transfers">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-bold text-ink">Cambios de piloto esperando respuesta</h2>
        <Badge tone="warning">{items.length}</Badge>
      </div>
      <p className="text-xs text-ink-secondary">
        El piloto que tiene el paquete ya salió a ruta y debe aceptar. Aprueba aquí solo si él no puede responder.
      </p>
      <ul className="divide-y divide-edge">
        {items.map((item) => {
          const left = minutesLeft(item.expires_at);
          return (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-ink">
                  {item.to_driver?.name ?? "Un piloto"} pide el paquete{" "}
                  {item.shipment ? (
                    <Link href={`/pedidos/${item.shipment.id}`} className="text-brand hover:underline">
                      {item.shipment.display_code}
                    </Link>
                  ) : null}{" "}
                  que tiene {item.from_driver?.name ?? "otro piloto"}
                </p>
                <p className="truncate text-xs text-ink-secondary">
                  {[item.shipment?.recipient_name, item.shipment?.recipient_address].filter(Boolean).join(" · ")}
                  {left !== null ? ` · vence en ${left} min` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => respond(item, "approve")} disabled={busyId === item.id}>
                  Aprobar cambio
                </Button>
                <Button size="sm" variant="secondary" onClick={() => respond(item, "reject")} disabled={busyId === item.id}>
                  Rechazar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
