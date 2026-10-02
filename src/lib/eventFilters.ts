/**
 * Lógica de filtrado del catálogo sísmico, COMPARTIDA entre el Explorador y la
 * lista de eventos del Mapa 3D, para no divergir en los criterios.
 *
 * Trabaja sobre `CatalogRow` (la fuente única; ver src/lib/catalog.ts). Nota de
 * honestidad de datos: en el catálogo actual `depth_km` es NULL en todos los
 * eventos y `magnitude` es NULL en los volcánicos; no hay un campo de tipo de
 * magnitud. Por eso:
 *   - El tipo de magnitud se INFIERE del tipo de evento: tectónico → ML,
 *     volcánico → MD (no hay Mw en los datos).
 *   - El rango de profundidad filtra sobre la profundidad ASUMIDA para la
 *     escena (volcánico 5 km, tectónico 15 km), no sobre un dato real.
 *
 * @module eventFilters
 */
import type { CatalogRow } from './catalog';

/** Rangos de profundidad (km) usados también por la leyenda del Mapa 3D. */
export const DEPTH_RANGES = [
  { id: 'all', label: 'Todas' },
  { id: 'lt30', label: '< 30 km', min: 0, max: 30 },
  { id: '30-70', label: '30 a 70 km', min: 30, max: 70 },
  { id: '70-150', label: '70 a 150 km', min: 70, max: 150 },
  { id: 'gt150', label: '> 150 km', min: 150, max: Infinity },
] as const;

export type DepthRangeId = (typeof DEPTH_RANGES)[number]['id'];

/** Profundidad asumida (km) para un evento, igual que la escena del Mapa 3D. */
export function assumedDepthKm(row: Pick<CatalogRow, 'event_type' | 'depth_km'>): number {
  if (row.depth_km != null) return row.depth_km;
  return row.event_type === 'volcanic' ? 5 : 15;
}

/**
 * Tipo de magnitud a mostrar, inferido del tipo de evento.
 * Tectónico → ML (magnitud local), volcánico → MD (magnitud de duración).
 */
export function magnitudeType(eventType: CatalogRow['event_type']): 'ML' | 'MD' {
  return eventType === 'volcanic' ? 'MD' : 'ML';
}

/**
 * Etiqueta de magnitud con su tipo y un decimal, p. ej. "ML 5.0" o "MD 4.5".
 * Si no hay magnitud, devuelve solo el tipo con guion.
 */
export function magnitudeLabel(row: Pick<CatalogRow, 'event_type' | 'magnitude'>): string {
  const t = magnitudeType(row.event_type);
  return row.magnitude != null ? `${t} ${row.magnitude.toFixed(1)}` : `${t} —`;
}

/** Criterios de filtrado del catálogo (todos opcionales). */
export interface EventFilters {
  /** Texto libre: busca en id, fecha, región y nombre. */
  search?: string;
  /** 'all' | 'tectonic' | 'volcanic'. */
  type?: 'all' | 'tectonic' | 'volcanic';
  /** Región exacta del campo `region` (p. ej. 'Colombia', 'Ecuador'). */
  region?: string;
  /** Magnitud mínima y máxima (inclusive). */
  minMag?: number | null;
  maxMag?: number | null;
  /** Rango de profundidad (sobre la profundidad asumida). */
  depthRange?: DepthRangeId;
  /** Rango de fechas ISO (YYYY-MM-DD), inclusive. */
  dateFrom?: string;
  dateTo?: string;
  /** Número mínimo de estaciones. */
  minStations?: number | null;
}

/** Filtros vacíos (nada seleccionado). */
export const EMPTY_FILTERS: EventFilters = {
  search: '', type: 'all', region: 'all', minMag: null, maxMag: null,
  depthRange: 'all', dateFrom: '', dateTo: '', minStations: null,
};

/** ¿Hay algún filtro activo? (para mostrar el botón "Limpiar filtros"). */
export function hasActiveFilters(f: EventFilters): boolean {
  return !!(
    (f.search && f.search.trim()) ||
    (f.type && f.type !== 'all') ||
    (f.region && f.region !== 'all') ||
    f.minMag != null || f.maxMag != null ||
    (f.depthRange && f.depthRange !== 'all') ||
    (f.dateFrom && f.dateFrom.length) || (f.dateTo && f.dateTo.length) ||
    f.minStations != null
  );
}

/**
 * Aplica los filtros a una lista de eventos del catálogo.
 *
 * @param rows Eventos del catálogo (CatalogRow[]).
 * @param f Criterios de filtrado.
 * @returns Los eventos que cumplen todos los criterios (orden original).
 */
export function filterEvents(rows: CatalogRow[], f: EventFilters): CatalogRow[] {
  const q = (f.search ?? '').trim().toLowerCase();
  const depth = DEPTH_RANGES.find(d => d.id === (f.depthRange ?? 'all'));

  return rows.filter(r => {
    if (f.type && f.type !== 'all' && r.event_type !== f.type) return false;
    if (f.region && f.region !== 'all' && (r.region ?? '') !== f.region) return false;

    if (f.minMag != null && (r.magnitude == null || r.magnitude < f.minMag)) return false;
    if (f.maxMag != null && (r.magnitude == null || r.magnitude > f.maxMag)) return false;

    if (depth && 'min' in depth) {
      const d = assumedDepthKm(r);
      if (d < depth.min || d >= depth.max) return false;
    }

    if (f.dateFrom && r.event_date < f.dateFrom) return false;
    if (f.dateTo && r.event_date > f.dateTo) return false;

    if (f.minStations != null && r.station_count < f.minStations) return false;

    if (q) {
      const hay = [r.event_id, r.event_date, r.region ?? '', r.location_name ?? '']
        .join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
