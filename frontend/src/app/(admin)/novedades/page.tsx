"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { usePageTitle } from "@/lib/page-title";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MobileListCard,
  StatusBadge,
} from "@/components/ui";
import type { PaginatedResponse, Shipment } from "@/lib/types";

type IssueShipment = Partial<Shipment> & {
  id: number;
  display_code: string;
  client_name?: string;
  driver_name?: string | null;
};

function IssueActions({
  item,
  loadingActionId,
  onUpdate,
  onDetail,
}: {
  item: IssueShipment;
  loadingActionId: number | null;
  onUpdate: (id: number, status: "in_transit" | "returned", description: string) => void;
  onDetail: () => void;
}) {
  const busy = loadingActionId === item.id;

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Button
        variant="secondary"
        size="md"
        className="w-full"
        disabled={busy}
        onClick={() => onUpdate(item.id, "in_transit", "Reintento de entrega")}
      >
        {busy ? "Guardando..." : "Reintentar entrega"}
      </Button>
      <Button
        variant="danger"
        size="md"
        className="w-full"
        disabled={busy}
        onClick={() => onUpdate(item.id, "returned", "Devuelto por novedad")}
      >
        {busy ? "Guardando..." : "Devolver"}
      </Button>
      <Button variant="ghost" size="md" className="w-full border border-edge" onClick={onDetail}>
        Ver detalle
      </Button>
    </div>
  );
}

function IssueStatus() {
  return <StatusBadge status="issue" label="Novedad" tone="danger" />;
}

function issueMeta(item: IssueShipment) {
  return (
    <>
      <span className="block">{item.recipient_address || "Dirección no disponible"}</span>
      <span className="mt-1 block text-danger">{item.issue_note || "Sin detalle de novedad"}</span>
      <span className="mt-1 block">{item.created_at ? formatDate(item.created_at) : "Fecha no disponible"}</span>
    </>
  );
}

export default function NovedadesPage() {
  usePageTitle("Novedades | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<IssueShipment[]>([]);
  const [loadingActionId, setLoadingActionId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadIssues = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await apiGet<PaginatedResponse<IssueShipment>>("/shipments?status=issue");
      setIssues(response.data || []);
    } catch {
      setIssues([]);
      setLoadError(true);
      showToast("No se pudieron cargar novedades", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateIssue = async (
    id: number,
    status: "in_transit" | "returned",
    description: string,
  ) => {
    if (status === "returned") {
      const shipment = issues.find((item) => item.id === id);
      const ok = window.confirm(
        `¿Estás seguro de marcar como devuelto el envío ${shipment?.display_code || ""}? Esta acción no se puede deshacer.`,
      );
      if (!ok) return;
    }
    try {
      setLoadingActionId(id);
      await apiSend(`/shipments/${id}/status`, "POST", { status, description });
      showToast("Novedad actualizada", "success");
      await loadIssues();
    } catch {
      showToast("No se pudo actualizar novedad", "error");
    } finally {
      setLoadingActionId(null);
    }
  };

  return (
    <div className="min-w-0 animate-fade-in space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Operación Danhei</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">Novedades</h1>
          <p className="mt-1 text-sm text-ink-secondary">Seguimiento de incidencias operativas.</p>
        </div>
      </header>

      {loading ? (
        <div className="space-y-3" aria-label="Cargando novedades">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-card bg-app-secondary" />
          ))}
        </div>
      ) : loadError ? (
        <Card title="Novedades activas">
          <div role="alert" className="rounded-input border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
            <p className="font-semibold">No se pudieron cargar las novedades.</p>
            <p className="mt-1 text-danger/80">La lista no se reemplaza por un estado vacío mientras la API no responda.</p>
            <Button variant="secondary" size="md" className="mt-3" onClick={() => void loadIssues()}>
              Reintentar
            </Button>
          </div>
        </Card>
      ) : issues.length === 0 ? (
        <EmptyState
          title="Sin novedades activas"
          description="No hay incidencias operativas que requieran revisión en este momento."
          icon={(
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2" aria-hidden="true">
              <path d="M12 3 22 20H2L12 3Z" />
              <path d="M12 9v5M12 17h.01" />
            </svg>
          )}
        />
      ) : (
        <Card title="Novedades activas" headerAction={<Badge tone="danger">{issues.length} activas</Badge>}>
          <div className="hidden divide-y divide-edge md:block">
            {issues.map((item) => (
              <article key={item.id} className="py-5 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-base font-semibold text-ink">{item.display_code}</p>
                      <IssueStatus />
                    </div>
                    <p className="mt-1 text-sm text-ink-secondary">
                      {item.client_name || "Cliente sin nombre"} · {item.driver_name || "Sin piloto"}
                    </p>
                    <p className="mt-1 text-sm text-ink-secondary">{item.recipient_address || "Dirección no disponible"}</p>
                    <p className="mt-3 rounded-input border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
                      {item.issue_note || "Sin detalle de novedad"}
                    </p>
                    <p className="mt-2 text-xs text-ink-secondary">{item.created_at ? formatDate(item.created_at) : "Fecha no disponible"}</p>
                  </div>
                  <div className="w-full shrink-0 lg:w-[32rem]">
                    <IssueActions
                      item={item}
                      loadingActionId={loadingActionId}
                      onUpdate={(id, status, description) => void updateIssue(id, status, description)}
                      onDetail={() => showToast("Abre el detalle en Paquetes", "info")}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="space-y-3 md:hidden">
            {issues.map((item) => (
              <MobileListCard
                key={item.id}
                title={item.display_code}
                subtitle={`${item.client_name || "Cliente sin nombre"} · ${item.driver_name || "Sin piloto"}`}
                meta={issueMeta(item)}
                status={<IssueStatus />}
                action={(
                  <IssueActions
                    item={item}
                    loadingActionId={loadingActionId}
                    onUpdate={(id, status, description) => void updateIssue(id, status, description)}
                    onDetail={() => showToast("Abre el detalle en Paquetes", "info")}
                  />
                )}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
