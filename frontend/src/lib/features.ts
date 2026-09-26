export const whatsappAdminUiEnabled =
  process.env.NEXT_PUBLIC_WHATSAPP_ADMIN_UI_ENABLED === "true";

/**
 * Zonas / localidades en la interfaz. Apagado por defecto: la operación hoy
 * no usa zonas y ver "Sin zona" por todas partes confunde. El código y los
 * datos siguen intactos; basta con NEXT_PUBLIC_ZONES_UI_ENABLED=true para
 * volver a mostrarlas.
 */
export const zonesUiEnabled =
  process.env.NEXT_PUBLIC_ZONES_UI_ENABLED === "true";
