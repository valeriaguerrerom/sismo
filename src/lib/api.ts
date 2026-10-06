/**
 * Cliente API — conecta el frontend con el backend FastAPI.
 *
 * Proporciona funciones tipadas para consumir todos los endpoints
 * del backend: simulación FDM, eventos sísmicos, quiz educativo,
 * datos curiosos de ondas y línea de tiempo histórica.
 *
 * @module api
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Error de API con el código de estado y una categoría, para que la UI muestre
 * un mensaje específico (429 = demasiadas solicitudes, timeout, red caída, etc.).
 *   - status: código HTTP (0 si no hubo respuesta: red/timeout).
 *   - kind: 'timeout' | 'network' | 'http'.
 */
export class ApiError extends Error {
  status: number;
  kind: 'timeout' | 'network' | 'http';
  detail?: string;
  constructor(message: string, status: number, kind: 'timeout' | 'network' | 'http', detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
    this.detail = detail;
  }
}

/**
 * Traduce un error de API a un mensaje claro en español según su tipo.
 * Reutilizable por todas las pantallas (Simulador, Explorador, etc.).
 */
export function apiErrorMessage(e: unknown, contexto = 'La operación'): string {
  if (e instanceof ApiError) {
    if (e.kind === 'timeout') return `${contexto} tardó demasiado y se canceló. Inténtalo de nuevo.`;
    if (e.kind === 'network') return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    if (e.status === 429) return 'Demasiadas solicitudes seguidas. Espera unos segundos e inténtalo de nuevo.';
    if (e.status === 422) return `${contexto}: algún valor no es válido. Revisa los parámetros.`;
    if (e.status >= 500) return `${contexto}: el servidor tuvo un problema. Vuelve a intentarlo en un momento.`;
    if (e.detail) return `${contexto}: ${e.detail}`;
  }
  return `${contexto}. Revisa tu conexión e inténtalo de nuevo.`;
}

/**
 * Realiza una petición HTTP al backend FastAPI.
 * @template T - Tipo esperado de la respuesta JSON.
 * @param path - Ruta del endpoint (ej: '/api/events').
 * @param options - Opciones adicionales de fetch (method, body, etc.).
 * @returns Respuesta parseada como JSON del tipo T.
 * @throws Error si la respuesta HTTP no es exitosa.
 */
async function fetchAPI<T>(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs, ...init } = options ?? {};
  // Timeout con AbortController: si el backend se cae, se reinicia o demora
  // demasiado, la petición se cancela en vez de dejar la UI colgada.
  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...init,
    });
  } catch (e) {
    // AbortError (timeout) o fallo de red (backend caído, sin conexión).
    if ((e as Error).name === 'AbortError') {
      throw new ApiError('La solicitud tardó demasiado y se canceló.', 0, 'timeout');
    }
    throw new ApiError('No se pudo conectar con el servidor.', 0, 'network');
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res.ok) {
    // Intentar leer el 'detail' del backend (FastAPI) para un mensaje claro.
    let detail: string | undefined;
    try {
      const body = await res.json();
      detail = typeof body?.detail === 'string' ? body.detail : undefined;
    } catch { /* respuesta sin JSON */ }
    throw new ApiError(
      `API error ${res.status}: ${res.statusText}`,
      res.status,
      'http',
      detail,
    );
  }
  return res.json();
}

// ─── Simulación ───

/** Frame del corte tal como llega del backend (ux/uz en base64 int8). */
interface SnapshotFrameDTO { time: number; ux: string; uz: string; scale: number }
/** Grid submuestreado de los snapshots (posiciones ya reescaladas). */
interface SnapshotGridDTO {
  nx: number; nz: number;
  sourceX: number; sourceZ: number; receiverX: number; receiverZ: number;
  /** Índice Z de la interfaz de capas en el grid submuestreado (0 si homogéneo). */
  interfaceZ?: number;
}

/** Respuesta del endpoint /api/simulate/full. */
interface SimulateFullDTO {
  waveData: import('./types').WaveData;
  maxAmplitude: number;
  duration: number;
  dominantFrequency: number;
  params: import('./types').SimulationParams;
  gridInfo: import('./types').GridInfo;
  pArrival: number;
  sArrival: number;
  pArrivalDetected: boolean;
  sArrivalDetected: boolean;
  snapshotCount: number;
  snapshots: SnapshotFrameDTO[];
  snapshotGrid: SnapshotGridDTO;
  /** Escala global de referencia (máx |u| sobre todos los fotogramas). */
  snapshotScale: number;
}

/** Decodifica un base64 de int8 a Int8Array. */
function decodeInt8(b64: string): Int8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int8Array(bytes.buffer);
}

/**
 * Reconstruye un frame del corte a partir de ux/uz cuantizados (int8) y la
 * escala PROPIA del fotograma. Devuelve un Float32Array con el layout
 * [Ux | Uz | |u|] que espera el renderizador (|u| se calcula aquí, no viaja
 * por la red). Como cada fotograma trae su propia escala, los valores reales
 * quedan reconstruidos sin escalonado; el renderizador recompone la escala de
 * color global a partir de estos valores.
 */
function decodeFrame(ux64: string, uz64: string, scale: number): Float32Array {
  const ux = decodeInt8(ux64);
  const uz = decodeInt8(uz64);
  const n = ux.length;
  const out = new Float32Array(n * 3);
  const k = scale / 127;
  for (let i = 0; i < n; i++) {
    const a = ux[i] * k;
    const b = uz[i] * k;
    out[i] = a;
    out[n + i] = b;
    out[2 * n + i] = Math.sqrt(a * a + b * b);
  }
  return out;
}

