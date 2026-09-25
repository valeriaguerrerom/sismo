/**
 * Panel de administración.
 *
 * Cubre los requerimientos RF-05 (gestión de usuarios), RF-15/RF-16
 * (gestión e importación de eventos sísmicos), RF-22 (dashboard con
 * indicadores), RF-23 (reportes administrativos en Excel/PDF) y RF-25
 * (gestión de contenido educativo).
 */
import { useState, useEffect, useCallback, useMemo, useRef, ChangeEvent } from 'react';
import { useAuth, ROLE_LABELS } from '../lib/auth';
import { supabase } from '../lib/supabase';
import {
  Users, Database, FileText, Settings, Trash2, Shield, BarChart3, Plus, Pencil, Upload,
  BookOpen, Check, X, FileSpreadsheet, FileDown, Clock, RefreshCw, AlertTriangle,
  MoreVertical, UserCheck, UserX, Download, ArrowRight, Mail,
} from '../lib/icons';
import type { SeismicEvent } from '../lib/types';
import {
  AdminReport, AdminUser, DashboardStats, QuizRow, TimelineRow, WaveFactRow,
  bulkInsertEvents, createEvent, deleteEvent, deleteFactRow, deleteQuizRow, deleteReport, deleteTimelineRow,
  loadDashboardStats, loadEvents, loadFactRows, loadQuizRows, loadReports, loadTimelineRows, loadUsers,
  saveFactRow, saveQuizRow, saveTimelineRow, deleteUser, setUserRole, setUserActive, updateEvent,
} from '../lib/adminData';
import { titleCase, characterize, characterizationCsv } from '../lib/adminChars';
import { importQuakeml, ImportResult } from '../lib/quakeml';
import { exportAdminExcel, exportAdminPdf, exportCharacterizationExcel, exportCharacterizationPdf } from '../lib/adminExport';

/** Muestra un valor de texto en formato título, o "Sin dato" si está vacío. */
function DisplayVal({ value, className = '' }: { value: string; className?: string }) {
  const v = (value ?? '').trim();
  if (!v) return <span className={`text-stone-300 ${className}`}>Sin dato</span>;
  return <span className={className}>{titleCase(v)}</span>;
}

