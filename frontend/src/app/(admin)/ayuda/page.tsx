"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { usePageTitle } from "@/lib/page-title";
import { Badge, Button, Card } from "@/components/ui";

type HelpTab = "vias" | "mostrador" | "bandeja" | "preguntas";
type NoticeTone = "info" | "success" | "warning";

const TABS: Array<{ key: HelpTab; label: string }> = [
  { key: "vias", label: "Las tres vías" },
  { key: "mostrador", label: "Mostrador paso a paso" },
  { key: "bandeja", label: "Recogidas y bandeja" },
  { key: "preguntas", label: "Preguntas frecuentes" },
];

const helpLinkClass = "inline-flex min-h-11 items-center justify-center rounded-button bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const helpTextLinkClass = "font-semibold text-teal underline underline-offset-2 hover:text-brand";

const noticeClasses: Record<NoticeTone, string> = {
  info: "border-info/25 bg-info/10 text-teal",
  success: "border-success/25 bg-success/10 text-ink",
  warning: "border-warning/35 bg-warning/15 text-ink",
};

function HelpNotice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  return (
    <div role="status" className={`rounded-card border p-4 text-sm leading-6 ${noticeClasses[tone]}`}>
      {children}
    </div>
  );
}

// Guía viva del ingreso de paquetes. Los nombres de botones y pantallas son
// los reales del panel: si un flujo cambia, esta página cambia en el mismo PR.
export default function AyudaPage() {
  usePageTitle("Ayuda");
  const [tab, setTab] = useState<HelpTab>("vias");

  return (
    <div className="min-w-0 animate-fade-in space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Guía de operación</p>
        <h1 className="mt-1 max-w-3xl font-display text-2xl font-bold text-ink md:text-3xl">¿Cómo funciona el ingreso de paquetes?</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
          Todo paquete entra por la misma pantalla. Elige la vía y el formulario muestra solo lo que esa vía necesita — lo opcional queda plegado con sus valores por defecto.
        </p>
      </header>

      <div className="flex min-w-0 flex-wrap gap-2" role="tablist" aria-label="Secciones de la guía">
        {TABS.map((item) => (
          <Button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            variant={tab === item.key ? "primary" : "secondary"}
            size="md"
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {tab === "vias" ? (
        <div className="space-y-4">
          <Card className="border-brand/35">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold text-ink">Ya está en mostrador — «Recibir ahora»</h2>
              <Badge tone="brand">LA MÁS COMÚN</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink-secondary">
              El cliente trae el paquete a la sede. La guía nace <strong>al instante</strong>, con recepción y custodia incluidas — lista para imprimir. El caso típico se resuelve con <strong>2 selecciones y 4 campos</strong>. Botón final: <strong>«Registrar y recibir»</strong>.
            </p>
            <Link href="/recogidas/nueva" className={`mt-4 ${helpLinkClass}`}>
              Abrir Nuevo ingreso
            </Link>
          </Card>

          <Card>
            <h2 className="font-display text-lg font-semibold text-ink">«Recoger donde el cliente»</h2>
            <p className="mt-2 text-sm leading-6 text-ink-secondary">
              El cliente pide que pasemos por el paquete. Se registra la <strong>dirección de recogida</strong> y los datos de cada paquete. La solicitud cae en la <strong>bandeja de Ingresos</strong> para revisión, materialización de guías y asignación. Botón final: <strong>«Crear ingreso»</strong>.
            </p>
          </Card>

          <Card>
            <h2 className="font-display text-lg font-semibold text-ink">«El cliente lleva a sede»</h2>
            <p className="mt-2 text-sm leading-6 text-ink-secondary">
              Se registra la <strong>sede</strong> y la <strong>fecha estimada de entrega</strong>; también cae en la bandeja. Botón final: <strong>«Crear ingreso»</strong>. Cuando el paquete llegue físicamente, se recibe y concilia en{" "}
              <Link href="/recogidas/recepcion" className={helpTextLinkClass}>Recepción</Link>.
            </p>
          </Card>

          <HelpNotice tone="info">
            <strong>La regla que no cambia:</strong> ningún campo desapareció — lo opcional está plegado con sus valores por defecto a la vista. Si un caso lo necesita, se despliega; si no, no se toca.
          </HelpNotice>
        </div>
      ) : null}

      {tab === "mostrador" ? (
        <div className="space-y-4">
          <HelpStep n={1} title="Elige el cliente (contacto de cobro)">
            Al elegirlo aparece <strong>«Se cobra a: …»</strong> y el contacto se autollena. <strong>¿No existe todavía?</strong> Déjalo vacío: la guía sigue su curso y queda en <em>«Pendientes por identificar cliente»</em> para vincularla después — nunca frenes un mostrador por esto.
          </HelpStep>
          <HelpStep n={2} title="Confirma la sede">
            Viene autoseleccionada. Solo cámbiala si estás recibiendo en otra sede.
          </HelpStep>
          <HelpStep n={3} title="Registra cada paquete — 4 datos">
            <span className="mb-3 mt-1 flex flex-wrap gap-2">
              {["Destinatario", "Teléfono", "Dirección de entrega", "Valor COD"].map((field) => (
                <Badge key={field} tone="teal">{field}</Badge>
              ))}
            </span>
            <strong>La dirección manda:</strong> escríbela completa y con la <strong>ciudad correcta</strong> (en «Más detalles» si no es Bogotá) — de ella depende el punto en el mapa del piloto. «Más detalles» también guarda complemento, tamaño y frágil. <strong>«+ Agregar paquete»</strong> para varios del mismo cliente.
          </HelpStep>
          <HelpStep n={4} title="Solo si aplica: los bloques plegados">
            <strong>«Marcar rechazo»</strong> abre motivo + <strong>foto obligatoria</strong> (sin foto no hay rechazo). <strong>«Cobro del servicio»</strong> y <strong>«¿Entrega o recibe otra persona?»</strong> ya traen valores por defecto — despliégalos solo cuando el caso lo pida.
          </HelpStep>
          <HelpStep n={5} title="«Registrar y recibir»">
            Sale el aviso con el código del ingreso y las guías creadas, y el sistema te lleva a{" "}
            <Link href="/pedidos" className={helpTextLinkClass}>Envíos y guías</Link>. Ahí imprimes la guía y la pegas al paquete. Recepción y custodia ya quedaron registradas.
          </HelpStep>
          <HelpNotice tone="warning">
            <strong>Verificación de 3 segundos antes de registrar:</strong> ¿cliente elegido (o vacío a propósito)? · ¿dirección con ciudad correcta? · ¿COD con el valor que dijo el cliente?
          </HelpNotice>
        </div>
      ) : null}

      {tab === "bandeja" ? (
        <div className="space-y-4">
          <Card>
            <p className="text-sm leading-6 text-ink-secondary">
              En las vías de recogida y entrega planificada el paquete <strong>aún no está en nuestras manos</strong>: por eso crean una solicitud, no una guía inmediata. La solicitud sigue esta línea temporal — la misma que ves en el detalle de cada solicitud de{" "}
              <Link href="/recogidas" className={helpTextLinkClass}>la bandeja de Ingresos</Link>, con el paso actual resaltado y la siguiente acción enlazada.
            </p>
          </Card>
          <HelpStep n={1} title="Solicitud creada" done>
            Queda en «Pendiente de revisión».
          </HelpStep>
          <HelpStep n={2} title="Revisar y aceptar">
            Pestaña <strong>Revisión</strong> del detalle: se confirman los datos y se acepta.
          </HelpStep>
          <HelpStep n={3} title="Materializar las guías">
            Pestaña <strong>Materializar</strong>: cada paquete recibe su guía. <strong>Sin este paso, la asignación del piloto se rechaza.</strong>
          </HelpStep>
          <HelpStep n={4} title="Asignar al responsable (solo vía recogida)">
            En <Link href="/recogidas/tareas" className={helpTextLinkClass}>Asignar tareas</Link>: piloto, empleado Danhei o recolector autorizado. El piloto la ve al instante en su app. En la vía «el cliente lleva a sede» no hay nada que recoger: este paso no aplica.
          </HelpStep>
          <HelpStep n={5} title="Recibir en sede">
            El piloto trae lo recogido — o el cliente llega con sus paquetes — y todo se concilia en{" "}
            <Link href="/recogidas/recepcion" className={helpTextLinkClass}>Recepción</Link> — faltantes o novedades exigen causal y foto.
          </HelpStep>
        </div>
      ) : null}

      {tab === "preguntas" ? (
        <div className="space-y-4">
          <HelpFaq q="¿El cliente no está creado en el sistema?">
            Registra el ingreso <strong>sin cliente</strong>. La guía queda en «Pendientes por identificar cliente» y se vincula después sin perder nada — ni remitente, ni historial, ni dinero. Nunca hagas esperar al cliente por esto.
          </HelpFaq>
          <HelpFaq q="¿El paquete llega dañado o el cliente rechaza uno?">
            Usa <strong>«Marcar rechazo»</strong> en ese paquete: motivo + <strong>foto obligatoria</strong>. Sin foto el sistema no lo acepta — y eso es a propósito: la evidencia protege a todos.
          </HelpFaq>
          <HelpFaq q="¿Por qué es tan importante la dirección?">
            El sistema la geocodifica para ubicar el punto en el mapa del piloto, <strong>siempre dentro de la ciudad de la guía</strong>. Dirección incompleta o ciudad equivocada = punto impreciso o sin punto.
          </HelpFaq>
          <HelpFaq q="¿Cuándo le entrego los paquetes al piloto?">
            Cuando venga por ellos: en <Link href="/pedidos" className={helpTextLinkClass}>Envíos y guías</Link>, asigna el piloto y pulsa <strong>«Entregar»</strong> — el piloto escanea la guía, o tú confirmas con una nota obligatoria. Desde ese momento la custodia es suya, con o sin ruta armada. (Esto es para guías ya en bodega; asignar una <em>recogida</em> se hace en Asignar tareas.)
          </HelpFaq>
          <HelpFaq q="¿El piloto dice que no puede iniciar su ruta?">
            Casi siempre es custodia pendiente: le faltan paquetes por escanear en <strong>«Recibir despacho»</strong> (su app se lo muestra en Inicio), o a la solicitud le faltó <strong>materializar</strong> las guías. La línea temporal del detalle te dice exactamente en qué paso está.
          </HelpFaq>
          <HelpFaq q="¿El cliente quiere saber dónde va su paquete?">
            No necesita llamarnos: en <strong>danheiexpress.com</strong> rastrea con la guía y los <strong>últimos 4 dígitos del teléfono del destinatario</strong>. Dale ese dato al despachar.
          </HelpFaq>
          <HelpNotice tone="info">
            <strong>¿Un caso que no está aquí?</strong> No improvises un paso por fuera del sistema — pregunta. Cada excepción que se registra bien hoy es un problema que no existe mañana.
          </HelpNotice>
        </div>
      ) : null}
    </div>
  );
}

function HelpStep({ n, title, done = false, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <Card className="flex gap-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-success text-white" : "bg-brand text-white"}`}>
        {done ? "✓" : n}
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-ink-secondary">{children}</p>
      </div>
    </Card>
  );
}

function HelpFaq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="font-display text-base font-semibold text-brand">{q}</h2>
      <p className="mt-1 text-sm leading-6 text-ink-secondary">{children}</p>
    </Card>
  );
}
