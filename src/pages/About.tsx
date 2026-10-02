/**
 * Página "Acerca de" (HU021) — rediseño editorial.
 *
 * Encabezado a todo el ancho sobre el relieve real de Nariño, "cómo funciona"
 * con piezas reales de la app, créditos estilo documental con trazas sísmicas
 * reales, objetivos desplegables, formulario de contacto como cierre y un pie
 * compacto con tecnologías, fuentes y el aviso de uso académico.
 *
 * Contenido verificado contra el código real. El envío del formulario pasa por
 * el backend (POST /api/feedback) con límite por IP; el navegador no escribe en
 * Supabase.
 *
 * Datos reales de las trazas: evento CM_M6.3_2025-04-25 (red CM del SGC),
 * estación BBAC (trae picks P/S, señal clara). El sintético de "Cómo funciona"
 * se genera con el motor FDM real vía POST /api/synthetic.
 */
import { useEffect, useRef, useState } from 'react';
import { Page } from '../lib/types';
import { useAuth } from '../lib/authContext';
import { DATA_POLICY_URL, CONTACT_EMAIL } from '../lib/authConsent';
import {
  submitFeedback, FEEDBACK_TYPE_LABELS, FEEDBACK_MAX_LENGTH,
  type FeedbackType,
} from '../lib/feedback';
import { getSynthetic } from '../lib/api3d';

interface Props {
  /** Navegación SPA. Reservada por compatibilidad con App.tsx (esta página no navega a módulos). */
  onNavigate?: (page: Page) => void;
}

/** Paleta del sitio (colores fijos de marca; sin morado en esta página). */
const C = {
  terracotta: '#C4553A',
  forest: '#2D6A4F',
  gold: '#D4A853',
  ink: '#1A1A2E',
  cream: '#FAFAF8',
};

/** ¿El usuario pidió reducir el movimiento? Desactiva las animaciones. */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/* ─────────────────────── Datos de contenido ─────────────────────── */

/** Evento real de la red CM usado para las trazas (varias estaciones). */
const CM_EVENT_ID = 'CM_M6.3_2025-04-25T11-44-52';

/**
 * Personas del proyecto. Cada una con una estación distinta para su traza.
 * Se eligen estaciones con señal clara en el evento M6.3 (BBAC, TUM, CRU);
 * PAS2 queda descartada porque en este evento su traza es casi plana.
 */
const AUTHORS = [
  {
    role: 'Autora',
    name: 'Mag. Valeria Sofía Guerrero Mejía',
    affil: 'Ingeniera Civil. Universidad Mariana, Ingeniería de Sistemas.',
    did: 'Desarrollo de la plataforma: frontend, backend, motor de simulación y visualización.',
    station: 'BBAC',
    color: C.terracotta,
  },
  {
    role: 'Autora',
    name: 'Luisa María Basante Córdoba',
    affil: 'Universidad Mariana, Ingeniería de Sistemas.',
    did: 'Procesamiento de datos sísmicos y documentación.',
    station: 'TUM',
    color: C.forest,
  },
];

const ADVISORS = [
  {
    role: 'Asesor',
    name: 'PhD. Sandro Favian Parra Pay',
    affil: 'Profesor de Ingeniería de Sistemas, Universidad Mariana.',
    did: 'Asesoría en desarrollo de software y metodología Scrum.',
    station: 'CPOP2',
    color: C.gold,
  },
  {
    role: 'Co-asesor',
    name: 'PhD. Oscar Cadena Ibarra',
    affil: 'Servicio Geológico Colombiano, Observatorio Vulcanológico y Sismológico de Pasto.',
    did: 'Co-asesoría en sismología.',
    station: 'BBAC',
    color: C.ink,
  },
];

/** Objetivos (texto exacto del documento). */
const OBJETIVO_GENERAL =
  'Desarrollar un prototipo de software que permita la generación, procesamiento y visualización triaxial de pseudo-sismogramas obtenidos a partir de variables físicas del subsuelo para el análisis de la sismicidad tectónica y volcánica en Nariño, Colombia.';

