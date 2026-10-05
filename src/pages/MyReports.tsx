import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../lib/authContext';
import { supabase } from '../lib/supabase';
import {
  FileText, Trash2, Download, Calendar, FileDown, Search, X, Activity, Box,
  Waves, AlertTriangle, HelpCircle,
} from '../lib/icons';
import { downloadReportPdf, SavedResults } from '../lib/reportPdf';
import { downloadMap3dPdf, downloadMap3dCsv, downloadMap3dJson, type Map3dReportData, type Map3dReportOptions } from '../lib/map3dReport';
import type { SimulationParams, Page } from '../lib/types';
import { VolcanoLoader } from '../components/ui/VolcanoLoader';
import { Pagination } from '../components/ui/Pagination';
import { Tooltip } from '../components/ui/Tooltip';

/** Reportes por página en la lista. */
const REPORTS_PER_PAGE = 8;

/** Resultados guardados: de simulación (waveData/métricas) o de Mapa 3D. */
type StoredResults = SavedResults & {
  report_type?: 'simulation' | 'map3d';
  map3d?: Map3dReportData;
  options?: Map3dReportOptions;
};

interface Report {
  id: string;
  title: string;
  params: SimulationParams;
  results: StoredResults;
  notes: string;
  created_at: string;
}

interface Props {
  /** Navega a otra página (para los botones del estado vacío). */
  onNavigate?: (page: Page) => void;
}

type Origin = 'simulation' | 'map3d';
type SortKey = 'date' | 'magnitude';

/** Datos normalizados de un reporte, independientes de su tipo. */
interface ReportMeta {
  origin: Origin;
  magnitude: number | null;
  sourceType: 'tectonic' | 'volcanic' | null;
  /** Distancia epicentral en km (Mapa 3D: estación más cercana) o null. */
  distanceKm: number | null;
  /** Profundidad del foco en km o null. */
  depthKm: number | null;
  hasSeismograms: boolean;
}

/** Extrae los metadatos comunes de un reporte, sea de simulación o de Mapa 3D. */
function reportMeta(r: Report): ReportMeta {
  const isMap3d = r.results?.report_type === 'map3d' && !!r.results.map3d;
  if (isMap3d) {
    const m = r.results.map3d!;
    // Distancia epicentral de la estación más cercana (si hay estaciones).
    const dist = m.stations && m.stations.length > 0
      ? Math.min(...m.stations.map(s => s.distancia_epicentral_km))
      : null;
    const hasSeis = Boolean(
      (m.seismogram && m.seismogram.t && m.seismogram.t.length > 1) ||
      (m.traces && m.traces.length > 0),
    );
    return {
      origin: 'map3d',
      magnitude: typeof m.magnitude === 'number' ? m.magnitude : null,
      sourceType: m.sourceType ?? null,
      distanceKm: dist,
      depthKm: m.epicenter?.depthKm ?? null,
      hasSeismograms: hasSeis,
    };
  }
  const p = r.params;
  return {
    origin: 'simulation',
    magnitude: typeof p?.magnitude === 'number' ? p.magnitude : null,
    sourceType: p?.sourceType ?? null,
    distanceKm: null, // la simulación usa un receptor virtual, no una distancia fija
    depthKm: typeof p?.depth === 'number' ? p.depth : null,
    hasSeismograms: Boolean(r.results?.waveData),
  };
}

/** Fecha ISO -> "d mmm yyyy" en español (sin punto medio). */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

const SOURCE_LABEL: Record<'tectonic' | 'volcanic', string> = {
  tectonic: 'Tectónica',
  volcanic: 'Volcánica',
};

