import { expect, test, type Page } from "@playwright/test";
import { E2E_PHOTO, buildShipmentDetail, withSession } from "./support/mock-api";

const zonesOn = process.env.NEXT_PUBLIC_ZONES_UI_ENABLED === "true";

function shipmentListRequest(page: Page, predicate: (url: URL) => boolean) {
  return page.waitForRequest((request) => {
    const url = new URL(request.url());
    return /\/api\/shipments$/.test(url.pathname) && request.method() === "GET" && predicate(url);
  });
}

test.describe("Paquetes: listado por estado", () => {
  test("los chips filtran por estado y agrupan estados reales", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await page.goto("/pedidos");

    const chips = page.getByRole("group", { name: "Filtrar por estado" });
    for (const label of ["Todos", "Registrado", "En bodega", "Con el piloto", "En ruta", "Entregado", "Novedad", "Devuelto", "Cancelado"]) {
      await expect(chips.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await expect(chips.getByRole("button", { name: "Todos", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Paquetes en este filtro")).toBeVisible();
    await expect(page.getByText("Total Guías Hoy")).toHaveCount(0);

    const issueRequest = shipmentListRequest(page, (url) => url.searchParams.get("status") === "issue" && url.searchParams.has("page"));
    await chips.getByRole("button", { name: "Novedad", exact: true }).click();
    await issueRequest;
    await expect(chips.getByRole("button", { name: "Novedad", exact: true })).toHaveAttribute("aria-pressed", "true");

    // "En ruta" junta dos estados de la API: se pide cada uno.
    const assigned = shipmentListRequest(page, (url) => url.searchParams.get("status") === "assigned_to_route");
    const inTransit = shipmentListRequest(page, (url) => url.searchParams.get("status") === "in_transit");
    await chips.getByRole("button", { name: "En ruta", exact: true }).click();
    await Promise.all([assigned, inTransit]);
  });

  test("cambiar la fecha recarga el listado", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await page.goto("/pedidos");
    await expect(page.getByRole("cell", { name: "#DHE00011" }).first()).toBeVisible();

    const reload = shipmentListRequest(page, (url) => url.searchParams.get("date_from") === "2026-01-15");
    await page.getByLabel("Desde").fill("2026-01-15");
    await reload;
  });

  test("abrir un paquete lleva a su ficha", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await page.goto("/pedidos");

    await page.getByRole("button", { name: "Ver detalle de #DHE00011" }).click();
    await page.waitForURL("**/pedidos/11");
    await expect(page.getByRole("heading", { level: 1, name: "#DHE00011" })).toBeVisible();
  });

  if (!zonesOn) {
    test("sin zonas: la tabla no muestra la columna Zona", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await withSession(page);
      await page.goto("/pedidos");
      await expect(page.getByRole("cell", { name: "#DHE00011" }).first()).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Zona" })).toHaveCount(0);
      await expect(page.getByText("Sin zona")).toHaveCount(0);
    });
  }
});

test.describe("Paquetes: ficha simple", () => {
  test("encabezado con resumen, destinatario, piloto actual y cobro", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await page.goto("/pedidos/11");

    await expect(page.getByRole("heading", { level: 1, name: "#DHE00011" })).toBeVisible();
    // Tras el traspaso, la hora es la del piloto actual (Beta), no la de Alfa.
    await expect(page.getByTestId("shipment-summary")).toHaveText(/^Con Piloto Beta desde las /);
    await expect(page.getByText("Laura Gómez")).toBeVisible();
    await expect(page.getByRole("link", { name: "3105551234" })).toHaveAttribute("href", "tel:3105551234");
    await expect(page.getByText("Apto 402")).toBeVisible();
    await expect(page.getByText("Referencia: Frente al parque")).toBeVisible();
    await expect(page.getByText("Tienda Demo")).toBeVisible();
    await expect(page.getByText("Contra entrega", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Imprimir guía" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar monto" })).toBeVisible();

    // Sin paso a paso ni jerga.
    await expect(page.getByLabel("Progreso")).toHaveCount(0);
    await expect(page.getByRole("main").getByText(/revisi[oó]n/i)).toHaveCount(0);

    // Herramientas de ubicación plegadas hasta que se piden.
    await expect(page.getByRole("button", { name: "Buscar la dirección en el mapa" })).toHaveCount(0);
    await page.getByRole("button", { name: "Corregir ubicación" }).click();
    await expect(page.getByRole("button", { name: "Buscar la dirección en el mapa" })).toBeVisible();
  });

  test("editar monto guarda con una acción pequeña", async ({ page }) => {
    await withSession(page);
    await page.goto("/pedidos/11");
    await page.getByRole("button", { name: "Editar monto" }).click();
    const dialog = page.getByRole("dialog", { name: "Editar monto a cobrar" });
    await dialog.getByLabel("Monto").fill("55000");
    const put = page.waitForRequest((request) => /\/api\/shipments\/11$/.test(new URL(request.url()).pathname) && request.method() === "POST");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    const request = await put;
    expect(request.postData() ?? "").toContain("55000");
    await expect(page.getByText("Monto actualizado")).toBeVisible();
  });

  test("historial armado en el panel cuando la API no tiene /timeline (404)", async ({ page }) => {
    await withSession(page);
    await page.goto("/pedidos/11");

    const history = page.getByRole("list", { name: "Historial" });
    await expect(history.getByText("Pasó de Piloto Alfa a Piloto Beta")).toBeVisible();
    await expect(history.getByText("Entregado a Piloto Alfa")).toBeVisible();
    await expect(history.getByText("Salió a ruta")).toBeVisible();
    await expect(history.getByText("Paquete registrado")).toBeVisible();
    // El cambio de estado "en bodega" y el evento de custodia son el mismo hecho: una sola vez.
    await expect(history.getByText("Recibido en bodega")).toHaveCount(1);
    await expect(history.getByTestId("timeline-entry")).toHaveCount(5);
    // Orden cronológico: lo más viejo arriba.
    await expect(history.getByTestId("timeline-entry").first()).toContainText("Paquete registrado");
    await expect(history.getByTestId("timeline-entry").last()).toContainText("Salió a ruta");
    // Sin aviso de error por la ruta que falta.
    await expect(page.getByRole("main").getByText(/No se pudo/)).toHaveCount(0);
  });

  test("historial desde GET /shipments/{id}/timeline cuando existe", async ({ page }) => {
    await withSession(page);
    await page.route("**/api/shipments/11/timeline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            { id: "status:1", at: "2026-09-26T08:00:00-05:00", kind: "created", title: "Paquete registrado", detail: null, actor: "Admin", from: null, to: null, photos: [] },
            { id: "custody:9", at: "2026-09-26T09:00:00-05:00", kind: "transferred", title: "Pasó de Piloto Uno a Piloto Dos", detail: "Escaneado por Piloto Dos · condición: buena", actor: "Piloto Dos", from: "Piloto Uno", to: "Piloto Dos", photos: [] },
            { id: "attempt:4", at: "2026-09-26T15:15:00-05:00", kind: "delivered", title: "Entregado al destinatario", detail: null, actor: "Piloto Dos", from: null, to: null, photos: [{ id: 7, url: E2E_PHOTO, type: "delivery_photo" }] },
          ],
        }),
      });
    });
    await page.goto("/pedidos/11");

    const history = page.getByRole("list", { name: "Historial" });
    await expect(history.getByTestId("timeline-entry")).toHaveCount(3);
    await expect(history.getByText("Pasó de Piloto Uno a Piloto Dos")).toBeVisible();
    await expect(history.getByText("Escaneado por Piloto Dos · condición: buena")).toBeVisible();
    // Los datos del respaldo no se mezclan.
    await expect(history.getByText("Pasó de Piloto Alfa a Piloto Beta")).toHaveCount(0);

    // Miniatura en el historial → visor.
    await history.getByRole("button", { name: /Ver foto 1 de «Entregado al destinatario»/ }).click();
    await expect(page.getByRole("dialog", { name: "Foto ampliada" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Foto ampliada" })).toHaveCount(0);
  });

  test("fotos: galería con la foto de ingreso y las de entrega/novedad", async ({ page }) => {
    await withSession(page);
    await page.route(/\/api\/shipments\/11$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildShipmentDetail({
            status: "issue",
            issue_note: "Dirección errada",
            delivery_attempts: [
              {
                id: 31,
                status: "not_delivered",
                notes: "Dirección errada",
                finished_at: new Date(Date.now() - 10 * 60_000).toISOString(),
                evidence: [
                  { id: 41, evidence_type: "issue_photo", url: `${E2E_PHOTO}#novedad-1` },
                  { id: 42, evidence_type: "issue_photo", url: `${E2E_PHOTO}#novedad-2` },
                ],
              },
            ],
          })
        ),
      });
    });
    await page.goto("/pedidos/11");

    await expect(page.getByTestId("shipment-summary")).toHaveText("Novedad abierta: Dirección errada");
    const gallery = page.getByRole("list", { name: "Fotos del paquete" });
    await expect(gallery.getByRole("listitem")).toHaveCount(3);
    await expect(gallery.getByRole("button", { name: "Ver foto: Ingreso" })).toBeVisible();
    await expect(gallery.getByRole("button", { name: "Ver foto: Novedad" })).toHaveCount(2);
    await expect(page.getByRole("list", { name: "Historial" }).getByText("No se pudo entregar: Dirección errada")).toBeVisible();

    await gallery.getByRole("button", { name: "Ver foto: Ingreso" }).click();
    const viewer = page.getByRole("dialog", { name: "Foto ampliada" });
    await expect(viewer).toContainText("1 de 3");
    await viewer.getByRole("button", { name: "Foto siguiente" }).click();
    await expect(viewer).toContainText("2 de 3");
  });

  test("agregar foto envía photos[] a /evidence", async ({ page }) => {
    await withSession(page);
    await page.goto("/pedidos/11");

    const upload = page.waitForRequest(
      (request) => /\/api\/shipments\/11\/evidence$/.test(new URL(request.url()).pathname) && request.method() === "POST"
    );
    await page.getByTestId("add-photo-input").setInputFiles({
      name: "entrega.png",
      mimeType: "image/png",
      buffer: Buffer.from(E2E_PHOTO.split(",")[1], "base64"),
    });
    const request = await upload;
    expect(request.postData() ?? "").toContain('name="photos[]"');
    await expect(page.getByText("Foto agregada")).toBeVisible();
  });

  test("si la API aún no permite agregar fotos (404), el botón se oculta sin error", async ({ page }) => {
    await withSession(page);
    await page.route("**/api/shipments/11/evidence", async (route) => {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "Not Found" }) });
    });
    await page.goto("/pedidos/11");

    await expect(page.getByRole("button", { name: "Agregar foto" })).toBeVisible();
    await page.getByTestId("add-photo-input").setInputFiles({
      name: "entrega.png",
      mimeType: "image/png",
      buffer: Buffer.from(E2E_PHOTO.split(",")[1], "base64"),
    });
    await expect(page.getByText("Por ahora no se pueden agregar fotos desde el panel.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Agregar foto" })).toHaveCount(0);
  });

  test("móvil: la ficha se lee completa en 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await withSession(page);
    await page.goto("/pedidos");
    await page.locator(".lg\\:hidden").getByRole("button", { name: "Detalle" }).first().click();
    await page.waitForURL("**/pedidos/11");
    await expect(page.getByRole("heading", { level: 1, name: "#DHE00011" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Historial" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
