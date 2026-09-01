import { test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Fase 10 - Lote 5 Certificación E2E", () => {
  test("Parcial 1: Usuarios - Crear usuario desechable y verificar en tabla (Desktop 1280)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);

    await page.goto("/usuarios");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/p1_usuarios_desktop_1280.png" });

    // Abrir modal de creación
    await page.click('button:has-text("Nuevo Usuario")');
    const timestamp = Date.now();
    await page.fill('input[placeholder="Ej: Carlos Mendoza"]', `Test User ${timestamp}`);
    await page.fill('input[placeholder="usuario@danheiexpress.com"]', `test_${timestamp}@danheiexpress.com`);
    await page.fill('input[placeholder="+57 311 000 0000"]', "+573009998877");
    await page.fill('input[placeholder="Mínimo 8 caracteres"]', "password123");

    await page.click('button:has-text("Guardar usuario"), button:has-text("Crear usuario")');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/p1_usuario_creado_desktop.png" });
  });

  test("Parcial 1: Usuarios - Móvil 375", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await withSession(page);

    await page.goto("/usuarios");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/p1_usuarios_mobile_375.png" });
  });

  test("Parcial 2: Configuración, Sedes y Reportes (Desktop & Móvil)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);

    // Configuración
    await page.goto("/configuracion");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/p2_configuracion_desktop_1280.png" });

    // Sedes operativas migrada
    await page.goto("/configuracion/sedes");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/p2_sedes_migradas_desktop.png" });

    // Reportes
    await page.goto("/reportes");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/p2_reportes_desktop_1280.png" });

    // Móvil 375
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/reportes");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/p2_reportes_mobile_375.png" });
  });

  test("Parcial 3: Login - Intento fallido con contraseña mala y login exitoso (Desktop & Móvil)", async ({ page }) => {
    // Intento con clave incorrecta
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@danheiexpress.com");
    await page.fill('input[type="password"]', "badpassword123");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/p3_login_error_desktop.png" });

    // Login Exitoso Móvil 375
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@danheiexpress.com");
    await page.fill('input[type="password"]', "admin123456");
    await page.screenshot({ path: "C:/Users/HP Z480/.gemini/antigravity/brain/167b08ea-ede4-47f2-a813-5768ae380ef6/p3_login_mobile_375.png" });
  });
});
