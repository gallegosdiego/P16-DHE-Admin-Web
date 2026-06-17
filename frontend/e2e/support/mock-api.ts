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
    console.log(`[mock] ${route.request().method()} ${path}`);

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

    if (path.endsWith("/api/financial/kpis")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          dso: 12,
          cod_collection_rate: 92,
          avg_margin_per_shipment: 6400,
          operating_ratio: 0.68,
          revenue_per_delivery: 12000,
          total_receivable: 390000,
          total_cod_in_street: 120000,
          monthly_revenue: 1200000,
          monthly_costs: 720000,
          monthly_profit: 480000,
          profit_margin_pct: 40,
        }),
      });
      return;
    }

    if (path.endsWith("/api/financial/alerts")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { type: "cod_in_street", severity: "warning", title: "COD en calle", count: 1, amount: 120000 },
        ]),
      });
      return;
    }

    if (path.endsWith("/api/financial/daily-summary")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          packages: { total_today: 12, delivered_today: 8, total_week: 52, total_month: 210 },
          revenue: {
            gross_income: 1200000,
            driver_cost: 360000,
            gross_profit: 840000,
            fixed_expenses_month: 180000,
            payroll_month: 220000,
          },
          cod: { collected_today: 90000, pending_today: 30000, drivers_with_cash: 1 },
          receivables: { total_owed: 390000, overdue_count: 1, oldest_days: 22 },
          outsourcing: { service_income: 0, driver_cost: 0, profit: 0, packages: 0 },
        }),
      });
      return;
    }

    if (path.endsWith("/api/financial/aging-report")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          clients: [
            {
              id: 1,
              name: "Comercial Uno",
              company: "Comercial Uno SAS",
              phone: "3001112233",
              total_owed: 250000,
              current: 50000,
              bucket_1_30: 200000,
              bucket_31_60: 0,
              bucket_61_90: 0,
              bucket_90_plus: 0,
              shipments_count: 5,
              oldest_days: 22,
            },
            {
              id: 2,
              name: "Textiles Dos",
              company: "Textiles Dos",
              phone: "3004445566",
              total_owed: 140000,
              current: 140000,
              bucket_1_30: 0,
              bucket_31_60: 0,
              bucket_61_90: 0,
              bucket_90_plus: 0,
              shipments_count: 3,
              oldest_days: 4,
            },
          ],
          summary: {
            total_receivable: 390000,
            total_current: 190000,
            total_1_30: 200000,
            total_31_60: 0,
            total_61_90: 0,
            total_90_plus: 0,
            overdue_pct: 51,
          },
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

    if (path.endsWith("/api/financial/profitability/by-driver")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: 1, name: "Conductor Demo", total_shipments: 8, total_revenue: 96000, total_cost: 24000, profit: 72000, margin_pct: 75 },
        ]),
      });
      return;
    }

    if (path.endsWith("/api/financial/cash-flow")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          weeks: [
            {
              week_number: 1,
              start_date: "2026-06-15",
              end_date: "2026-06-21",
              opening_balance: 500000,
              inflows: { client_payments: 300000, cod_collections: 90000, other: 0, total: 390000 },
              outflows: { driver_payments: 120000, expenses: 80000, payroll: 50000, cod_remittance: 0, other: 0, total: 250000 },
              net_flow: 140000,
              closing_balance: 640000,
            },
          ],
        }),
      });
      return;
    }

    if (path.endsWith("/api/cod-settlements/daily-summary")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          drivers: [
            { driver_id: 1, driver_name: "Carlos Repartidor", packages: 4, total_expected: 120000, collected: 90000, pending: 30000, difference: 0 },
          ],
          totals: { packages: 4, total_expected: 120000, collected: 90000, pending: 30000 },
        }),
      });
      return;
    }

    if (path.endsWith("/api/cod-settlements")) {
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
        body: JSON.stringify({
          data: [
            {
              id: 1,
              driver_id: 1,
              settlement_date: new Date().toISOString().slice(0, 10),
              total_collected: 90000,
              total_settled: 60000,
              difference: 30000,
              status: "partial",
              notes: null,
              settled_by: 1,
              driver: { id: 1, name: "Carlos Repartidor" },
              created_at: new Date().toISOString(),
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

    if (/\/api\/expenses\/\d+\/history$/.test(path)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          expense: { id: 1, name: "Arriendo oficina", amount: 800000 },
          payments: [
            { id: 1, period_date: "2026-06-01", amount: 800000, status: "paid", paid_at: "2026-06-05" },
          ],
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
        body: JSON.stringify({
          expenses: [
            {
              id: 1,
              name: "Arriendo oficina",
              amount: 800000,
              frequency: "monthly",
              due_day: 5,
              notes: null,
              is_active: true,
              current_month_status: "pending",
              current_month_paid_at: null,
              days_until_due: 3,
              is_due_soon: true,
              is_overdue: false,
            },
          ],
          total_monthly: 800000,
        }),
      });
      return;
    }

    if (/\/api\/employees\/\d+\/history$/.test(path)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          employee: { id: 1, name: "Sandra Lopez" },
          payments: [
            { id: 1, period_start: "2026-06-01", period_end: "2026-06-30", amount: 2200000, status: "paid", paid_at: "2026-06-15" },
          ],
        }),
      });
      return;
    }

    if (path.endsWith("/api/employees")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          employees: [
            {
              id: 1,
              name: "Sandra Lopez",
              position: "Administradora",
              phone: "3000000000",
              salary: 2200000,
              pay_frequency: "monthly",
              is_active: true,
              last_payment_status: "pending",
              last_payment_date: null,
              last_period_end: null,
            },
          ],
          total_monthly_payroll: 2200000,
        }),
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
