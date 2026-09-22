/**
 * Página de inicio de la plataforma.
 *
 * Solo muestra el hero con la presentación del proyecto. El acceso a los
 * módulos (simulador, explorador, educación, mapa 3D) requiere sesión, por lo
 * que los botones cambian según el estado de autenticación.
 */
import { useState, useEffect, useCallback } from 'react';
import { Activity, ChevronRight, BarChart3, AlertTriangle, LogIn, UserPlus, Database, BookOpen } from '../lib/icons';
import { Page } from '../lib/types';
import { useAuth } from '../lib/auth';
import { getHomeStats, type HomeStats } from '../lib/api3d';
import { SISMO_MAS_FUERTE, ALTURA_GALERAS, MONITOREO_SGC } from '../data/hechos-narino';

interface Props { onNavigate: (page: Page, opts?: { register?: boolean }) => void; }

/* ═══ ANIMATED SEISMOGRAPH BACKGROUND ═══ */
function SeismoBg() {
  const [off, setOff] = useState(0);
  useEffect(() => {
    let raf: number;
    const go = () => { setOff(o => (o + 0.8) % 2000); raf = requestAnimationFrame(go); };
    raf = requestAnimationFrame(go);
    return () => cancelAnimationFrame(raf);
  }, []);
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
          <stop offset="0%" stopColor="#C4553A" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#C4553A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bgpulse)" />
      {Array.from({ length: 45 }).map((_, i) => <line key={`h${i}`} x1="0" y1={i * 20} x2="1600" y2={i * 20} stroke="#C4553A" strokeWidth="0.5" opacity="0.06" />)}
      {Array.from({ length: 80 }).map((_, i) => <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="900" stroke="#C4553A" strokeWidth="0.5" opacity="0.06" />)}
      <path d={wave(3.0, 65, 0, 60)} fill="none" stroke="#C4553A" strokeWidth="3.5" opacity="0.18" />
      <path d={wave(2.5, 80, 200, 180)} fill="none" stroke="#C4553A" strokeWidth="3" opacity="0.15" />
      <path d={wave(2.0, 55, 400, 300)} fill="none" stroke="#2D6A4F" strokeWidth="3" opacity="0.13" />
      <path d={wave(3.5, 45, 100, 420)} fill="none" stroke="#D4A853" strokeWidth="2.5" opacity="0.11" />
      <path d={wave(1.8, 90, 300, 540)} fill="none" stroke="#C4553A" strokeWidth="2.5" opacity="0.09" />
      <path d={wave(4.0, 35, 500, 660)} fill="none" stroke="#2D6A4F" strokeWidth="2" opacity="0.07" />
      <path d={wave(2.8, 60, 150, 780)} fill="none" stroke="#D4A853" strokeWidth="2" opacity="0.06" />
    </svg>
  );
}

