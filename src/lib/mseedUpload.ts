/**
 * Cliente para la carga de archivos MiniSEED de investigadores.
 * Envía el archivo a `POST /api/upload/mseed` (ObsPy en el backend).
 * @module mseedUpload
 */
import type { WaveData } from './types';

const API_BASE = import.meta.env.VITE_API_URL || '';

export interface MseedStationInfo {
  station: string;
  network: string;
  channels: string[];
  sampling_rate: number;
  triaxial: boolean;
}

export interface MseedUploadResult {
  filename: string;
  stations: MseedStationInfo[];
  station: string;
  network: string;
  channels: Record<string, string>;
  /** Tipo de sensor usado: 'velocimetro' o 'acelerometro'. */
  sensor_kind: string;
  sampling_rate: number;
  starttime_utc: string;
  duration: number;
  num_samples: number;
  normalization_factor: number;
  filtro: { freqmin: number; freqmax: number } | null;
  waveData: WaveData;
  /** true si las horizontales están orientadas a Norte/Este. */
  orientation_confirmed: boolean;
  /** Aviso cuando la orientación no está confirmada (1/2 sin azimut). */
  orientation_note: string | null;
  /** Rótulos de las horizontales (Norte/Este o Horizontal 1/2). */
  horizontal_labels: { north: string; east: string };
  /** Diferencia S−P en segundos (null si no se detectó). */
  sp_seconds: number | null;
  /** Distancia aproximada al foco en km (null si no se detectó). */
  distance_km_est: number | null;
  /** Clasificación: 'local' | 'regional' | 'lejano' | 'desconocido'. */
  origin_class: string;
  /** Aviso honesto sobre la estimación de distancia con una sola estación. */
  distance_note: string;
}

export interface MseedUploadOptions {
  station?: string;
  freqmin?: number;
  freqmax?: number;
}

/** Sube y procesa un MiniSEED. Lanza Error con un mensaje legible si falla. */
export async function uploadMseed(file: File, opts: MseedUploadOptions = {}): Promise<MseedUploadResult> {
  const form = new FormData();
  form.append('file', file);
  if (opts.station) form.append('station', opts.station);
  if (opts.freqmin !== undefined) form.append('freqmin', String(opts.freqmin));
  if (opts.freqmax !== undefined) form.append('freqmax', String(opts.freqmax));

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/upload/mseed`, { method: 'POST', body: form });
  } catch {
    throw new Error('No se pudo conectar con el backend. Verifica que el servidor FastAPI esté en ejecución.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || `Error ${res.status} al procesar el archivo.`);
  }
  return res.json();
}
