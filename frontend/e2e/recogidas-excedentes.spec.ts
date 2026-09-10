import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";
import path from "path";

const artifactDir = "C:\\Users\\HP Z480\\.gemini\\antigravity\\brain\\372252a7-f793-45e9-9f52-2ed68d0ed544";

const mockZones = [
  { id: 1, name: "Usaquén", city: "Bogotá", type: "urban", is_active: true, sort_order: 1 },
  { id: 2, name: "Chapinero", city: "Bogotá", type: "urban", is_active: true, sort_order: 2 },
  { id: 3, name: "Suba", city: "Bogotá", type: "urban", is_active: true, sort_order: 3 },
  { id: 4, name: "Chía", city: "Chía", type: "regional", is_active: true, sort_order: 4 },
];

const mockTask = {
  id: 42,
  task_type: "hub_intake",
  status: "in_progress",
  pickup_request: {
    id: 10,
    pickup_code: "REC-2026-0042",
    package_count: 3,
    contact_name: "Distribuciones ABC",
    packages: [
      { id: 101, package_index: 1, recipient_name: "Juan Perez", guide_number: "DHE-001" },
      { id: 102, package_index: 2, recipient_name: "Maria Gomez", guide_number: "DHE-002" },
      { id: 103, package_index: 3, recipient_name: "Carlos Ruiz", guide_number: "DHE-003" },
    ],
  },
  service_location: {
    id: 1,
    name: "Sede Principal Danhei",
    address_line1: "Calle 100 # 15-20",
  },
};

const mockBatch = {
  id: 88,
  batch_code: "LOTE-HUB-088",
  status: "open",
  expected_packages: 3,
  items: [
    { id: 201, pickup_package_id: 101, pickup_package: { id: 101, package_index: 1, recipient_name: "Juan Perez", guide_number: "DHE-001" } },
    { id: 202, pickup_package_id: 102, pickup_package: { id: 102, package_index: 2, recipient_name: "Maria Gomez", guide_number: "DHE-002" } },
    { id: 203, pickup_package_id: 103, pickup_package: { id: 103, package_index: 3, recipient_name: "Carlos Ruiz", guide_number: "DHE-003" } },
  ],
};

