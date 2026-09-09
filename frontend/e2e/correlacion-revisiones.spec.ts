import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

const mockCustodyReviews = [
  {
    id: 101,
    type: "auto_assigned_by_scan",
    type_label: "Auto-asignación por QR",
    status: "pending",
    shipment: {
      id: 701,
      tracking_code: "DHE-REV-001",
      display_code: "#DHE-REV-001",
      recipient_name: "Gonzalo Restrepo",
      recipient_address: "Calle 140 # 11-20",
      recipient_zone: "Usaquén",
      recipient_city: "Bogotá",
      status: "handed_to_driver",
      size_label: "Pequeño",
      is_fragile: false,
    },
    previous_driver: null,
    new_driver: { id: 1, name: "Carlos Mendoza" },
    previous_driver_name: null,
    new_driver_name: "Carlos Mendoza",
    occurred_at: "2026-09-09T08:15:00Z",
    acknowledged_by: null,
    acknowledged_at: null,
    notes: "Escaneado directamente en moto",
    created_at: "2026-09-09T08:15:00Z",
  },
  {
    id: 102,
    type: "custody_transferred",
    type_label: "Cambio de custodia entre pilotos",
    status: "pending",
    shipment: {
      id: 702,
      tracking_code: "DHE-REV-002",
      display_code: "#DHE-REV-002",
      recipient_name: "Camila Veloza",
      recipient_address: "Carrera 15 # 85-30",
      recipient_zone: "Chapinero",
      recipient_city: "Bogotá",
      status: "handed_to_driver",
      size_label: "Mediano",
      is_fragile: true,
    },
    previous_driver: { id: 2, name: "Andrés Silva" },
    new_driver: { id: 1, name: "Carlos Mendoza" },
    previous_driver_name: "Andrés Silva",
    new_driver_name: "Carlos Mendoza",
    occurred_at: "2026-09-09T08:45:00Z",
    acknowledged_by: null,
    acknowledged_at: null,
    notes: "Transferencia física en punto de recarga",
    created_at: "2026-09-09T08:45:00Z",
  },
  {
    id: 103,
    type: "returned_by_driver",
    type_label: "Devolución a bodega",
    status: "pending",
    shipment: {
      id: 703,
      tracking_code: "DHE-DEV-001",
      display_code: "#DHE-DEV-001",
      recipient_name: "Esteban Morales",
      recipient_address: "Calle 26 # 68-10",
      recipient_zone: "Fontibón",
      recipient_city: "Bogotá",
      status: "in_warehouse",
      size_label: "Grande",
      is_fragile: false,
    },
    previous_driver: { id: 3, name: "Felipe Gomez" },
    new_driver: null,
    previous_driver_name: "Felipe Gomez",
    new_driver_name: null,
    occurred_at: "2026-09-09T09:30:00Z",
    acknowledged_by: null,
    acknowledged_at: null,
    notes: "Devuelto por fuera de horario comercial",
    created_at: "2026-09-09T09:30:00Z",
  },
];

const mockRoutesWithCorrelation = [
  {
    id: 12,
    date: "2026-09-09",
    status: "planned",
    zone: "Norte",
    driver: { id: 1, name: "Carlos Mendoza", phone: "3001234567" },
    stops_count: 4,
    stops: [
      {
        id: 1001,
        sort_order: 1,
        status: "pending",
        correlation: "pending_check",
        shipment: {
          id: 601,
          display_code: "#DHE-COR-001",
          tracking_code: "DHE-COR-001",
          recipient_name: "Maria Sanchez",
          recipient_address: "Calle 100 # 15-20",
          status: "in_warehouse",
          custody: {
            event_type: "assigned",
            new_custodian_type: "hub",
            new_custodian_name: "Sede Principal",
          },
        },
      },
      {
        id: 1002,
        sort_order: 2,
        status: "pending",
        correlation: "checked",
        shipment: {
          id: 602,
          display_code: "#DHE-COR-002",
          tracking_code: "DHE-COR-002",
          recipient_name: "Jorge Ramirez",
          recipient_address: "Calle 116 # 9-45",
          status: "handed_to_driver",
          custody: {
            event_type: "scan_accepted",
            new_custodian_type: "driver",
            new_custodian_name: "Carlos Mendoza",
          },
        },
      },
      {
        id: 1003,
        sort_order: 3,
        status: "pending",
        correlation: "auto_assigned",
        shipment: {
          id: 603,
          display_code: "#DHE-COR-003",
          tracking_code: "DHE-COR-003",
          recipient_name: "Lucia Fernandez",
          recipient_address: "Carrera 7 # 120-10",
          status: "handed_to_driver",
          custody: {
            event_type: "auto_assigned_by_scan",
            new_custodian_type: "driver",
            new_custodian_name: "Carlos Mendoza",
          },
        },
      },
      {
        id: 1004,
        sort_order: 4,
        status: "pending",
        correlation: "transferred",
        shipment: {
          id: 604,
          display_code: "#DHE-COR-004",
          tracking_code: "DHE-COR-004",
          recipient_name: "Pedro Duarte",
          recipient_address: "Calle 134 # 19-50",
          status: "handed_to_driver",
          previous_driver_name: "Andrés Silva",
          custody: {
            event_type: "custody_transferred",
            new_custodian_type: "driver",
            new_custodian_name: "Carlos Mendoza",
            previous_custodian_name: "Andrés Silva",
          },
        },
      },
    ],
  },
];

