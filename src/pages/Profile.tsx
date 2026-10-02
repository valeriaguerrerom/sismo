/**
 * Página "Mi perfil de investigador".
 *
 * Vista de lectura por defecto (tarjeta con avatar de iniciales y datos como
 * texto) con modo edición en el sitio, además de secciones de Seguridad,
 * Privacidad y eliminación permanente de la cuenta. Solo esta página.
 */
import { useRef, useState } from 'react';
import {
  ShieldCheck, Pencil, Check, X, Lock, Trash2, AlertTriangle, ArrowRight,
  Calendar, Mail, Eye, EyeSlash, UserX, Image as ImageIcon,
} from '../lib/icons';
import { useAuth } from '../lib/authContext';
import { ROLE_LABELS } from '../lib/authTypes';
import type { ResearcherSignUp } from '../lib/authTypes';
import { ResearcherFields } from '../components/auth/ResearcherFields';
import { PASSWORD_RULES, isPasswordStrong, DATA_POLICY_URL } from '../lib/authConsent';
import { deleteOwnAccount } from '../lib/account';

const C = { terracotta: '#C4553A', forest: '#2D6A4F', ink: '#1A1A2E', cream: '#FAFAF8', muted: '#5A5A5A' };

interface Props {
  /** Se llama tras eliminar la cuenta: la app cierra sesión y va a Inicio. */
  onDeleted: () => void;
  /** Se llama tras desactivar la cuenta: la app cierra sesión y va a Inicio. */
  onDeactivated: () => void;
}

/** Iniciales (1-2 letras) a partir del nombre o el correo. */
function initials(name: string, email: string): string {
  const base = name.trim() || email;
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

/**
 * Lee un archivo de imagen y lo convierte en un data URL JPEG cuadrado de
 * `size` px (recorte centrado). Mantiene la foto ligera para guardarla como
 * texto en la columna `avatar` de `profiles` sin usar Supabase Storage.
 */
function fileToAvatarDataUrl(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('No se pudo procesar la imagen.')); return; }
        // Recorte centrado al cuadrado más grande posible.
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
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

