import { test, expect } from '@playwright/test';

/**
 * Documentación pública /docs — prueba de humo (NO es un caso CPR; no cuenta en
 * los totales de los sprints). Verifica que la documentación estática carga y
 * que cada sección muestra su contenido principal:
 *   - /docs           portada con enlaces a las tres secciones
 *   - /docs/backend   MkDocs + Material (API y motor de simulación)
 *   - /docs/frontend  TypeDoc (componentes, hooks y tipos)
 *   - /docs/api       Redoc (referencia OpenAPI de solo lectura)
 *
 * Entorno: se corre contra el LOCAL (Nginx / build servido en :8080). En
 * PRODUCCIÓN se OMITE con un mensaje claro, porque /docs aún no está desplegado
 * allí; cuando se despliegue, basta quitar el skip o correrla en local.
 */

// La documentación /docs ya está desplegada; esta prueba se corre tanto en
// local (Nginx) como en producción. Si en algún momento se quisiera volver a
// omitir en producción (p. ej. en un entorno donde /docs no esté publicado),
// basta con poner E2E_DOCS_SKIP_PROD=1.
const ENV = (process.env.E2E_ENV || 'local') as 'local' | 'prod';
const IS_PROD = ENV === 'prod';
const SKIP_PROD = IS_PROD && process.env.E2E_DOCS_SKIP_PROD === '1';

test.describe('Documentación pública /docs (smoke, no-CPR)', () => {
  test.skip(
    SKIP_PROD,
    'Omitida en producción por E2E_DOCS_SKIP_PROD=1 (la documentación /docs no ' +
      'está publicada en este entorno).',
  );

  test('/docs — portada con las tres secciones', async ({ page }) => {
    const resp = await page.goto('/docs/', { waitUntil: 'domcontentloaded' });
    expect(resp?.status(), 'GET /docs/ debe responder 2xx').toBeLessThan(400);
    await expect(page).toHaveTitle(/Documentación técnica/i);
    await expect(
      page.getByRole('heading', { name: /Documentación técnica de SismoNariño/i }),
    ).toBeVisible();
    // Enlaces a las tres secciones (por destino, para evitar ambigüedad con el
    // texto descriptivo de cada tarjeta).
    await expect(page.locator('a[href="backend/"]')).toBeVisible();
    await expect(page.locator('a[href="frontend/"]')).toBeVisible();
    await expect(page.locator('a[href="api/"]')).toBeVisible();
  });

  test('/docs/ redirige desde /docs sin barra final', async ({ page }) => {
    // Nginx responde 301 a /docs/ ; Playwright sigue el redirect y la URL final
    // debe terminar en /docs/.
    await page.goto('/docs', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/docs\/$/);
  });

  test('/docs/backend — MkDocs (motor y API del backend)', async ({ page }) => {
    const resp = await page.goto('/docs/backend/', { waitUntil: 'domcontentloaded' });
    expect(resp?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/Documentación del backend/i);
    // Contenido principal: encabezado de la página de inicio del backend.
    await expect(
      page.getByRole('heading', { name: /Documentación del backend/i }).first(),
    ).toBeVisible();
    // Navegación de MkDocs/Material con las secciones.
    await expect(page.getByRole('link', { name: /Arquitectura/i }).first()).toBeVisible();
  });

  test('/docs/frontend — TypeDoc (componentes, hooks y tipos)', async ({ page }) => {
    const resp = await page.goto('/docs/frontend/', { waitUntil: 'domcontentloaded' });
    expect(resp?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/SismoNariño\s*[—-]\s*Frontend/i);
    // Contenido principal de TypeDoc: la barra de título del proyecto y el índice
    // de módulos.
    await expect(page.getByText(/SismoNariño/).first()).toBeVisible();
    await expect(page.locator('.tsd-page-title, .col-content, .tsd-navigation').first()).toBeVisible();
  });

  test('/docs/api — Redoc (referencia OpenAPI de solo lectura)', async ({ page }) => {
    const resp = await page.goto('/docs/api/', { waitUntil: 'domcontentloaded' });
    expect(resp?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/Referencia de la API/i);
    // Redoc renderiza el esquema de forma asíncrona; el título de la API
    // (info.title del OpenAPI) aparece cuando termina de montar.
    await expect(page.getByRole('heading', { name: /SismoNariño API/i }).first()).toBeVisible({
      timeout: 30_000,
    });
    // El esquema estático debe servirse en local (mismo origen).
    const schema = await page.goto('/docs/api/openapi.json', { waitUntil: 'domcontentloaded' });
    expect(schema?.status(), 'openapi.json debe servirse como estático').toBeLessThan(400);
  });
});