const OBJETIVOS_ESPECIFICOS = [
  'Identificar los fundamentos teóricos de la sismología, los métodos de síntesis y generación de sismogramas, así como los registros sísmicos históricos del departamento de Nariño, mediante la revisión documental de fuentes oficiales y técnicas de sistematización de datos.',
  'Construir un prototipo de software para la simulación digital que permita la generación y visualización tridimensional de pseudo-sismogramas, mediante el uso de variables físicas y la implementación de algoritmos para su síntesis, procesamiento, análisis y visualización.',
  'Evaluar la usabilidad mediante pruebas de funcionalidad y análisis de su utilidad como herramienta de apoyo en estudios sobre sismicidad en el departamento de Nariño.',
];

/** Tecnologías reales verificadas, agrupadas por capa (pie de la página). */
const TECH_GROUPS = [
  { label: 'Frontend', items: 'React, TypeScript, Vite, Tailwind CSS' },
  { label: 'Visualización', items: 'Three.js, Leaflet' },
  { label: 'Backend', items: 'Python, FastAPI, Uvicorn, NumPy, ObsPy' },
  { label: 'Motor de simulación', items: 'Diferencias finitas 2D en Python + NumPy (en el servidor)' },
  { label: 'Datos', items: 'Supabase (PostgreSQL)' },
  { label: 'Exportación', items: 'jsPDF, SheetJS, html2canvas' },
  { label: 'Calidad y documentación', items: 'Vitest, pytest, TypeDoc, pdoc, Swagger/OpenAPI' },
];

/** Fuentes y créditos (verificados en el código, con atribución real). */
const DATA_SOURCES = [
  { name: 'Servicio Geológico Colombiano (SGC)', attribution: 'Catálogo sísmico y formas de onda de la red CM. Crédito: SGC.', url: 'https://www.sgc.gov.co' },
  { name: 'Observatorio Vulcanológico y Sismológico de Pasto (OVSP)', attribution: 'Sismicidad volcánica del Galeras. Crédito: OVSP (SGC).', url: 'https://www2.sgc.gov.co/volcanes' },
  { name: 'OpenStreetMap', attribution: 'Teselas del mapa del Explorador. © Colaboradores de OpenStreetMap (ODbL).', url: 'https://www.openstreetmap.org/copyright' },
  { name: 'Boletín OSSO (Universidad del Valle)', attribution: 'Coordenadas de las estaciones.', url: 'https://osso.univalle.edu.co' },
  { name: 'AWS Terrain Tiles (Terrarium)', attribution: 'Relieve del Mapa 3D. Terrain Tiles on AWS (Mapzen), datos de elevación abiertos.', url: 'https://registry.opendata.aws/terrain-tiles/' },
  { name: 'Natural Earth', attribution: 'Costa y límites del Mapa 3D. Dominio público.', url: 'https://www.naturalearthdata.com' },
  { name: 'NASA Blue Marble', attribution: 'Textura del globo del Mapa 3D. Dominio público.', url: 'https://visibleearth.nasa.gov' },
  { name: 'GeoJSON de Colombia (John Guerra)', attribution: 'Contorno de Nariño. Cortesía de John Guerra (gist de GitHub).', url: 'https://gist.github.com/john-guerra/43c7656821069d00dcbc' },
];

/* ─────────────────────── Trazas sísmicas ─────────────────────── */

/** Decima una serie a un número máximo de puntos (submuestreo simple). */
function decimate(values: number[], maxPoints = 240): number[] {
  if (values.length <= maxPoints) return values;
  const step = Math.ceil(values.length / maxPoints);
  const out: number[] = [];
  for (let i = 0; i < values.length; i += step) out.push(values[i]);
  return out;
}

/**
 * Recorta una serie a la ventana donde está el evento, para no mostrar el ruido
 * previo ni la coda larga. Si hay tiempo de llegada P (`pTime`), empieza unos
 * segundos antes; si no, se centra en el máximo de energía.
 *
 * @param values Serie completa (una componente).
 * @param time   Vector de tiempos (s), mismo largo que values.
 * @param pTime  Llegada P en segundos (opcional).
 */
