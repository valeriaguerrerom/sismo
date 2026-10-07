import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, IS_PROD } from './support/fixtures';

/**
 * LOS OCHO ESCENARIOS DEL INSTRUMENTO DE SOFTWARE, paso a paso.
 *   S1. Registro e inicio de sesión.
 *   S2. Simulación con parámetros propios.
 *   S3. Guardar y descargar CSV, (PNG→)JSON y PDF.
 *   S4. Explorador: sismos tectónicos, volcánicos y cargar al Simulador.
 *   S5. MiniSEED con el archivo de ejemplo.
 *   S6. Mapa 3D: cargar evento, reproducir, cambiar de modelo y Recalcular.
 *   S7. Datos inválidos (manejo de error, sin romper la app).
 *   S8. Vista de celular (se corre con el proyecto 'mobile').
 *
 * Nota sobre S3: el Simulador exporta CSV, JSON y PDF (no hay export PNG
 * independiente; las imágenes se incrustan dentro del PDF). Se prueban los tres
 * botones reales.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_MSEED = path.resolve(__dirname, '../backend/example_data/ejemplo_CUFP_volcanico.mseed');

// ---------------------------------------------------------------------------
// S1 — Registro e inicio de sesión
// ---------------------------------------------------------------------------
test.describe('S1 — Registro e inicio de sesión', () => {
  test('el formulario de registro valida y el login con la cuenta de prueba funciona', async ({ app, page }) => {
    await app.open();

    // Parte A: el formulario de REGISTRO responde a la validación (sin crear
    // una cuenta real: no pulsamos el envío final). Esto evita datos basura.
    await page.locator('nav').getByRole('button', { name: 'Registrarse' }).first().click();
    await expect(page.getByRole('heading', { name: 'Registrarse' })).toBeVisible();
    const submit = app.authSubmit('Registrarse');
    // Deshabilitado hasta completar nombre/correo/contraseña fuerte/consentimiento.
    await expect(submit).toBeDisabled();
    await page.getByPlaceholder('Nombre y apellidos').fill('Investigador de Prueba');
    await page.getByPlaceholder('correo@ejemplo.com').fill('nuevo+e2e@ejemplo.com');
    await page.getByPlaceholder('Crea una contraseña segura').fill('Abcdefg1!2026');
    // Sigue deshabilitado hasta aceptar el consentimiento.
    await expect(submit).toBeDisabled();

    // Parte B: iniciar sesión con la cuenta de prueba real. El conmutador
    // inferior en modo registro es un botón "Iniciar sesión".
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await app.login();
    expect(await app.isLoggedIn()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S2 — Simulación con parámetros propios
// ---------------------------------------------------------------------------
test.describe('S2 — Simulación con parámetros propios', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.login();
  });

  test('ajustar parámetros propios y generar el pseudo-sismograma', async ({ app, page }) => {
    await app.navbarGo('simulation');
    await expect(page.getByRole('heading', { name: 'Módulo de Simulación Triaxial' })).toBeVisible();

    // Parámetros propios: cambiar Vp, Vs y magnitud a valores elegidos.
    await app.setParam({ section: 'params-elasticas', labelRegex: /Velocidad de onda P \(Vp\)/, value: 4200 });
    await app.setParam({ section: 'params-elasticas', labelRegex: /Velocidad de onda S \(Vs\)/, value: 2400 });
    await app.setParam({ section: 'params-fuente', labelRegex: /Magnitud/, value: 5 });

    await app.runSimulation();

    // Resultados visibles: pestaña de sismogramas activa y métricas presentes.
    await app.showVizTab('tab-2d');
    await expect(page.locator('[data-tour="viz-area"], [data-viz-area]').first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// S3 — Guardar y descargar CSV, JSON y PDF
// ---------------------------------------------------------------------------
test.describe('S3 — Guardar y descargar (CSV, JSON, PDF)', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.login();
  });

  test('descarga CSV, JSON y PDF (y queda guardado en Mis Reportes)', async ({ app, page }) => {
    await app.navbarGo('simulation');
    await app.selectScenario(/didáctico \(homogéneo\)/i);
    await app.runSimulation();

    // Título identificable para poder limpiarlo luego.
    const stamp = Date.now();
    const title = `E2E S3 ${stamp}`;
    await page.getByPlaceholder(/Título \(opcional\)/).fill(title);

    // CSV
    const csv = await app.download('CSV');
    expect(csv).toMatch(/\.csv$/i);
    await app.settle();

    // JSON
    const json = await app.download('JSON');
    expect(json).toMatch(/\.json$/i);
    await app.settle();

    // PDF: abre el diálogo de contenido y confirma "Generar PDF".
    await page.getByRole('button', { name: 'PDF' }).click();
    await expect(page.getByRole('heading', { name: 'Contenido del PDF' })).toBeVisible();
    const [pdf] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: 'Generar PDF' }).click(),
    ]);
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/i);

    // Quedó guardado en Mis Reportes (se guarda al descargar).
    await app.navbarGo('reports');
    await expect(page.getByRole('heading', { name: 'Mis reportes' })).toBeVisible();
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 });

    // Limpieza: borrar el reporte creado (no dejar datos basura).
    const row = page.locator('div', { hasText: title }).filter({ has: page.getByRole('button', { name: 'Eliminar' }) }).first();
    await row.getByRole('button', { name: 'Eliminar' }).first().click();
    await expect(page.getByRole('heading', { name: 'Eliminar reporte' })).toBeVisible();
    await page.getByRole('button', { name: 'Eliminar definitivamente' }).click();
    await expect(page.getByText(title)).toHaveCount(0, { timeout: 20_000 });
  });
});

// ---------------------------------------------------------------------------
// S4 — Explorador: tectónicos, volcánicos y cargar al Simulador
// ---------------------------------------------------------------------------
test.describe('S4 — Explorador', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.login();
  });

  test('ver tectónicos y volcánicos, y cargar un registro al Simulador', async ({ app, page }) => {
    await app.navbarGo('explorer');
    await expect(page.getByRole('heading', { name: 'Explorador de registros sísmicos' })).toBeVisible();

    // Fuente tectónica.
    await page.locator('[data-tour="exp-fuente-tectonic"]').click();
    await app.settle(400);
    // Fuente volcánica.
    await page.locator('[data-tour="exp-fuente-volcanic"]').click();
    await app.settle(400);

    // Volvemos a volcánica para tener un registro Galeras con forma de onda.
    await page.locator('[data-tour="exp-fuente-volcanic"]').click();
    await app.settle(400);

    // Abrir el primer evento de la lista (la fila es un botón "Ver sismograma").
    const firstRow = page.locator('[data-tour="exp-lista"] button').first();
    await expect(firstRow).toBeVisible({ timeout: 20_000 });
    await firstRow.click();
    await app.settle(500);

    // Al expandirse y cargar la onda, aparece "Cargar en Simulador".
    const loadBtn = page.getByRole('button', { name: 'Cargar en Simulador' }).first();
    await expect(loadBtn).toBeVisible({ timeout: 30_000 });
    await loadBtn.click();

    // Debe llevarnos al Simulador con el registro real cargado.
    await expect(page.getByRole('heading', { name: 'Módulo de Simulación Triaxial' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Datos [Rr]eales/).first()).toBeVisible({ timeout: 30_000 });
  });
});

// ---------------------------------------------------------------------------
// S5 — MiniSEED con el archivo de ejemplo
// ---------------------------------------------------------------------------
test.describe('S5 — MiniSEED (archivo de ejemplo)', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.login();
  });

  test('cargar y procesar el .mseed de ejemplo y enviarlo al Simulador', async ({ app, page }) => {
    await app.navbarGo('explorer');
    await page.locator('[data-tour="exp-fuente-upload"]').click();
    await app.settle(300);

    // Subir el archivo de ejemplo.
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(SAMPLE_MSEED);

    // Tras procesar, aparece la vista previa y el botón de cargar al simulador.
    const loadBtn = page.getByRole('button', { name: 'Cargar en Simulador' });
    await expect(loadBtn).toBeVisible({ timeout: 60_000 });
    await loadBtn.click();

    await expect(page.getByRole('heading', { name: 'Módulo de Simulación Triaxial' })).toBeVisible({ timeout: 30_000 });
  });
});

// ---------------------------------------------------------------------------
// S6 — Mapa 3D: cargar evento, reproducir, cambiar de modelo y Recalcular
// ---------------------------------------------------------------------------
test.describe('S6 — Mapa 3D', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.login();
  });

  test('cargar evento, reproducir, cambiar a IASP91 y recalcular', async ({ app, page }) => {
    test.setTimeout(200_000); // la generación 3D (varias estaciones) tarda
    await app.navbarGo('map3d');
    await expect(page.getByRole('heading', { name: 'Mapa 3D de propagación de ondas en Nariño' })).toBeVisible();
    await app.map3dLoadFirstEvent();

    // Al cargar un evento, la escena se genera y arranca sola: el botón de
    // transporte queda habilitado (Reproducir/Pausar). Lo pausamos si va.
    const transport = page.getByRole('button', { name: /Reproducir|Pausar/ }).first();
    await expect(transport).toBeEnabled({ timeout: 60_000 });
    // Alternar una vez (pausa o reproduce, según su estado actual).
    await transport.click();
    await app.settle(600);

    // Cambiar de modelo a IASP91 y recalcular.
    await page.getByRole('button', { name: 'IASP91' }).first().click();
    await app.settle(300);
    await page.getByRole('button', { name: 'Recalcular con estos valores' }).click();
    // Tras recalcular, el transporte vuelve a quedar disponible.
    await expect(page.getByRole('button', { name: /Reproducir|Pausar/ }).first()).toBeEnabled({ timeout: 60_000 });
  });
});

// ---------------------------------------------------------------------------
// S7 — Datos inválidos
// ---------------------------------------------------------------------------
test.describe('S7 — Datos inválidos', () => {
  test('login con credenciales incorrectas muestra error, sin romper la app', async ({ app, page, guards }) => {
    await app.open();
    await app.gotoLogin();

    // Este 400 de Supabase /auth es provocado a propósito: lo marcamos esperado.
    const stop = guards.expectFailure(/\/auth\/v1\/|400|Invalid login|invalid_grant/i);

    await page.getByPlaceholder('correo@ejemplo.com').fill('no-existe+e2e@ejemplo.com');
    await page.getByPlaceholder('Tu contraseña').fill('contraseña-incorrecta-123');
    await app.authSubmit('Iniciar sesión').click();

    // Mensaje de error amable (role=alert) y seguimos en el login.
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    stop();
  });

  test('un parámetro fuera de rango se autoajusta y la simulación sigue válida', async ({ app, page }) => {
    await app.open();
    await app.login();
    await app.navbarGo('simulation');

    // Vp absurdamente alto: la app lo recorta al rango válido (no rompe).
    await app.setParam({ section: 'params-elasticas', labelRegex: /Velocidad de onda P \(Vp\)/, value: 999999 });
    // El input numérico queda dentro del máximo permitido (<= 8000).
    const row = page.locator('div.space-y-1').filter({ has: page.getByText(/Velocidad de onda P \(Vp\)/) }).first();
    const val = await row.locator('input[type="number"]').first().inputValue();
    expect(Number(val)).toBeLessThanOrEqual(8000);

    // Y aún se puede generar sin error.
    await app.runSimulation();
  });
});

// ---------------------------------------------------------------------------
// S8 — Vista de celular (solo en el proyecto 'mobile')
// ---------------------------------------------------------------------------
test.describe('S8 — Vista de celular', () => {
  test('la navegación móvil (hamburguesa) permite entrar al Simulador', async ({ app, page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Escenario de vista móvil: solo en el proyecto mobile.');

    await app.open();
    await app.login();

    // En móvil el menú está tras la hamburguesa.
    const burger = page.getByRole('button', { name: /Abrir menú/ });
    await expect(burger).toBeVisible();
    await burger.click();
    await page.locator('[data-tour="nav-simulation"]').first().click();
    await expect(page.getByRole('heading', { name: 'Módulo de Simulación Triaxial' })).toBeVisible();
  });
});
