/**
 * Página "Mi perfil de investigador".
 *
 * Vista de lectura por defecto (tarjeta con avatar de iniciales y datos como
 * texto) con modo edición en el sitio, además de secciones de Seguridad,
 * Privacidad y eliminación permanente de la cuenta. Solo esta página.
 */
import { useState } from 'react';
import {
  ShieldCheck, Pencil, Check, X, Lock, Trash2, AlertTriangle, ArrowRight,
  Calendar, Mail, Eye, EyeSlash,
} from '../lib/icons';
import { useAuth, ResearcherSignUp, ROLE_LABELS } from '../lib/auth';
import { ResearcherFields } from '../components/auth/ResearcherFields';
import { PASSWORD_RULES, isPasswordStrong, DATA_POLICY_URL } from '../lib/authConsent';
import { deleteOwnAccount } from '../lib/account';

const C = { terracotta: '#C4553A', forest: '#2D6A4F', ink: '#1A1A2E', cream: '#FAFAF8', muted: '#5A5A5A' };

interface Props {
  /** Se llama tras eliminar la cuenta: la app cierra sesión y va a Inicio. */
  onDeleted: () => void;
}

/** Iniciales (1-2 letras) a partir del nombre o el correo. */
function initials(name: string, email: string): string {
  const base = name.trim() || email;
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

/** Fecha ISO -> "mes de año" en español (p. ej. "marzo de 2026"). */
function monthYear(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

/** Fecha ISO -> "d de mes de año" en español. */
function longDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Un dato del perfil en vista de lectura: etiqueta gris + valor azul noche. */
function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold" style={{ color: C.muted }}>{label}</div>
      <div className="text-sm font-medium mt-0.5" style={{ color: C.ink }}>{value || '—'}</div>
    </div>
  );
}

