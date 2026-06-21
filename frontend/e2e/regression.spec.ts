import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Danhei admin regression", () => {
  test("conductores board and detail render key metrics", async ({ page }) => {
    await withSession(page);
    await page.goto("/conductores");
    await expect(page.getByRole("heading", { name: /pilotos/i })).toBeVisible();
    await expect(page.getByText("Pedidos asignados")).toBeVisible();
    await expect(page.getByText("piloto.demo@danheiexpress.com")).toBeVisible();
    await page.getByRole("link", { name: "Ver pagina" }).first().click();
    await expect(page.getByText("Tasa de entrega")).toBeVisible();
    await expect(page.getByText("piloto.demo@danheiexpress.com")).toBeVisible();
    await expect(page.getByRole("main").getByText("Novedades")).toBeVisible();
    await expect(page.getByRole("button", { name: /Asignar env[ií]o/ })).toBeVisible();
  });

  test("auditoria filters and metadata inspector work", async ({ page }) => {
    await withSession(page);
    await page.goto("/auditoria");
    await expect(page.getByRole("heading", { name: /Auditor[ií]a/ })).toBeVisible();
    await page.getByPlaceholder(/Filtrar por usuario, acci[oó]n o descripci[oó]n/).fill("masivo");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByRole("cell", { name: "Cambio de estado masivo" })).toBeVisible();
    await page.getByRole("button", { name: /Ver \(2\)/ }).first().click();
    await expect(page.getByText("\"shipment_ids\"").first()).toBeVisible();
    await expect(page.getByText("\"in_transit\"").first()).toBeVisible();
  });

  test("pagos module renders finance, expenses and payroll sections", async ({ page }) => {
    await withSession(page);
    await page.goto("/pagos");
    await expect(page.getByRole("heading", { name: "Finanzas" })).toBeVisible();
    await page.getByRole("button", { name: /Gastos y N/ }).click();
    await expect(page.getByRole("heading", { name: /Gastos fijos/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /N.mina/ })).toBeVisible();
  });

  test("configuracion renders profile and company settings", async ({ page }) => {
    await withSession(page);
    await page.goto("/configuracion");
    await expect(page.getByRole("heading", { name: "Configuracion" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Empresa" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar tarifas" })).toBeVisible();
  });

  test("notificaciones navbar badge", async ({ page }) => {
    await withSession(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Notificaciones" })).toContainText("2");
  });

  test("notificaciones dropdown", async ({ page }) => {
    await withSession(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Notificaciones" }).click();
    await expect(page.getByText("Ruta #18 lista para iniciar")).toBeVisible();
  });

  test("marcar todas leidas", async ({ page }) => {
    await withSession(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Notificaciones" }).click();
    await page.getByRole("button", { name: /Marcar todas como le[ií]das/ }).click();
    await expect(page.getByText(/Notificaciones marcadas como le[ií]das/)).toBeVisible();
  });
});