/**
 * Ejecuta la simulación FDM 2D COMPLETA en el backend (incluye los snapshots
 * del campo para el mapa de calor). Todo el cómputo ocurre en el servidor; el
 * navegador solo decodifica y dibuja.
 *
 * @param params - Parámetros de simulación.
 * @returns `result` (SimulationResult con snapshots ya decodificados, cuyo
 *   nx/nz corresponden al grid submuestreado del heatmap) y `heatmapGrid`
 *   (GridInfo con las posiciones fuente/receptor reescaladas a ese grid, para
 *   que TriaxialPlane ubique bien las marcas).
 */
export async function fetchSimulationFull(
  params: import('./types').SimulationParams,
): Promise<{ result: import('./types').SimulationResult; heatmapGrid: import('./types').GridInfo }> {
  // La simulación corre en el servidor (~10-15 s). Damos margen amplio (45 s)
  // antes de cancelar; si se agota o el backend falla, fetchAPI lanza un
  // mensaje claro que Simulation.tsx muestra al usuario.
  const dto = await fetchAPI<SimulateFullDTO>('/api/simulate/full', {
    method: 'POST',
    body: JSON.stringify(params),
    timeoutMs: 45000,
  });

  const sg = dto.snapshotGrid;
  // Cada fotograma trae su propia escala (cuantización por fotograma). Si un
  // backend antiguo no la envía, se cae a la escala global de respaldo.
  const fallbackScale = dto.snapshotScale ?? 1;
  const snapshots: import('./types').WavefieldSnapshot[] = dto.snapshots.map(s => ({
    time: s.time,
    nx: sg.nx,
    nz: sg.nz,
    field: decodeFrame(s.ux, s.uz, s.scale ?? fallbackScale),
  }));

  // El backend serializa los Lamé como `lambda_` (palabra reservada en Python).
  // Normalizamos a `lambda`/`mu` en el frontend y, si faltan, los recalculamos
  // desde Vp/Vs/ρ para que nunca queden NaN (métricas, panel y PDF).
  const rawParams = dto.params as unknown as Record<string, number | string>;
  const mu = Number(rawParams.mu) > 0
    ? Number(rawParams.mu)
    : Number(rawParams.density) * Number(rawParams.vs) ** 2;
  const lambdaRaw = rawParams.lambda ?? rawParams.lambda_;
  const lambda = Number(lambdaRaw) !== 0 && Number.isFinite(Number(lambdaRaw))
    ? Number(lambdaRaw)
    : Number(rawParams.density) * Number(rawParams.vp) ** 2 - 2 * mu;
  const normParams = { ...dto.params, lambda, mu } as import('./types').SimulationParams;

  const result: import('./types').SimulationResult = {
    waveData: dto.waveData,
    snapshots,
    maxAmplitude: dto.maxAmplitude,
    duration: dto.duration,
    dominantFrequency: dto.dominantFrequency,
    params: normParams,
    gridInfo: dto.gridInfo,
    pArrival: dto.pArrival,
    sArrival: dto.sArrival,
    pArrivalDetected: dto.pArrivalDetected,
    sArrivalDetected: dto.sArrivalDetected,
  };

  // Grid del heatmap: mismas dimensiones que los snapshots submuestreados y
  // posiciones fuente/receptor reescaladas a ese grid (TriaxialPlane las usa).
  const heatmapGrid: import('./types').GridInfo = {
    ...dto.gridInfo,
    nx: sg.nx,
    nz: sg.nz,
    sourceX: sg.sourceX,
    sourceZ: sg.sourceZ,
    receiverX: sg.receiverX,
    receiverZ: sg.receiverZ,
    // Interfaz de capas en el grid del heatmap (para dibujar la línea + rótulos).
    interfaceZ: sg.interfaceZ ?? 0,
  };

  return { result, heatmapGrid };
}

// ─── Waveforms Reales de Eventos ───

/**
 * Respuesta del endpoint /api/events/{id}/waveforms.
 */
export interface EventWaveformResponse {
  event_id: string;
  station: string;
  source: 'galeras' | 'cm' | 'user';
  sampling_rate: number | null;
  duration: number;
  num_samples: number;
  waveData: import('./types').WaveData;
}

/**
 * Obtiene los datos reales MiniSEED de un evento del catálogo si existen.
 * No requiere Supabase: source y station se pasan directamente desde el frontend.
 *
 * @param mseedId - ID del archivo (event_id del catálogo, ej: '0602081159GVA' o 'CM_M2.5_...')
 * @param source - Origen de datos: 'galeras' | 'cm'
 * @param station - Código de estación (ej: 'CUFP', 'BBAC')
 * @returns EventWaveformResponse con waveData triaxial, o null si no hay datos.
 */
export async function fetchEventWaveforms(
  mseedId: string,
  source: 'galeras' | 'cm',
  station: string,
): Promise<EventWaveformResponse | null> {
  try {
    const params = new URLSearchParams({ source, station });
    return await fetchAPI<EventWaveformResponse>(`/api/events/${encodeURIComponent(mseedId)}/waveforms?${params}`);
  } catch (error) {
    // 404 significa que el evento no tiene datos reales → retornar null silenciosamente
    if (error instanceof Error && (error.message.includes('404') || error.message.includes('503'))) {
      return null;
    }
    throw error;
  }
}
