import type { Page } from "@playwright/test";

const apiOrigin = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8000";

function buildShipment(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

export async function mockApi(page: Page) {
  await page.route(`${apiOrigin}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/api/me")) {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: 1,
            name: "Admin Demo",
            email: "admin@danheiexpress.com",
            phone: "3000000000",
            roles: ["superadmin"],
          }),
        });
        return;
      }
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

    if (path.endsWith("/api/me/password")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Password updated" }),
      });
      return;
    }

    if (path.endsWith("/api/notifications/unread-count")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 2 }),
      });
      return;
    }

    if (path.endsWith("/api/notifications")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: 1,
              title: "Ruta #18 lista para iniciar",
              body: "Conductor Juan Perez asignado.",
              type: "info",
              read_at: null,
              action_url: "/rutas",
              created_at: new Date().toISOString(),
            },
            {
              id: 2,
              title: "Nueva regla de tarifa",
              body: "Zona Norte actualizada.",
              type: "success",
              read_at: null,
              action_url: "/zonas",
              created_at: new Date().toISOString(),
            },
          ],
          current_page: 1,
          last_page: 1,
          per_page: 5,
          total: 2,
        }),
      });
      return;
    }

    if (path.endsWith("/api/notifications/read-all")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ updated: 2, message: "ok" }),
      });
      return;
    }

    if (path.endsWith("/api/zones")) {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: 99,
            name: "Zona Nueva",
            city: "Bogota",
            type: "urban",
            is_active: true,
            sort_order: 0,
            base_price: 10000,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            name: "Zona Norte",
            city: "Bogota",
            type: "urban",
            is_active: true,
            sort_order: 1,
            base_price: 11500,
            description: "Cobertura urbana",
          },
          {
            id: 2,
            name: "Zona Sur",
            city: "Bogota",
            type: "suburban",
            is_active: false,
            sort_order: 2,
            base_price: 14000,
            description: "Cobertura extendida",
          },
        ]),
      });
      return;
    }

    if (/\/api\/zones\/\d+$/.test(path) && route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 1,
          pricing_rules: [
            {
              id: 10,
              name: "Regla base",
              type: "flat",
              base_price: 11500,
              per_kg_price: 0,
              per_km_price: 0,
              min_price: 0,
              max_weight_kg: 0,
              priority: 1,
              is_active: true,
            },
          ],
        }),
      });
      return;
    }

    if (/\/api\/zones\/\d+$/.test(path) && route.request().method() === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (/\/api\/zones\/\d+\/pricing-rules$/.test(path)) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: 20,
          name: "Regla pico",
          type: "surge",
          base_price: 3000,
          per_kg_price: 0,
          per_km_price: 0,
          min_price: 0,
          max_weight_kg: 0,
          priority: 2,
          is_active: true,
        }),
      });
      return;
    }

    if (/\/api\/zones\/\d+\/calculate$/.test(path)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          amount: 14500,
          formatted: "$14.500",
          rule_applied: { id: 10, name: "Regla base" },
        }),
      });
      return;
    }

    if (path.endsWith("/api/routes")) {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: 21 }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 18,
            status: "planned",
            zone: "Norte",
            date: "2026-05-14",
            progress: 0,
            completed_stops: 0,
            total_stops: 2,
            driver: { id: 1, name: "Conductor Demo" },
            stops: [
              { id: 801, sort_order: 1, status: "pending", shipment: { display_code: "#DHE00011", recipient_name: "Cliente Demo", recipient_address: "Calle Demo 123" } },
              { id: 802, sort_order: 2, status: "pending", shipment: { display_code: "#DHE00012", recipient_name: "Cliente Secundario", recipient_address: "Cra 45 #12-33" } },
            ],
          },
          {
            id: 19,
            status: "active",
            zone: "Centro",
            date: "2026-05-14",
            progress: 50,
            completed_stops: 1,
            total_stops: 2,
            driver: { id: 1, name: "Conductor Demo" },
            stops: [
              { id: 803, sort_order: 1, status: "completed", shipment: { display_code: "#DHE00013", recipient_name: "Ana", recipient_address: "Cl 1" } },
              { id: 804, sort_order: 2, status: "pending", shipment: { display_code: "#DHE00014", recipient_name: "Luis", recipient_address: "Cl 2" } },
            ],
          },
        ]),
      });
      return;
    }

    if (/\/api\/routes\/\d+\/start$/.test(path)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    if (/\/api\/routes\/\d+\/stops\/\d+\/complete$/.test(path)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    if (/\/api\/routes\/\d+\/reorder$/.test(path)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    if (path.endsWith("/api/dashboard")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          today: {
            total: 12,
            registered: 2,
            confirmed: 1,
            in_transit: 3,
            delivered: 5,
            issue: 1,
            returned: 0,
            cancelled: 0,
          },
          financial: {
            cod_pending: 200000,
            cod_collected: 90000,
            post_sale_owed: 130000,
            today_revenue: 420000,
            today_driver_cost: 120000,
            today_profit: 300000,
          },
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

    if (path.endsWith("/api/financial/overview")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cod: { pending: 200000, collected: 90000, settled: 30000 },
          post_sale: { pending: 130000, invoiced: 50000, overdue: 10000, total_receivable: 190000 },
          drivers: { pending_payment: 60000 },
          totals: { total_receivable: 390000, total_payable: 60000 },
        }),
      });
      return;
    }

    if (path.endsWith("/api/financial/driver-board")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: 1,
              name: "Conductor Demo",
              initials: "CD",
              phone: "3001234567",
              vehicle: "Moto",
              plate: "ABC123",
              zone: "Norte",
              status: "active",
              per_package_rate: 3000,
              daily_rate: null,
              active_shipments_count: 2,
              delivered_today_count: 4,
              cod_pending: 120000,
              cod_collected: 80000,
              unpaid_fees: 24000,
              today_deliveries: 4,
              collect_shipment_id: 11,
              settle_shipment_id: 11,
              driver_paid_shipment_id: 11,
            },
          ],
        }),
      });
      return;
    }

    if (path.endsWith("/api/clients")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: 1,
              name: "Cliente Demo",
              phone: "3001111111",
              email: "cliente@demo.com",
              company: "Demo SAS",
              nit: "900000001",
              billing_type: "cash_on_delivery",
              is_active: true,
              notes: null,
              shipments_count: 2,
              created_at: new Date().toISOString(),
            },
          ],
          current_page: 1,
          last_page: 1,
          per_page: 10,
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

    if (path.endsWith("/api/drivers")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: 1,
              name: "Conductor Demo",
              initials: "CD",
              phone: "3001234567",
              vehicle: "Moto",
              plate: "ABC123",
              zone: "Norte",
              status: "active",
              per_package_rate: 3000,
              daily_rate: null,
              active_shipments_count: 2,
              delivered_today_count: 4,
            },
          ],
          current_page: 1,
          last_page: 1,
          per_page: 10,
          total: 1,
        }),
      });
      return;
    }

    if (/\/api\/drivers\/\d+$/.test(path)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 1,
          name: "Conductor Demo",
          initials: "CD",
          phone: "3001234567",
          vehicle: "Moto",
          plate: "ABC123",
          zone: "Norte",
          status: "active",
          per_package_rate: 3000,
          daily_rate: null,
          shipments: [
            buildShipment({ id: 11, status: "delivered", display_code: "#DHE00011" }),
            buildShipment({ id: 12, status: "issue", display_code: "#DHE00012", recipient_name: "Cliente Problema" }),
          ],
          today_summary: {
            assigned: 6,
            delivered: 4,
            cash_collected: 120000,
            pending_cash: 30000,
            earnings: 18000,
          },
        }),
      });
      return;
    }

    if (path.endsWith("/api/expenses")) {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: 99 }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ expenses: [], total_monthly: 0 }),
      });
      return;
    }

    if (path.endsWith("/api/employees")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ employees: [], total_monthly_payroll: 0 }),
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

    if (path.endsWith("/api/audit-logs")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: 501,
              user_id: 1,
              action: "shipments.change_status",
              description: "Cambio de estado masivo",
              metadata: { shipment_ids: [11, 12], status: "in_transit" },
              created_at: new Date().toISOString(),
              user: { id: 1, name: "Admin Demo" },
            },
          ],
          current_page: 1,
          last_page: 1,
          per_page: 50,
          total: 1,
        }),
      });
      return;
    }

    if (path.endsWith("/api/reports/stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          period: { from: "2026-05-01", to: "2026-05-13" },
          summary: {
            total: 20,
            delivered: 15,
            delivery_rate: 75,
            issues: 2,
            returned: 1,
            cancelled: 2,
            revenue: 700000,
            driver_cost: 210000,
            profit: 490000,
            cod_collected: 300000,
          },
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

    if (path.includes("/api/shipments")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            buildShipment(),
            buildShipment({
              id: 12,
              display_code: "#DHE00012",
              tracking_code: "DHE00012",
              recipient_name: "Cliente Secundario",
              status: "registered",
              driver_id: null,
            }),
          ],
          current_page: 1,
          last_page: 1,
          per_page: 50,
          total: 2,
        }),
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

export async function withSession(page: Page) {
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
