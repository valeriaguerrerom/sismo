/**
 * Módulo de carga de datos educativos.
 * Consulta Supabase directamente para quiz, wave facts y timeline.
 * Incluye datos fallback si Supabase no está disponible.
 * @module educationData
 */
import { supabase } from './supabase';

/**
 * Envuelve una promesa con un límite de tiempo. Si Supabase no responde en `ms`,
 * rechaza para que el llamador caiga al fallback en vez de quedarse colgado
 * mostrando "Cargando…" indefinidamente.
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

const QUERY_TIMEOUT_MS = 6000;

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  category: string;
  difficulty: string;
}

export interface WaveFact {
  id: string;
  wave_type: string;
  fact: string;
}

export interface TimelineEvent {
  id: string;
  year: number;
  magnitude: string | null;
  title: string;
  description: string;
  event_type: 'tectonic' | 'volcanic';
}

const fallbackQuiz: QuizQuestion[] = [
  { id: '1', question: '¿Cuál es la onda sísmica más rápida?', options: ['Onda S', 'Onda P', 'Onda Love', 'Onda Rayleigh'], correct_index: 1, explanation: 'Las ondas P son las más rápidas (3-8 km/s).', category: 'ondas', difficulty: 'facil' },
  { id: '2', question: '¿Qué volcán de Nariño es uno de los más activos?', options: ['Cumbal', 'Azufral', 'Galeras', 'Doña Juana'], correct_index: 2, explanation: 'El Galeras es uno de los más activos de Colombia.', category: 'volcanes', difficulty: 'facil' },
  { id: '3', question: '¿Las ondas S viajan por líquidos?', options: ['Sí', 'Solo agua salada', 'No, nunca', 'A altas presiones'], correct_index: 2, explanation: 'Las ondas S no se propagan en líquidos.', category: 'ondas', difficulty: 'medio' },
  { id: '4', question: '¿Qué placa se subduce bajo Nariño?', options: ['Caribe', 'Cocos', 'Nazca', 'Antártica'], correct_index: 2, explanation: 'La Placa de Nazca se subduce bajo la Sudamericana.', category: 'tectonica', difficulty: 'medio' },
];

const fallbackFacts: Record<string, string[]> = {
  P: ['Pueden atravesar el núcleo líquido de la Tierra.', 'Viajan a ~6 km/s en la corteza.'],
  S: ['Su ausencia en el núcleo demostró que es líquido.', 'Son las principales causantes de daño.'],
  Love: ['Nombradas por Augustus Love en 1911.', 'Destructivas para edificios altos.'],
  Rayleigh: ['Predijo Lord Rayleigh en 1885.', 'Movimiento elíptico como olas del mar.'],
};

// Respaldo completo (9 eventos) espejo de la tabla timeline_events, por si la
// conexión a Supabase se cuelga desde el navegador. Nota: en la BD el sismo de
// Tumaco 1979 figura como 8.2; el valor correcto es 8.1 (ver docs/limitaciones).
const fallbackTimeline: TimelineEvent[] = [
  { id: '1', year: 1834, magnitude: '~7.0', title: 'Gran sismo de Pasto', description: 'Uno de los sismos más destructivos registrados en Nariño. Causó graves daños en Pasto y poblaciones cercanas. Asociado a la actividad de la Falla de Romeral.', event_type: 'tectonic' },
  { id: '2', year: 1906, magnitude: '8.8', title: 'Gran sismo del Pacífico', description: 'Uno de los sismos más grandes registrados en Colombia. Generó un tsunami en la costa pacífica. Sentido en todo el sur del país.', event_type: 'tectonic' },
  { id: '3', year: 1936, magnitude: '7.0', title: 'Sismo Colombia-Ecuador', description: 'Sismo de gran magnitud en la frontera colombo-ecuatoriana. Afectó severamente el sur de Nariño y el norte de Ecuador.', event_type: 'tectonic' },
  { id: '4', year: 1979, magnitude: '8.1', title: 'Sismo de Tumaco', description: 'Uno de los sismos más grandes del siglo XX en Colombia. Generó un tsunami devastador en la costa pacífica nariñense. Más de 450 víctimas.', event_type: 'tectonic' },
  { id: '5', year: 1993, magnitude: null, title: 'Erupción del Galeras', description: 'Erupción durante una conferencia de vulcanólogos. Fallecieron 9 personas, incluyendo 6 científicos. Marcó un antes y después en la seguridad vulcanológica mundial.', event_type: 'volcanic' },
  { id: '6', year: 2004, magnitude: null, title: 'Reactivación Galeras', description: 'Nueva fase eruptiva del volcán Galeras con emisiones de ceniza y flujos piroclásticos. Se evacuaron miles de personas.', event_type: 'volcanic' },
  { id: '7', year: 2007, magnitude: null, title: 'Erupciones Galeras', description: 'Serie de erupciones con columnas de ceniza de hasta 8 km de altura. Afectación a comunidades rurales y al aeropuerto de Pasto.', event_type: 'volcanic' },
  { id: '8', year: 2016, magnitude: '7.8', title: 'Sismo Ecuador-Nariño', description: 'Terremoto en la costa de Ecuador sentido fuertemente en Nariño. Más de 650 víctimas en Ecuador.', event_type: 'tectonic' },
  { id: '9', year: 2023, magnitude: '5.6', title: 'Sismo en Nariño', description: 'Sismo moderado sentido en todo el departamento. Recordatorio de la alta sismicidad de la región.', event_type: 'tectonic' },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Carga preguntas del quiz desde Supabase con fallback local. */
