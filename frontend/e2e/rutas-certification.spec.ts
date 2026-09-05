import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Certificación Bloque 2 - Rutas diarias", () => {
  test("Desktop 1280px: visualiza tablero de rutas, abre monitor y manifiesta con éxito", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await page.goto("/rutas");

    // Header & KPIs
    await expect(page.getByRole("main").getByRole("heading", { name: "Rutas diarias" })).toBeVisible();
    await expect(page.getByText("Total Rutas Hoy")).toBeVisible();

    // Tablero de custodia y filtros de despacho
    await expect(page.getByText("Custodia de sede y despacho")).toBeVisible();
    await expect(page.getByPlaceholder("Filtrar por zona...")).toBeVisible();
    await expect(page.getByPlaceholder("Ej: 15")).toBeVisible();
    await expect(page.getByText("Ruta #18").first()).toBeVisible();

    // Probar filtro de tamaño en bodega
    const sizeSelect = page.locator("select").filter({ hasText: "Todos los tamaños" });
    await expect(sizeSelect).toBeVisible();
    await sizeSelect.selectOption("small");
    await expect(sizeSelect).toHaveValue("small");

    // Captura desktop tablero
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/rutas_desktop_1280.png" });

    // Abrir manifiesto
    await page.getByRole("button", { name: "Manifiesto" }).first().click();
    await expect(page.getByRole("heading", { name: "MAN-20260729-0018" })).toBeVisible();

    // Captura manifiesto desktop
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/rutas_desktop_manifest.png" });

    // Cerrar manifiesto
    await page.getByRole("button", { name: "Cerrar" }).click();
  });

  test("Mobile 375px: visualiza rutas móviles y abre manifiesto", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await withSession(page);
    await page.goto("/rutas");

    // Header & Mobile cards
    await expect(page.getByRole("main").getByRole("heading", { name: "Rutas diarias" })).toBeVisible();
    await expect(page.getByText("Ruta #18").first()).toBeVisible();

    // Captura mobile
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/rutas_mobile_375.png" });

    // Abrir manifiesto mobile
    await page.getByRole("button", { name: "Manifiesto" }).first().click();
    await expect(page.getByRole("heading", { name: "MAN-20260729-0018" })).toBeVisible();

    // Captura manifiesto mobile
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/rutas_mobile_manifest.png" });
  });

  test("Manejo de estados de carga y error en manifiesto", async ({ page }) => {
    await withSession(page);

    await page.route("**/routes/*/manifest", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Servidor no disponible para consultar manifiesto." }),
      });
    });

    await page.goto("/rutas");

    await page.getByRole("button", { name: "Manifiesto" }).first().click();
    await expect(page.getByText("Error al cargar el manifiesto")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
  });
});