function windowEvent(values: number[], time: number[], pTime?: number | null): number[] {
  const n = values.length;
  if (n < 8) return values;
  const total = time[n - 1] - time[0] || 1;
  const dt = total / (n - 1);

  let center: number;
  if (pTime != null && pTime > 0) {
    center = Math.round((pTime - time[0]) / dt);
  } else {
    // Índice del máximo absoluto (llegada de energía principal).
    let imax = 0, best = 0;
    for (let i = 0; i < n; i++) { const a = Math.abs(values[i]); if (a > best) { best = a; imax = i; } }
    center = imax;
  }

  // Ventana: ~8 s antes de la referencia y ~70 s después (cubre P, S y coda).
  const pre = Math.round(8 / dt);
  const post = Math.round(70 / dt);
  const start = Math.max(0, center - pre);
  const end = Math.min(n, center + post);
  const slice = values.slice(start, end);
  return slice.length >= 8 ? slice : values;
}

/**
 * Mini traza SVG que se "dibuja" de izquierda a derecha una sola vez al entrar
 * en pantalla. Respeta prefers-reduced-motion (aparece completa, sin animar).
 */
function MiniTrace({
  values, color, width = 320, height = 44, strokeWidth = 1.25, opacity = 1, delay = 0,
}: {
  values: number[]; color: string; width?: number; height?: number;
  strokeWidth?: number; opacity?: number; delay?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) { setShown(true); return; }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); obs.disconnect(); }
    }, { threshold: 0.35 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const path = (() => {
    if (!values || values.length < 2) return '';
    let max = 0;
    for (const v of values) { const a = Math.abs(v); if (a > max) max = a; }
    const norm = max > 0 ? max : 1;
    const mid = height / 2;
    const amp = height * 0.42;
    return values.map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = mid - (v / norm) * amp;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  })();

  const len = 2000; // longitud aprox. para el efecto de dibujado
  const animated = shown && !prefersReducedMotion();

  return (
    <svg ref={ref} viewBox={`0 0 ${width} ${height}`} width="100%" height={height}
      preserveAspectRatio="none" role="img" aria-hidden="true" style={{ opacity }}>
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeOpacity={0.15} strokeWidth={0.5} />
      <path
        d={path} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeLinejoin="round" strokeLinecap="round"
        style={{
          strokeDasharray: len,
          strokeDashoffset: animated ? 0 : (shown ? 0 : len),
          transition: animated ? `stroke-dashoffset 0.9s ease ${delay}ms` : 'none',
        }}
      />
    </svg>
  );
}

/* ─────────────────────── Encabezado ─────────────────────── */

function Hero() {
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) { setEnter(true); return; }
    const t = setTimeout(() => setEnter(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Animación propia del encabezado, CLARAMENTE distinta del fundido hacia
  // arriba (translateY) de las secciones de abajo: los elementos entran EN
  // CASCADA deslizando desde la izquierda con un leve zoom. Cada uno con su
  // retardo para que se note el escalonado.
  const reduce = prefersReducedMotion();
  const anim = (delay: number) => ({
    opacity: enter ? 1 : 0,
    transform: enter ? 'none' : 'translateX(-40px) scale(0.98)',
    transition: reduce ? 'none' : `opacity 0.8s ease-out ${delay}ms, transform 0.8s cubic-bezier(0.22, 0.61, 0.36, 1) ${delay}ms`,
  } as React.CSSProperties);

  return (
    <header className="relative w-full overflow-hidden" style={{ height: '68vh', minHeight: 460 }}>
      {/* Relieve real de Nariño (solo fondo, sin marcadores) */}
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{ backgroundImage: 'url(/terrain/narino_hillshade.png)' }}
        aria-hidden="true"
      />
      {/* Velo crema para legibilidad */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(250,250,248,0.94) 0%, rgba(250,250,248,0.82) 45%, rgba(250,250,248,0.55) 100%)' }} aria-hidden="true" />

      {/* Contenido alineado al contenedor del sitio (mismo que el navbar) */}
      <div className="relative h-full app-container flex flex-col justify-center py-16 md:py-24">
        <h1 className="text-3xl md:text-5xl font-black tracking-tight max-w-3xl leading-[1.1]" style={{ color: C.ink, ...anim(0) }}>
          Nariño tiembla. Queríamos entender cómo.
        </h1>
        <div className="mt-7 md:mt-8 max-w-2xl space-y-4">
          <p className="text-[15px] md:text-base leading-relaxed" style={{ color: C.ink, ...anim(140) }}>
            Nariño está en una de las zonas sísmicas más activas de Colombia. Aquí convergen las placas de
            Nazca y Sudamericana, lo atraviesa el sistema de fallas de Romeral y el Observatorio Vulcanológico
            y Sismológico de Pasto (OVSP) vigila siete volcanes activos. En 1979 el terremoto de Tumaco, de magnitud 8.1, mostró lo que está
            en juego. Convivir con esa realidad exige entender cómo se comporta el subsuelo, y ese conocimiento
            todavía llega con dificultad a las aulas y a quienes deciden sobre el territorio.
          </p>
          <p className="text-[15px] md:text-base leading-relaxed" style={{ color: C.ink, ...anim(280) }}>
            SismoNariño acerca ese conocimiento. Genera pseudo-sismogramas a partir de las propiedades físicas
            del subsuelo y los pone junto a registros reales de la región, para que estudiantes, docentes e
            investigadores vean cómo viajan las ondas sísmicas bajo sus pies.
          </p>
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────── Sección genérica ─────────────────────── */

/** Envoltura que aplica un fundido de entrada una sola vez al entrar en vista. */
function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) { setInView(true); return; }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'none' : 'translateY(24px)',
      transition: prefersReducedMotion() ? 'none' : 'opacity 0.6s ease, transform 0.6s ease',
    }}>
      {children}
    </div>
  );
}