/* ═══ LIVE SEISMOGRAPH ═══ */
function LiveSeis() {
  const [off, setOff] = useState(0);
  useEffect(() => { let r: number; const g = () => { setOff(o => (o + 1.2) % 800); r = requestAnimationFrame(g); }; r = requestAnimationFrame(g); return () => cancelAnimationFrame(r); }, []);
  const mk = (f: number, a: number, p: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 300; i++) { const x = i * 2.67, t = (x + off + p) * 0.012, b = Math.exp(-Math.pow((i - 150) * 0.015, 2)); pts.push(`${x},${(25 + Math.sin(t * f) * a * b + Math.sin(t * f * 2.5) * a * 0.25 * b).toFixed(1)}`); }
    return `M ${pts.join(' L ')}`;
  };
  return (
    <div className="w-full space-y-1">
      {[{ l: 'BHN', c: '#C4553A', f: 3.2, a: 16, p: 0 }, { l: 'BHE', c: '#2D6A4F', f: 2.4, a: 20, p: 100 }, { l: 'BHZ', c: '#D4A853', f: 4.0, a: 12, p: 200 }].map(ch => (
        <div key={ch.l} className="flex items-center gap-2">
          <span className="text-[9px] font-mono font-bold w-7 text-right" style={{ color: ch.c }}>{ch.l}</span>
          <div className="flex-1 bg-stone-50 rounded border border-stone-200/60 overflow-hidden">
            <svg viewBox="0 0 800 50" className="w-full h-7" preserveAspectRatio="none">
              <line x1="0" y1="25" x2="800" y2="25" stroke="#E8E6E1" strokeWidth="0.5" />
              <path d={mk(ch.f, ch.a, ch.p)} fill="none" stroke={ch.c} strokeWidth="1.5" opacity="0.85" />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══ ANIMATED COUNTER ═══ */
function Ctr({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => { const s = Date.now(); const t = () => { const p = Math.min((Date.now() - s) / 2000, 1); setV(Math.round((1 - Math.pow(1 - p, 3)) * target)); if (p < 1) requestAnimationFrame(t); }; requestAnimationFrame(t); }, [target]);
  return <>{v}{suffix}</>;
}

export function Home({ onNavigate }: Props) {
  const { user } = useAuth();
  const [stats, setStats] = useState<HomeStats | null>(null);

  // Cargar cifras reales al montar (no hardcodeadas).
  useEffect(() => {
    let active = true;
    getHomeStats().then(s => { if (active) setStats(s); }).catch(() => { /* deja skeleton */ });
    return () => { active = false; };
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF8] relative">
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <SeismoBg />
      </div>

      <section className="relative min-h-[100vh] flex items-center pt-16" style={{ zIndex: 1 }}>
        <div className="relative max-w-7xl mx-auto px-6 py-12 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-7 animate-slide-left">
              <p className="text-[#2D6A4F] text-sm font-medium mb-6 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#2D6A4F] animate-pulse" />
                Universidad Mariana · Nariño, Colombia
              </p>

              <h1 className="text-4xl lg:text-6xl font-black text-[#1A1A2E] leading-[1.05] mb-5 tracking-tight">
                Simulador Triaxial de{' '}
                <span className="text-[#C4553A]">Pseudo-Sismogramas</span>
              </h1>

              <p className="text-stone-500 text-base lg:text-lg leading-relaxed mb-8 max-w-lg">
                Plataforma para la generación, procesamiento y visualización triaxial de ondas sísmicas del subsuelo de <span className="font-semibold text-[#2D6A4F]">Nariño, Colombia</span>, orientada a investigadores y estudiantes.
              </p>

              {user && !user.profileComplete ? (
                <div className="mb-10">
                  <button onClick={() => onNavigate('simulation')} className="flex items-center gap-2 bg-[#2D6A4F] text-white px-7 py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-[#2D6A4F]/20 btn-hover">
                    <UserPlus size={18} /> Completar mi perfil de investigador <ChevronRight size={16} />
                  </button>
                  <p className="text-xs text-stone-400 mt-3 max-w-lg">
                    Tu cuenta está creada. Completa tus datos de investigador una sola vez para habilitar el simulador, el explorador, el mapa 3D y el centro educativo.
                  </p>
                </div>
              ) : user ? (
                <div className="flex flex-wrap gap-3 mb-10">
                  <button onClick={() => onNavigate('simulation')} className="flex items-center gap-2 bg-[#C4553A] text-white px-7 py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-[#C4553A]/25 btn-hover">
                    <Activity size={18} /> Iniciar Simulación <ChevronRight size={16} />
                  </button>
                  <button onClick={() => onNavigate('explorer')} className="flex items-center gap-2 bg-[#2D6A4F] text-white px-6 py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-[#2D6A4F]/20 btn-hover">
                    <Database size={18} /> Explorar Datos
                  </button>
                  <button onClick={() => onNavigate('education')} className="flex items-center gap-2 bg-white border-2 border-stone-200 text-[#1A1A2E] px-6 py-3.5 rounded-xl font-bold text-sm btn-hover">
                    <BookOpen size={18} /> Aprender
                  </button>
                </div>
              ) : (
                <div className="mb-10">
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => onNavigate('auth')} className="flex items-center gap-2 bg-[#C4553A] text-white px-7 py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-[#C4553A]/25 btn-hover">
                      <LogIn size={18} /> Iniciar sesión <ChevronRight size={16} />
                    </button>
                    <button onClick={() => onNavigate('auth', { register: true })} className="flex items-center gap-2 bg-white border-2 border-[#2D6A4F]/30 text-[#2D6A4F] px-6 py-3.5 rounded-xl font-bold text-sm btn-hover">
                      <UserPlus size={18} /> Registrarme como investigador
                    </button>
                  </div>
                  <p className="text-xs text-stone-400 mt-3 max-w-lg">
                    El acceso al simulador, al explorador de registros, al mapa 3D y al centro educativo está reservado a investigadores y administradores registrados.
                  </p>
                </div>
              )}

              <div className="flex gap-8">
                {/* Años de registro — de /api/stats/home */}
                <div>
                  <div className="text-2xl font-black text-[#C4553A] flex items-baseline gap-0.5">
                    {stats?.anios_registro != null ? <Ctr target={stats.anios_registro} /> : <span className="text-stone-300">···</span>}
                  </div>
                  <div className="text-[10px] text-stone-400 flex items-center gap-1 mt-0.5"><span className="text-[#C4553A]"><BarChart3 size={13} /></span> años de registros sísmicos</div>
                </div>
                {/* Eventos registrados — de /api/stats/home */}
                <div>
                  <div className="text-2xl font-black text-[#C4553A] flex items-baseline gap-0.5">
                    {stats?.total_eventos != null ? <Ctr target={stats.total_eventos} /> : <span className="text-stone-300">···</span>}
                  </div>
                  <div className="text-[10px] text-stone-400 flex items-center gap-1 mt-0.5"><span className="text-[#C4553A]"><Database size={13} /></span> eventos sísmicos registrados</div>
                </div>
                {/* Magnitud máxima observada — de /api/stats/home */}
                <div>
                  <div className="text-2xl font-black text-[#C4553A] flex items-baseline gap-0.5">
                    {stats?.magnitud_maxima != null ? stats.magnitud_maxima.toFixed(1) : <span className="text-stone-300">···</span>}
                  </div>
                  <div className="text-[10px] text-stone-400 flex items-center gap-1 mt-0.5"><span className="text-[#C4553A]"><AlertTriangle size={13} /></span> magnitud máxima (Mw)</div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-3 animate-slide-right">
              <div className="bg-white rounded-2xl p-4 border border-stone-200/60 shadow-lg shadow-stone-200/50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#2D6A4F]" />
                  <span className="text-sm text-stone-600">Así se ve un registro sísmico en tiempo real</span>
                </div>
                <LiveSeis />
                <p className="text-[9px] text-stone-400 mt-2">BHN (Norte) · BHE (Este) · BHZ (Vertical) — Simulación de 3 componentes del movimiento del suelo</p>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-stone-200/60 shadow-lg shadow-stone-200/50">
                <h3 className="text-sm font-bold text-[#1A1A2E] mb-3">Datos clave de la sismicidad en Nariño</h3>
                <div className="grid grid-cols-2 gap-2">
                  {/* Hechos históricos (constantes documentadas en data/hechos-narino) */}
                  <div className="bg-stone-50 rounded-xl p-3 border border-stone-100" title={`Fuente: ${SISMO_MAS_FUERTE.fuente}`}>
                    <div className="text-xl font-black" style={{ color: '#C4553A' }}>{SISMO_MAS_FUERTE.valor}</div>
                    <div className="text-[10px] text-stone-400 mt-0.5 leading-tight">{SISMO_MAS_FUERTE.descripcion}</div>
                  </div>
                  <div className="bg-stone-50 rounded-xl p-3 border border-stone-100" title={`Fuente: ${ALTURA_GALERAS.fuente}`}>
                    <div className="text-xl font-black" style={{ color: '#2D6A4F' }}>{ALTURA_GALERAS.valor}</div>
                    <div className="text-[10px] text-stone-400 mt-0.5 leading-tight">{ALTURA_GALERAS.descripcion}</div>
                  </div>
                  {/* Eventos registrados — dato real de /api/stats/home */}
                  <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                    <div className="text-xl font-black" style={{ color: '#6B5B95' }}>
                      {stats?.total_eventos != null ? stats.total_eventos : <span className="text-stone-300">···</span>}
                    </div>
                    <div className="text-[10px] text-stone-400 mt-0.5 leading-tight">Eventos sísmicos registrados</div>
                  </div>
                  {/* Monitoreo (constante documentada) */}
                  <div className="bg-stone-50 rounded-xl p-3 border border-stone-100" title={`Fuente: ${MONITOREO_SGC.fuente}`}>
                    <div className="text-xl font-black" style={{ color: '#D4A853' }}>{MONITOREO_SGC.valor}</div>
                    <div className="text-[10px] text-stone-400 mt-0.5 leading-tight">{MONITOREO_SGC.descripcion}</div>
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