async function setupCorrelationMocks(page: import("@playwright/test").Page) {
  let reviewsState = JSON.parse(JSON.stringify(mockCustodyReviews));
  let lastHandoverPayload: any = null;

  // Mock /custody-reviews
  await page.route("**/api/custody-reviews**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname.endsWith("/acknowledge-all")) {
      reviewsState = reviewsState.map((r: any) => ({
        ...r,
        status: "acknowledged",
        acknowledged_by: "Operario de mostrador",
        acknowledged_at: new Date().toISOString(),
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Todas las revisiones fueron certificadas.", updated: reviewsState.length }),
      });
      return;
    }

    const ackMatch = url.pathname.match(/\/custody-reviews\/(\d+)\/acknowledge/);
    if (ackMatch && method === "POST") {
      const id = parseInt(ackMatch[1], 10);
      reviewsState = reviewsState.map((r: any) =>
        r.id === id
          ? {
              ...r,
              status: "acknowledged",
              acknowledged_by: "Operario de mostrador",
              acknowledged_at: new Date().toISOString(),
            }
          : r
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Revisión certificada con éxito." }),
      });
      return;
    }

    // GET /custody-reviews
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: reviewsState,
        summary: {
          total_pending: reviewsState.filter((r: any) => r.status === "pending").length,
          auto_assigned_count: 1,
          transferred_count: 1,
          returned_count: 1,
        },
      }),
    });
  });

  // Mock /shipments/return-confirmations
  await page.route("**/api/shipments/return-confirmations**", async (route) => {
    let scanCode = "";
    try {
      const json = route.request().postDataJSON();
      scanCode = json?.scan_code || "";
    } catch {
      const raw = route.request().postData() || "";
      const m = raw.match(/name="scan_code"\r?\n\r?\n([^\r\n-]+)/);
      scanCode = m ? m[1].trim() : "";
    }

    reviewsState = reviewsState.map((r: any) =>
      r.shipment?.display_code === scanCode || r.shipment?.tracking_code === scanCode
        ? {
            ...r,
            status: "acknowledged",
            acknowledged_by: "Recepción de bodega",
            acknowledged_at: new Date().toISOString(),
          }
        : r
    );

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Custodia de devolución confirmada en bodega.",
        shipment: {
          id: 703,
          tracking_code: scanCode,
          display_code: scanCode.startsWith("#") ? scanCode : `#${scanCode}`,
          status: "in_warehouse",
        },
        confirmed_at: new Date().toISOString(),
      }),
    });
  });

  // Mock /routes
  await page.route("**/api/routes**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname.includes("/dispatch-board")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          date: "2026-09-09",
          summary: { total: 4, by_size: {}, by_zone: {}, fragile: 0, missing_coordinates: 0, total_weight_kg: 4 },
          groups: [],
          shipments: [],
        }),
      });
      return;
    }

    if (url.pathname.includes("/handover") && method === "POST") {
      let notes = "";
      try {
        const json = route.request().postDataJSON();
        notes = json?.notes || "";
      } catch {
        const raw = route.request().postData() || "";
        const m = raw.match(/name="notes"\r?\n\r?\n([^\r\n-]+)/);
        notes = m ? m[1].trim() : "";
      }
      lastHandoverPayload = { notes };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Custodia transferida al piloto.", notes }),
      });
      return;
    }

    if (url.pathname.endsWith("/routes") || url.pathname.endsWith("/routes/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockRoutesWithCorrelation),
      });
      return;
    }

    await route.continue();
  });

  // Mock /drivers
  await page.route("**/api/drivers**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: 1, name: "Carlos Mendoza", phone: "3001234567", zone: "Norte" },
      ]),
    });
  });

  // Mock /notifications
  await page.route("**/api/notifications**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/unread-count")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 3 }) });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: 801,
            user_id: 1,
            type: "qr_auto_assignment",
            title: "Auto-asignación por QR (#DHE-REV-001)",
            body: "Carlos Mendoza escaneó un paquete no asignado.",
            action_url: "/revisiones",
            read_at: null,
            created_at: "2026-09-09T08:15:00Z",
          },
          {
            id: 802,
            user_id: 1,
            type: "custody_transfer",
            title: "Cambio de custodia entre pilotos (#DHE-REV-002)",
            body: "Andrés Silva → Carlos Mendoza",
            action_url: "/revisiones",
            read_at: null,
            created_at: "2026-09-09T08:45:00Z",
          },
          {
            id: 803,
            user_id: 1,
            type: "warehouse_return",
            title: "Devolución de paquete a bodega (#DHE-DEV-001)",
            body: "Felipe Gomez devolvió paquete a bodega.",
            action_url: "/revisiones",
            read_at: null,
            created_at: "2026-09-09T09:30:00Z",
          },
        ],
        current_page: 1,
        last_page: 1,
        per_page: 10,
        total: 3,
      }),
    });
  });

  return {
    getLastHandoverPayload: () => lastHandoverPayload,
  };
}

