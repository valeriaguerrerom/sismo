/**
 * Inicio de sesión y registro de investigadores (RF-01, RF-02).
 *
 * El registro público siempre crea una cuenta con rol Investigador y captura
 * datos relevantes (institución, ocupación, área de investigación, ciudad,
 * país y propósito de uso). El rol Administrador solo se asigna desde el
 * panel de administración.
 */
import { useEffect, useState } from 'react';
import { useAuth, ResearcherSignUp } from '../lib/auth';
import { Mail, Lock, ArrowRight, ShieldCheck } from '../lib/icons';
import { LogoMark } from '../components/ui/Logo';
import type { Page } from '../lib/types';
import { ResearcherFields, Field, inputCls } from '../components/auth/ResearcherFields';

interface Props {
  onSuccess: () => void;
  initialMode?: 'login' | 'register';
  pendingPage?: Page | null;
}

const PAGE_LABELS: Partial<Record<Page, string>> = {
  simulation: 'el Simulador', explorer: 'el Explorador de registros', map3d: 'el Mapa 3D',
  education: 'el Centro educativo', reports: 'tus reportes',
};

export function Auth({ onSuccess, initialMode = 'login', pendingPage }: Props) {
  const { signIn, signUp, signInWithGoogle, blockedMessage } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [form, setForm] = useState<ResearcherSignUp>({
    fullName: '', institution: '', occupation: '', researchArea: '', city: '', country: 'Colombia', usagePurpose: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => { setMode(initialMode); }, [initialMode]);

  const set = <K extends keyof ResearcherSignUp>(k: K, v: ResearcherSignUp[K]) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (mode === 'login') {
      const err = await signIn(email, password);
      if (err) setError(err);
      else onSuccess();
    } else {
      if (!form.fullName.trim()) { setError('Ingresa tu nombre completo'); setLoading(false); return; }
      if (!form.occupation) { setError('Selecciona tu ocupación'); setLoading(false); return; }
      const err = await signUp(email, password, form);
      if (err) setError(err);
      else setSuccess('¡Cuenta de investigador creada! Revisa tu email para confirmarla y luego inicia sesión.');
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    const err = await signInWithGoogle();
    if (err) {
      setError(err);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16 flex items-center justify-center px-4 py-10">
      <div className={`w-full ${mode === 'register' ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="text-center mb-8">
          <div className="mx-auto mb-4"><LogoMark size={64} /></div>
          <h1 className="text-2xl font-black text-[#1A1A2E]">
            {mode === 'login' ? 'Iniciar Sesión' : 'Registro de Investigador'}
          </h1>
          <p className="text-stone-400 text-sm mt-1">
            {mode === 'login'
              ? 'Accede con tu cuenta de investigador o administrador'
              : 'Crea tu cuenta para usar el simulador, explorar registros reales y cargar tus propios MiniSEED'}
          </p>
          {pendingPage && PAGE_LABELS[pendingPage] && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#2D6A4F] bg-[#2D6A4F]/10 border border-[#2D6A4F]/20 rounded-full px-3 py-1">
              <ShieldCheck size={13} /> Necesitas una sesión activa para entrar a {PAGE_LABELS[pendingPage]}.
            </p>
          )}
        </div>

        {blockedMessage && (
          <div className="mb-4 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{blockedMessage}</div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-6 space-y-4">
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

          {mode === 'register' && <ResearcherFields form={form} onChange={set} />}

          <div className={mode === 'register' ? 'grid sm:grid-cols-2 gap-4' : 'space-y-4'}>
            <Field icon={<Mail size={16} />} label="Email">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" required className={inputCls} />
            </Field>
            <Field icon={<Lock size={16} />} label="Contraseña">
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required minLength={6} className={inputCls} />
            </Field>
          </div>

          {mode === 'register' && (
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Tu cuenta se crea con el rol <b>Investigador</b>: podrás simular, explorar registros, cargar archivos MiniSEED y guardar reportes.
              Los datos se usan únicamente para caracterizar a los usuarios de la plataforma en el marco del trabajo de grado.
            </p>
          )}

          {error && <p className="text-red-500 text-xs bg-red-50 rounded-lg p-2 border border-red-100">{error}</p>}
          {success && <p className="text-green-600 text-xs bg-green-50 rounded-lg p-2 border border-green-100">{success}</p>}

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[#C4553A] text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-[#C4553A]/20 disabled:opacity-50 btn-hover">
            {loading ? 'Procesando...' : mode === 'login' ? 'Iniciar Sesión' : 'Crear cuenta de investigador'}
            <ArrowRight size={16} />
          </button>
        </form>

        <p className="text-center text-sm text-stone-400 mt-4">
          {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess(''); }}
            className="text-[#C4553A] font-semibold">
            {mode === 'login' ? 'Regístrate como investigador' : 'Inicia sesión'}
          </button>
        </p>
      </div>
    </div>
  );
}
