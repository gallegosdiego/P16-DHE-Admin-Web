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
