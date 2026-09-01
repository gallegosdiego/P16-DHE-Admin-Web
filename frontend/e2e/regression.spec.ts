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

  test("detalle de cliente separa contacto, empresa y resumen financiero", async ({ page }) => {
    await withSession(page);
    await page.goto("/clientes");
    await page.getByRole("button", { name: "Ver cliente Cliente Demo" }).click();
    await expect(page).toHaveURL(/\/clientes\/1$/);

    const detail = page.getByRole("main");
    await expect(detail.getByRole("heading", { name: "Cliente Demo" })).toBeVisible();
    await expect(detail.getByText("Contacto de cobro", { exact: true })).toBeVisible();
    await expect(detail.getByText("Empresa / razón social", { exact: true })).toBeVisible();
    await expect(detail.getByText("Informativas", { exact: true })).toBeVisible();
    await expect(detail.getByText("Contra entrega", { exact: true })).toBeVisible();
    await expect(detail.getByText("Cobro post entrega", { exact: true })).toBeVisible();
    await expect(detail.getByText("Prepago", { exact: true })).toBeVisible();
    await expect(detail.getByText("$ 150.000", { exact: true })).toBeVisible();

    await detail.getByRole("tab", { name: /Envíos/ }).click();
    await expect(detail.getByText("Mostrando 2 de 2 envíos", { exact: true })).toBeVisible();
    await expect(detail.getByRole("cell", { name: "#DHE00011", exact: true })).toBeVisible();

    await detail.getByRole("button", { name: "Clientes" }).click();
    await expect(page).toHaveURL(/\/clientes$/);
  });

  test("clientes mobile alinea controles y deja eliminar a la izquierda", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await withSession(page);
    await page.goto("/clientes");

    const newClientButton = page.getByRole("button", { name: "Nuevo cliente" }).first();
    const searchButton = page.getByRole("button", { name: "Buscar" });
    await expect(newClientButton).toBeVisible();
    await expect(searchButton).toBeVisible();

    const [newClientBox, searchBox] = await Promise.all([
      newClientButton.boundingBox(),
      searchButton.boundingBox(),
    ]);
    expect(newClientBox).not.toBeNull();
    expect(searchBox).not.toBeNull();
    expect(newClientBox!.height).toBeCloseTo(searchBox!.height, 2);

    const clientCard = page.getByRole("article").filter({ hasText: "Cliente Demo" }).first();
    await expect(clientCard).toBeVisible();
    await expect(clientCard.locator("button")).toHaveCount(3);
    await expect(clientCard.locator("button").nth(0)).toHaveAttribute("aria-label", "Eliminar cliente Cliente Demo");
    await expect(clientCard.locator("button").nth(1)).toHaveAttribute("aria-label", "Ver cliente Cliente Demo");
    await expect(clientCard.locator("button").nth(2)).toHaveAttribute("aria-label", "Editar cliente Cliente Demo");
  });

  test("conductores board and detail render key metrics", async ({ page }) => {
    await withSession(page);
    await page.goto("/conductores");
    await expect(page.getByRole("main").getByRole("heading", { name: /pilotos/i })).toBeVisible();
    await expect(page.getByText("Envíos asignados")).toBeVisible();
    await expect(page.getByText("piloto.demo@danheiexpress.com")).toBeVisible();
    await page.getByRole("link", { name: /expediente|Ver/i }).first().click();
    await expect(page.getByText("Tasa de entrega")).toBeVisible();
    await expect(page.getByText("piloto.demo@danheiexpress.com")).toBeVisible();
    await expect(page.getByRole("main").getByText("Novedades")).toBeVisible();
    await expect(page.getByRole("button", { name: /Asignar env[ií]o/ })).toBeVisible();
  });

  test("auditoria filters and metadata inspector work", async ({ page }) => {
    await withSession(page);
    await page.goto("/auditoria");
    await expect(page.getByRole("main").getByRole("heading", { name: /Auditor[ií]a/ })).toBeVisible();
    await page.getByPlaceholder(/Filtrar por usuario, acci[oó]n o descripci[oó]n/).fill("masivo");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText("Cambio de estado masivo").first()).toBeVisible();
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
    await expect(page.getByRole("main").getByRole("heading", { name: /Configuraci[oó]n/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Empresa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tarifas de servicios a pilotos" })).toBeVisible();
    await expect(page.getByText("Entrega estándar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear regla" })).toBeVisible();
  });

  test("configuracion muestra credenciales e incidentes al superadmin", async ({ page }) => {
    await withSession(page);
    await page.goto("/configuracion");

    await expect(page.getByRole("heading", { name: "Credenciales de integración" })).toBeVisible();
    // Un secreto guardado nunca debe mostrarse: solo su máscara.
    await expect(page.getByText(/no se pueden volver a ver/i)).toBeVisible();

    await expect(page.getByRole("heading", { name: "Incidentes de la API" })).toBeVisible();
    // La referencia es lo que enlaza «me salió un error» con la traza.
    await expect(page.getByText(/11111111-2222-3333-4444-555555555555/)).toBeVisible();
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
    await page.getByRole("button", { name: "Continuar" }).click();

    const locationSelect = page.getByLabel("Sede Danhei");
    await expect(locationSelect).toHaveValue("1");
    await expect(locationSelect.locator("option:checked")).toContainText("Sede principal");
    await expect(locationSelect.locator("option")).toHaveCount(3);
    await expect(locationSelect.locator("option").nth(1)).toContainText("Sede B");
    await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled();
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
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByText("No hay una sede activa para recibir paquetes.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Configura una sede" })).toHaveAttribute("href", "/configuracion/sedes");
    await expect(page.getByLabel("Sede Danhei")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled();
  });

  test("nuevo ingreso crea una solicitud de recogida donde el cliente", async ({ page }) => {
    await withSession(page);
    await page.route("**/api/pickup-intakes", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: 77,
            pickup_code: "ING-000077",
            intake_mode: "pickup_at_client_location",
            status: "pending_review",
            package_count: 1,
          },
        }),
      });
    });

    await page.goto("/recogidas/nueva");
    await page.getByRole("radio", { name: /Recoger donde el cliente/i }).click();
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByLabel("Sede Danhei")).toHaveCount(0);
    await page.getByRole("textbox", { name: "Dirección de recogida*", exact: true }).fill("Calle 45 # 20-10");
    await page.getByRole("button", { name: "Continuar" }).click();

    await page.getByRole("textbox", { name: "Destinatario*", exact: true }).fill("Destinatario Recogida");
    await page.getByRole("textbox", { name: "Teléfono del destinatario*", exact: true }).fill("3009998877");
    await page.getByRole("textbox", { name: "Dirección de entrega*", exact: true }).fill("Carrera 7 # 40-25");
    const responsePromise = page.waitForResponse((res) => res.url().includes("pickup-intakes"));
    await page.getByRole("button", { name: "Continuar" }).click();

    if (await page.getByRole("button", { name: "Confirmar envío" }).isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Confirmar envío" }).click();
    }

    const response = await responsePromise;
    const request = response.request();

    const body = request.postData() ?? "";
    expect(body).toContain("pickup_at_client_location");
    expect(body).toContain('name="source"');
    expect(body).toContain("Calle 45 # 20-10");

    await expect(page.getByText(/Solicitud .*creada/i)).toBeVisible();
    await page.waitForURL("**/recogidas");
  });

  test("nuevo ingreso exige la fecha estimada en la entrega planificada", async ({ page }) => {
    await withSession(page);
    await page.goto("/recogidas/nueva");
    await page.getByRole("radio", { name: /El cliente lleva a sede/i }).click();
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByLabel("Fecha estimada de entrega en sede")).toBeVisible();
    await expect(page.getByLabel("Sede Danhei")).toHaveValue("1");

    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(
      page.getByText("Indica la fecha estimada en que el cliente llevará los paquetes a la sede."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Anterior" }).click();
    await page.getByRole("radio", { name: /Recibir ahora/i }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(
      page.getByText("Indica la fecha estimada en que el cliente llevará los paquetes a la sede."),
    ).toHaveCount(0);
  });

  test("nuevo ingreso muestra diagnostico trazable cuando falta actualizar la base de datos", async ({ page }) => {
    await withSession(page);
    await page.route("**/api/pickup-intakes/walk-in/complete", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "El módulo de ingreso aún no está listo en el servidor. Debe completarse la actualización de la base de datos.",
          code: "operational_intake_unavailable",
          retryable: true,
          error_id: "ERR-QA-INGRESO-503",
          required_action: "database_update",
          missing_tables_count: 8,
          missing_columns_count: 2,
          deployment: {
            status: "failed",
            commit: "b7acc43production",
            phase: "pre-migrate operational foundation",
            exit_code: 1,
          },
        }),
      });
    });

    await page.goto("/recogidas/nueva");
    await page.getByRole("button", { name: /Contacto, remitente e instrucciones/i }).click();
    await page.getByLabel("Contacto del cliente / remitente").fill("QA Danhei");
    await page.getByLabel("Teléfono del cliente / remitente").fill("3001234567");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();

    await page.getByRole("textbox", { name: "Destinatario*", exact: true }).fill("Destinatario QA");
    await page.getByRole("textbox", { name: "Teléfono del destinatario*", exact: true }).fill("3007654321");
    await page.getByRole("textbox", { name: "Dirección de entrega*", exact: true }).fill("Carrera 13 # 10-18");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Confirmar y recibir" }).click();

    const errorNotice = page.getByRole("alert", { name: "Error al registrar el ingreso" });
    await expect(errorNotice.getByText("Actualización del servidor pendiente")).toBeVisible();
    await expect(errorNotice.getByText("El paquete no se registró.", { exact: false })).toBeVisible();
    await expect(errorNotice.getByText("Componentes pendientes en la base de datos: 10.")).toBeVisible();
    await expect(errorNotice.getByText("versión b7acc43produ")).toBeVisible();
    await expect(errorNotice.getByText("ERR-QA-INGRESO-503")).toBeVisible();
  });

  test("ingresos muestra el error trazable y permite reintentar sin simular una lista vacia", async ({ page }) => {
    await withSession(page);
    let failPickupList = true;

    await page.route(/\/api\/pickup-requests(?:\?.*)?$/, async (route) => {
      if (failPickupList) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "El módulo de ingreso aún no está listo en el servidor.",
            code: "operational_intake_unavailable",
            retryable: true,
            error_id: "ERR-QA-RECOGIDAS-001",
            required_action: "database_update",
            missing_tables_count: 8,
            missing_columns_count: 0,
            deployment: {
              status: "failed",
              commit: "b7acc43",
              phase: "pre-migrate operational foundation",
            },
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
    await expect(errorNotice.getByText("La base de datos operativa no terminó de actualizarse")).toBeVisible();
    await expect(errorNotice.getByText("El módulo de ingreso aún no está listo en el servidor.")).toBeVisible();
    await expect(errorNotice.getByText("Componentes pendientes en la base de datos: 8.")).toBeVisible();
    await expect(errorNotice.getByText("ERR-QA-RECOGIDAS-001")).toBeVisible();
    await expect(page.getByText("No hay solicitudes para este filtro")).not.toBeVisible();

    failPickupList = false;
    await errorNotice.getByRole("button", { name: "Comprobar de nuevo" }).click();

    await expect(errorNotice).not.toBeVisible();
    await expect(page.getByText("No hay solicitudes para este filtro")).toBeVisible();
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
