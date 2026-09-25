/**
 * Inicio de sesión, registro y recuperación de contraseña (RF-01, RF-02).
 *
 * Registro en dos pasos: aquí se crea la cuenta (nombre, correo, contraseña y
 * autorización de datos). El resto del perfil de investigador se completa
 * después en "Completa tu perfil de investigador" (la misma pantalla que usa
 * el flujo de Google). El rol Administrador solo se asigna desde el panel.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { Mail, User, ArrowRight, ShieldCheck, Check } from '../lib/icons';
import { Logo } from '../components/ui/Logo';
import { Field, inputCls } from '../components/auth/ResearcherFields';
import { PasswordField } from '../components/auth/PasswordField';
import { ConsentCheckbox } from '../components/auth/ConsentCheckbox';
import { PASSWORD_RULES, isPasswordStrong } from '../lib/authConsent';
import type { Page } from '../lib/types';

type Mode = 'login' | 'register' | 'forgot';

interface Props {
  onSuccess: () => void;
  onHome: () => void;
  initialMode?: Mode;
  pendingPage?: Page | null;
  /** Aviso a mostrar en Iniciar sesión (p. ej. tras actualizar la contraseña). */
  notice?: string | null;
  onNoticeSeen?: () => void;
}

const PAGE_LABELS: Partial<Record<Page, string>> = {
  simulation: 'el Simulador', explorer: 'el Explorador de registros', map3d: 'el Mapa 3D',
  education: 'el Centro educativo', reports: 'tus reportes',
};

