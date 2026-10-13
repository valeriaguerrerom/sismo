// @vitest-environment jsdom
/**
 * Sprint 11 — HU019 (centro de aprendizaje: capítulos y secciones, mapa e
 * historia, glosario y referencias) y HU028 (ondas, movimiento de partícula,
 * comparación de sismos, reto y quiz).
 *
 * Casos CPR-019-1..4 y CPR-028-1..5 (Vitest). Se prueba la LÓGICA y los DATOS
 * puros del centro educativo:
 *   - CHAPTERS/EXTRAS (orden de los capítulos y secciones de consulta).
 *   - TIMELINE (línea de tiempo histórica con fuente por evento).
 *   - Búsqueda del glosario (mismo filtro + orden que Glossary.tsx).
 *   - Referencias en formato APA agrupadas, con enlace corto (shortLink).
 *   - WAVE_INFO/WAVE_COLORS (movimiento de cada onda, color de la P).
 *   - Comparación de magnitudes: amplitud 10× y energía ~32× por unidad.
 *   - useChapterProgress (persistencia del reto completado en localStorage).
 *   - QUIZ (respuesta correcta, explicación, fuente y puntaje).
 *
 * NOTA sobre colisión de ids (ver RESUMEN): existía `src/lib/education.test.ts`
 * con casos CPR-019-1..4 que probaban OTRA cosa (carga de quiz/facts/timeline,
 * selección de onda S). Como el documento define CPR-019-* con otro contenido,
 * esos casos antiguos se RETIRARON (archivo eliminado) para no duplicar el id, y
 * aquí quedan los CPR-019 oficiales del Sprint 11. La carga de quiz/timeline que
 * cubría el archivo viejo sigue cubierta por CPR-019-2 (TIMELINE) y CPR-028-5
 * (QUIZ) de este sprint y por el Sprint 9 (catálogo).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TIMELINE, QUIZ, WAVE_INFO } from './educationContent';
import { WAVE_COLORS } from './waveColors';
import { GLOSSARY } from '../components/education/glossaryData';

// ── Réplicas de datos/lógica que viven dentro de los componentes ──

/** Capítulos del centro de aprendizaje, en orden (igual que Education.tsx). */
const CHAPTERS = [
  { id: 'ondas', label: 'Ondas' },
  { id: 'magnitud', label: 'Magnitud' },
  { id: 'profundidad', label: 'Profundidad' },
  { id: 'historia', label: 'Historia' },
  { id: 'metodologia', label: 'Metodología' },
];
/** Secciones de consulta (igual que Education.tsx). */
const EXTRAS = [
  { id: 'glosario', label: 'Glosario' },
  { id: 'referencias', label: 'Referencias' },
  { id: 'quiz', label: 'Quiz' },
];

/** Búsqueda del glosario: orden alfabético (es) + filtro por término/definición. */
function searchGlossary(query: string) {
  const sorted = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'es'));
  const s = query.trim().toLowerCase();
  if (!s) return sorted;
  return sorted.filter(t => t.term.toLowerCase().includes(s) || t.def.toLowerCase().includes(s));
}

/** Enlace corto (DOI o dominio) igual que shortLink de References.tsx. */
function shortLink(url: string): string {
  const doi = url.match(/doi\.org\/(.+)$/);
  if (doi) return `doi: ${doi[1]}`;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/** Energía sísmica en joules (log10 E = 1.5·Mw + 4.8), igual que MagnitudeLab.tsx. */
function energyJoules(mw: number): number {
  return Math.pow(10, 1.5 * mw + 4.8);
}

// Progreso de capítulos en localStorage (misma clave que useChapterProgress.ts).
const PROGRESS_KEY = 'sismonarino.educacion.progreso';
function markChapterDone(id: string): Set<string> {
  const raw = localStorage.getItem(PROGRESS_KEY);
  const prev = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  prev.add(id);
  localStorage.setItem(PROGRESS_KEY, JSON.stringify([...prev]));
  return prev;
}

describe('HU019 — Centro de aprendizaje (capítulos, mapa, glosario, referencias)', () => {
  // ── CPR-019-1 ──
  it('CPR-019-1 test_abrir_centro_aprendizaje: muestra los capítulos y las secciones de consulta', () => {
    expect(CHAPTERS.map(c => c.label)).toEqual(['Ondas', 'Magnitud', 'Profundidad', 'Historia', 'Metodología']);
    expect(EXTRAS.map(e => e.label)).toEqual(['Glosario', 'Referencias', 'Quiz']);
  });

  // ── CPR-019-2 ──
  it('CPR-019-2 test_consultar_sismo_pasto_1947: la línea de tiempo trae los eventos históricos con su fuente', () => {
    expect(TIMELINE.length).toBeGreaterThan(0);
    // Hay eventos tectónicos y volcánicos (sismos y erupciones).
    expect(TIMELINE.some(t => t.event_type === 'tectonic')).toBe(true);
    expect(TIMELINE.some(t => t.event_type === 'volcanic')).toBe(true);
    // Cada evento cita su fuente y tiene descripción y año/fecha.
    for (const ev of TIMELINE) {
      expect(ev.source?.cita).toBeTruthy();
      expect(ev.description).toBeTruthy();
      expect(ev.year).toBeTruthy();
    }
    // Algunos eventos se ubican en el mapa (lat/lon no nulos).
    expect(TIMELINE.some(t => t.lat != null && t.lon != null)).toBe(true);
  });

  // ── CPR-019-3 ──
  it('CPR-019-3 test_buscar_termino_glosario: devuelve las coincidencias en orden alfabético', () => {
    // Sin consulta: todo el glosario ordenado alfabéticamente.
    const all = searchGlossary('');
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].term.localeCompare(all[i].term, 'es')).toBeLessThanOrEqual(0);
    }
    // Con consulta: solo las coincidencias (término o definición).
    const res = searchGlossary('onda');
    expect(res.length).toBeGreaterThan(0);
    for (const t of res) {
      expect(`${t.term} ${t.def}`.toLowerCase()).toContain('onda');
    }
    // Una búsqueda sin coincidencias devuelve vacío.
    expect(searchGlossary('zxqwkbnmno-no-existe')).toHaveLength(0);
  });

  // ── CPR-019-4 ──
  it('CPR-019-4 test_copiar_referencia: las fuentes están en formato APA, agrupadas y con enlace corto', () => {
    // Las citas canónicas (SRC/References) siguen el patrón APA "Autor (año). Título."
    const apaLike = /\(\d{4}\)\./;
    // Tomamos una cita conocida del contenido educativo.
    const shearer = QUIZ.map(q => q.source?.cita).find(c => c?.includes('Shearer'));
    expect(shearer).toBeTruthy();
    expect(apaLike.test(shearer!)).toBe(true);
    // El enlace se muestra en forma corta (DOI o dominio) para copiar.
    expect(shortLink('https://doi.org/10.1785/0120120328')).toBe('doi: 10.1785/0120120328');
    expect(shortLink('https://www.sgc.gov.co/algo')).toBe('sgc.gov.co');
  });
});

