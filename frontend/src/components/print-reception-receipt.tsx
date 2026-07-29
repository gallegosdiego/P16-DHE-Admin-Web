"use client";

import { formatDate } from "@/lib/utils";
import type { PickupReceptionReceiptDTO } from "@/lib/types";

function escapeHtml(value: unknown): string {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateLabel(value: string | null): string {
  return value ? formatDate(value) : "Sin fecha";
}

function resultTone(result: string): string {
  return result === "received" ? "ok" : "difference";
}

function receiptHtml(receipt: PickupReceptionReceiptDTO): string {
  const customerLabel = receipt.customer?.company
    ? `${receipt.customer.name} · ${receipt.customer.company}`
    : receipt.customer?.name || "Sin cliente";
  const locationLabel = receipt.service_location
    ? `${receipt.service_location.name} · ${receipt.service_location.address_line1}, ${receipt.service_location.city}`
    : "Recogida en dirección del cliente";
  const contactLabel = [receipt.pickup_request.contact_name, receipt.pickup_request.contact_phone]
    .filter(Boolean)
    .join(" · ") || receipt.customer?.phone || "";
  const packageRows = receipt.items
    .map((item) => {
      const recipient = [item.recipient_name, item.recipient_phone].filter(Boolean).join(" · ");
      const address = [item.delivery_address_line1, item.delivery_address_complement, item.delivery_zone, item.delivery_city]
        .filter(Boolean)
        .join(", ");
      const difference = [item.exception_code, item.exception_notes].filter(Boolean).join(" · ");
      const evidence = item.evidence?.length
        ? `<br><small>Evidencia: ${item.evidence.length}${item.evidence[0]?.url ? ` · <a href="${escapeHtml(item.evidence[0].url)}" target="_blank" rel="noreferrer">ver foto</a>` : ""}</small>`
        : "";

      return `
        <tr>
          <td>${escapeHtml(item.package_index ? `Paquete ${item.package_index}` : item.id)}</td>
          <td><strong>${escapeHtml(item.guide_number || item.tracking_code || "Sin guía")}</strong><br>${escapeHtml(recipient)}</td>
          <td>${escapeHtml(address)}</td>
          <td class="${resultTone(item.result)}"><strong>${escapeHtml(item.result_label)}</strong>${difference ? `<br><small>${escapeHtml(difference)}</small>` : ""}${evidence}</td>
        </tr>`;
    })
    .join("");

  return `
    <html>
      <head>
        <title>Comprobante ${escapeHtml(receipt.receipt_code)}</title>
        <style>
          @page { size: A4; margin: 14mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #172033; margin: 0; font-size: 11px; }
          h1 { margin: 0; font-size: 22px; }
          h2 { margin: 22px 0 8px; font-size: 14px; }
          p { margin: 3px 0; }
          .header { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #d60072; padding-bottom: 12px; }
          .brand { color: #d60072; font-weight: 800; letter-spacing: 0.08em; }
          .meta { text-align: right; }
          .status { display: inline-block; margin-top: 6px; border-radius: 999px; padding: 4px 8px; background: ${receipt.summary.has_differences ? "#fff1f2" : "#ecfdf5"}; color: ${receipt.summary.has_differences ? "#be123c" : "#047857"}; font-weight: 700; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-top: 14px; }
          .label { color: #667085; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; }
          .value { font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border-bottom: 1px solid #dfe3ea; padding: 7px 6px; text-align: left; vertical-align: top; }
          th { background: #f5f7fa; color: #475467; font-size: 9px; text-transform: uppercase; }
          .ok { color: #047857; }
          .difference { color: #be123c; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
          .metric { border: 1px solid #dfe3ea; border-radius: 6px; padding: 8px; }
          .metric strong { display: block; font-size: 16px; }
          .footer { border-top: 1px solid #dfe3ea; margin-top: 22px; padding-top: 8px; color: #667085; font-size: 9px; }
          small { font-size: 9px; }
        </style>
      </head>
      <body>
        <header class="header">
          <div>
            <div class="brand">DANHEI EXPRESS</div>
            <h1>Comprobante de recepción</h1>
            <p>Documento interno de ingreso y custodia inicial.</p>
          </div>
          <div class="meta">
            <div><span class="label">Lote</span><br><strong>${escapeHtml(receipt.receipt_code)}</strong></div>
            <div class="status">${escapeHtml(receipt.status_label)}</div>
          </div>
        </header>

        <section class="grid">
          <div><div class="label">Solicitud de ingreso</div><div class="value">${escapeHtml(receipt.pickup_request.pickup_code || "-")}</div></div>
          <div><div class="label">Fecha de recepción</div><div class="value">${escapeHtml(dateLabel(receipt.received_at))}</div></div>
          <div><div class="label">Cliente / remitente comercial</div><div class="value">${escapeHtml(customerLabel)}</div><p>${escapeHtml(contactLabel)}</p></div>
          <div><div class="label">Sede operativa</div><div class="value">${escapeHtml(locationLabel)}</div></div>
          <div><div class="label">Recibió físicamente</div><div class="value">${escapeHtml(receipt.received_by.name || "Usuario de sesión")}</div><p>${escapeHtml(receipt.received_by.phone || "")}</p></div>
          <div><div class="label">Entregó el paquete</div><div class="value">${escapeHtml(receipt.delivered_by.name || receipt.pickup_request.contact_name || "No informado")}</div><p>${escapeHtml(receipt.delivered_by.relationship || "")}</p></div>
        </section>

        <h2>Resumen de conciliación</h2>
        <div class="summary">
          <div class="metric"><span class="label">Esperados</span><strong>${receipt.summary.expected_packages}</strong></div>
          <div class="metric"><span class="label">Recibidos</span><strong>${receipt.summary.received_packages}</strong></div>
          <div class="metric"><span class="label">Rechazados</span><strong>${receipt.summary.rejected_packages}</strong></div>
          <div class="metric"><span class="label">Faltantes</span><strong>${receipt.summary.missing_packages}</strong></div>
        </div>

        <h2>Detalle de paquetes</h2>
        <table>
          <thead><tr><th>Paquete</th><th>Guía / destinatario</th><th>Dirección de entrega</th><th>Resultado</th></tr></thead>
          <tbody>${packageRows}</tbody>
        </table>

        ${receipt.delivered_by.notes ? `<p style="margin-top:14px"><span class="label">Observación de entrega</span><br>${escapeHtml(receipt.delivered_by.notes)}</p>` : ""}
        <footer class="footer">Generado desde el panel administrativo el ${escapeHtml(dateLabel(receipt.generated_at))}. Este comprobante documenta la conciliación y no reemplaza la guía de transporte.</footer>
      </body>
    </html>`;
}

export function PrintReceptionReceiptButton({
  receipt,
  label = "Imprimir / guardar PDF",
}: {
  receipt: PickupReceptionReceiptDTO;
  label?: string;
}) {
  const handlePrint = () => {
    const win = window.open("", "_blank", "width=900,height=800");
    if (!win) return;
    win.document.open();
    win.document.write(receiptHtml(receipt));
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
    >
      {label}
    </button>
  );
}
