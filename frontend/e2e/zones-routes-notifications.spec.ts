import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Zonas, rutas y notificaciones", () => {
  test("zonas page renders list and live calculator", async ({ page }) => {
    await withSession(page);
    await page.goto("/zonas");

    await expect(page.getByRole("heading", { name: "Zonas de cobertura" })).toBeVisible();
    await expect(page.locator("article").filter({ hasText: "Zona Norte" }).first()).toBeVisible();

    await page.locator("form").first().getByRole("combobox").selectOption("1");
    await page.getByRole("button", { name: "Calcular" }).click();
    await expect(page.getByText("Precio:")).toBeVisible();
    await expect(page.getByText("$14.500")).toBeVisible();
  });

  test("rutas page renders kanban lanes and route controls", async ({ page }) => {
    await withSession(page);
    await page.goto("/rutas");

    await expect(page.getByRole("heading", { name: "Rutas diarias" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Planificada" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activa" })).toBeVisible();
    await expect(page.getByText("Ruta #18")).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar" })).toBeVisible();
  });

  test("navbar notifications shows unread badge and read-all action", async ({ page }) => {
    await withSession(page);
    await page.goto("/");

    const bell = page.getByRole("button", { name: "Notificaciones" });
    await expect(bell).toContainText("2");
    await bell.click();

    await expect(page.getByText("Ruta #18 lista para iniciar")).toBeVisible();
    await page.getByRole("button", { name: "Marcar todas como leidas" }).click();
    await expect(page.getByText("Notificaciones marcadas como leidas")).toBeVisible();
  });
});
