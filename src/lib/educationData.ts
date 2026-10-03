/**
 * Módulo de carga de datos educativos.
 * Consulta Supabase directamente para quiz, wave facts y timeline.
 * Incluye datos fallback si Supabase no está disponible.
 * @module educationData
 */
import { supabase } from './supabase';
import { TIMELINE, QUIZ } from './educationContent';

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
  /** Fuente de la respuesta (cita). */
  source: string;
  /** Enlace a la fuente (opcional). */
  source_url: string | null;
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
  /** Fecha exacta (YYYY-MM-DD) o año si no se conoce el día. */
  event_date: string | null;
  /** Fuente del evento (cita). */
  source: string;
  /** Enlace a la fuente (opcional). */
  source_url: string | null;
}

// ── Respaldos a partir del contenido verificado (educationContent.ts) ──
// Si Supabase no responde, Educación usa EXACTAMENTE el contenido revisado con
// fuentes, no datos sueltos. Así nunca se muestra algo sin su fuente.
const fallbackQuizVerified: QuizQuestion[] = QUIZ.map(q => ({
  id: q.id, question: q.question, options: q.options, correct_index: q.correct_index,
  explanation: q.explanation, category: q.category, difficulty: 'medio',
  source: q.source.cita, source_url: q.source.url ?? null,
}));

const fallbackTimelineVerified: TimelineEvent[] = TIMELINE.map(t => ({
  id: t.id, year: t.year, magnitude: t.magnitude, title: t.title,
  description: t.description, event_type: t.event_type, event_date: t.date,
  source: t.source.cita, source_url: t.source.url ?? null,
}));

const fallbackFacts: Record<string, string[]> = {
  P: ['Pueden atravesar el núcleo líquido de la Tierra.', 'Viajan a ~6 km/s en la corteza.'],
  S: ['Su ausencia en el núcleo demostró que es líquido.', 'Son las principales causantes de daño.'],
  Love: ['Nombradas por Augustus Love en 1911.', 'Destructivas para edificios altos.'],
  Rayleigh: ['Predijo Lord Rayleigh en 1885.', 'Movimiento elíptico como olas del mar.'],
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Carga preguntas del quiz desde Supabase; si falla, usa el contenido verificado. */
export async function loadQuizQuestions(): Promise<QuizQuestion[]> {
  if (!supabase) return shuffle(fallbackQuizVerified);
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
        source: (d.source as string) || '', source_url: (d.source_url as string) ?? null,
      })));
    }
  } catch (err) { console.warn('[Education] Quiz fallback:', err); }
  return shuffle(fallbackQuizVerified);
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

/** Carga la línea de tiempo desde Supabase; si falla, usa el contenido verificado. */
export async function loadTimelineEvents(): Promise<TimelineEvent[]> {
  if (!supabase) return fallbackTimelineVerified;
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
        event_date: (d.event_date as string) ?? null,
        source: (d.source as string) || '', source_url: (d.source_url as string) ?? null,
      }));
    }
  } catch (err) { console.warn('[Education] Timeline fallback:', err); }
  return fallbackTimelineVerified;
}