async function setupHubReceptionMocks(page: import("@playwright/test").Page) {
  let lastReconcilePayload: string = "";
  let reconciled = false;

  // Mock /operational-tasks
  await page.route("**/api/operational-tasks**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/batch")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockBatch }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [mockTask],
        meta: { current_page: 1, last_page: 1, per_page: 100, total: 1 },
      }),
    });
  });

  // Mock /zones
  await page.route("**/api/zones**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockZones),
    });
  });

  // Mock /operational-pickup-batches/88/reconcile
  await page.route("**/api/operational-pickup-batches/88/reconcile**", async (route) => {
    lastReconcilePayload = route.request().postData() || "";
    reconciled = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: 88,
          status: "completed_with_differences",
          expected_packages: 3,
          received_packages: 3,
          rejected_packages: 0,
          missing_packages: 0,
          undeclared_packages: 2,
        },
      }),
    });
  });

  // Mock /operational-pickup-batches/88/receipt
  await page.route("**/api/operational-pickup-batches/88/receipt**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          receipt_code: "LOTE-HUB-088",
          batch_id: 88,
          status: "completed_with_differences",
          status_label: "Recepción con diferencias",
          intake_mode: "planned_dropoff_at_hub",
          received_at: new Date().toISOString(),
          generated_at: new Date().toISOString(),
          pickup_request: {
            id: 10,
            pickup_code: "REC-2026-0042",
            source: "hub",
            contact_name: "Distribuciones ABC",
            contact_phone: "3100000000",
          },
          customer: {
            id: 1,
            name: "Distribuciones ABC",
            company: "ABC S.A.S",
            phone: "3100000000",
          },
          service_location: {
            id: 1,
            code: "HUB-01",
            name: "Sede Principal Danhei",
            address_line1: "Calle 100 # 15-20",
            city: "Bogotá",
          },
          received_by: {
            id: 1,
            name: "Operador Danhei",
            phone: "3001234567",
          },
          delivered_by: {
            name: "Mensajero ABC",
            phone: "3209876543",
            relationship: "Empleado",
            notes: "Llegaron 2 paquetes extra que el cliente empacó a última hora.",
          },
          summary: {
            expected_packages: 3,
            received_packages: 3,
            rejected_packages: 0,
            missing_packages: 0,
            undeclared_packages: 2,
            has_differences: true,
          },
          items: [
            {
              id: 1,
              pickup_package_id: 101,
              package_index: 1,
              guide_number: "DHE-001",
              tracking_code: "DHE-001",
              public_token: "tok1",
              recipient_name: "Juan Perez",
              recipient_phone: "3001111111",
              delivery_address_line1: "Calle 140 # 11-20",
              delivery_address_complement: null,
              delivery_zone: "Usaquén",
              delivery_city: "Bogotá",
              result: "received",
              result_label: "Recibido",
              physical_condition: "intact",
              exception_code: null,
              exception_notes: null,
              evidence: [],
            },
            {
              id: 2,
              pickup_package_id: 102,
              package_index: 2,
              guide_number: "DHE-002",
              tracking_code: "DHE-002",
              public_token: "tok2",
              recipient_name: "Maria Gomez",
              recipient_phone: "3002222222",
              delivery_address_line1: "Carrera 15 # 85-30",
              delivery_address_complement: null,
              delivery_zone: "Chapinero",
              delivery_city: "Bogotá",
              result: "received",
              result_label: "Recibido",
              physical_condition: "intact",
              exception_code: null,
              exception_notes: null,
              evidence: [],
            },
            {
              id: 3,
              pickup_package_id: 103,
              package_index: 3,
              guide_number: "DHE-003",
              tracking_code: "DHE-003",
              public_token: "tok3",
              recipient_name: "Carlos Ruiz",
              recipient_phone: "3003333333",
              delivery_address_line1: "Calle 170 # 50-10",
              delivery_address_complement: null,
              delivery_zone: "Suba",
              delivery_city: "Bogotá",
              result: "received",
              result_label: "Recibido",
              physical_condition: "intact",
              exception_code: null,
              exception_notes: null,
              evidence: [],
            },
            {
              id: 4,
              pickup_package_id: null,
              package_index: null,
              guide_number: "DHE-UNDEC-001",
              tracking_code: "DHE-UNDEC-001",
              public_token: "tok4",
              recipient_name: "Pedro Morales Extra 1",
              recipient_phone: "3004444444",
              delivery_address_line1: "Calle 127 # 20-30",
              delivery_address_complement: "Apto 502",
              delivery_zone: "Usaquén",
              delivery_city: "Bogotá",
              result: "received",
              result_label: "Recibido sin declarar",
              physical_condition: "intact",
              exception_code: "SURPLUS_UNANNOUNCED_PACKAGE",
              exception_notes: "Paquete no anunciado en orden original",
              evidence: [{ id: 1, type: "image/jpeg", url: "https://example.com/photo1.jpg" }],
            },
            {
              id: 5,
              pickup_package_id: null,
              package_index: null,
              guide_number: "DHE-UNDEC-002",
              tracking_code: "DHE-UNDEC-002",
              public_token: "tok5",
              recipient_name: "Laura Castro Extra 2",
              recipient_phone: "3005555555",
              delivery_address_line1: "Carrera 7 # 116-50",
              delivery_address_complement: "Oficina 301",
              delivery_zone: "Usaquén",
              delivery_city: "Bogotá",
              result: "received",
              result_label: "Recibido sin declarar",
              physical_condition: "intact",
              exception_code: "SURPLUS_UNANNOUNCED_PACKAGE",
              exception_notes: "Excedente entregado físicamente",
              evidence: [{ id: 2, type: "image/jpeg", url: "https://example.com/photo2.jpg" }],
            },
          ],
        },
      }),
    });
  });

  return {
    getLastReconcilePayload: () => lastReconcilePayload,
    isReconciled: () => reconciled,
  };
}

