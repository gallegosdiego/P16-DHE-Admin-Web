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
    await expect(page.getByText("COD cobrado en efectivo")).toBeVisible();
    await expect(page.getByText("Efectivo por entregar", { exact: true })).toBeVisible();
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

  // El modo oscuro está en pausa en v2 (toggle oculto); el caso valida que
  // añadir la clase dark no rompa el recorrido de pestañas.
  test("tabs dark mode renders correctly", async ({ page }) => {
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.getByRole("button", { name: /Cartera/ }).click();
    await page.getByRole("button", { name: /Gastos y N/ }).click();
    await page.getByRole("button", { name: /Flujo de Caja/ }).click();
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
    await page.getByRole("button", { name: /Flujo de Caja/ }).click();
    await expect(page.getByRole("heading", { name: /Proyección de flujo de caja/ })).toBeVisible();
  });

  test("las pestañas viejas de dinero de pilotos ya no existen", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Pago contra entrega" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pilotos", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Conciliación" })).toHaveAttribute("aria-pressed", "true");
  });

  test("conciliacion separa el pago digital del efectivo y lo confirma", async ({ page }) => {
    const digital = page.getByTestId("digital-payments-panel");
    await expect(digital.getByRole("heading", { name: "Pago digital — verificar" })).toBeVisible();
    await expect(digital).toContainText("#DHE00012");
    await expect(digital).toContainText("Nequi");
    await expect(page.getByText("Pago digital por verificar")).toBeVisible();

    // El panel de efectivo no ofrece la guía pagada por Nequi.
    const cashPanel = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Dinero COD que el piloto entrega a Danhei" }) });
    await expect(cashPanel).not.toContainText("#DHE00012");

    await digital.getByRole("checkbox").check();
    const requestPromise = page.waitForRequest((request) =>
      request.method() === "POST" && request.url().includes("/financial/driver-reconciliations/1/digital-verifications"),
    );
    await digital.getByRole("button", { name: "Confirmar que llegó" }).click();
    const request = await requestPromise;
    expect(request.headers()["idempotency-key"]).toBeTruthy();
    expect(request.postDataJSON()).toMatchObject({ obligation_ids: [302] });
    await expect(page.getByText("Pago digital confirmado.")).toBeVisible();
  });
});

test.describe("Financial Module - enlaces viejos", () => {
  for (const tab of ["cod", "conductores"]) {
    test(`?tab=${tab} abre Conciliación`, async ({ page }) => {
      await withSession(page);
      await page.goto(`/pagos?tab=${tab}`);
      await expect(page.getByRole("heading", { name: "Conciliación operativa" })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole("button", { name: "Conciliación" })).toHaveAttribute("aria-pressed", "true");
    });
  }

  test("?tab=cartera sigue abriendo Cartera con sus datos", async ({ page }) => {
    await withSession(page);
    await page.goto("/pagos?tab=cartera");
    await expect(page.getByRole("button", { name: /Cartera/ })).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
    await expect(page.getByText("Comercial Uno SAS").first()).toBeVisible();
  });
});
