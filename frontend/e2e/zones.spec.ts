import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Zonas page", () => {
  test.beforeEach(async ({ page }) => {
    await withSession(page);
    await page.goto("/zonas");
  });

  test("loads zonas page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Zonas de cobertura" })).toBeVisible();
  });

  test("renders at least one zone from mock data", async ({ page }) => {
    await expect(page.locator("article").filter({ hasText: "Zona Norte" }).first()).toBeVisible();
  });

  test("shows zone type label for urban zone", async ({ page }) => {
    await expect(page.getByText("Urban").first()).toBeVisible();
  });

  test("shows base price formatted in COP", async ({ page }) => {
    await expect(page.getByText("11.500").first()).toBeVisible();
  });

  test("creates a new zone from modal form", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva zona" }).click();
    await expect(page.getByRole("heading", { name: "Crear zona" })).toBeVisible();
    await page.getByLabel("Nombre").fill("Zona Oriente");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Zona creada")).toBeVisible();
  });

  test("opens edit modal with zone data", async ({ page }) => {
    await page
      .locator("article")
      .filter({ hasText: "Zona Norte" })
      .first()
      .getByRole("button", { name: "Editar" })
      .click();
    await expect(page.getByRole("heading", { name: "Editar zona" })).toBeVisible();
  });

  test("expands pricing rules panel and shows base rule", async ({ page }) => {
    await page
      .locator("article")
      .filter({ hasText: "Zona Norte" })
      .first()
      .getByRole("button", { name: "Ver reglas" })
      .click();
    await expect(page.getByText("Regla base")).toBeVisible();
  });

  test("calculates live price and renders amount", async ({ page }) => {
    await page.locator("form").first().getByRole("combobox").selectOption("1");
    await page.getByRole("button", { name: "Calcular" }).click();
    await expect(page.getByText("Precio:")).toBeVisible();
    await expect(page.getByText("$14.500")).toBeVisible();
  });

  test("zone cards keep dark-mode utility classes in markup", async ({ page }) => {
    const zoneCard = page.locator("article").first();
    await expect(zoneCard).toBeVisible();
    await expect(zoneCard).toHaveClass(/dark:bg-\[#1a1a2e\]/);
    await expect(zoneCard).toHaveClass(/dark:border-\[#2a2a3e\]/);
  });
});
