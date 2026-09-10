import { test, expect } from "@playwright/test";
import { withSession } from "./support/mock-api";

test("cierre de día carga pilotos y permite seleccionar retorno", async ({ page }) => {
  await withSession(page);
  await page.route("**/api/routes/day-close**", async route => route.fulfill({ json: { date: "2026-09-09", drivers: [{ driver_id: 1, driver_name: "Piloto QA", packages: [{ id: 42, display_code: "#DHE00042", status: "assigned_to_route" }], counts: { departed: 1, delivered: 0, issues: 0, on_motorcycle: 1, returned_to_warehouse: 0 }, routes: [], day_settled: false }] } }));
  await page.goto("/cierre-dia");
  await expect(page.getByText("Piloto QA")).toBeVisible();
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: /Recibir en bodega \(1\)/ })).toBeVisible();
});
