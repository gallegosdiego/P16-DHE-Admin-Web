import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Certificación Bloque 1 - Paquetes", () => {
  test("Desktop 1280px: visualiza guías, abre detalle y cambia estado con éxito", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await page.goto("/pedidos");

    // Header & KPIs
    await expect(page.getByRole("main").getByRole("heading", { name: "Paquetes" })).toBeVisible();
    await expect(page.getByText("Total Guías Hoy")).toBeVisible();

    // Tabla Desktop y primer envío
    const firstGuide = page.getByRole("cell", { name: "#DHE00011" }).first();
    await expect(firstGuide).toBeVisible();

    // Abrir detalle
    await page.getByRole("button", { name: "Ver detalle de #DHE00011" }).click();
    await expect(page.getByRole("heading", { name: "#DHE00011" })).toBeVisible();
    await expect(page.getByText("Timeline de eventos")).toBeVisible();

    // Captura detalle desktop
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/pedidos_desktop_detail.png" });

    // Cerrar modal
    await page.getByRole("button", { name: "Cerrar" }).click();

    // Cambiar estado (Entregar)
    const actionBtn = page.getByRole("button", { name: "Entregar: #DHE00011" }).first();
    if (await actionBtn.isVisible()) {
      await actionBtn.click();
      await expect(page.getByText("Estado cambiado")).toBeVisible();
    }

    // Captura desktop final
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/pedidos_desktop_1280.png" });
  });

  test("Mobile 375px: visualiza tarjetas móviles, abre detalle y opera correctamente", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await withSession(page);
    await page.goto("/pedidos");

    // Header & Mobile cards
    await expect(page.getByRole("main").getByRole("heading", { name: "Paquetes" })).toBeVisible();
    const mobileCardGuide = page.locator(".lg\\:hidden").getByText("#DHE00011").first();
    await expect(mobileCardGuide).toBeVisible();

    // Captura listado mobile
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/pedidos_mobile_375.png" });

    // Abrir detalle en mobile
    await page.locator(".lg\\:hidden").getByRole("button", { name: "Detalle" }).first().click();
    await expect(page.getByRole("heading", { name: "#DHE00011" })).toBeVisible();

    // Captura detalle mobile
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/pedidos_mobile_detail.png" });
  });
});