export function Profile({ onDeleted }: Props) {
  const { user, updateProfile, updatePassword } = useAuth();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ResearcherSignUp>(blankForm());
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);

  // Cambio de contraseña
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // Eliminación de cuenta
  const [delOpen, setDelOpen] = useState(false);
  const [delEmail, setDelEmail] = useState('');
  const [delError, setDelError] = useState('');
  const [deleting, setDeleting] = useState(false);

  function blankForm(): ResearcherSignUp {
    return {
      fullName: user?.full_name ?? '',
      institution: user?.institution ?? '',
      occupation: user?.occupation ?? '',
      researchArea: user?.research_area ?? '',
      city: user?.city ?? '',
      country: user?.country || 'Colombia',
      usagePurpose: user?.usage_purpose ?? '',
    };
  }

  if (!user) return null;

  const set = <K extends keyof ResearcherSignUp>(k: K, v: ResearcherSignUp[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const startEdit = () => { setForm(blankForm()); setError(''); setToast(''); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setError(''); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.fullName.trim()) { setError('Ingresa tu nombre completo.'); return; }
    if (!form.institution.trim()) { setError('Ingresa tu institución.'); return; }
    if (!form.occupation) { setError('Selecciona tu ocupación.'); return; }
    setSaving(true);
    try {
      const err = await updateProfile(form);
      if (err) { setError(err); return; }
      setEditing(false);
      setToast('Perfil actualizado');
      setTimeout(() => setToast(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el perfil. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (!isPasswordStrong(pw)) { setPwError('La contraseña no cumple los requisitos.'); return; }
    setPwSaving(true);
    try {
      const err = await updatePassword(pw);
      if (err === 'EXPIRED') { setPwError('Tu sesión expiró. Vuelve a iniciar sesión para cambiar la contraseña.'); return; }
      if (err) { setPwError(err); return; }
      setPw(''); setPwOpen(false);
      setToast('Contraseña actualizada');
      setTimeout(() => setToast(''), 3000);
    } finally {
      setPwSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDelError('');
    setDeleting(true);
    try {
      const res = await deleteOwnAccount();
      if (!res.ok) { setDelError(res.error ?? 'No se pudo eliminar la cuenta.'); return; }
      // Éxito: la app cierra sesión y lleva a Inicio con el mensaje.
      onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  const isGoogle = user.provider === 'google';
  const pwStrong = isPasswordStrong(pw);

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16">
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── Tarjeta de identidad ── */}
        <div className="bg-white rounded-2xl border border-stone-200/60 p-5 flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black flex-shrink-0"
            style={{ backgroundColor: C.ink, color: C.cream }}
          >
            {initials(user.full_name, user.email)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black truncate" style={{ color: C.ink }}>
              {user.full_name || 'Investigador(a)'}
            </h1>
            <p className="text-sm flex items-center gap-1.5 mt-0.5" style={{ color: C.muted }}>
              <Mail size={13} /> {user.email}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2D6A4F] bg-[#2D6A4F]/10 border border-[#2D6A4F]/20 rounded-full px-2.5 py-1">
                <ShieldCheck size={12} /> {ROLE_LABELS[user.role]}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-stone-400">
                <Calendar size={12} /> Usuaria desde {monthYear(user.created_at)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Datos del perfil (lectura / edición) ── */}
        <div className="bg-white rounded-2xl border border-stone-200/60 p-5 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold" style={{ color: C.ink }}>Datos de investigador</h2>
            {!editing && (
              <button onClick={startEdit}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:border-[#C4553A]/40 hover:text-[#C4553A] transition-colors">
                <Pencil size={13} /> Editar perfil
              </button>
            )}
          </div>

          {editing ? (
            <form onSubmit={save} className="space-y-4">
              <ResearcherFields form={form} onChange={set} />
              {error && <p className="text-red-500 text-xs bg-red-50 rounded-lg p-2 border border-red-100">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={saving}
                  className="flex items-center justify-center gap-2 bg-[#C4553A] text-white px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 btn-hover">
                  {saving ? 'Guardando…' : 'Guardar cambios'} <Check size={15} />
                </button>
                <button type="button" onClick={cancelEdit} disabled={saving}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 text-stone-500 text-sm font-semibold disabled:opacity-50">
                  <X size={15} /> Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              <ReadField label="Institución" value={user.institution} />
              <ReadField label="Ocupación" value={user.occupation} />
              <ReadField label="Área de investigación o interés" value={user.research_area} />
              <ReadField label="Ciudad" value={user.city} />
              <ReadField label="País" value={user.country} />
              <ReadField label="¿Para qué usa la plataforma?" value={user.usage_purpose} />
            </div>
          )}
        </div>

        {/* ── Seguridad + Privacidad (dos columnas) ── */}
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          {/* Seguridad */}
          <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
            <h2 className="text-sm font-bold flex items-center gap-2 mb-3" style={{ color: C.ink }}>
              <Lock size={15} className="text-[#C4553A]" /> Seguridad
            </h2>
            {isGoogle ? (
              <p className="text-sm" style={{ color: C.muted }}>
                Tu cuenta usa Google para iniciar sesión.
              </p>
            ) : !pwOpen ? (
              <button onClick={() => { setPw(''); setPwError(''); setPwOpen(true); }}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-stone-200 text-stone-600 hover:border-[#C4553A]/40 hover:text-[#C4553A] transition-colors">
                <Lock size={13} /> Cambiar contraseña
              </button>
            ) : (
              <form onSubmit={changePassword} className="space-y-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"><Lock size={16} /></span>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={pw}
                    onChange={e => setPw(e.target.value)}
                    placeholder="Nueva contraseña"
                    autoComplete="new-password"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#C4553A] bg-stone-50"
                  />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    title={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    {showPw ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {PASSWORD_RULES.map(rule => {
                    const ok = rule.test(pw);
                    return (
                      <li key={rule.label} className={`flex items-center gap-1.5 text-[11px] ${ok ? 'text-[#2D6A4F]' : 'text-stone-400'}`}>
                        <Check size={11} className={ok ? 'opacity-100' : 'opacity-30'} /> {rule.label}
                      </li>
                    );
                  })}
                </ul>
                {pwError && <p className="text-red-500 text-xs bg-red-50 rounded-lg p-2 border border-red-100">{pwError}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={pwSaving || !pwStrong}
                    className="flex items-center gap-2 bg-[#C4553A] text-white px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 btn-hover">
                    {pwSaving ? 'Guardando…' : 'Guardar contraseña'} <Check size={14} />
                  </button>
                  <button type="button" onClick={() => { setPwOpen(false); setPw(''); setPwError(''); }} disabled={pwSaving}
                    className="px-3 py-2 rounded-xl border border-stone-200 text-stone-500 text-sm font-semibold disabled:opacity-50">
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Privacidad */}
          <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
            <h2 className="text-sm font-bold flex items-center gap-2 mb-3" style={{ color: C.ink }}>
              <ShieldCheck size={15} className="text-[#2D6A4F]" /> Privacidad
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
              Autorizaste el tratamiento de tus datos el <b style={{ color: C.ink }}>{longDate(user.data_authorization_at)}</b>.
            </p>
            <a href={DATA_POLICY_URL} target="_blank" rel="noopener noreferrer"
              className="inline-block text-xs font-semibold text-[#2D6A4F] hover:underline mt-2">
              Política de protección de datos de la Universidad Mariana
            </a>
          </div>
        </div>

        {/* ── Eliminar cuenta (separado, discreto) ── */}
        <div className="mt-8 pt-5 border-t border-stone-200/60 flex justify-center">
          <button onClick={() => { setDelEmail(''); setDelError(''); setDelOpen(true); }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 size={13} /> Eliminar mi cuenta
          </button>
        </div>
      </div>

      {/* Toast de confirmación */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#2D6A4F] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          <Check size={15} /> {toast}
        </div>
      )}

      {/* Diálogo: eliminar cuenta */}
      {delOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A2E]/50 px-4" onClick={() => !deleting && setDelOpen(false)}>
          <div className="bg-white rounded-2xl border border-stone-200/60 shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center mb-3">
              <AlertTriangle size={22} className="text-red-500" />
            </div>
            <h3 className="text-lg font-black" style={{ color: C.ink }}>Eliminar mi cuenta</h3>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: C.muted }}>
              Esta acción es <b style={{ color: C.ink }}>permanente</b> y no se puede deshacer. Se eliminarán:
            </p>
            <ul className="text-sm mt-2 space-y-1 list-disc pl-5" style={{ color: C.muted }}>
              <li>Tu perfil de investigador</li>
              <li>Tus reportes de simulación guardados</li>
            </ul>
            <p className="text-sm mt-3" style={{ color: C.muted }}>
              Para confirmar, escribe tu correo <b style={{ color: C.ink }}>{user.email}</b>:
            </p>
            <input
              type="email"
              value={delEmail}
              onChange={e => setDelEmail(e.target.value)}
              placeholder={user.email}
              autoComplete="off"
              className="w-full mt-2 px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-red-400 bg-stone-50"
            />
            {delError && <p className="text-red-500 text-xs bg-red-50 rounded-lg p-2 border border-red-100 mt-3">{delError}</p>}
            <div className="flex gap-2 mt-4">
              <button
                onClick={confirmDelete}
                disabled={deleting || delEmail.trim().toLowerCase() !== user.email.toLowerCase()}
                className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                {deleting ? 'Eliminando…' : 'Eliminar definitivamente'} <ArrowRight size={15} />
              </button>
              <button onClick={() => setDelOpen(false)} disabled={deleting}
                className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-500 text-sm font-semibold disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