export function MyReports({ onNavigate }: Props) {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filtros ──
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [origin, setOrigin] = useState<'all' | Origin>('all');
  const [source, setSource] = useState<'all' | 'tectonic' | 'volcanic'>('all');
  const [magMin, setMagMin] = useState('');
  const [magMax, setMagMax] = useState('');
  const [onlySeismograms, setOnlySeismograms] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [page, setPage] = useState(1);

  // Confirmación de borrado (con el nombre del reporte).
  const [toDelete, setToDelete] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!supabase || !user) { setLoading(false); return; }
    supabase.from('simulation_reports').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError('No se pudieron cargar los reportes.');
        if (data) setReports(data as Report[]);
        setLoading(false);
      });
  }, [user]);

  const confirmDelete = async () => {
    if (!supabase || !toDelete) return;
    setDeleting(true);
    try {
      await supabase.from('simulation_reports').delete().eq('id', toDelete.id);
      setReports(r => r.filter(rep => rep.id !== toDelete.id));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  /** Exporta los datos crudos del reporte en JSON. */
  const exportJSON = (report: Report) => {
    const data = JSON.stringify({ title: report.title, params: report.params, results: report.results, notes: report.notes, date: report.created_at }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${report.title.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** ¿Es un reporte del Mapa 3D? (guardado con report_type='map3d'). */
  const isMap3d = (r: Report) => r.results?.report_type === 'map3d' && !!r.results.map3d;

  /** Opciones por defecto para regenerar un reporte 3D si no se guardaron. */
  const map3dOpts = (r: Report): Map3dReportOptions =>
    r.results.options ?? { epicentro: true, parametros: true, vista3d: true, tiemposViaje: true, mapa: true, registro: true, sismograma: false };

  /** Genera el PDF del reporte (simulación RF-19 o Mapa 3D según su tipo). */
  const exportPDF = (report: Report) => {
    if (isMap3d(report)) {
      downloadMap3dPdf(report.results.map3d!, map3dOpts(report));
      return;
    }
    downloadReportPdf({
      title: report.title,
      author: user?.full_name || user?.email,
      notes: report.notes,
      createdAt: report.created_at,
      params: report.params,
      results: report.results,
    });
  };

  /** Descarga el CSV (solo aplica a reportes del Mapa 3D). */
  const exportMap3dCsv = (report: Report) => {
    if (isMap3d(report)) downloadMap3dCsv(report.results.map3d!, map3dOpts(report));
  };

  /** Descarga el JSON (solo aplica a reportes del Mapa 3D). */
  const exportMap3dJson = (report: Report) => {
    if (isMap3d(report)) downloadMap3dJson(report.results.map3d!, map3dOpts(report));
  };

  // ── Aplicar filtros + orden ──
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : null;
    const min = magMin !== '' ? Number(magMin) : null;
    const max = magMax !== '' ? Number(magMax) : null;

    const rows = reports.filter(r => {
      const meta = reportMeta(r);
      if (q && !(`${r.title} ${r.notes ?? ''}`.toLowerCase().includes(q))) return false;
      const d = new Date(r.created_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (origin !== 'all' && meta.origin !== origin) return false;
      if (source !== 'all' && meta.sourceType !== source) return false;
      if (min != null && (meta.magnitude == null || meta.magnitude < min)) return false;
      if (max != null && (meta.magnitude == null || meta.magnitude > max)) return false;
      if (onlySeismograms && !meta.hasSeismograms) return false;
      return true;
    });

    rows.sort((a, b) => {
      if (sortKey === 'magnitude') {
        const ma = reportMeta(a).magnitude ?? -Infinity;
        const mb = reportMeta(b).magnitude ?? -Infinity;
        if (mb !== ma) return mb - ma; // mayor magnitud primero
      }
      // Por fecha (desc) como criterio principal o desempate.
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return rows;
  }, [reports, query, dateFrom, dateTo, origin, source, magMin, magMax, onlySeismograms, sortKey]);

  // Al cambiar cualquier filtro, orden o la propia lista, vuelve a la página 1
  // para no quedar en una página que ya no existe (lista vacía).
  useEffect(() => {
    setPage(1);
  }, [query, dateFrom, dateTo, origin, source, magMin, magMax, onlySeismograms, sortKey, reports.length]);

  // Reportes de la página actual.
  const paged = filtered.slice((page - 1) * REPORTS_PER_PAGE, page * REPORTS_PER_PAGE);

  const hasFilters = Boolean(
    query || dateFrom || dateTo || origin !== 'all' || source !== 'all' ||
    magMin || magMax || onlySeismograms,
  );

  const clearFilters = () => {
    setQuery(''); setDateFrom(''); setDateTo(''); setOrigin('all');
    setSource('all'); setMagMin(''); setMagMax(''); setOnlySeismograms(false);
  };

  const inputCls = 'w-full px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs focus:outline-none focus:border-[#C4553A] bg-white';

  // Saludo según la hora del día (toque personal) + fecha de hoy.
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const firstName = (user?.full_name || user?.email || '').split(/\s+/)[0];
  const todayLong = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16">
      {/* Encabezado */}
      <div className="bg-white border-b border-stone-200/60 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs font-semibold text-[#C4553A] uppercase tracking-wide">{greeting}{firstName ? `, ${firstName}` : ''}</p>
          <h1 className="text-[#1A1A2E] font-black text-2xl flex items-center gap-2 mt-0.5">
            <FileText size={22} className="text-[#C4553A]" />
            Mis reportes
          </h1>
          <p className="text-stone-400 text-xs mt-0.5 capitalize">{todayLong}</p>
          <p className="text-stone-400 text-xs mt-0.5">
            Simulaciones guardadas por <span className="break-all">{user?.full_name || user?.email}</span>
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="py-12"><VolcanoLoader size={44} label="Cargando reportes…" /></div>
        ) : error ? (
          <div className="text-center py-12 text-red-500 text-sm">{error}</div>
        ) : reports.length === 0 ? (
          // ── Estado vacío: sin ningún reporte guardado ──
          <div className="text-center py-14 max-w-md mx-auto">
            <FileText size={40} className="text-stone-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-stone-500 mb-2">No tienes reportes aún</h3>
            <p className="text-stone-400 text-sm mb-5">
              Genera una simulación o un análisis del Mapa 3D y guárdalo para verlo aquí.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button onClick={() => onNavigate?.('simulation')}
                className="flex items-center gap-2 bg-[#C4553A] text-white px-4 py-2.5 rounded-xl font-bold text-sm btn-hover">
                <Activity size={15} /> Ir al Simulador
              </button>
              <button onClick={() => onNavigate?.('map3d')}
                className="flex items-center gap-2 bg-[#2D6A4F] text-white px-4 py-2.5 rounded-xl font-bold text-sm btn-hover">
                <Box size={15} /> Ir al Mapa 3D
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Barra de filtros ── */}
            <div className="bg-white rounded-xl border border-stone-200/60 p-3 sm:p-4 mb-4 space-y-3">
              {/* Búsqueda + orden */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"><Search size={14} /></span>
                  <input
                    type="text" value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="Buscar por nombre o nota"
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-stone-200 text-xs focus:outline-none focus:border-[#C4553A] bg-white"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] text-stone-500 whitespace-nowrap">Ordenar por</label>
                  <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
                    className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs focus:outline-none focus:border-[#C4553A] bg-white">
                    <option value="date">Fecha</option>
                    <option value="magnitude">Magnitud</option>
                  </select>
                </div>
              </div>

              {/* Filtros en rejilla responsive */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-stone-500 block mb-0.5">Desde</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-stone-500 block mb-0.5">Hasta</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-stone-500 block mb-0.5">Origen</label>
                  <select value={origin} onChange={e => setOrigin(e.target.value as 'all' | Origin)} className={inputCls}>
                    <option value="all">Todos</option>
                    <option value="simulation">Simulador triaxial</option>
                    <option value="map3d">Mapa 3D</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-stone-500 block mb-0.5">Tipo de fuente</label>
                  <select value={source} onChange={e => setSource(e.target.value as 'all' | 'tectonic' | 'volcanic')} className={inputCls}>
                    <option value="all">Todas</option>
                    <option value="tectonic">Tectónica</option>
                    <option value="volcanic">Volcánica</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-stone-500 block mb-0.5">Magnitud mín.</label>
                  <input type="number" step="0.1" min="0" max="10" value={magMin} onChange={e => setMagMin(e.target.value)} placeholder="0" className={inputCls} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-stone-500 block mb-0.5">Magnitud máx.</label>
                  <input type="number" step="0.1" min="0" max="10" value={magMax} onChange={e => setMagMax(e.target.value)} placeholder="10" className={inputCls} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer py-1.5">
                    <input type="checkbox" checked={onlySeismograms} onChange={e => setOnlySeismograms(e.target.checked)}
                      className="accent-[#C4553A]" />
                    Con sismogramas
                    <Tooltip content="Filtra solo reportes que incluyen las series de tiempo completas (waveData). Los reportes sin sismogramas solo guardan parámetros y métricas agregadas.">
                      <HelpCircle size={12} className="text-stone-400" />
                    </Tooltip>
                  </label>
                </div>
              </div>

              {/* Contador + limpiar */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-stone-500">
                  {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
                  {hasFilters ? ` de ${reports.length}` : ''}
                </span>
                {hasFilters && (
                  <button onClick={clearFilters}
                    className="flex items-center gap-1 text-[11px] font-semibold text-stone-500 hover:text-[#C4553A] transition-colors">
                    <X size={12} /> Limpiar filtros
                  </button>
                )}
              </div>
            </div>

            {/* ── Lista de reportes ── */}
            {filtered.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-stone-200/60">
                <Search size={32} className="text-stone-300 mx-auto mb-3" />
                <p className="text-stone-500 text-sm font-semibold">Ningún reporte coincide con los filtros</p>
                <button onClick={clearFilters} className="text-xs text-[#C4553A] font-semibold mt-2 hover:underline">
                  Limpiar filtros
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {paged.map(r => {
                  const meta = reportMeta(r);
                  const map3d = meta.origin === 'map3d';
                  return (
                    <div key={r.id} className="bg-white rounded-xl border border-stone-200/60 p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 card-hover">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${map3d ? 'bg-[#2D6A4F]/10' : 'bg-[#C4553A]/10'}`}>
                        {map3d ? <Box size={18} className="text-[#2D6A4F]" /> : <Activity size={18} className="text-[#C4553A]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-[#1A1A2E] text-sm">{r.title}</h3>
                          {/* Etiqueta de origen con ícono */}
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                            map3d ? 'bg-[#2D6A4F]/10 text-[#2D6A4F]' : 'bg-[#C4553A]/10 text-[#C4553A]'
                          }`}>
                            {map3d ? <Box size={10} /> : <Activity size={10} />}
                            {map3d ? 'Mapa 3D' : 'Simulador'}
                          </span>
                        </div>
                        {/* Metadatos de la fila, separados con viñetas • (sin punto medio del texto) */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 mt-1">
                          <span className="flex items-center gap-1"><Calendar size={11} /> {fmtDate(r.created_at)}</span>
                          {meta.magnitude != null && meta.sourceType && (
                            <span>Mw {meta.magnitude.toFixed(1)} {SOURCE_LABEL[meta.sourceType].toLowerCase()}</span>
                          )}
                          {meta.magnitude != null && !meta.sourceType && (
                            <span>Mw {meta.magnitude.toFixed(1)}</span>
                          )}
                          {meta.distanceKm != null && <span>{meta.distanceKm.toFixed(0)} km</span>}
                          {meta.depthKm != null && <span>Prof. {meta.depthKm} km</span>}
                          {meta.hasSeismograms
                            ? <span className="inline-flex items-center gap-1 text-[#2D6A4F]"><Waves size={11} /> Con sismogramas</span>
                            : <span className="text-stone-400">Solo métricas</span>}
                          {r.notes && <span className="truncate max-w-[220px] text-stone-400">{r.notes}</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 flex-shrink-0">
                        <button onClick={() => exportPDF(r)} title="Descargar reporte PDF"
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#C4553A]/5 text-[#C4553A] border border-[#C4553A]/20 text-xs font-bold">
                          <FileDown size={14} /> PDF
                        </button>
                        {map3d && (
                          <button onClick={() => exportMap3dCsv(r)} title="Descargar CSV" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#2D6A4F]/5 text-[#2D6A4F] border border-[#2D6A4F]/20 text-xs font-bold">
                            <Download size={14} /> CSV
                          </button>
                        )}
                        <button
                          onClick={() => map3d ? exportMap3dJson(r) : exportJSON(r)}
                          title="Descargar JSON"
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#6B5B95]/5 text-[#6B5B95] border border-[#6B5B95]/20 text-xs font-bold">
                          <FileText size={14} /> JSON
                        </button>
                        <button onClick={() => setToDelete(r)} title="Eliminar" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-500 border border-red-100 text-xs font-bold">
                          <Trash2 size={14} /> Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
                <Pagination
                  page={page}
                  totalItems={filtered.length}
                  pageSize={REPORTS_PER_PAGE}
                  onChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Diálogo de confirmación de borrado (con el nombre del reporte) ── */}
      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A2E]/50 px-4" onClick={() => !deleting && setToDelete(null)}>
          <div className="bg-white rounded-2xl border border-stone-200/60 shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center mb-3">
              <AlertTriangle size={22} className="text-red-500" />
            </div>
            <h3 className="text-lg font-black" style={{ color: '#1A1A2E' }}>Eliminar reporte</h3>
            <p className="text-sm mt-2 leading-relaxed text-stone-500">
              Se eliminará <b className="text-[#1A1A2E]">{toDelete.title}</b> de forma permanente. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={confirmDelete} disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-50">
                {deleting ? 'Eliminando…' : 'Eliminar definitivamente'} <Trash2 size={15} />
              </button>
              <button onClick={() => setToDelete(null)} disabled={deleting}
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
