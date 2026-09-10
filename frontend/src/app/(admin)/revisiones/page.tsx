"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, apiSend, describeApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import {
  Card,
  KpiCard,
  Badge,
  Button,
  Input,
  Select,
  EmptyState,
} from "@/components/ui";
import type {
  CustodyReview,
  CustodyReviewListResponse,
  CustodyReviewType,
  ReturnConfirmationResponse,
} from "@/lib/types";

function reviewTypeBadge(type: CustodyReviewType) {
  switch (type) {
    case "auto_assigned_by_scan":
    case "qr_auto_assignment":
      return {
        label: "Auto-asignación por QR",
        tone: "warning" as const,
        className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
      };
    case "custody_transferred":
    case "custody_transfer":
      return {
        label: "Cambio de custodia entre pilotos",
        tone: "warning" as const,
        className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
      };
    case "returned_by_driver":
    case "warehouse_return":
      return {
        label: "Devolución a bodega",
        tone: "info" as const,
        className: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
      };
    default:
      return {
        label: "Revisión de custodia",
        tone: "neutral" as const,
        className: "border-edge bg-surface text-ink-secondary",
      };
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "Reciente";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "Hace un momento";
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays} d`;
}

function formatExactDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CustodyReviewsPage() {
  usePageTitle("Revisiones de custodia | Danhei Express");
  const { showToast } = useToast();

  const [reviews, setReviews] = useState<CustodyReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "acknowledged">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Acknowledge single or all
  const [actionInProgressId, setActionInProgressId] = useState<number | null>(null);
  const [bulkAcknowledging, setBulkAcknowledging] = useState(false);

  // Return confirmation modal
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [scanCodeInput, setScanCodeInput] = useState("");
  const [confirmingReturn, setConfirmingReturn] = useState(false);
  const [lastConfirmedResult, setLastConfirmedResult] = useState<ReturnConfirmationResponse | null>(null);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<CustodyReviewListResponse | CustodyReview[]>("/custody-reviews");
      const list = Array.isArray(res) ? res : res.data || [];
      setReviews(list);
    } catch (err) {
      console.warn("API /custody-reviews error or not mounted yet:", err);
      showToast(describeApiError(err, "No fue posible cargar las revisiones de custodia.").message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let active = true;
    apiGet<CustodyReviewListResponse | CustodyReview[]>("/custody-reviews")
      .then((res) => {
        if (!active) return;
        const list = Array.isArray(res) ? res : res.data || [];
        setReviews(list);
      })
      .catch((err) => {
        if (!active) return;
        console.warn("API /custody-reviews error:", err);
        showToast(describeApiError(err, "No fue posible cargar las revisiones de custodia.").message, "error");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  // Certify single review
  const handleAcknowledge = async (reviewId: number) => {
    setActionInProgressId(reviewId);
    try {
      const res = await apiSend<{ data: CustodyReview } | CustodyReview>(`/custody-reviews/${reviewId}/acknowledge`, "POST", {});
      const updatedReview = (res && "data" in res && res.data) ? res.data : (res as CustodyReview);
      showToast("Revisión de custodia certificada como vista.", "success");
      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? {
                ...r,
                ...(updatedReview || {}),
                status: "acknowledged",
                acknowledged_by: updatedReview?.acknowledged_by_user?.name || updatedReview?.acknowledged_by || "Operario de mostrador",
                acknowledged_at: updatedReview?.acknowledged_at || new Date().toISOString(),
              }
            : r
        )
      );
    } catch (err) {
      showToast(describeApiError(err, "No se pudo certificar la revisión.").message, "error");
    } finally {
      setActionInProgressId(null);
    }
  };

  // Bulk certify all pending
  const handleAcknowledgeAll = async () => {
    const pendingIds = reviews.filter((r) => r.status === "pending").map((r) => r.id);
    if (pendingIds.length === 0) return;

    setBulkAcknowledging(true);
    try {
      await apiSend("/custody-reviews/acknowledge-all", "POST", { review_ids: pendingIds }).catch(async () => {
        // Fallback: individual calls if bulk endpoint not supported
        await Promise.all(pendingIds.map((id) => apiSend(`/custody-reviews/${id}/acknowledge`, "POST", {})));
      });
      showToast(`Se certificaron ${pendingIds.length} revisiones de custodia pendientes.`, "success");
      setReviews((prev) =>
        prev.map((r) =>
          r.status === "pending"
            ? {
                ...r,
                status: "acknowledged",
                acknowledged_by: "Operario de mostrador",
                acknowledged_at: new Date().toISOString(),
              }
            : r
        )
      );
    } catch (err) {
      showToast(describeApiError(err, "No se pudieron certificar todas las revisiones.").message, "error");
    } finally {
      setBulkAcknowledging(false);
    }
  };

  // Confirm warehouse return
  const handleConfirmReturn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = scanCodeInput.trim();
    if (!code) {
      showToast("Digita o escanea el código de la guía.", "info");
      return;
    }

    setConfirmingReturn(true);
    try {
      const res = await apiPost<ReturnConfirmationResponse>("/shipments/return-confirmations", {
        scan_code: code,
      });
      setLastConfirmedResult(res);
      showToast(res.message || "Custodia de devolución confirmada en bodega.", "success");
      setScanCodeInput("");
      await loadReviews();
    } catch (err) {
      showToast(describeApiError(err, "No fue posible confirmar la devolución en bodega.").message, "error");
    } finally {
      setConfirmingReturn(false);
    }
  };

  // Metrics
  const metrics = useMemo(() => {
    const pending = reviews.filter((r) => r.status === "pending");
    return {
      totalPending: pending.length,
      autoAssigned: pending.filter((r) => r.type === "auto_assigned_by_scan" || r.type === "qr_auto_assignment").length,
      transferred: pending.filter((r) => r.type === "custody_transferred" || r.type === "custody_transfer").length,
      returned: pending.filter((r) => r.type === "returned_by_driver" || r.type === "warehouse_return").length,
    };
  }, [reviews]);

  // Filtered list (sorted: oldest first)
  const filteredReviews = useMemo(() => {
    return reviews
      .filter((r) => {
        if (r.status !== activeTab) return false;

        if (typeFilter !== "all") {
          if (typeFilter === "auto_assigned" && r.type !== "auto_assigned_by_scan" && r.type !== "qr_auto_assignment") return false;
          if (typeFilter === "transferred" && r.type !== "custody_transferred" && r.type !== "custody_transfer") return false;
          if (typeFilter === "returned" && r.type !== "returned_by_driver" && r.type !== "warehouse_return") return false;
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const code = (r.shipment?.display_code || r.shipment?.tracking_code || "").toLowerCase();
          const recipient = (r.shipment?.recipient_name || "").toLowerCase();
          const prevDriver = (r.previous_driver?.name || r.previous_driver_name || "").toLowerCase();
          const newDriver = (r.new_driver?.name || r.new_driver_name || "").toLowerCase();
          return code.includes(q) || recipient.includes(q) || prevDriver.includes(q) || newDriver.includes(q);
        }

        return true;
      })
      .sort((a, b) => new Date(a.occurred_at || a.created_at || 0).getTime() - new Date(b.occurred_at || b.created_at || 0).getTime());
  }, [reviews, activeTab, typeFilter, searchQuery]);

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header Bar */}
      <Card flush className="p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link
                href="/rutas"
                className="text-xs font-semibold text-ink-secondary hover:text-brand transition-colors"
              >
                ← Volver a Rutas
              </Link>
              <span className="text-ink-secondary">·</span>
              <Link
                href="/bodega"
                className="text-xs font-semibold text-ink-secondary hover:text-brand transition-colors"
              >
                Volver a Bodega
              </Link>
            </div>
            <h1 className="font-display text-2xl font-bold text-ink">Bandeja de revisiones de custodia</h1>
            <p className="text-xs text-ink-secondary max-w-2xl">
              Control y certificación de auto-asignaciones por escáner QR, transferencias físicas entre pilotos y devoluciones a bodega.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setScanCodeInput("");
                setLastConfirmedResult(null);
                setReturnModalOpen(true);
              }}
              className="gap-1.5 border-sky-300 text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40 font-semibold"
            >
              <span>📥</span> Confirmar devolución en bodega
            </Button>
            {activeTab === "pending" && metrics.totalPending > 0 ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleAcknowledgeAll()}
                disabled={bulkAcknowledging}
              >
                {bulkAcknowledging ? "Certificando..." : "Certificar todas las de hoy"}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Total pendientes por certificar"
          value={metrics.totalPending}
          tone={metrics.totalPending > 0 ? "warning" : "success"}
          support="Revisiones que requieren vista del operario"
        />
        <KpiCard
          label="Auto-asignaciones por QR"
          value={metrics.autoAssigned}
          tone={metrics.autoAssigned > 0 ? "warning" : "default"}
          support="Escaneados sin asignación previa"
        />
        <KpiCard
          label="Cambios entre pilotos"
          value={metrics.transferred}
          tone={metrics.transferred > 0 ? "warning" : "default"}
          support="Custodias transferidas en terreno"
        />
        <KpiCard
          label="Devoluciones a bodega"
          value={metrics.returned}
          tone={metrics.returned > 0 ? "info" : "default"}
          support="Paquetes devueltos por pilotos"
        />
      </div>

      {/* Main Content Area */}
      <Card flush className="p-4 md:p-6 space-y-4">
        {/* Tab & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("pending")}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === "pending"
                  ? "bg-brand text-white shadow-xs"
                  : "bg-surface text-ink-secondary hover:bg-app-secondary hover:text-ink"
              }`}
            >
              <span>Pendientes por certificar</span>
              {metrics.totalPending > 0 ? (
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  activeTab === "pending" ? "bg-white text-brand" : "bg-amber-100 text-amber-800"
                }`}>
                  {metrics.totalPending}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("acknowledged")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === "acknowledged"
                  ? "bg-brand text-white shadow-xs"
                  : "bg-surface text-ink-secondary hover:bg-app-secondary hover:text-ink"
              }`}
            >
              Certificadas (Historial)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-48 sm:w-60">
              <Input
                placeholder="Buscar guía, cliente, piloto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="w-44">
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="text-xs"
              >
                <option value="all">Todos los tipos</option>
                <option value="auto_assigned">Auto-asignación QR</option>
                <option value="transferred">Cambio de piloto</option>
                <option value="returned">Devolución a bodega</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="space-y-3 py-8">
            <Skeleton className="h-10 w-full rounded-card" />
            <Skeleton className="h-14 w-full rounded-card" />
            <Skeleton className="h-14 w-full rounded-card" />
          </div>
        ) : filteredReviews.length === 0 ? (
          <EmptyState
            title={activeTab === "pending" ? "Sin revisiones pendientes" : "Sin revisiones certificadas"}
            description={
              activeTab === "pending"
                ? "Todas las auto-asignaciones, transferencias y devoluciones están certificadas al día."
                : "No hay historial de revisiones certificadas con los filtros seleccionados."
            }
          />
        ) : (
          <>
            {/* Desktop Table View (1280px) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-edge text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                    <th className="pb-3 pl-2">Tipo de evento</th>
                    <th className="pb-3">Guía / Destinatario</th>
                    <th className="pb-3">Trazabilidad de pilotos</th>
                    <th className="pb-3">Momento del evento</th>
                    <th className="pb-3">Estado / Certificación</th>
                    <th className="pb-3 pr-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {filteredReviews.map((review) => {
                    const typeBadgeInfo = reviewTypeBadge(review.type);
                    const meta = review.metadata as Record<string, unknown> | undefined;
                    const prevDriverName = review.previous_driver?.name || review.previous_driver_name || (typeof meta?.previous_driver_name === "string" ? meta.previous_driver_name : null) || (review.previous_driver_id ? `Piloto #${review.previous_driver_id}` : null);
                    const newDriverName = review.new_driver?.name || review.new_driver_name || (typeof meta?.new_driver_name === "string" ? meta.new_driver_name : null) || (review.new_driver_id ? `Piloto #${review.new_driver_id}` : null);
                    const ackByName = typeof review.acknowledged_by === "object" ? review.acknowledged_by?.name : review.acknowledged_by_user?.name || review.acknowledged_by || (review.acknowledged_by_user_id ? `Usuario #${review.acknowledged_by_user_id}` : "Operario");

                    return (
                      <tr
                        key={review.id}
                        className="transition-colors hover:bg-app-secondary/40"
                      >
                        {/* Event Type */}
                        <td className="py-3 pl-2 align-top">
                          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold text-[11px] ${typeBadgeInfo.className}`}>
                            {typeBadgeInfo.label}
                          </span>
                          {review.notes ? (
                            <p className="mt-1 text-[11px] text-ink-secondary max-w-xs truncate" title={review.notes}>
                              Nota: {review.notes}
                            </p>
                          ) : null}
                        </td>

                        {/* Shipment Info */}
                        <td className="py-3 align-top">
                          <p className="font-display font-bold text-ink">
                            {review.shipment?.display_code || review.shipment?.tracking_code || `Envío #${review.shipment_id || review.id}`}
                          </p>
                          <p className="text-ink font-medium">{review.shipment?.recipient_name || "Sin destinatario"}</p>
                          <p className="text-ink-secondary text-[11px] truncate max-w-xs" title={review.shipment?.recipient_address || ""}>
                            {review.shipment?.recipient_address || "Sin dirección"}
                            {review.shipment?.recipient_zone ? ` · ${review.shipment.recipient_zone}` : ""}
                          </p>
                        </td>

                        {/* Drivers Flow */}
                        <td className="py-3 align-top">
                          {review.type === "returned_by_driver" || review.type === "warehouse_return" ? (
                            <div>
                              <p className="text-ink font-semibold">Devuelto a bodega</p>
                              <p className="text-ink-secondary text-[11px]">
                                Piloto: {prevDriverName || newDriverName || "Declarado por piloto"}
                              </p>
                            </div>
                          ) : review.type === "custody_transferred" || review.type === "custody_transfer" ? (
                            <div>
                              <p className="text-ink">
                                <span className="text-ink-secondary">De:</span> <strong>{prevDriverName || "Piloto anterior"}</strong>
                              </p>
                              <p className="text-ink">
                                <span className="text-ink-secondary">A:</span> <strong>{newDriverName || "Nuevo piloto"}</strong>
                              </p>
                            </div>
                          ) : (
                            <div>
                              <p className="text-ink font-semibold">Auto-asignado en ruta</p>
                              <p className="text-ink-secondary text-[11px]">
                                Piloto: <strong>{newDriverName || "Piloto escaneador"}</strong>
                              </p>
                            </div>
                          )}
                        </td>

                        {/* Timestamp */}
                        <td className="py-3 align-top">
                          <p className="font-semibold text-ink">{formatRelativeTime(review.occurred_at || review.created_at || "")}</p>
                          <p className="text-[11px] text-ink-secondary">{formatExactDateTime(review.occurred_at || review.created_at || "")}</p>
                        </td>

                        {/* Status / Acknowledged By */}
                        <td className="py-3 align-top">
                          {review.status === "acknowledged" ? (
                            <div className="space-y-0.5">
                              <Badge tone="success">Certificado ✓</Badge>
                              <p className="text-[11px] text-ink-secondary">
                                {ackByName}
                              </p>
                              {review.acknowledged_at ? (
                                <p className="text-[10px] text-ink-secondary">
                                  {formatExactDateTime(review.acknowledged_at)}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <Badge tone="warning">Pendiente de vista</Badge>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 pr-2 align-top text-right">
                          {review.status === "pending" ? (
                            <div className="flex flex-col items-end gap-1.5">
                              {(review.type === "returned_by_driver" || review.type === "warehouse_return") ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setScanCodeInput(review.shipment?.display_code || review.shipment?.tracking_code || "");
                                    setLastConfirmedResult(null);
                                    setReturnModalOpen(true);
                                  }}
                                  className="text-xs text-sky-800 border-sky-300 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300"
                                >
                                  Confirmar custodia
                                </Button>
                              ) : null}
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => void handleAcknowledge(review.id)}
                                disabled={actionInProgressId === review.id}
                                className="text-xs"
                              >
                                {actionInProgressId === review.id ? "Guardando..." : "Certificar visto"}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                              Certificado
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (375px) */}
            <div className="space-y-3 lg:hidden">
              {filteredReviews.map((review) => {
                const typeBadgeInfo = reviewTypeBadge(review.type);
                const meta = review.metadata as Record<string, unknown> | undefined;
                const prevDriverName = review.previous_driver?.name || review.previous_driver_name || (typeof meta?.previous_driver_name === "string" ? meta.previous_driver_name : null) || (review.previous_driver_id ? `Piloto #${review.previous_driver_id}` : null);
                const newDriverName = review.new_driver?.name || review.new_driver_name || (typeof meta?.new_driver_name === "string" ? meta.new_driver_name : null) || (review.new_driver_id ? `Piloto #${review.new_driver_id}` : null);
                const ackByName = typeof review.acknowledged_by === "object" ? review.acknowledged_by?.name : review.acknowledged_by_user?.name || review.acknowledged_by || (review.acknowledged_by_user_id ? `Usuario #${review.acknowledged_by_user_id}` : "Operario");

                return (
                  <article
                    key={`mobile-${review.id}`}
                    className="rounded-card border border-edge bg-surface p-3.5 space-y-3 text-xs shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold text-[11px] ${typeBadgeInfo.className}`}>
                        {typeBadgeInfo.label}
                      </span>
                      {review.status === "acknowledged" ? (
                        <Badge tone="success">Certificado ✓</Badge>
                      ) : (
                        <Badge tone="warning">Pendiente</Badge>
                      )}
                    </div>

                    <div>
                      <h4 className="font-display text-sm font-bold text-ink">
                        {review.shipment?.display_code || review.shipment?.tracking_code || `Envío #${review.shipment_id || review.id}`}
                      </h4>
                      <p className="font-medium text-ink">{review.shipment?.recipient_name || "Sin destinatario"}</p>
                      <p className="text-ink-secondary text-[11px] truncate">
                        {review.shipment?.recipient_address || "Sin dirección"}
                        {review.shipment?.recipient_zone ? ` · ${review.shipment.recipient_zone}` : ""}
                      </p>
                    </div>

                    <div className="rounded-lg border border-edge bg-bg-secondary/20 p-2 text-[11px] space-y-1">
                      {review.type === "returned_by_driver" || review.type === "warehouse_return" ? (
                        <p className="text-ink">
                          <strong>Devolución:</strong> Piloto {prevDriverName || newDriverName || "Declarado por piloto"}
                        </p>
                      ) : review.type === "custody_transferred" || review.type === "custody_transfer" ? (
                        <p className="text-ink">
                          <strong>Transferencia:</strong> De {prevDriverName || "Piloto anterior"} → A {newDriverName || "Nuevo piloto"}
                        </p>
                      ) : (
                        <p className="text-ink">
                          <strong>Auto-asignación:</strong> Piloto {newDriverName || "Piloto escaneador"}
                        </p>
                      )}
                      <p className="text-ink-secondary">
                        {formatRelativeTime(review.occurred_at || review.created_at || "")} ({formatExactDateTime(review.occurred_at || review.created_at || "")})
                      </p>
                      {review.status === "acknowledged" && (
                        <p className="text-emerald-700 dark:text-emerald-400 font-semibold border-t border-edge pt-1">
                          Certificado por: {ackByName}
                        </p>
                      )}
                    </div>

                    {review.status === "pending" ? (
                      <div className="flex gap-2 pt-1">
                        {(review.type === "returned_by_driver" || review.type === "warehouse_return") ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setScanCodeInput(review.shipment?.display_code || review.shipment?.tracking_code || "");
                              setLastConfirmedResult(null);
                              setReturnModalOpen(true);
                            }}
                            className="flex-1 text-xs text-sky-800 border-sky-300"
                          >
                            Confirmar custodia
                          </Button>
                        ) : null}
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => void handleAcknowledge(review.id)}
                          disabled={actionInProgressId === review.id}
                          className="flex-1 text-xs"
                        >
                          {actionInProgressId === review.id ? "Guardando..." : "Certificar visto"}
                        </Button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Return Confirmation Modal */}
      {returnModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar recepción de custodia en bodega"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-xs transition-opacity sm:items-center sm:p-4"
        >
          <Card className="mobile-modal-safe-area h-auto w-full overflow-y-auto rounded-none bg-surface p-6 shadow-xl sm:max-w-lg sm:rounded-card">
            <div className="flex items-start justify-between border-b border-edge pb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">Recepción en sede</p>
                <h3 className="font-display text-lg font-bold text-ink">
                  Confirmar recepción de custodia en bodega
                </h3>
                <p className="mt-1 text-xs text-ink-secondary">
                  Lee con lectora USB o digita el código de la guía devuelta por el piloto.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReturnModalOpen(false);
                  setScanCodeInput("");
                  setLastConfirmedResult(null);
                }}
                className="rounded p-1 text-ink-secondary hover:bg-app-secondary"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmReturn} className="mt-4 space-y-4">
              <div>
                <label htmlFor="scan-code-input" className="block text-xs font-semibold text-ink mb-1">
                  Código de la guía o token *
                </label>
                <Input
                  id="scan-code-input"
                  placeholder="Ej: #DHE-REV-001 o DHE-12345"
                  value={scanCodeInput}
                  onChange={(e) => setScanCodeInput(e.target.value)}
                  autoFocus
                  required
                />
                <p className="mt-1 text-[11px] text-ink-secondary">
                  Acepta formato de guía visible (#DHE-...), tracking code o código QR.
                </p>
              </div>

              {lastConfirmedResult ? (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 space-y-1">
                  <p className="font-bold flex items-center gap-1">
                    <span>✓</span> {lastConfirmedResult.message}
                  </p>
                  <p>
                    Paquete: <strong>{lastConfirmedResult.shipment?.display_code}</strong> · Estado: <strong>En bodega</strong>
                  </p>
                </div>
              ) : null}

              <div className="mt-6 flex justify-end gap-2 border-t border-edge pt-4">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setReturnModalOpen(false);
                    setScanCodeInput("");
                    setLastConfirmedResult(null);
                  }}
                  disabled={confirmingReturn}
                >
                  Cerrar
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={confirmingReturn || !scanCodeInput.trim()}
                >
                  {confirmingReturn ? "Confirmando..." : "Confirmar custodia en bodega"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
