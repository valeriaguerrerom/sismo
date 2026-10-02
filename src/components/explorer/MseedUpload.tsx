/**
 * Carga de archivos MiniSEED propios (investigadores y administradores).
 *
 * Permite subir un .mseed, elegir la estación, aplicar un pasabanda,
 * previsualizar las tres componentes y enviarlas al simulador.
 */
import { useRef, useState, ChangeEvent } from 'react';
import { Upload, Activity, FileAudio, RefreshCw, AlertTriangle, Info, Waves, ChevronRight, Download, ExternalLink } from '../../lib/icons';
import { uploadMseed, MseedUploadResult } from '../../lib/mseedUpload';
import type { WaveData } from '../../lib/types';

/**
 * URL del archivo MiniSEED de ejemplo. Lo sirve el propio backend en
 * GET /api/examples/mseed (el archivo va dentro de la imagen Docker), así que
 * no depende de Supabase Storage. En desarrollo Vite hace proxy de /api a :8000;
 * en producción se usa VITE_API_URL o el proxy de Nginx.
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
/** Ejemplos descargables por tipo de fuente (los sirve el backend). */
const EXAMPLE_TECTONICO_URL = `${API_BASE}/api/examples/mseed/tectonico`;
const EXAMPLE_VOLCANICO_URL = `${API_BASE}/api/examples/mseed/volcanico`;

interface Props {
  onLoadRealData?: (waveData: WaveData, label: string, meta: { date: string; duration: number; sourceType?: 'tectonic' | 'volcanic' }) => void;
}

/** Colores de las componentes, iguales que en el Simulador. */
const WAVE_COLORS = { north: '#C4553A', east: '#2D6A4F', vertical: '#D4A853' };

/** Estaciones aceptadas (deben coincidir con el backend core/stations.py). */
const ACCEPTED_STATIONS = ['TUM', 'TUM3C', 'CRU', 'CUM', 'PAS2', 'BBAC', 'CPOP2', 'Galeras'];

/**
 * Infiere el tipo de fuente a partir de la estación de origen. La estación del
 * Galeras (CUFP, del OVSP) registra sismicidad VOLCÁNICA; el resto de la red del
 * SGC registra sismicidad TECTÓNICA. Es una sugerencia editable, no un dato del
 * MiniSEED (el archivo no indica el tipo de sismo).
 */
