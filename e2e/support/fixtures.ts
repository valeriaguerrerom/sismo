import { test as base, expect, type Page } from '@playwright/test';
import {
  installGuards,
  assertNoBlankOrErrorBoundary,
  summarizeViolations,
  type GuardController,
} from './guards';

export const ENV = (process.env.E2E_ENV || 'local') as 'local' | 'prod';
export const IS_PROD = ENV === 'prod';

export const USER_EMAIL = process.env.E2E_USER_EMAIL || '';
export const USER_PASSWORD = process.env.E2E_USER_PASSWORD || '';

/**
 * Fixtures de SismoNariño. Cada prueba recibe:
 *   - page: con los guardias de fallo ya instalados (consola/CSP/red/blank/EB).
 *   - guards: controlador para marcar fallos esperados (expectFailure).
 *   - app: helpers de alto nivel (abrir la app, consentimiento de cookies,
 *     navegar entre páginas, iniciar sesión).
 *
 * Al terminar la prueba, el fixture revisa que no haya violaciones ni pantalla
 * en blanco / Error Boundary; si las hay, la prueba falla con el detalle.
 */
type Fixtures = {
  guards: GuardController;
  app: AppHelpers;
};

export const test = base.extend<Fixtures>({
  guards: async ({ page }, use, testInfo) => {
    const controller = installGuards(page);
    await use(controller);

    // Chequeo final de pantalla en blanco / Error Boundary.
    const blank = await assertNoBlankOrErrorBoundary(page);
    if (blank) controller.violations.push({ kind: 'blank', detail: blank });

    if (controller.violations.length > 0) {
      const summary = summarizeViolations(controller.violations);
      // Adjuntar al reporte para que quede junto a la captura/video.
      await testInfo.attach('guard-violations.txt', {
        body: summary,
        contentType: 'text/plain',
      });
      expect(controller.violations, summary).toHaveLength(0);
    }
  },

  app: async ({ page }, use) => {
    await use(new AppHelpers(page));
  },
});

export { expect };

/** Página inicial de la SPA (es un SPA sin router: todo cuelga de '/'). */
export class AppHelpers {
  constructor(public readonly page: Page) {}

  /**
   * Abre la app. Por defecto suprime el banner de cookies poniendo el consentimiento
   * en 'denied' ANTES de cargar (así GA no se activa y el banner no estorba).
   * Para las pruebas de cookies, pasar { cookieConsent: 'ask' } y manejarlo a mano.
   */
  async open(opts: { cookieConsent?: 'denied' | 'granted' | 'ask' } = {}): Promise<void> {
    const consent = opts.cookieConsent ?? 'denied';
    await this.page.addInitScript((c) => {
      try {
        if (c !== 'ask') localStorage.setItem('sn-cookie-consent', c);
      } catch {
        /* storage no disponible: ignorar */
      }
    }, consent);
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await this.waitAppReady();
  }

  /** Espera a que la app resuelva la sesión (desaparece el loader) y pinte la UI. */
  async waitAppReady(): Promise<void> {
    // El Navbar aparece cuando AuthProvider resolvió la sesión. El H1 de Home
    // confirma que la primera página pintó.
    await expect(
      this.page.getByRole('heading', { level: 1 }).first(),
    ).toBeVisible({ timeout: 30_000 });
  }

  /** Navega a una página usando el Navbar (requiere sesión para las privadas). */
  async navbarGo(id: 'home' | 'simulation' | 'explorer' | 'map3d' | 'education' | 'about' | 'reports'): Promise<void> {
    const btn = this.page.locator(`[data-tour="nav-${id}"]`).first();
    await btn.click();
  }

