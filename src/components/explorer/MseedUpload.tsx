/**
 * Carga de archivos MiniSEED propios (investigadores y administradores).
 *
 * Permite subir un .mseed, elegir la estación, aplicar un pasabanda,
 * previsualizar las tres componentes y enviarlas al simulador.
 */
import { useRef, useState, ChangeEvent } from 'react';
import { Upload, Activity, FileAudio, RefreshCw, AlertTriangle, Info } from '../../lib/icons';
import { uploadMseed, MseedUploadResult } from '../../lib/mseedUpload';
import type { WaveData } from '../../lib/types';

interface Props {
  onLoadRealData?: (waveData: WaveData, label: string, meta: { date: string; duration: number; sourceType?: 'tectonic' | 'volcanic' }) => void;
}

function WaveTrace({ data, label, color }: { data: number[]; label: string; color: string }) {
  if (!data || data.length === 0) return null;
  const w = 800, h = 70, mid = h / 2;
  let maxAbs = 0;
  for (const v of data) maxAbs = Math.max(maxAbs, Math.abs(v));
  if (maxAbs < 1e-10) maxAbs = 1;
  const step = Math.max(1, Math.floor(data.length / w));
  const pts: string[] = [];
  for (let i = 0; i < w && i * step < data.length; i++) {
    pts.push(`${i},${(mid - (data[i * step] / maxAbs) * (mid - 5)).toFixed(1)}`);
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: color }} />
        <span className="text-[10px] font-bold text-stone-500">{label}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16 bg-stone-50 rounded border border-stone-100" preserveAspectRatio="none">
        <line x1="0" y1={mid} x2={w} y2={mid} stroke="#e7e5e4" strokeWidth="0.5" />
        <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.4" />
      </svg>
    </div>
  );
}

