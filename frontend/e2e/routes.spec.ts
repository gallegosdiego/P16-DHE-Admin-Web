import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Rutas page", () => {
  test.beforeEach(async ({ page }) => {
    await withSession(page);
    await page.goto("/rutas");
  });

  test("loads rutas page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Rutas diarias" })).toBeVisible();
  });

  test("renders all kanban lane headings", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Planificada" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Completada" })).toBeVisible();
  });

  test("shows route card with driver and zone", async ({ page }) => {
    const routeCard = page.locator("div").filter({ hasText: "Ruta #18" }).first();
    await expect(routeCard).toBeVisible();
    await expect(routeCard.getByText("Conductor Demo • Norte")).toBeVisible();
  });

  test("renders progress counters for routes", async ({ page }) => {
    await expect(page.getByText("0/2").first()).toBeVisible();
    await expect(page.getByText("1/2").first()).toBeVisible();
  });

  test("starts a planned route and shows success toast", async ({ page }) => {
    await page.getByRole("button", { name: "Iniciar" }).first().click();
    await expect(page.getByText("Ruta activada")).toBeVisible();
  });

  test("shows complete action for pending stop in active route", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Completar" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Completar" }).first().click();
    await expect(page.getByText("Parada completada")).toBeVisible();
  });

  test("opens new route modal with driver selector and stop list", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva ruta" }).click();
    await expect(page.getByRole("heading", { name: "Nueva ruta" })).toBeVisible();
    await expect(page.getByRole("combobox").first()).toBeVisible();
    await expect(page.getByText("Paradas disponibles")).toBeVisible();
  });

  test("shows empty state in completed lane when no completed routes", async ({ page }) => {
    const completedLane = page.locator("article").filter({ has: page.getByRole("heading", { name: "Completada" }) });
    await expect(completedLane.getByText("Sin rutas")).toBeVisible();
  });
});
