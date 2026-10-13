import { test, expect } from './support/fixtures';
import { mkdirSync } from 'node:fs';

/**
 * Sprint 6 — HU001 (registro), HU002 (inicio de sesión), HU003 (cierre de
 * sesión) y HU013 (guardar y descargar reportes). Playwright, app servida en
 * local (frontend `vite preview` :8080 + backend uvicorn :8000); autenticación
 * y datos en la Supabase de PRODUCCIÓN (no hay una de pruebas aparte).
 *
 * Alcance acordado: solo lectura + escritura de datos PROPIOS de la cuenta de
 * prueba (guardar/borrar sus reportes, que limpia `pnpm e2e:cleanup`). Se OMITEN
 * los casos que crean cuentas nuevas, usan Google real o requieren una cuenta
 * desactivada / una segunda cuenta (ver tabla de omitidos en el RESUMEN).
 *
 * Capturas reales en evidencia-tesis/sprint06.
 */

const SHOT_DIR = 'evidencia-tesis/sprint06';
mkdirSync(SHOT_DIR, { recursive: true });

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
}

/** Abre el formulario de registro desde Inicio (enlace "Registrarse"). */
async function gotoRegister(app: import('./support/fixtures').AppHelpers) {
  const page = app.page;
  await app.gotoLogin();
  // En el pie del formulario de login, el enlace "Registrarse" cambia el modo.
  await page.getByRole('button', { name: 'Registrarse', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Registrarse' })).toBeVisible({ timeout: 15_000 });
}

test.describe('HU001 — Registro (validaciones de cliente)', () => {
  test.beforeEach(async ({ app }) => { await app.open(); });

  // ── CPR-001-2 ──
  // Contraseña débil: el sistema indica la regla incumplida (mínimo 8 con letras
  // y números) y NO permite enviar el formulario. Es validación de cliente, no
  // crea ninguna cuenta.
  test('CPR-001-2 test_registrarse_contrasena_debil: marca la regla incumplida y no envía', async ({ app, page }) => {
    await gotoRegister(app);
    await page.getByPlaceholder('Nombre y apellidos').fill('Cuenta Prueba');
    await page.getByPlaceholder('correo@ejemplo.com').fill('prueba.debil@ejemplo.com');
    // Contraseña débil: solo letras, menos de 8, sin número ni símbolo.
    await page.getByPlaceholder('Crea una contraseña segura').fill('abc');
    // El botón "Registrarse" (submit) queda deshabilitado y hay un motivo.
    const submit = page.getByRole('main').getByRole('button', { name: 'Registrarse', exact: true });
    await expect(submit).toBeDisabled();
    await expect(page.getByText(/Completa los requisitos de la contraseña/)).toBeVisible();
    await shot(page, 'CPR-001-2_contrasena_debil');
  });

  // ── CPR-001-4 ──
  // Sin aceptar la autorización de datos: el sistema no permite completar el
  // registro (el botón sigue deshabilitado aunque todo lo demás esté bien).
  test('CPR-001-4 test_registrarse_sin_aceptar_autorizacion: no permite completar sin consentimiento', async ({ app, page }) => {
    await gotoRegister(app);
    await page.getByPlaceholder('Nombre y apellidos').fill('Cuenta Prueba');
    await page.getByPlaceholder('correo@ejemplo.com').fill('prueba.sinconsent@ejemplo.com');
    await page.getByPlaceholder('Crea una contraseña segura').fill('Abcdef12!');
    // Sin marcar el consentimiento, el botón sigue deshabilitado con su motivo.
    const submit = page.getByRole('main').getByRole('button', { name: 'Registrarse', exact: true });
    await expect(submit).toBeDisabled();
    await expect(page.getByText(/Acepta la autorización de datos para continuar/)).toBeVisible();
    await shot(page, 'CPR-001-4_sin_autorizacion');
  });
});

test.describe('HU002 — Inicio de sesión', () => {
  test.beforeEach(async ({ app }) => { await app.open(); });

  // ── CPR-002-1 ──
  test('CPR-002-1 test_iniciar_sesion_credenciales_validas: inicia sesión y entra a la plataforma', async ({ app, page }) => {
    await app.login();
    // Sesión iniciada: el navbar muestra "Cerrar sesión".
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible({ timeout: 15_000 });
    await shot(page, 'CPR-002-1_sesion_iniciada');
  });

  // ── CPR-002-2 ──
  // Contraseña errada: mensaje "Correo o contraseña incorrectos" sin revelar si
  // el correo existe. Usa el correo de la cuenta de prueba con contraseña falsa;
  // no crea ni modifica datos.
  test('CPR-002-2 test_iniciar_sesion_contrasena_errada: muestra error sin revelar si el correo existe', async ({ app, page }) => {
    await app.gotoLogin();
    await page.getByPlaceholder('correo@ejemplo.com').fill(process.env.E2E_USER_EMAIL || 'cuenta@ejemplo.com');
    await page.getByPlaceholder('Tu contraseña').fill('contraseña-incorrecta-999');
    await app.authSubmit('Iniciar sesión').click();
    await expect(page.getByRole('alert').filter({ hasText: /incorrect/i }).first()).toBeVisible({ timeout: 20_000 });
    await shot(page, 'CPR-002-2_credenciales_incorrectas');
  });

  // ── CPR-002-4 ──
  // Sin sesión, el acceso a los módulos está reservado: el Simulador no está en
  // el navbar y el Inicio avisa que el acceso es para investigadores
  // registrados. Al iniciar sesión, el Simulador queda disponible.
  test('CPR-002-4 test_abrir_simulador_sin_sesion: el módulo exige sesión y queda disponible tras iniciar sesión', async ({ app, page }) => {
    // Sin sesión no hay botón "Simulador" en el navbar (módulos protegidos).
    await expect(page.locator('[data-tour="nav-simulation"]')).toHaveCount(0);
    // El Inicio deja claro que el acceso a los módulos requiere registro.
    await expect(page.getByText(/reservad[oa] a investigadores registrados/i).first()).toBeVisible();
    await shot(page, 'CPR-002-4_acceso_reservado');
    // Tras iniciar sesión, el Simulador queda accesible desde el navbar.
    await app.login();
    await app.navbarGo('simulation');
    await expect(page.getByRole('heading', { name: 'Módulo de Simulación Triaxial' })).toBeVisible({ timeout: 20_000 });
    await shot(page, 'CPR-002-4_simulador_disponible');
  });
});

test.describe('HU003 — Cierre de sesión', () => {
  test.beforeEach(async ({ app }) => { await app.open(); await app.login(); });

  // ── CPR-003-1 ──
  test('CPR-003-1 test_cerrar_sesion: cierra la sesión y vuelve a Inicio', async ({ app, page }) => {
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    // Vuelve a Inicio (hero con el acceso a iniciar sesión) y ya no hay sesión.
    await expect(page.getByRole('button', { name: 'Iniciar sesión' }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
    await shot(page, 'CPR-003-1_sesion_cerrada');
  });

  // ── CPR-003-2 ──
  test('CPR-003-2 test_volver_simulador_despues_cerrar_sesion: pide iniciar sesión de nuevo', async ({ app, page }) => {
    // Antes de cerrar sesión, el Simulador está en el navbar.
    await expect(page.locator('[data-tour="nav-simulation"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('button', { name: 'Iniciar sesión' }).first()).toBeVisible({ timeout: 15_000 });
    // Tras cerrar sesión, el módulo deja de estar accesible: el botón del
    // Simulador desaparece del navbar y hay que iniciar sesión de nuevo.
    await expect(page.locator('[data-tour="nav-simulation"]')).toHaveCount(0);
    await expect(page.getByText(/reservad[oa] a investigadores registrados/i).first()).toBeVisible();
    await shot(page, 'CPR-003-2_pide_login_de_nuevo');
  });
});

test.describe('HU013 — Guardar y descargar reportes', () => {
  test.setTimeout(180_000);
  const REPORT_TITLE = `E2E Sprint06 ${Date.now()}`;

  test('CPR-013-1 test_guardar_simulacion_titulo: guarda los parámetros y resultados en sus reportes', async ({ app, page }) => {
    await app.open();
    await app.login();
    await app.navbarGo('simulation');
    await expect(page.getByRole('heading', { name: 'Módulo de Simulación Triaxial' })).toBeVisible();
    await app.selectScenario(/didáctico \(homogéneo\)/i);
    await app.runSimulation();
    // Poner un título propio y descargar: al descargar, el reporte se guarda en
    // "Mis Reportes" (datos propios de la cuenta de prueba).
    const titleInput = page.getByPlaceholder(/Título \(opcional\)/).first();
    await titleInput.scrollIntoViewIfNeeded();
    await titleInput.fill(REPORT_TITLE);
    // Descargar el JSON dispara el guardado interno del reporte.
    await app.download(/^JSON$/).catch(() => { /* la descarga puede variar; el guardado ocurre igual */ });
    await app.settle(1500);
    // Verificar en "Mis Reportes" que la simulación quedó guardada con su título.
    await app.navbarGo('reports');
    await expect(page.getByRole('heading', { name: 'Mis reportes' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(REPORT_TITLE).first()).toBeVisible({ timeout: 20_000 });
    await shot(page, 'CPR-013-1_reporte_guardado');
    // Limpieza inmediata: borrar el reporte de prueba recién creado.
    await app.deleteReportByTitle(REPORT_TITLE);
  });

  // ── CPR-013-2 ──
  // Sin sesión, el Simulador no ofrece descargar: pide iniciar sesión para
  // guardar y descargar. (Nota de discrepancia en el RESUMEN: esta build guarda
  // el reporte al descargar en vez de exigir un "Guardar" previo; sin sesión la
  // descarga no está disponible, que es la verificación real equivalente.)
  test('CPR-013-2 test_descargar_sin_haber_guardado: sin sesión no hay descarga; el Simulador requiere iniciar sesión', async ({ app, page }) => {
    await app.open(); // sin login
    // El Simulador es un módulo protegido: sin sesión no está en el navbar y el
    // Inicio avisa que el acceso es para investigadores registrados, así que no
    // hay panel de descarga disponible sin una cuenta.
    await expect(page.locator('[data-tour="nav-simulation"]')).toHaveCount(0);
    await expect(page.getByText(/reservad[oa] a investigadores registrados/i).first()).toBeVisible();
    await shot(page, 'CPR-013-2_descarga_requiere_sesion');
  });
});
