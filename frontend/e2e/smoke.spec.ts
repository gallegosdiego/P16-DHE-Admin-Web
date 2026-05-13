import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Danhei admin smoke", () => {
  test("login form loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Iniciar sesi/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  test("dashboard live loads for authenticated user", async ({ page }) => {
    await withSession(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard en vivo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Actualizar ahora" })).toBeVisible();
  });

  test("usuarios and reportes screens load", async ({ page }) => {
    await withSession(page);
    await page.goto("/usuarios");
    await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
    await page.goto("/reportes");
    await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Exportar envios" })).toBeVisible();
  });

  test("command palette opens with keyboard", async ({ page }) => {
    await withSession(page);
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await expect(
      page.getByPlaceholder("Buscar envios, clientes, conductores o acciones...")
    ).toBeVisible();
  });
});
