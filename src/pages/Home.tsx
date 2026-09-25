/**
 * Página de inicio de la plataforma.
 *
 * Solo muestra el hero con la presentación del proyecto. El acceso a los
 * módulos (simulador, explorador, educación, mapa 3D) requiere sesión, por lo
 * que los botones cambian según el estado de autenticación.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, ChevronRight, LogIn, UserPlus, Database, BookOpen, HelpCircle } from '../lib/icons';
import { Page } from '../lib/types';
import { useAuth } from '../lib/auth';
import { Tooltip } from '../components/ui/Tooltip';
import { startTour } from '../tours/useTour';
import { buildHomeSteps } from '../tours/home';
import { loadHomeStats, type HomeStats } from '../lib/homeStats';
import { useInView } from '../lib/useInView';
import { SISMO_MAS_FUERTE, ALTURA_GALERAS, VOLCANES_ACTIVOS, VOLCANES_COORDS, TUMACO_1979, PASTO_REF } from '../data/hechos-narino';

interface Props {
  onNavigate: (page: Page, opts?: { register?: boolean }) => void;
  /** Cambia al hacer clic en el logo estando ya en Inicio: reinicia las animaciones. */
  replayNonce?: number;
  /** Aviso temporal a mostrar (p. ej. "Tu cuenta fue eliminada"). */
  notice?: string | null;
  /** Se llama al descartar el aviso. */
  onNoticeSeen?: () => void;
}

// Paleta (hex directos para que no dependan de la resolución del theme).
const C = {
  terracotta: '#C4553A',
  forest: '#2D6A4F',
  ink: '#1A1A2E',
  cream: '#FAFAF8',
  muted: '#5A5A5A',
  ochre: '#C9A227',
};

/**
 * Registro real de referencia mostrado en el hero. Es el evento de mayor
 * magnitud del catálogo CM (velocímetro de banda ancha, estación BBAC).
 * Se carga el JSON estático decimado, el mismo que usa el Explorador.
 */
const REAL_EVENT = {
  id: 'CM_M6.3_2025-04-25T11-44-52',
  station: 'BBAC',
  magnitude: 6.3,
  date: '25 abr 2025',
  place: 'frontera entre Colombia y Ecuador',
};

/** Detecta si el usuario prefiere movimiento reducido (accesibilidad). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/* ═══ FONDO DE SISMOGRAMA ANIMADO ═══ */
/**
 * Fondo del hero: siete ondas sísmicas que recorren toda la pantalla sobre
 * una malla tenue. Con prefers-reduced-motion activo el fondo se congela (no
 * anima), conservando la misma composición y opacidad.
 */
function SeismoBg({ animate }: { animate: boolean }) {
  const [off, setOff] = useState(0);
  useEffect(() => {
    if (!animate) return; // respeta prefers-reduced-motion: fondo estático
    let raf: number;
    const go = () => { setOff(o => (o + 0.8) % 2000); raf = requestAnimationFrame(go); };
    raf = requestAnimationFrame(go);
    return () => cancelAnimationFrame(raf);
  }, [animate]);
  const wave = useCallback((f: number, a: number, p: number, y: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 500; i++) {
      const x = i * 4, t = (x + off + p) * 0.008;
      const b1 = Math.exp(-Math.pow((i - 120) * 0.01, 2));
      const b2 = Math.exp(-Math.pow((i - 300) * 0.012, 2));
      const b3 = Math.exp(-Math.pow((i - 420) * 0.015, 2));
      pts.push(`${x},${(y + Math.sin(t * f) * a * b1 + Math.sin(t * f * 1.5) * a * 0.7 * b2 + Math.sin(t * f * 2.2) * a * 0.4 * b3).toFixed(1)}`);
    }
    return `M ${pts.join(' L ')}`;
  }, [off]);
  return (
    <svg className="w-full h-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="bgpulse" cx="30%" cy="40%" r="60%">
          <stop offset="0%" stopColor={C.terracotta} stopOpacity="0.1" />
          <stop offset="100%" stopColor={C.terracotta} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bgpulse)" />
      {Array.from({ length: 45 }).map((_, i) => <line key={`h${i}`} x1="0" y1={i * 20} x2="1600" y2={i * 20} stroke={C.terracotta} strokeWidth="0.5" opacity="0.06" />)}
      {Array.from({ length: 80 }).map((_, i) => <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="900" stroke={C.terracotta} strokeWidth="0.5" opacity="0.06" />)}
      <path d={wave(3.0, 65, 0, 60)} fill="none" stroke={C.terracotta} strokeWidth="3.5" opacity="0.18" />
      <path d={wave(2.5, 80, 200, 180)} fill="none" stroke={C.terracotta} strokeWidth="3" opacity="0.15" />
      <path d={wave(2.0, 55, 400, 300)} fill="none" stroke={C.forest} strokeWidth="3" opacity="0.13" />
      <path d={wave(3.5, 45, 100, 420)} fill="none" stroke={C.ochre} strokeWidth="2.5" opacity="0.11" />
      <path d={wave(1.8, 90, 300, 540)} fill="none" stroke={C.terracotta} strokeWidth="2.5" opacity="0.09" />
      <path d={wave(4.0, 35, 500, 660)} fill="none" stroke={C.forest} strokeWidth="2" opacity="0.07" />
      <path d={wave(2.8, 60, 150, 780)} fill="none" stroke={C.ochre} strokeWidth="2" opacity="0.06" />
    </svg>
  );
}

interface RealWave { time: number[]; north: number[]; east: number[]; vertical: number[]; }
/** Registro real completo con las llegadas P/S medidas en el backend (STA). */
interface RealRecord extends RealWave { pPick?: number; sPick?: number; }

