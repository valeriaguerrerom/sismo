/**
 * Tipos de datos compartidos del proyecto SismoNariño.
 * Define las interfaces para navegación, eventos sísmicos,
 * parámetros de simulación y resultados del motor FDM.
 * @module types
 */

/** Páginas disponibles en la aplicación SPA. */
export type Page = 'home' | 'simulation' | 'explorer' | 'education' | 'map3d' | 'about' | 'auth' | 'reports' | 'admin' | 'profile';

/** Evento sísmico histórico registrado en la base de datos. */
export interface SeismicEvent {
  id: string;
  event_date: string;
  event_time: string;
  magnitude: number;
  depth_km: number;
  latitude: number;
  longitude: number;
  location_name: string;
  event_type: 'tectonic' | 'volcanic';
  source: string;
  notes: string;
}

/** Parámetros de entrada para la simulación FDM 2D. */
export interface SimulationParams {
  vp: number;
  vs: number;
  density: number;
  lambda: number;
  mu: number;
  sourceType: 'tectonic' | 'volcanic';
  magnitude: number;
  depth: number;
  epicenterLat: number;
  epicenterLon: number;
  duration: number;
  dx: number;
  dt: number;
}

/** Series temporales triaxiales registradas en el receptor virtual. */
export interface WaveData {
  time: number[];
  north: number[];
  east: number[];
  vertical: number[];
}

/** Snapshot del campo de ondas en un instante de tiempo para visualización 3D. */
export interface WavefieldSnapshot {
  time: number;
  field: Float32Array;
  nx: number;
  nz: number;
}

/** Información de la malla computacional y posiciones de fuente/receptor. */
export interface GridInfo {
  nx: number;
  nz: number;
  dx: number;
  dt: number;
  dtAdjusted: boolean;
  dxAdjusted: boolean;
  totalSteps: number;
  receiverX: number;
  receiverZ: number;
  sourceX: number;
  sourceZ: number;
  pointsPerWavelength: number;
}

/** Resultado completo de una simulación FDM con sismogramas y métricas. */
export interface SimulationResult {
  waveData: WaveData;
  snapshots: WavefieldSnapshot[];
  maxAmplitude: number;
  duration: number;
  dominantFrequency: number;
  params: SimulationParams;
  gridInfo: GridInfo;
  pArrival: number;
  sArrival: number;
  pArrivalDetected: boolean;
  sArrivalDetected: boolean;
}

/** Mensaje de progreso durante la ejecución de la simulación. */
export interface SimProgress {
  step: number;
  totalSteps: number;
  percent: number;
}
