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
  /**
   * Mecanismo focal del doble par (solo fuente tectónica), convención
   * Aki & Richards. strike (rumbo, 0-360° desde el norte, horario), dip
   * (buzamiento, 0-90°) y rake (deslizamiento, 90°=inversa, -90°=normal,
   * 0°=desgarre). Definen el tensor de momento que excita P-SV y SH.
   */
  strike?: number;
  dip?: number;
  rake?: number;
  /**
   * Acimut de la estación virtual respecto a la fuente (0-360° desde el norte,
   * horario). Orienta el corte y la rotación radial/transversal → Norte/Este.
   */
  stationAzimuth?: number;
  /**
   * Nº de ciclos del pulso de la fuente. 1 ≈ Ricker (un lóbulo); 2–3 produce
   * un tren de ondas por arribo (más parecido a un sismo real). No cambia la
   * frecuencia dominante, así que la malla y la estabilidad no se ven afectadas.
   */
  sourceCycles?: number;
  /**
   * Frecuencia dominante de la fuente (Hz). Si se omite/0, el backend usa el
   * valor por tipo (2 volcánica / 3.5 tectónica). Subirla hace oscilaciones más
   * rápidas y densas; requiere dx pequeño para no dispersar.
   */
  sourceFreq?: number;
  /**
   * Nivel de coda (0-1): 0 = medio homogéneo limpio (la señal decae tras la S);
   * >0 acerca los bordes y debilita la absorción para que reverberen y el
   * registro siga oscilando un buen rato (aspecto de sismograma "vivo").
   */
  codaLevel?: number;
  /**
   * Distancia epicentral fuente→estación en superficie (km). Controla la
   * separación temporal entre la P y la S (a mayor distancia, más se separan).
   * Acotada por el dominio y los rebotes de borde.
   */
  epicentralDistanceKm?: number;
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
  /** Tiempo del primer rebote de borde al receptor (s), calculado por el backend. */
  firstBounceP?: number;
  firstBounceS?: number;
  /** Retardo del pico del pulso de la fuente Ricker, t0 (s). Los frentes teóricos parten en t0. */
  sourceDelay?: number;
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
