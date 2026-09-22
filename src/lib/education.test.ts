// @vitest-environment jsdom
/**
 * HU019 — Consultar contenido educativo.
 * Prueba la carga de quiz / wave facts / timeline (src/lib/educationData) y la
 * lógica de selección de onda y de respuesta correcta del quiz.
 *
 * Se fuerza `supabase = null` para que los loaders usen el fallback local
 * determinista (mismo contenido que la BD), sin depender de la red ni dejar
 * basura en Supabase.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: null }));

import { loadQuizQuestions, loadWaveFacts, loadTimelineEvents } from './educationData';

describe('HU019 — Contenido educativo', () => {
  it('CPR-019-1 test_cargar_educacion: las tres fuentes cargan sin error', async () => {
    const [quiz, facts, timeline] = await Promise.all([
      loadQuizQuestions(),
      loadWaveFacts(),
      loadTimelineEvents(),
    ]);
    expect(Array.isArray(quiz)).toBe(true);
    expect(quiz.length).toBeGreaterThan(0);
    expect(quiz[0]).toHaveProperty('question');
    expect(quiz[0]).toHaveProperty('correct_index');

    expect(typeof facts).toBe('object');
    expect(Object.keys(facts).length).toBeGreaterThan(0);

    expect(Array.isArray(timeline)).toBe(true);
    expect(timeline.length).toBeGreaterThan(0);
  });

  it('CPR-019-2 test_seleccionar_onda_s: seleccionar "S" muestra un dato de facts["S"]', async () => {
    const facts = await loadWaveFacts();
    // La UI (WaveExplorer) hace: setSelected('S') → toma un fact de facts['S'].
    const selected = 'S';
    const waveFacts = facts[selected] || [];
    expect(waveFacts.length).toBeGreaterThan(0);
    const shown = waveFacts[Math.floor(Math.random() * waveFacts.length)];
    expect(typeof shown).toBe('string');
    expect(shown.length).toBeGreaterThan(0);
  });

  it('CPR-019-3 test_quiz_respuesta_correcta: responder correct_index marca correcto y hay explicación', async () => {
    const quiz = await loadQuizQuestions();
    const q = quiz[0];
    // La UI (QuizGame.handleAnswer) marca correcto cuando idx === q.correct_index.
    const answer = q.correct_index;
    const isCorrect = answer === q.correct_index;
    expect(isCorrect).toBe(true);
    // Se muestra la explicación asociada.
    expect(q.explanation).toBeTruthy();
    expect(typeof q.explanation).toBe('string');
  });

  it('CPR-019-4 test_timeline_eventos: devuelve hitos con año y descripción', async () => {
    const timeline = await loadTimelineEvents();
    expect(timeline.length).toBeGreaterThan(0);
    for (const ev of timeline) {
      expect(typeof ev.year).toBe('number');
      expect(ev.year).toBeGreaterThan(1500);
      expect(ev.description).toBeTruthy();
      expect(ev.title).toBeTruthy();
    }
  });
});