/** Fecha larga en español o "Sin dato". */
function longDate(iso: string | null | undefined): string {
  if (!iso) return 'Sin dato';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Sin dato';
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

type Tab = 'overview' | 'users' | 'events' | 'education' | 'reports';
type EduTab = 'quiz' | 'facts' | 'timeline';

const inputCls = 'w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:border-[#C4553A]';
const btnPrimary = 'inline-flex items-center gap-1.5 bg-[#C4553A] text-white px-4 py-2 rounded-xl font-bold text-xs btn-hover disabled:opacity-50';
const btnGhost = 'inline-flex items-center gap-1.5 bg-white border border-stone-200 text-stone-600 px-3 py-2 rounded-xl font-semibold text-xs';

function fmtDate(d: string | null | undefined, withTime = false) {
  if (!d) return '—';
  const date = new Date(d);
  return withTime ? date.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : date.toLocaleDateString('es-CO');
}

function Toast({ msg, type, onClose }: { msg: string; type: 'ok' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 text-sm px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2 ${
      type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
      {type === 'ok' ? <Check size={15} /> : <AlertTriangle size={15} />} {msg}
    </div>
  );
}

/* ─────────────────────────────── Overview ─────────────────────────────── */

/** Barra horizontal simple de la caracterización. */
function CharBars({ title, buckets, total }: { title: string; buckets: { label: string; count: number }[]; total: number }) {
  const max = Math.max(1, ...buckets.map(b => b.count));
  return (
    <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
      <h3 className="text-sm font-bold text-[#1A1A2E] mb-3">{title}</h3>
      {buckets.length === 0 ? (
        <p className="text-xs text-stone-400">Sin datos aún.</p>
      ) : (
        <ul className="space-y-2">
          {buckets.map(b => {
            const pct = Math.round((b.count / total) * 100);
            const isEmpty = b.label === 'Sin dato';
            return (
              <li key={b.label}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className={isEmpty ? 'text-stone-300' : 'text-[#1A1A2E]'}>{b.label}</span>
                  <span className="text-stone-400">{b.count} · {pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(b.count / max) * 100}%`, backgroundColor: isEmpty ? '#D6D3D1' : '#C4553A' }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Overview({ stats, users, onRefresh }: { stats: DashboardStats | null; users: AdminUser[]; onRefresh: () => void }) {
  const chars = useMemo(() => characterize(users), [users]);

  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportOpen) return;
    const onDoc = (e: MouseEvent) => { if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [exportOpen]);

  const exportCsv = () => {
    const csv = characterizationCsv(chars);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caracterizacion_usuarios_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!stats) return <div className="text-center py-12 text-stone-400">Cargando indicadores...</div>;
  const maxMonth = Math.max(1, ...stats.reportsPerMonth.map(m => m.count));
  const total = Math.max(1, stats.roles.admin + stats.roles.user);
  const adminPct = Math.round((stats.roles.admin / total) * 100);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={onRefresh} className={btnGhost}><RefreshCw size={13} /> Actualizar</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Investigadores registrados', sub: 'usuarios de la plataforma', value: stats.users, icon: <Users size={20} /> },
          { label: 'Simulaciones guardadas', sub: 'reportes de usuarios', value: stats.reports, icon: <FileText size={20} /> },
          { label: 'Eventos sísmicos', sub: `${stats.eventsByType.tectonic} tect. · ${stats.eventsByType.volcanic} volc.`, value: stats.events, icon: <Database size={20} /> },
          { label: 'Contenido educativo', sub: `${stats.questions} quiz · ${stats.facts} datos · ${stats.timeline} hitos`, value: stats.questions + stats.facts + stats.timeline, icon: <BookOpen size={20} /> },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-stone-200/60 p-5 card-hover">
            <span className="text-stone-400">{s.icon}</span>
            <div className="text-3xl font-black text-[#1A1A2E] mt-2">{s.value}</div>
            <div className="text-xs font-semibold text-stone-500 mt-1">{s.label}</div>
            <div className="text-[11px] text-stone-400">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Simulaciones por mes */}
        <div className="bg-white rounded-2xl border border-stone-200/60 p-5 lg:col-span-1">
          <h3 className="text-sm font-bold text-[#1A1A2E] mb-4 flex items-center gap-1.5"><BarChart3 size={14} className="text-stone-400" /> Simulaciones de los últimos 6 meses</h3>
          <svg viewBox="0 0 300 140" className="w-full h-36" role="img" aria-label="Simulaciones por mes">
            {stats.reportsPerMonth.map((m, i) => {
              const bw = 300 / stats.reportsPerMonth.length;
              const h = (m.count / maxMonth) * 100;
              const x = i * bw + bw * 0.2;
              return (
                <g key={m.label + i}>
                  <rect x={x} y={110 - h} width={bw * 0.6} height={h} rx={4} fill="#C4553A" />
                  <text x={x + bw * 0.3} y={104 - h} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1A1A2E">{m.count}</text>
                  <text x={x + bw * 0.3} y={128} textAnchor="middle" fontSize="10" fill="#78716C">{m.label}</text>
                </g>
              );
            })}
            <line x1="0" y1="110" x2="300" y2="110" stroke="#E7E5E4" />
          </svg>
        </div>

        {/* Distribución de roles */}
        <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
          <h3 className="text-sm font-bold text-[#1A1A2E] mb-4 flex items-center gap-1.5"><Shield size={14} className="text-stone-400" /> Distribución de roles</h3>
          <div className="flex items-center gap-5">
            <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#E7E5E4" strokeWidth="4" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#C4553A" strokeWidth="4" strokeDasharray={`${adminPct} ${100 - adminPct}`} strokeLinecap="round" />
            </svg>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#C4553A]" /> Administradores: <b>{stats.roles.admin}</b> ({adminPct}%)</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-stone-300" /> Investigadores: <b>{stats.roles.user}</b> ({100 - adminPct}%)</div>
            </div>
          </div>
        </div>

        {/* Últimos accesos */}
        <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
          <h3 className="text-sm font-bold text-[#1A1A2E] mb-3 flex items-center gap-1.5"><Clock size={14} className="text-stone-400" /> Últimos accesos</h3>
          {stats.lastLogins.length === 0 ? (
            <p className="text-xs text-stone-400">Aún no hay accesos registrados. Se registran al iniciar sesión.</p>
          ) : (
            <ul className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin pr-1">
              {stats.lastLogins.map((l, i) => (
                <li key={i} className="flex items-center justify-between text-xs">
                  <span className="truncate text-[#1A1A2E] font-medium">{l.full_name || l.email}</span>
                  <span className="text-stone-400 flex-shrink-0 ml-2">{fmtDate(l.last_login, true)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Caracterización de usuarios */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#1A1A2E]">Caracterización de usuarios</h2>
          <div ref={exportRef} className="relative">
            <button onClick={() => setExportOpen(o => !o)} className={`${btnGhost} text-[#2D6A4F] border-[#2D6A4F]/30`}><Download size={13} /> Exportar</button>
            {exportOpen && (
              <div className="absolute right-0 top-9 z-20 w-40 bg-white rounded-xl border border-stone-200 shadow-lg py-1 text-sm">
                <button onClick={() => { setExportOpen(false); exportCsv(); }} className="w-full text-left px-3 py-2 flex items-center gap-2 text-stone-700 hover:bg-stone-50"><FileText size={14} className="text-stone-400" /> CSV</button>
                <button onClick={() => { setExportOpen(false); exportCharacterizationExcel(chars); }} className="w-full text-left px-3 py-2 flex items-center gap-2 text-stone-700 hover:bg-stone-50"><FileSpreadsheet size={14} className="text-[#2D6A4F]" /> Excel</button>
                <button onClick={() => { setExportOpen(false); exportCharacterizationPdf(chars); }} className="w-full text-left px-3 py-2 flex items-center gap-2 text-stone-700 hover:bg-stone-50"><FileDown size={14} className="text-[#C4553A]" /> PDF</button>
              </div>
            )}
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <CharBars title="Por ocupación" buckets={chars.ocupacion} total={chars.total} />
          <CharBars title="Por institución (5 principales)" buckets={chars.institucion} total={chars.total} />
          <CharBars title="Por área de interés" buckets={chars.area} total={chars.total} />
          <CharBars title="Por ciudad" buckets={chars.ciudad} total={chars.total} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Users ─────────────────────────────── */

/** Menú de tres puntos con las acciones de una fila de usuario. */
function RowMenu({ u, adminCount, onAction }: {
  u: AdminUser; adminCount: number;
  onAction: (a: 'role' | 'active' | 'delete') => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const isAdmin = u.role === 'admin';
  const soleAdmin = isAdmin && adminCount <= 1;

  return (
    <div ref={ref} className="relative flex justify-end">
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600" aria-label="Acciones" title="Acciones">
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-56 bg-white rounded-xl border border-stone-200 shadow-lg py-1 text-sm" onClick={e => e.stopPropagation()}>
          <button
            disabled={soleAdmin}
            onClick={() => { setOpen(false); onAction('role'); }}
            title={soleAdmin ? 'No puedes quitar el rol al único administrador' : undefined}
            className="w-full text-left px-3 py-2 flex items-center gap-2 text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <Shield size={14} className="text-stone-400" /> {isAdmin ? 'Quitar administrador' : 'Hacer administrador'}
          </button>
          <button
            onClick={() => { setOpen(false); onAction('active'); }}
            className="w-full text-left px-3 py-2 flex items-center gap-2 text-stone-700 hover:bg-stone-50">
            {u.active ? <><UserX size={14} className="text-stone-400" /> Desactivar cuenta</> : <><UserCheck size={14} className="text-stone-400" /> Activar cuenta</>}
          </button>
          <div className="my-1 border-t border-stone-100" />
          <button
            disabled={soleAdmin}
            onClick={() => { setOpen(false); onAction('delete'); }}
            title={soleAdmin ? 'No puedes eliminar al único administrador' : undefined}
            className="w-full text-left px-3 py-2 flex items-center gap-2 text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <Trash2 size={14} /> Eliminar cuenta
          </button>
        </div>
      )}
    </div>
  );
}

/** Panel lateral con el perfil completo de un usuario. */
function UserDrawer({ u, onClose }: { u: AdminUser; onClose: () => void }) {
  const row = (label: string, value: string) => (
    <div>
      <div className="text-[11px] font-semibold text-stone-500">{label}</div>
      <div className="text-sm mt-0.5 text-[#1A1A2E]"><DisplayVal value={value} /></div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#1A1A2E]/40" onClick={onClose}>
      <div className="w-full max-w-md h-full bg-white shadow-xl overflow-y-auto scrollbar-thin" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-stone-200/60 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-black flex-shrink-0" style={{ backgroundColor: '#1A1A2E', color: '#FAFAF8' }}>
              {(u.full_name || u.email).slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-[#1A1A2E] truncate">{u.full_name || 'Sin nombre'}</div>
              <div className="text-xs text-stone-400 flex items-center gap-1 truncate"><Mail size={11} /> {u.email}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${u.role === 'admin' ? 'bg-[#C4553A]/10 text-[#C4553A]' : 'bg-[#2D6A4F]/10 text-[#2D6A4F]'}`}>{ROLE_LABELS[u.role]}</span>
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${u.active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>{u.active ? 'Activo' : 'Desactivado'}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {row('Ocupación', u.occupation)}
            {row('Área de interés', u.research_area)}
            {row('Institución', u.institution)}
            {row('Ciudad', u.city)}
            {row('País', u.country)}
          </div>
          <div>
            <div className="text-[11px] font-semibold text-stone-500">¿Para qué usa la plataforma?</div>
            <div className="text-sm mt-0.5 text-[#1A1A2E]"><DisplayVal value={u.usage_purpose} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-stone-100">
            <div>
              <div className="text-[11px] font-semibold text-stone-500">Último acceso</div>
              <div className="text-sm mt-0.5 text-stone-600">{u.last_login ? fmtDate(u.last_login, true) : 'Sin dato'}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-stone-500">Autorización de datos</div>
              <div className="text-sm mt-0.5 text-stone-600">{longDate(u.data_authorization_at)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ users, meId, onChange, notify }: {
  users: AdminUser[]; meId?: string; onChange: () => void; notify: (m: string, t?: 'ok' | 'error') => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [occFilter, setOccFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [drawer, setDrawer] = useState<AdminUser | null>(null);
  // Confirmaciones: rol y activar/desactivar usan un modal simple; eliminar exige escribir el correo.
  const [confirm, setConfirm] = useState<{ u: AdminUser; kind: 'role' | 'active' } | null>(null);
  const [delUser, setDelUser] = useState<AdminUser | null>(null);
  const [delEmail, setDelEmail] = useState('');

  const adminCount = useMemo(() => users.filter(u => u.role === 'admin').length, [users]);
  const occupations = useMemo(
    () => Array.from(new Set(users.map(u => u.occupation).filter(Boolean))).sort(),
    [users],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Rango de fechas de registro (created_at). 'hasta' incluye todo el día.
    const fromTs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toTs = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    return users.filter(u => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (occFilter && u.occupation !== occFilter) return false;
      if (fromTs != null || toTs != null) {
        const t = u.created_at ? new Date(u.created_at).getTime() : NaN;
        if (isNaN(t)) return false;
        if (fromTs != null && t < fromTs) return false;
        if (toTs != null && t > toTs) return false;
      }
      if (!q) return true;
      return [u.full_name, u.email, u.institution].some(v => (v ?? '').toLowerCase().includes(q));
    });
  }, [users, search, roleFilter, occFilter, fromDate, toDate]);

  const run = async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusy(id);
    try { await fn(); notify(ok); onChange(); }
    catch (e) { notify(e instanceof Error ? e.message : 'Error', 'error'); }
    setBusy(null);
  };

  const onAction = (u: AdminUser, a: 'role' | 'active' | 'delete') => {
    if (a === 'delete') { setDelUser(u); setDelEmail(''); }
    else setConfirm({ u, kind: a });
  };

  const doConfirm = () => {
    if (!confirm) return;
    const { u, kind } = confirm;
    setConfirm(null);
    if (kind === 'role') run(u.id, () => setUserRole(u.id, u.role === 'admin' ? 'user' : 'admin'), 'Rol actualizado');
    else run(u.id, () => setUserActive(u.id, !u.active), u.active ? 'Cuenta desactivada' : 'Cuenta activada');
  };

  const doDelete = () => {
    if (!delUser) return;
    const u = delUser;
    setDelUser(null);
    run(u.id, () => deleteUser(u.id), 'Cuenta eliminada');
  };

  return (
    <div className="space-y-4">
      {/* Buscador + filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, correo o institución…" className={`${inputCls} sm:max-w-xs`} />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={`${inputCls} sm:w-40`}>
          <option value="">Todos los roles</option>
          <option value="admin">Administrador</option>
          <option value="user">Investigador</option>
        </select>
        <select value={occFilter} onChange={e => setOccFilter(e.target.value)} className={`${inputCls} sm:w-52`}>
          <option value="">Todas las ocupaciones</option>
          {occupations.map(o => <option key={o} value={o}>{titleCase(o)}</option>)}
        </select>
        <div className="flex items-center gap-1.5 text-xs text-stone-500">
          <span>Registro:</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="Desde" className={`${inputCls} w-[9.5rem]`} />
          <span>a</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="Hasta" className={`${inputCls} w-[9.5rem]`} />
        </div>
        {(search || roleFilter || occFilter || fromDate || toDate) && (
          <button onClick={() => { setSearch(''); setRoleFilter(''); setOccFilter(''); setFromDate(''); setToDate(''); }} className={btnGhost}>Limpiar</button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-stone-400">{filtered.length} de {users.length}</span>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200/60 overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[24%]" /><col className="w-[22%]" /><col className="w-[22%]" /><col className="w-[13%]" /><col className="w-[13%]" /><col className="w-[6%]" />
          </colgroup>
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200/60 text-left text-stone-500 font-semibold">
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Perfil</th>
              <th className="px-4 py-3">Institución y ubicación</th>
              <th className="px-4 py-3">Rol y estado</th>
              <th className="px-4 py-3">Último acceso</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} className="border-b border-stone-100 hover:bg-stone-50/60 cursor-pointer align-top" onClick={() => setDrawer(u)}>
                <td className="px-4 py-3">
                  <div className="font-medium text-[#1A1A2E] truncate">{u.full_name ? titleCase(u.full_name) : <span className="text-stone-300">Sin nombre</span>}{u.id === meId && <span className="ml-1 text-[10px] text-stone-400">(tú)</span>}</div>
                  <div className="text-[11px] text-stone-400 truncate">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-stone-600 truncate"><DisplayVal value={u.occupation} /></div>
                  <div className="text-[11px] text-stone-400 truncate"><DisplayVal value={u.research_area} /></div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-stone-600 truncate"><DisplayVal value={u.institution} /></div>
                  <div className="text-[11px] text-stone-400 truncate">
                    {u.city || u.country ? titleCase([u.city, u.country].filter(Boolean).join(', ')) : <span className="text-stone-300">Sin dato</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${u.role === 'admin' ? 'bg-[#C4553A]/10 text-[#C4553A]' : 'bg-[#2D6A4F]/10 text-[#2D6A4F]'}`}>{ROLE_LABELS[u.role]}</span>
                  <div className={`text-[11px] mt-1 ${u.active ? 'text-green-600' : 'text-red-500'}`}>{u.active ? 'Activo' : 'Desactivado'}</div>
                </td>
                <td className="px-4 py-3 text-stone-400 text-xs">{u.last_login ? fmtDate(u.last_login, true) : <span className="text-stone-300">Sin dato</span>}</td>
                <td className="px-4 py-3">
                  {u.id !== meId
                    ? <div style={{ opacity: busy === u.id ? 0.4 : 1 }}><RowMenu u={u} adminCount={adminCount} onAction={a => onAction(u, a)} /></div>
                    : <span className="block text-right text-[10px] text-stone-300">—</span>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400">{users.length === 0 ? 'No hay investigadores registrados' : 'Sin resultados para la búsqueda.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {drawer && <UserDrawer u={drawer} onClose={() => setDrawer(null)} />}

      {/* Confirmación de rol / activar-desactivar */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A2E]/50 px-4" onClick={() => setConfirm(null)}>
          <div className="bg-white rounded-2xl border border-stone-200/60 shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[#1A1A2E]">
              {confirm.kind === 'role'
                ? (confirm.u.role === 'admin' ? 'Quitar administrador' : 'Hacer administrador')
                : (confirm.u.active ? 'Desactivar cuenta' : 'Activar cuenta')}
            </h3>
            <p className="text-sm mt-2 text-stone-500 leading-relaxed">
              {confirm.kind === 'role'
                ? (confirm.u.role === 'admin'
                    ? <>El usuario <b className="text-[#1A1A2E]">{confirm.u.full_name || confirm.u.email}</b> pasará a ser Investigador y perderá el acceso al panel.</>
                    : <>El usuario <b className="text-[#1A1A2E]">{confirm.u.full_name || confirm.u.email}</b> tendrá acceso completo al panel de administración.</>)
                : (confirm.u.active
                    ? <>La cuenta de <b className="text-[#1A1A2E]">{confirm.u.full_name || confirm.u.email}</b> quedará desactivada y no podrá iniciar sesión.</>
                    : <>La cuenta de <b className="text-[#1A1A2E]">{confirm.u.full_name || confirm.u.email}</b> podrá volver a iniciar sesión.</>)}
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={doConfirm} className="flex-1 bg-[#C4553A] text-white py-2.5 rounded-xl font-bold text-sm btn-hover">Confirmar</button>
              <button onClick={() => setConfirm(null)} className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-500 text-sm font-semibold">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación de eliminación (escribir correo) */}
      {delUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A2E]/50 px-4" onClick={() => setDelUser(null)}>
          <div className="bg-white rounded-2xl border border-stone-200/60 shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center mb-3"><AlertTriangle size={22} className="text-red-500" /></div>
            <h3 className="text-lg font-black text-[#1A1A2E]">Eliminar cuenta</h3>
            <p className="text-sm mt-2 text-stone-500 leading-relaxed">
              Se eliminarán de forma <b className="text-[#1A1A2E]">permanente</b> el perfil y los reportes de <b className="text-[#1A1A2E]">{delUser.full_name || delUser.email}</b>.
            </p>
            <p className="text-sm mt-3 text-stone-500">Para confirmar, escribe su correo <b className="text-[#1A1A2E]">{delUser.email}</b>:</p>
            <input value={delEmail} onChange={e => setDelEmail(e.target.value)} placeholder={delUser.email} autoComplete="off"
              className="w-full mt-2 px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-red-400 bg-stone-50" />
            <div className="flex gap-2 mt-4">
              <button onClick={doDelete} disabled={delEmail.trim().toLowerCase() !== delUser.email.toLowerCase()}
                className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                Eliminar definitivamente <ArrowRight size={15} />
              </button>
              <button onClick={() => setDelUser(null)} className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-500 text-sm font-semibold">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── Events ─────────────────────────────── */

const emptyEvent = (): Omit<SeismicEvent, 'id'> => ({
  event_date: new Date().toISOString().slice(0, 10), event_time: '00:00:00', magnitude: 4.0, depth_km: 15,
  latitude: 1.2136, longitude: -77.2811, location_name: '', event_type: 'tectonic', source: 'SGC', notes: '',
});

function EventForm({ initial, onSave, onCancel }: { initial: Omit<SeismicEvent, 'id'>; onSave: (e: Omit<SeismicEvent, 'id'>) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.location_name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="bg-stone-50 border border-stone-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
      <label className="text-xs text-stone-500 col-span-2 md:col-span-2">Lugar / descripción
        <input required className={inputCls} value={form.location_name} onChange={e => set('location_name', e.target.value)} placeholder="Pasto, Nariño" /></label>
      <label className="text-xs text-stone-500">Fecha<input type="date" required className={inputCls} value={form.event_date} onChange={e => set('event_date', e.target.value)} /></label>
      <label className="text-xs text-stone-500">Hora (UTC)<input type="time" step="1" className={inputCls} value={form.event_time} onChange={e => set('event_time', e.target.value)} /></label>
      <label className="text-xs text-stone-500">Magnitud<input type="number" step="0.1" min="0" max="10" required className={inputCls} value={form.magnitude} onChange={e => set('magnitude', Number(e.target.value))} /></label>
      <label className="text-xs text-stone-500">Profundidad (km)<input type="number" step="0.1" min="0" required className={inputCls} value={form.depth_km} onChange={e => set('depth_km', Number(e.target.value))} /></label>
      <label className="text-xs text-stone-500">Latitud<input type="number" step="0.0001" required className={inputCls} value={form.latitude} onChange={e => set('latitude', Number(e.target.value))} /></label>
      <label className="text-xs text-stone-500">Longitud<input type="number" step="0.0001" required className={inputCls} value={form.longitude} onChange={e => set('longitude', Number(e.target.value))} /></label>
      <label className="text-xs text-stone-500">Tipo
        <select className={inputCls} value={form.event_type} onChange={e => set('event_type', e.target.value as 'tectonic' | 'volcanic')}>
          <option value="tectonic">Tectónico</option><option value="volcanic">Volcánico</option>
        </select></label>
      <label className="text-xs text-stone-500">Fuente<input className={inputCls} value={form.source} onChange={e => set('source', e.target.value)} /></label>
      <label className="text-xs text-stone-500 col-span-2">Notas<input className={inputCls} value={form.notes} onChange={e => set('notes', e.target.value)} /></label>
      <div className="col-span-2 md:col-span-4 flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className={btnGhost}><X size={13} /> Cancelar</button>
        <button type="submit" disabled={saving} className={btnPrimary}><Check size={13} /> {saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );
}

function EventsTab({ notify }: { notify: (m: string, t?: 'ok' | 'error') => void }) {
  const [events, setEvents] = useState<SeismicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SeismicEvent | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setEvents(await loadEvents()); } catch (e) { notify(e instanceof Error ? e.message : 'Error cargando eventos', 'error'); }
    setLoading(false);
  }, [notify]);

  useEffect(() => { reload(); }, [reload]);

  const save = async (data: Omit<SeismicEvent, 'id'>) => {
    try {
      if (editing === 'new') await createEvent(data);
      else if (editing) await updateEvent(editing.id, data);
      notify(editing === 'new' ? 'Evento creado' : 'Evento actualizado');
      setEditing(null);
      reload();
    } catch (e) { notify(e instanceof Error ? e.message : 'Error guardando', 'error'); }
  };

  const remove = async (ev: SeismicEvent) => {
    if (!window.confirm(`¿Eliminar el evento "${ev.location_name}" (${ev.event_date})?`)) return;
    try { await deleteEvent(ev.id); notify('Evento eliminado'); reload(); }
    catch (e) { notify(e instanceof Error ? e.message : 'Error eliminando', 'error'); }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const res = await importQuakeml(file);
      setPreview(res);
      if (res.importados === 0) notify('El archivo no contiene eventos válidos', 'error');
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo leer el archivo', 'error'); }
    setImporting(false);
  };

  const confirmImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const rows = preview.eventos.map(ev => ({
        event_date: ev.event_date, event_time: ev.event_time, magnitude: ev.magnitude, depth_km: ev.depth_km,
        latitude: ev.latitude, longitude: ev.longitude, location_name: ev.location_name, event_type: ev.event_type,
        source: ev.source, notes: [ev.magnitude_type ? `Tipo de magnitud: ${ev.magnitude_type}` : '', ev.notes].filter(Boolean).join(' · '),
      }));
      const n = await bulkInsertEvents(rows);
      notify(`${n} eventos importados`);
      setPreview(null);
      reload();
    } catch (e) { notify(e instanceof Error ? e.message : 'Error importando', 'error'); }
    setImporting(false);
  };

  const q = search.trim().toLowerCase();
  const filtered = q ? events.filter(ev => ev.location_name.toLowerCase().includes(q) || ev.event_date.includes(q) || String(ev.magnitude).includes(q)) : events;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por lugar, fecha o magnitud…" className={`${inputCls} sm:max-w-xs`} />
        <div className="flex gap-2">
          <label className={`${btnGhost} cursor-pointer`}>
            <Upload size={13} /> {importing ? 'Procesando…' : 'Importar QuakeML (.xml)'}
            <input type="file" accept=".xml,application/xml,text/xml" className="hidden" onChange={onFile} disabled={importing} />
          </label>
          <button onClick={() => setEditing('new')} className={btnPrimary}><Plus size={13} /> Nuevo evento</button>
        </div>
      </div>

      {preview && (
        <div className="bg-white border border-[#2D6A4F]/30 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-sm">
              <b className="text-[#1A1A2E]">Vista previa de importación</b>
              <span className="text-stone-500"> · {preview.importados} válidos de {preview.total_en_archivo} ({preview.descartados} descartados) · parser: {preview.origen === 'backend' ? 'ObsPy (backend)' : 'navegador'}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className={btnGhost}><X size={13} /> Cancelar</button>
              <button onClick={confirmImport} disabled={importing || preview.importados === 0} className={btnPrimary}><Check size={13} /> Insertar {preview.importados} eventos</button>
            </div>
          </div>
          <div className="max-h-56 overflow-auto scrollbar-thin">
            <table className="w-full text-xs">
              <thead><tr className="text-stone-500 text-left"><th className="py-1 pr-2">Fecha</th><th className="py-1 pr-2">Mag</th><th className="py-1 pr-2">Prof.</th><th className="py-1 pr-2">Lat / Lon</th><th className="py-1 pr-2">Tipo</th><th className="py-1">Lugar</th></tr></thead>
              <tbody>
                {preview.eventos.slice(0, 200).map((ev, i) => (
                  <tr key={i} className="border-t border-stone-100">
                    <td className="py-1 pr-2 whitespace-nowrap">{ev.event_date} {ev.event_time}</td>
                    <td className="py-1 pr-2">{ev.magnitude}{ev.magnitude_type ? ` ${ev.magnitude_type}` : ''}</td>
                    <td className="py-1 pr-2">{ev.depth_km} km</td>
                    <td className="py-1 pr-2 whitespace-nowrap">{ev.latitude.toFixed(3)}, {ev.longitude.toFixed(3)}</td>
                    <td className="py-1 pr-2">{ev.event_type === 'volcanic' ? 'Volc.' : 'Tect.'}</td>
                    <td className="py-1 truncate max-w-[220px]">{ev.location_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.eventos.length > 200 && <p className="text-[11px] text-stone-400 mt-1">Mostrando 200 de {preview.eventos.length}.</p>}
          </div>
        </div>
      )}

      {editing && <EventForm initial={editing === 'new' ? emptyEvent() : { ...editing }} onSave={save} onCancel={() => setEditing(null)} />}

      <div className="bg-white rounded-2xl border border-stone-200/60 overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200/60">
              {['Fecha', 'Lugar', 'Mag', 'Prof. (km)', 'Lat / Lon', 'Tipo', 'Fuente', 'Acciones'].map(h => <th key={h} className="text-left px-4 py-3 text-stone-500 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-stone-400">Cargando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-stone-400">
                {events.length === 0 ? 'La tabla seismic_events está vacía. Crea un evento o importa un catálogo QuakeML del SGC.' : 'Sin resultados para la búsqueda.'}
              </td></tr>
            ) : filtered.map(ev => (
              <tr key={ev.id} className="border-b border-stone-100">
                <td className="px-4 py-2.5 whitespace-nowrap text-stone-600">{ev.event_date} <span className="text-stone-300">{ev.event_time?.slice(0, 5)}</span></td>
                <td className="px-4 py-2.5 font-medium text-[#1A1A2E] max-w-[220px] truncate">{ev.location_name}</td>
                <td className="px-4 py-2.5 font-mono">{Number(ev.magnitude).toFixed(1)}</td>
                <td className="px-4 py-2.5 font-mono">{Number(ev.depth_km).toFixed(1)}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-stone-500">{Number(ev.latitude).toFixed(3)}, {Number(ev.longitude).toFixed(3)}</td>
                <td className="px-4 py-2.5"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${ev.event_type === 'volcanic' ? 'bg-[#C4553A]/10 text-[#C4553A]' : 'bg-[#2D6A4F]/10 text-[#2D6A4F]'}`}>{ev.event_type === 'volcanic' ? 'Volcánico' : 'Tectónico'}</span></td>
                <td className="px-4 py-2.5 text-stone-500 text-xs">{ev.source}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-3">
                    <button onClick={() => setEditing(ev)} className="text-xs text-[#6B5B95] font-semibold flex items-center gap-1"><Pencil size={12} /> Editar</button>
                    <button onClick={() => remove(ev)} className="text-xs text-red-500 font-semibold flex items-center gap-1"><Trash2 size={12} /> Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-stone-400">{events.length} eventos en la base de datos. Los registros MiniSEED del explorador se gestionan con los scripts del backend.</p>
    </div>
  );
}

/* ─────────────────────────────── Education ─────────────────────────────── */

function QuizEditor({ row, onSave, onCancel }: { row: Partial<QuizRow>; onSave: (r: Partial<QuizRow>) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState<Partial<QuizRow>>({ options: ['', '', '', ''], correct_index: 0, category: 'general', difficulty: 'medio', active: true, ...row });
  const opts = f.options || ['', '', '', ''];
  return (
    <form onSubmit={async e => { e.preventDefault(); await onSave(f); }} className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
      <label className="text-xs text-stone-500 block">Pregunta<input required className={inputCls} value={f.question || ''} onChange={e => setF({ ...f, question: e.target.value })} /></label>
      <div className="grid sm:grid-cols-2 gap-2">
        {opts.map((o, i) => (
          <label key={i} className="text-xs text-stone-500 flex items-center gap-2">
            <input type="radio" name="correct" checked={f.correct_index === i} onChange={() => setF({ ...f, correct_index: i })} title="Respuesta correcta" />
            <input required className={inputCls} placeholder={`Opción ${i + 1}`} value={o} onChange={e => { const n = [...opts]; n[i] = e.target.value; setF({ ...f, options: n }); }} />
          </label>
        ))}
      </div>
      <label className="text-xs text-stone-500 block">Explicación<textarea required rows={2} className={inputCls} value={f.explanation || ''} onChange={e => setF({ ...f, explanation: e.target.value })} /></label>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-stone-500">Categoría
          <select className={inputCls} value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
            {['ondas', 'volcanes', 'tectonica', 'general'].map(c => <option key={c} value={c}>{c}</option>)}
          </select></label>
        <label className="text-xs text-stone-500">Dificultad
          <select className={inputCls} value={f.difficulty} onChange={e => setF({ ...f, difficulty: e.target.value })}>
            {['facil', 'medio', 'dificil'].map(c => <option key={c} value={c}>{c}</option>)}
          </select></label>
        <label className="text-xs text-stone-500 flex items-end gap-2 pb-2"><input type="checkbox" checked={f.active !== false} onChange={e => setF({ ...f, active: e.target.checked })} /> Activa</label>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className={btnGhost}><X size={13} /> Cancelar</button>
        <button type="submit" className={btnPrimary}><Check size={13} /> Guardar</button>
      </div>
    </form>
  );
}

function FactEditor({ row, onSave, onCancel }: { row: Partial<WaveFactRow>; onSave: (r: Partial<WaveFactRow>) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState<Partial<WaveFactRow>>({ wave_type: 'P', active: true, ...row });
  return (
    <form onSubmit={async e => { e.preventDefault(); await onSave(f); }} className="bg-stone-50 border border-stone-200 rounded-xl p-4 grid sm:grid-cols-[120px_1fr_auto] gap-3 items-end">
      <label className="text-xs text-stone-500">Tipo de onda
        <select className={inputCls} value={f.wave_type} onChange={e => setF({ ...f, wave_type: e.target.value })}>
          {['P', 'S', 'Love', 'Rayleigh'].map(t => <option key={t} value={t}>{t}</option>)}
        </select></label>
      <label className="text-xs text-stone-500">Dato curioso<input required className={inputCls} value={f.fact || ''} onChange={e => setF({ ...f, fact: e.target.value })} /></label>
      <div className="flex gap-2 items-center">
        <label className="text-xs text-stone-500 flex items-center gap-1"><input type="checkbox" checked={f.active !== false} onChange={e => setF({ ...f, active: e.target.checked })} /> Activo</label>
        <button type="button" onClick={onCancel} className={btnGhost}><X size={13} /></button>
        <button type="submit" className={btnPrimary}><Check size={13} /> Guardar</button>
      </div>
    </form>
  );
}

function TimelineEditor({ row, onSave, onCancel }: { row: Partial<TimelineRow>; onSave: (r: Partial<TimelineRow>) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState<Partial<TimelineRow>>({ event_type: 'tectonic', active: true, year: new Date().getFullYear(), ...row });
  return (
    <form onSubmit={async e => { e.preventDefault(); await onSave({ ...f, magnitude: f.magnitude?.trim() ? f.magnitude : null }); }} className="bg-stone-50 border border-stone-200 rounded-xl p-4 grid sm:grid-cols-4 gap-3">
      <label className="text-xs text-stone-500">Año<input type="number" required className={inputCls} value={f.year ?? ''} onChange={e => setF({ ...f, year: Number(e.target.value) })} /></label>
      <label className="text-xs text-stone-500">Magnitud (opcional)<input className={inputCls} placeholder="8.2 o ~7.0" value={f.magnitude ?? ''} onChange={e => setF({ ...f, magnitude: e.target.value })} /></label>
      <label className="text-xs text-stone-500">Tipo
        <select className={inputCls} value={f.event_type} onChange={e => setF({ ...f, event_type: e.target.value as 'tectonic' | 'volcanic' })}>
          <option value="tectonic">Tectónico</option><option value="volcanic">Volcánico</option>
        </select></label>
      <label className="text-xs text-stone-500 flex items-end gap-2 pb-2"><input type="checkbox" checked={f.active !== false} onChange={e => setF({ ...f, active: e.target.checked })} /> Activo</label>
      <label className="text-xs text-stone-500 sm:col-span-4">Título<input required className={inputCls} value={f.title || ''} onChange={e => setF({ ...f, title: e.target.value })} /></label>
      <label className="text-xs text-stone-500 sm:col-span-4">Descripción<textarea required rows={2} className={inputCls} value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })} /></label>
      <div className="sm:col-span-4 flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className={btnGhost}><X size={13} /> Cancelar</button>
        <button type="submit" className={btnPrimary}><Check size={13} /> Guardar</button>
      </div>
    </form>
  );
}

function EducationTab({ notify }: { notify: (m: string, t?: 'ok' | 'error') => void }) {
  const [sub, setSub] = useState<EduTab>('quiz');
  const [quiz, setQuiz] = useState<QuizRow[]>([]);
  const [facts, setFacts] = useState<WaveFactRow[]>([]);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [editing, setEditing] = useState<{ kind: EduTab; row: Partial<QuizRow | WaveFactRow | TimelineRow> } | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [q, f, t] = await Promise.all([loadQuizRows(), loadFactRows(), loadTimelineRows()]);
      setQuiz(q); setFacts(f); setTimeline(t);
    } catch (e) { notify(e instanceof Error ? e.message : 'Error cargando contenido', 'error'); }
    setLoading(false);
  }, [notify]);

  useEffect(() => { reload(); }, [reload]);

  const wrap = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); notify(ok); setEditing(null); reload(); }
    catch (e) { notify(e instanceof Error ? e.message : 'Error', 'error'); }
  };

  const confirmDel = (label: string) => window.confirm(`¿Eliminar "${label}"?`);

  const subTabs: { id: EduTab; label: string; count: number }[] = [
    { id: 'quiz', label: 'Preguntas del quiz', count: quiz.length },
    { id: 'facts', label: 'Datos curiosos de ondas', count: facts.length },
    { id: 'timeline', label: 'Línea de tiempo', count: timeline.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {subTabs.map(t => (
            <button key={t.id} onClick={() => { setSub(t.id); setEditing(null); }}
              className={`px-3 py-2 rounded-xl text-xs font-bold border ${sub === t.id ? 'bg-[#6B5B95] text-white border-transparent' : 'bg-white text-stone-500 border-stone-200'}`}>
              {t.label} <span className="opacity-70">({t.count})</span>
            </button>
          ))}
        </div>
        <button onClick={() => setEditing({ kind: sub, row: {} })} className={btnPrimary}><Plus size={13} /> Nuevo</button>
      </div>

      {editing?.kind === 'quiz' && <QuizEditor row={editing.row as Partial<QuizRow>} onCancel={() => setEditing(null)} onSave={r => wrap(() => saveQuizRow(r), 'Pregunta guardada')} />}
      {editing?.kind === 'facts' && <FactEditor row={editing.row as Partial<WaveFactRow>} onCancel={() => setEditing(null)} onSave={r => wrap(() => saveFactRow(r), 'Dato guardado')} />}
      {editing?.kind === 'timeline' && <TimelineEditor row={editing.row as Partial<TimelineRow>} onCancel={() => setEditing(null)} onSave={r => wrap(() => saveTimelineRow(r), 'Hito guardado')} />}

      {loading ? <div className="text-center py-10 text-stone-400">Cargando…</div> : (
        <div className="bg-white rounded-2xl border border-stone-200/60 divide-y divide-stone-100">
          {sub === 'quiz' && quiz.map(q => (
            <div key={q.id} className={`p-4 flex items-start gap-3 ${!q.active ? 'opacity-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#1A1A2E]">{q.question}</div>
                <div className="text-xs text-stone-500 mt-1">✓ {q.options?.[q.correct_index]} · <span className="uppercase">{q.category}</span> · {q.difficulty}{!q.active && ' · inactiva'}</div>
              </div>
              <RowActions onEdit={() => setEditing({ kind: 'quiz', row: q })} onDelete={() => confirmDel(q.question) && wrap(() => deleteQuizRow(q.id), 'Pregunta eliminada')} />
            </div>
          ))}
          {sub === 'facts' && facts.map(f => (
            <div key={f.id} className={`p-4 flex items-start gap-3 ${!f.active ? 'opacity-50' : ''}`}>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-[#2D6A4F]/10 text-[#2D6A4F] flex-shrink-0 w-16 text-center">{f.wave_type}</span>
              <div className="flex-1 text-sm text-stone-700">{f.fact}{!f.active && <span className="text-xs text-stone-400"> · inactivo</span>}</div>
              <RowActions onEdit={() => setEditing({ kind: 'facts', row: f })} onDelete={() => confirmDel(f.fact.slice(0, 40)) && wrap(() => deleteFactRow(f.id), 'Dato eliminado')} />
            </div>
          ))}
          {sub === 'timeline' && timeline.map(t => (
            <div key={t.id} className={`p-4 flex items-start gap-3 ${!t.active ? 'opacity-50' : ''}`}>
              <span className="font-mono font-bold text-[#1A1A2E] w-14 flex-shrink-0">{t.year}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#1A1A2E]">{t.title} {t.magnitude && <span className="text-xs text-stone-400">ML {t.magnitude}</span>}</div>
                <div className="text-xs text-stone-500 mt-0.5 line-clamp-2">{t.description}</div>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg flex-shrink-0 ${t.event_type === 'volcanic' ? 'bg-[#C4553A]/10 text-[#C4553A]' : 'bg-[#2D6A4F]/10 text-[#2D6A4F]'}`}>{t.event_type === 'volcanic' ? 'Volc.' : 'Tect.'}</span>
              <RowActions onEdit={() => setEditing({ kind: 'timeline', row: t })} onDelete={() => confirmDel(t.title) && wrap(() => deleteTimelineRow(t.id), 'Hito eliminado')} />
            </div>
          ))}
          {((sub === 'quiz' && quiz.length === 0) || (sub === 'facts' && facts.length === 0) || (sub === 'timeline' && timeline.length === 0)) && (
            <div className="p-8 text-center text-stone-400 text-sm">Sin registros. Usa "Nuevo" para agregar contenido.</div>
          )}
        </div>
      )}
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-2 flex-shrink-0">
      <button onClick={onEdit} className="p-1.5 rounded-lg text-[#6B5B95] bg-[#6B5B95]/5" title="Editar"><Pencil size={13} /></button>
      <button onClick={onDelete} className="p-1.5 rounded-lg text-red-500 bg-red-50" title="Eliminar"><Trash2 size={13} /></button>
    </div>
  );
}

/* ─────────────────────────────── Reports ─────────────────────────────── */

function ReportsTab({ stats, users, notify }: { stats: DashboardStats | null; users: AdminUser[]; notify: (m: string, t?: 'ok' | 'error') => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setReports(await loadReports(from || undefined, to || undefined)); }
    catch (e) { notify(e instanceof Error ? e.message : 'Error cargando reportes', 'error'); }
    setLoading(false);
  }, [from, to, notify]);

  useEffect(() => { reload(); }, [reload]);

  const remove = async (r: AdminReport) => {
    if (!window.confirm(`¿Eliminar el reporte "${r.title}"?`)) return;
    try { await deleteReport(r.id); notify('Reporte eliminado'); reload(); }
    catch (e) { notify(e instanceof Error ? e.message : 'Error', 'error'); }
  };

  const exportArgs = () => {
    if (!stats) { notify('Los indicadores aún no han cargado', 'error'); return null; }
    return { stats, users, reports, period: { from: from || undefined, to: to || undefined } };
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-stone-200/60 p-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-stone-500">Desde<input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="text-xs text-stone-500">Hasta<input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} /></label>
        <button onClick={() => { setFrom(''); setTo(''); }} className={btnGhost}>Limpiar</button>
        <div className="flex-1" />
        <button onClick={() => { const a = exportArgs(); if (a) exportAdminExcel(a); }} className={`${btnGhost} text-[#2D6A4F] border-[#2D6A4F]/30`}><FileSpreadsheet size={14} /> Exportar Excel</button>
        <button onClick={() => { const a = exportArgs(); if (a) exportAdminPdf(a); }} className={`${btnGhost} text-[#C4553A] border-[#C4553A]/30`}><FileDown size={14} /> Exportar PDF</button>
      </div>
      <p className="text-xs text-stone-400">{reports.length} simulaciones en el período seleccionado. El reporte exportado incluye indicadores, usuarios y simulaciones por mes.</p>

      <div className="bg-white rounded-2xl border border-stone-200/60 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200/60">
              {['Título', 'Usuario', 'Fuente', 'ML', 'Prof.', 'Fecha', 'Acciones'].map(h => <th key={h} className="text-left px-4 py-3 text-stone-500 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-400">Cargando…</td></tr>
            : reports.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-400">No hay reportes en el período</td></tr>
            : reports.map(r => {
              const p = r.params as { sourceType?: string; magnitude?: number; depth?: number };
              return (
                <tr key={r.id} className="border-b border-stone-100">
                  <td className="px-4 py-3 font-medium text-[#1A1A2E] max-w-[240px] truncate">{r.title}</td>
                  <td className="px-4 py-3 text-stone-500">{r.profiles?.full_name || r.profiles?.email || '—'}</td>
                  <td className="px-4 py-3 text-stone-500 text-xs">{p.sourceType === 'volcanic' ? 'Volcánica' : 'Tectónica'}</td>
                  <td className="px-4 py-3 font-mono">{p.magnitude ?? '—'}</td>
                  <td className="px-4 py-3 font-mono">{p.depth ?? '—'} km</td>
                  <td className="px-4 py-3 text-stone-400 text-xs">{fmtDate(r.created_at, true)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => remove(r)} className="text-red-500 text-xs flex items-center gap-1"><Trash2 size={12} /> Eliminar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Dashboard ─────────────────────────────── */

export function AdminDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'error' } | null>(null);

  const notify = useCallback((msg: string, type: 'ok' | 'error' = 'ok') => setToast({ msg, type }), []);

  const reloadStats = useCallback(async () => {
    if (!supabase) return;
    try { setStats(await loadDashboardStats()); }
    catch (e) { notify(e instanceof Error ? e.message : 'Error cargando indicadores', 'error'); }
  }, [notify]);

  const reloadUsers = useCallback(async () => {
    if (!supabase) return;
    try { setUsers(await loadUsers()); }
    catch (e) { notify(e instanceof Error ? e.message : 'Error cargando usuarios', 'error'); }
  }, [notify]);

  useEffect(() => { reloadStats(); reloadUsers(); }, [reloadStats, reloadUsers]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Resumen', icon: <BarChart3 size={16} /> },
    { id: 'users', label: 'Usuarios', icon: <Users size={16} /> },
    { id: 'events', label: 'Eventos sísmicos', icon: <Database size={16} /> },
    { id: 'education', label: 'Contenido educativo', icon: <BookOpen size={16} /> },
    { id: 'reports', label: 'Reportes', icon: <FileText size={16} /> },
  ];

  if (!supabase) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] pt-24 px-6 text-center text-stone-500 text-sm">
        Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16">
      <div className="bg-white border-b border-stone-200/60 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-[#1A1A2E] font-bold text-xl flex items-center gap-2">
            <Settings size={20} className="text-[#C4553A]" />
            Panel de Administración
          </h1>
          <p className="text-stone-400 text-xs mt-0.5">Gestiona usuarios, eventos sísmicos, contenido educativo y reportes</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                tab === t.id ? 'bg-[#C4553A] text-white' : 'bg-white text-stone-500 border border-stone-200'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <Overview stats={stats} users={users} onRefresh={reloadStats} />}
        {tab === 'users' && <UsersTab users={users} meId={user?.id} onChange={() => { reloadUsers(); reloadStats(); }} notify={notify} />}
        {tab === 'events' && <EventsTab notify={notify} />}
        {tab === 'education' && <EducationTab notify={notify} />}
        {tab === 'reports' && <ReportsTab stats={stats} users={users} notify={notify} />}
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
