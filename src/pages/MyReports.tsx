import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { FileText, Trash2, Download, Calendar, FileDown } from '../lib/icons';
import { downloadReportPdf, SavedResults } from '../lib/reportPdf';
import { downloadMap3dPdf, downloadMap3dCsv, type Map3dReportData, type Map3dReportOptions } from '../lib/map3dReport';
import type { SimulationParams } from '../lib/types';

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

export function MyReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const deleteReport = async (id: string) => {
    if (!supabase) return;
    if (!window.confirm('¿Eliminar este reporte? Esta acción no se puede deshacer.')) return;
    await supabase.from('simulation_reports').delete().eq('id', id);
    setReports(r => r.filter(rep => rep.id !== id));
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

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16">
      <div className="bg-white border-b border-stone-200/60 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-[#1A1A2E] font-bold text-xl flex items-center gap-2">
            <FileText size={20} className="text-[#C4553A]" />
            Mis Reportes
          </h1>
          <p className="text-stone-400 text-xs mt-0.5">Simulaciones guardadas · {user?.full_name}</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {loading ? (
          <div className="text-center py-12 text-stone-400">Cargando reportes...</div>
        ) : error ? (
          <div className="text-center py-12 text-red-500 text-sm">{error}</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={40} className="text-stone-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-stone-400 mb-2">No tienes reportes aún</h3>
            <p className="text-stone-400 text-sm">Genera una simulación y guárdala para verla aquí.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map(r => (
              <div key={r.id} className="bg-white rounded-xl border border-stone-200/60 p-4 flex items-center gap-4 card-hover">
                <div className="w-10 h-10 rounded-xl bg-[#C4553A]/10 flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-[#C4553A]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[#1A1A2E] text-sm">{r.title}</h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-stone-400 mt-0.5">
                    <span className="flex items-center gap-1"><Calendar size={11} /> {new Date(r.created_at).toLocaleDateString()}</span>
                    {isMap3d(r) ? (
                      <span className="text-[#6B5B95] font-semibold">Mapa 3D · tiempos de viaje</span>
                    ) : (
                      <>
                        {r.params && <span>Mw {String(r.params.magnitude ?? '?')} · {r.params.depth} km · {r.params.sourceType === 'volcanic' ? 'Volcánica' : 'Tectónica'}</span>}
                        {r.results?.waveData ? (
                          <span className="text-[#2D6A4F]">Con sismogramas</span>
                        ) : (
                          <span className="text-stone-300" title="Reporte guardado antes de la versión con series; el PDF incluirá solo métricas.">Solo métricas</span>
                        )}
                      </>
                    )}
                    {r.notes && <span className="truncate max-w-[200px]">{r.notes}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => exportPDF(r)} title="Descargar reporte PDF"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#C4553A]/5 text-[#C4553A] border border-[#C4553A]/20 text-xs font-bold">
                    <FileDown size={14} /> PDF
                  </button>
                  {isMap3d(r) ? (
                    <button onClick={() => exportMap3dCsv(r)} title="Descargar CSV" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#2D6A4F]/5 text-[#2D6A4F] border border-[#2D6A4F]/20 text-xs font-bold">
                      <Download size={14} /> CSV
                    </button>
                  ) : (
                    <button onClick={() => exportJSON(r)} title="Descargar datos JSON" className="p-2 rounded-lg bg-stone-50 text-stone-500 border border-stone-200">
                      <Download size={14} />
                    </button>
                  )}
                  <button onClick={() => deleteReport(r.id)} title="Eliminar" className="p-2 rounded-lg bg-red-50 text-red-500 border border-red-100">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
