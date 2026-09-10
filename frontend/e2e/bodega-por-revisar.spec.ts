import { expect, test } from "@playwright/test";
import { withSession } from "./support/mock-api";

const mockOfficialZones = [
  { id: 1, name: "Usaquén", city: "Bogotá", type: "urban", is_active: true },
  { id: 2, name: "Chapinero", city: "Bogotá", type: "urban", is_active: true },
  { id: 3, name: "Santa Fe", city: "Bogotá", type: "urban", is_active: true },
  { id: 4, name: "San Cristóbal", city: "Bogotá", type: "urban", is_active: true },
  { id: 5, name: "Usme", city: "Bogotá", type: "urban", is_active: true },
  { id: 6, name: "Tunjuelito", city: "Bogotá", type: "urban", is_active: true },
  { id: 7, name: "Bosa", city: "Bogotá", type: "urban", is_active: true },
  { id: 8, name: "Kennedy", city: "Bogotá", type: "urban", is_active: true },
  { id: 9, name: "Fontibón", city: "Bogotá", type: "urban", is_active: true },
  { id: 10, name: "Engativá", city: "Bogotá", type: "urban", is_active: true },
  { id: 11, name: "Suba", city: "Bogotá", type: "urban", is_active: true },
  { id: 12, name: "Barrios Unidos", city: "Bogotá", type: "urban", is_active: true },
  { id: 13, name: "Teusaquillo", city: "Bogotá", type: "urban", is_active: true },
  { id: 14, name: "Los Mártires", city: "Bogotá", type: "urban", is_active: true },
  { id: 15, name: "Antonio Nariño", city: "Bogotá", type: "urban", is_active: true },
  { id: 16, name: "Puente Aranda", city: "Bogotá", type: "urban", is_active: true },
  { id: 17, name: "La Candelaria", city: "Bogotá", type: "urban", is_active: true },
  { id: 18, name: "Rafael Uribe Uribe", city: "Bogotá", type: "urban", is_active: true },
  { id: 19, name: "Ciudad Bolívar", city: "Bogotá", type: "urban", is_active: true },
  { id: 20, name: "Chía", city: "Chía", type: "suburban", is_active: true },
  { id: 21, name: "Soacha", city: "Soacha", type: "suburban", is_active: true },
  { id: 22, name: "Cota", city: "Cota", type: "suburban", is_active: true },
  { id: 23, name: "Cajicá", city: "Cajicá", type: "suburban", is_active: true },
  { id: 24, name: "Funza", city: "Funza", type: "suburban", is_active: true },
  { id: 25, name: "Mosquera", city: "Mosquera", type: "suburban", is_active: true },
  { id: 26, name: "Madrid", city: "Madrid", type: "suburban", is_active: true },
  { id: 27, name: "Facatativá", city: "Facatativá", type: "extended", is_active: true },
];

const mockReviewShipments = [
  {
    id: 501,
    tracking_code: "DHE-REV-001",
    display_code: "#DHE-REV-001",
    status: "in_warehouse",
    recipient_name: "Gonzalo Restrepo",
    recipient_phone: "3101112233",
    recipient_address: "Cl 2",
    recipient_zone: null,
    recipient_city: "Bogotá",
    recipient_lat: null,
    recipient_lng: null,
    size_code: "small",
    size_label: "Pequeño",
    is_fragile: false,
    geocoding_status: "blocked",
    geocoding_reason: "address_too_short",
    geocoding_reason_label: "Dirección demasiado corta",
    created_at: "2026-09-08T08:00:00Z",
  },
  {
    id: 502,
    tracking_code: "DHE-REV-002",
    display_code: "#DHE-REV-002",
    status: "in_warehouse",
    recipient_name: "Camila Veloza",
    recipient_phone: "3154445566",
    recipient_address: "Calle 19 # 10 22",
    recipient_zone: null,
    recipient_city: "Bogotá",
    recipient_lat: null,
    recipient_lng: null,
    size_code: "medium",
    size_label: "Mediano",
    is_fragile: true,
    geocoding_status: "pending",
    geocoding_reason: "missing_location_context",
    geocoding_reason_label: "Sin contexto de zona/ciudad",
    created_at: "2026-09-08T10:30:00Z",
  },
  {
    id: 503,
    tracking_code: "DHE-REV-003",
    display_code: "#DHE-REV-003",
    status: "in_warehouse",
    recipient_name: "Esteban Morales",
    recipient_phone: "3187778899",
    recipient_address: "Km 5 Vía Suba Cota Parcela 12",
    recipient_zone: null,
    recipient_city: "Bogotá",
    recipient_lat: null,
    recipient_lng: null,
    size_code: "large",
    size_label: "Grande",
    is_fragile: false,
    geocoding_status: "pending",
    geocoding_reason: "provider_no_match",
    geocoding_reason_label: "Proveedor sin coincidencia exacta",
    created_at: "2026-09-09T07:15:00Z",
  },
];

