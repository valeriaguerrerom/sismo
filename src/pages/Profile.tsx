/**
 * Página "Mi perfil de investigador".
 *
 * Permite a cualquier usuario con sesión ver y editar los datos de su perfil
 * (los mismos campos del registro). A diferencia de CompleteProfile, esta
 * página es accesible en cualquier momento desde el menú, tenga el perfil
 * completo o no.
 */
import { useState } from 'react';
import { ClipboardList, ArrowRight, ShieldCheck, LogOut } from '../lib/icons';
import { useAuth, ResearcherSignUp, ROLE_LABELS } from '../lib/auth';
import { ResearcherFields } from '../components/auth/ResearcherFields';

export function Profile() {
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
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ResearcherSignUp>(k: K, v: ResearcherSignUp[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOk(false);
    if (!form.fullName.trim()) { setError('Ingresa tu nombre completo'); return; }
    if (!form.occupation) { setError('Selecciona tu ocupación'); return; }
    setSaving(true);
    try {
      const err = await updateProfile(form);
      if (err) setError(err);
      else setOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el perfil. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#2D6A4F] flex items-center justify-center mx-auto mb-4">
            <ClipboardList size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-[#1A1A2E]">Mi perfil de investigador</h1>
          <p className="text-stone-400 text-sm mt-1">
            Cuenta <b>{user.email}</b>
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#2D6A4F] bg-[#2D6A4F]/10 border border-[#2D6A4F]/20 rounded-full px-3 py-1">
            <ShieldCheck size={13} /> {ROLE_LABELS[user.role]}
          </p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-6 space-y-4">
          <ResearcherFields form={form} onChange={set} />

          <p className="text-[11px] text-stone-400 leading-relaxed">
            Los datos se usan únicamente para caracterizar a los usuarios de la plataforma en el marco del trabajo de grado.
          </p>

          {error && <p className="text-red-500 text-xs bg-red-50 rounded-lg p-2 border border-red-100">{error}</p>}
          {ok && <p className="text-[#2D6A4F] text-xs bg-[#2D6A4F]/10 rounded-lg p-2 border border-[#2D6A4F]/20">Perfil actualizado correctamente.</p>}

          <div className="flex flex-col sm:flex-row gap-2">
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-[#2D6A4F] text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-[#2D6A4F]/20 disabled:opacity-50 btn-hover">
              {saving ? 'Guardando…' : 'Guardar cambios'} <ArrowRight size={16} />
            </button>
            <button type="button" onClick={signOut}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-stone-200 text-stone-500 text-sm font-semibold">
              <LogOut size={15} /> Cerrar sesión
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