export function Auth({ onSuccess, onHome, initialMode = 'login', pendingPage, notice, onNoticeSeen }: Props) {
  const { signIn, signUp, signInWithGoogle, sendPasswordReset, blockedMessage } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  // Aviso de un solo uso (p. ej. "Tu contraseña se actualizó"): se copia a
  // estado local, se limpia del estado global de inmediato y se auto-oculta,
  // para que NO reaparezca al cerrar sesión o volver a esta pantalla.
  const [localNotice, setLocalNotice] = useState<string | null>(null);

  useEffect(() => { setMode(initialMode); }, [initialMode]);

  useEffect(() => {
    if (!notice) return;
    setLocalNotice(notice);
    onNoticeSeen?.();
    const t = setTimeout(() => setLocalNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice, onNoticeSeen]);

  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  const strong = isPasswordStrong(password);
  const canRegister = Boolean(fullName.trim()) && Boolean(email.trim()) && strong && consent;

  const go = (m: Mode) => { setMode(m); setError(''); setSuccess(''); setLocalNotice(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (mode === 'login') {
      const err = await signIn(email, password);
      if (err) setError(err);
      else onSuccess();
    } else if (mode === 'forgot') {
      await sendPasswordReset(email);
      // Mensaje neutro SIEMPRE, exista o no el correo (no se revelan cuentas).
      setSuccess('Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.');
    } else {
      const err = await signUp(email, password, fullName);
      if (err) setError(err);
      else {
        // Cuenta creada: llevar al usuario a la pantalla de inicio de sesión
        // (sin paso de confirmación por correo).
        setMode('login');
        setPassword('');
        setSuccess('¡Cuenta creada! Inicia sesión para completar tu perfil de investigador.');
      }
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    const err = await signInWithGoogle();
    if (err) { setError(err); setLoading(false); }
  };

  const title = isRegister ? 'Registrarse' : isForgot ? 'Recuperar contraseña' : 'Iniciar sesión';
  const subtitle = isRegister
    ? 'Crea tu cuenta; después completarás tu perfil de investigador'
    : isForgot
      ? 'Te enviaremos un enlace a tu correo para restablecerla'
      : 'Accede con tu cuenta de investigador o administrador';

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16 flex items-center justify-center px-4 py-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-4">
          {/* Logo centrado, clic lleva a Inicio. */}
          <button onClick={onHome} className="inline-flex mx-auto mb-3" aria-label="Ir a Inicio">
            <Logo size={44} />
          </button>
          <h1 className="text-2xl font-black text-[#1A1A2E]">{title}</h1>
          <p className="text-stone-400 text-sm mt-1">{subtitle}</p>
          {pendingPage && PAGE_LABELS[pendingPage] && !isForgot && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#2D6A4F] bg-[#2D6A4F]/10 border border-[#2D6A4F]/20 rounded-full px-3 py-1">
              <ShieldCheck size={13} /> Necesitas una sesión activa para entrar a {PAGE_LABELS[pendingPage]}.
            </p>
          )}
        </div>

        {localNotice && mode === 'login' && (
          <div className="mb-4 text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl p-3">{localNotice}</div>
        )}


        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-5 space-y-3">
          {!isForgot && (
            <>
              <button type="button" onClick={handleGoogle} disabled={loading}
                className="w-full flex items-center justify-center gap-3 border border-stone-200 bg-white text-[#1A1A2E] py-2.5 rounded-xl font-semibold text-sm hover:bg-stone-50 disabled:opacity-50 btn-hover">
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" />
                  <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.169.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z" />
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58Z" />
                </svg>
                Continuar con Google
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-stone-200" />
                <span className="text-xs text-stone-400">o</span>
                <div className="flex-1 h-px bg-stone-200" />
              </div>
            </>
          )}

          {isRegister && (
            <Field icon={<User size={16} />} label="Nombre completo">
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nombre y apellidos" required autoComplete="name" className={inputCls} />
            </Field>
          )}

          <Field icon={<Mail size={16} />} label="Correo electrónico">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" required autoComplete="email" className={inputCls} />
          </Field>

          {!isForgot && (
            <PasswordField
              value={password}
              onChange={setPassword}
              placeholder={isRegister ? 'Crea una contraseña segura' : 'Tu contraseña'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          )}

          {/* Enlace de recuperación bajo el campo de contraseña (solo login). */}
          {mode === 'login' && (
            <div className="text-right -mt-1">
              <button type="button" onClick={() => go('forgot')} className="text-xs text-[#C4553A] font-semibold hover:underline">
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          {isRegister && (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
              {PASSWORD_RULES.map(rule => {
                const ok = rule.test(password);
                return (
                  <li key={rule.label} className="flex items-center gap-1.5 text-[12px]" style={{ color: ok ? '#2D6A4F' : '#8A8A8A' }}>
                    <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: ok ? '#2D6A4F' : 'transparent', border: ok ? 'none' : '1px solid #D6D3D1' }}>
                      {ok && <Check size={10} className="text-white" />}
                    </span>
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          )}

          {isRegister && <ConsentCheckbox checked={consent} onChange={setConsent} />}

          {blockedMessage && !error && <p className="text-red-600 text-xs bg-red-50 rounded-lg p-2 border border-red-100">{blockedMessage}</p>}
          {error && <p className="text-red-500 text-xs bg-red-50 rounded-lg p-2 border border-red-100">{error}</p>}
          {success && <p className="text-green-600 text-xs bg-green-50 rounded-lg p-2 border border-green-100">{success}</p>}

          {/* En "forgot", tras enviar, ocultamos el botón y ofrecemos volver. */}
          {!(isForgot && success) && (
            <button type="submit" disabled={loading || (isRegister && !canRegister)}
              className="w-full flex items-center justify-center gap-2 bg-[#C4553A] text-white py-3 rounded-xl font-bold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed btn-hover">
              {loading ? 'Procesando...' : isRegister ? 'Registrarse' : isForgot ? 'Enviar enlace' : 'Iniciar sesión'}
              <ArrowRight size={16} />
            </button>
          )}
        </form>

        <p className="text-center text-sm text-stone-400 mt-3">
          {isForgot ? (
            <button onClick={() => go('login')} className="text-[#C4553A] font-semibold">Volver a Iniciar sesión</button>
          ) : (
            <>
              {isRegister ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
              <button onClick={() => go(isRegister ? 'login' : 'register')} className="text-[#C4553A] font-semibold">
                {isRegister ? 'Iniciar sesión' : 'Registrarse'}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