async function setupPorRevisarMocks(page: import("@playwright/test").Page) {
  let currentShipments = [...mockReviewShipments];

  await page.route("**/api/zones**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockOfficialZones),
    });
  });

  await page.route("**/api/shipments**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path.endsWith("/address-preview")) {
      const postData = route.request().postDataJSON();
      const address = (postData?.recipient_address || "").toLowerCase();

      if (address.includes("calle 19") || address.includes("10 22") || address.includes("centro")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            address: "Calle 19 # 10-22, Santa Fe, Bogotá",
            city: "Bogota",
            zone: "Santa Fe",
            recipient_lat: 4.6045,
            recipient_lng: -74.0725,
            has_coordinates: true,
            geocoding_pending: false,
            candidates: [
              {
                label: "Calle 19 # 10-22, Santa Fe, Bogotá, Colombia",
                formatted_address: "Calle 19 # 10-22, Santa Fe, Bogotá, Colombia",
                lat: 4.6045,
                lng: -74.0725,
                zone: "Santa Fe",
                confidence: "exact",
                provider: "nominatim",
              },
              {
                label: "Carrera 10 # 19-22, Chapinero, Bogotá, Colombia",
                formatted_address: "Carrera 10 # 19-22, Chapinero, Bogotá, Colombia",
                lat: 4.6512,
                lng: -74.0621,
                zone: "Chapinero",
                confidence: "approximate",
                provider: "nominatim",
              },
            ],
            message: "Dirección previsualizada correctamente.",
          }),
        });
        return;
      }

      if (address.includes("ambiguo") || address.includes("sin zona")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            address: "Avenida Principal",
            city: "Bogota",
            zone: null,
            recipient_lat: 4.62,
            recipient_lng: -74.12,
            has_coordinates: false,
            geocoding_pending: true,
            candidates: [
              {
                label: "Avenida Principal, Kennedy, Bogotá",
                formatted_address: "Avenida Principal, Kennedy, Bogotá",
                lat: 4.62,
                lng: -74.12,
                zone: "Kennedy",
                confidence: "ambiguous",
                provider: "geocoder",
              },
              {
                label: "Avenida Principal, Fontibón, Bogotá",
                formatted_address: "Avenida Principal, Fontibón, Bogotá",
                lat: 4.67,
                lng: -74.14,
                zone: "Fontibón",
                confidence: "ambiguous",
                provider: "geocoder",
              },
            ],
            message: "La dirección es ambigua y requiere seleccionar la localidad.",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          address: postData?.recipient_address || "Dirección",
          city: "Bogota",
          zone: "Suba",
          recipient_lat: 4.743,
          recipient_lng: -74.089,
          has_coordinates: true,
          geocoding_pending: false,
          candidates: [
            {
              label: `${postData?.recipient_address || "Dirección"}, Suba, Bogotá`,
              formatted_address: `${postData?.recipient_address || "Dirección"}, Suba, Bogotá`,
              lat: 4.743,
              lng: -74.089,
              zone: "Suba",
              confidence: "exact",
              provider: "geocoder",
            },
          ],
          message: "Dirección validada.",
        }),
      });
      return;
    }

    if (path.endsWith("/geo-summary")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          summary: {
            total: 88,
            with_coordinates: 85,
            without_coordinates: currentShipments.length,
            pending_geocoding: currentShipments.length,
            needs_location_review: currentShipments.length,
            coverage_percent: 96.5,
          },
          recent_missing: currentShipments,
        }),
      });
      return;
    }

    if (method === "PUT" || method === "POST") {
      const idMatch = path.match(/\/shipments\/(\d+)/);
      if (idMatch) {
        const id = parseInt(idMatch[1], 10);
        currentShipments = currentShipments.filter((s) => s.id !== id);
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Envío actualizado con éxito.",
          shipment: { id: 501, status: "in_warehouse" },
        }),
      });
      return;
    }

    // GET /shipments
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: currentShipments,
        current_page: 1,
        last_page: 1,
        per_page: 100,
        total: currentShipments.length,
      }),
    });
  });
}

