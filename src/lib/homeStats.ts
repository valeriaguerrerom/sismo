/**
 * Cifras del Home leídas DIRECTAMENTE de Supabase (tabla `seismic_events`).
 *
 * Antes el Home dependía del backend (`GET /api/stats/home`). En producción ese
 * backend no siempre conecta a Supabase y su fallback JSON no está empaquetado
 * en la imagen, así que los indicadores salían en 0. Este módulo replica el
 * patrón robusto del resto de la app (educationData / adminData): consulta
 * Supabase directo desde el navegador con timeout y cae a un fallback local si
 * no hay credenciales o la consulta falla.
 *
 * @module homeStats
 */
import { supabase } from './supabase';

/** Cifras reales del Home. */
export interface HomeStats {
  total_eventos: number;
  anio_min: number | null;
  anio_max: number | null;
  anios_registro: number | null;
  magnitud_maxima: number | null;
  eventos_cm: number;
  eventos_galeras: number;
}

const QUERY_TIMEOUT_MS = 6000;

/** Envuelve una promesa con un límite de tiempo (evita spinner infinito). */
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(p).then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Fallback documentado (mismo orden de magnitud que la BD real: ~166 eventos,
 * red CM 2023–2025 + Galeras 2006). Se usa solo si Supabase no está disponible,
 * para que el Home nunca muestre 0 por un problema de red.
 */
const FALLBACK: HomeStats = {
  total_eventos: 166,
  anio_min: 2006,
  anio_max: 2025,
  anios_registro: 20,
  magnitud_maxima: 4.4,
  eventos_cm: 134,
  eventos_galeras: 32,
};

/**
 * Obtiene las cifras del Home desde Supabase.
 *
 * Cuenta el total de eventos, deriva el rango de años a partir de `event_date`,
 * la magnitud máxima observada y el desglose tectónico/volcánico. Si no hay
 * cliente Supabase o la consulta falla/expira, devuelve {@link FALLBACK}.
 *
 * @returns Estadísticas del Home (nunca lanza; siempre resuelve con datos).
 */
export async function loadHomeStats(): Promise<HomeStats> {
  if (!supabase) return FALLBACK;
  try {
    const { data, error } = await withTimeout(
      supabase.from('seismic_events').select('event_date, magnitude, event_type'),
      QUERY_TIMEOUT_MS,
    );
    if (error) throw error;
    const rows = (data ?? []) as { event_date: string | null; magnitude: number | null; event_type: string | null }[];
    if (rows.length === 0) return FALLBACK;

    const years = rows
      .map(r => (r.event_date && String(r.event_date).slice(0, 4)))
      .filter((y): y is string => !!y && /^\d{4}$/.test(y))
      .map(Number);
    const mags = rows
      .map(r => r.magnitude)
      .filter((m): m is number => typeof m === 'number' && !Number.isNaN(m));

    const anio_min = years.length ? Math.min(...years) : null;
    const anio_max = years.length ? Math.max(...years) : null;

    return {
      total_eventos: rows.length,
      anio_min,
      anio_max,
      anios_registro: anio_min != null && anio_max != null ? anio_max - anio_min + 1 : null,
      magnitud_maxima: mags.length ? Math.round(Math.max(...mags) * 10) / 10 : null,
      eventos_cm: rows.filter(r => r.event_type === 'tectonic').length,
      eventos_galeras: rows.filter(r => r.event_type === 'volcanic').length,
    };
  } catch (err) {
    console.warn('[Home] Stats fallback:', err);
    return FALLBACK;
  }
}
