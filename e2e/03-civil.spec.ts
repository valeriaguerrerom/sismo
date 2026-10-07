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

  test('C3 — métricas: malla FDM (dt, nodos/λ, magnitud, fuente)', async ({ app, page }) => {
    await app.selectScenario(/didáctico \(homogéneo\)/i);
    await app.runSimulation();
    // El detalle de métricas vive en el acordeón "Malla FDM" (plegado por
    // defecto). Lo abrimos y comprobamos valores clave.
    const malla = page.getByRole('button', { name: /Malla FDM/ }).first();
    await malla.scrollIntoViewIfNeeded();
    if ((await malla.getAttribute('aria-expanded')) !== 'true') await malla.click();
    await app.settle(200);
    await expect(page.getByText(/Paso temporal \(dt\)/).first()).toBeVisible();
    await expect(page.getByText(/Nodos\/λ/).first()).toBeVisible();
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
    test.setTimeout(200_000); // la generación 3D (varias estaciones) tarda
    await app.navbarGo('map3d');
    await expect(page.getByRole('heading', { name: 'Mapa 3D de propagación de ondas en Nariño' })).toBeVisible();

    // Cargar un evento para tener algo que recalcular.
    await app.map3dLoadFirstEvent();

    // Cambiar a IASP91 y recalcular (el modelo terrestre no auto-recalcula).
    await page.getByRole('button', { name: 'IASP91' }).first().click();
    await app.settle(300);
    await page.getByRole('button', { name: 'Recalcular con estos valores' }).click();
    await expect(page.getByRole('button', { name: /Reproducir|Pausar/ }).first()).toBeEnabled({ timeout: 60_000 });
  });
});

test.describe('Civil — Educación', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.login();
  });

  test('C7 — quiz: responder preguntas y llegar al resultado', async ({ app, page }) => {
    await app.navbarGo('education');
    await page.getByRole('button', { name: 'Quiz' }).first().click();
    await app.settle(400);

    // La tarjeta del quiz muestra "Quiz sísmico" y "N/M · P pts".
    const card = page.locator('div.rounded-2xl').filter({ hasText: 'Quiz sísmico' }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });

    // Responder hasta terminar. En cada pregunta: hay un bloque de opciones
    // (botones) y, tras elegir una, aparece un botón de avance a ancho completo
    // ("Siguiente pregunta" o "Ver resultado"). El quiz arma 8–10 preguntas.
    const advance = page.getByRole('button', { name: /Siguiente pregunta|Ver resultado/ });
    const retry = page.getByRole('button', { name: /Intentar de nuevo/ });

    for (let i = 0; i < 12; i++) {
      if (await retry.isVisible().catch(() => false)) break;

      // Elegir la PRIMERA opción de respuesta. Las opciones son los botones del
      // contenedor .space-y-2.mb-4 (antes del bloque de resultado/avance).
      const optionsGroup = card.locator('div.space-y-2').first();
      const firstOption = optionsGroup.getByRole('button').first();
      await expect(firstOption).toBeVisible({ timeout: 10_000 });
      await firstOption.click();

      // Tras responder aparece el botón de avance; pulsarlo.
      await expect(advance).toBeVisible({ timeout: 10_000 });
      await advance.click();
      await app.settle(250);
    }

    // Al final debe verse el resultado (botón "Intentar de nuevo").
    await expect(retry).toBeVisible({ timeout: 20_000 });
  });
});
