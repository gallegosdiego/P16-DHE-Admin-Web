import { expect, test, type Page } from "@playwright/test";
import { withSession } from "./support/mock-api";

// El catálogo se renderiza dos veces desde el rediseño v2: tarjetas de
// escritorio (div.hidden.lg:block) y tarjetas móviles (article, lg:hidden).
// Los locators apuntan a la variante de escritorio, que es la visible en el
// viewport por defecto de la batería.
const desktopZone = (page: Page, name: string) =>
  page.locator("div.hidden.lg\\:block > div").filter({ hasText: name }).first();

// Las zonas están ocultas por defecto (NEXT_PUBLIC_ZONES_UI_ENABLED). Estas
// pruebas custodian la pantalla completa cuando se vuelven a encender.
const zonesOn = process.env.NEXT_PUBLIC_ZONES_UI_ENABLED === "true";

test.describe("Zonas page", () => {
  test.skip(!zonesOn, "Zonas ocultas: NEXT_PUBLIC_ZONES_UI_ENABLED no está en true");

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

test.describe("Zonas desactivadas (por defecto)", () => {
  test.skip(zonesOn, "Solo aplica con las zonas ocultas");

  test("el menú no muestra Zonas y /zonas explica que están desactivadas", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Paquetes" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Zonas", exact: true })).toHaveCount(0);

    await page.goto("/zonas");
    await expect(page.getByText("Las zonas están desactivadas por ahora")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Zonas de cobertura" })).toHaveCount(0);
  });

  test("nuevo ingreso pide ciudad o municipio en lugar de zona", async ({ page }) => {
    await withSession(page);
    await page.route(/\/api\/zones(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: 1, name: "Zona Norte", city: "Bogota", type: "urban", is_active: true },
          { id: 7, name: "Soacha centro", city: "Soacha", type: "suburban", is_active: true },
          { id: 8, name: "Chía", city: "Chía", type: "suburban", is_active: true },
        ]),
      });
    });
    let body = "";
    await page.route("**/api/pickup-intakes/walk-in/complete", async (route) => {
      body = route.request().postData() ?? "";
      await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ message: "Prueba: no se guarda" }) });
    });

    await page.goto("/recogidas/nueva");
    await page.getByRole("button", { name: /Contacto, remitente e instrucciones/i }).click();
    await page.getByLabel("Contacto del cliente / remitente").fill("QA Danhei");
    await page.getByLabel("Teléfono del cliente / remitente").fill("3001234567");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByText("Zona / sector")).toHaveCount(0);
    const city = page.getByLabel("Ciudad o municipio");
    await expect(city).toHaveValue("Bogotá");
    await expect(city.locator("option")).toHaveText(["Bogotá", "Chía", "Soacha", "Otro municipio…"]);
    await city.selectOption("Soacha");

    await page.getByRole("textbox", { name: "Nombre del destinatario*", exact: true }).fill("Destinatario QA");
    await page.getByRole("textbox", { name: "Teléfono del destinatario*", exact: true }).fill("3007654321");
    await page.getByRole("textbox", { name: "Dirección de entrega*", exact: true }).fill("Carrera 13 # 10-18");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Confirmar y recibir" }).click();

    await expect.poll(() => body).toContain("Soacha");
    expect(body).toContain("delivery_city");
  });
});
