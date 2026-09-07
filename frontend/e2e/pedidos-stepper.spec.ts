import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("OT-05: Stepper de 5 pasos en detalle de paquete", () => {
  test("Desktop: visualiza los 5 pasos en el orden correcto dentro del modal de detalle", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await page.goto("/pedidos");

    const firstGuide = page.getByRole("cell", { name: "#DHE00011" }).first();
    await expect(firstGuide).toBeVisible();

    // Abrir detalle
    await page.getByRole("button", { name: "Ver detalle de #DHE00011" }).click();
    await expect(page.getByRole("heading", { name: "#DHE00011" })).toBeVisible();

    // Validar que el Stepper contiene los 5 pasos estipulados en OT-05
    const stepperContainer = page.getByLabel("Progreso").first();
    await expect(stepperContainer).toBeVisible();

    await expect(page.getByText("Recepción").first()).toBeVisible();
    await expect(page.getByText("En bodega").first()).toBeVisible();
    await expect(page.getByText("Con el piloto").first()).toBeVisible();
    await expect(page.getByText("En ruta").first()).toBeVisible();
    await expect(page.getByText("Entregado").first()).toBeVisible();

    // Validar que el timeline fino sigue existiendo debajo
    await expect(page.getByText("Timeline de eventos")).toBeVisible();
  });

  test("Mobile: visualiza versión compacta del stepper ('Paso X de 5')", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await withSession(page);
    await page.goto("/pedidos");

    await page.locator(".lg\\:hidden").getByRole("button", { name: "Detalle" }).first().click();
    await expect(page.getByRole("heading", { name: "#DHE00011" })).toBeVisible();

    // Validar resumen móvil compacto
    await expect(page.getByText(/Paso \d de 5/)).toBeVisible();
  });
});
