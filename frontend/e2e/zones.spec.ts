import { expect, test, type Page } from "@playwright/test";
import { withSession } from "./support/mock-api";

// El catálogo se renderiza dos veces desde el rediseño v2: tarjetas de
// escritorio (div.hidden.lg:block) y tarjetas móviles (article, lg:hidden).
// Los locators apuntan a la variante de escritorio, que es la visible en el
// viewport por defecto de la batería.
const desktopZone = (page: Page, name: string) =>
  page.locator("div.hidden.lg\\:block > div").filter({ hasText: name }).first();

test.describe("Zonas page", () => {
  test.beforeEach(async ({ page }) => {
    await withSession(page);
    await page.goto("/zonas");
  });

  test("loads zonas page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Zonas de cobertura" })).toBeVisible();
  });

  test("renders at least one zone from mock data", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Zona Norte" })).toBeVisible();
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
    await desktopZone(page, "Zona Norte")
      .getByRole("button", { name: "Editar" })
      .click();
    await expect(page.getByRole("heading", { name: "Editar zona" })).toBeVisible();
  });

  test("expands pricing rules panel and shows base rule", async ({ page }) => {
    await desktopZone(page, "Zona Norte")
      .getByRole("button", { name: "Ver reglas" })
      .click();
    await expect(desktopZone(page, "Zona Norte").getByText("Regla base")).toBeVisible();
  });

  test("calculates live price and renders amount", async ({ page }) => {
    await page.locator("form").first().getByRole("combobox").selectOption("1");
    await page.getByRole("button", { name: "Calcular" }).click();
    await expect(page.getByText("Precio:")).toBeVisible();
    await expect(page.getByText("$14.500")).toBeVisible();
  });

  // Antes este caso exigía las clases dark legacy (dark:bg-[#1a1a2e]…) que el
  // rediseño v2 retiró a propósito (5c82d8d); ahora custodia los tokens v2.
  test("zone cards use design system v2 tokens", async ({ page }) => {
    const zoneCard = desktopZone(page, "Zona Norte");
    await expect(zoneCard).toBeVisible();
    await expect(zoneCard).toHaveClass(/bg-surface/);
    await expect(zoneCard).toHaveClass(/border-edge/);
  });
});