  /** Abre la página de autenticación (login) desde Home estando sin sesión. */
  async gotoLogin(): Promise<void> {
    // El botón de la barra de navegación (hay otro igual en el formulario, por
    // eso tomamos el del navbar explícitamente).
    await this.page.locator('nav').getByRole('button', { name: 'Iniciar sesión' }).first().click();
    await expect(this.page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  }

  /** Botón de envío del formulario de autenticación (dentro de <main>). */
  authSubmit(name: 'Iniciar sesión' | 'Registrarse' | 'Enviar enlace') {
    return this.page.getByRole('main').getByRole('button', { name, exact: true });
  }

  /**
   * Inicia sesión con la cuenta de prueba a través de la UI real (la contraseña
   * se deriva en el cliente con PBKDF2; nunca viaja en texto plano).
   */
  async login(email = USER_EMAIL, password = USER_PASSWORD): Promise<void> {
    if (!email || !password) {
      throw new Error('Faltan E2E_USER_EMAIL / E2E_USER_PASSWORD en .env.e2e');
    }
    // Llegar al formulario de login.
    const loginHeading = this.page.getByRole('heading', { name: 'Iniciar sesión' });
    if (!(await loginHeading.isVisible().catch(() => false))) {
      await this.gotoLogin();
    }
    await this.page.getByPlaceholder('correo@ejemplo.com').fill(email);
    await this.page.getByPlaceholder('Tu contraseña').fill(password);
    await this.authSubmit('Iniciar sesión').click();
    // Tras el login, el Navbar muestra el botón de cerrar sesión.
    await expect(
      this.page.getByRole('button', { name: 'Cerrar sesión' }),
    ).toBeVisible({ timeout: 30_000 });
  }

  /** ¿Hay una sesión iniciada? (presencia del botón de cerrar sesión). */
  async isLoggedIn(): Promise<boolean> {
    return this.page.getByRole('button', { name: 'Cerrar sesión' }).isVisible().catch(() => false);
  }

  /** Espaciado suave entre acciones pesadas en prod (evita rate limit). */
  async settle(ms = IS_PROD ? 800 : 100): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  // ---------------------------------------------------------------------------
  // Helpers del Simulador
  // ---------------------------------------------------------------------------

  /** Abre una sección del acordeón de parámetros por su data-tour. */
  async openParamSection(anchor: 'params-elasticas' | 'params-fuente' | 'params-config'): Promise<void> {
    const section = this.page.locator(`[data-tour="${anchor}"]`).first();
    // Si el contenido no está visible, hacer click en el encabezado para abrir.
    const header = this.page.locator(`[data-tour="${anchor}-h"]`).first();
    if (await header.count()) {
      await header.click();
    } else {
      await section.click();
    }
    await this.page.waitForTimeout(200);
  }

  /** Selecciona un escenario predefinido por su nombre visible en el selector. */
  async selectScenario(nameRegex: RegExp): Promise<void> {
    await this.openParamSection('params-fuente');
    const select = this.page.locator('[data-tour="params-fuente"] select').first();
    await expect(select).toBeVisible();
    // Elegir la opción cuyo texto coincide.
    await select.selectOption({ label: await this.optionLabelMatching(select, nameRegex) });
    await this.page.waitForTimeout(200);
  }

  private async optionLabelMatching(select: ReturnType<Page['locator']>, re: RegExp): Promise<string> {
    const labels = await select.locator('option').allTextContents();
    const found = labels.find((l) => re.test(l));
    if (!found) throw new Error(`No hay escenario que coincida con ${re}. Opciones: ${labels.join(' | ')}`);
    return found;
  }

  /**
   * Fija un parámetro escribiendo en el input numérico asociado a la etiqueta
   * del SliderRow (p. ej. 'Velocidad de onda P (Vp)'). Abre la sección indicada.
   */
  async setParam(opts: {
    section: 'params-elasticas' | 'params-fuente' | 'params-config';
    labelRegex: RegExp;
    value: number;
  }): Promise<void> {
    await this.openParamSection(opts.section);
    // El SliderRow tiene un <span> con la etiqueta y, en el mismo bloque, un
    // input[type=number]. Localizamos el contenedor por el texto y bajamos al input.
    const row = this.page
      .locator('div.space-y-1')
      .filter({ has: this.page.getByText(opts.labelRegex) })
      .first();
    const num = row.locator('input[type="number"]').first();
    await num.scrollIntoViewIfNeeded();
    await num.fill(String(opts.value));
    await num.blur();
    await this.page.waitForTimeout(150);
  }

  /** Lanza la simulación y espera a que aparezcan los resultados (pestañas). */
  async runSimulation(): Promise<void> {
    const run = this.page.getByRole('button', { name: 'Generar pseudo-sismograma' });
    await run.scrollIntoViewIfNeeded();
    await run.click();
    // Al terminar, aparecen las pestañas de visualización (Sismogramas, etc.).
    await expect(this.page.locator('[data-tour="tab-2d"]')).toBeVisible({ timeout: 70_000 });
    // Y desaparece el estado vacío.
    await expect(
      this.page.getByRole('heading', { name: 'Aún no has generado un sismograma' }),
    ).toHaveCount(0);
  }

  /** Cambia a una pestaña de visualización del Simulador. */
  async showVizTab(tab: 'tab-2d' | 'tab-triaxial' | 'tab-particle'): Promise<void> {
    await this.page.locator(`[data-tour="${tab}"]`).first().click();
    await this.page.waitForTimeout(300);
  }

  /** Dispara una descarga desde un botón y devuelve el nombre de archivo. */
  async download(buttonName: string | RegExp): Promise<string> {
    const [dl] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 30_000 }),
      this.page.getByRole('button', { name: buttonName }).first().click(),
    ]);
    return dl.suggestedFilename();
  }
}
