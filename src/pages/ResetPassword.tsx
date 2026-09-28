/**
 * Pantalla "Nueva contraseña": destino del enlace de recuperación enviado por
 * correo. Supabase abre una sesión temporal de recuperación (evento
 * PASSWORD_RECOVERY); aquí el usuario fija su nueva contraseña con los mismos
 * requisitos de seguridad del registro. Si el enlace venció o ya se usó, se
 * muestra un aviso claro y un botón para pedir uno nuevo.
 */
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { ArrowRight, Check, AlertTriangle } from '../lib/icons';
import { AuthLayout } from '../components/auth/AuthLayout';
import { PasswordField } from '../components/auth/PasswordField';
import { PASSWORD_RULES, isPasswordStrong } from '../lib/authConsent';

interface Props {
  /** Al terminar (o al pedir un enlace nuevo) vuelve a Iniciar sesión con un mensaje. */
  onDone: (message: string) => void;
  /** Ir directo a "Recuperar contraseña" para pedir un enlace nuevo. */
  onRequestNew: () => void;
  onHome: () => void;
}

export function ResetPassword({ onDone, onRequestNew, onHome }: Props) {
  const { updatePassword, clearRecovery, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  const strong = isPasswordStrong(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const err = await updatePassword(password);
    if (err === 'EXPIRED') { setLoading(false); setExpired(true); return; }
    if (err) { setLoading(false); setError(err); return; }
    // Primero llevamos la app al login (fija page='auth' de forma síncrona) y
    // LUEGO cerramos la sesión de recuperación. Así, cuando recoveryMode pase a
    // false, la página ya es 'auth' y no se alcanza a ver ningún panel.
    setLoading(false);
    onDone('Tu contraseña se actualizó. Ya puedes iniciar sesión.');
    // Cerrar la sesión temporal de recuperación para obligar a iniciar sesión
    // con la nueva contraseña (si no, se quedaba con acceso sin volver a entrar).
    await signOut();
  };

  const requestNew = () => { clearRecovery(); onRequestNew(); };

  return (
    <AuthLayout title="Nueva contraseña" subtitle="Elige una contraseña segura para tu cuenta" onHome={onHome}>
        {expired ? (
          <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#C4553A]/10 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} className="text-[#C4553A]" />
            </div>
            <p className="text-sm text-stone-600 leading-relaxed">
              El enlace de recuperación venció o ya se usó. Solicita uno nuevo para restablecer tu contraseña.
            </p>
            <button onClick={requestNew}
              className="w-full flex items-center justify-center gap-2 bg-[#C4553A] text-white py-3 rounded-xl font-bold text-sm shadow-sm btn-hover">
              Solicitar un enlace nuevo <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-5 space-y-3">
            <PasswordField
              value={password}
              onChange={setPassword}
              placeholder="Crea una contraseña segura"
              autoComplete="new-password"
            />

            <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {PASSWORD_RULES.map(rule => {
                const ok = rule.test(password);
                return (
                  <li key={rule.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: ok ? '#2D6A4F' : '#8A8A8A' }}>
                    <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: ok ? '#2D6A4F' : 'transparent', border: ok ? 'none' : '1px solid #D6D3D1' }}>
                      {ok && <Check size={10} className="text-white" />}
                    </span>
                    {rule.label}
                  </li>
                );
              })}
            </ul>

            {error && <p className="text-red-500 text-xs bg-red-50 rounded-lg p-2 border border-red-100">{error}</p>}

            {(() => {
              const disabled = loading || !strong;
              return (
                <div>
                  <button type="submit" disabled={disabled}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm shadow-sm btn-hover ${
                      disabled ? 'bg-stone-200 text-stone-500 cursor-not-allowed' : 'bg-[#2D6A4F] text-white'
                    }`}>
                    {loading ? 'Guardando…' : 'Guardar contraseña'} <ArrowRight size={16} />
                  </button>
                  {!loading && !strong && (
                    <p className="text-[11px] text-stone-500 mt-1.5 text-center">Completa los requisitos de la contraseña</p>
                  )}
                </div>
              );
            })()}
          </form>
        )}
    </AuthLayout>
  );
}
