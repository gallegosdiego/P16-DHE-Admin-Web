import { test, expect, type Page } from "@playwright/test";
import { withSession } from "./support/mock-api";

async function mockDayClose(page: Page) {
  await page.route("**/api/routes/day-close**", async (route) =>
    route.fulfill({
      json: {
        date: "2026-09-09",
        drivers: [
          {
            driver_id: 1,
            driver_name: "Piloto QA",
            packages: [
              { id: 42, display_code: "#DHE00042", status: "assigned_to_route" },
              { id: 43, display_code: "#DHE00043", status: "issue" },
            ],
            counts: { departed: 3, delivered: 1, issues: 1, on_motorcycle: 2, returned_to_warehouse: 0 },
            cod: { expected: 120000, registered: 80000 },
            routes: [],
            day_settled: false,
          },
        ],
      },
    })
  );
}

test("cierre de día carga pilotos y permite seleccionar retorno", async ({ page }) => {
  await withSession(page);
  await mockDayClose(page);
  await page.goto("/cierre-dia");
  await expect(page.getByText("Piloto QA")).toBeVisible();
  await page.getByRole("checkbox").first().check();
  await expect(page.getByRole("button", { name: /Recibir en bodega \(1\)/ })).toBeVisible();
});

test("cierre de día muestra el efectivo que debe entregar el piloto y la diferencia", async ({ page }) => {
  await withSession(page);
  await mockDayClose(page);
  await page.goto("/cierre-dia");
  const cod = page.getByTestId("cod-block");
  await expect(cod).toContainText("Debe entregar");
  await expect(cod).toContainText("80.000");
  await expect(cod).toContainText("en efectivo");
  await expect(cod).toContainText("Diferencia: faltan");
  await expect(cod).toContainText("40.000");
});

test("cierre de día muestra recibidos y rechazados con su motivo", async ({ page }) => {
  await withSession(page);
  await mockDayClose(page);
  await page.route("**/api/shipments/warehouse-returns", async (route) =>
    route.fulfill({
      json: {
        accepted: [{ shipment_id: 42, display_code: "#DHE00042", status: "in_warehouse" }],
        rejected: [{ shipment_id: 43, reason: "El paquete no está bajo custodia del piloto." }],
      },
    })
  );
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/cierre-dia");

  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: /Recibir en bodega \(2\)/ }).click();

  const result = page.getByTestId("return-result");
  await expect(result).toBeVisible();
  await expect(result.getByText("Recibidos en bodega (1)")).toBeVisible();
  await expect(result.getByRole("link", { name: "#DHE00042" })).toBeVisible();
  await expect(result.getByText("No se pudieron recibir (1)")).toBeVisible();
  await expect(result.getByRole("link", { name: "#DHE00043" })).toBeVisible();
  await expect(result.getByText("El paquete no está bajo custodia del piloto.")).toBeVisible();
  await expect(page.getByText("Se recibieron 1; 1 no se pudieron recibir.")).toBeVisible();
});

test("cierre de día acepta el formato nuevo del contrato (received / rejected con message)", async ({ page }) => {
  await withSession(page);
  await mockDayClose(page);
  await page.route("**/api/shipments/warehouse-returns", async (route) =>
    route.fulfill({
      json: {
        received: [],
        rejected: [{ id: 42, reason: "not_in_custody", message: "Este paquete lo tiene otro piloto." }],
      },
    })
  );
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/cierre-dia");

  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("button", { name: /Recibir en bodega \(1\)/ }).click();
  const result = page.getByTestId("return-result");
  await expect(result.getByText("Recibidos en bodega (0)")).toBeVisible();
  await expect(result.getByText("Este paquete lo tiene otro piloto.")).toBeVisible();
  await expect(page.getByText("Ningún paquete se pudo recibir. Mira el motivo de cada uno.")).toBeVisible();
});

async function mockDayCloseWithLedger(page: Page, cashToRemit: { value: number }) {
  await page.route("**/api/routes/day-close**", async (route) =>
    route.fulfill({
      json: {
        date: "2026-09-09",
        drivers: [
          {
            driver_id: 7,
            driver_name: "Piloto Caja",
            packages: [],
            counts: { departed: 3, delivered: 3, issues: 0, on_motorcycle: 0, returned_to_warehouse: 0 },
            cod: { expected: 170000, registered: 170000 },
            ledger: { cash_to_remit: cashToRemit.value, digital_pending: 50000, digital_pending_count: 1 },
            routes: [],
            day_settled: true,
          },
        ],
      },
    })
  );
}

test("cierre de día separa el pago digital del efectivo y enlaza a Conciliación", async ({ page }) => {
  await withSession(page);
  await mockDayCloseWithLedger(page, { value: 120000 });
  await page.goto("/cierre-dia");
  const cod = page.getByTestId("cod-block");
  await expect(cod).toContainText("Debe entregar");
  await expect(cod).toContainText("120.000");
  await expect(cod.getByTestId("digital-pending")).toContainText("Pago digital por verificar");
  await expect(cod.getByTestId("digital-pending")).toContainText("50.000");
  await expect(cod.getByRole("link", { name: "Ver en Conciliación" })).toHaveAttribute("href", "/pagos?tab=conciliacion&driver=7");
});

test("cierre de día registra la entrega de efectivo en el libro y refresca", async ({ page }) => {
  await withSession(page);
  const cash = { value: 120000 };
  await mockDayCloseWithLedger(page, cash);
  let posted: Record<string, unknown> | null = null;
  let idempotencyKey: string | undefined;
  await page.route("**/api/financial/driver-reconciliations/7/remittances", async (route) => {
    posted = route.request().postDataJSON();
    idempotencyKey = route.request().headers()["idempotency-key"];
    cash.value = 20000;
    await route.fulfill({ status: 201, json: { id: 901, reference: "REM-CIERRE", amount: 100000 } });
  });
  await page.goto("/cierre-dia");

  await page.getByRole("button", { name: "Registrar entrega de efectivo" }).click();
  const dialog = page.getByRole("dialog", { name: "Registrar entrega de efectivo" });
  const amount = dialog.getByLabel("Efectivo recibido");
  await expect(amount).toHaveValue("120.000");
  await amount.fill("100000");
  await dialog.getByRole("button", { name: "Registrar entrega" }).click();

  await expect(page.getByText("Entrega de $ 100.000 registrada para Piloto Caja")).toBeVisible();
  expect(posted).toMatchObject({ amount: 100000, method: "cash" });
  expect(idempotencyKey).toBeTruthy();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("cod-block")).toContainText("20.000");
});

test("cierre de día no deja registrar más efectivo del que se debe", async ({ page }) => {
  await withSession(page);
  await mockDayCloseWithLedger(page, { value: 120000 });
  await page.goto("/cierre-dia");
  await page.getByRole("button", { name: "Registrar entrega de efectivo" }).click();
  const dialog = page.getByRole("dialog", { name: "Registrar entrega de efectivo" });
  await dialog.getByLabel("Efectivo recibido").fill("150000");
  await expect(dialog.getByText("No puede ser más de $ 120.000.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Registrar entrega" })).toBeDisabled();
});
