"use client";

import { billingTypeLabel, formatCOP, formatDate } from "@/lib/utils";
import type { Shipment } from "@/lib/types";

type ShipmentLike = Partial<Shipment> & {
  display_code?: string;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_address?: string;
  recipient_zone?: string | null;
};

/** Evita que un nombre o una direccion con < & " rompa el documento impreso. */
const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Remitente de la guia: quien despacha el paquete, no Danhei.
 *
 * Se prefiere el bloque `sender_*` del envio porque es la foto operativa
 * tomada en el ingreso; el cliente maestro es el respaldo cuando el ingreso
 * no capturo remitente propio. Una guia puede existir sin cliente asociado.
 */
function resolveSender(shipment: ShipmentLike): {
  name: string;
  company: string;
  phone: string;
} {
  const client = shipment.client;
  const name = shipment.sender_name || client?.name || "";
  const company = shipment.sender_company || client?.company || "";

  return {
    name,
    // No repetir la misma linea dos veces cuando el remitente es la empresa.
    company: company && company !== name ? company : "",
    phone: shipment.sender_phone || client?.company_phone || client?.phone || "",
  };
}

export function PrintReceiptButton({
  shipment,
  label = "Imprimir guia",
}: {
  shipment: ShipmentLike;
  label?: string;
}) {
  const handlePrint = () => {
    const sender = resolveSender(shipment);
    const senderLines = [sender.name, sender.company, sender.phone].filter(Boolean);
    const qrText = shipment.tracking_code || shipment.display_code || String(shipment.id || "");
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(
      qrText
    )}`;
    const html = `
      <html>
      <head>
        <title>Guia ${shipment.display_code || ""}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          body { font-family: Arial, sans-serif; width: 72mm; margin: 0 auto; padding: 8px; font-size: 12px; color:#111; }
          .line { border-top: 1px dashed #333; margin: 8px 0; }
          .center { text-align: center; }
          .strong { font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="center strong">DANHEI EXPRESS</div>
        <div class="center">NIT: 902043789-9</div>
        <div class="line"></div>
        <div><span class="strong">GUIA:</span> ${esc(shipment.display_code) || "-"}</div>
        <div><span class="strong">FECHA:</span> ${formatDate(
          shipment.created_at || new Date().toISOString()
        )}</div>
        <div class="line"></div>
        <div class="strong">DESTINATARIO:</div>
        <div>${esc(shipment.recipient_name) || "-"}</div>
        <div>${esc(shipment.recipient_phone) || "-"}</div>
        <div>${esc(shipment.recipient_address) || "-"} ${shipment.recipient_zone ? `(${esc(shipment.recipient_zone)})` : ""}</div>
        <div class="line"></div>
        <div><span class="strong">TIPO:</span> ${billingTypeLabel(shipment.payment_type) || "-"}</div>
        <div><span class="strong">VALOR COD:</span> ${formatCOP(Number(shipment.cod_amount || 0))}</div>
        <div><span class="strong">FLETE:</span> ${formatCOP(Number(shipment.shipping_cost || 0))}</div>
        <div class="line"></div>
        <div class="strong">REMITENTE:</div>
        ${
          senderLines.length > 0
            ? senderLines.map((line) => `<div>${esc(line)}</div>`).join("")
            : `<div>-</div>`
        }
        <div class="line"></div>
        <div class="center"><img src="${qrUrl}" width="130" height="130"/></div>
        <div class="center">${esc(qrText)}</div>
      </body>
      </html>
    `;
    const win = window.open("", "_blank", "width=420,height=700");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95"
    >
      🖨️ {label}
    </button>
  );
}

