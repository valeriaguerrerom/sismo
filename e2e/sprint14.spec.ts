import { test, expect } from './support/fixtures';
import { mkdirSync } from 'node:fs';

/**
 * Sprint 14 — HU031 (recorrido guiado) y HU040 (bandeja de mensajes del admin).
 * Parte Playwright. App en local (frontend `vite preview` :8080 + backend
 * uvicorn :8000); autenticación en la Supabase de PRODUCCIÓN.
 *
 * HU031: el recorrido guiado (Driver.js) se prueba relanzándolo con el botón
 * "Ver guía" y operando el popover (Siguiente / Omitir). La marca de "visto"
 * (`tours_vistos`) es idempotente: si la cuenta de prueba ya vio el tour, NO se
 * reescribe el perfil (ver `markTourSeen` en auth.tsx), así que no hay escritura.
 *
 * HU040 se OMITE: la bandeja de mensajes vive en el panel de administración y la
 * cuenta de prueba es Investigador, no administrador; probarla exigiría una
 * cuenta admin (ver tabla de omitidos en el RESUMEN).
 *
 * Capturas reales en evidencia-tesis/sprint14.
 */

const SHOT_DIR = 'evidencia-tesis/sprint14';
mkdirSync(SHOT_DIR, { recursive: true });

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
}

/** Popover del tour (Driver.js). */
function popover(page: import('@playwright/test').Page) {
  return page.locator('.driver-popover');
}

test.describe('HU031 — Recorrido guiado', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ app, page }) => {
    await app.open();
    await app.login();
    await app.navbarGo('simulation');
    await expect(page.getByRole('heading', { name: 'Módulo de Simulación Triaxial' })).toBeVisible();
  });

  // ── CPR-031-1 ──
  // El recorrido guía paso a paso por las partes del módulo (popover con el
  // progreso "1 de N" y el botón Siguiente). Se lanza con "Ver guía".
  test('CPR-031-1 test_abrir_mapa_3d_primera_vez: inicia un recorrido guiado paso a paso', async ({ page }) => {
    await page.getByRole('button', { name: 'Ver guía' }).first().click();
    await expect(popover(page)).toBeVisible({ timeout: 10_000 });
    // Indicador de progreso en español "1 de N" (texto exacto del pie del tour).
    await expect(popover(page).getByText(/^\d+\s+de\s+\d+$/).first()).toBeVisible();
    await expect(popover(page).getByRole('button', { name: 'Siguiente' })).toBeVisible();
    await shot(page, 'CPR-031-1_recorrido_inicia');
  });

  // ── CPR-031-2 ──
  // Repetir el recorrido: desde "Ver guía" el tour vuelve a iniciarse y avanza.
  test('CPR-031-2 test_repetir_recorrido_simulador: vuelve a iniciar el recorrido y avanza', async ({ page }) => {
    await page.getByRole('button', { name: 'Ver guía' }).first().click();
    await expect(popover(page)).toBeVisible({ timeout: 10_000 });
    const firstTitle = await popover(page).locator('.driver-popover-title').textContent();
    // Avanzar al siguiente paso.
    await popover(page).getByRole('button', { name: 'Siguiente' }).click();
    await page.waitForTimeout(400);
    const secondTitle = await popover(page).locator('.driver-popover-title').textContent();
    expect(secondTitle).not.toBe(firstTitle); // cambió de paso
    await shot(page, 'CPR-031-2_recorrido_avanza');
  });

  // ── CPR-031-3 ──
  // Omitir el recorrido: el enlace "Omitir" cierra el tour.
  test('CPR-031-3 test_omitir_recorrido: cierra el recorrido', async ({ page }) => {
    await page.getByRole('button', { name: 'Ver guía' }).first().click();
    await expect(popover(page)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Omitir' }).first().click();
    await expect(popover(page)).toBeHidden({ timeout: 10_000 });
    await shot(page, 'CPR-031-3_recorrido_omitido');
  });

  // ── CPR-031-4 ──
  // Abrir otro módulo ya visto no vuelve a mostrar el recorrido automáticamente
  // (la cuenta de prueba ya tiene los tours marcados como vistos).
  test('CPR-031-4 test_abrir_nuevo_modulo: no vuelve a mostrar el recorrido automáticamente', async ({ app, page }) => {
    // Navegar al Explorador: no debe aparecer solo el popover del tour.
    await app.navbarGo('explorer');
    await expect(page.getByRole('heading', { name: 'Explorador de registros sísmicos' })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500); // margen por si intentara auto-lanzarse
    await expect(popover(page)).toHaveCount(0);
    await shot(page, 'CPR-031-4_sin_auto_recorrido');
  });
});

const ADMIN_ONLY = 'la bandeja de mensajes vive en el panel de administración y la cuenta de prueba es Investigador, no administrador; probarla exigiría una cuenta admin (evitar escritura/accesos que no son de la cuenta de prueba, no hay Supabase de pruebas aparte)';

test.describe('HU040 — Bandeja de mensajes del admin (omitida)', () => {
  test('CPR-040-1 test_consultar_mensajes: lista los mensajes con tipo, fecha y origen', async () => {
    test.skip(true, `OMITIDO: ${ADMIN_ONLY}.`);
  });
  test('CPR-040-2 test_filtrar_mensajes_visitantes: muestra solo los mensajes de visitantes', async () => {
    test.skip(true, `OMITIDO: ${ADMIN_ONLY}.`);
  });
  test('CPR-040-3 test_responder_mensaje: muestra el correo para responder', async () => {
    test.skip(true, `OMITIDO: ${ADMIN_ONLY}.`);
  });
});
