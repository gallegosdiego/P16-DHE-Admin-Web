"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";

type IssueShipment = {
  id: number;
  display_code: string;
  client_name?: string;
  driver_name?: string;
  recipient_address?: string;
  issue_note?: string;
  created_at?: string;
};

export default function NovedadesPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<IssueShipment[]>([]);

  const loadIssues = async () => {
    setLoading(true);
    try {
      const response = await apiGet<{ data?: IssueShipment[] }>("/shipments?status=issue");
      setIssues(response.data || []);
    } catch {
      setIssues([]);
      showToast("No se pudieron cargar novedades", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateIssue = async (id: number, status: "in_transit" | "returned", description: string) => {
    try {
      await apiSend(`/shipments/${id}/status`, "POST", { status, description });
      showToast("Novedad actualizada", "success");
      loadIssues();
    } catch {
      showToast("No se pudo actualizar novedad", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Novedades</h1>
            <p className="text-sm text-slate-500">Seguimiento de incidencias operativas</p>
          </div>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-issue">{issues.length} activas</span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : issues.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-4xl">🎉</p>
          <p className="mt-2 text-sm text-slate-600">Sin novedades activas</p>
        </div>
      ) : (
        <section className="grid gap-3">
          {issues.map((item) => (
            <article key={item.id} className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{item.display_code}</p>
                  <p className="text-sm text-slate-700">{item.client_name || "Cliente"} · {item.driver_name || "Sin conductor"}</p>
                  <p className="text-sm text-slate-600">{item.recipient_address}</p>
                </div>
                <p className="text-xs text-slate-500">{item.created_at ? formatDate(item.created_at) : "--"}</p>
              </div>
              <p className="mt-3 rounded-lg bg-white/70 p-2 text-sm text-rose-700">{item.issue_note || "Sin detalle de novedad"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => updateIssue(item.id, "in_transit", "Reintento de entrega")} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">Reintentar entrega</button>
                <button onClick={() => updateIssue(item.id, "returned", "Devuelto por novedad")} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">Devolver</button>
                <button onClick={() => showToast("Abrir detalle en módulo Pedidos", "info")} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">Ver detalle</button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