export function MseedUpload({ onLoadRealData }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<MseedUploadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [station, setStation] = useState<string>('');
  const [useFilter, setUseFilter] = useState(true);
  const [freqmin, setFreqmin] = useState(1);
  const [freqmax, setFreqmax] = useState(10);
  const [sourceType, setSourceType] = useState<'tectonic' | 'volcanic'>('volcanic');

  const process = async (f: File, st?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await uploadMseed(f, {
        station: st || undefined,
        freqmin: useFilter ? freqmin : undefined,
        freqmax: useFilter ? freqmax : undefined,
      });
      setResult(res);
      setStation(res.station);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error procesando el archivo');
      setResult(null);
    }
    setLoading(false);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFile(f);
    setResult(null);
    setStation('');
    process(f);
  };

  const fmtSize = (b: number) => b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1e3).toFixed(0)} KB`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      <div className="bg-white rounded-xl border border-stone-200/60 p-4 space-y-4">
        {/* Zona de carga */}
        <div
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            file ? 'border-[#6B5B95]/40 bg-[#6B5B95]/5' : 'border-stone-200 hover:border-[#6B5B95]/40 hover:bg-stone-50'
          }`}
        >
          <input ref={inputRef} type="file" accept=".mseed,.msd,.seed,.miniseed,application/octet-stream" className="hidden" onChange={onFile} />
          <Upload size={26} className="mx-auto text-[#6B5B95] mb-2" />
          {file ? (
            <>
              <div className="text-sm font-bold text-[#1A1A2E] flex items-center justify-center gap-2"><FileAudio size={14} /> {file.name}</div>
              <div className="text-[11px] text-stone-400 mt-0.5">{fmtSize(file.size)} · haz clic para elegir otro archivo</div>
            </>
          ) : (
            <>
              <div className="text-sm font-bold text-[#1A1A2E]">Cargar archivo MiniSEED</div>
              <div className="text-[11px] text-stone-400 mt-0.5">.mseed · hasta 50 MB · se procesa con ObsPy en el servidor, no se almacena</div>
            </>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-stone-400">
            <div className="w-5 h-5 rounded-full border-[3px] border-stone-200 border-t-[#6B5B95] animate-spin" /> Procesando con ObsPy…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {result && !loading && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500">
              <span><b className="text-[#1A1A2E]">{result.network}.{result.station}</b> · {Object.values(result.channels).join(', ')}</span>
              <span>{result.sampling_rate} Hz</span>
              <span>{result.duration.toFixed(1)} s</span>
              <span>{result.num_samples} muestras</span>
              <span>Inicio {result.starttime_utc.replace('T', ' ').slice(0, 19)} UTC</span>
              {result.filtro && <span>Pasabanda {result.filtro.freqmin}–{result.filtro.freqmax} Hz</span>}
            </div>
            <div className="space-y-2 bg-stone-50/50 rounded-xl p-3 border border-stone-100">
              <WaveTrace data={result.waveData.north} label="Norte (N)" color="#2D6A4F" />
              <WaveTrace data={result.waveData.east} label="Este (E)" color="#C4553A" />
              <WaveTrace data={result.waveData.vertical} label="Vertical (Z)" color="#D4A853" />
            </div>
            <button
              onClick={() => onLoadRealData?.(
                result.waveData,
                `${result.filename} — ${result.network}.${result.station}`,
                { date: result.starttime_utc.slice(0, 10), duration: result.duration, sourceType },
              )}
              className="w-full flex items-center justify-center gap-2 bg-[#6B5B95] text-white text-xs font-bold py-2.5 rounded-lg btn-hover"
            >
              <Activity size={14} /> Cargar en Simulador
            </button>
          </div>
        )}
      </div>

      {/* Opciones */}
      <div className="bg-white rounded-xl border border-stone-200/60 p-4 space-y-4 h-fit">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#1A1A2E]">Opciones de procesamiento</h3>

        <label className="block text-xs text-stone-500">
          Estación
          <select
            value={station}
            disabled={!result}
            onChange={e => { setStation(e.target.value); if (file) process(file, e.target.value); }}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:border-[#6B5B95] disabled:opacity-50"
          >
            {!result && <option value="">Carga un archivo primero</option>}
            {result?.stations.map(s => (
              <option key={s.station} value={s.station}>
                {s.network}.{s.station} · {s.channels.length} canales{s.triaxial ? ' · triaxial' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <input type="checkbox" checked={useFilter} onChange={e => setUseFilter(e.target.checked)} /> Aplicar filtro pasabanda
          </label>
          <div className={`grid grid-cols-2 gap-2 ${useFilter ? '' : 'opacity-40 pointer-events-none'}`}>
            <label className="text-[11px] text-stone-500">Mín. (Hz)
              <input type="number" min={0.05} step={0.1} value={freqmin} onChange={e => setFreqmin(Number(e.target.value))}
                className="mt-1 w-full px-2 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-sm" /></label>
            <label className="text-[11px] text-stone-500">Máx. (Hz)
              <input type="number" min={0.1} step={0.5} value={freqmax} onChange={e => setFreqmax(Number(e.target.value))}
                className="mt-1 w-full px-2 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-sm" /></label>
          </div>
        </div>

        <label className="block text-xs text-stone-500">
          Tipo de fuente para el simulador
          <select value={sourceType} onChange={e => setSourceType(e.target.value as 'tectonic' | 'volcanic')}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:border-[#6B5B95]">
            <option value="volcanic">Volcánica (isótropa)</option>
            <option value="tectonic">Tectónica (doble par)</option>
          </select>
        </label>

        <button
          disabled={!file || loading}
          onClick={() => file && process(file, station)}
          className="w-full flex items-center justify-center gap-2 border border-[#6B5B95]/30 text-[#6B5B95] text-xs font-bold py-2 rounded-lg disabled:opacity-40"
        >
          <RefreshCw size={13} /> Reprocesar con estas opciones
        </button>

        <p className="text-[10px] text-stone-400 leading-relaxed flex gap-1.5">
          <Info size={12} className="flex-shrink-0 mt-0.5" />
          Se eliminan la media y la tendencia lineal, se normaliza a [−1, 1] con la misma escala en las tres componentes y se decima a máx. 3000 muestras.
        </p>
      </div>
    </div>
  );
}
