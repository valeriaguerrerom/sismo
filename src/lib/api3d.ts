/**
 * Cliente HTTP tipado del backend del "Mapa 3D".
 *
 * Todo el cálculo (geometría, tiempos de viaje, síntesis FDM, MiniSEED) vive
 * en el backend FastAPI. Este módulo solo hace las peticiones y tipa las
 * respuestas. La URL base sale de VITE_API_URL; si no está, usa cadena vacía
 * para aprovechar el proxy `/api` de Vite en desarrollo.
 *
 * @module api3d
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/** Estación sísmica devuelta por /api/stations. */
export interface Station {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude_m: number | null;
  approx: boolean;
  source: string;
}

/** Tiempos de viaje por estación (respuesta de /api/travel-times). */
export interface StationTravelTime {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  approx: boolean;
  distancia_epicentral_km: number;
  distancia_hipocentral_km: number;
  distancia_grados: number;
  azimut: number;
  tP: number | null;
  tS: number | null;
  tS_menos_tP: number | null;
}

export interface TravelTimesResponse {
  modelo_usado: string;
  estaciones: StationTravelTime[];
}

/** Modelo de tiempos de viaje soportado. */
export type TravelModel = 'homogeneous' | 'iasp91';

export interface TravelTimesRequest {
  lat: number;
  lon: number;
  depth_km: number;
  vp_km_s?: number;
  vs_km_s?: number;
  model?: TravelModel;
}

/** Parámetros para /api/synthetic. */
export interface SyntheticRequest {
  vp: number;
  vs: number;
  density: number;
  magnitude: number;
  depth_km: number;
  source_type: 'tectonic' | 'volcanic';
  distance_km: number;
  nx?: number;
  nz?: number;
  dt_max_s?: number;
}

/** Sismograma sintético devuelto por /api/synthetic. */
export interface SyntheticResult {
  t: number[];
  north: number[];
  east: number[];
  vertical: number[];
  tP_detectado: number;
  tS_detectado: number;
  cfl_ok: boolean;
  tiempo_computo_ms: number;
  nx: number;
  nz: number;
  dx_m: number;
  dt_s: number;
}

/** Forma de onda real devuelta por /api/waveforms. */
export interface WaveformResult {
  event_id: string;
  station: string;
  t: number[];
  canales: { Z?: number[]; N?: number[]; E?: number[] };
  fs: number;
  starttime_utc: string;
  filtro: { freqmin: number; freqmax: number };
}

/** Un punto de la trayectoria del rayo (dist horizontal, profundidad). */
export interface RayPoint {
  dist_km: number;
  depth_km: number;
}

/** Trayectoria del rayo devuelta por /api/ray-path. */
export interface RayPathResult {
  modelo_usado: string;
  fase: string;
  station: string;
  distancia_epicentral_km: number;
  puntos: RayPoint[];
}

// ─────────────────────── Geometría de escena (Mapa 3D) ───────────────────────
// El backend entrega las posiciones de escena YA calculadas. El frontend solo
// las renderiza (regla técnica: el cálculo numérico vive en el backend).

/** Estación con posición de escena (superficie) calculada en el backend. */
export interface SceneStation {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  approx: boolean;
  source: string;
  x: number;
  z: number;
  marker_offset_y: number;
}

/** Nivel del eje de profundidad con su Y de escena. */
export interface DepthLevel {
  km: number;
  y: number;
  is_moho: boolean;
}

/** Geometría estática de la escena del Mapa 3D (/api/scene-geometry). */
export interface SceneGeometry {
  block: { width: number; depth_xy: number; height: number };
  terrain_scene_height: number;
  terrain_exaggeration: number;
  hillshade_azimuth_deg: number;
  hillshade_altitude_deg: number;
  domain: {
    lat_min: number; lat_max: number; lon_min: number; lon_max: number;
    depth_min: number; depth_max: number;
  };
  stations: SceneStation[];
  depth_levels: DepthLevel[];
  moho_km: number;
  moho_y: number;
  scale_bar: { km: number; scene_units: number };
  domain_width_km: number;
  domain_height_km: number;
}

/** Hipocentro con posición/tamaño/color de escena (backend). */
export interface SceneHypocenter {
  id: string;
  x: number;
  y: number;
  z: number;
  surface_y: number;
  depth_km: number;
  magnitude: number;
  radius: number;
  color: string;
  label: string | null;
}

export interface SceneEventsResponse {
  hypocenters: SceneHypocenter[];
  depth_color_ramp: { label: string; color: string }[];
}

