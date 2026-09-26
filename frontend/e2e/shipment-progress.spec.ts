import { expect, test } from "@playwright/test";
import { buildShipmentProgress, formatProgressDate, progressStepIndexForStatus } from "../src/lib/shipment-progress";

/**
 * Pruebas de la lógica pura de la barra 1-2-3 (sin navegador).
 * Misma tabla que el portal del cliente (P14 tests/shipment-progress.test.mjs).
 */

const states = (view: ReturnType<typeof buildShipmentProgress>) => view.steps.map((step) => step.state);

test.describe("Barra de estados 1-2-3: mapeo", () => {
  test("cada estado de la API cae en su paso", () => {
    const expected: Record<string, number> = {
      registered: 0,
      confirmed: 0,
      pickup_scheduled: 0,
      picked_up: 0,
      in_warehouse: 1,
      handed_to_driver: 2,
      assigned_to_route: 2,
      in_transit: 3,
      delivered: 4,
    };
    for (const [status, index] of Object.entries(expected)) {
      expect(progressStepIndexForStatus(status), status).toBe(index);
    }
    expect(progressStepIndexForStatus("issue")).toBe(-1);
    expect(buildShipmentProgress({ status: "in_transit" }).steps.map((step) => step.label)).toEqual([
      "Recibido",
      "En bodega",
      "Con el piloto",
      "En camino",
      "Entregado",
    ]);
  });

  test("avance normal: pasos anteriores completos, el actual marcado", () => {
    const view = buildShipmentProgress({
      status: "handed_to_driver",
      events: [
        { status: "registered", at: "2026-09-26T08:00:00-05:00" },
        { status: "in_warehouse", at: "2026-09-26T09:00:00-05:00" },
        { status: "handed_to_driver", at: "2026-09-26T10:00:00-05:00" },
      ],
    });
    expect(view.known).toBe(true);
    expect(view.outcome).toBe("normal");
    expect(states(view)).toEqual(["done", "done", "current", "upcoming", "upcoming"]);
    expect(view.steps.map((step) => step.current)).toEqual([false, false, true, false, false]);
    expect(view.steps[0].at).toBe("2026-09-26T08:00:00-05:00");
    expect(view.steps[3].at).toBeNull();
    expect(view.notice).toBeNull();
  });

  test("entregado: los cinco pasos completos y el último es el actual", () => {
    const view = buildShipmentProgress({ status: "delivered" });
    expect(view.outcome).toBe("delivered");
    expect(states(view)).toEqual(["done", "done", "done", "done", "done"]);
    expect(view.steps[4].current).toBe(true);
  });

  test("novedad: se marca donde iba según los eventos, con la nota", () => {
    const view = buildShipmentProgress({
      status: "issue",
      issueNote: "Dirección errada",
      events: [
        { status: "registered", at: "2026-09-26T08:00:00-05:00" },
        { status: "in_transit", at: "2026-09-26T11:00:00-05:00" },
        { status: "issue", at: "2026-09-26T12:00:00-05:00", note: "Nadie en casa" },
      ],
    });
    expect(view.outcome).toBe("issue");
    expect(states(view)).toEqual(["done", "done", "done", "issue", "upcoming"]);
    expect(view.steps[3].current).toBe(true);
    expect(view.notice).toEqual({ tone: "warning", text: "Novedad: Dirección errada" });
  });

  test("novedad sin eventos: queda en «Con el piloto»; la nota sale del evento si falta", () => {
    expect(states(buildShipmentProgress({ status: "issue" }))).toEqual(["done", "done", "issue", "upcoming", "upcoming"]);
    expect(buildShipmentProgress({ status: "issue" }).notice?.text).toBe("Novedad");
    const fromEvent = buildShipmentProgress({
      status: "issue",
      events: [{ status: "issue", at: "2026-09-26T12:00:00-05:00", note: "Nadie en casa" }],
    });
    expect(fromEvent.notice?.text).toBe("Novedad: Nadie en casa");
  });

  test("devuelto y cancelado: la barra se corta donde iba, sin paso activo", () => {
    const events = [
      { status: "registered", at: "2026-09-26T08:00:00-05:00" },
      { status: "in_warehouse", at: "2026-09-26T09:00:00-05:00" },
      { status: "returned", at: "2026-09-26T10:00:00-05:00" },
    ];
    const returned = buildShipmentProgress({ status: "returned", events });
    expect(states(returned)).toEqual(["done", "done", "upcoming", "upcoming", "upcoming"]);
    expect(returned.steps.some((step) => step.current)).toBe(false);
    expect(returned.notice).toEqual({ tone: "neutral", text: "Devuelto al remitente" });

    const cancelled = buildShipmentProgress({ status: "cancelled", events: [{ status: "registered" }, { status: "cancelled" }] });
    expect(states(cancelled)).toEqual(["done", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(cancelled.notice).toEqual({ tone: "neutral", text: "Cancelado" });
  });

  test("los eventos se ordenan por fecha aunque lleguen desordenados", () => {
    const view = buildShipmentProgress({
      status: "cancelled",
      events: [
        { status: "in_warehouse", at: "2026-09-26T09:00:00-05:00" },
        { status: "cancelled", at: "2026-09-26T10:00:00-05:00" },
        { status: "registered", at: "2026-09-26T08:00:00-05:00" },
      ],
    });
    expect(view.reachedIndex).toBe(1);
  });

  test("estado desconocido: no se pinta la barra", () => {
    expect(buildShipmentProgress({ status: "otra_cosa" }).known).toBe(false);
    expect(buildShipmentProgress({ status: null }).known).toBe(false);
  });

  test("fecha en hora de Bogotá", () => {
    const date = formatProgressDate("2026-09-26T20:15:00Z");
    expect(date?.day).toMatch(/^26 sept?\.?$/);
    expect(date?.time).toMatch(/^3:15\s?p\.\s?m\.$/);
    expect(formatProgressDate(null)).toBeNull();
    expect(formatProgressDate("no-es-fecha")).toBeNull();
  });
});
