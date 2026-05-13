import { expect, test, type Page } from "@playwright/test";

const apiOrigin = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8000";

async function mockApi(page: Page) {
  await page.route(`${apiOrigin}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/api/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: 1,
            name: "Admin Demo",
            email: "admin@danheiexpress.com",
            phone: "3000000000",
            roles: ["superadmin"],
          },
        }),
      });
      return;
    }

    if (path.endsWith("/api/dashboard")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          today: { total: 12, registered: 2, confirmed: 1, in_transit: 3, delivered: 5, issue: 1, returned: 0, cancelled: 0 },
          financial: { cod_pending: 200000, cod_collected: 90000, post_sale_owed: 130000, today_revenue: 420000, today_driver_cost: 120000, today_profit: 300000 },
          week: { total: 74 },
        }),
      });
      return;
    }

    if (path.endsWith("/api/dashboard/hourly")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          registrations: [
            { hour: "08", label: "08:00", count: 2 },
            { hour: "09", label: "09:00", count: 3 },
            { hour: "10", label: "10:00", count: 4 },
          ],
          deliveries: [
            { hour: "08", count: 1 },
            { hour: "09", count: 2 },
            { hour: "10", count: 3 },
          ],
          peak_hour: { hour: "10", label: "10:00", count: 4 },
        }),
      });
      return;
    }

    if (path.includes("/api/shipments")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: 11,
              display_code: "#DHE00011",
              tracking_code: "DHE00011",
              sequence_number: 11,
              client_id: 1,
              driver_id: 1,
              created_by: 1,
              recipient_name: "Cliente Demo",
              recipient_phone: "3001111111",
              recipient_address: "Calle Demo 123",
              recipient_zone: "Norte",
              recipient_city: "Bogota",
              delivery_instructions: null,
              status: "in_transit",
              payment_type: "cash_on_delivery",
              financial_status: "pending",
              shipping_cost: 10000,
              cod_amount: 40000,
              driver_fee: 3000,
              driver_paid: false,
              is_outsourced: false,
              outsource_company: null,
              outsource_amount: null,
              issue_note: null,
              notes: null,
              picked_up_at: null,
              delivered_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              driver: { id: 1, name: "Conductor Demo" },
            },
          ],
          current_page: 1,
          last_page: 1,
          per_page: 5,
          total: 1,
        }),
      });
      return;
    }

    if (path.endsWith("/api/clients-receivable")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ clients: [], total_owed: 0, count: 0 }),
      });
      return;
    }

    if (path.endsWith("/api/expenses")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ expenses: [], total_monthly: 0 }),
      });
      return;
    }

    if (path.endsWith("/api/users")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: 1,
              name: "Admin Demo",
              email: "admin@danheiexpress.com",
              phone: "3000000000",
              role_names: ["superadmin"],
              permissions_count: 40,
              created_at: new Date().toISOString(),
            },
          ],
          current_page: 1,
          last_page: 1,
          per_page: 25,
          total: 1,
        }),
      });
      return;
    }

    if (path.endsWith("/api/roles")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ name: "superadmin", users_count: 1, permissions: [] }]),
      });
      return;
    }

    if (path.endsWith("/api/reports/stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          period: { from: "2026-05-01", to: "2026-05-13" },
          summary: { total: 20, delivered: 15, delivery_rate: 75, issues: 2, returned: 1, cancelled: 2, revenue: 700000, driver_cost: 210000, profit: 490000, cod_collected: 300000 },
          by_status: { delivered: 15, issue: 2, returned: 1, cancelled: 2 },
          by_driver: [],
          by_client: [],
        }),
      });
      return;
    }

    if (path.includes("/api/reports/export/")) {
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        body: "header1,header2\nvalue1,value2\n",
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

async function withSession(page: Page) {
  await mockApi(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("dhe_auth_token", "e2e-token");
  });
  await page.context().addCookies([
    {
      name: "dhe_auth_token",
      value: "e2e-token",
      url: "http://localhost:3000",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

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