/** Evento de entrada para posicionar como hipocentro. */
export interface SceneEventInput {
  id: string;
  lat: number;
  lon: number;
  depth_km?: number | null;
  magnitude?: number | null;
  event_type?: 'volcanic' | 'tectonic' | null;
  label?: string | null;
}

/** Cifras reales del Home (/api/stats/home). */
export interface HomeStats {
  total_eventos: number;
  anio_min: number | null;
  anio_max: number | null;
  anios_registro: number | null;
  magnitud_maxima: number | null;
  eventos_cm: number;
  eventos_galeras: number;
}

/** Error HTTP con el detalle que envía el backend. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el backend (¿está corriendo en :8000?)');
  }
  if (!res.ok) {
    let detail = `Error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* respuesta sin JSON */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

/**
 * Obtiene el catálogo de estaciones de Nariño.
 * @returns Lista de estaciones.
 */
export async function getStations(): Promise<Station[]> {
  const data = await request<{ estaciones: Station[] }>('/api/stations');
  return data.estaciones;
}

/**
 * Calcula los tiempos de llegada P y S a cada estación.
 * @param req Epicentro, profundidad, velocidades y modelo.
 * @returns Respuesta con tiempos por estación (ordenada por distancia).
 */
export async function getTravelTimes(req: TravelTimesRequest): Promise<TravelTimesResponse> {
  return request<TravelTimesResponse>('/api/travel-times', {
    method: 'POST',
    body: JSON.stringify({
      vp_km_s: 6.0,
      vs_km_s: 3.5,
      model: 'homogeneous',
      ...req,
    }),
  });
}

/**
 * Ejecuta el FDM 2D en el backend y devuelve el sismograma sintético.
 * @param req Parámetros del medio, fuente, distancia y malla.
 * @returns Series triaxiales, llegadas y métricas.
 */
export async function getSynthetic(req: SyntheticRequest): Promise<SyntheticResult> {
  return request<SyntheticResult>('/api/synthetic', {
    method: 'POST',
    body: JSON.stringify({ nx: 200, nz: 150, dt_max_s: 0.02, ...req }),
  });
}

/**
 * Obtiene la forma de onda real (MiniSEED) de una estación para un evento.
 * @param eventId Identificador del evento.
 * @param station Código de la estación.
 * @param opts Frecuencias del pasabanda (opcional).
 * @returns Forma de onda triaxial real.
 */
export async function getWaveform(
  eventId: string,
  station: string,
  opts?: { freqmin?: number; freqmax?: number },
): Promise<WaveformResult> {
  const params = new URLSearchParams();
  if (opts?.freqmin != null) params.set('freqmin', String(opts.freqmin));
  if (opts?.freqmax != null) params.set('freqmax', String(opts.freqmax));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request<WaveformResult>(
    `/api/waveforms/${encodeURIComponent(eventId)}/${encodeURIComponent(station)}${qs}`,
  );
}

/**
 * Obtiene la trayectoria del rayo P del hipocentro a una estación.
 * @param req Epicentro, profundidad, estación y modelo.
 * @returns Polilínea (dist_km, depth_km) del rayo.
 */
export async function getRayPath(req: {
  lat: number; lon: number; depth_km: number; station: string; model?: TravelModel;
}): Promise<RayPathResult> {
  const params = new URLSearchParams({
    lat: String(req.lat), lon: String(req.lon), depth_km: String(req.depth_km),
    station: req.station, model: req.model ?? 'homogeneous',
  });
  return request<RayPathResult>(`/api/ray-path?${params.toString()}`);
}

/**
 * Obtiene las cifras reales para la página de inicio.
 * @returns Estadísticas del Home (total de eventos, años, magnitud máxima).
 */
export async function getHomeStats(): Promise<HomeStats> {
  return request<HomeStats>('/api/stats/home');
}

/**
 * Obtiene la geometría de escena del Mapa 3D con posiciones ya calculadas.
 * @returns Bloque, estaciones, eje de profundidad, Moho y escala.
 */
export async function getSceneGeometry(): Promise<SceneGeometry> {
  return request<SceneGeometry>('/api/scene-geometry');
}

/**
 * Convierte eventos del catálogo en hipocentros de escena (posición/tamaño/color).
 * @param events Eventos con lat, lon, profundidad y magnitud.
 * @returns Hipocentros posicionados y la rampa de color por profundidad.
 */
export async function getSceneEvents(events: SceneEventInput[]): Promise<SceneEventsResponse> {
  return request<SceneEventsResponse>('/api/scene-geometry/events', {
    method: 'POST',
    body: JSON.stringify({ events }),
  });
}
