import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Financial Module - Tabs", () => {
  test.beforeEach(async ({ page }) => {
    await withSession(page);
    await page.goto("/pagos");
    await expect(page.getByRole("heading", { name: "Finanzas" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Conciliación operativa" })).toBeVisible();
  });

  test("conciliacion separates pilot COD, pilot services and client funds", async ({ page }) => {
    await expect(page.getByText("COD cobrado")).toBeVisible();
    await expect(page.getByText("COD por entregar")).toBeVisible();
    await expect(page.getByText("Servicios por pagar")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dinero COD que el piloto entrega a Danhei" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Servicios que Danhei paga al piloto" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Historial de remesas COD" })).toBeVisible();
    await expect(page.getByText("COD-20260716-DEMO")).toBeVisible();
    await expect(page.getByRole("button", { name: "Imprimir / PDF" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Descargar CSV" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Cuenta del cliente" }).click();
    await expect(page.getByText("COD disponible", { exact: true })).toBeVisible();
    await expect(page.getByText("Pendiente por transferir")).toBeVisible();
    await expect(page.getByRole("heading", { name: "COD que Danhei transfiere al cliente" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Historial de transferencias al cliente" })).toBeVisible();
    await expect(page.getByText("CLI-20260716-DEMO")).toBeVisible();
  });

  test("conciliacion posts a selected remittance with an idempotency key", async ({ page }) => {
    const panel = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Dinero COD que el piloto entrega a Danhei" }) });
    await panel.getByRole("checkbox").check();

    const requestPromise = page.waitForRequest((request) =>
      request.method() === "POST" && request.url().includes("/financial/driver-reconciliations/1/remittances"),
    );
    await panel.getByRole("button", { name: /Registrar remesa/ }).click();
    const request = await requestPromise;

    expect(request.headers()["idempotency-key"]).toBeTruthy();
    expect(request.postDataJSON()).toMatchObject({
      amount: 80000,
      method: "cash",
      allocations: [{ id: 301, amount: 80000 }],
    });
    await expect(page.getByText("Movimiento registrado correctamente.")).toBeVisible();
  });

  test("conciliacion creates an opening balance with support", async ({ page }) => {
    const openingPanel = page.locator("details").filter({ hasText: "Apertura histórica de saldos" });
    await openingPanel.getByText("Apertura histórica de saldos").click();
    await openingPanel.locator("form select").nth(1).selectOption("1");
    await openingPanel.getByLabel("Saldo COP").fill("120000");
    await openingPanel.getByLabel("Soporte o acta de corte").fill("ACTA-QA-002");

    const requestPromise = page.waitForRequest((request) =>
      request.method() === "POST" && request.url().endsWith("/financial/opening-entries"),
    );
    await openingPanel.getByRole("button", { name: "Registrar apertura" }).click();
    const request = await requestPromise;

    expect(request.headers()["idempotency-key"]).toBeTruthy();
    expect(request.postDataJSON()).toMatchObject({
      account_type: "driver_cod_due",
      driver_id: 1,
      amount: 120000,
      support_reference: "ACTA-QA-002",
    });
    await expect(page.getByText("Saldo de apertura registrado con soporte y aprobación.")).toBeVisible();
  });

  test("conciliacion creates an audited reversal instead of deleting a movement", async ({ page }) => {
    await expect(page.getByText("Saldo $ 100.000 → $ 80.000")).toBeVisible();
    await page.getByRole("button", { name: "Reversar" }).first().click();
    await page.getByPlaceholder("Motivo obligatorio de al menos 10 caracteres").fill("Diferencia confirmada durante el cierre de caja.");

    const requestPromise = page.waitForRequest((request) =>
      request.method() === "POST" && request.url().includes("/financial/driver-remittances/601/reverse"),
    );
    await page.getByRole("button", { name: "Crear reverso" }).click();
    const request = await requestPromise;

    expect(request.headers()["idempotency-key"]).toBeTruthy();
    expect(request.postDataJSON()).toEqual({
      reason: "Diferencia confirmada durante el cierre de caja.",
    });
    await expect(page.getByText("Reverso registrado sin borrar el movimiento original.")).toBeVisible();
  });

  test("tab resumen shows financial KPIs and P&L", async ({ page }) => {
    await page.getByRole("button", { name: "Dashboard" }).click();
    await expect(page.getByRole("heading", { name: "Finanzas" })).toBeVisible();
    await expect(page.getByText("Ingreso mes")).toBeVisible();
    await expect(page.getByText("Costos mes")).toBeVisible();
    await expect(page.getByText("Utilidad neta")).toBeVisible();
    // El mini P&L y la barra de contraentrega del dashboard viejo hoy son la
    // pestaña "P&L" y el "Resumen operativo" del día.
    await expect(page.getByRole("button", { name: "P&L" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Resumen operativo/ })).toBeVisible();
  });

  // La cartera se renderiza doble (tabla de escritorio + tarjetas móviles), por
  // eso los textos se buscan con .first() y la ausencia se afirma con count.
  test("tab cartera shows debtors with filters", async ({ page }) => {
    await page.getByRole("button", { name: /Cartera/ }).click();
    await expect(page.getByText("Comercial Uno SAS").first()).toBeVisible();
    await expect(page.getByText("Textiles Dos").first()).toBeVisible();
    await page.getByRole("button", { name: "Vencidos" }).click();
    await expect(page.getByText("Comercial Uno SAS").first()).toBeVisible();
    await expect(page.getByText("Textiles Dos")).toHaveCount(0);
  });

  test("tab cartera whatsapp link has correct format", async ({ page }) => {
    await page.getByRole("button", { name: /Cartera/ }).click();
    const link = page.getByRole("link", { name: "WhatsApp" }).first();
    // v2 dejó el enlace sin mensaje precargado ("recordamos" ya no viaja en el
    // href); se valida el número. Observación registrada por dirección.
    await expect(link).toHaveAttribute("href", /wa\.me\/57/);
  });

  test("tab pilotos renders section structure", async ({ page }) => {
    await page.getByRole("button", { name: /Pilotos/ }).click();
    // These headings are always rendered (not data-dependent)
    await expect(page.getByRole("heading", { name: /Tablero de recaudo/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Liquidaci/ })).toBeVisible();
  });

  test("tab gastos shows expenses and payroll split", async ({ page }) => {
    await page.getByRole("button", { name: /Gastos y N/ }).click();
    await expect(page.getByRole("heading", { name: /Gastos fijos/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /N/ })).toBeVisible();
    await expect(page.getByText("Arriendo oficina")).toBeVisible();
    await expect(page.getByText("Sandra Lopez")).toBeVisible();
  });

  test("tab gastos expand history works", async ({ page }) => {
    await page.getByRole("button", { name: /Gastos y N/ }).click();
    await page.getByRole("button", { name: "Historial" }).first().click();
    // El historial ahora es un panel bajo la tarjeta del gasto, no una tabla.
    await expect(page.getByText("Historial de pagos").first()).toBeVisible();
    await expect(page.getByText(/Periodo 2026-06-01/).first()).toBeVisible();
  });

  // La pestaña se llama "Pago contra entrega" desde el rediseño v2 (la sigla
  // COD está prohibida en la interfaz).
  test("tab contraentrega renders section structure", async ({ page }) => {
    await page.getByRole("button", { name: "Pago contra entrega" }).click();
    // These headings are always rendered (not data-dependent)
    await expect(page.getByRole("heading", { name: /Resumen de contraentrega/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Crear conciliaci/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Historial de conciliaciones/ })).toBeVisible();
  });

  test("tab contraentrega creates settlement", async ({ page }) => {
    await page.getByRole("button", { name: "Pago contra entrega" }).click();
    await expect(page.getByRole("heading", { name: /Resumen de contraentrega/ })).toBeVisible();
    await page.locator("select").first().selectOption("1");
    await page.getByLabel("Total liquidado").fill("600000");
    await page.getByRole("button", { name: "Crear" }).click();
    await expect(page.getByText("Conciliación creada")).toBeVisible();
  });

  // El modo oscuro está en pausa en v2 (toggle oculto); el caso valida que
  // añadir la clase dark no rompa el recorrido de pestañas.
  test("tabs dark mode renders correctly", async ({ page }) => {
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.getByRole("button", { name: /Cartera/ }).click();
    await page.getByRole("button", { name: /Pilotos/ }).click();
    await page.getByRole("button", { name: /Gastos y N/ }).click();
    await page.getByRole("button", { name: "Pago contra entrega" }).click();
    await expect(page.getByRole("heading", { name: "Finanzas" })).toBeVisible();
  });

  test("tabs mobile scroll horizontal works", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const tabBar = page
      .locator(".overflow-x-auto")
      .filter({ has: page.getByRole("button", { name: "Dashboard" }) })
      .first();
    await expect(tabBar).toBeVisible();
    await tabBar.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await page.getByRole("button", { name: "Pago contra entrega" }).click();
    await expect(page.getByRole("heading", { name: /Historial de conciliaciones/ })).toBeVisible();
  });
});
