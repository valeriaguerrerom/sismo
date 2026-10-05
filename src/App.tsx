import { useState, useCallback, useEffect, useRef } from 'react';
import { Page, SimulationParams, WaveData } from './lib/types';
import { defaultParams } from './lib/simulation';
import { AuthProvider } from './lib/auth';
import { useAuth } from './lib/authContext';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { VolcanoLoader } from './components/ui/VolcanoLoader';
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
import { DeactivatedAccount } from './pages/DeactivatedAccount';
import { Profile } from './pages/Profile';

/** Páginas visibles sin sesión. El resto requiere investigador o administrador. */
const PUBLIC_PAGES: Page[] = ['home', 'about', 'auth'];

/**
 * Escala global ("zoom") para monitores anchos de alta resolución.
 *
 * Ajuste fino del zoom según la escala del sistema operativo (reflejada en
 * `window.devicePixelRatio`), calibrado para que la composición se vea como en
 * la portátil de referencia de ~15" al 100%:
 *   · 100% (dpr 1.0)  → zoom 1.00  (referencia).
 *   · 125% (dpr 1.25) → zoom 0.92  (reduce un poco: evita que se corte la
 *                                    tarjeta "Nariño en contexto").
 *   · 150% (dpr 1.5)  → zoom 1.35  (agranda bastante: al 150% el contenido se
 *                                    veía muy pequeño y dejaba un gran vacío).
 * Para valores intermedios se interpola; fuera de rango se mantiene en los topes.
 */
function useWideScreenZoom(): number {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    // Puntos de calibración (dpr → zoom) ordenados por dpr.
    const POINTS: [number, number][] = [
      [1.0, 1.0],
      [1.25, 0.92],
      [1.5, 1.35],
    ];
    const zoomForDpr = (dpr: number): number => {
      if (dpr <= POINTS[0][0]) return POINTS[0][1];
      if (dpr >= POINTS[POINTS.length - 1][0]) return POINTS[POINTS.length - 1][1];
      for (let i = 0; i < POINTS.length - 1; i++) {
        const [d0, z0] = POINTS[i];
        const [d1, z1] = POINTS[i + 1];
        if (dpr >= d0 && dpr <= d1) {
          const t = (dpr - d0) / (d1 - d0);
          return z0 + t * (z1 - z0);
        }
      }
      return 1;
    };
    const compute = () => setZoom(zoomForDpr(window.devicePixelRatio || 1));
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);
  return zoom;
}