export function Profile({ onDeleted, onDeactivated }: Props) {
  const { user, updateProfile, updateAvatar, updatePassword, deactivateOwnAccount } = useAuth();

  // Foto de perfil
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ResearcherSignUp>(blankForm());
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);

  // Cambio de contraseña
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState(''); // contraseña actual (verificación)
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // Desactivación de cuenta
  const [deacOpen, setDeacOpen] = useState(false);
  const [deacBusy, setDeacBusy] = useState(false);
  const [deacError, setDeacError] = useState('');

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
      city: user?.city || 'Pasto',
      country: user?.country || 'Colombia',
      usagePurpose: user?.usage_purpose ?? '',
    };
  }

  if (!user) return null;

  const set = <K extends keyof ResearcherSignUp>(k: K, v: ResearcherSignUp[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const startEdit = () => { setForm(blankForm()); setError(''); setToast(''); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setError(''); };

  /** El usuario eligió un archivo: redimensiona y lo guarda como avatar. */
  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Elige un archivo de imagen (JPG o PNG).'); return; }
    setError('');
    setAvatarBusy(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      const err = await updateAvatar(dataUrl);
      if (err) { setError(err); return; }
      setToast('Foto de perfil actualizada');
      setTimeout(() => setToast(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar la imagen.');
    } finally {
      setAvatarBusy(false);
    }
  };

  /** Quita la foto de perfil (vuelve a las iniciales). */
  const removeAvatar = async () => {
    setError('');
    setAvatarBusy(true);
    try {
      const err = await updateAvatar(null);
      if (err) { setError(err); return; }
      setToast('Foto de perfil eliminada');
      setTimeout(() => setToast(''), 3000);
    } finally {
      setAvatarBusy(false);
    }
  };

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
    if (!currentPw) { setPwError('Escribe tu contraseña actual.'); return; }
    if (!isPasswordStrong(pw)) { setPwError('La contraseña no cumple los requisitos.'); return; }
    setPwSaving(true);
    try {
      // Se pasa la contraseña actual para verificarla antes de cambiarla.
      const err = await updatePassword(pw, currentPw);
      if (err === 'EXPIRED') { setPwError('Tu sesión expiró. Vuelve a iniciar sesión para cambiar la contraseña.'); return; }
      if (err) { setPwError(err); return; }
      setPwOpen(false);
      setToast('Contraseña actualizada');
      setTimeout(() => setToast(''), 3000);
    } finally {
      // Las contraseñas originales se limpian del estado tras cada intento.
      setPw('');
      setCurrentPw('');
      setPwSaving(false);
    }
  };

  const confirmDeactivate = async () => {
    setDeacError('');
    setDeacBusy(true);
    try {
      const err = await deactivateOwnAccount();
      if (err) { setDeacError(err); return; }
      onDeactivated();
    } finally {
      setDeacBusy(false);
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
          <div className="relative shrink-0">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt="Foto de perfil"
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black"
                style={{ backgroundColor: C.ink, color: C.cream }}
              >
                {initials(user.full_name, user.email)}
              </div>
            )}
            {/* Botón de cámara superpuesto para cambiar/agregar la foto. */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
              title={user.avatar ? 'Cambiar foto' : 'Agregar foto'}
              aria-label={user.avatar ? 'Cambiar foto de perfil' : 'Agregar foto de perfil'}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#C4553A] text-white flex items-center justify-center border-2 border-white shadow disabled:opacity-50 hover:bg-[#a8482f] transition-colors"
            >
              <ImageIcon size={13} />
            </button>
            {/* Botón para eliminar la foto (solo si hay una). */}
            {user.avatar && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={avatarBusy}
                title="Eliminar foto"
                aria-label="Eliminar foto de perfil"
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-stone-700 text-white flex items-center justify-center border-2 border-white shadow disabled:opacity-50 hover:bg-red-500 transition-colors"
              >
                <X size={12} />
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPickAvatar}
              className="hidden"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black truncate" style={{ color: C.ink }}>
              {user.full_name || 'Investigador(a)'}
            </h1>
            <p className="text-sm flex items-center gap-1.5 mt-0.5" style={{ color: C.muted }}>
              <Mail size={13} /> {user.email}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2D6A4F] bg-[#2D6A4F]/10 border border-[#2D6A4F]/20 rounded-full px-2.5 py-1 whitespace-nowrap">
                <ShieldCheck size={12} className="shrink-0" /> {ROLE_LABELS[user.role]}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-stone-400 whitespace-nowrap">
                <Calendar size={12} className="shrink-0" /> Miembro desde {monthYear(user.created_at)}
              </span>
              {user.avatar && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  disabled={avatarBusy}
                  className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-[#C4553A] disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <Trash2 size={12} className="shrink-0" /> Quitar foto
                </button>
              )}
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
              <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
                Tu cuenta inicia sesión con Google, así que no tiene una contraseña aquí.
                Para cambiarla, hazlo desde tu cuenta de Google.
              </p>
            ) : !pwOpen ? (
              <button onClick={() => { setPw(''); setCurrentPw(''); setPwError(''); setPwOpen(true); }}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-stone-200 text-stone-600 hover:border-[#C4553A]/40 hover:text-[#C4553A] transition-colors">
                <Lock size={13} /> Cambiar contraseña
              </button>
            ) : (
              <form onSubmit={changePassword} className="space-y-3">
                {/* Contraseña ACTUAL (se verifica antes de permitir el cambio). */}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"><Lock size={16} /></span>
                  <input
                    type="password"
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    placeholder="Contraseña actual"
                    autoComplete="current-password"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#C4553A] bg-stone-50"
                  />
                </div>
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
                  <button type="submit" disabled={pwSaving || !pwStrong || !currentPw}
                    className="flex items-center gap-2 bg-[#C4553A] text-white px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 btn-hover">
                    {pwSaving ? 'Guardando…' : 'Guardar contraseña'} <Check size={14} />
                  </button>
                  <button type="button" onClick={() => { setPwOpen(false); setPw(''); setCurrentPw(''); setPwError(''); }} disabled={pwSaving}
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
              {user.data_authorization_at
                ? <>Autorizaste el tratamiento de tus datos el <b style={{ color: C.ink }}>{longDate(user.data_authorization_at)}</b>.</>
                : <>Al usar la plataforma aceptaste el tratamiento de tus datos conforme a la Ley 1581 de 2012.</>}
            </p>
            <a href={DATA_POLICY_URL} target="_blank" rel="noopener noreferrer"
              className="inline-block text-xs font-semibold text-[#2D6A4F] hover:underline mt-2">
              Política de protección de datos de la Universidad Mariana
            </a>
          </div>
        </div>

        {/* ── Tu cuenta (desactivar / eliminar) ── */}
        <div className="mt-8 pt-5 border-t border-stone-200/60">
          <h2 className="text-sm font-bold mb-3" style={{ color: C.ink }}>Tu cuenta</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setDeacError(''); setDeacOpen(true); }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-stone-200 text-stone-600 hover:border-[#C4553A]/40 hover:text-[#C4553A] transition-colors">
              <UserX size={13} /> Desactivar mi cuenta
            </button>
            <button onClick={() => { setDelEmail(''); setDelError(''); setDelOpen(true); }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 size={13} /> Eliminar mi cuenta
            </button>
          </div>
        </div>
      </div>

      {/* Toast de confirmación */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#2D6A4F] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          <Check size={15} /> {toast}
        </div>
      )}

      {/* Diálogo: desactivar cuenta */}
      {deacOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A2E]/50 px-4" onClick={() => !deacBusy && setDeacOpen(false)}>
          <div className="bg-white rounded-2xl border border-stone-200/60 shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="w-11 h-11 rounded-2xl bg-[#C4553A]/10 flex items-center justify-center mb-3">
              <UserX size={22} className="text-[#C4553A]" />
            </div>
            <h3 className="text-lg font-black" style={{ color: C.ink }}>Desactivar mi cuenta</h3>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: C.muted }}>
              Tus datos y tus simulaciones se conservan. Mientras esté desactivada no podrás usar la plataforma, pero puedes reactivarla cuando quieras iniciando sesión.
            </p>
            {deacError && <p className="text-red-500 text-xs bg-red-50 rounded-lg p-2 border border-red-100 mt-3">{deacError}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={confirmDeactivate} disabled={deacBusy}
                className="flex-1 flex items-center justify-center gap-2 bg-[#C4553A] text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 btn-hover">
                {deacBusy ? 'Desactivando…' : 'Desactivar mi cuenta'} <ArrowRight size={15} />
              </button>
              <button onClick={() => setDeacOpen(false)} disabled={deacBusy}
                className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-500 text-sm font-semibold disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
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
              Se eliminarán el perfil y los datos personales de forma permanente. Las simulaciones se conservarán sin ningún dato que identifique a la persona, solo con fines estadísticos del proyecto.
            </p>
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
