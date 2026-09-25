import { useState, useCallback, useEffect } from 'react';
import { Page, SimulationParams, WaveData } from './lib/types';
import { defaultParams } from './lib/simulation';
import { AuthProvider, useAuth } from './lib/auth';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { Home } from './pages/Home';
import { Simulation } from './pages/Simulation';
import { Explorer } from './pages/Explorer';
import { Map3D } from './pages/Map3D';
import { Education } from './pages/Education';
import { About } from './pages/About';
import { Auth } from './pages/Auth';
import { MyReports } from './pages/MyReports';
import { AdminDashboard } from './pages/AdminDashboard';
import { CompleteProfile } from './pages/CompleteProfile';
import { ResetPassword } from './pages/ResetPassword';
import { Profile } from './pages/Profile';

/** Páginas visibles sin sesión. El resto requiere investigador o administrador. */
const PUBLIC_PAGES: Page[] = ['home', 'about', 'auth'];

/**
 * Escala global ("zoom") para monitores anchos de alta resolución.
 *
 * Hasta 1920px de ancho devuelve 1 (todo se ve exactamente igual que en un
 * portátil). Entre 1920px y 2560px crece de forma fluida hasta 1.3125, de modo
 * que en 2560px el contenedor (1280px) se ve a ~1680px y la tipografía, los
 * espaciados, las tarjetas y el registro real crecen de forma proporcional.
 * Por encima de 2560px se mantiene en el tope para no exagerar.
 */
function useWideScreenZoom(): number {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const MIN_W = 1920, MAX_W = 2560, MAX_Z = 1.3125;
      if (w <= MIN_W) { setZoom(1); return; }
      const t = Math.min((w - MIN_W) / (MAX_W - MIN_W), 1);
      setZoom(1 + t * (MAX_Z - 1));
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);
  return zoom;
}

