/**
 * Acceso a datos del panel de administración.
 *
 * Centraliza las consultas y mutaciones sobre Supabase que usa el
 * `AdminDashboard`: usuarios (RF-05), eventos sísmicos (RF-15), contenido
 * educativo (RF-25), estadísticas (RF-22) y reportes (RF-23).
 * Todas las escrituras dependen de las policies RLS de administrador
 * definidas en `supabase/migrations/20260911_admin_features.sql`.
 * @module adminData
 */
import { supabase } from './supabase';
import type { SeismicEvent } from './types';
import type { UserRole } from './authTypes';

// ─── Tipos ───

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  institution: string;
  occupation: string;
  research_area: string;
  city: string;
  country: string;
  usage_purpose: string;
  active: boolean;
  /** 'usuario' | 'administrador' | null (activa). Origen de la desactivación. */
  deactivated_by: string | null;
  deactivation_reason: string | null;
  created_at: string;
  last_login: string | null;
  data_authorization_at: string | null;
}

export interface AdminReport {
  id: string;
  user_id: string;
  title: string;
  notes: string;
  created_at: string;
  params: Record<string, unknown>;
  results: Record<string, unknown>;
  profiles?: { full_name: string; email: string } | null;
}

export interface QuizRow {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  category: string;
  difficulty: string;
  active: boolean;
  /** Fuente de la respuesta (obligatoria en el formulario). */
  source: string;
  /** Enlace a la fuente (opcional). */
  source_url: string | null;
}

export interface WaveFactRow {
  id: string;
  wave_type: string;
  fact: string;
  active: boolean;
}

export interface TimelineRow {
  id: string;
  year: number;
  magnitude: string | null;
  title: string;
  description: string;
  event_type: 'tectonic' | 'volcanic';
  active: boolean;
  /** Fecha exacta (YYYY-MM-DD) o null. */
  event_date: string | null;
  /** Fuente del evento (obligatoria en el formulario). */
  source: string;
  /** Enlace a la fuente (opcional). */
  source_url: string | null;
}

export interface DashboardStats {
  users: number;
  activeUsers: number;
  events: number;
  reports: number;
  questions: number;
  facts: number;
  timeline: number;
  roles: { admin: number; user: number };
  /** Total de cuentas eliminadas (bitácora account_deletions). */
  deletedAccounts: number;
  /** Reportes por mes (últimos 6 meses), en orden cronológico. */
  reportsPerMonth: { label: string; count: number }[];
  /** Últimos accesos (10 más recientes). */
  lastLogins: { full_name: string; email: string; last_login: string }[];
  /** Eventos por tipo en la BD. */
  eventsByType: { tectonic: number; volcanic: number };
}

type SeismicEventInput = Omit<SeismicEvent, 'id'>;

function ensure() {
  if (!supabase) throw new Error('Supabase no está configurado.');
  return supabase;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// ─── Estadísticas (RF-22) ───

export async function loadDashboardStats(): Promise<DashboardStats> {
  const sb = ensure();
  const head = { count: 'exact' as const, head: true };
  const results = await Promise.all([
    sb.from('profiles').select('*', head),
    sb.from('profiles').select('*', head).eq('active', true),
    sb.from('profiles').select('*', head).eq('role', 'admin'),
    sb.from('seismic_events').select('*', head),
    sb.from('seismic_events').select('*', head).eq('event_type', 'tectonic'),
    sb.from('simulation_reports').select('*', head),
    sb.from('quiz_questions').select('*', head),
    sb.from('wave_facts').select('*', head),
    sb.from('timeline_events').select('*', head),
    sb.from('account_deletions').select('*', head),
  ]);
  const [users, activeUsers, admins, events, tectonic, reports, questions, facts, timeline, deletedAccounts] = results.map(r => r.count || 0);

  // Reportes por mes: últimos 6 meses.
  const since = new Date();
  since.setMonth(since.getMonth() - 5);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  const { data: recent } = await sb.from('simulation_reports').select('created_at').gte('created_at', since.toISOString());
  const buckets: { label: string; count: number; key: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(since);
    d.setMonth(since.getMonth() + i);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('es-CO', { month: 'short' }), count: 0 });
  }
  for (const r of recent || []) {
    const d = new Date(r.created_at as string);
    const b = buckets.find(x => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (b) b.count++;
  }

  const { data: logins } = await sb
    .from('profiles')
    .select('full_name, email, last_login')
    .not('last_login', 'is', null)
    .order('last_login', { ascending: false })
    .limit(10);

  return {
    users,
    activeUsers,
    events,
    reports,
    questions,
    facts,
    timeline,
    roles: { admin: admins, user: users - admins },
    deletedAccounts,
    reportsPerMonth: buckets.map(({ label, count }) => ({ label, count })),
    lastLogins: (logins || []) as DashboardStats['lastLogins'],
    eventsByType: { tectonic, volcanic: events - tectonic },
  };
}

