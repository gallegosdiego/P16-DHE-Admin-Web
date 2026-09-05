import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Danhei admin smoke", () => {
  test("login form loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
    await expect(page.getByRole("button", { name: /Iniciar|Entrar/i })).toBeVisible();
  });

  test("dashboard live loads for authenticated user", async ({ page }) => {
    await withSession(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /equipo Danhei/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Actualizar/i })).toBeVisible();
  });

  test("usuarios and reportes screens load", async ({ page }) => {
    await withSession(page);
    await page.goto("/usuarios");
    await expect(page.getByRole("main").getByRole("heading", { name: "Usuarios" })).toBeVisible();
    await page.goto("/reportes");
    // El titular de la sección ahora también vive en la topbar; validamos el h1 propio de la pantalla.
    await expect(page.getByRole("main").getByRole("heading", { name: "Reportes" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Exportar env[ií]os/ })).toBeVisible();
  });

  test("command palette opens with keyboard", async ({ page }) => {
    await withSession(page);
    await page.goto("/");
    // La UI rediseñada hidrata más JS: reintentamos el atajo hasta que el listener
    // global esté activo. La intención se mantiene: solo el teclado abre la paleta.
    await expect(async () => {
      await page.keyboard.press("Control+k");
      await expect(
        page.getByPlaceholder(/Buscar env[ií]os, clientes, pilotos o acciones\.\.\./)
      ).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
  });
});