test.describe("Bandeja 'Ubicación por revisar' (OT-B2)", () => {
  test("Desktop 1280px: visualiza bandeja por revisar con motivos legibles y orden cronológico", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await setupPorRevisarMocks(page);

    await page.goto("/bodega/por-revisar");

    // Título y botón volver
    await expect(page.getByRole("heading", { name: "Ubicación por revisar" })).toBeVisible();
    await expect(page.getByRole("link", { name: "← Volver a Bodega" })).toBeVisible();

    // KPIs superiores
    await expect(page.getByText("Total por revisar")).toBeVisible();
    await expect(page.getByText("Sin coordenadas", { exact: true })).toBeVisible();
    await expect(page.getByText("Sin zona asignada", { exact: true })).toBeVisible();
    await expect(page.getByText("Dirección bloqueada", { exact: true })).toBeVisible();

    // Tabla con envíos y motivos legibles
    const table = page.locator("table");
    await expect(table.getByText("#DHE-REV-001")).toBeVisible();
    await expect(table.getByText("Gonzalo Restrepo")).toBeVisible();
    await expect(table.getByText("Dirección demasiado corta")).toBeVisible();

    await expect(table.getByText("#DHE-REV-002")).toBeVisible();
    await expect(table.getByText("Camila Veloza")).toBeVisible();
    await expect(table.getByText("Sin contexto de zona/ciudad")).toBeVisible();

    await expect(table.getByText("#DHE-REV-003")).toBeVisible();
    await expect(table.getByText("Esteban Morales")).toBeVisible();
    await expect(table.getByText("Proveedor sin coincidencia exacta")).toBeVisible();

    // Validar orden: el más viejo (#DHE-REV-001 del 8 sep 08:00) aparece primero en la tabla
    const rows = table.locator("tbody tr");
    await expect(rows.first()).toContainText("#DHE-REV-001");
  });

  test("Flujo completo de corrección en el sitio con catálogo dinámico de zonas, candidatos y guardado", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await setupPorRevisarMocks(page);

    await page.goto("/bodega/por-revisar");

    // 1. Abrir modal de corrección para #DHE-REV-002 (Camila Veloza - Calle 19 # 10 22)
    const row2 = page.locator("tr", { hasText: "#DHE-REV-002" });
    await row2.getByRole("button", { name: "Corregir" }).click();

    // 2. Modal abierto
    await expect(page.getByRole("dialog", { name: /Corregir ubicación #DHE-REV-002/i })).toBeVisible();
    await expect(page.getByText("Destinatario: Camila Veloza")).toBeVisible();

    // Validar que el desplegable contiene zonas del catálogo oficial (ej. Santa Fe, Chía)
    const zoneSelect = page.getByRole("combobox", { name: "Zona o localidad" });
    await expect(zoneSelect).toBeVisible();
    await expect(zoneSelect.getByRole("option", { name: "Santa Fe" })).toBeAttached();
    await expect(zoneSelect.getByRole("option", { name: "Chía (Chía)" })).toBeAttached();

    // 3. Editar dirección
    const addressInput = page.getByLabel("Dirección de entrega");
    await addressInput.fill("Calle 19 # 10 22 centro");

    // 4. Clic en "Verificar dirección"
    const verifyBtn = page.getByRole("button", { name: /Verificar dirección/i });
    await verifyBtn.click();

    // 5. Validar que aparecen candidatos con su nivel de confianza
    await expect(page.getByText("Candidatos encontrados (2)")).toBeVisible();
    await expect(page.getByText("Exacto")).toBeVisible();
    await expect(page.getByText("Calle 19 # 10-22, Santa Fe, Bogotá, Colombia")).toBeVisible();

    // 6. Seleccionar candidato
    await page.getByRole("button", { name: "Usar candidato" }).first().click();
    await expect(page.getByText(/Coordenadas listas/i)).toBeVisible();

    // 7. Guardar corrección
    const saveBtn = page.getByRole("button", { name: "Guardar corrección" });
    await saveBtn.click();

    // 8. Modal se cierra y el envío desaparece de la bandeja
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByText("#DHE-REV-002")).not.toBeVisible();
  });

  test("Degradación elegante: si falla /api/zones, el campo degrada a texto libre sin bloquear la corrección", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await setupPorRevisarMocks(page);

    // Forzar fallo de /api/zones
    await page.route("**/api/zones**", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "DB error" }) });
    });

    await page.goto("/bodega/por-revisar");

    // Abrir modal de #DHE-REV-001
    const row1 = page.locator("tr", { hasText: "#DHE-REV-001" });
    await row1.getByRole("button", { name: "Corregir" }).click();

    // Campo de zona ahora es un input de texto libre (no combobox)
    const zoneInput = page.getByPlaceholder("Escribe la localidad...");
    await expect(zoneInput).toBeVisible();
    await zoneInput.fill("Suba");

    // Guardar sigue funcionando
    const addressInput = page.getByLabel("Dirección de entrega");
    await addressInput.fill("Calle 145 # 100-20");
    await page.getByRole("button", { name: "Guardar corrección" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("Regla de honestidad: candidato ambiguo no se pinta de verde/seguro", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);
    await setupPorRevisarMocks(page);

    await page.goto("/bodega/por-revisar");

    // Abrir modal de #DHE-REV-001
    const row1 = page.locator("tr", { hasText: "#DHE-REV-001" });
    await row1.getByRole("button", { name: "Corregir" }).click();

    // Escribir dirección ambigua
    const addressInput = page.getByLabel("Dirección de entrega");
    await addressInput.fill("Avenida Principal sin zona");

    // Verificar
    await page.getByRole("button", { name: /Verificar dirección/i }).click();

    // Validar que se muestra badge ambiguo / advertencia y NO exacto
    await expect(page.getByText("Ambiguo / Múltiples zonas").first()).toBeVisible();
    await expect(page.getByText("Exacto")).not.toBeVisible();
  });

  test("Mobile 375px: tarjetas responsive y modal a pantalla completa sin desbordes", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await withSession(page);
    await setupPorRevisarMocks(page);

    await page.goto("/bodega/por-revisar");

    // Header visible
    await expect(page.getByRole("heading", { name: "Ubicación por revisar" })).toBeVisible();

    // Tarjetas móviles visibles en sección móvil
    const mobileCards = page.locator(".lg\\:hidden article");
    await expect(mobileCards.first()).toBeVisible();
    await expect(mobileCards.first()).toContainText("#DHE-REV-001");
    await expect(mobileCards.first()).toContainText("Dirección demasiado corta");

    // Abrir corrección en móvil
    await mobileCards.first().getByRole("button", { name: "Corregir ubicación" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Botones accesibles
    await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar corrección" })).toBeVisible();
  });

  test("Navegación: banner de Bodega enlaza a /bodega/por-revisar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withSession(page);

    // Mock de bodega con grupo Sin zona
    await page.route("**/api/routes/dispatch-board**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          date: "2026-09-09",
          summary: { total: 10, by_size: {}, by_zone: { "Sin zona": 3 }, fragile: 1, missing_coordinates: 3, total_weight_kg: 10 },
          groups: [
            {
              zone: null,
              city: null,
              total: 3,
              by_size: { small: 1, medium: 2, large: 0, unspecified: 0 },
              fragile_count: 0,
              items: [],
            },
          ],
          shipments: [],
        }),
      });
    });

    await page.goto("/bodega");
    await expect(page.getByText("Trabajo pendiente en operación")).toBeVisible();

    // Clic en "Ver sin zona"
    const bannerLink = page.getByRole("link", { name: /Ver sin zona/i });
    await expect(bannerLink).toBeVisible();
    await bannerLink.click();

    // Redirige a /bodega/por-revisar
    await expect(page).toHaveURL(/\/bodega\/por-revisar/);
    await expect(page.getByRole("heading", { name: "Ubicación por revisar" })).toBeVisible();
  });
});
