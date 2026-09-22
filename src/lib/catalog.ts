/**
 * Catálogo de eventos sísmicos — fuente de verdad ÚNICA.
 *
 * La LISTA de eventos (metadatos: id, fecha, magnitud, tipo, subtipo, región,
 * coordenadas, nº de estaciones) se lee de la tabla `seismic_events` de Supabase.
 * El DETALLE de cada evento (estaciones y formas de onda) se sigue sirviendo
 * desde los archivos JSON de public/data, localizados por `event_id`.
 *
 * Explorer, Home y Mapa 3D usan este módulo para no divergir en los datos.
 * Si Supabase no está disponible, cae a los índices JSON como respaldo.
 *
 * @module catalog
 */
import { supabase } from './supabase';

/**
 * Envuelve una promesa con un límite de tiempo. Si Supabase no responde en `ms`,
 * rechaza para caer al respaldo JSON en vez de quedar sin datos.
 */
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(p).then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); },
    );
  });
}

/** Fila del catálogo (metadatos de un evento, desde seismic_events). */
export interface CatalogRow {
  event_id: string;
  event_date: string;
  event_time: string;
  magnitude: number | null;
  depth_km: number | null;
  latitude: number;
  longitude: number;
  location_name: string;
  event_type: 'tectonic' | 'volcanic';
  volcanic_subtype: string | null;
  region: string | null;
  station_count: number;
  source: string;
}

/**
 * Carga el catálogo completo de eventos desde Supabase (seismic_events).
 * Si Supabase no responde o la tabla está vacía, cae a los índices JSON.
 *
 * @returns Lista de eventos con sus metadatos.
 */
export async function loadCatalog(): Promise<CatalogRow[]> {
  if (supabase) {
    try {
      // Con timeout: si Supabase no responde (o la consulta se cuelga en el
      // navegador), caemos al respaldo JSON en vez de quedarnos sin datos.
      const { data, error } = await withTimeout(
        supabase
          .from('seismic_events')
          .select('event_id, event_date, event_time, magnitude, depth_km, latitude, longitude, location_name, event_type, volcanic_subtype, region, station_count, source')
          .order('event_date', { ascending: false }),
        6000,
      );
      if (!error && data && data.length > 0) {
        return data as CatalogRow[];
      }
      // data vacío o error → respaldo JSON (p.ej. seed aún no aplicado).
    } catch {
      /* cae al fallback JSON */
    }
  }
  return loadCatalogFromJson();
}

/**
 * Respaldo: reconstruye el catálogo desde los índices JSON de public/data.
 * Se usa solo si Supabase no está disponible o la tabla está vacía.
 */
async function loadCatalogFromJson(): Promise<CatalogRow[]> {
  const rows: CatalogRow[] = [];
  const safe = async (url: string) => {
    try { const r = await fetch(url); return r.ok ? await r.json() : null; }
    catch { return null; }
  };

  const cm = await safe('/data/cm/index.json');
  for (const e of cm?.events ?? []) {
    const sts = e.stations ?? [];
    const lat = sts.length ? sts.reduce((s: number, x: { latitude: number }) => s + x.latitude, 0) / sts.length : 1.5;
    const lon = sts.length ? sts.reduce((s: number, x: { longitude: number }) => s + x.longitude, 0) / sts.length : -78.1;
    rows.push({
      event_id: e.id, event_date: e.date, event_time: e.time,
      magnitude: e.magnitude ?? null, depth_km: null,
      latitude: Number(lat.toFixed(6)), longitude: Number(lon.toFixed(6)),
      location_name: `Red CM — ${e.folder}`, event_type: 'tectonic',
      volcanic_subtype: null, region: e.folder, station_count: sts.length, source: 'SGC-RSNC',
    });
  }

  const gal = await safe('/data/galeras/index.json');
  for (const e of gal?.events ?? []) {
    rows.push({
      event_id: e.id, event_date: e.event_date, event_time: e.event_time,
      magnitude: null, depth_km: null,
      latitude: 1.2216, longitude: -77.3742,
      location_name: e.location_name ?? 'Volcán Galeras', event_type: 'volcanic',
      volcanic_subtype: e.volcanic_subtype || null, region: 'Nariño (Galeras)',
      station_count: 1, source: 'SGC-OVSP',
    });
  }

  return rows.sort((a, b) => (b.event_date + b.event_time).localeCompare(a.event_date + a.event_time));
}
