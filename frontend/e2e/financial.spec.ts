import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Financial Module - Tabs", () => {
  test.beforeEach(async ({ page }) => {
    await withSession(page);
    await page.goto("/pagos");
  });

  test("tab resumen shows daily KPIs and P&L", async ({ page }) => {
    await expect(page.getByText("Paquetes hoy")).toBeVisible();
    await expect(page.getByText("Ingreso bruto mes")).toBeVisible();
    await expect(page.getByText("Costo conductores")).toBeVisible();
    await expect(page.getByText("Ganancia bruta")).toBeVisible();
    await expect(page.getByText("Barra COD")).toBeVisible();
    await expect(page.getByText("Mini P&L")).toBeVisible();
  });

  test("tab quien me debe shows debtors with filters", async ({ page }) => {
    await page.getByRole("button", { name: "Quién me debe" }).click();
    await expect(page.getByText("Comercial Uno SAS")).toBeVisible();
    await page.getByRole("button", { name: "Vencidos (>15d)" }).click();
    await expect(page.getByText("Comercial Uno SAS")).toBeVisible();
    await expect(page.getByText("Textiles Dos")).not.toBeVisible();
  });

  test("tab quien me debe whatsapp link has correct format", async ({ page }) => {
    await page.getByRole("button", { name: "Quién me debe" }).click();
    const link = page.getByRole("link", { name: "WhatsApp" }).first();
    await expect(link).toHaveAttribute("href", /wa\.me\/57/);
    await expect(link).toHaveAttribute("href", /recordamos/);
  });

  test("tab conductores shows batch actions", async ({ page }) => {
    await page.getByRole("button", { name: "Conductores" }).click();
    await expect(page.getByText("Conductor Demo")).toBeVisible();
    await expect(page.getByRole("button", { name: "Recaudar todo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Liquidar todo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pagar todo" })).toBeVisible();
  });

  test("tab conductores batch collect triggers API", async ({ page }) => {
    await page.getByRole("button", { name: "Conductores" }).click();
    await page.getByRole("button", { name: "Recaudar todo" }).click();
    await expect(page.getByText("COD recaudado")).toBeVisible();
  });

  test("tab gastos shows expenses and payroll split", async ({ page }) => {
    await page.getByRole("button", { name: "Gastos y Nómina" }).click();
    await expect(page.getByRole("heading", { name: "Gastos fijos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nomina" })).toBeVisible();
    await expect(page.getByText("Total mensual:")).toBeVisible();
    await expect(page.getByText("Total nomina mensual:")).toBeVisible();
  });

  test("tab gastos expand history works", async ({ page }) => {
    await page.getByRole("button", { name: "Gastos y Nómina" }).click();
    await page.getByRole("button", { name: "Historial" }).first().click();
    await expect(page.getByRole("columnheader", { name: "Periodo" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Estado" })).toBeVisible();
  });

  test("tab conciliacion shows daily summary table", async ({ page }) => {
    await page.getByRole("button", { name: "Conciliación" }).click();
    await expect(page.getByRole("columnheader", { name: "Conductor" })).toBeVisible();
    await expect(page.getByText("Carlos Repartidor")).toBeVisible();
  });

  test("tab conciliacion create settlement", async ({ page }) => {
    await page.getByRole("button", { name: "Conciliación" }).click();
    await page.locator("select").first().selectOption("1");
    await page.getByPlaceholder("Total liquidado").fill("600000");
    await page.getByRole("button", { name: "Crear conciliacion" }).click();
    await expect(page.getByText("Conciliacion creada")).toBeVisible();
  });

  test("tabs dark mode renders correctly", async ({ page }) => {
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.getByRole("button", { name: "Quién me debe" }).click();
    await page.getByRole("button", { name: "Conductores" }).click();
    await page.getByRole("button", { name: "Gastos y Nómina" }).click();
    await page.getByRole("button", { name: "Conciliación" }).click();
    await expect(page.getByRole("heading", { name: "Pagos y Finanzas" })).toBeVisible();
  });

  test("tabs mobile scroll horizontal works", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const tabBar = page.locator("div.overflow-x-auto").first();
    await expect(tabBar).toBeVisible();
    await tabBar.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await page.getByRole("button", { name: "Conciliación" }).click();
    await expect(page.getByRole("heading", { name: "Historial de conciliaciones" })).toBeVisible();
  });
});
