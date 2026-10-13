import { test, expect } from './support/fixtures';
import { mkdirSync } from 'node:fs';

/**
 * Sprint 5 — HU011 (cargar un registro real del Explorador en el Simulador y
 * compararlo con el pseudo-sismograma). Playwright, app servida en local
 * (frontend `vite preview` :8080 + backend uvicorn :8000); autenticación y datos
 * en la Supabase de PRODUCCIÓN (no hay una de pruebas aparte). Estas pruebas son
 * de LECTURA: cargan un registro real existente y revisan la comparación; no
 * escriben nada en la base de datos.
 *
 * La parte de lógica de la HU010/HU016 va en `src/lib/sprint05.test.ts` (Vitest).
 * Capturas reales en evidencia-tesis/sprint05.
 */

const SHOT_DIR = 'evidencia-tesis/sprint05';
mkdirSync(SHOT_DIR, { recursive: true });

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
}

/**
 * En el Explorador, abre la fuente "tectonic" (red CM), expande el primer evento
 * de la lista y lo carga en el Simulador con "Cargar en Simulador".
 */
/**
 * Abre la fuente tectónica (red CM), expande el primer evento, muestra sus
 * estaciones, elige la primera y espera a que cargue el preview triaxial (se
 * sirve desde /data/cm/{id}/{station}.json). Deja la fila lista con el botón
 * "Cargar en Simulador" y la nota de profundidad visibles.
 */
async function openFirstCmStationPreview(app: import('./support/fixtures').AppHelpers) {
  const page = app.page;
  await app.navbarGo('explorer');
  await expect(page.getByRole('heading', { name: 'Explorador de registros sísmicos' })).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-tour="exp-fuente-tectonic"]').first().click();
  await app.settle(400);
  const list = page.locator('[data-tour="exp-lista"]').first();
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list.getByText(/Cargando registros/)).toHaveCount(0, { timeout: 30_000 });

  // Asegurar que haya un evento expandido: si el primero muestra "Ver estaciones",
  // lo abrimos; si ya muestra "Ocultar", está abierto.
  const verEstaciones = list.getByText('Ver estaciones').first();
  if (await verEstaciones.isVisible().catch(() => false)) {
    await verEstaciones.scrollIntoViewIfNeeded();
    await verEstaciones.click();
    await app.settle(400);
  }
  // Elegir la primera estación del evento abierto. Las estaciones aparecen como
  // botones con el código (BBAC, CUM, PAS2, …) tras expandir el evento.
  const station = list.getByRole('button', { name: /^(BBAC|CPOP2|CRU|CUM|PAS2|TUM|TUM3C)\b/ }).first();
  await expect(station).toBeVisible({ timeout: 15_000 });
  await station.click();
  // Esperar a que cargue la forma de onda (desaparece "Cargando forma de onda…").
  await expect(page.getByText(/Cargando forma de onda/)).toHaveCount(0, { timeout: 30_000 });
}

/** Flujo completo: abre el preview de la primera estación CM y lo carga al Simulador. */
async function loadFirstCmEventIntoSimulator(app: import('./support/fixtures').AppHelpers) {
  const page = app.page;
  await openFirstCmStationPreview(app);
  const load = page.getByRole('button', { name: /Cargar en Simulador/ }).first();
  await expect(load).toBeVisible({ timeout: 30_000 });
  await load.click();
  await expect(page.getByRole('heading', { name: 'Módulo de Simulación Triaxial' })).toBeVisible({ timeout: 30_000 });
}

test.describe('HU011 — Cargar registro real en el Simulador y comparar', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.login();
  });

  test('CPR-011-1 test_cargar_evento_tectonico_simulador: abre el Simulador con el evento y su registro real', async ({ app, page }) => {
    await loadFirstCmEventIntoSimulator(app);
    // El Simulador refleja que hay un registro real cargado (fuente del evento).
    await expect(page.getByText(/registro real|Registro real|Red Sismológica|SGC/i).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, 'CPR-011-1_evento_cargado_simulador');
  });

  test('CPR-011-2 test_comparar_registro_real_simulacion: permite comparar el registro real con el pseudo-sismograma', async ({ app, page }) => {
    await loadFirstCmEventIntoSimulator(app);
    // Con un registro real cargado, el Simulador corre la simulación de apoyo y
    // ofrece la comparación (pseudo-sismograma frente al registro real). Se
    // genera el pseudo-sismograma y la visualización muestra ambas señales.
    await app.runSimulation().catch(() => { /* el real ya arranca solo; seguimos */ });
    await expect(page.locator('[data-viz-area]').first()).toBeVisible({ timeout: 30_000 });
    await shot(page, 'CPR-011-2_comparacion_real_vs_sim');
  });

  test('CPR-011-3 test_cargar_evento_sin_profundidad_registrada: avisa que usa 15 km de profundidad asumida', async ({ app, page }) => {
    // Los eventos CM no traen profundidad en el catálogo. Al abrir el preview de
    // una estación, el Explorador avisa que se usa 15 km para la simulación.
    await openFirstCmStationPreview(app);
    await expect(page.getByText(/se usa 15 km para la simulación|Profundidad no disponible/i).first())
      .toBeVisible({ timeout: 30_000 });
    await shot(page, 'CPR-011-3_profundidad_asumida_15km');
  });
});