function AppContent() {
  const { user, loading, recoveryMode, signOut } = useAuth();
  const [page, setPage] = useState<Page>('home');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  /** Aviso a mostrar en Iniciar sesión (p. ej. tras actualizar la contraseña). */
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  /** Aviso a mostrar en Inicio (p. ej. tras eliminar la cuenta). */
  const [homeNotice, setHomeNotice] = useState<string | null>(null);
  /** Página a la que se quería ir antes de pedir sesión. */
  const [pendingPage, setPendingPage] = useState<Page | null>(null);
  const [pendingParams, setPendingParams] = useState<Partial<SimulationParams> | null>(null);
  // Carga de datos reales para el simulador. `nonce` cambia en cada clic de
  // "Cargar en Simulador" para que Simulation re-cargue aunque se elija otra
  // estación del mismo evento (mismos params) — clave para que no se quede
  // pegado en la primera estación.
  const [realLoad, setRealLoad] = useState<{ waveData: WaveData; label: string; params: Partial<SimulationParams>; nonce: number } | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  // Nonce para reiniciar las animaciones del Home (registro real, barras y
  // contadores) al hacer clic en el logo estando ya en Inicio, sin recargar.
  const [homeReplay, setHomeReplay] = useState(0);

  const go = useCallback((p: Page) => {
    if (p === page) return;
    setTransitioning(true);
    setTimeout(() => {
      setPage(p);
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      setTimeout(() => setTransitioning(false), 30);
    }, 200);
  }, [page]);

  const navigate = useCallback((p: Page, opts?: { register?: boolean }) => {
    if (p === 'auth') setAuthMode(opts?.register ? 'register' : 'login');

    // Clic en el logo estando ya en Inicio: subir suave al principio y reiniciar
    // las animaciones del Home, sin recarga completa del navegador.
    if (p === 'home' && page === 'home') {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      setHomeReplay(n => n + 1);
      return;
    }

    // Control de acceso: módulos solo con sesión (investigador o admin).
    if (!PUBLIC_PAGES.includes(p) && !user) {
      setPendingPage(p);
      setAuthMode(opts?.register ? 'register' : 'login');
      go('auth');
      return;
    }
    if (p === 'admin' && user?.role !== 'admin') return;
    go(p);
  }, [go, user, page]);

  // Si la sesión se cierra estando en una página protegida, volver al inicio.
  useEffect(() => {
    if (!loading && !user && !PUBLIC_PAGES.includes(page)) {
      setPage('home');
    }
  }, [user, loading, page]);

  const handleAuthSuccess = useCallback(() => {
    const target = pendingPage && pendingPage !== 'admin' ? pendingPage : 'home';
    setPendingPage(null);
    go(target);
  }, [pendingPage, go]);

  // Tras eliminar la cuenta: cerrar sesión, ir a Inicio y avisar.
  const handleAccountDeleted = useCallback(async () => {
    setHomeNotice('Tu cuenta fue eliminada');
    go('home');
    await signOut();
  }, [go, signOut]);

  const renderPage = () => {
    // Enlace de recuperación de contraseña: pantalla "Nueva contraseña" con
    // prioridad sobre todo lo demás (la sesión de recuperación es temporal).
    if (recoveryMode) {
      return <ResetPassword
        onHome={() => navigate('home')}
        onDone={(msg) => { setAuthNotice(msg); setAuthMode('login'); go('auth'); }}
        onRequestNew={() => { setAuthMode('forgot'); go('auth'); }}
      />;
    }
    // Perfil incompleto (registro nuevo, Google o cuentas antiguas): apenas
    // inicia sesión se le obliga a completar el perfil antes de ver cualquier
    // otra pantalla. Solo se exceptúa 'auth' para no romper el flujo de login.
    if (user && !user.profileComplete && page !== 'auth') {
      return <CompleteProfile onDone={() => { /* el perfil recargado re-renderiza la página pedida */ }} />;
    }
    switch (page) {
      case 'home': return <Home onNavigate={navigate} replayNonce={homeReplay} notice={homeNotice} onNoticeSeen={() => setHomeNotice(null)} />;
      case 'about': return <About onNavigate={navigate} />;
      case 'auth': return <Auth onSuccess={handleAuthSuccess} onHome={() => navigate('home')} initialMode={authMode} pendingPage={pendingPage} notice={authNotice} onNoticeSeen={() => setAuthNotice(null)} />;
      case 'simulation': return <Simulation
        initialParams={pendingParams}
        onParamsUsed={() => setPendingParams(null)}
        realLoad={realLoad}
        onRealLoadUsed={() => setRealLoad(null)}
      />;
      case 'explorer': return <Explorer onLoadRealData={(wd, label, meta) => {
        const isTectonic = meta.sourceType === 'tectonic';
        // Parámetros del FDM equivalentes al evento real. Usa el epicentro real
        // del evento cuando existe; si no, el cráter del Galeras (volcánicos).
        const params: Partial<SimulationParams> = {
          ...defaultParams(),
          sourceType: meta.sourceType ?? 'volcanic',
          magnitude: meta.magnitude ?? 4.5,
          depth: meta.depth ?? (isTectonic ? 15 : 5),
          epicenterLat: meta.lat ?? 1.2216,
          epicenterLon: meta.lon ?? -77.3742,
          duration: Math.min(60, Math.ceil(meta.duration)),
          vp: isTectonic ? 3500 : 3000,
          vs: isTectonic ? 2000 : 1700,
          density: isTectonic ? 2600 : 2500,
        };
        // Onda + params + nonce viajan JUNTOS en un solo objeto. El nonce (único
        // por clic) garantiza recarga aunque sea otra estación del mismo evento.
        // Simulation limpia este objeto tras consumirlo (onRealLoadUsed), así al
        // volver a entrar al simulador NO se relanza nada.
        setRealLoad({ waveData: wd, label, params, nonce: Date.now() });
        setPendingParams(params);
        navigate('simulation');
      }} />;
      case 'education': return <Education />;
      case 'map3d': return <Map3D />;
      case 'reports': return <MyReports />;
      case 'profile': return <Profile onDeleted={handleAccountDeleted} />;
      case 'admin': return user?.role === 'admin' ? <AdminDashboard /> : <Home onNavigate={navigate} />;
      default: return <Home onNavigate={navigate} />;
    }
  };

  const wideZoom = useWideScreenZoom();

  return (
    <div className="min-h-screen flex flex-col relative" style={wideZoom !== 1 ? { zoom: wideZoom } : undefined}>
      <Navbar currentPage={page} onNavigate={navigate} />
      <main className={`flex-1 transition-opacity duration-300 ease-in-out ${transitioning ? 'opacity-0' : 'opacity-100'}`}>
        {renderPage()}
      </main>
      <Footer onNavigate={navigate} />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
