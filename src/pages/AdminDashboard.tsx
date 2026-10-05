/**
 * Panel de administración.
 *
 * Cubre los requerimientos RF-05 (gestión de usuarios), RF-15/RF-16
 * (gestión e importación de eventos sísmicos), RF-22 (dashboard con
 * indicadores), RF-23 (reportes administrativos en Excel/PDF) y RF-25
 * (gestión de contenido educativo).
 */
import { useState, useEffect, useCallback, useMemo, useRef, ChangeEvent } from 'react';
import { useAuth } from '../lib/authContext';
import { ROLE_LABELS } from '../lib/authTypes';
import { supabase } from '../lib/supabase';
import {
  Users, Database, FileText, Trash2, Shield, BarChart3, Plus, Pencil, Upload,
  BookOpen, Check, X, FileSpreadsheet, FileDown, Clock, RefreshCw, AlertTriangle, Copy, CopyCheck,
  MoreVertical, UserCheck, UserX, Download, ArrowRight, Mail, MessageSquare,
} from '../lib/icons';
import type { SeismicEvent } from '../lib/types';
import {
  AdminReport, AdminUser, DashboardStats, QuizRow, TimelineRow, WaveFactRow,
  bulkInsertEvents, createEvent, deleteEvent, deleteFactRow, deleteQuizRow, deleteReport, deleteTimelineRow,
  loadDashboardStats, loadEvents, loadFactRows, loadQuizRows, loadReports, loadTimelineRows, loadUsers,
  saveFactRow, saveQuizRow, saveTimelineRow, deleteUser, setUserRole, deactivateUser, reactivateUser, updateEvent,
  loadMseedUploadLogs, loadMseedUploadStats, loadTopMseedUploaders, loadMseedFailureReasons,
} from '../lib/adminData';
import { titleCase, characterize, characterizationCsv } from '../lib/adminChars';
import { VolcanoLoader } from '../components/ui/VolcanoLoader';
import { Pagination } from '../components/ui/Pagination';

/** Filas por página en las tablas/listas del panel admin. */
const ADMIN_PAGE_SIZE = 10;
import { importQuakeml, ImportResult } from '../lib/quakeml';
import { exportAdminExcel, exportAdminPdf, exportCharacterizationExcel, exportCharacterizationPdf } from '../lib/adminExport';
import {
  listFeedback, updateFeedbackStatus, deleteFeedback, countNewFeedback,
  FEEDBACK_TYPE_LABELS, FEEDBACK_STATUS_LABELS,
  type FeedbackMessage, type FeedbackType, type FeedbackStatus,
} from '../lib/feedback';

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

type Tab = 'overview' | 'users' | 'events' | 'education' | 'reports' | 'mseed' | 'messages';
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

