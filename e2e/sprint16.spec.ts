import { test, expect } from './support/fixtures';
import { mkdirSync } from 'node:fs';

/**
 * Sprint 16 — HU035 (disponibilidad y robustez de la plataforma) y HU036
 * (integración y pruebas automáticas en el repositorio). Parte Playwright.
 * App en local (frontend `vite preview` :8080 + backend uvicorn :8000);
 * Supabase de PRODUCCIÓN. Son de LECTURA; no escriben en la base.
 *
 * HU036 (CI / repositorio) se OMITE: son procesos del flujo de integración
 * continua (GitHub Actions) y del propio arnés de pruebas, no comportamientos
 * de la aplicación verificables desde un navegador (ver tabla de omitidos).
 *
 * Capturas reales en evidencia-tesis/sprint16.
 */

const SHOT_DIR = 'evidencia-tesis/sprint16';
mkdirSync(SHOT_DIR, { recursive: true });

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
}

test.describe('HU035 — Disponibilidad y robustez', () => {
  // ── CPR-035-1 ──
  // La plataforma carga correctamente. NOTA de discrepancia (ver RESUMEN): en
  // local se sirve por HTTP (vite preview); el HTTPS lo aplica el despliegue de
  // producción (sismonarino.com). Aquí se verifica que la plataforma carga.
  test('CPR-035-1 test_abrir_plataforma_linea: la plataforma carga (HTTPS en producción)', async ({ app, page }) => {
    await app.open();
    // El Inicio pinta su encabezado principal: la plataforma está disponible.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, 'CPR-035-1_plataforma_carga');
  });

  // ── CPR-035-2 ──
  // En una pantalla de celular la interfaz se adapta sin desbordes horizontales.
  test('CPR-035-2 test_recorrer_plataforma_celular: la interfaz se adapta al móvil sin desbordes', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // tamaño tipo celular
    await app.open();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    // No hay desborde horizontal: el ancho del documento no supera el viewport
    // (se tolera 1 px por redondeo).
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
    await shot(page, 'CPR-035-2_responsive_celular');
  });
});

const CI_REASON = 'es un proceso del flujo de integración continua (GitHub Actions) y del arnés de pruebas, no un comportamiento de la aplicación verificable desde el navegador';
const CANT_FORCE = 'no se puede forzar de forma fiable un error de carga de módulo/chunk desde Playwright sin instrumentar la aplicación (las páginas se importan de forma estática); el Error Boundary y la recarga por versión nueva se verifican por revisión del componente ErrorBoundary.tsx';

test.describe('HU035 — Robustez (casos omitidos)', () => {
  test('CPR-035-3 test_forzar_error_modulo: muestra un mensaje con reintentar o volver al inicio', async () => {
    test.skip(true, `OMITIDO: ${CANT_FORCE}.`);
  });
  test('CPR-035-4 test_navegar_despues_despliegue: recarga una vez para traer la versión nueva', async () => {
    test.skip(true, `OMITIDO: ${CANT_FORCE}.`);
  });
});

test.describe('HU036 — Integración y pruebas automáticas (omitida)', () => {
  test('CPR-036-1 test_subir_cambio_repositorio: ejecuta las pruebas del navegador y del servidor', async () => {
    test.skip(true, `OMITIDO: ${CI_REASON} (workflow .github/workflows/e2e.yml).`);
  });
  test('CPR-036-2 test_ejecutar_pruebas_punta_punta: un navegador automatizado recorre los escenarios y reporta cuáles pasan', async () => {
    test.skip(true, `OMITIDO: ${CI_REASON} (es la propia ejecución de Playwright en CI).`);
  });
  test('CPR-036-3 test_detectar_error_consola: la prueba falla y el reporte incluye una captura', async () => {
    test.skip(true, `OMITIDO: ${CI_REASON} (lo garantiza la config de Playwright: screenshot/trace on failure).`);
  });
});
