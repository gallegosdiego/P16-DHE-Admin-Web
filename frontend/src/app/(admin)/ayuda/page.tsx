"use client";

import Link from "next/link";
import { useState } from "react";
import { usePageTitle } from "@/lib/page-title";
import { InlineNotice, OperationsCard, OperationsHeader } from "@/components/operations-ui";

type HelpTab = "vias" | "mostrador" | "bandeja" | "preguntas";

const TABS: Array<{ key: HelpTab; label: string }> = [
  { key: "vias", label: "Las tres vías" },
  { key: "mostrador", label: "Mostrador paso a paso" },
  { key: "bandeja", label: "Recogidas y bandeja" },
  { key: "preguntas", label: "Preguntas frecuentes" },
];

// Guía viva del ingreso de paquetes. Los nombres de botones y pantallas son
// los reales del panel: si un flujo cambia, esta página cambia en el mismo PR.
export default function AyudaPage() {
  usePageTitle("Ayuda");
  const [tab, setTab] = useState<HelpTab>("vias");

  return (
    <div className="animate-fade-in space-y-4">
      <OperationsHeader
        eyebrow="Guía de operación"
        title="¿Cómo funciona el ingreso de paquetes?"
        description="Todo paquete entra por la misma pantalla. Elige la vía y el formulario muestra solo lo que esa vía necesita — lo opcional queda plegado con sus valores por defecto."
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Secciones de la guía">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${
              tab === item.key
                ? "bg-primary text-white"
                : "border border-slate-300 text-slate-600 dark:border-[#2a2a3e] dark:text-slate-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "vias" ? (
        <div className="space-y-3">
          <OperationsCard className="border-primary/40">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Ya está en mostrador — «Recibir ahora»</h2>
              <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-white">LA MÁS COMÚN</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              El cliente trae el paquete a la sede. La guía nace <strong>al instante</strong>, con recepción y
              custodia incluidas — lista para imprimir. El caso típico se resuelve con <strong>2 selecciones y
              4 campos</strong>. Botón final: <strong>«Registrar y recibir»</strong>.
            </p>
            <Link href="/recogidas/nueva" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white">
              Abrir Nuevo ingreso
            </Link>
          </OperationsCard>

          <OperationsCard>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">«Recoger donde el cliente»</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              El cliente pide que pasemos por el paquete. Se registra la <strong>dirección de recogida</strong> y
              los datos de cada paquete. La solicitud cae en la <strong>bandeja de Ingresos</strong> para revisión,
              materialización de guías y asignación. Botón final: <strong>«Crear ingreso»</strong>.
            </p>
          </OperationsCard>

          <OperationsCard>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">«El cliente lleva a sede»</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Se registra la <strong>sede</strong> y la <strong>fecha estimada de entrega</strong>; también cae en la
              bandeja. Botón final: <strong>«Crear ingreso»</strong>. Cuando el paquete llegue físicamente, se recibe
              y concilia en{" "}
              <Link href="/recogidas/recepcion" className="font-bold underline underline-offset-2">Recepción</Link>.
            </p>
          </OperationsCard>

          <InlineNotice tone="info">
            <strong>La regla que no cambia:</strong> ningún campo desapareció — lo opcional está plegado con sus
            valores por defecto a la vista. Si un caso lo necesita, se despliega; si no, no se toca.
          </InlineNotice>
        </div>
      ) : null}

      {tab === "mostrador" ? (
        <div className="space-y-3">
          <HelpStep n={1} title="Elige el cliente (contacto de cobro)">
            Al elegirlo aparece <strong>«Se cobra a: …»</strong> y el contacto se autollena. <strong>¿No existe
            todavía?</strong> Déjalo vacío: la guía sigue su curso y queda en <em>«Pendientes por identificar
            cliente»</em> para vincularla después — nunca frenes un mostrador por esto.
          </HelpStep>
          <HelpStep n={2} title="Confirma la sede">
            Viene autoseleccionada. Solo cámbiala si estás recibiendo en otra sede.
          </HelpStep>
          <HelpStep n={3} title="Registra cada paquete — 4 datos">
            <span className="mb-2 mt-1 flex flex-wrap gap-2">
              {["Destinatario", "Teléfono", "Dirección de entrega", "Valor COD"].map((field) => (
                <span key={field} className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary">{field}</span>
              ))}
            </span>
            <strong>La dirección manda:</strong> escríbela completa y con la <strong>ciudad correcta</strong> (en
            «Más detalles» si no es Bogotá) — de ella depende el punto en el mapa del piloto. «Más detalles»
            también guarda complemento, tamaño y frágil. <strong>«+ Agregar paquete»</strong> para varios del
            mismo cliente.
          </HelpStep>
          <HelpStep n={4} title="Solo si aplica: los bloques plegados">
            <strong>«Marcar rechazo»</strong> abre motivo + <strong>foto obligatoria</strong> (sin foto no hay
            rechazo). <strong>«Cobro del servicio»</strong> y <strong>«¿Entrega o recibe otra persona?»</strong>{" "}
            ya traen valores por defecto — despliégalos solo cuando el caso lo pida.
          </HelpStep>
          <HelpStep n={5} title="«Registrar y recibir»">
            Sale el aviso con el código del ingreso y las guías creadas, y el sistema te lleva a{" "}
            <Link href="/pedidos" className="font-bold underline underline-offset-2">Envíos y guías</Link>. Ahí
            imprimes la guía y la pegas al paquete. Recepción y custodia ya quedaron registradas.
          </HelpStep>
          <InlineNotice tone="warning">
            <strong>Verificación de 3 segundos antes de registrar:</strong> ¿cliente elegido (o vacío a propósito)?
            · ¿dirección con ciudad correcta? · ¿COD con el valor que dijo el cliente?
          </InlineNotice>
        </div>
      ) : null}

      {tab === "bandeja" ? (
        <div className="space-y-3">
          <OperationsCard>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              En las vías de recogida y entrega planificada el paquete <strong>aún no está en nuestras manos</strong>:
              por eso crean una solicitud, no una guía inmediata. La solicitud sigue esta línea temporal — la misma
              que ves en el detalle de cada solicitud de{" "}
              <Link href="/recogidas" className="font-bold underline underline-offset-2">la bandeja de Ingresos</Link>,
              con el paso actual resaltado y la siguiente acción enlazada.
            </p>
          </OperationsCard>
          <HelpStep n={1} title="Solicitud creada" done>
            Queda en «Pendiente de revisión».
          </HelpStep>
          <HelpStep n={2} title="Revisar y aceptar">
            Pestaña <strong>Revisión</strong> del detalle: se confirman los datos y se acepta.
          </HelpStep>
          <HelpStep n={3} title="Materializar las guías">
            Pestaña <strong>Materializar</strong>: cada paquete recibe su guía.{" "}
            <strong>Sin este paso, la asignación del piloto se rechaza.</strong>
          </HelpStep>
          <HelpStep n={4} title="Asignar al responsable (solo vía recogida)">
            En <Link href="/recogidas/tareas" className="font-bold underline underline-offset-2">Asignar tareas</Link>:
            piloto, empleado Danhei o recolector autorizado. El piloto la ve al instante en su app. En la vía
            «el cliente lleva a sede» no hay nada que recoger: este paso no aplica.
          </HelpStep>
          <HelpStep n={5} title="Recibir en sede">
            El piloto trae lo recogido — o el cliente llega con sus paquetes — y todo se concilia en{" "}
            <Link href="/recogidas/recepcion" className="font-bold underline underline-offset-2">Recepción</Link> —
            faltantes o novedades exigen causal y foto.
          </HelpStep>
        </div>
      ) : null}

      {tab === "preguntas" ? (
        <div className="space-y-3">
          <HelpFaq q="¿El cliente no está creado en el sistema?">
            Registra el ingreso <strong>sin cliente</strong>. La guía queda en «Pendientes por identificar cliente»
            y se vincula después sin perder nada — ni remitente, ni historial, ni dinero. Nunca hagas esperar al
            cliente por esto.
          </HelpFaq>
          <HelpFaq q="¿El paquete llega dañado o el cliente rechaza uno?">
            Usa <strong>«Marcar rechazo»</strong> en ese paquete: motivo + <strong>foto obligatoria</strong>. Sin
            foto el sistema no lo acepta — y eso es a propósito: la evidencia protege a todos.
          </HelpFaq>
          <HelpFaq q="¿Por qué es tan importante la dirección?">
            El sistema la geocodifica para ubicar el punto en el mapa del piloto, <strong>siempre dentro de la
            ciudad de la guía</strong>. Dirección incompleta o ciudad equivocada = punto impreciso o sin punto.
          </HelpFaq>
          <HelpFaq q="¿Cuándo le entrego los paquetes al piloto?">
            Cuando venga por ellos: en{" "}
            <Link href="/pedidos" className="font-bold underline underline-offset-2">Envíos y guías</Link>, asigna
            el piloto y pulsa <strong>«Entregar»</strong> — el piloto escanea la guía, o tú confirmas con una nota
            obligatoria. Desde ese momento la custodia es suya, con o sin ruta armada. (Esto es para guías ya en
            bodega; asignar una <em>recogida</em> se hace en Asignar tareas.)
          </HelpFaq>
          <HelpFaq q="¿El piloto dice que no puede iniciar su ruta?">
            Casi siempre es custodia pendiente: le faltan paquetes por escanear en <strong>«Recibir despacho»</strong>{" "}
            (su app se lo muestra en Inicio), o a la solicitud le faltó <strong>materializar</strong> las guías. La
            línea temporal del detalle te dice exactamente en qué paso está.
          </HelpFaq>
          <HelpFaq q="¿El cliente quiere saber dónde va su paquete?">
            No necesita llamarnos: en <strong>danheiexpress.com</strong> rastrea con la guía y los{" "}
            <strong>últimos 4 dígitos del teléfono del destinatario</strong>. Dale ese dato al despachar.
          </HelpFaq>
          <InlineNotice tone="info">
            <strong>¿Un caso que no está aquí?</strong> No improvises un paso por fuera del sistema — pregunta.
            Cada excepción que se registra bien hoy es un problema que no existe mañana.
          </InlineNotice>
        </div>
      ) : null}
    </div>
  );
}

function HelpStep({ n, title, done = false, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <article className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          done ? "bg-delivered text-white" : "bg-primary text-white"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0">
        <h2 className="font-bold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{children}</p>
      </div>
    </article>
  );
}

function HelpFaq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      <h2 className="font-bold text-primary">{q}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{children}</p>
    </article>
  );
}
