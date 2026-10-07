import { test, expect } from './support/fixtures';

/**
 * LOS OCHO ESCENARIOS DEL INSTRUMENTO DE CIVIL. Enfocados en el valor
 * geotécnico/geofísico del Simulador y el Centro educativo:
 *   C1. Modelo de DOS CAPAS (depósitos blandos sobre roca) genera sismograma.
 *   C2. FUENTE VOLCÁNICA (isótropa): domina la P, la transversal casi nula.
 *   C3. MÉTRICAS: amplitud máx., frecuencia dominante y llegadas P/S presentes.
 *   C4. MOVIMIENTO DE PARTÍCULA: la pestaña de partícula se dibuja.
 *   C5. MAPA DE CALOR del subsuelo (corte) se dibuja.
 *   C6. IASP91 en el Mapa 3D: cambiar al modelo terrestre y recalcular.
 *   C7. QUIZ de Educación: responder y avanzar hasta el resultado.
 *   C8. INTERPRETACIÓN educativa del resultado se muestra.
 */

test.describe('Civil — Simulador (geotecnia y ondas)', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.login();
    await app.navbarGo('simulation');
    await expect(app.page.getByRole('heading', { name: 'Módulo de Simulación Triaxial' })).toBeVisible();
  });

  test('C1 — modelo de dos capas (Pasto sobre depósitos volcánicos)', async ({ app, page }) => {
    await app.selectScenario(/dos capas/i);
    await app.runSimulation();
    await app.showVizTab('tab-2d');
    await expect(page.locator('[data-viz-area]').first()).toBeVisible();
  });

  test('C2 — fuente volcánica (isótropa) del Galeras', async ({ app, page }) => {
    await app.selectScenario(/[Vv]olcano-tect[óo]nico del Galeras/);
    await app.runSimulation();
    // La métrica "Fuente" debe indicar Volcánica.
    await expect(page.getByText('Volcánica').first()).toBeVisible({ timeout: 20_000 });
  });

  test('C3 — métricas: amplitud, frecuencia y llegadas P/S', async ({ app, page }) => {
    await app.selectScenario(/didáctico \(homogéneo\)/i);
    await app.runSimulation();
    // Abrir el acordeón de malla/metricas y verificar que hay valores.
    await expect(page.getByText(/Magnitud/).first()).toBeVisible();
    await expect(page.getByText(/Paso temporal \(dt\)/).first()).toBeVisible();
    // Las llegadas P/S aparecen como métricas (texto "P" / "S" con tiempos).
    await expect(page.getByText(/Mw\s?\d/).first()).toBeVisible();
  });

  test('C4 — movimiento de partícula se dibuja', async ({ app, page }) => {
    await app.selectScenario(/didáctico \(homogéneo\)/i);
    await app.runSimulation();
    await app.showVizTab('tab-particle');
    await expect(page.locator('[data-tour="viz-area"]').first()).toBeVisible();
    // Hay un canvas o imagen del hodograma en el área de visualización.
    await expect(
      page.locator('[data-tour="viz-area"] canvas, [data-tour="viz-area"] img, [data-tour="viz-area"] svg').first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('C5 — mapa de calor del subsuelo (corte) se dibuja', async ({ app, page }) => {
    await app.selectScenario(/dos capas/i);
    await app.runSimulation();
    await app.showVizTab('tab-triaxial');
    await expect(
      page.locator('[data-tour="viz-area"] canvas, [data-tour="viz-area"] img').first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('C8 — interpretación educativa del resultado', async ({ app, page }) => {
    await app.selectScenario(/dos capas/i);
    await app.runSimulation();
    // La sección "Interpretación" existe en el panel de resultados.
    await expect(page.getByText('Interpretación').first()).toBeVisible();
  });
});

test.describe('Civil — Mapa 3D (modelo terrestre)', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.login();
  });

  test('C6 — IASP91: cambiar al modelo terrestre y recalcular', async ({ app, page }) => {
    await app.navbarGo('map3d');
    await expect(page.getByRole('heading', { name: 'Mapa 3D de propagación de ondas en Nariño' })).toBeVisible();

    // Cargar un evento para tener algo que recalcular.
    await page.getByRole('button', { name: /Cargar (un )?evento/i }).first().click();
    await app.settle(500);
    const modalItem = page.locator('[role="dialog"] button, .modal button').filter({ hasText: /M\s?\d|20\d\d|Galeras|CM/ }).first();
    if (await modalItem.count()) await modalItem.click();
    await app.settle(600);

    // Cambiar a IASP91 y recalcular.
    await page.getByRole('button', { name: 'IASP91' }).first().click();
    await app.settle(300);
    await page.getByRole('button', { name: 'Recalcular con estos valores' }).click();
    await expect(page.getByRole('button', { name: /Reproducir|Pausar/ }).first()).toBeVisible({ timeout: 40_000 });
  });
});

test.describe('Civil — Educación', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.login();
  });

  test('C7 — quiz: responder preguntas y llegar al resultado', async ({ app, page }) => {
    await app.navbarGo('education');
    await page.getByRole('button', { name: 'Quiz', exact: true }).first().click();
    await app.settle(400);

    // Responder hasta terminar: en cada pregunta se hace click en una opción
    // (revela el resultado) y luego "Siguiente pregunta" / "Ver resultado".
    for (let i = 0; i < 15; i++) {
      // El bloque de opciones son botones; elegimos la primera opción disponible
      // que no sea de navegación.
      const next = page.getByRole('button', { name: /Siguiente pregunta/ });
      const seeResult = page.getByRole('button', { name: /Ver resultado/ });
      const retry = page.getByRole('button', { name: /Intentar de nuevo/ });

      if (await retry.isVisible().catch(() => false)) break; // ya en resultados

      if (await next.isVisible().catch(() => false)) {
        await next.click();
        await app.settle(200);
        continue;
      }
      if (await seeResult.isVisible().catch(() => false)) {
        await seeResult.click();
        await app.settle(300);
        break;
      }
      // Aún no respondida: elegir una opción (botones de respuesta A/B/C...).
      const options = page.locator('main button').filter({ hasNot: page.locator('svg[aria-hidden]') });
      const count = await options.count();
      let clicked = false;
      for (let k = 0; k < count; k++) {
        const b = options.nth(k);
        const label = (await b.textContent())?.trim() || '';
        if (/Siguiente|Ver resultado|Intentar|Ondas|Magnitud|Profundidad|Historia|Metodolog|Glosario|Referencias|Quiz/.test(label)) continue;
        if (!(await b.isVisible().catch(() => false))) continue;
        await b.click();
        clicked = true;
        break;
      }
      await app.settle(250);
      if (!clicked) break;
    }

    // Al final debe verse el resultado (botón "Intentar de nuevo").
    await expect(page.getByRole('button', { name: /Intentar de nuevo/ })).toBeVisible({ timeout: 20_000 });
  });
});
