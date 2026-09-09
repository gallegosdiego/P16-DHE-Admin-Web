import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

test.describe("Rutas page", () => {
  test.beforeEach(async ({ page }) => {
    await withSession(page);
    await page.goto("/rutas");
  });

  test("loads rutas page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Rutas diarias" })).toBeVisible();
  });

  test("renders all kanban lane headings", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Planificada" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Completada" })).toBeVisible();
  });

  test("shows route card with driver and zone", async ({ page }) => {
    await expect(page.getByText(/^Ruta #18$/)).toBeVisible();
    await expect(page.getByText("Conductor Demo • Norte")).toBeVisible();
  });

  test("shows custody board grouped by zone and package size", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Custodia de sede y despacho" })).toBeVisible();
    await expect(page.getByText("Disponibles", { exact: true })).toBeVisible();
    await expect(page.getByText("Norte · Bogotá")).toBeVisible();
    // Desde OT-07 el desglose por tamaño se abrevia: "N paquetes · N frágiles · P/M/G".
    await expect(page.getByText(/1 P \/ 1 M \/ 0 G/)).toBeVisible();
  });

  test("previews a dispatch proposal without confirming a route", async ({ page }) => {
    // El grupo es un <details>: se abre por el resumen para exponer los checkboxes.
    await page.getByText("Norte · Bogotá").click();
    await page.getByRole("checkbox", { name: "Seleccionar #DHE00031" }).check();
    await page.getByRole("checkbox", { name: "Seleccionar #DHE00032" }).check();
    await page.getByRole("checkbox", { name: "Seleccionar piloto Conductor Demo" }).check();
    await page.getByRole("button", { name: "Calcular propuesta" }).click();

    // Desde OT-07 la propuesta muestra los totales y ofrece aplicarla; este
    // caso sigue sin confirmar nada: solo valida la vista previa.
    await expect(page.getByText("Candidatos", { exact: true })).toBeVisible();
    await expect(page.getByText("Propuestos", { exact: true })).toBeVisible();
    await expect(page.getByText("Sin asignar", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear rutas propuestas" })).toBeVisible();
  });

  test("opens the read-only manifest with custody counters", async ({ page }) => {
    await page.getByRole("button", { name: "Manifiesto" }).first().click();
    const overlay = page.locator("div.fixed.inset-0");
    await expect(overlay.getByRole("heading", { name: "MAN-20260729-0018" })).toBeVisible();
    await expect(overlay.getByText("Aceptados por piloto", { exact: true })).toBeVisible();
    await expect(overlay.getByText("Siguen en sede", { exact: true })).toBeVisible();
    await expect(overlay.getByText("Pendientes", { exact: true })).toBeVisible();
    await overlay.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "MAN-20260729-0018" })).toBeHidden();
  });

  test("renders progress counters for routes", async ({ page }) => {
    const plannedRouteCard = page.locator("div").filter({ has: page.getByText(/^Ruta #18$/) }).first();
    const activeRouteCard = page.locator("div").filter({ has: page.getByText(/^Ruta #19$/) }).first();
    await expect(plannedRouteCard.getByText(/^0\/2$/)).toBeVisible();
    await expect(activeRouteCard.getByText(/^1\/2$/)).toBeVisible();
  });

  test("opens the manifest before starting a route with pending custody", async ({ page }) => {
    await page.getByRole("button", { name: "Revisar custodia" }).first().click();
    const overlay = page.locator("div.fixed.inset-0");
    await expect(overlay.getByRole("heading", { name: "MAN-20260729-0018" })).toBeVisible();
    await expect(overlay.getByText("Pendientes", { exact: true })).toBeVisible();
    await overlay.getByRole("button", { name: "Cerrar", exact: true }).click();
  });

  test("shows complete action for pending stop in active route", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Completar" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Completar" }).first().click();
    await expect(page.getByText("Parada completada")).toBeVisible();
  });

  // Antes la entrega manual exigía una nota del operador en un modal; desde el
  // rediseño del tablero es un solo clic con nota estándar. Las paradas se
  // renderizan doble (móvil primero en el DOM, oculta en escritorio): se apunta
  // a la lista de escritorio.
  test("allows a manual handover from custody to the driver", async ({ page }) => {
    await page
      .locator("div.hidden.md\\:block")
      .getByRole("button", { name: "Pasar custodia al piloto" })
      .first()
      .click();
    await expect(page.getByText("Custodia del paquete transferida al piloto.")).toBeVisible();
  });

  test("opens new route modal with driver selector and stop list", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva ruta" }).click();
    await expect(page.getByRole("heading", { name: "Crear nueva ruta diaria" })).toBeVisible();
    await expect(page.getByLabel("Piloto *")).toBeVisible();
    await expect(page.getByText(/Envíos elegibles/)).toBeVisible();
  });

  test("shows empty state in completed lane when no completed routes", async ({ page }) => {
    // Con el mock, Planificada y Activa tienen rutas; el único vacío es el
    // carril Completada, así que "Sin rutas" solo puede venir de él.
    await expect(page.getByRole("heading", { name: "Completada" })).toBeVisible();
    await expect(page.getByText("Sin rutas")).toBeVisible();
  });
});
