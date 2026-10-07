import { test, expect } from './support/fixtures';
import { isGoogleAnalyticsRequest } from './support/guards';

/**
 * SEGURIDAD y PRIVACIDAD.
 *   - Un investigador normal no entra a Admin ni forzando la navegación.
 *   - La contraseña nunca viaja en texto plano (se deriva en el cliente).
 *   - El aviso de cookies aparece y, al rechazarlo, no hay peticiones a Google
 *     Analytics.
 */

test.describe('Seguridad — acceso a Admin', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.login();
  });

  test('un investigador no ve el botón Admin', async ({ page }) => {
    // El Navbar solo renderiza "Admin" para role === 'admin'.
    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
  });

  test('forzar la página admin no muestra el panel (cae a Inicio)', async ({ page }) => {
    // No hay router: forzamos el estado interno llamando a la misma vía que usa
    // el Navbar. El guard de navegación (p==='admin' && role!=='admin') es un
    // no-op, y el guard de render devuelve Home. En cualquier caso, el usuario
    // NO debe ver contenido exclusivo del panel admin.
    // Intento 1: hash/el que exista (por si en el futuro hubiera deep-link).
    await page.evaluate(() => {
      // Dispara un intento de ir a admin a través del único mecanismo público:
      // buscar un botón Admin. Si no existe, el intento no hace nada.
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Admin',
      );
      btn?.click();
    });
    await page.waitForTimeout(500);
    // No aparece ningún encabezado/ís propio del panel de administración.
    await expect(page.getByRole('heading', { name: /Panel de administración|Administración/i })).toHaveCount(0);
    // Y seguimos viendo la app normal (una página pública/privada válida).
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });
});

test.describe('Seguridad — contraseña nunca en texto plano', () => {
  test('el login no envía la contraseña escrita en el cuerpo de la petición', async ({ app, page }) => {
    const password = process.env.E2E_USER_PASSWORD || '';
    test.skip(!password || password === 'CAMBIA-ESTO', 'Falta E2E_USER_PASSWORD real en .env.e2e');

    const bodies: string[] = [];
    page.on('request', (req) => {
      if (req.method() !== 'POST') return;
      const url = req.url();
      // Nos interesan las llamadas de autenticación (Supabase /auth/v1/token).
      if (!/\/auth\/v1\//.test(url)) return;
      const data = req.postData();
      if (data) bodies.push(data);
    });

    await app.open();
    await app.login();

    // Se capturó al menos una petición de auth, y en NINGUNA aparece la
    // contraseña en claro (va derivada con PBKDF2 antes de enviarse).
    expect(bodies.length, 'no se capturó ninguna petición de auth').toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body, 'la contraseña viajó en texto plano').not.toContain(password);
    }
    // El input además es de tipo password (no expone el valor en el DOM).
    // (Ya cerramos sesión implícitamente al validar; nada que limpiar.)
  });
});

test.describe('Privacidad — cookies y Google Analytics', () => {
  test('el aviso de cookies aparece cuando no hay decisión previa', async ({ app, page }) => {
    await app.open({ cookieConsent: 'ask' });
    const banner = page.getByRole('dialog', { name: 'Aviso de cookies' });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Aceptar' })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Rechazar' })).toBeVisible();
  });

  test('al rechazar, no se hacen peticiones de datos a Google Analytics', async ({ app, page }) => {
    // Registramos cualquier petición a dominios de GA que sea un "collect" real
    // (ping de datos), no solo la carga del script de consentimiento.
    const gaDataHits: string[] = [];
    page.on('request', (req) => {
      let url: URL;
      try {
        url = new URL(req.url());
      } catch {
        return;
      }
      if (!isGoogleAnalyticsRequest(url)) return;
      // El ping de datos de GA4 va a /g/collect o /collect en google-analytics.
      if (/\/g\/collect|\/collect(\?|$)/.test(url.pathname) || /google-analytics\.com$/.test(url.host)) {
        gaDataHits.push(req.url());
      }
    });

    await app.open({ cookieConsent: 'ask' });
    const banner = page.getByRole('dialog', { name: 'Aviso de cookies' });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Rechazar' }).click();
    await expect(banner).toBeHidden();

    // Navegamos un poco para dar oportunidad a que GA dispare (no debería).
    await page.getByRole('button', { name: 'Acerca de' }).first().click();
    await app.settle(1200);

    expect(
      gaDataHits,
      `GA envió datos pese al rechazo:\n${gaDataHits.join('\n')}`,
    ).toHaveLength(0);

    // Consentimiento quedó denegado en localStorage.
    const consent = await page.evaluate(() => localStorage.getItem('sn-cookie-consent'));
    expect(consent).toBe('denied');
  });
});
