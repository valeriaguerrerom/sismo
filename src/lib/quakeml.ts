/**
 * Importación de catálogos QuakeML del SGC (RF-15 / RF-16).
 *
 * Estrategia: se envía el archivo al backend (`POST /api/import/quakeml`,
 * ObsPy). Si el backend no está disponible, se parsea localmente con
 * `DOMParser` como respaldo, de modo que el administrador siempre pueda
 * importar.
 * @module quakeml
 */

/** Evento extraído de un QuakeML, con el esquema de `seismic_events`. */
export interface ImportedEvent {
  event_date: string;
  event_time: string;
  magnitude: number;
  magnitude_type?: string | null;
  depth_km: number;
  latitude: number;
  longitude: number;
  location_name: string;
  event_type: 'tectonic' | 'volcanic';
  source: string;
  notes: string;
}

export interface ImportResult {
  total_en_archivo: number;
  importados: number;
  descartados: number;
  eventos: ImportedEvent[];
  /** 'backend' si se usó ObsPy, 'local' si se usó el parser del navegador. */
  origen: 'backend' | 'local';
}

const API_BASE = import.meta.env.VITE_API_URL || '';

const VOLCANIC_KEYWORDS = ['galeras', 'cumbal', 'volc', 'azufral', 'doña juana', 'dona juana'];

function firstText(el: Element | null | undefined, selector: string): string | null {
  if (!el) return null;
  // getElementsByTagName ignora el namespace, útil para QuakeML.
  const parts = selector.split(' ');
  let cur: Element | null = el;
  for (const p of parts) {
    if (!cur) return null;
    cur = cur.getElementsByTagName(p)[0] ?? null;
  }
  return cur?.textContent?.trim() ?? null;
}

/** Parser QuakeML 1.2 en el navegador (respaldo sin backend). */
export function parseQuakemlLocal(xml: string): ImportResult {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('El archivo no es un XML válido.');
  }
  const events = Array.from(doc.getElementsByTagName('event'));
  if (events.length === 0) {
    throw new Error('El archivo no contiene elementos <event> de QuakeML.');
  }

  const eventos: ImportedEvent[] = [];
  let descartados = 0;

  for (const ev of events) {
    const origin = ev.getElementsByTagName('origin')[0];
    const mag = ev.getElementsByTagName('magnitude')[0];
    const timeStr = firstText(origin, 'time value');
    const lat = Number(firstText(origin, 'latitude value'));
    const lon = Number(firstText(origin, 'longitude value'));
    const depthM = Number(firstText(origin, 'depth value') ?? '0');
    const magVal = Number(firstText(mag, 'mag value'));
    if (!origin || !mag || !timeStr || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(magVal)) {
      descartados++;
      continue;
    }
    const t = new Date(timeStr);
    if (Number.isNaN(t.getTime())) { descartados++; continue; }

    const description = firstText(ev, 'description text') || 'Sin descripción';
    const typeText = (firstText(ev, 'type') || '').toLowerCase();
    const isVolcanic = typeText.includes('volcanic') || VOLCANIC_KEYWORDS.some(k => description.toLowerCase().includes(k));
    const agency = firstText(origin, 'creationInfo agencyID') || 'SGC';

    eventos.push({
      event_date: t.toISOString().slice(0, 10),
      event_time: t.toISOString().slice(11, 19),
      magnitude: Math.round(magVal * 100) / 100,
      magnitude_type: firstText(mag, 'type'),
      depth_km: Math.round((depthM / 1000) * 100) / 100,
      latitude: Math.round(lat * 1e6) / 1e6,
      longitude: Math.round(lon * 1e6) / 1e6,
      location_name: description,
      event_type: isVolcanic ? 'volcanic' : 'tectonic',
      source: agency,
      notes: ev.getAttribute('publicID') || '',
    });
  }

  return { total_en_archivo: events.length, importados: eventos.length, descartados, eventos, origen: 'local' };
}

/** Envía el archivo al backend; si falla, usa el parser local. */
export async function importQuakeml(file: File): Promise<ImportResult> {
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/api/import/quakeml`, { method: 'POST', body: form });
    if (res.ok) {
      const body = await res.json();
      return { ...body, origen: 'backend' as const };
    }
    if (res.status === 400) {
      const err = await res.json().catch(() => ({ detail: 'Archivo inválido' }));
      throw new Error(err.detail || 'Archivo inválido');
    }
  } catch (err) {
    // Un 400 es un error real del archivo: no tiene sentido reintentar localmente.
    if (err instanceof Error && !/fetch|network|Failed/i.test(err.message)) throw err;
  }
  const text = await file.text();
  return parseQuakemlLocal(text);
}
