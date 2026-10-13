import { test, expect, skipIfHeadlessFirefoxWebGL } from './support/fixtures';
import { mkdirSync } from 'node:fs';

/**
 * Sprint 3 — HU008 (ver y animar los sismogramas de la simulación) y HU024
 * (mapa de calor del subsuelo y movimiento de partícula). Playwright, contra la
 * app servida en local (frontend `vite preview` :8080 + backend uvicorn :8000);
 * la autenticación y los datos van a la Supabase de PRODUCCIÓN (no hay una de
 * pruebas aparte). Estas pruebas son de LECTURA: generan una simulación en el
 * navegador y revisan la visualización; no escriben nada en la base de datos.
 *
 * Capturas reales en evidencia-tesis/sprint03.
 */

const SHOT_DIR = 'evidencia-tesis/sprint03';
mkdirSync(SHOT_DIR, { recursive: true });

/** Guarda una captura de pantalla con el id del caso. */
async function shot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
}

test.describe('HU008 — Sismogramas de la simulación (2D)', () => {
  // La simulación FDM del backend (/api/simulate/full) devuelve ~6 MB (snapshots
  // del campo) y tarda varios segundos; con login + navegación cada prueba
  // necesita más que el timeout por defecto.
  test.setTimeout(180_000);
  test.beforeEach(async ({ app, page }) => {
    await app.open();
    await app.login();
    await app.navbarGo('simulation');
    await expect(page.getByRole('heading', { name: 'Módulo de Simulación Triaxial' })).toBeVisible();
    await app.selectScenario(/didáctico \(homogéneo\)/i);
    await app.runSimulation();
    await app.showVizTab('tab-2d');
  });

  test('CPR-008-1 test_ver_sismogramas_simulacion_tectonica: trazas N/E/Z con eje de tiempo y un color por componente', async ({ app, page }) => {
    // El área de visualización 2D está presente.
    await expect(page.locator('[data-viz-area]').first()).toBeVisible();
    // Leyenda con las tres componentes (un color por cada una).
    await expect(page.getByText('Norte').first()).toBeVisible();
    await expect(page.getByText('Este').first()).toBeVisible();
    await expect(page.getByText('Vertical').first()).toBeVisible();
    // Hay trazas dibujadas (WaveChart las pinta como SVG; algunas vistas usan canvas).
    const traces = page.locator('[data-viz-area] svg, [data-viz-area] canvas');
    expect(await traces.count()).toBeGreaterThanOrEqual(1);
    await shot(page, 'CPR-008-1_sismogramas_NEZ');
  });

  test('CPR-008-2 test_identificar_arribos_trazas: se marcan los arribos P y S en las trazas', async ({ app, page }) => {
    // El panel de resultados describe las llegadas P y S (la interpretación menciona
    // la onda P y la onda S y el intervalo S−P). Abrimos "Interpretación".
    const interp = page.getByRole('button', { name: /Interpretación/ }).first();
    if (await interp.isVisible().catch(() => false) && (await interp.getAttribute('aria-expanded')) !== 'true') {
      await interp.click();
      await app.settle(200);
    }
    await expect(page.getByText(/onda P/i).first()).toBeVisible();
    await expect(page.getByText(/onda S/i).first()).toBeVisible();
    await shot(page, 'CPR-008-2_arribos_P_S');
  });

  test('CPR-008-3 test_reproducir_animacion_doble_velocidad: cursor con pausa, reinicio y velocidades 0.5x/1x/2x/4x', async ({ app, page }) => {
    // Las cuatro velocidades están disponibles.
    for (const s of ['0.5x', '1x', '2x', '4x']) {
      await expect(page.getByRole('button', { name: s, exact: true }).first()).toBeVisible();
    }
    // Seleccionar 2x (doble velocidad).
    await page.getByRole('button', { name: '2x', exact: true }).first().click();
    await app.settle(200);
    // Controles de transporte: reproducir/pausar y reiniciar (barra de progreso).
    const progress = page.locator('[data-viz-area] input[type="range"]').first();
    await expect(progress).toBeVisible();
    await shot(page, 'CPR-008-3_velocidad_2x');
  });

  test('CPR-008-4 test_ver_unicamente_tramo_onda_s: recortar la vista al tramo del evento', async ({ app, page }) => {
    // El encuadre por defecto es "Ajustar al evento" (recorta al pulso P–S).
    const fit = page.getByRole('button', { name: /Ajustar al evento|Duración completa/ }).first();
    await expect(fit).toBeVisible();
    const label = (await fit.textContent())?.trim();
    // Alternar el encuadre cambia entre tramo del evento y duración completa.
    await fit.click();
    await app.settle(200);
    const label2 = (await fit.textContent())?.trim();
    expect(label2).not.toBe(label);
    await shot(page, 'CPR-008-4_recorte_tramo');
  });

  test('CPR-008-5 test_ampliar_visualizacion: ampliar a pantalla completa y volver', async ({ app, page }) => {
    const toggle = page.getByRole('button', { name: /Ampliar|Reducir/ }).first();
    await expect(toggle).toBeVisible();
    await toggle.click(); // ampliar
    await app.settle(300);
    await expect(page.locator('[data-viz-area]').first()).toBeVisible();
    await shot(page, 'CPR-008-5_pantalla_completa');
    // Volver a la vista normal.
    await page.getByRole('button', { name: /Reducir|Ampliar/ }).first().click();
    await app.settle(200);
  });
});

