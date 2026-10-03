/**
 * Carga del catálogo del USGS (ComCat) descargado por el script
 * backend/scripts/fetch_usgs_depth.py y guardado en public/data/usgs_narino.json.
 *
 * Se lee desde el propio origen (archivo estático), no desde USGS en tiempo de
 * ejecución, por la política de seguridad de contenido (CSP) del frontend.
 *
 * @module lib/usgsDepth
 */

export interface UsgsEvent {
  id: string;
  fecha: string | null;
  magnitud: number | null;
  profundidad_km: number;
  lat: number;
  lon: number;
  lugar: string | null;
}

export interface UsgsCatalog {
  consulta: {
    fuente: string;
    url: string;
    consultado_utc: string;
    region: { lat: number[]; lon: number[] };
    filtros: { magnitud_minima: number; desde: string };
  };
  eventos: UsgsEvent[];
}

/** Carga el catálogo USGS estático. Devuelve null si no está disponible. */
export async function loadUsgsCatalog(): Promise<UsgsCatalog | null> {
  try {
    const r = await fetch('/data/usgs_narino.json');
    if (!r.ok) return null;
    return (await r.json()) as UsgsCatalog;
  } catch {
    return null;
  }
}
