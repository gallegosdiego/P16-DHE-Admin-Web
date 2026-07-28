# Lector provisional WhatsApp Web de solo lectura

**Fecha:** 27 de julio de 2026  
**Estado:** primera base tecnica creada, pendiente de vinculacion y piloto controlado  
**Servicio:** `P18-DHE-WhatsApp-Reader`  
**Ruta local:** `D:\DHE dev\P18-DHE-WhatsApp-Reader`

La base ejecutable ya esta creada en el repositorio separado. Incluye panel
local, allowlist obligatoria, sesion QR persistente, cache local de WhatsApp
Web, captura idempotente, cifrado AES-256-GCM, multimedia privada, cola
serializada y procesamiento local con Ollama/Whisper.

## Decision

Mientras se resuelve la restriccion de Meta para Cloud API, Danhei puede operar
un lector local separado que vincule un numero dedicado mediante QR de WhatsApp
Web y capture exclusivamente chats autorizados.

Esta decision no reactiva la integracion oficial de P16. Las banderas oficiales
continuan apagadas y P16 conserva su independencia operativa.

## Alcance permitido

- Leer mensajes entrantes de una allowlist exacta de chats.
- Capturar mensajes nuevos posteriores a la vinculacion; no importar historial
  anterior automaticamente.
- Capturar texto, imagenes, audios y metadatos minimos.
- Guardar multimedia cifrada en una base SQLite local.
- Procesar texto e imagen con Ollama local.
- Transcribir audio con Whisper local cuando este disponible.
- Entregar una extraccion como `PENDING_REVIEW`.

## Fuera de alcance

- Responder o enviar mensajes.
- Crear recogidas aceptadas automaticamente.
- Leer chats fuera de la allowlist.
- Enviar contenido a Gemini, OpenAI u otro proveedor cloud.
- Conectarse directamente a MySQL o a la base productiva de P16.
- Usar el lector para eludir una suspension o restriccion de Meta.

## Evidencia de la primera iteracion

- `npm test`: 3 pruebas aprobadas para deduplicacion, cifrado multimedia y
  extraccion local sin fallback cloud.
- `npm audit --offline --omit=dev --omit=optional`: 0 vulnerabilidades con el
  arbol de instalacion deliberadamente utilizado por `LocalAuth`.
- El QR real aun requiere una prueba en un equipo con acceso a
  `web.whatsapp.com`; el intento realizado en este entorno termino por
  timeout de red antes de escanear una cuenta.

## Controles de privacidad

El piloto requiere un numero dedicado, aviso a los participantes, finalidad
documentada, politica de tratamiento, periodo de retencion, control de acceso y
procedimiento de supresion. Textos, telefonos, imagenes y audios se consideran
datos que deben manejarse bajo las reglas aplicables; lectura solamente no
equivale a ausencia de tratamiento.

## Frontera con P16

El resultado provisional permanece local. Solo despues de pruebas de seguridad
y autorizacion de operaciones se podra crear un contrato HTTPS firmado para
enviar a P16 campos normalizados, hash de multimedia, confianza y estado de
revision. Nunca se enviara el archivo completo por defecto y nunca se habilitara
una escritura hacia WhatsApp desde este servicio.

## Criterio para retirar la provisional

Cuando Meta habilite Cloud API, se debe comparar la cobertura de mensajes,
multimedia, autorizacion y trazabilidad contra la V1 oficial. El lector QR se
desvinculara, se ejecutara la retencion final y se conservaran solo los registros
que tengan una finalidad operativa o legal documentada.