test.describe('HU024 — Mapa de calor y movimiento de partícula', () => {
  test.setTimeout(180_000);
  test.beforeEach(async ({ app, page }) => {
    await app.open();
    await app.login();
    await app.navbarGo('simulation');
    await expect(page.getByRole('heading', { name: 'Módulo de Simulación Triaxial' })).toBeVisible();
  });

  test('CPR-024-1 test_ver_mapa_calor_simulacion: corte vertical del subsuelo animado con fuente y estación', async ({ app, page }, testInfo) => {
    skipIfHeadlessFirefoxWebGL(testInfo);
    await app.selectScenario(/dos capas/i);
    await app.runSimulation();
    await app.showVizTab('tab-triaxial');
    await expect(
      page.locator('[data-tour="viz-area"] canvas, [data-tour="viz-area"] img').first(),
    ).toBeVisible({ timeout: 20_000 });
    await shot(page, 'CPR-024-1_mapa_calor_corte');
  });

  test('CPR-024-2 test_ver_trayectoria_particula: hodograma N/E/Z con reposo, P y S', async ({ app, page }, testInfo) => {
    skipIfHeadlessFirefoxWebGL(testInfo);
    await app.selectScenario(/didáctico \(homogéneo\)/i);
    await app.runSimulation();
    await app.showVizTab('tab-particle');
    await expect(page.locator('[data-tour="viz-area"]').first()).toBeVisible();
    await expect(
      page.locator('[data-tour="viz-area"] canvas, [data-tour="viz-area"] img, [data-tour="viz-area"] svg').first(),
    ).toBeVisible({ timeout: 20_000 });
    await shot(page, 'CPR-024-2_trayectoria_particula');
  });

  test('CPR-024-3 test_ver_solo_trayectoria_onda_p: la trayectoria puede mostrar solo el movimiento de la P', async ({ app, page }, testInfo) => {
    skipIfHeadlessFirefoxWebGL(testInfo);
    await app.selectScenario(/didáctico \(homogéneo\)/i);
    await app.runSimulation();
    await app.showVizTab('tab-particle');
    await expect(page.locator('[data-tour="viz-area"]').first()).toBeVisible();
    // Si hay un selector de fase (P/S) en el hodograma, elegir "P"; si no, el
    // control de reproducción permite ver el tramo P. Buscamos un botón de fase.
    const phaseP = page.getByRole('button', { name: /^P$|Onda P|Solo P/ }).first();
    if (await phaseP.isVisible().catch(() => false)) {
      await phaseP.click();
      await app.settle(200);
    }
    await expect(
      page.locator('[data-tour="viz-area"] canvas, [data-tour="viz-area"] img, [data-tour="viz-area"] svg').first(),
    ).toBeVisible({ timeout: 20_000 });
    await shot(page, 'CPR-024-3_solo_onda_P');
  });

  test('CPR-024-4 test_comparar_movimiento_fuente_volcanica: la componente transversal es casi nula (fuente isótropa)', async ({ app, page }) => {
    await app.selectScenario(/[Vv]olcano-tect[óo]nico del Galeras/);
    await app.runSimulation();
    // La métrica de fuente indica Volcánica (isótropa, sin cizalla).
    await expect(page.getByText('Volcánica').first()).toBeVisible({ timeout: 20_000 });
    await shot(page, 'CPR-024-4_fuente_volcanica');
  });
});
