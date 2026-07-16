import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Danhei admin regression", () => {
  test("marca adaptativa se usa en claro y oscuro", async ({ page }) => {
    await withSession(page);
    await page.goto("/");

    const logo = page.getByAltText("Danhei Express");
    await expect(logo).toHaveAttribute("src", /danhei-brand-adaptive/);

    const themeButton = page.getByRole("button", { name: /cambiar tema/i });
    if (await themeButton.isVisible()) {
      await themeButton.click();
      await expect(logo).toBeVisible();
    }
  });

  test("conductores board and detail render key metrics", async ({ page }) => {
    await withSession(page);
    await page.goto("/conductores");
    await expect(page.getByRole("heading", { name: /pilotos/i })).toBeVisible();
    await expect(page.getByText("Envíos asignados")).toBeVisible();
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
    await expect(page.getByRole("heading", { name: /Configuraci[oó]n/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Empresa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tarifas de servicios a pilotos" })).toBeVisible();
    await expect(page.getByText("Entrega estándar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear regla" })).toBeVisible();
  });

  test("configuracion creates a versioned financial rate rule", async ({ page }) => {
    await withSession(page);
    await page.goto("/configuracion");
    const rateSection = page.getByRole("heading", { name: "Tarifas de servicios a pilotos" }).locator("..").locator("..");
    await rateSection.getByPlaceholder("Ej. Entrega estándar Bogotá").fill("Recogida estándar");
    await rateSection.locator("select").first().selectOption("pickup");
    await rateSection.locator('input[type="number"]').first().fill("5000");
    await rateSection.getByPlaceholder("Explica por qué se crea o cambia esta tarifa.").fill("Tarifa aprobada para QA");

    const requestPromise = page.waitForRequest((request) =>
      request.method() === "POST" && request.url().endsWith("/api/financial/rate-rules"),
    );
    await rateSection.getByRole("button", { name: "Crear regla" }).click();
    const request = await requestPromise;

    expect(request.postDataJSON()).toMatchObject({
      name: "Recogida estándar",
      service_type: "pickup",
      scope_type: "global",
      amount: 5000,
      change_reason: "Tarifa aprobada para QA",
    });
    await expect(page.getByText("Regla financiera creada.")).toBeVisible();
  });

  test("nuevo ingreso carga la sede operativa y evita un selector vacio", async ({ page }) => {
    await withSession(page);
    await page.goto("/recogidas/nueva");
    await page.getByRole("button", { name: "Recibir ahora, sin aviso previo" }).click();

    const locationSelect = page.getByLabel("Sede Danhei");
    await expect(locationSelect).toHaveValue("1");
    await expect(locationSelect.locator("option:checked")).toContainText("Sede principal");
    await expect(locationSelect.locator("option")).toHaveCount(3);
    await expect(locationSelect.locator("option").nth(1)).toContainText("Sede B");
    await expect(page.getByRole("button", { name: "Registrar y recibir" })).toBeEnabled();
  });

  test("nuevo ingreso explica como configurar una sede cuando el catalogo esta vacio", async ({ page }) => {
    await withSession(page);
    await page.route("**/api/service-locations", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
    await page.goto("/recogidas/nueva");
    await page.getByRole("button", { name: "Recibir ahora, sin aviso previo" }).click();

    await expect(page.getByText("No hay una sede activa para recibir paquetes.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Configura una sede" })).toHaveAttribute("href", "/configuracion/sedes");
    await expect(page.getByLabel("Sede Danhei")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Registrar y recibir" })).toBeDisabled();
  });

  test("ingresos muestra el error trazable y permite reintentar sin simular una lista vacia", async ({ page }) => {
    await withSession(page);
    let failPickupList = true;

    await page.route(/\/api\/pickup-requests(?:\?.*)?$/, async (route) => {
      if (failPickupList) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Error interno del servidor.",
            code: "internal_server_error",
            retryable: false,
            error_id: "ERR-QA-RECOGIDAS-001",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          summary: {
            total: 0,
            pending_review: 0,
            needs_customer_input: 0,
            accepted: 0,
            ready_for_assignment: 0,
            cancelled: 0,
          },
          current_page: 1,
          last_page: 1,
          per_page: 12,
          total: 0,
        }),
      });
    });

    await page.goto("/recogidas");

    const errorNotice = page.getByRole("alert", { name: "Error al cargar ingresos de paquetes" });
    await expect(errorNotice.getByText("No fue posible cargar los ingresos de paquetes")).toBeVisible();
    await expect(errorNotice.getByText("Error interno del servidor.")).toBeVisible();
    await expect(errorNotice.getByText("ERR-QA-RECOGIDAS-001")).toBeVisible();
    await expect(page.getByText("No hay ingresos que coincidan con este filtro.")).not.toBeVisible();

    failPickupList = false;
    await errorNotice.getByRole("button", { name: "Reintentar" }).click();

    await expect(errorNotice).not.toBeVisible();
    await expect(page.getByText("No hay ingresos que coincidan con este filtro.")).toBeVisible();
    await expect(page.getByText("Total", { exact: true })).toBeVisible();
  });

  test("ingresos ignora respuestas antiguas cuando los filtros cambian rapido", async ({ page }) => {
    await withSession(page);

    const responseBody = (total: number) => JSON.stringify({
      data: [],
      summary: {
        total,
        pending_review: 0,
        needs_customer_input: 0,
        accepted: 0,
        ready_for_assignment: 0,
        cancelled: 0,
      },
      current_page: 1,
      last_page: 1,
      per_page: 12,
      total,
    });

    await page.route(/\/api\/pickup-requests(?:\?.*)?$/, async (route) => {
      const url = new URL(route.request().url());
      const status = url.searchParams.get("status");

      if (status === "pending_review") {
        await new Promise((resolve) => setTimeout(resolve, 350));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: responseBody(91),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: responseBody(status === "accepted" ? 22 : 1),
      });
    });

    await page.goto("/recogidas");
    await expect(page.getByText("Total", { exact: true }).locator("..").getByText("1", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Pendiente revision" }).click();
    await page.getByRole("button", { name: "Aprobadas" }).click();

    const totalCard = page.getByText("Total", { exact: true }).locator("..");
    await expect(totalCard.getByText("22", { exact: true })).toBeVisible();
    await page.waitForTimeout(450);
    await expect(totalCard.getByText("22", { exact: true })).toBeVisible();
    await expect(totalCard.getByText("91", { exact: true })).not.toBeVisible();
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
