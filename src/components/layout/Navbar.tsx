import { useState, useEffect } from 'react';
import { Activity, Database, BookOpen, Home, LogIn, Settings, FileText, LogOut, Box, Info, UserPlus, List, X } from '../../lib/icons';
import { Logo } from '../ui/Logo';
import { Page } from '../../lib/types';
import { useAuth } from '../../lib/authContext';
import { ROLE_LABELS } from '../../lib/authTypes';

interface NavbarProps {
  currentPage: Page;
  /** Modo activo de la página de autenticación (para marcar el botón correcto). */
  authMode?: 'login' | 'register' | 'forgot';
  onNavigate: (page: Page, opts?: { register?: boolean }) => void;
  /** Modo oscuro (solo para Mapa 3D). */
  darkMode?: boolean;
}

export function Navbar({ currentPage, authMode, onNavigate, darkMode }: NavbarProps) {
  const { user, signOut } = useAuth();
  // Menú desplegable en móvil (bajo el botón hamburguesa).
  const [menuOpen, setMenuOpen] = useState(false);

  // Cerrar el menú móvil al cambiar de página.
  useEffect(() => { setMenuOpen(false); }, [currentPage]);

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

  const go = (page: Page, opts?: { register?: boolean }) => { setMenuOpen(false); onNavigate(page, opts); };

  // En la página de autenticación, distinguir qué botón marcar según el modo
  // (login/registro), ya que ambos comparten la ruta 'auth'.
  const authRegisterActive = currentPage === 'auth' && authMode === 'register';
  const authLoginActive = currentPage === 'auth' && authMode !== 'register';

  return (
    <nav className={`fixed top-0 left-0 right-0 z-40 backdrop-blur-md border-b ${
      darkMode 
        ? 'bg-[#1A1A2E]/95 border-stone-700/60' 
        : 'bg-[#FAFAF8]/90 border-stone-200/60'
    }`}>
      <div className="app-container">
        <div className="flex items-center justify-between h-16 gap-2">
          <button onClick={() => go('home')} className="flex items-center flex-shrink-0">
            <Logo size={38} dark={darkMode} />
          </button>

          {/* ─── Navegación desktop (md+) ─── */}
          <div className="hidden md:flex items-center gap-0.5">
            {mainNav.map(item => {
              const active = currentPage === item.id;
              return (
                <button key={item.id} data-tour={`nav-${item.id}`} onClick={() => onNavigate(item.id)} title={item.label}
                  className={`relative flex items-center gap-1.5 px-2.5 lg:px-3.5 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap ${
                    active 
                      ? darkMode ? 'text-[#D4A853]' : 'text-[#C4553A]'
                      : darkMode ? 'text-stone-300 nav-link-dark' : 'text-stone-500 nav-link'
                  }`}>
                  {item.icon}
                  <span>{item.label}</span>
                  {active && (
                    <span className={`absolute left-2.5 right-2.5 lg:left-3.5 lg:right-3.5 -bottom-px h-0.5 rounded-full ${
                      darkMode ? 'bg-[#D4A853]' : 'bg-[#C4553A]'
                    }`} />
                  )}
                </button>
              );
            })}

            <div className={`w-px h-6 mx-2 ${darkMode ? 'bg-stone-700' : 'bg-stone-200'}`} />

            {user ? (
              <>
                <button data-tour="nav-reports" onClick={() => onNavigate('reports')} title="Mis reportes"
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium ${
                    currentPage === 'reports' 
                      ? 'bg-[#2D6A4F] text-white' 
                      : darkMode ? 'text-stone-300' : 'text-stone-500'
                  }`}>
                  <FileText size={15} />
                  <span className="hidden lg:inline">Reportes</span>
                </button>

                {user.role === 'admin' && (
                  <button onClick={() => onNavigate('admin')} title="Administración"
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium ${
                      currentPage === 'admin' 
                        ? 'bg-[#1A1A2E] text-white' 
                        : darkMode ? 'text-stone-300' : 'text-stone-500'
                    }`}>
                    <Settings size={15} />
                    <span className="hidden lg:inline">Admin</span>
                  </button>
                )}

                <div data-tour="nav-perfil" className="flex items-center gap-2 ml-1">
                  <button onClick={() => onNavigate('profile')} title="Mi perfil de investigador"
                    className={`flex items-center gap-2 rounded-lg px-1.5 py-1 ${currentPage === 'profile' ? 'bg-[#C4553A]/10' : ''}`}>
                    <div className="hidden lg:block text-right leading-tight">
                      <div className={`text-[12px] font-semibold max-w-[140px] truncate ${darkMode ? 'text-stone-100' : 'text-[#1A1A2E]'}`}>{user.full_name || user.email}</div>
                      <div className={`text-[10px] ${user.profileComplete ? (darkMode ? 'text-stone-400' : 'text-stone-400') : 'text-[#D4A853] font-semibold'}`}>
                        {user.profileComplete ? ROLE_LABELS[user.role] : 'Perfil incompleto'}
                      </div>
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${user.role === 'admin' ? 'bg-[#1A1A2E]/10 text-[#1A1A2E]' : 'bg-[#C4553A]/10 text-[#C4553A]'}`}
                      title={ROLE_LABELS[user.role]}>
                      {user.full_name?.charAt(0)?.toUpperCase() || user.email.charAt(0).toUpperCase()}
                    </div>
                  </button>
                  <button
                    onClick={signOut}
                    className={`group relative p-1.5 rounded-lg ${
                      darkMode 
                        ? 'text-stone-400 hover:text-[#D4A853] hover:bg-[#D4A853]/10' 
                        : 'text-[#5A5A5A] hover:text-[#C4553A] hover:bg-[#C4553A]/10'
                    }`}
                    title="Cerrar sesión"
                    aria-label="Cerrar sesión"
                  >
                    <LogOut size={15} />
                    <span className="pointer-events-none absolute top-full right-0 mt-2 whitespace-nowrap rounded-lg bg-[#1A1A2E] px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 z-50">
                      Cerrar sesión
                    </span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-1">
                <button onClick={() => onNavigate('auth', { register: true })} title="Registrarse"
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium ${authRegisterActive ? 'text-[#C4553A]' : 'text-[#2D6A4F] nav-link'}`}>
                  <UserPlus size={15} />
                  <span>Registrarse</span>
                  {authRegisterActive && (
                    <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-[#C4553A]" />
                  )}
                </button>
                <button onClick={() => onNavigate('auth')} title="Iniciar sesión"
                  className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium text-[#C4553A] ${authLoginActive ? '' : 'nav-link'}`}>
                  <LogIn size={15} />
                  <span>Iniciar sesión</span>
                  {authLoginActive && (
                    <span className="absolute left-3.5 right-3.5 -bottom-px h-0.5 rounded-full bg-[#C4553A]" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* ─── Botón hamburguesa (solo móvil, <md) ─── */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className={`md:hidden flex items-center justify-center w-10 h-10 rounded-lg ${
              darkMode 
                ? 'text-stone-300 hover:bg-stone-700' 
                : 'text-stone-600 hover:bg-stone-100'
            }`}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <List size={22} />}
          </button>
        </div>
      </div>

      {/* ─── Menú desplegable móvil ─── */}
      {menuOpen && (
        <div className={`md:hidden border-t ${
          darkMode 
            ? 'bg-[#1A1A2E] border-stone-700/60' 
            : 'bg-[#FAFAF8] border-stone-200/60'
        }`}>
          <div className="app-container py-3 flex flex-col gap-1">
            {mainNav.map(item => {
              const active = currentPage === item.id;
              return (
                <button key={item.id} onClick={() => go(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left ${
                    active ? 'bg-[#C4553A]/10 text-[#C4553A]' : 'text-stone-600 hover:bg-stone-100'
                  }`}>
                  {item.icon} {item.label}
                </button>
              );
            })}

            <div className="h-px bg-stone-200 my-1.5" />

            {user ? (
              <>
                <button onClick={() => go('reports')}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left ${
                    currentPage === 'reports' ? 'bg-[#2D6A4F]/10 text-[#2D6A4F]' : 'text-stone-600 hover:bg-stone-100'
                  }`}>
                  <FileText size={15} /> Reportes
                </button>
                {user.role === 'admin' && (
                  <button onClick={() => go('admin')}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left ${
                      currentPage === 'admin' ? 'bg-[#1A1A2E]/10 text-[#1A1A2E]' : 'text-stone-600 hover:bg-stone-100'
                    }`}>
                    <Settings size={15} /> Admin
                  </button>
                )}
                <button onClick={() => go('profile')}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left ${
                    currentPage === 'profile' ? 'bg-[#C4553A]/10 text-[#C4553A]' : 'text-stone-600 hover:bg-stone-100'
                  }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${user.role === 'admin' ? 'bg-[#1A1A2E]/10 text-[#1A1A2E]' : 'bg-[#C4553A]/10 text-[#C4553A]'}`}>
                    {user.full_name?.charAt(0)?.toUpperCase() || user.email.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate min-w-0">{user.full_name || user.email}</span>
                </button>
                <button onClick={() => { setMenuOpen(false); signOut(); }}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left text-stone-600 hover:bg-[#C4553A]/10 hover:text-[#C4553A]">
                  <LogOut size={15} /> Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <button onClick={() => go('auth', { register: true })}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left text-[#2D6A4F] hover:bg-[#2D6A4F]/10">
                  <UserPlus size={15} /> Registrarse
                </button>
                <button onClick={() => go('auth')}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left text-[#C4553A] hover:bg-[#C4553A]/10">
                  <LogIn size={15} /> Iniciar sesión
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
