/**
 * Pantalla que ve un usuario cuya cuenta está desactivada al intentar entrar.
 *
 * - Si la desactivó él mismo: puede reactivarla con un botón.
 * - Si la desactivó un administrador: no puede reactivarla; se le indica el
 *   correo de contacto del proyecto.
 */
import { useState } from 'react';
import { useAuth } from '../lib/authContext';
import { CONTACT_EMAIL } from '../lib/authConsent';
import { ArrowRight, AlertTriangle, RotateCcw } from '../lib/icons';
import { Logo } from '../components/ui/Logo';

interface Props {
  onHome: () => void;
  /** Tras reactivar, la app deja entrar al usuario. */
  onReactivated: () => void;
}

export function DeactivatedAccount({ onHome, onReactivated }: Props) {
  const { deactivatedInfo, reactivateOwnAccount, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const bySelf = deactivatedInfo?.by === 'usuario';

  const reactivate = async () => {
    setError('');
    setLoading(true);
    const err = await reactivateOwnAccount();
    setLoading(false);
    if (err) { setError(err); return; }
    onReactivated();
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16 flex items-center justify-center px-4 py-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-4">
          <button onClick={onHome} className="inline-flex mx-auto mb-3" aria-label="Ir a Inicio">
            <Logo size={44} />
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#C4553A]/10 flex items-center justify-center mx-auto">
            <AlertTriangle size={24} className="text-[#C4553A]" />
          </div>

          {bySelf ? (
            <>
              <h1 className="text-xl font-black text-[#1A1A2E]">Tu cuenta está desactivada</h1>
              <p className="text-sm text-stone-600 leading-relaxed">
                Desactivaste tu cuenta. Tus datos y simulaciones se conservan. ¿Quieres reactivarla?
              </p>
              {error && <p className="text-red-500 text-xs bg-red-50 rounded-lg p-2 border border-red-100">{error}</p>}
              <button onClick={reactivate} disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-[#2D6A4F] text-white py-3 rounded-xl font-bold text-sm shadow-sm disabled:opacity-50 btn-hover">
                <RotateCcw size={16} /> {loading ? 'Reactivando…' : 'Reactivar mi cuenta'}
              </button>
              <button onClick={signOut} className="text-xs text-stone-400 hover:text-stone-600">
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-black text-[#1A1A2E]">Cuenta desactivada</h1>
              <p className="text-sm text-stone-600 leading-relaxed">
                Tu cuenta fue desactivada por un administrador. Si crees que es un error, escribe a{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#2D6A4F] font-semibold hover:underline">{CONTACT_EMAIL}</a>.
              </p>
              <button onClick={onHome}
                className="w-full flex items-center justify-center gap-2 bg-[#C4553A] text-white py-3 rounded-xl font-bold text-sm shadow-sm btn-hover">
                Volver al inicio <ArrowRight size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