const TRACE_W = 800;

/* ═══ REGISTRO SÍSMICO REAL (BHN/BHE/BHZ) ═══ */
/**
 * Dibuja las tres componentes de un registro real decimado y marca las
 * llegadas P y S (tiempos medidos por el backend con STA sobre esta misma
 * señal; ver backend/compute_bbac_picks.py). Al cargar, una línea vertical
 * recorre la señal una sola vez en ~3 s, como si se registrara. Con
 * prefers-reduced-motion no hay animación.
 */
function RealSeis({ record, animate, replay = 0 }: { record: RealRecord | null; animate: boolean; replay?: number }) {
  const [ratio, setRatio] = useState(animate ? 0 : 1);
  useEffect(() => {
    if (!record || !animate) { setRatio(1); return; }
    let raf: number;
    setRatio(0);
    const start = Date.now();
    // Curva ease-in-out: el barrido arranca y frena suave (no de golpe).
    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    // Barrido único de ~7 s que revela la señal y la deja fija a opacidad plena.
    const loop = () => {
      const p = Math.min((Date.now() - start) / 7000, 1);
      setRatio(easeInOut(p));
      if (p < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [record, animate, replay]);

  const channels = [
    { l: 'BHN', hex: C.terracotta, key: 'north' as const },
    { l: 'BHE', hex: C.forest, key: 'east' as const },
    { l: 'BHZ', hex: C.ochre, key: 'vertical' as const },
  ];

  // Construye el path normalizando por el máximo absoluto de la traza.
  const buildPath = (vals: number[]): string => {
    if (!vals || vals.length < 2) return '';
    let peak = 1e-9;
    for (const v of vals) { const a = Math.abs(v); if (a > peak) peak = a; }
    const n = vals.length;
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * TRACE_W;
      const y = 25 - (vals[i] / peak) * 22;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return `M ${pts.join(' L ')}`;
  };

  // Posición como fracción [0..1] de un tiempo t sobre el eje de la señal.
  const tMax = record?.time?.length ? record.time[record.time.length - 1] : 0;
  const fracOf = (t: number) => (tMax > 0 ? Math.min(1, Math.max(0, t / tMax)) : 0);
  const pF = record?.pPick != null ? fracOf(record.pPick) : null;
  const sF = record?.sPick != null ? fracOf(record.sPick) : null;
  // La zona de trazas está desplazada a la derecha por la etiqueta de canal (w-7 + gap-2 ≈ 36px).
  const LANE_LEFT = 36;

  return (
    <div className="w-full animate-soft-in">
      {/* Etiquetas P y S (12 px) alineadas con sus líneas verticales. */}
      {(pF != null || sF != null) && (
        <div className="relative mb-0.5 h-4" style={{ marginLeft: LANE_LEFT }}>
          {pF != null && (
            <span className="absolute -translate-x-1/2 text-[12px] font-bold leading-none" style={{ left: `${pF * 100}%`, color: C.ink }}>P</span>
          )}
          {sF != null && (
            <span className="absolute -translate-x-1/2 text-[12px] font-bold leading-none" style={{ left: `${sF * 100}%`, color: C.ink }}>S</span>
          )}
        </div>
      )}

      <div className="space-y-1">
        {channels.map(ch => (
          <div key={ch.l} className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold w-7 text-right" style={{ color: ch.hex }}>{ch.l}</span>
            <div className="relative flex-1 bg-stone-50 rounded border border-stone-200/60 overflow-hidden">
              {/* Líneas verticales P y S: 1 px sólido en gris de texto. */}
              {record && pF != null && (
                <span className="absolute top-0 bottom-0 w-px" style={{ left: `${pF * 100}%`, backgroundColor: C.muted }} />
              )}
              {record && sF != null && (
                <span className="absolute top-0 bottom-0 w-px" style={{ left: `${sF * 100}%`, backgroundColor: C.muted }} />
              )}
              <svg viewBox={`0 0 ${TRACE_W} 50`} className="relative w-full h-8" preserveAspectRatio="none">
                <line x1="0" y1="25" x2={TRACE_W} y2="25" stroke="#E8E6E1" strokeWidth="0.5" />
                {record ? (
                  <>
                    {/* Traza real a color de paleta y opacidad plena. */}
                    <path d={buildPath(record[ch.key])} fill="none" stroke={ch.hex} strokeWidth="1.5" strokeLinejoin="round" />
                    {ratio < 1 && (
                      <>
                        {/* Máscara opaca del barrido (oculta lo aún no registrado). */}
                        <rect x={ratio * TRACE_W} y="0" width={TRACE_W - ratio * TRACE_W} height="50" fill="#FAFAF9" />
                        <line x1={ratio * TRACE_W} y1="0" x2={ratio * TRACE_W} y2="50" stroke={ch.hex} strokeWidth="1" />
                      </>
                    )}
                  </>
                ) : (
                  <text x={TRACE_W / 2} y="30" textAnchor="middle" className="fill-stone-300" fontSize="10">cargando registro</text>
                )}
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ CONTADOR ANIMADO ═══ */
/**
 * Cuenta de 0 al valor objetivo (~1.2 s, ease-in-out) cuando `run` es true, y
 * se reinicia con `replay`. Con `animate` en false muestra el valor final.
 */
function Ctr({ target, prefix = '', decimals = 0, run, animate, replay }: { target: number; prefix?: string; decimals?: number; run: boolean; animate: boolean; replay: number }) {
  const [v, setV] = useState(animate ? 0 : target);
  useEffect(() => {
    if (!animate) { setV(target); return; }
    if (!run) { setV(0); return; }
    let raf: number;
    const s = Date.now();
    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const tick = () => {
      const p = Math.min((Date.now() - s) / 1200, 1);
      setV(easeInOut(p) * target);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setV(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, animate, replay]);
  return <>{prefix}{v.toFixed(decimals)}</>;
}

/* ═══ MINI GRÁFICOS DE LOS CONTADORES ═══ */
/*
 * Las tres gráficas comparten el mismo lenguaje visual: una barra horizontal
 * de igual ancho y grosor (8 px, esquinas redondeadas), con carril gris muy
 * claro y la parte con datos en color de la paleta. Las etiquetas van a 12 px
 * en gris de texto legible.
 */
const BAR_W = 180;   // ancho común de las tres barras (unidades de viewBox)
const BAR_H = 8;     // grosor común
const BAR_R = 4;     // radio de esquina
const BAR_TRACK = '#EEEBE6'; // gris muy claro del carril

/** Etiqueta de 12 px en gris de texto para los mini gráficos. */
function BarLabels({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-between text-[12px] leading-none mt-1" style={{ color: C.muted }}>{children}</div>;
}

/**
 * Periodo: barra de min..max con dos segmentos coloreados, el año más antiguo
 * (2006) y el tramo reciente de la red CM (2023 a 2026); el hueco intermedio
 * deja ver que no hay registros entre ambos. Se llena desde la izquierda con
 * `progress` (0..1).
 */
function PeriodChart({ min, max, recentMin, recentMax, progress }: { min: number; max: number; recentMin: number; recentMax: number; progress: number }) {
  const span = Math.max(1, max - min);
  const x = (year: number) => ((year - min) / span) * BAR_W;
  const startSegW = Math.max(BAR_H, ((Math.min(recentMin, min + 1) - min) / span) * BAR_W);
  const clip = BAR_W * progress; // borde derecho revelado
  return (
    <div className="w-[180px]">
      <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="w-[180px]" style={{ height: BAR_H }} preserveAspectRatio="none" aria-label="Periodo de registros">
        <defs><clipPath id="clip-period"><rect x="0" y="0" width={clip} height={BAR_H} /></clipPath></defs>
        <rect x="0" y="0" width={BAR_W} height={BAR_H} rx={BAR_R} fill={BAR_TRACK} />
        <g clipPath="url(#clip-period)">
          {/* Tramo inicial (2006) en verde. */}
          <rect x="0" y="0" width={startSegW} height={BAR_H} rx={BAR_R} fill={C.forest} />
          {/* Tramo reciente de la red CM (2023–2026) en terracota. */}
          <rect x={x(recentMin)} y="0" width={Math.max(BAR_H, x(recentMax) - x(recentMin))} height={BAR_H} rx={BAR_R} fill={C.terracotta} />
        </g>
      </svg>
      <BarLabels><span>{min}</span><span>{max}</span></BarLabels>
    </div>
  );
}

/**
 * Eventos: barra partida, tectónicos (terracota) vs volcánicos (verde),
 * proporcional al conteo. Se llena desde la izquierda con `progress`.
 */
function EventsChart({ cm, galeras, progress }: { cm: number; galeras: number; progress: number }) {
  const total = Math.max(1, cm + galeras);
  const cmW = (cm / total) * BAR_W;
  const clip = BAR_W * progress;
  return (
    <div className="w-[180px]">
      <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="w-[180px]" style={{ height: BAR_H }} preserveAspectRatio="none" aria-label="Eventos por tipo">
        <defs><clipPath id="clip-events"><rect x="0" y="0" width={clip} height={BAR_H} /></clipPath></defs>
        <rect x="0" y="0" width={BAR_W} height={BAR_H} rx={BAR_R} fill={BAR_TRACK} />
        <g clipPath="url(#clip-events)">
          <rect x="0" y="0" width={cmW} height={BAR_H} rx={BAR_R} fill={C.terracotta} />
          <rect x={cmW} y="0" width={BAR_W - cmW} height={BAR_H} rx={BAR_R} fill={C.forest} />
        </g>
      </svg>
      <BarLabels>
        <span style={{ color: C.terracotta }}>{cm} tectónicos</span>
        <span style={{ color: C.forest }}>{galeras} volcánicos</span>
      </BarLabels>
    </div>
  );
}

/**
 * Magnitud: escala fija de 0 a 9; se rellena solo el tramo del rango observado
 * (min..max) en terracota. Extremos "0"/"9" tenues; "min"/"max" sobre los
 * bordes del tramo relleno. Se llena desde la izquierda con `progress`.
 */
function MagnitudeChart({ min, max, progress }: { min: number; max: number; progress: number }) {
  const SCALE_MIN = 0, SCALE_MAX = 9;
  const x = (m: number) => ((m - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * BAR_W;
  const x0 = x(min), x1 = x(max);
  const clip = x0 + (x1 - x0) * progress; // el tramo crece de x0 hacia x1
  return (
    <div className="w-[180px]">
      <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="w-[180px]" style={{ height: BAR_H }} preserveAspectRatio="none" aria-label="Escala de magnitud 0 a 9">
        <defs><clipPath id="clip-mag"><rect x="0" y="0" width={clip} height={BAR_H} /></clipPath></defs>
        <rect x="0" y="0" width={BAR_W} height={BAR_H} rx={BAR_R} fill={BAR_TRACK} />
        {/* Tramo del rango observado (min..max) en terracota, revelado por clip. */}
        <rect x={x0} y="0" width={x1 - x0} height={BAR_H} rx={BAR_R} fill={C.terracotta} clipPath="url(#clip-mag)" />
      </svg>
      {/* Extremos de la escala (tenues) + bordes del tramo relleno. */}
      <div className="relative h-4 mt-1 text-[12px] leading-none">
        <span className="absolute left-0 top-0" style={{ color: `${C.muted}88` }}>{SCALE_MIN}</span>
        <span className="absolute top-0 -translate-x-1/2" style={{ left: `${(x0 / BAR_W) * 100}%`, color: C.muted }}>{min.toFixed(1)}</span>
        <span className="absolute top-0 -translate-x-1/2" style={{ left: `${(x1 / BAR_W) * 100}%`, color: C.muted }}>{max.toFixed(1)}</span>
        <span className="absolute right-0 top-0" style={{ color: `${C.muted}88` }}>{SCALE_MAX}</span>
      </div>
    </div>
  );
}

/**
 * Hook de animación de "llenado" 0→1 con ease-in-out, disparado al entrar en
 * vista y re-disparado con `replay`. Acepta un retardo de arranque (stagger).
 * Con reduced-motion salta directo a 1.
 */
function useFillProgress(inView: boolean, animate: boolean, replay: number, delayMs: number): number {
  const [p, setP] = useState(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) { setP(1); return; }
    if (!inView) { setP(0); return; }
    let raf: number; let startedAt = 0;
    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const tick = (now: number) => {
      if (!startedAt) startedAt = now;
      const elapsed = now - startedAt - delayMs;
      if (elapsed < 0) { raf = requestAnimationFrame(tick); return; }
      const t = Math.min(elapsed / 1200, 1);
      setP(easeInOut(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setP(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, animate, replay, delayMs]);
  return p;
}

/* ═══ MINI MAPA DE NARIÑO (contorno cerrado + Tumaco + 7 volcanes) ═══ */

/**
 * Mini mapa SVG del departamento de Nariño con su polígono cerrado real
 * (public/terrain/narino_outline.json). Contorno con relleno verde bosque muy
 * claro y borde fino; el marcador de Tumaco (costa) y los 7 volcanes activos
 * usan la MISMA proyección que el contorno, así caen en su lugar real.
 */
/** Elemento resaltado en el mapa, enlazado con las cifras de la derecha. */
type MapHighlight = 'epicenter' | 'galeras' | 'volcanoes' | null;

/** Tooltip activo del mapa: texto + posición (fracción 0..1 del recuadro). */
interface MapTip { text: string; fx: number; fy: number }

function NarinoMiniMap({ outline, highlight, onHighlight }: {
  outline: number[][][] | null;
  highlight: MapHighlight;
  onHighlight: (h: MapHighlight) => void;
}) {
  const W = 210, H = 230;
  const [tip, setTip] = useState<MapTip | null>(null);

  if (!outline || outline.length === 0) {
    return <div className="rounded-lg bg-stone-50 border border-stone-100" style={{ width: '100%', aspectRatio: `${W}/${H}` }} />;
  }

  // Bounds geográficos del polígono. Se amplían al oeste (océano + epicentro
  // mar adentro) y al sur (para rotular "Ecuador" fuera del contorno).
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const ring of outline) for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  const contourMinLat = minLat;
  minLon = Math.min(minLon, TUMACO_1979.lon - 0.12); // margen de océano al oeste
  minLat = minLat - 0.22;                            // franja al sur (Ecuador)

  const pad = 12;
  const s = Math.min((W - 2 * pad) / (maxLon - minLon), (H - 2 * pad) / (maxLat - minLat));
  const offX = pad + ((W - 2 * pad) - (maxLon - minLon) * s) / 2;
  const offY = pad + ((H - 2 * pad) - (maxLat - minLat) * s) / 2;
  const px = (lon: number) => offX + (lon - minLon) * s;
  const py = (lat: number) => offY + (maxLat - lat) * s; // norte arriba
  const fx = (lon: number) => px(lon) / W;
  const fy = (lat: number) => py(lat) / H;

  const ringPath = (ring: number[][]) =>
    'M ' + ring.map(([lon, lat]) => `${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join(' L ') + ' Z';

  const galeras = VOLCANES_COORDS.find(v => v.nombre === 'Galeras');
  const volcHi = highlight === 'volcanoes' || highlight === 'galeras';

  // Posiciones de los 7 volcanes en píxeles, separando los que quedan muy
  // juntos (p. ej. Chiles/Cumbal, Las Ánimas/Galeras) para que se distingan
  // los 7 triángulos. Solo afecta al dibujo; las coordenadas reales no cambian.
  const MIN_SEP = 11; // separación mínima en px entre marcadores
  const volcanoPts = VOLCANES_COORDS.map(v => ({ v, x: px(v.lon), y: py(v.lat) }));
  for (let iter = 0; iter < 12; iter++) {
    let moved = false;
    for (let i = 0; i < volcanoPts.length; i++) {
      for (let j = i + 1; j < volcanoPts.length; j++) {
        const a = volcanoPts[i], b = volcanoPts[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist < MIN_SEP) {
          if (dist < 0.01) { dx = 0.5; dy = -0.5; dist = Math.hypot(dx, dy); }
          const ux = dx / dist, uy = dy / dist;
          const gap = MIN_SEP - dist;
          // Galeras queda anclado en su sitio real; el otro se aparta el total.
          const aFixed = a.v.nombre === 'Galeras', bFixed = b.v.nombre === 'Galeras';
          const aPush = aFixed ? 0 : bFixed ? gap : gap / 2;
          const bPush = bFixed ? 0 : aFixed ? gap : gap / 2;
          a.x -= ux * aPush; a.y -= uy * aPush;
          b.x += ux * bPush; b.y += uy * bPush;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  const show = (text: string, lon: number, lat: number, h: MapHighlight) => {
    setTip({ text, fx: fx(lon), fy: fy(lat) });
    onHighlight(h);
  };
  const clear = () => { setTip(null); onHighlight(null); };

  // Posición de la etiqueta del epicentro: a la derecha del punto (hacia el
  // continente) con una línea guía corta, para que quede dentro del margen.
  const epiX = px(TUMACO_1979.lon), epiY = py(TUMACO_1979.lat);

  return (
    <div className="relative h-full w-full flex items-center justify-center select-none">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full overflow-visible" preserveAspectRatio="xMidYMid meet" role="img"
        aria-label="Mapa de Nariño con el epicentro de Tumaco 1979 y los 7 volcanes activos vigilados por el OVSP">
        {/* Etiquetas de orientación, gris de texto algo más legible. */}
        <text x={px(TUMACO_1979.lon - 0.05)} y={py(1.15)} textAnchor="middle" fontSize="11" fill={C.muted} opacity="0.7">Océano</text>
        <text x={px(TUMACO_1979.lon - 0.05)} y={py(1.15) + 12} textAnchor="middle" fontSize="11" fill={C.muted} opacity="0.7">Pacífico</text>
        {/* "Ecuador" al sur, fuera del contorno. */}
        <text x={px(-77.7)} y={py(contourMinLat) + 16} textAnchor="middle" fontSize="11" fill={C.muted} opacity="0.7">Ecuador</text>

        {/* Polígono de Nariño: relleno verde bosque muy claro + borde fino. */}
        {outline.map((ring, i) => (
          <path key={i} d={ringPath(ring)} fill={`${C.forest}14`} stroke={C.forest} strokeWidth="1" strokeLinejoin="round" opacity="0.9" />
        ))}

        {/* 7 volcanes activos: triángulos verdes (se resaltan enlazados).
            Se usan las posiciones separadas para que no se solapen. */}
        {volcanoPts.map(({ v, x: cx, y: cy }) => {
          const isGaleras = v.nombre === 'Galeras';
          const hot = highlight === 'volcanoes' || (highlight === 'galeras' && isGaleras);
          const r = hot ? 6 : 4;
          const label = v.altura != null ? `${v.nombre}, ${v.altura.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} m s. n. m.` : v.nombre;
          // El tooltip se ancla a la posición dibujada (separada), no a la real.
          const tipLon = minLon + (cx - offX) / s;
          const tipLat = maxLat - (cy - offY) / s;
          return (
            <polygon key={v.nombre}
              points={`${cx},${cy - r} ${cx - r},${cy + r} ${cx + r},${cy + r}`}
              fill={C.forest} stroke="#FFFFFF" strokeWidth="0.7"
              opacity={volcHi && !hot ? 0.45 : 1}
              style={{ transition: 'all 0.2s ease-in-out', cursor: 'pointer' }}
              onMouseEnter={() => show(label, tipLon, tipLat, isGaleras ? 'galeras' : 'volcanoes')}
              onMouseLeave={clear}
              onClick={() => show(label, tipLon, tipLat, isGaleras ? 'galeras' : 'volcanoes')}
            />
          );
        })}

        {/* Pasto: punto de referencia neutro, etiqueta a la DERECHA con guía. */}
        <circle cx={px(PASTO_REF.lon)} cy={py(PASTO_REF.lat)} r="1.8" fill={C.muted} />
        <MapLabel x={px(PASTO_REF.lon)} y={py(PASTO_REF.lat)} dx={13} dy={-9} anchor="start" text="Pasto" muted />

        {/* Galeras: etiqueta a la IZQUIERDA con guía (separada de Pasto). */}
        {galeras && <MapLabel x={px(galeras.lon)} y={py(galeras.lat)} dx={-13} dy={13} anchor="end" text="Galeras" />}

        {/* Epicentro del terremoto de 1979, mar adentro (se resalta enlazado). */}
        <g style={{ cursor: 'pointer' }}
          onMouseEnter={() => show(TUMACO_1979.tooltip, TUMACO_1979.lon, TUMACO_1979.lat, 'epicenter')}
          onMouseLeave={clear}
          onClick={() => show(TUMACO_1979.tooltip, TUMACO_1979.lon, TUMACO_1979.lat, 'epicenter')}>
          <circle cx={epiX} cy={epiY} r={highlight === 'epicenter' ? 11 : 8}
            fill="none" stroke={C.terracotta} strokeWidth="1" opacity="0.5" style={{ transition: 'all 0.2s ease-in-out' }} />
          <circle cx={epiX} cy={epiY} r={highlight === 'epicenter' ? 5 : 3.6}
            fill={C.terracotta} stroke="#FFFFFF" strokeWidth="0.7" style={{ transition: 'all 0.2s ease-in-out' }} />
        </g>

        {/* Etiqueta del epicentro: a la derecha del punto, dentro del margen. */}
        <MapLabel x={epiX} y={epiY} dx={12} dy={-9} anchor="start" text="Epicentro, 1979" />
      </svg>

      {/* Tooltip HTML (texto nítido, no escalado por el SVG). Se ancla dentro
          del recuadro según su posición para no salirse por los bordes. */}
      {tip && (() => {
        const alignLeft = tip.fx < 0.28;
        const alignRight = tip.fx > 0.72;
        const translateX = alignLeft ? '0' : alignRight ? '-100%' : '-50%';
        return (
          <div
            className="pointer-events-none absolute z-10 rounded-lg bg-[#1A1A2E] px-2 py-1 text-[11px] font-medium leading-snug text-white shadow-lg"
            style={{ left: `${tip.fx * 100}%`, top: `${tip.fy * 100}%`, maxWidth: 170, transform: `translate(${translateX}, calc(-100% - 8px))` }}
          >
            {tip.text}
          </div>
        );
      })()}
    </div>
  );
}

/**
 * Etiqueta de mapa con línea guía corta desde el marcador y una caja blanca
 * semitransparente detrás del texto (legibilidad sobre el contorno).
 */
function MapLabel({ x, y, dx, dy, anchor, text, muted = false }: { x: number; y: number; dx: number; dy: number; anchor: 'start' | 'end' | 'middle'; text: string; muted?: boolean }) {
  const tx = x + dx, ty = y + dy;
  const charW = muted ? 5.4 : 6.2, padX = 3, h = muted ? 13 : 15;
  const w = text.length * charW + padX * 2;
  const boxX = anchor === 'start' ? tx - padX : anchor === 'end' ? tx - w + padX : tx - w / 2;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line x1={x} y1={y} x2={tx} y2={ty - 3} stroke={C.muted} strokeWidth="0.8" opacity="0.7" />
      <rect x={boxX} y={ty - h + 3} width={w} height={h} rx="3" fill="#FFFFFF" opacity="0.82" />
      <text x={tx} y={ty} textAnchor={anchor} fontSize={muted ? 9 : 11} fontWeight={muted ? 600 : 700} fill={muted ? C.muted : C.ink}>{text}</text>
    </g>
  );
}

/**
 * Sigla de magnitud (ML / Mw) con tooltip explicativo al pasar el cursor,
 * enfocar con teclado o tocar en pantallas táctiles. Mismo estilo oscuro que
 * los tooltips del mapa. No altera el valor ni la sigla mostrada.
 */
function SiglaTip({ sigla, texto }: { sigla: string; texto: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen(o => !o)}
      tabIndex={0}
      role="button"
      aria-label={`${sigla}: ${texto}`}
      style={{ cursor: 'help' }}>
      <span style={{ textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>{sigla}</span>
      {open && (
        <span
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full z-20 mb-2 w-56 rounded-lg bg-[#1A1A2E] px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white shadow-lg"
          role="tooltip"
        >
          {texto}
        </span>
      )}
    </span>
  );
}

/** Textos de los tooltips de las siglas de magnitud. */
const SIGLA_ML = 'Magnitud local. La calcula la red del SGC para sismos pequeños y moderados.';
const SIGLA_MW = 'Magnitud de momento. Se usa para terremotos grandes porque mide la energía liberada por la falla.';

export function Home({ onNavigate, replayNonce = 0, notice = null, onNoticeSeen }: Props) {
  const { user, markTourSeen } = useAuth();

  // Aviso temporal (p. ej. "Tu cuenta fue eliminada"): se muestra y se descarta.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => onNoticeSeen?.(), 5000);
    return () => clearTimeout(t);
  }, [notice, onNoticeSeen]);
  const homeTourRef = useRef(false); // evita relanzar el tour de bienvenida

  // Lanza el tour de bienvenida (usado por el auto-launch y el botón "?").
  const launchHomeTour = useCallback(() => {
    startTour(buildHomeSteps({ profileComplete: Boolean(user?.profileComplete) }), {
      onDone: () => markTourSeen('home'),
    });
  }, [user, markTourSeen]);

  // Tour de bienvenida: se lanza la primera vez que el usuario inicia sesión,
  // tras pintar el hero (rAF + margen). Explica qué es cada sección. Al
  // omitirlo o terminarlo se marca visto en profiles.tours_vistos.
  useEffect(() => {
    if (homeTourRef.current || !user) return;
    if (user.tours_vistos?.home) return;
    // Perfil incompleto: no se lanza aún (el usuario ve "Completa tu perfil").
    // Cuando lo complete, este efecto vuelve a correr con el user actualizado.
    if (!user.profileComplete) return;
    const id = requestAnimationFrame(() =>
      setTimeout(() => {
        // Se marca el guard justo antes de lanzar, para no "quemarlo" si el
        // efecto corrió en un render intermedio sin llegar a disparar.
        homeTourRef.current = true;
        launchHomeTour();
      }, 500),
    );
    return () => cancelAnimationFrame(id);
  }, [user, launchHomeTour]);

  const [stats, setStats] = useState<HomeStats | null>(null);
  const [record, setRecord] = useState<RealRecord | null>(null);
  const [outline, setOutline] = useState<number[][][] | null>(null);
  // Elemento resaltado en el mini mapa, compartido entre el mapa y las cifras.
  const [mapHi, setMapHi] = useState<MapHighlight>(null);
  const reducedMotion = usePrefersReducedMotion();
  const animate = !reducedMotion;

  // Los contadores y sus barras se animan al entrar en vista y al reiniciar.
  const stat = useInView(0.3);
  const periodP = useFillProgress(stat.inView, animate, replayNonce, 0);
  const eventsP = useFillProgress(stat.inView, animate, replayNonce, 150);
  const magP = useFillProgress(stat.inView, animate, replayNonce, 300);
  const runCounters = animate ? stat.inView : true;

  // Cifras reales de la base (Supabase directo).
  useEffect(() => {
    let active = true;
    loadHomeStats().then(s => { if (active) setStats(s); }).catch(() => { /* deja skeleton */ });
    return () => { active = false; };
  }, []);

  // Registro real decimado + llegadas P/S medidas (JSON estático).
  useEffect(() => {
    let active = true;
    fetch(`/data/cm/${REAL_EVENT.id}/${REAL_EVENT.station}.json`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { waveData?: RealWave; pPick?: number; sPick?: number } | null) => {
        if (active && d?.waveData) setRecord({ ...d.waveData, pPick: d.pPick, sPick: d.sPick });
      })
      .catch(() => { /* si falla, el recuadro muestra "cargando" */ });
    return () => { active = false; };
  }, []);

  // Polígono cerrado de Nariño para el mini mapa.
  useEffect(() => {
    let active = true;
    fetch('/terrain/narino_outline.json')
      .then(r => (r.ok ? r.json() : null))
      .then((d: number[][][] | null) => { if (active && Array.isArray(d)) setOutline(d); })
      .catch(() => { /* sin contorno: el mini mapa queda como caja vacía */ });
    return () => { active = false; };
  }, []);

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: C.cream }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <SeismoBg animate={animate} />
      </div>

      {/* Aviso temporal (p. ej. tras eliminar la cuenta). */}
      {notice && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#1A1A2E] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          {notice}
        </div>
      )}

      <section className="relative flex items-center pt-16 min-h-[calc(100dvh-64px)]" style={{ zIndex: 1 }}>
        <div className="relative w-full app-container py-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-7 animate-slide-left">
              <p className="text-sm font-medium mb-4 flex items-center gap-2" style={{ color: C.forest }}>
                <img src="/images/umariana.png" alt="Universidad Mariana" className="h-5 w-auto" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                Universidad Mariana, Pasto, Nariño
                {/* Botón de ayuda: repite el tour de bienvenida (solo con sesión). */}
                {user && (
                  <Tooltip content="Ver guía">
                    <button
                      type="button"
                      onClick={launchHomeTour}
                      aria-label="Ver guía"
                      className={`flex items-center justify-center w-6 h-6 rounded-full border border-stone-200 text-stone-400 hover:text-[#C4553A] hover:border-[#C4553A]/40 transition-colors ${!user.tours_vistos?.home ? 'help-pulse' : ''}`}
                    >
                      <HelpCircle size={14} />
                    </button>
                  </Tooltip>
                )}
              </p>

              <h1 className="text-4xl lg:text-6xl font-black leading-[1.05] mb-4 tracking-[-0.01em]" style={{ color: C.ink }}>
                Simulador triaxial de pseudo-sismogramas
              </h1>

              <p className="text-base lg:text-lg leading-relaxed mb-6 max-w-lg text-left" style={{ color: C.muted }}>
                Simula cómo viajan las ondas sísmicas por el subsuelo de Nariño y compáralas con registros reales de la red del SGC. Hecho para investigadores y estudiantes.
              </p>

              {user && !user.profileComplete ? (
                <div data-tour="hero-completar-perfil" className="mb-8">
                  <button onClick={() => onNavigate('simulation')} className="flex items-center gap-2 text-white px-7 py-3.5 rounded-xl font-bold text-sm shadow-lg btn-hover" style={{ backgroundColor: C.forest }}>
                    <UserPlus size={18} /> Completar mi perfil de investigador <ChevronRight size={16} />
                  </button>
                  <p className="text-xs mt-3 max-w-lg" style={{ color: C.muted }}>
                    Tu cuenta está creada. Completa tus datos de investigador una sola vez para habilitar el simulador, el explorador, el mapa 3D y el centro educativo.
                  </p>
                </div>
              ) : user ? (
                <div data-tour="hero-modulos" className="flex flex-wrap gap-3 mb-8">
                  {/* Acción principal: única con relleno sólido */}
                  <button onClick={() => onNavigate('simulation')} className="flex items-center gap-2 text-white px-7 py-3.5 rounded-xl font-bold text-sm shadow-lg btn-hover" style={{ backgroundColor: C.terracotta }}>
                    <Activity size={18} /> Iniciar simulación <ChevronRight size={16} />
                  </button>
                  {/* Acciones secundarias: solo borde */}
                  <button onClick={() => onNavigate('explorer')} className="flex items-center gap-2 bg-transparent px-6 py-3.5 rounded-xl font-bold text-sm btn-hover border-2" style={{ borderColor: `${C.forest}66`, color: C.forest }}>
                    <Database size={18} /> Explorar datos
                  </button>
                  <button onClick={() => onNavigate('education')} className="flex items-center gap-2 bg-transparent px-6 py-3.5 rounded-xl font-bold text-sm btn-hover border-2 border-stone-300" style={{ color: C.ink }}>
                    <BookOpen size={18} /> Aprender
                  </button>
                </div>
              ) : (
                <div className="mb-8">
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => onNavigate('auth')} className="flex items-center gap-2 text-white px-7 py-3.5 rounded-xl font-bold text-sm shadow-lg btn-hover" style={{ backgroundColor: C.terracotta }}>
                      <LogIn size={18} /> Iniciar sesión <ChevronRight size={16} />
                    </button>
                    <button onClick={() => onNavigate('auth', { register: true })} className="flex items-center gap-2 bg-transparent px-6 py-3.5 rounded-xl font-bold text-sm btn-hover border-2" style={{ borderColor: `${C.forest}66`, color: C.forest }}>
                      <UserPlus size={18} /> Registrarse
                    </button>
                  </div>
                  <p className="text-xs mt-3 max-w-lg" style={{ color: C.muted }}>
                    El acceso al simulador, al explorador de registros, al mapa 3D y al centro educativo está reservado a investigadores y administradores registrados.
                  </p>
                </div>
              )}

              <div ref={stat.ref} className="flex flex-wrap gap-x-10 gap-y-4">
                {/* Periodo cubierto: el año inicial queda fijo y el final sube
                    de min a max al mismo ritmo que se llena la barra. */}
                <div>
                  <div className="text-2xl font-black" style={{ color: C.ink }}>
                    {stats?.anio_min != null && stats?.anio_max != null
                      ? `${stats.anio_min}\u2013${Math.round(stats.anio_min + (stats.anio_max - stats.anio_min) * periodP)}`
                      : <span className="text-stone-300">···</span>}
                  </div>
                  <div className="text-[10px] mt-0.5 mb-1" style={{ color: C.muted }}>Periodo de registros</div>
                  {stats?.anio_min != null && stats?.anio_max != null && (
                    <PeriodChart
                      min={stats.anio_min}
                      max={stats.anio_max}
                      recentMin={stats.anio_cm_min ?? stats.anio_max}
                      recentMax={stats.anio_cm_max ?? stats.anio_max}
                      progress={periodP}
                    />
                  )}
                </div>
                {/* Eventos registrados + barra tectónicos/volcánicos */}
                <div>
                  <div className="text-2xl font-black" style={{ color: C.ink }}>
                    {stats?.total_eventos != null
                      ? <Ctr target={stats.total_eventos} run={runCounters} animate={animate} replay={replayNonce} />
                      : <span className="text-stone-300">···</span>}
                  </div>
                  <div className="text-[10px] mt-0.5 mb-1" style={{ color: C.muted }}>Eventos sísmicos registrados</div>
                  {stats != null && <EventsChart cm={stats.eventos_cm} galeras={stats.eventos_galeras} progress={eventsP} />}
                </div>
                {/* Magnitud máxima (ML) + escala */}
                <div>
                  <div className="text-2xl font-black" style={{ color: C.ink }}>
                    {stats?.magnitud_maxima != null
                      ? <><SiglaTip sigla="ML" texto={SIGLA_ML} /> <Ctr target={stats.magnitud_maxima} decimals={1} run={runCounters} animate={animate} replay={replayNonce} /></>
                      : <span className="text-stone-300">···</span>}
                  </div>
                  <div className="text-[10px] mt-0.5 mb-1" style={{ color: C.muted }}>Magnitud máxima registrada en la base</div>
                  {stats?.magnitud_maxima != null && (
                    <MagnitudeChart min={stats.magnitud_minima ?? 2.5} max={stats.magnitud_maxima} progress={magP} />
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-3 animate-slide-right">
              <div className="bg-white rounded-2xl p-4 border border-stone-200/60 shadow-lg shadow-stone-200/50">
                <div className="mb-1">
                  <span className="text-sm font-semibold" style={{ color: C.ink }}>
                    Registro real, estación {REAL_EVENT.station}
                  </span>
                </div>
                <p className="text-[11px] mb-2" style={{ color: C.muted }}>
                  Sismo ML {REAL_EVENT.magnitude.toFixed(1)} del {REAL_EVENT.date}, {REAL_EVENT.place}, red CM del SGC.
                </p>
                <RealSeis record={record} animate={animate} replay={replayNonce} />
                <p className="text-[9px] mt-2" style={{ color: C.muted }}>
                  BHN (Norte), BHE (Este), BHZ (Vertical). Las líneas P y S marcan las llegadas de las ondas primaria y secundaria medidas sobre la señal.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-stone-200/60 shadow-lg shadow-stone-200/50">
                <h3 className="text-sm font-bold" style={{ color: C.ink }}>Nariño en contexto</h3>
                <p className="text-[11px] mb-3" style={{ color: C.muted }}>Fuente: Servicio Geológico Colombiano</p>
                <div className="flex items-stretch gap-3">
                  {/* Mini mapa de Nariño (ocupa toda la altura de la tarjeta) */}
                  <div className="w-[52%] min-h-[220px] flex">
                    <NarinoMiniMap outline={outline} highlight={mapHi} onHighlight={setMapHi} />
                  </div>
                  {/* Cifras apiladas, enlazadas con el mapa (resaltado mutuo) */}
                  <div className="w-[48%] flex flex-col justify-center gap-2">
                    {[
                      { key: 'epicenter' as const, valor: <><SiglaTip sigla="Mw" texto={SIGLA_MW} /> 8.1</>, label: 'Terremoto de Tumaco, 1979', dot: <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: C.terracotta }} />, title: `Fuente: ${SISMO_MAS_FUERTE.fuente}` },
                      { key: 'galeras' as const, valor: ALTURA_GALERAS.valor, label: 'Volcán Galeras', dot: <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true"><polygon points="5,1 1,9 9,9" fill={C.forest} /></svg>, title: `Fuente: ${ALTURA_GALERAS.fuente}` },
                      { key: 'volcanoes' as const, valor: VOLCANES_ACTIVOS.valor, label: 'Volcanes activos vigilados por el OVSP', dot: <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true"><polygon points="5,1 1,9 9,9" fill={C.forest} /></svg>, title: `${VOLCANES_ACTIVOS.detalle}, Fuente: ${VOLCANES_ACTIVOS.fuente}` },
                    ].map(f => (
                      <div key={f.key} title={f.title}
                        className="text-left rounded-lg px-2 py-1 -mx-2 transition-colors duration-200"
                        style={{ backgroundColor: mapHi === f.key ? `${C.terracotta}12` : 'transparent' }}
                        onMouseEnter={() => setMapHi(f.key)}
                        onMouseLeave={() => setMapHi(null)}>
                        <div className="flex items-baseline gap-1.5">
                          {f.dot}
                          <span className="text-lg font-black" style={{ color: C.ink }}>{f.valor}</span>
                        </div>
                        <div className="text-[11px] leading-tight" style={{ color: C.muted }}>{f.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
