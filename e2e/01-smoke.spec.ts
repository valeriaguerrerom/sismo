import { test, expect } from './support/fixtures';

/**
 * HUMO — carga cada página de la plataforma y verifica que se ve el contenido
 * principal. Las páginas públicas (Inicio, Acerca de, login/registro/recuperar)
 * no necesitan sesión; el resto (Simulador, Explorador, Mapa 3D, Educación,
 * Reportes) requieren iniciar sesión con la cuenta de prueba.
 *
 * Los guardias globales (consola/CSP/red/pantalla en blanco/Error Boundary) se
 * aplican a TODAS estas pruebas vía el fixture, así que "carga sin romperse" ya
 * está cubierto además de la aserción de contenido visible.
 */

test.describe('Humo — páginas públicas', () => {
  test('Inicio muestra el hero', async ({ app, page }) => {
    await app.open();
    await expect(
      page.getByRole('heading', { name: 'Simulador triaxial de pseudo-sismogramas' }),
    ).toBeVisible();
  });

  test('Acerca de muestra su encabezado', async ({ app, page }) => {
    await app.open();
    await page.getByRole('button', { name: 'Acerca de' }).first().click();
    await expect(
      page.getByRole('heading', { name: 'Nariño tiembla. Queríamos entender cómo.' }),
    ).toBeVisible();
  });

  test('Login, registro y recuperar contraseña se muestran', async ({ app, page }) => {
    await app.open();
    // Login (botón de la barra de navegación)
    await page.locator('nav').getByRole('button', { name: 'Iniciar sesión' }).first().click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByPlaceholder('correo@ejemplo.com')).toBeVisible();
    await expect(page.getByPlaceholder('Tu contraseña')).toBeVisible();

    // Recuperar contraseña (desde el login)
    await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
    await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar enlace' })).toBeVisible();

    // Volver al login desde recuperar contraseña.
    await page.getByRole('button', { name: 'Volver a iniciar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

    // Registro: el conmutador inferior ("¿No tienes cuenta? Registrarse") es un
    // botón cuyo nombre accesible es solo "Registrarse". Está dentro del
    // párrafo final; lo tomamos como el último "Registrarse" de la vista de login.
    await page.getByRole('button', { name: 'Registrarse', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Registrarse' })).toBeVisible();
    await expect(page.getByPlaceholder('Nombre y apellidos')).toBeVisible();
  });
});

test.describe('Humo — páginas con sesión', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.login();
  });

  test('Simulador muestra su encabezado y el estado inicial', async ({ app, page }) => {
    await app.navbarGo('simulation');
    await expect(
      page.getByRole('heading', { name: 'Módulo de Simulación Triaxial' }),
    ).toBeVisible();
  });

  test('Explorador muestra su encabezado', async ({ app, page }) => {
    await app.navbarGo('explorer');
    await expect(
      page.getByRole('heading', { name: 'Explorador de registros sísmicos' }),
    ).toBeVisible();
  });

  test('Mapa 3D muestra su encabezado', async ({ app, page }) => {
    await app.navbarGo('map3d');
    await expect(
      page.getByRole('heading', { name: 'Mapa 3D de propagación de ondas en Nariño' }),
    ).toBeVisible();
  });

  test('Educación muestra sus capítulos', async ({ app, page }) => {
    await app.navbarGo('education');
    await expect(
      page.getByRole('heading', { name: 'Centro de aprendizaje sísmico' }),
    ).toBeVisible();
    // Capítulos y secciones de consulta visibles en la navegación lateral.
    for (const chap of ['Ondas', 'Magnitud', 'Profundidad', 'Historia', 'Metodología']) {
      await expect(page.getByRole('button', { name: chap, exact: true }).first()).toBeVisible();
    }
    for (const sec of ['Glosario', 'Referencias', 'Quiz']) {
      await expect(page.getByRole('button', { name: sec, exact: true }).first()).toBeVisible();
    }
  });

  test('Educación — cada capítulo abre su contenido', async ({ app, page }) => {
    await app.navbarGo('education');
    await expect(page.getByRole('heading', { name: 'Centro de aprendizaje sísmico' })).toBeVisible();
    for (const chap of ['Ondas', 'Magnitud', 'Profundidad', 'Historia', 'Metodología', 'Glosario', 'Referencias', 'Quiz']) {
      await page.getByRole('button', { name: chap, exact: true }).first().click();
      await app.settle(150);
      // El contenido del capítulo pinta algo (no queda en blanco); el guard de
      // Error Boundary / pantalla en blanco cubre el resto.
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('Reportes muestra su encabezado', async ({ app, page }) => {
    await app.navbarGo('reports');
    await expect(page.getByRole('heading', { name: 'Mis reportes' })).toBeVisible();
  });

  test('Perfil del investigador se abre', async ({ page }) => {
    await page.locator('[data-tour="nav-perfil"]').first().click();
    await expect(page.locator('main')).toBeVisible();
  });
});