function inferSourceType(station: string): 'tectonic' | 'volcanic' {
  const s = (station || '').toUpperCase();
  return s === 'CUFP' || s.includes('GALERAS') ? 'volcanic' : 'tectonic';
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

/**
 * Bloque desplegable "¿Cómo consigo un archivo MiniSEED?". Cerrado por defecto.
 * Explica el mismo procedimiento con el que se descargaron los eventos del
 * catálogo: ubicar el sismo en el catálogo del SGC y descargar sus formas de
 * onda por estación desde EarthScope (Wilber 3). Incluye qué datos buscar y un
 * botón para descargar un archivo de ejemplo.
 */
function HowToGetMseed() {
  const [open, setOpen] = useState(false);
  return (
    <div data-tour="exp-mseed-tutorial" className="bg-white rounded-xl border border-stone-200/60">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-stone-50/70 transition-colors rounded-xl"
      >
        <span className="text-sm font-bold text-[#1A1A2E]">¿Cómo consigo un archivo MiniSEED?</span>
        <ChevronRight size={15} className="text-stone-400 transition-transform duration-200" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }} />
      </button>
      {open && (
        <div className="px-4 pb-4 animate-soft-in space-y-3 text-[12px] text-stone-600 leading-relaxed">
          <p>
            Un MiniSEED es el archivo estándar con la señal cruda de una estación. Así conseguimos
            los registros del catálogo:
          </p>
          <ol className="space-y-2 list-decimal pl-4">
            <li>
              Ubica el sismo en el catálogo del{' '}
              <a href="https://sismo.sgc.gov.co/" target="_blank" rel="noopener noreferrer" className="text-[#C4553A] font-semibold inline-flex items-center gap-0.5">
                Servicio Geológico Colombiano <ExternalLink size={11} />
              </a>{' '}
              y anota su fecha, hora y magnitud.
            </li>
            <li>
              De la estación <b>TUM</b> (Tumaco) puedes descargar las formas de onda directamente desde{' '}
              <a href="https://ds.iris.edu/wilber3/find_event" target="_blank" rel="noopener noreferrer" className="text-[#C4553A] font-semibold inline-flex items-center gap-0.5">
                EarthScope (Wilber 3) <ExternalLink size={11} />
              </a>: busca el evento por su fecha y elige "MiniSEED" como formato. Es la única de nuestra
              red que está federada ahí (lo comprobamos).
            </li>
            <li>
              Las demás estaciones (TUM3C, CRU, CUM, PAS2, BBAC, CPOP2 y Galeras) no están en
              EarthScope; sus registros se solicitan directamente al SGC.
            </li>
            <li>
              Al elegir los datos, toma una <b>estación de la lista</b>, sus <b>tres componentes</b>
              (Norte, Este y Vertical) y una <b>ventana de tiempo</b> que cubra el sismo (unos segundos
              antes de la llegada y hasta que la señal se calme).
            </li>
            <li>Sube aquí el archivo descargado y SismoNariño lo procesa para explorarlo y simularlo.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <a
              href={EXAMPLE_TECTONICO_URL}
              download
              className="inline-flex items-center gap-2 bg-[#2D6A4F] text-white text-xs font-bold px-4 py-2.5 rounded-lg btn-hover"
            >
              <Download size={14} /> Ejemplo tectónico (CUM)
            </a>
            <a
              href={EXAMPLE_VOLCANICO_URL}
              download
              className="inline-flex items-center gap-2 bg-[#C4553A] text-white text-xs font-bold px-4 py-2.5 rounded-lg btn-hover"
            >
              <Download size={14} /> Ejemplo volcánico (Galeras)
            </a>
          </div>
          <p className="text-[11px] text-stone-400">
            Dos registros reales cortos y triaxiales: uno <b>tectónico</b> de la estación CUM
            (Cumbal, red del SGC) y uno <b>volcánico</b> de la estación CUFP del Volcán Galeras (OVSP).
            Al cargarlos, la plataforma sugiere el tipo de fuente según la estación.
          </p>
        </div>
      )}
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
  // true mientras el tipo de fuente lo decidió la inferencia por estación (no el
  // usuario a mano). Al reconocer la estación se preselecciona; si el usuario lo
  // cambia, deja de ser "sugerido".
  const [sourceAuto, setSourceAuto] = useState(true);

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
      // Sugerencia de tipo de fuente según la estación de origen: la estación del
      // Galeras (CUFP, OVSP) registra sismicidad VOLCÁNICA; el resto de la red del
      // SGC, sismicidad TECTÓNICA. Solo se auto-asigna si el usuario no lo fijó.
      if (sourceAuto) {
        setSourceType(inferSourceType(res.station));
      }
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
    <div className="space-y-4">
      <HowToGetMseed />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      <div className="bg-white rounded-xl border border-stone-200/60 p-4 space-y-4">
        {/* Zona de carga */}
        <div
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            file ? 'border-[#C4553A]/40 bg-[#C4553A]/5' : 'border-stone-200 hover:border-[#C4553A]/40 hover:bg-stone-50'
          }`}
        >
          <input ref={inputRef} type="file" accept=".mseed,.msd,.seed,.miniseed,application/octet-stream" className="hidden" onChange={onFile} />
          <Upload size={26} className="mx-auto text-[#C4553A] mb-2" />
          {file ? (
            <>
              <div className="text-sm font-bold text-[#1A1A2E] flex items-center justify-center gap-2"><FileAudio size={14} /> {file.name}</div>
              <div className="text-[11px] text-stone-400 mt-0.5">{fmtSize(file.size)} · haz clic para elegir otro archivo</div>
            </>
          ) : (
            <>
              <div className="text-sm font-bold text-[#1A1A2E]">Cargar archivo MiniSEED</div>
              <div className="text-[11px] text-stone-400 mt-0.5">.mseed · hasta 50 MB · se procesa con ObsPy en el servidor, no se almacena</div>
              <div className="text-[10px] text-stone-400 mt-2 leading-relaxed">
                Estaciones del proyecto (Nariño y sur del Cauca): {ACCEPTED_STATIONS.map((s, i) => (
                  <span key={s}>
                    <span className="font-semibold text-stone-500">{s}</span>{i < ACCEPTED_STATIONS.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-stone-400">
            <div className="w-5 h-5 rounded-full border-[3px] border-stone-200 border-t-[#C4553A] animate-spin" /> Procesando con ObsPy…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {/* Estado vacío: explica qué aparecerá cuando se cargue un archivo. */}
        {!file && !loading && !error && (
          <div className="flex flex-col items-center justify-center text-center py-10 px-4">
            <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mb-3">
              <Waves size={26} className="text-stone-300" />
            </div>
            <p className="text-sm font-semibold text-stone-500">Aquí verás tu registro</p>
            <p className="text-xs text-stone-400 mt-1 max-w-xs leading-relaxed">
              Al cargar un MiniSEED se mostrarán sus tres componentes (Norte, Este y Vertical) y un botón para llevarlas al Simulador.
            </p>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500">
              <span><b className="text-[#1A1A2E]">{result.network}.{result.station}</b> · {Object.values(result.channels).join(', ')}</span>
              <span>{result.sensor_kind === 'acelerometro' ? 'Acelerómetro' : 'Velocímetro'}</span>
              <span>{result.sampling_rate} Hz</span>
              <span>{result.duration.toFixed(1)} s</span>
              <span>{result.num_samples} muestras</span>
              <span>Inicio {result.starttime_utc.replace('T', ' ').slice(0, 19)} UTC</span>
              {result.filtro && <span>Pasabanda {result.filtro.freqmin}–{result.filtro.freqmax} Hz</span>}
            </div>
            {/* Aviso cuando las horizontales vienen como 1/2 sin azimut. */}
            {!result.orientation_confirmed && result.orientation_note && (
              <div className="flex items-start gap-2 text-[11px] text-[#8a6d1a] bg-[#D4A853]/10 border border-[#D4A853]/30 rounded-lg p-2.5">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" /> {result.orientation_note}
              </div>
            )}
            <div className="space-y-2 bg-stone-50/50 rounded-xl p-3 border border-stone-100">
              <WaveTrace data={result.waveData.north} label={result.horizontal_labels.north} color={WAVE_COLORS.north} />
              <WaveTrace data={result.waveData.east} label={result.horizontal_labels.east} color={WAVE_COLORS.east} />
              <WaveTrace data={result.waveData.vertical} label="Vertical (Z)" color={WAVE_COLORS.vertical} />
            </div>
            {!result.orientation_confirmed ? (
              // Sin orientación confirmada no se puede cargar como N/E al simulador.
              <div className="text-[11px] text-stone-400 bg-stone-50 border border-stone-200/60 rounded-lg p-2.5">
                Este registro no se puede cargar en el Simulador hasta confirmar la orientación de las horizontales
                (necesita el StationXML con el azimut de los sensores).
              </div>
            ) : (
            <button
              onClick={() => onLoadRealData?.(
                result.waveData,
                `${result.filename} — ${result.network}.${result.station}`,
                { date: result.starttime_utc.slice(0, 10), duration: result.duration, sourceType },
              )}
              className="w-full flex items-center justify-center gap-2 bg-[#C4553A] text-white text-xs font-bold py-2.5 rounded-lg btn-hover"
            >
              <Activity size={14} /> Cargar en Simulador
            </button>
            )}
          </div>
        )}
      </div>

      {/* Opciones */}
      <div className="bg-white rounded-xl border border-stone-200/60 p-4 space-y-4 h-fit">
        <h3 className="text-xs font-bold text-[#1A1A2E]">Opciones de procesamiento</h3>

        <label className="block text-xs text-stone-500">
          Estación
          <select
            value={station}
            disabled={!result}
            onChange={e => { setStation(e.target.value); if (file) process(file, e.target.value); }}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:border-[#C4553A] disabled:opacity-50"
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
            <input type="checkbox" checked={useFilter} onChange={e => setUseFilter(e.target.checked)} className="accent-[#C4553A]" /> Aplicar filtro pasabanda
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
          <span className="flex items-center gap-1.5">
            Tipo de fuente para el simulador
            {result && sourceAuto && (
              <span className="text-[9px] font-bold uppercase tracking-wide text-[#2D6A4F] bg-[#2D6A4F]/10 px-1.5 py-0.5 rounded">
                sugerido
              </span>
            )}
          </span>
          <select
            value={sourceType}
            onChange={e => { setSourceType(e.target.value as 'tectonic' | 'volcanic'); setSourceAuto(false); }}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:border-[#C4553A]"
          >
            <option value="volcanic">Volcánica (isótropa)</option>
            <option value="tectonic">Tectónica (doble par)</option>
          </select>
          {result && (
            <span className="block text-[10px] text-stone-400 mt-1 leading-snug">
              {sourceAuto
                ? `Sugerido por la estación ${result.station}: ${sourceType === 'volcanic' ? 'el Galeras registra sismicidad volcánica' : 'la red del SGC registra sismicidad tectónica'}. Puedes cambiarlo.`
                : 'Lo elegiste manualmente. El archivo MiniSEED no indica el tipo de sismo; es tu decisión de modelado.'}
            </span>
          )}
        </label>

        <button
          disabled={!file || loading}
          onClick={() => file && process(file, station)}
          className="w-full flex items-center justify-center gap-2 border border-[#C4553A]/30 text-[#C4553A] text-xs font-bold py-2 rounded-lg disabled:opacity-40"
        >
          <RefreshCw size={13} /> Reprocesar con estas opciones
        </button>

        <p className="text-[10px] text-stone-400 leading-relaxed flex gap-1.5">
          <Info size={12} className="flex-shrink-0 mt-0.5" />
          Se elimina la media y la tendencia lineal, y se normaliza a [−1, 1] con la misma escala en las tres componentes. El registro se dibuja submuestreado (máx. 3000 puntos) solo para la vista previa.
        </p>
      </div>
      </div>
    </div>
  );
}
