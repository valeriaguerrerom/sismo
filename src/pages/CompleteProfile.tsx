/**
 * Paso obligatorio "Completar perfil de investigador".
 *
 * Se muestra a cualquier usuario con sesión cuyo perfil no tenga institución
 * y ocupación: cuentas creadas con Google (que solo aporta nombre y correo) o
 * registradas antes de que existieran estos campos. Hasta guardarlo no se
 * puede entrar a los módulos.
 */
import { useState } from 'react';
import { ClipboardList, ArrowRight, ShieldCheck } from '../lib/icons';
import { useAuth, ResearcherSignUp } from '../lib/auth';
import { ResearcherFields } from '../components/auth/ResearcherFields';
import { ConsentCheckbox } from '../components/auth/ConsentCheckbox';

interface Props {
  onDone: () => void;
}

export function CompleteProfile({ onDone }: Props) {
  const { user, updateProfile, signOut } = useAuth();
  const [form, setForm] = useState<ResearcherSignUp>({
    fullName: user?.full_name ?? '',
    institution: user?.institution ?? '',
    occupation: user?.occupation ?? '',
    researchArea: user?.research_area ?? '',
    city: user?.city ?? '',
    country: user?.country || 'Colombia',
    usagePurpose: user?.usage_purpose ?? '',
  });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ResearcherSignUp>(k: K, v: ResearcherSignUp[K]) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.fullName.trim()) { setError('Ingresa tu nombre completo'); return; }
    if (!form.occupation) { setError('Selecciona tu ocupación'); return; }
    if (!consent) { setError('Debes autorizar el tratamiento de tus datos para continuar.'); return; }
    setSaving(true);
    try {
      // recordConsent=true: guarda la fecha de autorización (cuentas de Google).
      const err = await updateProfile(form, true);
      if (err) setError(err);
      else onDone();
    } catch (e) {
      // Red de seguridad: cualquier excepción no controlada muestra un mensaje
      // en vez de dejar el botón colgado en "Guardando…".
      setError(e instanceof Error ? e.message : 'No se pudo guardar el perfil. Inténtalo de nuevo.');
    } finally {
      // El estado de "guardando" SIEMPRE se libera, resuelva o falle updateProfile.
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16 flex items-center justify-center px-4 py-5">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-4">
          <div className="w-11 h-11 rounded-2xl bg-[#2D6A4F] flex items-center justify-center mx-auto mb-2">
            <ClipboardList size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-[#1A1A2E]">Completa tu perfil de investigador</h1>
          <p className="text-stone-400 text-sm mt-1">
            Hola{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}. Tu cuenta <b>{user?.email}</b> ya está creada;
            completa estos datos una sola vez para habilitar los módulos.
            <span className="inline-flex items-center gap-1 ml-1 text-[#2D6A4F] font-semibold">
              <ShieldCheck size={12} /> Paso obligatorio.
            </span>
          </p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-5 space-y-3">
          <ResearcherFields form={form} onChange={set} />

          <ConsentCheckbox checked={consent} onChange={setConsent} />

          {error && <p className="text-red-500 text-xs bg-red-50 rounded-lg p-2 border border-red-100">{error}</p>}

          <div className="flex flex-col sm:flex-row gap-2">
            <button type="submit" disabled={saving || !consent}
              className="flex-1 flex items-center justify-center gap-2 bg-[#2D6A4F] text-white py-3 rounded-xl font-bold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed btn-hover">
              {saving ? 'Guardando…' : 'Guardar y continuar'} <ArrowRight size={16} />
            </button>
            <button type="button" onClick={signOut} className="px-4 py-3 rounded-xl border border-stone-200 text-stone-500 text-sm font-semibold">
              Cerrar sesión
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
