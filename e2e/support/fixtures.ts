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
 * Salta una prueba que depende de WebGL (Mapa 3D con Three.js) o del hodograma
 * de partícula por canvas cuando se corre en FIREFOX dentro de CI (los runners
 * de GitHub no tienen GPU y Firefox no logra crear un contexto WebGL, así que el
 * Mapa 3D cae en su Error Boundary). NO es un fallo de la app: en un Firefox
 * real (con GPU) estas pruebas pasan, y en Chromium/WebKit/móvil pasan incluso
 * en CI. Fuera de CI (ejecución local) la prueba se corre normalmente.
 */
export function skipIfHeadlessFirefoxWebGL(testInfo: {
  project: { name: string };
  skip: (condition: boolean, description: string) => void;
}): void {
  const isFirefox = testInfo.project.name === 'firefox';
  const inCI = !!process.env.CI;
  testInfo.skip(
    isFirefox && inCI,
    'WebGL no disponible en Firefox dentro de CI (runner sin GPU); verificado OK en Firefox real.',
  );
}

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
    await this.gotoWithRetry('/');
    await this.waitAppReady();
  }

  /**
   * goto con reintentos ante fallos de DNS en frío. En esta red, la primera
   * resolución de sismonarino.com a veces falla (ERR_NAME_NOT_RESOLVED / "Could
   * not resolve hostname"), y WebKit en Windows no se recupera dentro del mismo
   * intento. Reintentar el goto hace que el parpadeo de DNS se cure solo.
   */
  async gotoWithRetry(url: string, tries = 4): Promise<void> {
    let lastErr: unknown;
    for (let i = 0; i < tries; i++) {
      try {
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        return;
      } catch (err) {
        lastErr = err;
        const msg = (err as Error).message || '';
        if (!/resolve|ERR_NAME_NOT_RESOLVED|NS_ERROR|network|timeout/i.test(msg)) throw err;
        await this.page.waitForTimeout(1500);
      }
    }
    throw lastErr;
  }

  /** Espera a que la app resuelva la sesión (desaparece el loader) y pinte la UI. */
  async waitAppReady(): Promise<void> {
    // El Navbar aparece cuando AuthProvider resolvió la sesión. El H1 de Home
    // confirma que la primera página pintó.
    await expect(
      this.page.getByRole('heading', { level: 1 }).first(),
    ).toBeVisible({ timeout: 30_000 });
  }

  /** ¿Estamos en viewport móvil? (el Navbar colapsa el menú tras < md = 768px). */
  isMobileViewport(): boolean {
    const vp = this.page.viewportSize();
    return !!vp && vp.width < 768;
  }

  /** Etiqueta visible de cada página en el menú (para el menú móvil, sin data-tour). */
  private static NAV_LABEL: Record<string, string> = {
    home: 'Inicio',
    simulation: 'Simulador',
    explorer: 'Explorador',
    map3d: 'Mapa 3D',
    education: 'Educación',
    about: 'Acerca de',
    reports: 'Reportes',
  };

  /**
   * Navega a una página usando el Navbar. En escritorio usa el botón con
   * data-tour; en móvil abre la hamburguesa y usa el ítem por su etiqueta
   * (el menú móvil no lleva data-tour).
   */
  async navbarGo(id: 'home' | 'simulation' | 'explorer' | 'map3d' | 'education' | 'about' | 'reports'): Promise<void> {
    if (this.isMobileViewport()) {
      await this.openMobileMenu();
      const label = AppHelpers.NAV_LABEL[id];
      // Dentro del menú desplegable móvil (md:hidden), el ítem por su texto.
      const menu = this.page.locator('nav div.md\\:hidden').last();
      await menu.getByRole('button', { name: new RegExp(`^\\s*${label}\\s*$`) }).first().click();
      return;
    }
    await this.page.locator(`[data-tour="nav-${id}"]`).first().click();
  }

  /** Abre el menú hamburguesa en móvil (idempotente). */
  async openMobileMenu(): Promise<void> {
    const burger = this.page.getByRole('button', { name: 'Abrir menú' });
    if (await burger.isVisible().catch(() => false)) {
      await burger.click();
      await this.page.waitForTimeout(200);
    }
  }

  /** Abre la página de autenticación (login) desde Home estando sin sesión. */
  async gotoLogin(): Promise<void> {
    if (this.isMobileViewport()) {
      // En móvil el botón del navbar está tras la hamburguesa. También está en
      // el hero de Inicio; usamos el del menú para no depender del hero.
      await this.openMobileMenu();
      await this.page.locator('nav div.md\\:hidden').last()
        .getByRole('button', { name: 'Iniciar sesión' }).first().click();
    } else {
      // El botón del navbar (hay otro igual en el formulario; tomamos el del nav).
      await this.page.locator('nav').getByRole('button', { name: 'Iniciar sesión' }).first().click();
    }
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
    // Señal de éxito válida en escritorio y móvil: el formulario de login
    // desaparece (ya no está el encabezado "Iniciar sesión" en <main>).
    await expect(
      this.page.getByRole('main').getByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeHidden({ timeout: 30_000 });
    // Y el navbar ya refleja la sesión: en escritorio "Cerrar sesión" visible;
    // en móvil, la hamburguesa (el menú de sesión vive detrás).
    if (this.isMobileViewport()) {
      await expect(this.page.getByRole('button', { name: /Abrir menú|Cerrar menú/ })).toBeVisible({ timeout: 15_000 });
    } else {
      await expect(this.page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible({ timeout: 15_000 });
    }
  }

  /**
   * ¿Hay una sesión iniciada? Señal agnóstica al viewport:
   *  - Escritorio: el botón "Cerrar sesión" del navbar está visible.
   *  - Móvil: el menú está colapsado; "Cerrar sesión" no está en el DOM hasta
   *    abrir la hamburguesa. En su lugar comprobamos que el navbar YA NO ofrece
   *    "Iniciar sesión" (presente solo sin sesión), estando la hamburguesa.
   */
  async isLoggedIn(): Promise<boolean> {
    if (this.isMobileViewport()) {
      const burger = this.page.getByRole('button', { name: /Abrir menú|Cerrar menú/ });
      if (!(await burger.count())) return false;
      // Sin sesión, el navbar móvil muestra "Iniciar sesión" en el hero/menú;
      // comprobamos directamente dentro del menú.
      await this.openMobileMenu();
      const menu = this.page.locator('nav div.md\\:hidden').last();
      const signedIn = (await menu.getByRole('button', { name: 'Cerrar sesión' }).count()) > 0;
      // Cerrar el menú para no dejar la UI abierta.
      const close = this.page.getByRole('button', { name: 'Cerrar menú' });
      if (await close.isVisible().catch(() => false)) await close.click();
      return signedIn;
    }
    return this.page.getByRole('button', { name: 'Cerrar sesión' }).isVisible().catch(() => false);
  }

  /** Espaciado suave entre acciones pesadas en prod (evita rate limit). */
  async settle(ms = IS_PROD ? 800 : 100): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  // ---------------------------------------------------------------------------
  // Helpers del Simulador
  // ---------------------------------------------------------------------------

  /**
   * Abre una sección del acordeón de parámetros por su data-tour. El acordeón es
   * exclusivo y controlado: el encabezado lleva aria-expanded. Solo hacemos
   * click si está cerrada (así no cerramos "Variables elásticas", abierta por
   * defecto).
   */
  async openParamSection(anchor: 'params-elasticas' | 'params-fuente' | 'params-config'): Promise<void> {
    const header = this.page.locator(`[data-tour="${anchor}-h"]`).first();
    const target = (await header.count()) ? header : this.page.locator(`[data-tour="${anchor}"] button`).first();
    const expanded = await target.getAttribute('aria-expanded');
    if (expanded !== 'true') {
      await target.click();
      await this.page.waitForTimeout(250);
    }
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

  /** Texto del aviso que muestra la app cuando falla la conexión con el backend. */
  private connError() {
    return this.page.getByText(/No se pudo conectar con el servidor|Demasiadas solicitudes|servidor tardó/i);
  }

  /**
   * Lanza la simulación y espera a que REALMENTE haya resultados. Si el backend
   * no responde (la app muestra "No se pudo conectar con el servidor" — pasa en
   * esta red con DNS/conexión intermitente), reintenta pulsar "Generar" en vez
   * de agotar el timeout. Así una caída transitoria del backend no tumba la
   * prueba.
   */
  async runSimulation(): Promise<void> {
    const run = this.page.getByRole('button', { name: 'Generar pseudo-sismograma' });
    // Señal de resultado real: desaparece el estado inicial y aparece CSV/Malla.
    const emptyState = this.page.getByRole('heading', { name: /Empieza tu simulación|Aún no has generado un sismograma/ });
    const resultSignal = this.page.getByRole('button', { name: 'CSV' })
      .or(this.page.getByRole('button', { name: /Malla FDM/ })).first();

    for (let attempt = 1; attempt <= 4; attempt++) {
      await run.scrollIntoViewIfNeeded();
      await run.click();
      // Esperamos a que ocurra UNA de tres cosas: resultado, aviso de conexión,
      // o que simplemente desaparezca el estado vacío.
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        if (await resultSignal.isVisible().catch(() => false)) return;
        if (await this.connError().first().isVisible().catch(() => false)) break; // reintentar
        if ((await emptyState.count()) === 0 && (await resultSignal.isVisible().catch(() => false))) return;
        await this.page.waitForTimeout(1000);
      }
      // Si llegamos aquí por aviso de conexión, esperamos un poco y reintentamos.
      await this.page.waitForTimeout(2000);
    }
    // Último intento con aserción dura para que el fallo sea claro si persiste.
    await expect(resultSignal).toBeVisible({ timeout: 60_000 });
  }

  /** Cambia a una pestaña de visualización del Simulador. */
  async showVizTab(tab: 'tab-2d' | 'tab-triaxial' | 'tab-particle'): Promise<void> {
    await this.page.locator(`[data-tour="${tab}"]`).first().click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Muestra los paneles de control del Mapa 3D si están ocultos (en móvil
   * arrancan colapsados). Idempotente.
   */
  async revealMap3dPanels(): Promise<void> {
    const show = this.page.getByRole('button', { name: 'Mostrar paneles' });
    if (await show.isVisible().catch(() => false)) {
      await show.click();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * En el Mapa 3D: abre la lista de eventos y carga el primero. La escena se
   * genera y arranca sola; esperamos a que el botón de transporte quede
   * habilitado.
   */
  async map3dLoadFirstEvent(): Promise<void> {
    // En móvil, el Mapa 3D arranca con los paneles de control OCULTOS (la escena
    // ocupa todo el ancho). Hay que pulsar "Mostrar paneles" para ver los
    // controles (Cargar evento, modelo, Recalcular).
    await this.revealMap3dPanels();
    // Preferir el botón del panel de controles "Cargar evento (N)" (siempre
    // abre el modal); si no, el "Cargar un evento" del panel vacío. En móvil hay
    // que desplazarlo a la vista antes de pulsarlo.
    const withCount = this.page.getByRole('button', { name: /Cargar evento\s*\(\d+\)/i }).first();
    const open = (await withCount.count())
      ? withCount
      : this.page.getByRole('button', { name: /Cargar\s+un\s+evento/i }).first();
    await expect(open).toBeVisible({ timeout: 30_000 });
    await open.scrollIntoViewIfNeeded();
    await open.click();
    // Modal de eventos: título "Eventos (...)". Las FILAS de evento viven en la
    // lista con scroll (div.overflow-y-auto.divide-y); los otros botones del
    // modal son filtros/paginación, no eventos.
    const modal = this.page.locator('div.fixed').filter({ hasText: /Eventos\s*\(/ }).first();
    await expect(modal).toBeVisible({ timeout: 15_000 });
    const list = modal.locator('div.overflow-y-auto.divide-y').first();
    await expect(list).toBeVisible({ timeout: 10_000 });
    const firstRow = list.locator('> button:not([disabled])').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.click();
    // Al elegir un evento SIEMPRE aparece una confirmación ("Cargar el nuevo" /
    // "Seguir con el actual"). Hay que confirmar para que arranque la generación.
    const confirm = this.page.getByRole('button', { name: 'Cargar el nuevo' });
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await confirm.click();
    // Empieza a generar (tiempos de viaje + un sintético por estación). Esperamos
    // a que el transporte quede habilitado; la generación de varias estaciones
    // puede tardar, por eso el margen amplio.
    await expect(
      this.page.getByRole('button', { name: /Reproducir|Pausar/ }).first(),
    ).toBeEnabled({ timeout: 120_000 });
  }

  /**
   * Borra desde la UI el reporte con el título dado (limpieza). Tolerante: si no
   * aparece, no falla (p. ej. si la descarga no llegó a guardar). Se usa en el
   * finally de la prueba de descargas para no dejar datos basura.
   */
  async deleteReportByTitle(title: string): Promise<void> {
    try {
      await this.navbarGo('reports');
      await expect(this.page.getByRole('heading', { name: 'Mis reportes' })).toBeVisible({ timeout: 15_000 });
      const item = this.page.getByText(title).first();
      if (!(await item.isVisible().catch(() => false))) return;
      const row = this.page.locator('div', { hasText: title })
        .filter({ has: this.page.getByRole('button', { name: 'Eliminar' }) }).first();
      await row.getByRole('button', { name: 'Eliminar' }).first().click();
      await expect(this.page.getByRole('heading', { name: 'Eliminar reporte' })).toBeVisible({ timeout: 10_000 });
      await this.page.getByRole('button', { name: 'Eliminar definitivamente' }).click();
      await expect(this.page.getByText(title)).toHaveCount(0, { timeout: 20_000 });
    } catch {
      // No romper el teardown por un fallo de limpieza; el script de limpieza
      // por API (scripts) es la red de seguridad.
    }
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