export async function loadQuizQuestions(): Promise<QuizQuestion[]> {
  if (!supabase) return shuffle(fallbackQuiz);
  try {
    const { data } = await withTimeout(
      supabase.from('quiz_questions').select('*').eq('active', true),
      QUERY_TIMEOUT_MS,
    );
    if (data && data.length > 0) {
      return shuffle(data.map((d: Record<string, unknown>) => ({
        id: d.id as string, question: d.question as string, options: d.options as string[],
        correct_index: d.correct_index as number, explanation: d.explanation as string,
        category: (d.category as string) || 'general', difficulty: (d.difficulty as string) || 'medio',
      })));
    }
  } catch (err) { console.warn('[Education] Quiz fallback:', err); }
  return shuffle(fallbackQuiz);
}

/** Carga datos curiosos de ondas desde Supabase con fallback local. */
export async function loadWaveFacts(): Promise<Record<string, string[]>> {
  if (!supabase) return fallbackFacts;
  try {
    const { data } = await withTimeout(
      supabase.from('wave_facts').select('*').eq('active', true),
      QUERY_TIMEOUT_MS,
    );
    if (data && data.length > 0) {
      const grouped: Record<string, string[]> = {};
      for (const d of data) {
        const type = d.wave_type as string;
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(d.fact as string);
      }
      return grouped;
    }
  } catch (err) { console.warn('[Education] Facts fallback:', err); }
  return fallbackFacts;
}

/** Carga eventos de la línea de tiempo desde Supabase con fallback local. */
export async function loadTimelineEvents(): Promise<TimelineEvent[]> {
  if (!supabase) return fallbackTimeline;
  try {
    const { data } = await withTimeout(
      supabase.from('timeline_events').select('*').eq('active', true).order('year', { ascending: true }),
      QUERY_TIMEOUT_MS,
    );
    if (data && data.length > 0) {
      return data.map((d: Record<string, unknown>) => ({
        id: d.id as string, year: d.year as number, magnitude: d.magnitude as string | null,
        title: d.title as string, description: d.description as string,
        event_type: d.event_type as 'tectonic' | 'volcanic',
      }));
    }
  } catch (err) { console.warn('[Education] Timeline fallback:', err); }
  return fallbackTimeline;
}
