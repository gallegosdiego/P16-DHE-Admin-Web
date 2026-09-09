import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

async function mockBodegaData(page: import("@playwright/test").Page) {
  await page.route("**/api/routes/dispatch-board**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date: "2026-07-29",
        summary: {
          total: 3,
          by_size: { small: 1, medium: 1, large: 1, unspecified: 0 },
          by_zone: { Norte: 2, "Sin zona": 1 },
          fragile: 1,
          missing_coordinates: 1,
          total_weight_kg: 7.75,
        },
        groups: [
          {
            zone: null,
            city: null,
            total: 1,
            by_size: { small: 0, medium: 0, large: 1, unspecified: 0 },
            fragile_count: 0,
            items: [
              {
                id: 30,
                tracking_code: "DHE00030",
                display_code: "#DHE00030",
                status: "in_warehouse",
                recipient_name: "Cliente Sin Zona",
                recipient_phone: "3009998877",
                recipient_address: "Calle 100 #Sin Número",
                recipient_zone: null,
                recipient_city: "Bogotá",
                recipient_lat: null,
                recipient_lng: null,
                size_code: "large",
                size_label: "Grande",
                is_fragile: false,
                approx_weight_kg: 2.0,
                payment_type: "cash_on_delivery",
                cod_amount: 50000,
                shipping_cost: 15000,
                driver_fee: 4000,
                delivery_instructions: null,
                created_at: "2026-07-29T09:00:00Z",
                custody: { new_custodian_type: "hub", new_custodian_name: "Sede principal" },
              },
            ],
          },
          {
            zone: "Norte",
            city: "Bogotá",
            total: 2,
            by_size: { small: 1, medium: 1, large: 0, unspecified: 0 },
            fragile_count: 1,
            items: [
              {
                id: 31,
                tracking_code: "DHE00031",
                display_code: "#DHE00031",
                status: "in_warehouse",
                recipient_name: "Cliente Norte",
                recipient_phone: "3001234567",
                recipient_address: "Calle 80 #10-20",
                recipient_zone: "Norte",
                recipient_city: "Bogotá",
                recipient_lat: 4.67,
                recipient_lng: -74.05,
                size_code: "small",
                size_label: "Pequeño",
                is_fragile: true,
                approx_weight_kg: 1.25,
                payment_type: "paid",
                cod_amount: 0,
                shipping_cost: 12000,
                driver_fee: 3000,
                delivery_instructions: "Dejar en portería",
                created_at: "2026-07-29T08:30:00Z",
                custody: { new_custodian_type: "hub", new_custodian_name: "Sede principal" },
              },
              {
                id: 32,
                tracking_code: "DHE00032",
                display_code: "#DHE00032",
                status: "in_warehouse",
                recipient_name: "Cliente Norte 2",
                recipient_phone: "3007654321",
                recipient_address: "Carrera 15 #90-10",
                recipient_zone: "Norte",
                recipient_city: "Bogotá",
                recipient_lat: 4.68,
                recipient_lng: -74.05,
                size_code: "medium",
                size_label: "Mediano",
                is_fragile: false,
                approx_weight_kg: 4.5,
                payment_type: "cash_on_delivery",
                cod_amount: 35000,
                shipping_cost: 14000,
                driver_fee: 3500,
                delivery_instructions: null,
                created_at: "2026-07-29T09:15:00Z",
                custody: { new_custodian_type: "hub", new_custodian_name: "Sede principal" },
              },
            ],
          },
        ],
        shipments: [],
      }),
    });
  });
}

test.describe("Pantalla de Bodega (OT-B1)", () => {
  test("Desktop 1280px: visualiza grupos por localidad con conteos, grupo Sin zona y tabla detallada", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await mockBodegaData(page);
    await page.goto("/bodega");

    // Validar título y ayuda
    await expect(page.getByRole("heading", { name: "Bodega" })).toBeVisible();
    await expect(page.getByText("Organización física por localidades y zonas de destino")).toBeVisible();

    // Validar KPIs
    await expect(page.getByText("Total en bodega")).toBeVisible();
    await expect(page.getByText("Localidades", { exact: true })).toBeVisible();
    await expect(page.getByText("Sin zona").first()).toBeVisible();

    // Validar grupo "Sin zona" presente y visible
    await expect(page.getByText("Trabajo pendiente en operación")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ver sin zona" })).toBeVisible();

    // Validar grupo "Norte" con su conteo
    const norteButton = page.getByRole("button", { name: /Norte/i });
    await expect(norteButton).toBeVisible();
    await expect(norteButton).toContainText("2");

    // Hacer click en Norte para ver su tabla
    await norteButton.click();

    // Validar tabla detallada con columnas
    await expect(page.getByRole("heading", { name: /Norte \(2 paquetes\)/i })).toBeVisible();
    await expect(page.getByText("#DHE00031")).toBeVisible();
    await expect(page.getByText("Cliente Norte", { exact: true })).toBeVisible();
    await expect(page.getByText("Calle 80 #10-20")).toBeVisible();
    await expect(page.getByText("#DHE00032")).toBeVisible();

    // Validar filtro de búsqueda
    const searchInput = page.getByPlaceholder(/Buscar por guía, destinatario/i);
    await searchInput.fill("Cliente Norte 2");
    await expect(page.getByText("#DHE00032")).toBeVisible();
    await expect(page.getByText("#DHE00031")).not.toBeVisible();
    await searchInput.clear();
  });

  test("Mobile 375px: visualiza acordeón de localidades y tarjetas apilables sin desborde", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await withSession(page);
    await mockBodegaData(page);
    await page.goto("/bodega");

    // Header visible
    await expect(page.getByRole("heading", { name: "Bodega" })).toBeVisible();

    // Validar tarjetas de acordeón en móvil
    const norteAccordion = page.getByRole("button", { name: /Norte/i }).first();
    await expect(norteAccordion).toBeVisible();
    await expect(norteAccordion).toContainText("2");

    // Expandir Norte
    await norteAccordion.click();

    // Validar MobileListCard
    await expect(page.getByText("#DHE00031")).toBeVisible();
    await expect(page.getByText(/Cliente Norte · Calle 80 #10-20/i)).toBeVisible();
    await expect(page.getByText("#DHE00032")).toBeVisible();
  });

  test("KPI 'En bodega' presente en el panel de inicio", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await page.goto("/");

    // Validar presencia del KPI "En bodega"
    await expect(page.getByText("En bodega")).toBeVisible();
    await expect(page.getByText("Paquetes hoy")).toBeVisible();
    await expect(page.getByText("En ruta")).toBeVisible();
    await expect(page.getByText("Entregados")).toBeVisible();
  });
});
