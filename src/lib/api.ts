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
 * Realiza una petición HTTP al backend FastAPI.
 * @template T - Tipo esperado de la respuesta JSON.
 * @param path - Ruta del endpoint (ej: '/api/events').
 * @param options - Opciones adicionales de fetch (method, body, etc.).
 * @returns Respuesta parseada como JSON del tipo T.
 * @throws Error si la respuesta HTTP no es exitosa.
 */
async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// ─── Eventos Sísmicos ───

interface EventsResponse {
  data: import('./types').SeismicEvent[];
  count: number;
}

/**
 * Consulta eventos sísmicos históricos de Nariño desde el backend.
 * Soporta filtros por tipo, magnitud, año y búsqueda textual.
 * @param filters - Filtros opcionales para la consulta.
 * @returns Array de eventos sísmicos que cumplen los filtros.
 */
export async function fetchEvents(filters?: {
  type?: string;
  min_mag?: number;
  max_mag?: number;
  start_year?: number;
  end_year?: number;
  search?: string;
  sort_by?: string;
  sort_dir?: string;
}): Promise<import('./types').SeismicEvent[]> {
  const params = new URLSearchParams();
  if (filters?.type && filters.type !== 'all') params.set('type', filters.type);
  if (filters?.min_mag) params.set('min_mag', String(filters.min_mag));
  if (filters?.max_mag) params.set('max_mag', String(filters.max_mag));
  if (filters?.start_year) params.set('start_year', String(filters.start_year));
  if (filters?.end_year) params.set('end_year', String(filters.end_year));
  if (filters?.search) params.set('search', filters.search);
  if (filters?.sort_by) params.set('sort_by', filters.sort_by);
  if (filters?.sort_dir) params.set('sort_dir', filters.sort_dir);
  params.set('limit', '500');

  const qs = params.toString();
  const { data } = await fetchAPI<EventsResponse>(`/api/events${qs ? '?' + qs : ''}`);
  return data;
}

// ─── Quiz ───

/**
 * Obtiene preguntas aleatorias del quiz educativo.
 * @param count - Número de preguntas a solicitar (default: 8).
 * @returns Array de preguntas con opciones y respuesta correcta.
 */
export async function fetchQuiz(count = 8) {
  const { data } = await fetchAPI<{ data: import('./educationData').QuizQuestion[] }>(
    `/api/quiz?count=${count}`
  );
  return data;
}

// ─── Wave Facts ───

/**
 * Obtiene datos curiosos sobre ondas sísmicas agrupados por tipo.
 * @returns Diccionario con tipo de onda como clave y array de facts como valor.
 */
export async function fetchWaveFacts() {
  const { data } = await fetchAPI<{ data: Record<string, string[]> }>('/api/wave-facts');
  return data;
}

// ─── Timeline ───

/**
 * Obtiene eventos históricos para la línea de tiempo educativa.
 * @returns Array de eventos ordenados cronológicamente.
 */
export async function fetchTimeline() {
  const { data } = await fetchAPI<{ data: import('./educationData').TimelineEvent[] }>(
    '/api/timeline'
  );
  return data;
}

// ─── Simulación ───

/**
 * Ejecuta una simulación FDM 2D en el backend Python.
 * @param params - Parámetros de simulación (velocidades, densidad, magnitud, etc.).
 * @returns Resultado con sismogramas triaxiales, métricas y metadatos de malla.
 */
export async function fetchSimulation(params: import('./types').SimulationParams) {
  return fetchAPI<{
    waveData: import('./types').WaveData;
    maxAmplitude: number;
    duration: number;
    dominantFrequency: number;
    params: import('./types').SimulationParams;
    gridInfo: import('./types').GridInfo;
    pArrival: number;
    sArrival: number;
    snapshotCount: number;
  }>('/api/simulate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
