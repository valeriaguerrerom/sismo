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
  sampling_rate: number;
  starttime_utc: string;
  duration: number;
  num_samples: number;
  normalization_factor: number;
  filtro: { freqmin: number; freqmax: number } | null;
  waveData: WaveData;
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
