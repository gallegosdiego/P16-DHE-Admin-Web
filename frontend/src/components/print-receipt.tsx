"use client";

import { formatCOP, formatDate } from "@/lib/utils";
import type { Shipment } from "@/lib/types";

type ShipmentLike = Partial<Shipment> & {
  display_code?: string;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_address?: string;
  recipient_zone?: string | null;
};

export function PrintReceiptButton({
  shipment,
  label = "Imprimir guia",
}: {
  shipment: ShipmentLike;
  label?: string;
}) {
  const handlePrint = () => {
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
        <div><span class="strong">GUIA:</span> ${shipment.display_code || "-"}</div>
        <div><span class="strong">FECHA:</span> ${formatDate(
          shipment.created_at || new Date().toISOString()
        )}</div>
        <div class="line"></div>
        <div class="strong">DESTINATARIO:</div>
        <div>${shipment.recipient_name || "-"}</div>
        <div>${shipment.recipient_phone || "-"}</div>
        <div>${shipment.recipient_address || "-"} ${shipment.recipient_zone ? `(${shipment.recipient_zone})` : ""}</div>
        <div class="line"></div>
        <div><span class="strong">TIPO:</span> ${shipment.payment_type || "-"}</div>
        <div><span class="strong">VALOR COD:</span> ${formatCOP(Number(shipment.cod_amount || 0))}</div>
        <div><span class="strong">FLETE:</span> ${formatCOP(Number(shipment.shipping_cost || 0))}</div>
        <div class="line"></div>
        <div class="center"><img src="${qrUrl}" width="130" height="130"/></div>
        <div class="center">${qrText}</div>
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

