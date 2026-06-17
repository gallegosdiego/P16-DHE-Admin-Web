import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Financial Module - Tabs", () => {
  test.beforeEach(async ({ page }) => {
    await withSession(page);
    await page.goto("/pagos");
    // Wait for loadData() to finish (loading=false renders the heading)
    await expect(page.getByRole("heading", { name: "Finanzas" })).toBeVisible({ timeout: 15000 });
  });

  test("tab resumen shows financial KPIs and P&L", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Finanzas" })).toBeVisible();
    await expect(page.getByText("Ingreso mes")).toBeVisible();
    await expect(page.getByText("Costos mes")).toBeVisible();
    await expect(page.getByText("Utilidad neta")).toBeVisible();
    await expect(page.getByText("Barra COD del")).toBeVisible();
    await expect(page.getByText("Mini P&L del mes")).toBeVisible();
  });

  test("tab cartera shows debtors with filters", async ({ page }) => {
    await page.getByRole("button", { name: /Cartera/ }).click();
    await expect(page.getByText("Comercial Uno SAS")).toBeVisible();
    await expect(page.getByText("Textiles Dos")).toBeVisible();
    await page.getByRole("button", { name: "Vencidos" }).click();
    await expect(page.getByText("Comercial Uno SAS")).toBeVisible();
    await expect(page.getByText("Textiles Dos")).not.toBeVisible();
  });

  test("tab cartera whatsapp link has correct format", async ({ page }) => {
    await page.getByRole("button", { name: /Cartera/ }).click();
    const link = page.getByRole("link", { name: "WhatsApp" }).first();
    await expect(link).toHaveAttribute("href", /wa\.me\/57/);
    await expect(link).toHaveAttribute("href", /recordamos/);
  });

  test("tab pilotos shows batch actions", async ({ page }) => {
    await page.getByRole("button", { name: /Pilotos/ }).click();
    // Wait for tab transition
    await page.waitForTimeout(500);
    // Debug: capture what the page shows
    const html = await page.locator("main").innerHTML();
    console.log(`[debug pilotos] main HTML length=${html.length}, has Conductor Demo: ${html.includes("Conductor Demo")}, has Recaudar: ${html.includes("Recaudar")}`);
    await expect(page.getByText("Conductor Demo")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Recaudar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Liquidar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pagar" })).toBeVisible();
  });

  test("tab pilotos batch collect triggers API", async ({ page }) => {
    await page.getByRole("button", { name: /Pilotos/ }).click();
    await page.getByRole("button", { name: "Recaudar" }).click();
    await expect(page.getByText("COD recaudado")).toBeVisible();
  });

  test("tab gastos shows expenses and payroll split", async ({ page }) => {
    await page.getByRole("button", { name: /Gastos y N/ }).click();
    await expect(page.getByRole("heading", { name: /Gastos fijos/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /N/ })).toBeVisible();
    await expect(page.getByText("Arriendo oficina")).toBeVisible();
    await expect(page.getByText("Sandra Lopez")).toBeVisible();
  });

  test("tab gastos expand history works", async ({ page }) => {
    await page.getByRole("button", { name: /Gastos y N/ }).click();
    await page.getByRole("button", { name: "Historial" }).first().click();
    await expect(page.getByRole("columnheader", { name: "Periodo" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Estado" })).toBeVisible();
  });

  test("tab COD shows daily summary table", async ({ page }) => {
    await page.getByRole("button", { name: "COD" }).click();
    await page.waitForTimeout(500);
    const html = await page.locator("main").innerHTML();
    console.log(`[debug COD] main HTML length=${html.length}, has Piloto: ${html.includes("Piloto")}, has Carlos: ${html.includes("Carlos Repartidor")}`);
    await expect(page.getByRole("columnheader", { name: "Piloto" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Carlos Repartidor")).toBeVisible();
  });

  test("tab COD creates settlement", async ({ page }) => {
    await page.getByRole("button", { name: "COD" }).click();
    await page.locator("select").first().selectOption("1");
    await page.getByPlaceholder("Total liquidado").fill("600000");
    await page.getByRole("button", { name: "Crear" }).click();
    await expect(page.getByText("Conciliacion creada")).toBeVisible();
  });

  test("tabs dark mode renders correctly", async ({ page }) => {
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.getByRole("button", { name: /Cartera/ }).click();
    await page.getByRole("button", { name: /Pilotos/ }).click();
    await page.getByRole("button", { name: /Gastos y N/ }).click();
    await page.getByRole("button", { name: "COD" }).click();
    await expect(page.getByRole("heading", { name: "Finanzas" })).toBeVisible();
  });

  test("tabs mobile scroll horizontal works", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const tabBar = page.locator("div.overflow-x-auto").first();
    await expect(tabBar).toBeVisible();
    await tabBar.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await page.getByRole("button", { name: "COD" }).click();
    await expect(page.getByRole("heading", { name: "Historial de conciliaciones" })).toBeVisible();
  });
});
