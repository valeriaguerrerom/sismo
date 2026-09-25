import { Activity, Database, BookOpen, Home, LogIn, Settings, FileText, LogOut, Box, Info, UserPlus } from '../../lib/icons';
import { Logo } from '../ui/Logo';
import { Page } from '../../lib/types';
import { useAuth, ROLE_LABELS } from '../../lib/auth';

interface NavbarProps {
  currentPage: Page;
  onNavigate: (page: Page, opts?: { register?: boolean }) => void;
}

export function Navbar({ currentPage, onNavigate }: NavbarProps) {
  const { user, signOut } = useAuth();

  const publicNav: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Inicio', icon: <Home size={15} /> },
    { id: 'about', label: 'Acerca de', icon: <Info size={15} /> },
  ];

  const moduleNav: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'simulation', label: 'Simulador', icon: <Activity size={15} /> },
    { id: 'explorer', label: 'Explorador', icon: <Database size={15} /> },
    { id: 'map3d', label: 'Mapa 3D', icon: <Box size={15} /> },
    { id: 'education', label: 'Educación', icon: <BookOpen size={15} /> },
  ];

  const mainNav = user ? [publicNav[0], ...moduleNav, publicNav[1]] : publicNav;

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-[#FAFAF8]/90 backdrop-blur-md border-b border-stone-200/60">
      <div className="app-container">
        <div className="flex items-center justify-between h-16">
          <button onClick={() => onNavigate('home')} className="flex items-center">
            <Logo size={38} />
          </button>

          <div className="flex items-center gap-0.5">
            {mainNav.map(item => {
              const active = currentPage === item.id;
              return (
                <button key={item.id} data-tour={`nav-${item.id}`} onClick={() => onNavigate(item.id)} title={item.label}
                  className={`relative flex items-center gap-1.5 px-2.5 lg:px-3.5 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap ${
                    active ? 'text-[#C4553A]' : 'text-stone-500 nav-link'
                  }`}>
                  {item.icon}
                  <span className="hidden md:inline">{item.label}</span>
                  {active && (
                    <span className="absolute left-2.5 right-2.5 lg:left-3.5 lg:right-3.5 -bottom-px h-0.5 rounded-full bg-[#C4553A]" />
                  )}
                </button>
              );
            })}

            <div className="w-px h-6 bg-stone-200 mx-2" />

            {user ? (
              <>
                <button data-tour="nav-reports" onClick={() => onNavigate('reports')} title="Mis reportes"
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium ${
                    currentPage === 'reports' ? 'bg-[#2D6A4F] text-white' : 'text-stone-500'
                  }`}>
                  <FileText size={15} />
                  <span className="hidden md:inline">Reportes</span>
                </button>

                {user.role === 'admin' && (
                  <button onClick={() => onNavigate('admin')} title="Administración"
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium ${
                      currentPage === 'admin' ? 'bg-[#6B5B95] text-white' : 'text-stone-500'
                    }`}>
                    <Settings size={15} />
                    <span className="hidden md:inline">Admin</span>
                  </button>
                )}

                <div data-tour="nav-perfil" className="flex items-center gap-2 ml-1">
                  <button onClick={() => onNavigate('profile')} title="Mi perfil de investigador"
                    className={`flex items-center gap-2 rounded-lg px-1.5 py-1 ${currentPage === 'profile' ? 'bg-[#C4553A]/10' : ''}`}>
                    <div className="hidden lg:block text-right leading-tight">
                      <div className="text-[12px] font-semibold text-[#1A1A2E] max-w-[140px] truncate">{user.full_name || user.email}</div>
                      <div className={`text-[10px] ${user.profileComplete ? 'text-stone-400' : 'text-[#D4A853] font-semibold'}`}>
                        {user.profileComplete ? ROLE_LABELS[user.role] : 'Perfil incompleto'}
                      </div>
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${user.role === 'admin' ? 'bg-[#6B5B95]/10 text-[#6B5B95]' : 'bg-[#C4553A]/10 text-[#C4553A]'}`}
                      title={ROLE_LABELS[user.role]}>
                      {user.full_name?.charAt(0)?.toUpperCase() || user.email.charAt(0).toUpperCase()}
                    </div>
                  </button>
                  <button
                    onClick={signOut}
                    className="group relative text-[#5A5A5A] p-1.5 rounded-lg hover:text-[#C4553A] hover:bg-[#C4553A]/10"
                    title="Cerrar sesión"
                    aria-label="Cerrar sesión"
                  >
                    <LogOut size={15} />
                    {/* Tooltip visible al pasar el cursor (anclado a la derecha para no salirse). */}
                    <span className="pointer-events-none absolute top-full right-0 mt-2 whitespace-nowrap rounded-lg bg-[#1A1A2E] px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 z-50">
                      Cerrar sesión
                    </span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-1">
                <button onClick={() => onNavigate('auth', { register: true })} title="Registrarse"
                  className="nav-link nav-link-forest flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium text-[#2D6A4F]">
                  <UserPlus size={15} />
                  <span className="hidden sm:inline">Registrarse</span>
                </button>
                <button onClick={() => onNavigate('auth')} title="Iniciar sesión"
                  className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium text-[#C4553A] ${currentPage === 'auth' ? '' : 'nav-link'}`}>
                  <LogIn size={15} />
                  <span className="hidden sm:inline">Iniciar sesión</span>
                  {currentPage === 'auth' && (
                    <span className="absolute left-3.5 right-3.5 -bottom-px h-0.5 rounded-full bg-[#C4553A]" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