/** Título de sección grande, sin icono. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl md:text-3xl font-black tracking-tight" style={{ color: C.ink }}>{children}</h2>;
}

/* ─────────────────────── Cómo funciona ─────────────────────── */

interface Series { values: number[] }

function HowItWorks() {
  const [real, setReal] = useState<Series | null>(null);
  const [sim, setSim] = useState<Series | null>(null);
  const [simFailed, setSimFailed] = useState(false);

  // Traza real: evento M6.3, estación BBAC, componente vertical, recortada a la
  // ventana del evento usando el pick P del propio archivo.
  useEffect(() => {
    let active = true;
    fetch(`/data/cm/${CM_EVENT_ID}/BBAC.json`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { waveData?: { vertical: number[]; time: number[] }; pPick?: number } | null) => {
        if (active && d?.waveData?.vertical) {
          const win = windowEvent(d.waveData.vertical, d.waveData.time, d.pPick);
          setReal({ values: decimate(win) });
        }
      })
      .catch(() => { /* si falla, el paso queda con placeholder */ });
    return () => { active = false; };
  }, []);

  // Traza sintética: motor FDM real vía POST /api/synthetic, mismo evento
  // (Mw 6.3, tectónico). Distancia regional representativa del evento.
  useEffect(() => {
    let active = true;
    // Malla y distancia moderadas para que el sintético sea rápido (el paso es
    // ilustrativo, no un cálculo de precisión). Evita esperas largas.
    getSynthetic({
      vp: 3500, vs: 2000, density: 2600,
      magnitude: 6.3, depth_km: 15, source_type: 'tectonic',
      distance_km: 20, nx: 140, nz: 90,
    })
      .then(res => { if (active && res?.vertical) setSim({ values: decimate(res.vertical) }); })
      .catch(() => { if (active) setSimFailed(true); });
    return () => { active = false; };
  }, []);

  // Las tres trazas deben aparecer y animarse a la vez, no una tras otra. Como
  // la real es un archivo estático (instantáneo) y la sintética la calcula el
  // backend (~segundos), esperamos a que AMBAS estén listas (o a que el
  // sintético falle) antes de mostrar cualquiera. Así arrancan sincronizadas.
  const ready = (real != null && sim != null) || (real != null && simFailed);

  const steps = [
    {
      title: 'Datos reales',
      desc: 'Registro de la red CM del SGC (evento del 25/04/2025, estación BBAC), recortado a la ventana del sismo.',
      node: ready && real ? <MiniTrace values={real.values} color={C.forest} /> : <TracePlaceholder />,
    },
    {
      title: 'Simulación',
      desc: 'Pseudo-sismograma del motor de diferencias finitas, generado en el backend.',
      node: ready
        ? (sim ? <MiniTrace values={sim.values} color={C.terracotta} /> : <TraceUnavailable />)
        : <TracePlaceholder />,
    },
    {
      title: 'Comparación',
      desc: 'Lo simulado frente a lo registrado, estación por estación, en el Mapa 3D.',
      node: ready
        ? (real && sim
          // Ambas trazas del mismo evento/estación, una debajo de la otra (la app
          // alterna real/sintético; no superpone).
          ? (
            <div className="space-y-1">
              <MiniTrace values={real.values} color={C.forest} height={20} strokeWidth={1} />
              <MiniTrace values={sim.values} color={C.terracotta} height={20} strokeWidth={1} />
            </div>
          )
          : <TraceUnavailable />)
        : <TracePlaceholder />,
    },
  ];

  return (
    <section className="app-container">
      <Reveal><SectionTitle>Cómo funciona</SectionTitle></Reveal>
      <div className="grid sm:grid-cols-3 gap-6 mt-8">
        {steps.map((s, i) => (
          <Reveal key={s.title}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-stone-400">{i + 1}</span>
              <h3 className="font-bold text-[15px]" style={{ color: C.ink }}>{s.title}</h3>
            </div>
            <div className="min-h-[44px] flex items-center">{s.node}</div>
            <p className="text-sm text-stone-500 leading-relaxed mt-3">{s.desc}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/** Marcador mientras carga una traza. */
function TracePlaceholder() {
  return <div className="h-11 w-full rounded bg-stone-100 animate-pulse" />;
}

/** Aviso cuando el sintético no se pudo generar (backend no disponible). */
function TraceUnavailable() {
  return <div className="h-11 w-full flex items-center text-xs text-stone-400">Sintético no disponible (requiere el servidor).</div>;
}

/* ─────────────────────── Créditos ─────────────────────── */

/** Una fila de crédito con su traza real (estación y color distintos por persona). */
function CreditRow({ role, name, affil, did, station, color }: {
  role: string; name: string; affil: string; did: string; station: string; color: string;
}) {
  const [values, setValues] = useState<number[] | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/data/cm/${CM_EVENT_ID}/${station}.json`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { waveData?: { vertical: number[]; time: number[] }; pPick?: number } | null) => {
        if (active && d?.waveData?.vertical) {
          // Recorta a la ventana del evento para que la señal se vea, no el ruido.
          const win = windowEvent(d.waveData.vertical, d.waveData.time, d.pPick);
          setValues(decimate(win, 300));
        }
      })
      .catch(() => { /* sin traza si falla */ });
    return () => { active = false; };
  }, [station]);

  return (
    <div className="py-6 border-t" style={{ borderColor: '#E7E5E4' }}>
      <div className="grid md:grid-cols-[7rem_1fr] gap-2 md:gap-6 items-baseline">
        <div className="text-xs text-stone-400">{role}</div>
        <div>
          <div className="text-xl md:text-2xl font-bold" style={{ color: C.ink }}>{name}</div>
          <div className="text-sm text-stone-500 mt-1">{affil}</div>
          <div className="text-sm text-stone-600 mt-0.5">{did}</div>
          <div className="mt-3">
            {values ? <MiniTrace values={values} color={color} opacity={0.85} strokeWidth={1.25} height={32} /> : <div className="h-[32px]" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Credits() {
  return (
    <section className="app-container">
      <Reveal><SectionTitle>Quiénes lo hicimos</SectionTitle></Reveal>
      <div className="mt-6">
        {AUTHORS.map(p => <CreditRow key={p.name} {...p} />)}
        {/* Espacio mayor entre autoras y asesoría para leerlos como dos grupos. */}
        <div className="h-8" />
        {ADVISORS.map(p => <CreditRow key={p.name} {...p} />)}
      </div>
    </section>
  );
}

/* ─────────────────────── Objetivos (desplegable) ─────────────────────── */

function Objectives() {
  const [open, setOpen] = useState(false);
  return (
    <section className="app-container">
      <Reveal>
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between text-left py-4 border-t border-b"
          style={{ borderColor: '#E7E5E4' }}
          aria-expanded={open}
        >
          <SectionTitle>Objetivos del proyecto</SectionTitle>
          <span className="text-2xl text-stone-400 font-light" aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
      </Reveal>
      {open && (
        <div className="py-6">
          <h3 className="font-bold text-sm" style={{ color: C.ink }}>Objetivo general</h3>
          <p className="text-sm text-stone-600 leading-relaxed mt-1.5 max-w-3xl">{OBJETIVO_GENERAL}</p>
          <h3 className="font-bold text-sm mt-5" style={{ color: C.ink }}>Objetivos específicos</h3>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-stone-600 leading-relaxed mt-1.5 max-w-3xl">
            {OBJETIVOS_ESPECIFICOS.map((o, i) => <li key={i}>{o}</li>)}
          </ol>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────── Formulario (cierre) ─────────────────────── */

const TYPE_ORDER: FeedbackType[] = ['sugerencia', 'error', 'datos', 'otro'];

function FeedbackSection({ userEmail }: { userEmail: string }) {
  const [type, setType] = useState<FeedbackType>('sugerencia');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(userEmail);
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const hasEmail = email.trim() !== '';
  const needsConsent = hasEmail && !consent;
  const emptyMessage = message.trim() === '';
  const overLimit = message.length > FEEDBACK_MAX_LENGTH;
  const canSend = !emptyMessage && !overLimit && !needsConsent && !sending;

  const disabledReason =
    emptyMessage ? 'Escribe un mensaje para enviar'
      : overLimit ? 'El mensaje es demasiado largo'
        : needsConsent ? 'Autoriza el tratamiento de tu correo'
          : '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!canSend) return;
    setSending(true);
    const res = await submitFeedback({ type, message, email: email || null, consent, honeypot });
    setSending(false);
    if (res.ok) { setSent(true); setMessage(''); setConsent(false); }
    else setError(res.message);
  }

  return (
    <section className="app-container">
      <div className="grid md:grid-cols-2 gap-10 md:gap-14 items-stretch">
        <div className="flex flex-col justify-center">
          <h2 className="text-2xl md:text-4xl font-black tracking-tight leading-tight" style={{ color: C.ink }}>
            ¿Qué le falta a SismoNariño?
          </h2>
          <p className="text-stone-500 mt-4 max-w-md">
            Es un proyecto vivo y nos ayuda saber cómo lo usas. No necesitas iniciar sesión.
          </p>
          <ul className="mt-6 space-y-3 max-w-md">
            {[
              { t: 'Sugerencias', d: 'Ideas para mejorar la simulación, el mapa o el centro educativo.' },
              { t: 'Reportes de error', d: 'Algo que no funciona, se ve mal o da un resultado extraño.' },
              { t: 'Solicitudes de datos', d: 'Un evento o una estación que te gustaría ver en la plataforma.' },
            ].map(i => (
              <li key={i.t} className="flex gap-3">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: C.terracotta }} />
                <span className="text-sm text-stone-600 leading-relaxed">
                  <span className="font-semibold" style={{ color: C.ink }}>{i.t}.</span> {i.d}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-stone-400 mt-6 max-w-md leading-relaxed">
            Si prefieres, también puedes escribirnos a{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold hover:underline" style={{ color: C.forest }}>{CONTACT_EMAIL}</a>.
            Respondemos solo si dejas un correo.
          </p>
        </div>

        <div>
          {sent ? (
            <div className="flex flex-col items-center justify-center text-center min-h-[280px] py-10">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${C.forest}1a` }}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke={C.forest} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <p className="text-lg font-bold" style={{ color: C.ink }}>Gracias, recibimos tu mensaje.</p>
              <p className="text-sm text-stone-500 mt-1">Te responderemos si dejaste un correo.</p>
              <button
                onClick={() => setSent(false)}
                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white btn-hover"
                style={{ backgroundColor: C.terracotta }}
              >
                Enviar otro mensaje
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-500 mb-1.5">Tipo de mensaje</label>
                <div className="flex flex-wrap gap-2">
                  {TYPE_ORDER.map(t => (
                    <button
                      key={t} type="button" onClick={() => setType(t)}
                      className="px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors"
                      style={type === t
                        ? { borderColor: C.terracotta, backgroundColor: `${C.terracotta}14`, color: C.terracotta }
                        : { borderColor: '#E7E5E4', color: '#78716C' }}
                    >
                      {FEEDBACK_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-500 mb-1.5">Mensaje</label>
                <textarea
                  value={message} onChange={e => setMessage(e.target.value)} rows={5}
                  maxLength={FEEDBACK_MAX_LENGTH + 100} placeholder="Escribe aquí tu mensaje…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm resize-y focus:outline-none focus:border-[#C4553A] bg-stone-50"
                />
                <div className={`text-xs mt-1 text-right ${overLimit ? 'text-red-500' : 'text-stone-400'}`}>{message.length}/{FEEDBACK_MAX_LENGTH}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-500 mb-1.5">
                  Correo <span className="font-normal text-stone-400">(opcional, solo si quieres que te respondamos)</span>
                </label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#C4553A] bg-stone-50"
                />
              </div>

              {hasEmail && (
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#C4553A]" />
                  <span className="text-[12px] leading-snug text-stone-600">
                    Autorizo el tratamiento de mi correo conforme a la Ley 1581 de 2012 y la{' '}
                    <a href={DATA_POLICY_URL} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: C.forest }}>
                      Política de protección de datos de la Universidad Mariana
                    </a>, únicamente para responder a este mensaje.
                  </span>
                </label>
              )}

              {/* Honeypot oculto */}
              <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
                <label>No llenar<input type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} /></label>
              </div>

              {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 border border-red-100">{error}</p>}

              <div className="flex items-center gap-3">
                <button
                  type="submit" disabled={!canSend}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-colors"
                  style={{ backgroundColor: canSend ? C.terracotta : '#A8A29E', cursor: canSend ? 'pointer' : 'not-allowed' }}
                >
                  {sending ? 'Enviando…' : 'Enviar mensaje'}
                </button>
                {!canSend && disabledReason && <span className="text-xs text-stone-400">{disabledReason}</span>}
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Pie: tecnologías, créditos, aviso ─────────────────────── */

function Footer() {
  return (
    <section className="app-container">
      <div className="border-t pt-8 grid md:grid-cols-3 gap-8 md:gap-10" style={{ borderColor: '#E7E5E4' }}>
        {/* Construido con: agrupado por capa para dar peso a la columna. */}
        <div>
          <h3 className="text-sm font-bold mb-3" style={{ color: C.ink }}>Construido con</h3>
          <dl className="space-y-2.5">
            {TECH_GROUPS.map(g => (
              <div key={g.label}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{g.label}</dt>
                <dd className="text-xs text-stone-600 leading-relaxed">{g.items}</dd>
              </div>
            ))}
          </dl>
        </div>
        {/* Datos y créditos en dos columnas internas para equilibrar el ancho. */}
        <div className="md:col-span-2">
          <h3 className="text-sm font-bold mb-3" style={{ color: C.ink }}>Datos y créditos</h3>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
            {DATA_SOURCES.map(s => (
              <li key={s.name} className="text-xs leading-relaxed">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: C.ink }}>{s.name}</a>
                <span className="text-stone-500">. {s.attribution}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Uso académico: bloque crema sobrio, contenido centrado. */}
      <div className="mt-10 rounded-2xl border p-6 md:p-10 text-center" style={{ backgroundColor: '#FAF7F0', borderColor: '#EAE4D6' }}>
        <h3 className="text-base font-bold mb-3" style={{ color: C.ink }}>Uso académico y responsabilidad</h3>
        <p className="text-sm leading-relaxed max-w-3xl mx-auto" style={{ color: '#57534E' }}>
          SismoNariño es un prototipo con fines educativos e investigativos. Los pseudo-sismogramas son señales
          sintéticas generadas con un modelo simplificado (FDM en medio homogéneo) y no sustituyen los
          productos oficiales del Servicio Geológico Colombiano. Los conceptos, afirmaciones y opiniones emitidos
          en el trabajo de grado son responsabilidad exclusiva de las autoras (Art. 71, Reglamento de
          Investigaciones, Universidad Mariana).
        </p>
        <div className="mt-5 pt-4 border-t flex items-center justify-center gap-2 text-xs max-w-3xl mx-auto" style={{ borderColor: '#EAE4D6', color: '#A8A29E' }}>
          <span className="font-semibold" style={{ color: C.terracotta }}>Versión 1.0, 2026.</span>
          <span>Código disponible para la comunidad académica.</span>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Página ─────────────────────── */

export function About(_: Props) {
  void _;
  const { user } = useAuth();
  return (
    <div className="min-h-screen pt-16" style={{ backgroundColor: C.cream }}>
      <Hero />
      <div className="py-12 md:py-16 space-y-20 md:space-y-24">
        <HowItWorks />
        <Credits />
        <Objectives />
        <FeedbackSection userEmail={user?.email ?? ''} />
        <Footer />
      </div>
    </div>
  );
}