// ─── Usuarios (RF-05) ───

export async function loadUsers(): Promise<AdminUser[]> {
  const sb = ensure();
  const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  fail(error);
  return (data || []).map(d => ({
    id: d.id, email: d.email, full_name: d.full_name ?? '', role: d.role as UserRole,
    institution: d.institution ?? '', occupation: d.occupation ?? '', research_area: d.research_area ?? '',
    city: d.city ?? '', country: d.country ?? '', usage_purpose: d.usage_purpose ?? '',
    active: d.active ?? true,
    deactivated_by: d.deactivated_by ?? null, deactivation_reason: d.deactivation_reason ?? null,
    created_at: d.created_at, last_login: d.last_login ?? null,
    data_authorization_at: d.data_authorization_at ?? null,
  }));
}

export async function setUserRole(id: string, role: 'user' | 'admin'): Promise<void> {
  const { error } = await ensure().from('profiles').update({ role }).eq('id', id);
  fail(error);
}

/** Desactiva una cuenta por decisión del administrador, con motivo (RF-05). */
export async function deactivateUser(id: string, reason: string): Promise<void> {
  const { error } = await ensure().from('profiles').update({
    active: false,
    deactivated_by: 'administrador',
    deactivated_at: new Date().toISOString(),
    deactivation_reason: reason,
  }).eq('id', id);
  fail(error);
}

/** Reactiva cualquier cuenta (la haya desactivado quien sea). */
export async function reactivateUser(id: string): Promise<void> {
  const { error } = await ensure().from('profiles').update({
    active: true, deactivated_by: null, deactivated_at: null, deactivation_reason: null,
  }).eq('id', id);
  fail(error);
}

/**
 * Elimina la cuenta de un usuario a través del backend seguro (el mismo
 * mecanismo que la eliminación desde el perfil): verifica el JWT del admin y
 * borra con la clave de servicio. Bloquea eliminar al único administrador.
 */