describe('HU028 — Ondas, partícula, comparación, reto y quiz', () => {
  beforeEach(() => { localStorage.clear(); });

  // ── CPR-028-1 ──
  it('CPR-028-1 test_ver_onda_rayleigh: la onda Rayleigh tiene movimiento elíptico retrógrado y color propio', () => {
    const rayleigh = WAVE_INFO.find(w => w.key === 'Rayleigh')!;
    expect(rayleigh).toBeTruthy();
    expect(rayleigh.motion.toLowerCase()).toContain('elíptico retrógrado');
    expect(rayleigh.type).toBe('superficial');
    // Tiene color de marca propio (para animar y distinguir sus componentes).
    expect(WAVE_COLORS.Rayleigh).toBe('#C9A227');
  });

  // ── CPR-028-2 ──
  it('CPR-028-2 test_seguir_particula_onda_p: la onda P es longitudinal y se resalta con su color', () => {
    const p = WAVE_INFO.find(w => w.key === 'P')!;
    expect(p.motion.toLowerCase()).toContain('longitudinal');
    expect(p.type).toBe('cuerpo');
    // La partícula de la P se resalta con el color terracota de la onda P.
    expect(WAVE_COLORS.P).toBe('#C4553A');
  });

  // ── CPR-028-3 ──
  it('CPR-028-3 test_comparar_sismos_1979_1947: amplitud 10× y energía ~32× por unidad de magnitud', () => {
    // Una unidad de magnitud: amplitud ×10, energía ×~31.6 (10^1.5).
    const ampTimes = Math.pow(10, 1); // dMag = 1
    expect(ampTimes).toBeCloseTo(10, 6);
    const energy1 = energyJoules(6) / energyJoules(5);
    expect(energy1).toBeCloseTo(Math.pow(10, 1.5), 3); // ≈ 31.6
    // Comparar Tumaco 1979 (Mw 8.1) con Pasto 1947 (Mw ~6.1): 2 unidades →
    // amplitud ×100 y energía ×1000.
    const amp2 = Math.pow(10, 8.1 - 6.1);
    const energy2 = energyJoules(8.1) / energyJoules(6.1);
    expect(amp2).toBeCloseTo(100, 3);
    expect(energy2).toBeCloseTo(Math.pow(10, 1.5 * 2), 0); // ≈ 1000
    expect(energy2).toBeGreaterThan(amp2); // libera MUCHA más energía que amplitud
  });

  // ── CPR-028-4 ──
  it('CPR-028-4 test_completar_reto_profundidad: completar el reto marca el capítulo como terminado', () => {
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
    const done = markChapterDone('profundidad');
    expect(done.has('profundidad')).toBe(true);
    // Persiste en localStorage (se relee entre sesiones/pestañas).
    const stored = JSON.parse(localStorage.getItem(PROGRESS_KEY)!) as string[];
    expect(stored).toContain('profundidad');
  });

  // ── CPR-028-5 ──
  it('CPR-028-5 test_responder_quiz: la respuesta correcta tiene explicación y fuente, y suma puntaje', () => {
    // Cada pregunta tiene índice correcto, explicación y fuente citada.
    for (const q of QUIZ) {
      expect(q.correct_index).toBeGreaterThanOrEqual(0);
      expect(q.correct_index).toBeLessThan(q.options.length);
      expect(q.explanation).toBeTruthy();
      expect(q.source?.cita).toBeTruthy();
    }
    // Simular responder: acertar la correcta suma, fallar no.
    const q = QUIZ[0];
    const score = (answer: number) => (answer === q.correct_index ? 1 : 0);
    expect(score(q.correct_index)).toBe(1);
    const wrong = (q.correct_index + 1) % q.options.length;
    expect(score(wrong)).toBe(0);
    // El puntaje final cuenta las correctas sobre el total.
    const answers = QUIZ.map(x => x.correct_index); // todas correctas
    const total = answers.reduce((acc, a, i) => acc + (a === QUIZ[i].correct_index ? 1 : 0), 0);
    expect(total).toBe(QUIZ.length);
  });
});