/** Barra horizontal de la caracterización con acento de color y crecimiento al entrar. */
function CharBars({ title, buckets, total, animate = true }: { title: string; buckets: { label: string; count: number }[]; total: number; animate?: boolean }) {
  const max = Math.max(1, ...buckets.map(b => b.count));
  return (
    <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
      <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-4">{title}</h3>
      {buckets.length === 0 ? (
        <p className="text-xs text-stone-400">Sin datos aún.</p>
      ) : (
        <ul className="space-y-3">
          {buckets.map((b, i) => {
            const pct = Math.round((b.count / total) * 100);
            const isEmpty = b.label === 'Sin dato';
            const widthPct = (b.count / max) * 100;
            return (
              <li key={b.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className={`font-medium truncate max-w-[60%] ${isEmpty ? 'text-stone-300' : 'text-[#1A1A2E]'}`}>{b.label}</span>
                  <span className="text-stone-400 font-semibold shrink-0 ml-2">{b.count} <span className="text-stone-300">·</span> {pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{
                      width: animate ? `${widthPct}%` : '0%',
                      backgroundColor: isEmpty ? '#D6D3D1' : i === 0 ? '#C4553A' : i === 1 ? '#2D6A4F' : i === 2 ? '#6B5B95' : i === 3 ? '#D4A853' : '#78716C',
                      transition: `width 0.7s cubic-bezier(0.22,1,0.36,1) ${i * 0.06}s`,
                    }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Hook de "count-up": anima un número de 0 hasta `target` cuando se activa
 * `run`. Devuelve el valor actual (entero). Usa requestAnimationFrame con una
 * curva easeOut para que arranque rápido y frene suave.
 */
function useCountUp(target: number, run: boolean, duration = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) { setValue(0); return; }
    if (target <= 0) { setValue(0); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, duration]);
  return value;
}

/** Una tarjeta de indicador con número animado y clic a su pestaña. */
function StatCard({ value, label, sub, icon, accent, run, onClick }: {
  value: number; label: string; sub: string; icon: React.ReactNode; accent: string; run: boolean; onClick?: () => void;
}) {
  const n = useCountUp(value, run);
  return (
    <button onClick={onClick} disabled={!onClick}
      className="text-left bg-white rounded-2xl border border-stone-200/60 p-4 card-hover flex items-center gap-4 group disabled:cursor-default w-full">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
        style={{ backgroundColor: `${accent}18`, color: accent }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-3xl font-black text-[#1A1A2E] leading-none tabular-nums">{n}</span>
        <div className="text-xs font-bold text-stone-600 mt-1 leading-tight">{label}</div>
        <div className="text-[10px] text-stone-400 leading-tight truncate group-hover:text-[#C4553A] transition-colors">
          {onClick ? 'toca para revisar →' : sub}
        </div>
      </div>
    </button>
  );
}

/** Tarjeta de mensajes nuevos: se resalta en dorado si hay pendientes. */
function MessagesStatCard({ value, run, onClick }: { value: number; run: boolean; onClick: () => void }) {
  const n = useCountUp(value, run);
  const has = value > 0;
  return (
    <button onClick={onClick}
      className={`text-left bg-white rounded-2xl border p-4 card-hover flex items-center gap-4 group w-full ${has ? 'border-[#D4A853]/50 ring-1 ring-[#D4A853]/30' : 'border-stone-200/60'}`}>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${has ? 'bg-[#D4A853]/15 text-[#D4A853]' : 'bg-stone-100 text-stone-400'}`}>
        <MessageSquare size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-3xl font-black text-[#1A1A2E] leading-none tabular-nums">{n}</span>
        <div className="text-xs font-bold text-stone-600 mt-1 leading-tight">Mensajes nuevos</div>
        <div className="text-[10px] text-stone-400 leading-tight group-hover:text-[#C4553A] transition-colors">toca para revisar →</div>
      </div>
    </button>
  );
}

function Overview({ stats, users, newMessages, onRefresh, onGoTab }: {
  stats: DashboardStats | null; users: AdminUser[]; newMessages: number; onRefresh: () => void; onGoTab: (t: Tab) => void;
}) {
  const chars = useMemo(() => characterize(users), [users]);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  // Dispara las animaciones de entrada (count-up, barras, donut) la PRIMERA vez
  // que hay datos. Se usa un flag con doble rAF para garantizar que el navegador
  // pinte primero el estado inicial (0) y LUEGO el final, para que la transición
  // CSS sea visible aunque los stats ya estuvieran cargados al montar.
  const [animate, setAnimate] = useState(false);
  const startedRef = useRef(false);
  const rafRef = useRef(0);
  useEffect(() => {
    if (!stats || startedRef.current) return;
    startedRef.current = true;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => setAnimate(true));
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [stats]);

  const handleExportPdf = async () => {
    if (!stats) return;
    setExporting(true);
    try {
      const reports = await loadReports();
      exportAdminPdf({ stats, users, reports, period: {} });
    } catch (e) {
      console.error('Error exportando PDF:', e);
    } finally {
      setExporting(false);
    }
  };

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

  const maxMonth = Math.max(1, ...(stats?.reportsPerMonth.map(m => m.count) ?? [1]));
  const total = Math.max(1, (stats?.roles.admin ?? 0) + (stats?.roles.user ?? 0));
  const adminPct = Math.round(((stats?.roles.admin ?? 0) / total) * 100);
  // Número animado del centro del donut (debe llamarse en cada render, no tras un return).
  const totalCount = useCountUp(total, animate);

  if (!stats) return <div className="py-12"><VolcanoLoader size={44} label="Cargando indicadores…" /></div>;

  // Colores, acentos y pestaña destino por tarjeta (todas clicables).
  const cards: { label: string; sub: string; value: number; icon: React.ReactNode; accent: string; tab: Tab }[] = [
    { label: 'Investigadores', sub: 'cuentas registradas', value: stats.users, icon: <Users size={22} />, accent: '#2D6A4F', tab: 'users' },
    { label: 'Simulaciones guardadas', sub: 'reportes de usuarios', value: stats.reports, icon: <FileText size={22} />, accent: '#C4553A', tab: 'reports' },
    { label: 'Eventos sísmicos', sub: `${stats.eventsByType.tectonic} tect. · ${stats.eventsByType.volcanic} volc.`, value: stats.events, icon: <Database size={22} />, accent: '#6B5B95', tab: 'events' },
    { label: 'Contenido educativo', sub: `${stats.questions} quiz · ${stats.facts} hechos`, value: stats.questions + stats.facts + stats.timeline, icon: <BookOpen size={22} />, accent: '#D4A853', tab: 'education' },
    { label: 'Cuentas eliminadas', sub: 'reportes anonimizados', value: stats.deletedAccounts, icon: <Trash2 size={22} />, accent: '#A8A29E', tab: 'users' },
  ];

  // Tiempo relativo para últimos accesos
  function relTime(iso: string | null): string {
    if (!iso) return 'Sin datos';
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 2) return 'Ahora mismo';
    if (min < 60) return `Hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `Hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `Hace ${d} día${d > 1 ? 's' : ''}`;
    return fmtDate(iso, false);
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 justify-end">
        <button onClick={handleExportPdf} disabled={!stats || exporting} className={`${btnGhost} text-[#C4553A] border-[#C4553A]/30`}>
          <FileDown size={13} /> {exporting ? 'Generando…' : 'Exportar PDF completo'}
        </button>
        <button onClick={onRefresh} className={`${btnGhost} gap-1.5`}><RefreshCw size={13} /> Actualizar</button>
      </div>

      {/* ── Tarjetas de indicadores (número animado, todas clicables) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map(s => (
          <StatCard key={s.label} value={s.value} label={s.label} sub={s.sub}
            icon={s.icon} accent={s.accent} run={animate} onClick={() => onGoTab(s.tab)} />
        ))}
        {/* Mensajes nuevos — resaltada si hay nuevos */}
        <MessagesStatCard value={newMessages} run={animate} onClick={() => onGoTab('messages')} />
      </div>

      {/* ── Fila central: gráfica + roles + accesos ── */}
      <div className="grid lg:grid-cols-5 gap-4">

        {/* Gráfica de barras con tooltip */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[#1A1A2E] flex items-center gap-1.5">
              <BarChart3 size={14} className="text-[#C4553A]" /> Simulaciones · últimos 6 meses
            </h3>
            <span className="text-xs text-stone-400 font-semibold">
              {stats.reportsPerMonth.reduce((a, m) => a + m.count, 0)} total
            </span>
          </div>
          <div className="relative">
            <svg viewBox="0 0 300 150" className="w-full h-40" role="img" aria-label="Simulaciones por mes">
              {/* Líneas guía */}
              {[0, 25, 50, 75, 100].map(pct => (
                <line key={pct} x1="0" y1={115 - pct} x2="300" y2={115 - pct}
                  stroke="#F5F5F4" strokeWidth="1" />
              ))}
              {stats.reportsPerMonth.map((m, i) => {
                const bw = 300 / stats.reportsPerMonth.length;
                const fullH = Math.max(4, (m.count / maxMonth) * 100);
                const barH = animate ? fullH : 0; // crece al entrar
                const x = i * bw + bw * 0.15;
                const bWidth = bw * 0.7;
                const isHov = hoveredBar === i;
                return (
                  <g key={m.label + i}
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                    style={{ cursor: 'default' }}>
                    {/* Barra de fondo (hover area) */}
                    <rect x={x} y={15} width={bWidth} height={100} rx={6} fill={isHov ? '#FFF5F3' : 'transparent'} />
                    {/* Barra real (crece al entrar, con pequeño retardo escalonado) */}
                    <rect x={x} y={115 - barH} width={bWidth} height={barH} rx={6}
                      fill={isHov ? '#A8392A' : '#C4553A'}
                      style={{ transition: `height 0.6s cubic-bezier(0.22,1,0.36,1) ${i * 0.07}s, y 0.6s cubic-bezier(0.22,1,0.36,1) ${i * 0.07}s, fill 0.15s` }} />
                    {/* Tooltip sobre la barra */}
                    {isHov && (
                      <g>
                        <rect x={x + bWidth / 2 - 18} y={115 - barH - 22} width={36} height={18} rx={4} fill="#1A1A2E" />
                        <text x={x + bWidth / 2} y={115 - barH - 9} textAnchor="middle" fontSize="10" fontWeight="800" fill="white">{m.count}</text>
                      </g>
                    )}
                    {/* Etiqueta mes */}
                    <text x={x + bWidth / 2} y={133} textAnchor="middle" fontSize="9" fill="#A8A29E" fontWeight="600">{m.label}</text>
                  </g>
                );
              })}
              <line x1="0" y1="115" x2="300" y2="115" stroke="#E7E5E4" strokeWidth="1.5" />
            </svg>
          </div>
        </div>

        {/* Donut de roles (los arcos crecen al entrar + número animado) */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-stone-200/60 p-5 flex flex-col">
          <h3 className="text-sm font-bold text-[#1A1A2E] flex items-center gap-1.5 mb-4">
            <Shield size={14} className="text-[#6B5B95]" /> Roles
          </h3>
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            {/* Donut: circunferencia ≈ 2πr = 87.96 para r=14 */}
            {(() => {
              const CIRC = 87.96;
              // Fracción visible según animación (0 → 1).
              const adminLen = (adminPct / 100) * CIRC;
              const userLen = ((100 - adminPct) / 100) * CIRC;
              return (
                <div className="relative w-28 h-28">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    {/* Pista de fondo */}
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#F5F5F4" strokeWidth="5" />
                    {/* Arco admins: se dibuja de 0 a su longitud (dashoffset animado) */}
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#C4553A" strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={`${adminLen} ${CIRC - adminLen}`}
                      strokeDashoffset={animate ? 0 : adminLen}
                      style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)' }} />
                    {/* Arco investigadores: empieza donde termina el de admins */}
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#2D6A4F" strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={`${userLen} ${CIRC - userLen}`}
                      strokeDashoffset={animate ? -adminLen : -adminLen - userLen}
                      style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1) 0.25s' }} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-black text-[#1A1A2E] tabular-nums">{totalCount}</span>
                    <span className="text-[10px] text-stone-400 font-semibold">usuarios</span>
                  </div>
                </div>
              );
            })()}
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#C4553A]" /> Admins</span>
                <span className="font-black text-[#1A1A2E]">{stats.roles.admin} <span className="font-normal text-stone-400">({adminPct}%)</span></span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#2D6A4F]" /> Investig.</span>
                <span className="font-black text-[#1A1A2E]">{stats.roles.user} <span className="font-normal text-stone-400">({100 - adminPct}%)</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* Últimos accesos con avatar de iniciales */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200/60 p-5">
          <h3 className="text-sm font-bold text-[#1A1A2E] flex items-center gap-1.5 mb-3">
            <Clock size={14} className="text-[#D4A853]" /> Actividad reciente
          </h3>
          {stats.lastLogins.length === 0 ? (
            <p className="text-xs text-stone-400 mt-2">Aún no hay accesos registrados. Se registran al iniciar sesión.</p>
          ) : (
            <ul className="space-y-2.5 max-h-52 overflow-y-auto scrollbar-thin pr-1">
              {stats.lastLogins.map((l, i) => {
                const name = l.full_name || l.email;
                const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p: string) => p[0]).join('').toUpperCase() || '?';
                // Color de avatar basado en el índice para variedad
                const avatarColors = ['#C4553A', '#2D6A4F', '#6B5B95', '#D4A853', '#1A1A2E'];
                const bg = avatarColors[i % avatarColors.length];
                return (
                  <li key={i} className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
                      style={{ backgroundColor: bg }}>
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-[#1A1A2E] truncate">{name}</div>
                      <div className="text-[10px] text-stone-400">{relTime(l.last_login)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Caracterización de usuarios ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#1A1A2E] flex items-center gap-1.5">
            <Users size={14} className="text-stone-400" /> Caracterización de investigadores
          </h2>
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
          <CharBars title="Por ocupación" buckets={chars.ocupacion} total={chars.total} animate={animate} />
          <CharBars title="Por institución (5 principales)" buckets={chars.institucion} total={chars.total} animate={animate} />
          <CharBars title="Por área de interés" buckets={chars.area} total={chars.total} animate={animate} />
          <CharBars title="Por ciudad" buckets={chars.ciudad} total={chars.total} animate={animate} />
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
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Al abrir, decide si el menú va hacia abajo o hacia arriba según el espacio
  // disponible (evita que se corte en las últimas filas de la tabla).
  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuHeight = 170; // alto aproximado del menú (3 opciones + separador)
      setDropUp(window.innerHeight - rect.bottom < menuHeight);
    }
    setOpen(o => !o);
  };

  const isAdmin = u.role === 'admin';
  const soleAdmin = isAdmin && adminCount <= 1;

  return (
    <div ref={ref} className="relative flex justify-end">
      <button ref={btnRef} onClick={e => { e.stopPropagation(); toggle(); }}
        className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600" aria-label="Acciones" title="Acciones">
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className={`absolute right-0 z-20 w-56 bg-white rounded-xl border border-stone-200 shadow-lg py-1 text-sm ${dropUp ? 'bottom-8' : 'top-8'}`} onClick={e => e.stopPropagation()}>
          <button
            disabled={soleAdmin}
            onClick={() => { setOpen(false); onAction('role'); }}
            title={soleAdmin ? 'No puedes quitar el rol al único administrador' : undefined}
            className="w-full text-left px-3 py-2 flex items-center gap-2 text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <Shield size={14} className="text-stone-400" /> {isAdmin ? 'Quitar administrador' : 'Hacer administrador'}
          </button>
          <button
            disabled={u.active && soleAdmin}
            onClick={() => { setOpen(false); onAction('active'); }}
            title={u.active && soleAdmin ? 'No puedes desactivar al único administrador' : undefined}
            className="w-full text-left px-3 py-2 flex items-center gap-2 text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed">
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
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${u.active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>
              {u.active ? 'Activo' : u.deactivated_by === 'usuario' ? 'Desactivado por el usuario' : 'Desactivado por un administrador'}
            </span>
          </div>
          {!u.active && u.deactivated_by === 'administrador' && u.deactivation_reason && (
            <div className="bg-stone-50 border border-stone-200/60 rounded-lg px-3 py-2">
              <div className="text-[11px] font-semibold text-stone-500">Motivo de la desactivación</div>
              <div className="text-sm mt-0.5 text-[#1A1A2E]">{u.deactivation_reason}</div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-stone-100">
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
  const [stateFilter, setStateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<AdminUser | null>(null);
  // Confirmación de rol (cambiar/quitar admin) — modal simple.
  const [confirm, setConfirm] = useState<{ u: AdminUser } | null>(null);
  // Diálogo con motivo: sirve para desactivar (reason) y para eliminar (reason+email).
  const [reasonDlg, setReasonDlg] = useState<{ u: AdminUser; mode: 'deactivate' | 'delete' } | null>(null);
  const [reason, setReason] = useState('');
  const [reasonOther, setReasonOther] = useState('');
  const [delEmail, setDelEmail] = useState('');
  const [emailCopied, setEmailCopied] = useState(false); // feedback del botón "copiar correo"

  const REASONS = ['Cuenta de prueba', 'Solicitud del usuario', 'Inactividad', 'Uso indebido', 'Otro'];

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
      if (stateFilter === 'active' && !u.active) return false;
      if (stateFilter === 'deact_user' && !(!u.active && u.deactivated_by === 'usuario')) return false;
      if (stateFilter === 'deact_admin' && !(!u.active && u.deactivated_by === 'administrador')) return false;
      if (fromTs != null || toTs != null) {
        const t = u.created_at ? new Date(u.created_at).getTime() : NaN;
        if (isNaN(t)) return false;
        if (fromTs != null && t < fromTs) return false;
        if (toTs != null && t > toTs) return false;
      }
      if (!q) return true;
      return [u.full_name, u.email, u.institution].some(v => (v ?? '').toLowerCase().includes(q));
    });
  }, [users, search, roleFilter, occFilter, stateFilter, fromDate, toDate]);

  // Página actual de la tabla de usuarios.
  const paged = filtered.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE);
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, occFilter, stateFilter, fromDate, toDate, users.length]);

  const run = async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusy(id);
    try { await fn(); notify(ok); onChange(); }
    catch (e) { notify(e instanceof Error ? e.message : 'Error', 'error'); }
    setBusy(null);
  };

  const openReasonDialog = (u: AdminUser, mode: 'deactivate' | 'delete') => {
    setReason(''); setReasonOther(''); setDelEmail(''); setEmailCopied(false);
    setReasonDlg({ u, mode });
  };

  // Copia el correo del usuario al portapapeles y rellena el campo de confirmación.
  const copyEmailToConfirm = async (email: string) => {
    try { await navigator.clipboard.writeText(email); } catch { /* el navegador puede bloquearlo */ }
    setDelEmail(email);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const onAction = (u: AdminUser, a: 'role' | 'active' | 'delete') => {
    if (a === 'role') { setConfirm({ u }); return; }
    if (a === 'active') {
      // Reactivar es inmediato; desactivar pide motivo.
      if (u.active) openReasonDialog(u, 'deactivate');
      else run(u.id, () => reactivateUser(u.id), 'Cuenta activada');
      return;
    }
    openReasonDialog(u, 'delete'); // eliminar
  };

  const doConfirmRole = () => {
    if (!confirm) return;
    const { u } = confirm;
    setConfirm(null);
    run(u.id, () => setUserRole(u.id, u.role === 'admin' ? 'user' : 'admin'), 'Rol actualizado');
  };

  /** Motivo final (texto del select, o el texto libre si eligió "Otro"). */
  const finalReason = () => (reason === 'Otro' ? reasonOther.trim() : reason);

  const doReasonAction = () => {
    if (!reasonDlg) return;
    const { u, mode } = reasonDlg;
    const r = finalReason();
    setReasonDlg(null);
    if (mode === 'deactivate') run(u.id, () => deactivateUser(u.id, r), 'Cuenta desactivada');
    else run(u.id, () => deleteUser(u.id, r), 'Cuenta eliminada');
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
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className={`${inputCls} sm:w-60`}>
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="deact_user">Desactivado por el usuario</option>
          <option value="deact_admin">Desactivado por un administrador</option>
        </select>
        <div className="flex items-center gap-1.5 text-xs text-stone-500">
          <span>Registro:</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="Desde" className={`${inputCls} w-[9.5rem]`} />
          <span>a</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="Hasta" className={`${inputCls} w-[9.5rem]`} />
        </div>
        {(search || roleFilter || occFilter || stateFilter || fromDate || toDate) && (
          <button onClick={() => { setSearch(''); setRoleFilter(''); setOccFilter(''); setStateFilter(''); setFromDate(''); setToDate(''); }} className={btnGhost}>Limpiar</button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-stone-400">{filtered.length} de {users.length}</span>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200/60">
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
            {paged.map(u => (
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
                  <div className={`text-[11px] mt-1 ${u.active ? 'text-green-600' : 'text-red-500'}`}>
                    {u.active ? 'Activo' : u.deactivated_by === 'usuario' ? 'Desactivado (usuario)' : 'Desactivado (admin)'}
                  </div>
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

      <Pagination page={page} totalItems={filtered.length} pageSize={ADMIN_PAGE_SIZE} onChange={setPage} />

      {drawer && <UserDrawer u={drawer} onClose={() => setDrawer(null)} />}

      {/* Confirmación de rol (hacer/quitar administrador) */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A2E]/50 px-4" onClick={() => setConfirm(null)}>
          <div className="bg-white rounded-2xl border border-stone-200/60 shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[#1A1A2E]">
              {confirm.u.role === 'admin' ? 'Quitar administrador' : 'Hacer administrador'}
            </h3>
            <p className="text-sm mt-2 text-stone-500 leading-relaxed">
              {confirm.u.role === 'admin'
                ? <>El usuario <b className="text-[#1A1A2E]">{confirm.u.full_name || confirm.u.email}</b> pasará a ser Investigador y perderá el acceso al panel.</>
                : <>El usuario <b className="text-[#1A1A2E]">{confirm.u.full_name || confirm.u.email}</b> tendrá acceso completo al panel de administración.</>}
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={doConfirmRole} className="flex-1 bg-[#C4553A] text-white py-2.5 rounded-xl font-bold text-sm btn-hover">Confirmar</button>
              <button onClick={() => setConfirm(null)} className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-500 text-sm font-semibold">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo con motivo: desactivar (motivo) y eliminar (motivo + correo) */}
      {reasonDlg && (() => {
        const { u, mode } = reasonDlg;
        const isDelete = mode === 'delete';
        const reasonOk = reason !== '' && (reason !== 'Otro' || reasonOther.trim() !== '');
        const emailOk = !isDelete || delEmail.trim().toLowerCase() === u.email.toLowerCase();
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A2E]/50 px-4" onClick={() => setReasonDlg(null)}>
            <div className="bg-white rounded-2xl border border-stone-200/60 shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center mx-auto mb-3 ${isDelete ? 'bg-red-50' : 'bg-[#C4553A]/10'}`}>
                {isDelete ? <AlertTriangle size={22} className="text-red-500" /> : <UserX size={22} className="text-[#C4553A]" />}
              </div>
              <h3 className="text-lg font-black text-center text-[#1A1A2E]">{isDelete ? 'Eliminar cuenta' : 'Desactivar cuenta'}</h3>
              <p className="text-sm mt-2 text-stone-500 leading-relaxed">
                {isDelete
                  ? <>Se eliminarán el perfil y los datos personales de <b className="text-[#1A1A2E]">{u.full_name || u.email}</b> de forma permanente. Las simulaciones se conservarán sin ningún dato que identifique a la persona, solo con fines estadísticos del proyecto.</>
                  : <>La cuenta de <b className="text-[#1A1A2E]">{u.full_name || u.email}</b> quedará desactivada y no podrá iniciar sesión. Sus datos y simulaciones se conservan.</>}
              </p>

              {/* Motivo: obligatorio y destacado (queda en bitácora, no debe saltarse). */}
              <label className="block text-sm font-bold text-[#1A1A2E] mt-4 mb-1">
                Motivo <span className="text-red-500">*</span>
                <span className="font-normal text-stone-400"> — queda registrado</span>
              </label>
              <select value={reason} onChange={e => setReason(e.target.value)}
                className={`${inputCls} ${reason === '' ? 'border-[#C4553A] ring-1 ring-[#C4553A]/30' : ''}`}>
                <option value="">Selecciona un motivo…</option>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {reason === 'Otro' && (
                <input value={reasonOther} onChange={e => setReasonOther(e.target.value)} placeholder="Describe el motivo" maxLength={120}
                  className={`${inputCls} mt-2`} />
              )}

              {isDelete && (
                <>
                  {/* El bloque de confirmación solo aparece tras elegir el motivo, para
                      que no se salte ese paso y se corra a escribir el correo. */}
                  {!reasonOk ? (
                    <p className="text-xs text-stone-400 mt-3">Elige un motivo para continuar con la confirmación.</p>
                  ) : (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
                    <p className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                      <AlertTriangle size={13} /> Para confirmar, escribe el correo exactamente igual:
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="flex-1 min-w-0 truncate bg-white border border-red-200 rounded-lg px-3 py-2 text-sm font-semibold text-[#1A1A2E]" title={u.email}>
                        {u.email}
                      </span>
                      <button type="button" onClick={() => copyEmailToConfirm(u.email)}
                        className={`shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border transition-colors ${
                          emailCopied ? 'border-[#2D6A4F] text-[#2D6A4F] bg-green-50' : 'border-red-300 text-red-600 bg-white hover:bg-red-100'
                        }`}
                        aria-label="Copiar correo y rellenar la confirmación">
                        {emailCopied ? <><CopyCheck size={13} /> ¡Copiado!</> : <><Copy size={13} /> Copiar</>}
                      </button>
                    </div>
                  </div>
                  )}
                  <input value={delEmail} onChange={e => setDelEmail(e.target.value)} placeholder="Escribe o pega el correo aquí" autoComplete="off"
                    disabled={!reasonOk}
                    aria-label="Confirma el correo electrónico"
                    className="w-full mt-2 px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-red-400 bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed" />
                </>
              )}

              <div className="flex gap-2 mt-4">
                <button onClick={doReasonAction} disabled={!reasonOk || !emailOk}
                  className={`flex-1 flex items-center justify-center gap-2 text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed ${isDelete ? 'bg-red-500' : 'bg-[#C4553A] btn-hover'}`}>
                  {isDelete ? <>Eliminar definitivamente <ArrowRight size={15} /></> : 'Desactivar cuenta'}
                </button>
                <button onClick={() => setReasonDlg(null)} className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-500 text-sm font-semibold">Cancelar</button>
              </div>
            </div>
          </div>
        );
      })()}
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
  const [page, setPage] = useState(1);

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
  const paged = filtered.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, events.length]);

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
              {['Fecha', 'Lugar', 'Mag', 'Lat / Lon', 'Tipo', 'Fuente', 'Acciones'].map(h => <th key={h} className="text-left px-4 py-3 text-stone-500 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-400">Cargando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-400">
                {events.length === 0 ? 'La tabla seismic_events está vacía. Crea un evento o importa un catálogo QuakeML del SGC.' : 'Sin resultados para la búsqueda.'}
              </td></tr>
            ) : paged.map(ev => (
              <tr key={ev.id} className="border-b border-stone-100">
                <td className="px-4 py-2.5 whitespace-nowrap text-stone-600">{ev.event_date} <span className="text-stone-300">{ev.event_time?.slice(0, 5)}</span></td>
                <td className="px-4 py-2.5 font-medium text-[#1A1A2E] max-w-[220px] truncate">{ev.location_name}</td>
                <td className="px-4 py-2.5 font-mono">{Number(ev.magnitude).toFixed(1)}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-stone-500">{Number(ev.latitude).toFixed(3)}, {Number(ev.longitude).toFixed(3)}</td>
                <td className="px-4 py-2.5"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${ev.event_type === 'volcanic' ? 'bg-[#C4553A]/10 text-[#C4553A]' : 'bg-[#2D6A4F]/10 text-[#2D6A4F]'}`}>{ev.event_type === 'volcanic' ? 'Volcánico' : 'Tectónico'}</span></td>
                <td className="px-4 py-2.5 text-stone-500 text-xs">{ev.source}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-3">
                    <button onClick={() => setEditing(ev)} className="text-xs text-[#2D6A4F] font-semibold flex items-center gap-1"><Pencil size={12} /> Editar</button>
                    <button onClick={() => remove(ev)} className="text-xs text-red-500 font-semibold flex items-center gap-1"><Trash2 size={12} /> Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalItems={filtered.length} pageSize={ADMIN_PAGE_SIZE} onChange={setPage} />
      <p className="text-[11px] text-stone-400">{events.length} eventos en la base de datos. Los registros MiniSEED del explorador se gestionan con los scripts del backend.</p>
    </div>
  );
}

/* ─────────────────────────────── Education ─────────────────────────────── */

function QuizEditor({ row, onSave, onCancel }: { row: Partial<QuizRow>; onSave: (r: Partial<QuizRow>) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState<Partial<QuizRow>>({ options: ['', '', '', ''], correct_index: 0, category: 'general', difficulty: 'medio', active: true, ...row });
  const opts = f.options || ['', '', '', ''];
  return (
    <form onSubmit={async e => {
      e.preventDefault();
      // La fuente es obligatoria: no se guarda una pregunta sin ella.
      if (!f.source?.trim()) { alert('La fuente es obligatoria.'); return; }
      await onSave({ ...f, source: f.source.trim(), source_url: f.source_url?.trim() || null });
    }} className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
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
      {/* Fuente obligatoria (no se puede guardar sin ella). */}
      <label className="text-xs text-stone-500 block">Fuente (obligatoria)<input required className={inputCls} placeholder="Autor (año). Título. Editorial o revista." value={f.source || ''} onChange={e => setF({ ...f, source: e.target.value })} /></label>
      <label className="text-xs text-stone-500 block">Enlace de la fuente (opcional)<input type="url" className={inputCls} placeholder="https://…" value={f.source_url || ''} onChange={e => setF({ ...f, source_url: e.target.value })} /></label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
    <form onSubmit={async e => {
      e.preventDefault();
      // La fuente es obligatoria: no se guarda un evento sin ella.
      if (!f.source?.trim()) { alert('La fuente es obligatoria.'); return; }
      await onSave({
        ...f,
        magnitude: f.magnitude?.trim() ? f.magnitude : null,
        event_date: f.event_date?.trim() || null,
        source: f.source.trim(),
        source_url: f.source_url?.trim() || null,
      });
    }} className="bg-stone-50 border border-stone-200 rounded-xl p-4 grid sm:grid-cols-4 gap-3">
      <label className="text-xs text-stone-500">Año<input type="number" required className={inputCls} value={f.year ?? ''} onChange={e => setF({ ...f, year: Number(e.target.value) })} /></label>
      <label className="text-xs text-stone-500">Fecha exacta (opcional)<input type="date" className={inputCls} value={f.event_date ?? ''} onChange={e => setF({ ...f, event_date: e.target.value })} /></label>
      <label className="text-xs text-stone-500">Magnitud (opcional)<input className={inputCls} placeholder="Mw 8.1 o ~7.0" value={f.magnitude ?? ''} onChange={e => setF({ ...f, magnitude: e.target.value })} /></label>
      <label className="text-xs text-stone-500">Tipo
        <select className={inputCls} value={f.event_type} onChange={e => setF({ ...f, event_type: e.target.value as 'tectonic' | 'volcanic' })}>
          <option value="tectonic">Tectónico</option><option value="volcanic">Volcánico</option>
        </select></label>
      <label className="text-xs text-stone-500 flex items-end gap-2 pb-2"><input type="checkbox" checked={f.active !== false} onChange={e => setF({ ...f, active: e.target.checked })} /> Activo</label>
      <label className="text-xs text-stone-500 sm:col-span-4">Título<input required className={inputCls} value={f.title || ''} onChange={e => setF({ ...f, title: e.target.value })} /></label>
      <label className="text-xs text-stone-500 sm:col-span-4">Descripción<textarea required rows={2} className={inputCls} value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })} /></label>
      <label className="text-xs text-stone-500 sm:col-span-4">Fuente (obligatoria)<input required className={inputCls} placeholder="Autor (año). Título. Editorial o institución." value={f.source || ''} onChange={e => setF({ ...f, source: e.target.value })} /></label>
      <label className="text-xs text-stone-500 sm:col-span-4">Enlace de la fuente (opcional)<input type="url" className={inputCls} placeholder="https://…" value={f.source_url || ''} onChange={e => setF({ ...f, source_url: e.target.value })} /></label>
      <div className="sm:col-span-4 flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className={btnGhost}><X size={13} /> Cancelar</button>
        <button type="submit" className={btnPrimary}><Check size={13} /> Guardar</button>
      </div>
    </form>
  );
}

function EducationTab({ notify }: { notify: (m: string, t?: 'ok' | 'error') => void }) {
  const [sub, setSub] = useState<EduTab>('quiz');
  const [page, setPage] = useState(1);
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

  // Total de la sub-lista activa y páginas (una sola barra para las tres).
  const subTotal = sub === 'quiz' ? quiz.length : sub === 'facts' ? facts.length : timeline.length;
  const start = (page - 1) * ADMIN_PAGE_SIZE;
  const end = page * ADMIN_PAGE_SIZE;
  const pagedQuiz = quiz.slice(start, end);
  const pagedFacts = facts.slice(start, end);
  const pagedTimeline = timeline.slice(start, end);
  useEffect(() => { setPage(1); }, [sub, quiz.length, facts.length, timeline.length]);

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
              className={`px-3 py-2 rounded-xl text-xs font-bold border ${sub === t.id ? 'bg-[#1A1A2E] text-white border-transparent' : 'bg-white text-stone-500 border-stone-200'}`}>
              {t.label} <span className="opacity-70">({t.count})</span>
            </button>
          ))}
        </div>
        <button onClick={() => setEditing({ kind: sub, row: {} })} className={btnPrimary}><Plus size={13} /> Nuevo</button>
      </div>

      {editing?.kind === 'quiz' && <QuizEditor row={editing.row as Partial<QuizRow>} onCancel={() => setEditing(null)} onSave={r => wrap(() => saveQuizRow(r), 'Pregunta guardada')} />}
      {editing?.kind === 'facts' && <FactEditor row={editing.row as Partial<WaveFactRow>} onCancel={() => setEditing(null)} onSave={r => wrap(() => saveFactRow(r), 'Dato guardado')} />}
      {editing?.kind === 'timeline' && <TimelineEditor row={editing.row as Partial<TimelineRow>} onCancel={() => setEditing(null)} onSave={r => wrap(() => saveTimelineRow(r), 'Hito guardado')} />}

      {loading ? <div className="py-10"><VolcanoLoader size={40} /></div> : (
        <div className="bg-white rounded-2xl border border-stone-200/60 divide-y divide-stone-100">
          {sub === 'quiz' && pagedQuiz.map(q => (
            <div key={q.id} className={`p-4 flex items-start gap-3 ${!q.active ? 'opacity-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#1A1A2E]">{q.question}</div>
                <div className="text-xs text-stone-500 mt-1">✓ {q.options?.[q.correct_index]} · <span className="uppercase">{q.category}</span> · {q.difficulty}{!q.active && ' · inactiva'}</div>
              </div>
              <RowActions onEdit={() => setEditing({ kind: 'quiz', row: q })} onDelete={() => confirmDel(q.question) && wrap(() => deleteQuizRow(q.id), 'Pregunta eliminada')} />
            </div>
          ))}
          {sub === 'facts' && pagedFacts.map(f => (
            <div key={f.id} className={`p-4 flex items-start gap-3 ${!f.active ? 'opacity-50' : ''}`}>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-[#2D6A4F]/10 text-[#2D6A4F] flex-shrink-0 w-16 text-center">{f.wave_type}</span>
              <div className="flex-1 text-sm text-stone-700">{f.fact}{!f.active && <span className="text-xs text-stone-400"> · inactivo</span>}</div>
              <RowActions onEdit={() => setEditing({ kind: 'facts', row: f })} onDelete={() => confirmDel(f.fact.slice(0, 40)) && wrap(() => deleteFactRow(f.id), 'Dato eliminado')} />
            </div>
          ))}
          {sub === 'timeline' && pagedTimeline.map(t => (
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
      {!loading && <Pagination page={page} totalItems={subTotal} pageSize={ADMIN_PAGE_SIZE} onChange={setPage} />}
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-2 flex-shrink-0">
      <button onClick={onEdit} className="p-1.5 rounded-lg text-[#2D6A4F] bg-[#2D6A4F]/5" title="Editar"><Pencil size={13} /></button>
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
  const [page, setPage] = useState(1);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setReports(await loadReports(from || undefined, to || undefined)); }
    catch (e) { notify(e instanceof Error ? e.message : 'Error cargando reportes', 'error'); }
    setLoading(false);
  }, [from, to, notify]);

  useEffect(() => { reload(); }, [reload]);

  const paged = reports.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE);
  useEffect(() => { setPage(1); }, [reports.length]);

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
            : paged.map(r => {
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
      {!loading && <Pagination page={page} totalItems={reports.length} pageSize={ADMIN_PAGE_SIZE} onChange={setPage} />}
    </div>
  );
}

/* ─────────────────────────────── Mensajes ─────────────────────────────── */

/** Color del punto según el estado del mensaje. */
const STATUS_DOT: Record<FeedbackStatus, string> = {
  nuevo: '#C4553A',
  leido: '#D4A853',
  respondido: '#2D6A4F',
};

/** Panel lateral con el detalle de un mensaje. */
function MessageDrawer({ m, onClose, onStatus, onDelete, busy }: {
  m: FeedbackMessage;
  onClose: () => void;
  onStatus: (s: FeedbackStatus) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#1A1A2E]/40" onClick={onClose}>
      <div className="w-full max-w-md h-full bg-white shadow-xl overflow-y-auto scrollbar-thin" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-stone-200/60 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_DOT[m.status] }} />
              <span className="font-bold text-[#1A1A2E]">{FEEDBACK_TYPE_LABELS[m.type]}</span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                m.user_id != null ? 'bg-[#2D6A4F]/10 text-[#2D6A4F]' : 'bg-stone-100 text-stone-500'
              }`}>
                {m.user_id != null ? <><UserCheck size={10} /> Investigador</> : <><Users size={10} /> Visitante</>}
              </span>
            </div>
            <div className="text-xs text-stone-400 mt-1">{fmtDate(m.created_at, true)}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-[11px] font-semibold text-stone-500 mb-1">Mensaje</div>
            <p className="text-sm text-[#1A1A2E] leading-relaxed whitespace-pre-wrap bg-stone-50 rounded-xl border border-stone-200/60 p-3.5">{m.message}</p>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-stone-500">Correo para responder</div>
            {m.email ? (
              <a href={`mailto:${m.email}`} className="text-sm mt-0.5 text-[#2D6A4F] font-semibold flex items-center gap-1.5 hover:underline">
                <Mail size={13} /> {m.email}
              </a>
            ) : (
              <div className="text-sm mt-0.5 text-stone-300">No dejó correo</div>
            )}
          </div>
          <div>
            <div className="text-[11px] font-semibold text-stone-500 mb-1.5">Estado</div>
            <div className="flex flex-wrap gap-2">
              {(['nuevo', 'leido', 'respondido'] as FeedbackStatus[]).map(s => (
                <button
                  key={s} disabled={busy} onClick={() => onStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 ${
                    m.status === s ? 'text-white border-transparent' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
                  }`}
                  style={m.status === s ? { backgroundColor: STATUS_DOT[s] } : undefined}
                >
                  {FEEDBACK_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-3 border-t border-stone-100">
            <button onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1.5 text-red-500 text-sm font-semibold hover:bg-red-50 px-3 py-2 rounded-lg disabled:opacity-40">
              <Trash2 size={14} /> Eliminar mensaje
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Origen del mensaje: investigador con sesión (user_id) o visitante anónimo. */
type MsgOrigin = 'investigador' | 'visitante';

function MessagesTab({ notify, onChange }: { notify: (m: string, t?: 'ok' | 'error') => void; onChange: () => void }) {
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState<MsgOrigin>('investigador');
  const [typeFilter, setTypeFilter] = useState<'' | FeedbackType>('');
  const [statusFilter, setStatusFilter] = useState<'' | FeedbackStatus>('');
  const [drawer, setDrawer] = useState<FeedbackMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setMessages(await listFeedback()); }
    catch (e) { notify(e instanceof Error ? e.message : 'Error cargando mensajes', 'error'); }
    setLoading(false);
  }, [notify]);

  useEffect(() => { reload(); }, [reload]);

  // Conteos por origen (para los badges de la segmentación).
  const counts = useMemo(() => ({
    investigador: messages.filter(m => m.user_id != null).length,
    visitante: messages.filter(m => m.user_id == null).length,
  }), [messages]);

  const filtered = useMemo(() => messages.filter(m => {
    const isInvestigador = m.user_id != null;
    if (origin === 'investigador' && !isInvestigador) return false;
    if (origin === 'visitante' && isInvestigador) return false;
    if (typeFilter && m.type !== typeFilter) return false;
    if (statusFilter && m.status !== statusFilter) return false;
    return true;
  }), [messages, origin, typeFilter, statusFilter]);

  const paged = filtered.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE);
  useEffect(() => { setPage(1); }, [origin, typeFilter, statusFilter, messages.length]);

  // Al abrir un mensaje "nuevo", pasarlo a "leído".
  const openDrawer = async (m: FeedbackMessage) => {
    setDrawer(m);
    if (m.status === 'nuevo') {
      try {
        await updateFeedbackStatus(m.id, 'leido');
        setMessages(prev => prev.map(x => x.id === m.id ? { ...x, status: 'leido' } : x));
        setDrawer(d => d && d.id === m.id ? { ...d, status: 'leido' } : d);
        onChange();
      } catch { /* si falla, se queda como nuevo */ }
    }
  };

  const changeStatus = async (id: string, status: FeedbackStatus) => {
    setBusy(true);
    try {
      await updateFeedbackStatus(id, status);
      setMessages(prev => prev.map(x => x.id === id ? { ...x, status } : x));
      setDrawer(d => d && d.id === id ? { ...d, status } : d);
      notify('Estado actualizado');
      onChange();
    } catch (e) { notify(e instanceof Error ? e.message : 'Error', 'error'); }
    setBusy(false);
  };

  const removeMessage = async (id: string) => {
    setBusy(true);
    try {
      await deleteFeedback(id);
      setMessages(prev => prev.filter(x => x.id !== id));
      setDrawer(null);
      notify('Mensaje eliminado');
      onChange();
    } catch (e) { notify(e instanceof Error ? e.message : 'Error', 'error'); }
    setBusy(false);
  };

  const emptyMsg = origin === 'investigador'
    ? (counts.investigador === 0 ? 'Ningún investigador ha escrito todavía.' : 'Ningún mensaje con esos filtros.')
    : (counts.visitante === 0 ? 'Ningún visitante ha escrito todavía.' : 'Ningún mensaje con esos filtros.');

  return (
    <div className="space-y-4">
      {/* Segmentación por origen: investigadores (con sesión) vs visitantes (anónimos) */}
      <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-1 w-fit">
        {([
          { id: 'investigador' as MsgOrigin, label: 'Investigadores', icon: <UserCheck size={14} />, n: counts.investigador },
          { id: 'visitante' as MsgOrigin, label: 'Visitantes', icon: <Users size={14} />, n: counts.visitante },
        ]).map(o => (
          <button key={o.id} onClick={() => setOrigin(o.id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              origin === o.id ? 'bg-white text-[#1A1A2E] shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}>
            {o.icon} {o.label}
            <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center ${
              origin === o.id ? 'bg-[#C4553A] text-white' : 'bg-stone-200 text-stone-500'
            }`}>{o.n}</span>
          </button>
        ))}
      </div>

      {/* Nota explicativa del origen seleccionado */}
      <p className="text-xs text-stone-400 -mt-1">
        {origin === 'investigador'
          ? 'Mensajes de usuarios con cuenta (investigadores registrados). Siempre dejan correo.'
          : 'Mensajes del formulario público de «Acerca de», enviados sin iniciar sesión.'}
      </p>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as '' | FeedbackType)} className={`${inputCls} sm:w-52`}>
          <option value="">Todos los tipos</option>
          {(Object.keys(FEEDBACK_TYPE_LABELS) as FeedbackType[]).map(t => <option key={t} value={t}>{FEEDBACK_TYPE_LABELS[t]}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as '' | FeedbackStatus)} className={`${inputCls} sm:w-44`}>
          <option value="">Todos los estados</option>
          {(Object.keys(FEEDBACK_STATUS_LABELS) as FeedbackStatus[]).map(s => <option key={s} value={s}>{FEEDBACK_STATUS_LABELS[s]}</option>)}
        </select>
        {(typeFilter || statusFilter) && (
          <button onClick={() => { setTypeFilter(''); setStatusFilter(''); }} className={btnGhost}>Limpiar</button>
        )}
        <button onClick={reload} className={btnGhost}><RefreshCw size={13} /> Actualizar</button>
        <div className="flex-1" />
        <span className="text-xs text-stone-400">{filtered.length} mensaje{filtered.length === 1 ? '' : 's'}</span>
      </div>

      {loading ? (
        <div className="py-12"><VolcanoLoader size={44} label="Cargando mensajes…" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <MessageSquare size={32} className="mx-auto text-stone-300" />
          <p className="text-sm mt-3">{emptyMsg}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200/60 divide-y divide-stone-100">
          {paged.map(m => {
            const isInvestigador = m.user_id != null;
            return (
              <button
                key={m.id} onClick={() => openDrawer(m)}
                className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-stone-50/60 transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ backgroundColor: STATUS_DOT[m.status] }} title={FEEDBACK_STATUS_LABELS[m.status]} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm ${m.status === 'nuevo' ? 'font-bold text-[#1A1A2E]' : 'font-semibold text-stone-600'}`}>{FEEDBACK_TYPE_LABELS[m.type]}</span>
                    {/* Badge de origen */}
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      isInvestigador ? 'bg-[#2D6A4F]/10 text-[#2D6A4F]' : 'bg-stone-100 text-stone-500'
                    }`}>
                      {isInvestigador ? <><UserCheck size={10} /> Investigador</> : <><Users size={10} /> Visitante</>}
                    </span>
                    {m.status === 'nuevo' && <span className="text-[10px] font-bold text-[#C4553A]">● Nuevo</span>}
                  </div>
                  <div className="text-sm text-stone-500 truncate mt-0.5">{m.message}</div>
                  {m.email && <div className="text-[11px] text-stone-400 flex items-center gap-1 mt-0.5"><Mail size={10} /> {m.email}</div>}
                </div>
                <span className="text-[11px] text-stone-400 flex-shrink-0">{fmtDate(m.created_at, true)}</span>
              </button>
            );
          })}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <Pagination page={page} totalItems={filtered.length} pageSize={ADMIN_PAGE_SIZE} onChange={setPage} />
      )}

      {drawer && (
        <MessageDrawer
          m={drawer}
          onClose={() => setDrawer(null)}
          onStatus={s => changeStatus(drawer.id, s)}
          onDelete={() => removeMessage(drawer.id)}
          busy={busy}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────── Dashboard ─────────────────────────────── */

export function AdminDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [newMessages, setNewMessages] = useState(0);
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

  const reloadNewMessages = useCallback(async () => {
    if (!supabase) return;
    try { setNewMessages(await countNewFeedback()); }
    catch { /* el contador es informativo; si falla, se deja en 0 */ }
  }, []);

  useEffect(() => { reloadStats(); reloadUsers(); reloadNewMessages(); }, [reloadStats, reloadUsers, reloadNewMessages]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'Resumen', icon: <BarChart3 size={16} /> },
    { id: 'users', label: 'Usuarios', icon: <Users size={16} /> },
    { id: 'events', label: 'Eventos sísmicos', icon: <Database size={16} /> },
    { id: 'education', label: 'Contenido educativo', icon: <BookOpen size={16} /> },
    { id: 'reports', label: 'Reportes', icon: <FileText size={16} /> },
    { id: 'mseed', label: 'Cargas MiniSEED', icon: <Upload size={16} /> },
    { id: 'messages', label: 'Mensajes', icon: <MessageSquare size={16} />, badge: newMessages },
  ];

  if (!supabase) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] pt-24 px-6 text-center text-stone-500 text-sm">
        Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env.
      </div>
    );
  }

  // Saludo según la hora del día.
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const todayLong = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16">
      {/* ── Cabecera: saludo + fecha + mini-stats ── */}
      <div className="bg-white border-b border-stone-200/60">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#C4553A] uppercase tracking-wide">{greeting}</p>
            <h1 className="text-[#1A1A2E] font-black text-2xl mt-0.5">
              {user?.full_name?.split(' ')[0] ?? 'Admin'} <span className="text-stone-300">·</span> Panel de administración
            </h1>
            <p className="text-stone-400 text-xs mt-0.5 capitalize">{todayLong}</p>
          </div>
          {stats && (
            <div className="flex gap-4 shrink-0">
              {[
                { v: stats.users, l: 'investigadores', color: '#2D6A4F' },
                { v: stats.reports, l: 'simulaciones', color: '#C4553A' },
                { v: newMessages, l: 'mensajes nuevos', color: newMessages > 0 ? '#D4A853' : '#A8A29E' },
              ].map(s => (
                <div key={s.l} className="text-center min-w-[56px]">
                  <div className="text-2xl font-black" style={{ color: s.color }}>{s.v}</div>
                  <div className="text-[10px] font-semibold text-stone-400 leading-tight">{s.l}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Tabs con indicador de línea inferior ── */}
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-none pb-px">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-colors border-b-2 ${
                  tab === t.id
                    ? 'text-[#C4553A] border-[#C4553A]'
                    : 'text-stone-400 border-transparent hover:text-stone-600'
                }`}>
                {t.icon}
                {t.label}
                {t.badge ? (
                  <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center bg-[#C4553A] text-white">
                    {t.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(26,26,46,0.035) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}>

        {tab === 'overview' && <Overview stats={stats} users={users} newMessages={newMessages} onRefresh={reloadStats} onGoTab={setTab} />}
        {tab === 'users' && <UsersTab users={users} meId={user?.id} onChange={() => { reloadUsers(); reloadStats(); }} notify={notify} />}
        {tab === 'events' && <EventsTab notify={notify} />}
        {tab === 'education' && <EducationTab notify={notify} />}
        {tab === 'reports' && <ReportsTab stats={stats} users={users} notify={notify} />}
        {tab === 'mseed' && <MseedTab notify={notify} />}
        {tab === 'messages' && <MessagesTab notify={notify} onChange={reloadNewMessages} />}
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MseedTab — Cargas MiniSEED por usuarios
   ═══════════════════════════════════════════════════════════════════════════ */

function MseedTab({ notify }: { notify: (m: string, t?: 'ok' | 'error') => void }) {
  const [logs, setLogs] = useState<import('../lib/adminData').MseedUploadLog[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterSuccess, setFilterSuccess] = useState<'all' | 'success' | 'fail'>('all');
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState<import('../lib/adminData').MseedUploadStats[]>([]);
  const [topUploaders, setTopUploaders] = useState<import('../lib/adminData').TopMseedUploader[]>([]);
  const [failureReasons, setFailureReasons] = useState<import('../lib/adminData').MseedFailureReason[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const filters: { success?: boolean; search?: string } = {};
      if (filterSuccess === 'success') filters.success = true;
      if (filterSuccess === 'fail') filters.success = false;
      if (search.trim()) filters.search = search.trim();

      const { logs: l, total } = await import('../lib/adminData').then(m => m.loadMseedUploadLogs(page, ADMIN_PAGE_SIZE, filters));
      setLogs(l);
      setTotalLogs(total);

      // Cargar estadísticas adicionales solo en la primera página
      if (page === 1) {
        const [statsData, topData, failData] = await Promise.all([
          import('../lib/adminData').then(m => m.loadMseedUploadStats(30)),
          import('../lib/adminData').then(m => m.loadTopMseedUploaders(10)),
          import('../lib/adminData').then(m => m.loadMseedFailureReasons(15)),
        ]);
        setStats(statsData);
        setTopUploaders(topData);
        setFailureReasons(failData);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Error cargando logs MiniSEED', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, filterSuccess, search, notify]);

  useEffect(() => { loadData(); }, [loadData]);

  const exportLogs = async (format: 'excel' | 'pdf') => {
    try {
      // Cargar TODOS los logs sin paginación para la exportación
      const filters: { success?: boolean; search?: string } = {};
      if (filterSuccess === 'success') filters.success = true;
      if (filterSuccess === 'fail') filters.success = false;
      if (search.trim()) filters.search = search.trim();

      const { logs: allLogs } = await import('../lib/adminData').then(m => m.loadMseedUploadLogs(1, 10000, filters));
      
      const input: import('../lib/adminExport').MseedLogsExportInput = {
        logs: allLogs,
        stats,
        topUploaders,
        failureReasons,
        period: {}, // Sin filtro de período por ahora
      };

      if (format === 'excel') {
        const { exportMseedLogsExcel } = await import('../lib/adminExport');
        exportMseedLogsExcel(input);
        notify('Excel descargado');
      } else {
        const { exportMseedLogsPdf } = await import('../lib/adminExport');
        exportMseedLogsPdf(input);
        notify('PDF descargado');
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Error exportando', 'error');
    }
  };

  const successCount = logs.filter(l => l.success).length;
  const failCount = logs.length - successCount;

  return (
    <div className="space-y-6">
      {/* ── Estadísticas resumidas ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">Total Cargas</p>
              <p className="text-3xl font-black text-[#1A1A2E] mt-1">{totalLogs}</p>
            </div>
            <Upload size={24} className="text-stone-300" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">Exitosas</p>
              <p className="text-3xl font-black text-[#2D6A4F] mt-1">{logs.filter(l => l.success).length}</p>
            </div>
            <Check size={24} className="text-[#2D6A4F]" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">Fallidas</p>
              <p className="text-3xl font-black text-[#C4553A] mt-1">{logs.filter(l => !l.success).length}</p>
            </div>
            <AlertTriangle size={24} className="text-[#C4553A]" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">Tasa Éxito</p>
              <p className="text-3xl font-black text-[#D4A853] mt-1">
                {totalLogs > 0 ? Math.round((stats.reduce((sum, s) => sum + s.successful_uploads, 0) / stats.reduce((sum, s) => sum + s.total_uploads, 0)) * 100) : 0}%
              </p>
            </div>
            <BarChart3 size={24} className="text-[#D4A853]" />
          </div>
        </div>
      </div>

      {/* ── Top usuarios y razones de fallo ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top usuarios */}
        <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
          <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-4 flex items-center gap-2">
            <UserCheck size={14} /> Top Usuarios
          </h3>
          {topUploaders.length === 0 ? (
            <p className="text-xs text-stone-400">Sin datos aún.</p>
          ) : (
            <ul className="space-y-2">
              {topUploaders.slice(0, 5).map((u, i) => (
                <li key={u.user_id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-stone-400 font-bold w-5">{i + 1}.</span>
                    <span className="font-medium text-[#1A1A2E] truncate">{u.user_name || u.user_email}</span>
                  </div>
                  <span className="text-[#2D6A4F] font-bold ml-2">{u.successful_uploads}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Razones de fallo */}
        <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
          <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-4 flex items-center gap-2">
            <AlertTriangle size={14} /> Razones de Fallo
          </h3>
          {failureReasons.length === 0 ? (
            <p className="text-xs text-stone-400">Sin fallos registrados.</p>
          ) : (
            <ul className="space-y-2">
              {failureReasons.slice(0, 5).map((f, i) => (
                <li key={i} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#1A1A2E] truncate flex-1">
                    {f.error_reason.split(':')[0].replace(/_/g, ' ')}
                  </span>
                  <span className="text-[#C4553A] font-bold ml-2">{f.failure_count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Tabla de logs ── */}
      <div className="bg-white rounded-2xl border border-stone-200/60">
        <div className="p-5 border-b border-stone-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="text-sm font-bold text-[#1A1A2E]">Logs de Cargas</h3>
            <div className="flex flex-wrap items-center gap-2">
              {/* Filtros */}
              <select value={filterSuccess} onChange={e => { setFilterSuccess(e.target.value as any); setPage(1); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50">
                <option value="all">Todas</option>
                <option value="success">Exitosas</option>
                <option value="fail">Fallidas</option>
              </select>

              <input type="text" placeholder="Buscar archivo, estación..." value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 w-48" />

              {/* Exportar */}
              <button onClick={() => exportLogs('excel')} className={btnGhost}>
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button onClick={() => exportLogs('pdf')} className={btnGhost}>
                <FileDown size={13} /> PDF
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <VolcanoLoader size={48} label="Cargando logs..." />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-stone-400 text-sm">
            <Upload size={48} className="mx-auto mb-3 text-stone-300" />
            <p className="font-semibold">No hay cargas MiniSEED registradas.</p>
            <p className="text-xs mt-1">Los investigadores aún no han subido archivos.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-stone-50 border-b border-stone-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-bold text-stone-500 uppercase tracking-wide">Fecha</th>
                    <th className="text-left px-4 py-3 font-bold text-stone-500 uppercase tracking-wide">Usuario</th>
                    <th className="text-left px-4 py-3 font-bold text-stone-500 uppercase tracking-wide">Archivo</th>
                    <th className="text-left px-4 py-3 font-bold text-stone-500 uppercase tracking-wide">Estado</th>
                    <th className="text-left px-4 py-3 font-bold text-stone-500 uppercase tracking-wide">Estación</th>
                    <th className="text-left px-4 py-3 font-bold text-stone-500 uppercase tracking-wide">Duración</th>
                    <th className="text-left px-4 py-3 font-bold text-stone-500 uppercase tracking-wide">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                      <td className="px-4 py-3 text-stone-600">{fmtDate(l.uploaded_at, true)}</td>
                      <td className="px-4 py-3 text-stone-700 font-medium truncate max-w-[150px]">
                        {l.profiles?.full_name || l.profiles?.email || 'Usuario'}
                      </td>
                      <td className="px-4 py-3 text-stone-600 font-mono text-[10px] truncate max-w-[200px]" title={l.filename}>
                        {l.filename}
                      </td>
                      <td className="px-4 py-3">
                        {l.success ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#2D6A4F]/10 text-[#2D6A4F] font-bold">
                            <Check size={10} /> OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#C4553A]/10 text-[#C4553A] font-bold">
                            <X size={10} /> Error
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-stone-600 font-semibold">{l.selected_station || '—'}</td>
                      <td className="px-4 py-3 text-stone-600">{l.duration_seconds ? `${l.duration_seconds.toFixed(1)}s` : '—'}</td>
                      <td className="px-4 py-3 text-[#C4553A] text-[10px] truncate max-w-[200px]" title={l.error_reason || ''}>
                        {l.error_reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-stone-100">
              <Pagination page={page} totalItems={totalLogs} pageSize={ADMIN_PAGE_SIZE} onChange={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
