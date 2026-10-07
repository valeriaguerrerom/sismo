import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Credenciales y configuración de las pruebas E2E viven en .env.e2e (NO se sube
// al repo; ver .env.e2e.example). Cargarlo antes de definir la config.
loadEnv({ path: '.env.e2e' });

/**
 * Dos entornos, elegidos con la variable E2E_ENV:
 *   - 'local' (default): contra el contenedor docker (nginx + CSP en modo
 *     bloqueo, mismas variables de producción) en http://localhost:8080.
 *   - 'prod': contra https://sismonarino.com. Solo con la cuenta de prueba,
 *     sin generar datos basura (las pruebas limpian lo que crean) y con las
 *     peticiones espaciadas para no activar el límite.
 */
const ENV = (process.env.E2E_ENV || 'local') as 'local' | 'prod';

const BASE_URL = ENV === 'prod'
  ? (process.env.E2E_PROD_URL || 'https://sismonarino.com')
  : (process.env.E2E_LOCAL_URL || 'http://localhost:8080');

// En prod ejecutamos en serie y con reintentos para no saturar el backend ni
// disparar el rate limit; en local podemos paralelizar.
const isProd = ENV === 'prod';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/support/global-setup.ts',
  // Cada prueba sube datos reales (simulación FDM, MiniSEED): dale aire.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // En prod, nada de datos basura concurrentes ni ráfagas: un worker, en serie.
  fullyParallel: !isProd,
  workers: isProd ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: isProd ? 2 : (process.env.CI ? 1 : 0),
  // Reporte HTML con capturas y video de cada prueba que falle.
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: `playwright-report/${ENV}` }],
  ],
  outputDir: `test-results/${ENV}`,

  use: {
    baseURL: BASE_URL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    // Capturas + video + trace SOLO cuando una prueba falla (ahorra espacio).
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    // En prod espaciamos levemente cada acción para ser suaves con el servidor
    // (el espaciado fuerte entre pasos pesados lo da app.settle()).
    launchOptions: { slowMo: isProd ? 50 : 0 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // Intento de habilitar WebGL por software en Firefox (ayuda en algunos
        // entornos). En los runners de GitHub (headless, sin GPU) no basta: el
        // Mapa 3D (Three.js) y el hodograma por canvas no inicializan WebGL. Por
        // eso esas pruebas concretas se SALTAN solo en Firefox headless
        // (skipIfHeadlessFirefoxWebGL); en un Firefox real pasan.
        launchOptions: {
          firefoxUserPrefs: {
            'webgl.force-enabled': true,
            'webgl.disabled': false,
          },
        },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      // Perfil de celular (vista móvil del instrumento, escenario E8).
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