test.describe("OT-J2 - Recepción de recogidas con paquetes excedentes no declarados", () => {
  test("flujo completo de recepción con 3 declarados y 2 excedentes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    const mocks = await setupHubReceptionMocks(page);

    // 1. Navegar a /recogidas/recepcion
    await page.goto("/recogidas/recepcion");

    // Verificar encabezado y lista de tareas
    await expect(page.getByRole("heading", { name: "Recepción programada en sede" })).toBeVisible();
    await expect(page.getByText("REC-2026-0042").first()).toBeVisible();

    // 2. Conciliar paquetes (abre el lote)
    await page.getByRole("button", { name: "Conciliar paquetes" }).first().click();
    await expect(page.getByText("Lote LOTE-HUB-088")).toBeVisible();

    // 3. Verificar contraste inicial: El cliente declaró 3 · aquí hay 3
    const contrastHeader = page.getByTestId("contrast-header");
    await expect(contrastHeader).toContainText("El cliente declaró 3 · aquí hay 3");

    // 4. Intentar agregar paquete no declarado sin foto (debe bloquearse y mostrar error)
    await page.getByRole("button", { name: /Agregar paquete no declarado/i }).click();
    await page.locator("#undec_recipient_name").fill("Pedro Morales Extra 1");
    await page.locator("#undec_recipient_phone").fill("3004444444");
    await page.locator("#undec_address").fill("Calle 127 # 20-30");
    await page.locator("#undec_complement").fill("Apto 502");
    await page.locator("#undec_zone").selectOption("Usaquén");
    
    // Disparar submit sin foto
    await page.getByRole("button", { name: "Guardar paquete no declarado" }).click();
    await expect(page.getByText(/La foto de evidencia es obligatoria/i)).toBeVisible();

    // EVIDENCIA 3: Intento sin foto bloqueado
    await page.screenshot({ path: path.join(artifactDir, "evidencia_otj2_3_bloqueo_sin_foto.png"), fullPage: true });

    // 5. Adjuntar foto válida y guardar primer paquete no declarado
    const fileBuffer = Buffer.from("fake-image-bytes");
    await page.locator("#undec_evidence_photo").setInputFiles({
      name: "foto_excedente_1.jpg",
      mimeType: "image/jpeg",
      buffer: fileBuffer,
    });

    // EVIDENCIA 2: Formulario de excedente con foto y causal
    await page.screenshot({ path: path.join(artifactDir, "evidencia_otj2_2_formulario_excedente.png"), fullPage: true });

    await page.getByRole("button", { name: "Guardar paquete no declarado" }).click();

    // Validar que se agregó y el contraste subió a 4
    await expect(page.getByText("Paquete no declarado agregado al mostrador.")).toBeVisible();
    await expect(contrastHeader).toContainText("El cliente declaró 3 · aquí hay 4");
    await expect(page.getByTestId("undeclared-item-0")).toContainText("Pedro Morales Extra 1");
    await expect(page.getByTestId("undeclared-item-0")).toContainText("Recibido sin declarar");

    // 6. Agregar segundo paquete no declarado
    await page.getByRole("button", { name: /Agregar paquete no declarado/i }).click();
    await page.locator("#undec_recipient_name").fill("Laura Castro Extra 2");
    await page.locator("#undec_recipient_phone").fill("3005555555");
    await page.locator("#undec_address").fill("Carrera 7 # 116-50");
    await page.locator("#undec_complement").fill("Oficina 301");
    await page.locator("#undec_zone").selectOption("Usaquén");
    await page.locator("#undec_evidence_photo").setInputFiles({
      name: "foto_excedente_2.jpg",
      mimeType: "image/jpeg",
      buffer: fileBuffer,
    });
    await page.getByRole("button", { name: "Guardar paquete no declarado" }).click();

    // Validar que el contraste ahora dice 3 declarados vs 5 en mostrador
    await expect(contrastHeader).toContainText("El cliente declaró 3 · aquí hay 5");
    await expect(page.getByTestId("undeclared-item-1")).toContainText("Laura Castro Extra 2");

    // EVIDENCIA 1: Recepción a 1280px con contraste 3 declarados vs 5 en mostrador y lista de excedentes
    await page.getByTestId("undeclared-item-1").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifactDir, "evidencia_otj2_1_contraste_recepcion_1280.png") });

    // 7. Cerrar recepción
    await page.getByRole("button", { name: "Cerrar recepción" }).click();

    // Validar mensaje y aparición del comprobante
    await expect(page.getByText("Recepción conciliada y custodia registrada.")).toBeVisible();
    expect(mocks.isReconciled()).toBeTruthy();
    expect(mocks.getLastReconcilePayload()).toContain("undeclared_packages[0][recipient_name]");
    expect(mocks.getLastReconcilePayload()).toContain("Pedro Morales Extra 1");
    expect(mocks.getLastReconcilePayload()).toContain("undeclared_packages[1][recipient_name]");
    expect(mocks.getLastReconcilePayload()).toContain("Laura Castro Extra 2");

    // 8. Verificar Comprobante desplegado con desglose completo
    await expect(page.getByRole("heading", { name: /Comprobante de recepción LOTE-HUB-088/i })).toBeVisible();
    await expect(page.getByText("Sin declarar", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Imprimir \/ Guardar PDF/i })).toBeVisible();
    await expect(page.getByText("Pedro Morales Extra 1")).toBeVisible();
    await expect(page.getByText("Laura Castro Extra 2")).toBeVisible();

    // EVIDENCIA 4: Petición enviada y confirmación de recepción conciliada
    await page.getByRole("heading", { name: /Comprobante de recepción LOTE-HUB-088/i }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifactDir, "evidencia_otj2_4_cierre_conciliacion.png") });

    // EVIDENCIA 5: Comprobante con desglose de esperados, recibidos, sin declarar y lista de ítems con foto
    await page.getByText("Detalle de paquetes procesados (5)").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifactDir, "evidencia_otj2_5_comprobante_resumen.png") });

    // 9. Verificar Responsive Móvil a 375px
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByRole("heading", { name: /Comprobante de recepción LOTE-HUB-088/i })).toBeVisible();
    await expect(page.getByText("Sin declarar", { exact: true })).toBeVisible();

    // EVIDENCIA 6: Vista móvil 375px adaptativa
    await page.getByRole("heading", { name: /Comprobante de recepción LOTE-HUB-088/i }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifactDir, "evidencia_otj2_6_vista_movil_375.png") });
  });
});
