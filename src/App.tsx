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
import { Profile } from './pages/Profile';

/** Páginas visibles sin sesión. El resto requiere investigador o administrador. */
const PUBLIC_PAGES: Page[] = ['home', 'about', 'auth'];

function AppContent() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<Page>('home');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  /** Página a la que se quería ir antes de pedir sesión. */
  const [pendingPage, setPendingPage] = useState<Page | null>(null);
  const [pendingParams, setPendingParams] = useState<Partial<SimulationParams> | null>(null);
  // Carga de datos reales para el simulador. `nonce` cambia en cada clic de
  // "Cargar en Simulador" para que Simulation re-cargue aunque se elija otra
  // estación del mismo evento (mismos params) — clave para que no se quede
  // pegado en la primera estación.
  const [realLoad, setRealLoad] = useState<{ waveData: WaveData; label: string; params: Partial<SimulationParams>; nonce: number } | null>(null);
  const [transitioning, setTransitioning] = useState(false);

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

    // Control de acceso: módulos solo con sesión (investigador o admin).
    if (!PUBLIC_PAGES.includes(p) && !user) {
      setPendingPage(p);
      setAuthMode(opts?.register ? 'register' : 'login');
      go('auth');
      return;
    }
    if (p === 'admin' && user?.role !== 'admin') return;
    go(p);
  }, [go, user]);

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

  const renderPage = () => {
    // Perfil incompleto (Google o cuentas antiguas): completar antes de usar los módulos.
    if (user && !user.profileComplete && !PUBLIC_PAGES.includes(page)) {
      return <CompleteProfile onDone={() => { /* el perfil recargado re-renderiza la página pedida */ }} />;
    }
    switch (page) {
      case 'home': return <Home onNavigate={navigate} />;
      case 'about': return <About onNavigate={navigate} />;
      case 'auth': return <Auth onSuccess={handleAuthSuccess} initialMode={authMode} pendingPage={pendingPage} />;
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
      case 'profile': return <Profile />;
      case 'admin': return user?.role === 'admin' ? <AdminDashboard /> : <Home onNavigate={navigate} />;
      default: return <Home onNavigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative">
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