function AppContent() {
  const { user, loading, recoveryMode, deactivatedInfo, signOut } = useAuth();
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
  // Carga de un MiniSEED subido hacia el Mapa 3D (traza + estación real). El
  // `nonce` fuerza que Map3D lo reconsuma en cada clic de "Ver en Mapa 3D".
  const [mseed3dLoad, setMseed3dLoad] = useState<{ waveData: WaveData; station: string; filename: string; sourceType: 'tectonic' | 'volcanic'; nonce: number } | null>(null);
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

  // Enlace de confirmación de correo: Supabase redirige a la app con `type=signup`
  // (en el hash o en la query). Lo detectamos UNA vez al cargar para mostrar
  // "¡Correo confirmado!" en Iniciar sesión y limpiar la URL. Si el enlace trae
  // error (p. ej. expirado), lo mostramos como aviso en su lugar.
  const confirmHandled = useRef(false);
  useEffect(() => {
    if (confirmHandled.current) return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    const type = hash.get('type') ?? query.get('type');
    const errorDesc = hash.get('error_description') ?? query.get('error_description');

    if (type === 'signup' || type === 'email_change' || errorDesc) {
      confirmHandled.current = true;
      if (errorDesc) {
        const expired = /expired|invalid/i.test(errorDesc);
        setAuthNotice(expired
          ? 'El enlace de confirmación expiró o ya se usó. Inicia sesión; si hace falta, te reenviaremos uno nuevo.'
          : 'No se pudo confirmar el correo con ese enlace. Intenta iniciar sesión.');
      } else {
        setAuthNotice('¡Correo confirmado! Ya puedes iniciar sesión con tu correo y contraseña.');
      }
      setAuthMode('login');
      setPage('auth');
      // Quita los tokens/params de la URL para que no reaparezca el aviso al refrescar.
      window.history.replaceState(null, '', window.location.origin + window.location.pathname);
    }
  }, []);

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

  // Tras desactivar la cuenta: cerrar sesión, ir a Inicio y avisar.
  const handleAccountDeactivated = useCallback(async () => {
    setHomeNotice('Tu cuenta fue desactivada');
    go('home');
    await signOut();
  }, [go, signOut]);

  const renderPage = () => {
    // Enlace de recuperación de contraseña: pantalla "Nueva contraseña" con
    // prioridad sobre todo lo demás (la sesión de recuperación es temporal).
    if (recoveryMode) {
      return <ResetPassword
        onHome={() => navigate('home')}
        onDone={(msg) => { setAuthNotice(msg); setAuthMode('login'); setPage('auth'); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }}
        onRequestNew={() => { setAuthMode('forgot'); go('auth'); }}
      />;
    }
    // Cuenta desactivada: pantalla con prioridad. El usuario no entra a la
    // plataforma; puede reactivar (si la desactivó él) o ver el contacto.
    if (deactivatedInfo) {
      return <DeactivatedAccount
        onHome={() => { setPage('home'); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }}
        onReactivated={() => { setPage('home'); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }}
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
      }} onLoadMseedToMap3d={(wd, meta) => {
        setMseed3dLoad({ waveData: wd, station: meta.station, filename: meta.filename, sourceType: meta.sourceType, nonce: Date.now() });
        navigate('map3d');
      }} />;
      case 'education': return <Education onNavigate={navigate} />;
      case 'map3d': return <Map3D mseedLoad={mseed3dLoad} onMseedLoadUsed={() => setMseed3dLoad(null)} />;
      case 'reports': return <MyReports onNavigate={navigate} />;
      case 'profile': return <Profile onDeleted={handleAccountDeleted} onDeactivated={handleAccountDeactivated} />;
      case 'admin': return user?.role === 'admin' ? <AdminDashboard /> : <Home onNavigate={navigate} />;
      default: return <Home onNavigate={navigate} />;
    }
  };

  const wideZoom = useWideScreenZoom();

  // Mientras se resuelve la sesión (recarga/token) no pintamos la barra ni la
  // página: así no se ve por un instante el estado "sin sesión" (navbar público)
  // antes de que llegue el usuario. Se muestra un loader breve y neutro.
  if (loading) {
    return <VolcanoLoader fullscreen />;
  }

  return (
    <div
      className="flex flex-col relative"
      style={
        wideZoom !== 1
          // Con zoom, `100vh` se agranda por el factor de zoom y deja un hueco
          // enorme antes del footer en pantallas grandes. Dividimos la altura
          // mínima por el zoom para que el layout ocupe exactamente una pantalla
          // física.
          ? { zoom: wideZoom, minHeight: `calc(100vh / ${wideZoom})` }
          : { minHeight: '100vh' }
      }
    >
      <Navbar currentPage={page} authMode={authMode} onNavigate={navigate} darkMode={page === 'map3d'} />
      {/* `main` ocupa AL MENOS una pantalla física completa (compensando el zoom
          de pantallas anchas): así el contenido de cada página llena el alto
          visible y el footer queda SIEMPRE por debajo del pliegue, visible solo
          al hacer scroll. Sin esto, la altura mínima del contenedor incluía al
          footer y este asomaba al pie del simulador. */}
      <main
        className={`flex-1 flex flex-col transition-opacity duration-300 ease-in-out ${transitioning ? 'opacity-0' : 'opacity-100'}`}
        style={{ minHeight: wideZoom !== 1 ? `calc(100vh / ${wideZoom})` : '100vh' }}
      >
        {renderPage()}
      </main>
      <Footer onNavigate={navigate} dark={page === 'map3d'} />
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