export async function deleteUser(id: string, reason?: string): Promise<void> {
  const sb = ensure();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('No hay una sesión activa. Vuelve a iniciar sesión.');

  const base = import.meta.env.VITE_API_URL || '';
  const res = await fetch(`${base}/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason ?? null }),
  });
  if (res.ok) return;
  let detail = 'No se pudo eliminar la cuenta.';
  try {
    const body = await res.json();
    if (body?.detail) detail = String(body.detail);
  } catch { /* sin cuerpo JSON */ }
  throw new Error(detail);
}

// ─── Eventos sísmicos (RF-15) ───

export async function loadEvents(): Promise<SeismicEvent[]> {
  const { data, error } = await ensure().from('seismic_events').select('*').order('event_date', { ascending: false }).limit(500);
  fail(error);
  return (data || []) as SeismicEvent[];
}

export async function createEvent(ev: SeismicEventInput): Promise<SeismicEvent> {
  const { data, error } = await ensure().from('seismic_events').insert(ev).select().single();
  fail(error);
  return data as SeismicEvent;
}

export async function updateEvent(id: string, ev: Partial<SeismicEventInput>): Promise<void> {
  const { error } = await ensure().from('seismic_events').update(ev).eq('id', id);
  fail(error);
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await ensure().from('seismic_events').delete().eq('id', id);
  fail(error);
}

/** Inserta eventos importados en lote (máx. 500 por llamada). */
export async function bulkInsertEvents(events: SeismicEventInput[]): Promise<number> {
  if (events.length === 0) return 0;
  const sb = ensure();
  let inserted = 0;
  for (let i = 0; i < events.length; i += 500) {
    const chunk = events.slice(i, i + 500);
    const { error, data } = await sb.from('seismic_events').insert(chunk).select('id');
    fail(error);
    inserted += data?.length ?? chunk.length;
  }
  return inserted;
}

// ─── Contenido educativo (RF-25) ───

export async function loadQuizRows(): Promise<QuizRow[]> {
  const { data, error } = await ensure().from('quiz_questions').select('*').order('created_at', { ascending: false });
  fail(error);
  return (data || []) as QuizRow[];
}

export async function saveQuizRow(row: Partial<QuizRow> & { id?: string }): Promise<void> {
  const sb = ensure();
  const { id, ...rest } = row;
  const { error } = id
    ? await sb.from('quiz_questions').update(rest).eq('id', id)
    : await sb.from('quiz_questions').insert(rest);
  fail(error);
}

export async function deleteQuizRow(id: string): Promise<void> {
  const { error } = await ensure().from('quiz_questions').delete().eq('id', id);
  fail(error);
}

export async function loadFactRows(): Promise<WaveFactRow[]> {
  const { data, error } = await ensure().from('wave_facts').select('*').order('wave_type').order('created_at');
  fail(error);
  return (data || []) as WaveFactRow[];
}

export async function saveFactRow(row: Partial<WaveFactRow> & { id?: string }): Promise<void> {
  const sb = ensure();
  const { id, ...rest } = row;
  const { error } = id
    ? await sb.from('wave_facts').update(rest).eq('id', id)
    : await sb.from('wave_facts').insert(rest);
  fail(error);
}

export async function deleteFactRow(id: string): Promise<void> {
  const { error } = await ensure().from('wave_facts').delete().eq('id', id);
  fail(error);
}

export async function loadTimelineRows(): Promise<TimelineRow[]> {
  const { data, error } = await ensure().from('timeline_events').select('*').order('year');
  fail(error);
  return (data || []) as TimelineRow[];
}

export async function saveTimelineRow(row: Partial<TimelineRow> & { id?: string }): Promise<void> {
  const sb = ensure();
  const { id, ...rest } = row;
  const { error } = id
    ? await sb.from('timeline_events').update(rest).eq('id', id)
    : await sb.from('timeline_events').insert(rest);
  fail(error);
}

export async function deleteTimelineRow(id: string): Promise<void> {
  const { error } = await ensure().from('timeline_events').delete().eq('id', id);
  fail(error);
}

// ─── Reportes (RF-23) ───

export async function loadReports(from?: string, to?: string): Promise<AdminReport[]> {
  let q = ensure().from('simulation_reports').select('*, profiles(full_name, email)').order('created_at', { ascending: false }).limit(1000);
  if (from) q = q.gte('created_at', `${from}T00:00:00`);
  if (to) q = q.lte('created_at', `${to}T23:59:59`);
  const { data, error } = await q;
  fail(error);
  return (data || []) as unknown as AdminReport[];
}

export async function deleteReport(id: string): Promise<void> {
  const { error } = await ensure().from('simulation_reports').delete().eq('id', id);
  fail(error);
}

// ─── Cargas MiniSEED (RF tracking de uso) ───

export interface MseedUploadLog {
  id: string;
  user_id: string;
  filename: string;
  file_size_bytes: number | null;
  success: boolean;
  error_reason: string | null;
  station_count: number | null;
  selected_station: string | null;
  channels: string[] | null;
  duration_seconds: number | null;
  sample_rate_hz: number | null;
  start_time: string | null;
  end_time: string | null;
  detrend_applied: boolean | null;
  bandpass_applied: boolean | null;
  bandpass_freq_min_hz: number | null;
  bandpass_freq_max_hz: number | null;
  decimation_factor: number | null;
  final_sample_count: number | null;
  uploaded_at: string;
  processing_time_ms: number | null;
  // Join con profiles
  profiles?: { full_name: string; email: string } | null;
}

export interface MseedUploadStats {
  upload_date: string;
  total_uploads: number;
  successful_uploads: number;
  failed_uploads: number;
  success_rate_pct: number;
  unique_users: number;
  avg_processing_time_ms: number;
  total_bytes_processed: number;
}

export interface TopMseedUploader {
  user_id: string;
  user_email: string;
  user_name: string;
  total_uploads: number;
  successful_uploads: number;
  failed_uploads: number;
  success_rate_pct: number;
  total_duration_hours: number;
  last_upload: string;
}

export interface MseedFailureReason {
  error_reason: string;
  failure_count: number;
  percentage: number;
  example_filename: string;
  last_occurrence: string;
}

/**
 * Carga los logs de cargas MiniSEED con paginación y filtros.
 */
export async function loadMseedUploadLogs(
  page: number = 1,
  pageSize: number = 10,
  filters?: { success?: boolean; search?: string; dateFrom?: string; dateTo?: string }
): Promise<{ logs: MseedUploadLog[]; total: number }> {
  if (!supabase) return { logs: [], total: 0 };

  // NOTA: NO se usa un JOIN embebido profiles(...) porque mseed_upload_logs
  // tiene su FK hacia auth.users, no hacia profiles; PostgREST no encuentra la
  // relación y la consulta falla (y el panel queda vacío). Se resuelven los
  // perfiles con una segunda consulta por user_id.
  let query = supabase
    .from('mseed_upload_logs')
    .select('*', { count: 'exact' })
    .order('uploaded_at', { ascending: false });

  if (filters?.success !== undefined) {
    query = query.eq('success', filters.success);
  }
  if (filters?.search) {
    query = query.or(`filename.ilike.%${filters.search}%,selected_station.ilike.%${filters.search}%,error_reason.ilike.%${filters.search}%`);
  }
  if (filters?.dateFrom) {
    query = query.gte('uploaded_at', filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte('uploaded_at', filters.dateTo);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  const logs = (data as MseedUploadLog[]) || [];

  // Resolver nombre/email de cada usuario con una sola consulta a profiles.
  const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))];
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);
    const byId = new Map((profs ?? []).map(p => [p.id, p]));
    for (const log of logs) {
      const p = byId.get(log.user_id);
      log.profiles = p ? { full_name: p.full_name, email: p.email } : null;
    }
  }

  return { logs, total: count || 0 };
}

/**
 * Obtiene estadísticas agregadas por día de cargas MiniSEED.
 */
export async function loadMseedUploadStats(limit: number = 30): Promise<MseedUploadStats[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('mseed_upload_stats')
    .select('*')
    .order('upload_date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as MseedUploadStats[]) || [];
}

/**
 * Obtiene top N usuarios por cargas exitosas.
 */
export async function loadTopMseedUploaders(limit: number = 10): Promise<TopMseedUploader[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('get_top_mseed_uploaders', { limit_count: limit });
  if (error) throw error;
  return (data as TopMseedUploader[]) || [];
}

/**
 * Obtiene las razones de fallo más comunes.
 */
export async function loadMseedFailureReasons(limit: number = 20): Promise<MseedFailureReason[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('get_mseed_failure_reasons', { limit_count: limit });
  if (error) throw error;
  return (data as MseedFailureReason[]) || [];
}

/**
 * Refresca la vista materializada de estadísticas (ejecuta refresh_mseed_upload_stats).
 */
export async function refreshMseedStats(): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase.rpc('refresh_mseed_upload_stats');
  if (error) throw error;
}