test.describe("OT-G3: Correlación visible, bandeja de revisiones y confirmación de custodia", () => {
  test("1. Módulo de asignación (Rutas 1280px): pinta los cuatro estados de correlación", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await setupCorrelationMocks(page);

    await page.goto("/rutas");

    const desktopStops = page.locator(".hidden.md\\:block");
    await expect(desktopStops.getByText("Pendiente de chequeo").first()).toBeVisible();
    await expect(desktopStops.getByText("Chequeado ✓").first()).toBeVisible();
    await expect(desktopStops.getByText("Auto-asignado por QR").first()).toBeVisible();
    await expect(desktopStops.getByText("Transferido").first()).toBeVisible();
    await expect(desktopStops.getByText("(Venía de: Andrés Silva)").first()).toBeVisible();

    // Validar enlace a revisión
    const reviewLinks = desktopStops.getByRole("link", { name: /Ver revisión →/i });
    await expect(reviewLinks.first()).toBeVisible();
  });

  test("2. Bandeja de revisiones (/revisiones 1280px): lista cronológica, motivos y flujo de certificación", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await setupCorrelationMocks(page);

    await page.goto("/revisiones");

    // Header y KPIs
    await expect(page.getByRole("heading", { name: "Bandeja de revisiones de custodia" })).toBeVisible();
    await expect(page.getByText("Total pendientes por certificar")).toBeVisible();
    await expect(page.getByText("Auto-asignaciones por QR")).toBeVisible();
    await expect(page.getByText("Cambios entre pilotos")).toBeVisible();
    await expect(page.getByText("Devoluciones a bodega", { exact: true })).toBeVisible();

    // Tabla de pendientes en desktop
    const table = page.locator("table");
    await expect(table.getByText("#DHE-REV-001")).toBeVisible();
    await expect(table.getByText("Gonzalo Restrepo")).toBeVisible();
    await expect(table.getByText("#DHE-REV-002")).toBeVisible();
    await expect(table.getByText("Camila Veloza")).toBeVisible();
    await expect(table.getByText("#DHE-DEV-001")).toBeVisible();

    // Certificar visto de la primera revisión (#DHE-REV-001)
    const certifyBtn = table.getByRole("button", { name: "Certificar visto" }).first();
    await certifyBtn.click();

    // Pestaña Certificadas
    await page.getByRole("button", { name: /Certificadas/i }).click();
    await expect(page.locator("table").getByText("Certificado ✓").first()).toBeVisible();
    await expect(page.locator("table").getByText("Operario de mostrador").first()).toBeVisible();
  });

  test("3. Campana de notificaciones: muestra los 3 tipos de eventos de custodia y navega a /revisiones", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await setupCorrelationMocks(page);

    await page.goto("/rutas");

    // Abrir campana de notificaciones por su aria-label
    const bellBtn = page.getByRole("button", { name: "Notificaciones" });
    await bellBtn.click();

    // Validar que aparecen las notificaciones de custodia
    await expect(page.getByText("Auto-asignación por QR (#DHE-REV-001)")).toBeVisible();
    await expect(page.getByText("Cambio de custodia entre pilotos (#DHE-REV-002)")).toBeVisible();
    await expect(page.getByText("Devolución de paquete a bodega (#DHE-DEV-001)")).toBeVisible();

    // Guardar evidencia 3 regenerada
    await page.screenshot({
      path: "C:/Users/HP Z480/.gemini/antigravity/brain/372252a7-f793-45e9-9f52-2ed68d0ed544/evidencia_otg3_3_campana_notificaciones.png",
      fullPage: false,
    });

    // Clic en la notificación -> navega a /revisiones
    await page.getByText("Auto-asignación por QR (#DHE-REV-001)").click();
    await expect(page).toHaveURL(/\/revisiones/);
    await expect(page.getByRole("heading", { name: "Bandeja de revisiones de custodia" })).toBeVisible();
  });

  test("4. Confirmación de devolución en bodega: digita código y confirma custodia", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await setupCorrelationMocks(page);

    await page.goto("/revisiones");

    // Abrir modal de devolución
    const returnBtn = page.getByRole("button", { name: /Confirmar devolución en bodega/i });
    await returnBtn.click();

    const dialog = page.getByRole("dialog", { name: "Confirmar recepción de custodia en bodega" });
    await expect(dialog).toBeVisible();

    // Digitar código de la guía
    const input = dialog.getByLabel("Código de la guía o token *");
    await input.fill("#DHE-DEV-001");

    // Confirmar
    await dialog.getByRole("button", { name: "Confirmar custodia en bodega" }).click();

    // Feedback en verde dentro del modal
    await expect(dialog.getByText("Custodia de devolución confirmada en bodega.")).toBeVisible();
    await expect(dialog.getByText("En bodega", { exact: true })).toBeVisible();
  });

  test("5. Custodia manual en Rutas: selector de motivo obligatorio y nota enviada", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    const helpers = await setupCorrelationMocks(page);

    await page.goto("/rutas");

    // Buscar parada pendiente y pulsar "Pasar custodia al piloto"
    const handoverBtn = page.locator(".hidden.md\\:block").getByRole("button", { name: "Pasar custodia al piloto" }).first();
    await handoverBtn.click();

    // Validar modal de motivo
    const dialog = page.getByRole("dialog", { name: "Confirmar traspaso de custodia" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Celular o escáner del piloto no disponible")).toBeVisible();

    // Seleccionar motivo "Urgencia en mostrador"
    await dialog.getByText("Urgencia en mostrador").click();

    // Confirmar traspaso
    await dialog.getByRole("button", { name: "Confirmar traspaso de custodia" }).click();

    // Verificar que el modal se cierra y la nota viajó
    await expect(dialog).not.toBeVisible();
    expect(helpers.getLastHandoverPayload()?.notes).toBe("Urgencia en mostrador");
  });

  test("6. Mobile 375px: correlación en Rutas y tarjetas de bandeja de revisiones", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await withSession(page);
    await setupCorrelationMocks(page);

    // 1. Rutas móvil
    await page.goto("/rutas");
    await expect(page.getByRole("heading", { name: /Rutas diarias/i })).toBeVisible();
    await expect(page.locator(".md\\:hidden").getByText("Pendiente de chequeo").first()).toBeVisible();

    // 2. Revisiones móvil
    await page.goto("/revisiones");
    await expect(page.getByRole("heading", { name: "Bandeja de revisiones de custodia" })).toBeVisible();
    const cards = page.locator("article");
    await expect(cards.first()).toBeVisible();
    await expect(cards.first()).toContainText("#DHE-REV-001");
  });
});
