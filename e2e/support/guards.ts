import type { Page, Request, Response, ConsoleMessage, TestInfo } from '@playwright/test';

/**
 * Clasificación de hosts para distinguir peticiones propias (backend/Supabase)
 * de terceros (Google Analytics, OAuth). Se usa en el guard de red y en las
 * pruebas de privacidad/cookies.
 */
export const BACKEND_HOST_RE = /sismonarino-api.*\.up\.railway\.app$|^localhost:8000$|(^|\.)railway\.app$/i;
export const SUPABASE_HOST_RE = /\.supabase\.co$/i;
export const GA_HOST_RE = /(^|\.)google-analytics\.com$|(^|\.)analytics\.google\.com$|(^|\.)googletagmanager\.com$|(^|\.)g\.doubleclick\.net$|(^|\.)google\.com$/i;

/** ¿La URL es una llamada a NUESTRO backend (por host o por ruta /api/*)? */
export function isBackendRequest(url: URL): boolean {
  if (BACKEND_HOST_RE.test(url.host)) return true;
  // En local con proxy de nginx, el backend se ve como /api/* en el mismo host.
  if (url.pathname.startsWith('/api/')) return true;
  return false;
}

export function isSupabaseRequest(url: URL): boolean {
  return SUPABASE_HOST_RE.test(url.host);
}

export function isGoogleAnalyticsRequest(url: URL): boolean {
  return GA_HOST_RE.test(url.host);
}

/**
 * Peticiones 4xx/5xx que son NORMALES en esta app y no deben hacer fallar una
 * prueba (salvo que la prueba las provoque a propósito, que se maneja con el
 * mecanismo de allow/expect de abajo):
 *   - 404/503 en /api/events/.../waveforms y /api/waveforms/... → "no hay dato".
 *   - 400 de Supabase /auth → errores de credenciales traducidos a mensajes
 *     amables (los cubre la propia prueba de login con credenciales malas).
 *   - 401/403 de Supabase /rest cuando aún no hay sesión (RLS).
 */
function isTolerableServerStatus(url: URL, status: number): boolean {
  const p = url.pathname;
  if ((status === 404 || status === 503) && /\/waveforms(\/|$|\?)|\/waveforms$/.test(p)) return true;
  if ((status === 404 || status === 503) && /\/api\/.*waveforms/.test(p)) return true;
  // Supabase auth: 400 en intentos de login son esperables (p. ej. prueba de
  // credenciales inválidas). Las pruebas que NO esperan esto fallarán por otra
  // vía (no se renderiza la sesión), así que tolerar el status aquí es seguro.
  if (status === 400 && isSupabaseRequest(url) && p.startsWith('/auth/')) return true;
  return false;
}

/** Mensajes de consola de ruido conocido que no indican un fallo real. */
function isIgnorableConsoleText(text: string): boolean {
  const t = text.toLowerCase();
  // El favicon o fuentes a veces dan 404 benignos; three.js/webgl avisos.
  if (t.includes('favicon')) return true;
  // Advertencias de WebGL/contexto en navegadores sin aceleración (CI headless).
  if (t.includes('webgl') && (t.includes('deprecat') || t.includes('context'))) return true;
  if (t.includes('download the react devtools')) return true;
  return false;
}

export interface GuardViolation {
  kind: 'console' | 'csp' | 'network' | 'blank' | 'error-boundary' | 'pageerror';
  detail: string;
}

export interface GuardController {
  /**
   * Marca que, a partir de ahora, se ESPERA un fallo que coincida con el
   * patrón (status de red, texto de consola o de CSP). Útil para las pruebas
   * de "datos inválidos" o "credenciales incorrectas" que provocan errores a
   * propósito. Devuelve una función para dejar de esperarlo.
   */
  expectFailure(pattern: RegExp): () => void;
  /** Lista de violaciones acumuladas (para aserciones manuales si hace falta). */
  readonly violations: GuardViolation[];
}

/**
 * Instala en la página todos los guardias de fallo automático pedidos:
 *   - error en consola o violación de CSP ("Refused to ...").
 *   - petición a backend/Supabase con 4xx/5xx (salvo las toleradas o las que la
 *     prueba provoca a propósito con expectFailure()).
 *   - pantalla en blanco (#root vacío) o el mensaje del Error Boundary.
 *
 * Las violaciones se revisan al final de cada prueba (ver fixtures.ts) y, si
 * las hay, la prueba falla con el detalle.
 */
export function installGuards(page: Page): GuardController {
  const violations: GuardViolation[] = [];
  const expected: RegExp[] = [];

  const isExpected = (s: string) => expected.some((re) => re.test(s));

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isIgnorableConsoleText(text)) return;
    // Violación de CSP: Chromium/WebKit la reportan como "Refused to ...".
    if (/\bRefused to\b/i.test(text) || /Content Security Policy/i.test(text)) {
      if (!isExpected(text)) violations.push({ kind: 'csp', detail: `CSP: ${text}` });
      return;
    }
    if (!isExpected(text)) violations.push({ kind: 'console', detail: `console.error: ${text}` });
  });

  // Errores de JS no capturados (crash de React antes del Error Boundary, etc.).
  page.on('pageerror', (err: Error) => {
    const text = `${err.name}: ${err.message}`;
    if (isExpected(text)) return;
    if (isIgnorableConsoleText(text)) return;
    violations.push({ kind: 'pageerror', detail: `pageerror: ${text}` });
  });

  // Peticiones fallidas de red (DNS, bloqueo por CSP a nivel de red, etc.).
  page.on('requestfailed', (req: Request) => {
    const url = safeUrl(req.url());
    if (!url) return;
    if (!isBackendRequest(url) && !isSupabaseRequest(url)) return; // ignorar terceros
    const failure = req.failure()?.errorText || 'request failed';
    // El aborto por cancelación de navegación no es un fallo real.
    if (/aborted|canceled|cancelled/i.test(failure)) return;
    const detail = `requestfailed ${req.method()} ${req.url()} → ${failure}`;
    if (!isExpected(detail) && !isExpected(req.url())) {
      violations.push({ kind: 'network', detail });
    }
  });

  page.on('response', (res: Response) => {
    const status = res.status();
    if (status < 400) return;
    const url = safeUrl(res.url());
    if (!url) return;
    // Solo nos importan las nuestras: backend o Supabase.
    if (!isBackendRequest(url) && !isSupabaseRequest(url)) return;
    if (isTolerableServerStatus(url, status)) return;
    const detail = `HTTP ${status} ${res.request().method()} ${res.url()}`;
    if (!isExpected(detail) && !isExpected(res.url()) && !isExpected(String(status))) {
      violations.push({ kind: 'network', detail });
    }
  });

  return {
    violations,
    expectFailure(pattern: RegExp) {
      expected.push(pattern);
      return () => {
        const i = expected.indexOf(pattern);
        if (i >= 0) expected.splice(i, 1);
      };
    },
  };
}

function safeUrl(u: string): URL | null {
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

/**
 * Comprueba que no quedó una pantalla en blanco ni el Error Boundary visible.
 * Se llama al final de cada prueba.
 */
export async function assertNoBlankOrErrorBoundary(page: Page): Promise<string | null> {
  // Si la página se cerró/navegó fuera, no evaluamos.
  if (page.isClosed()) return null;
  try {
    const result = await page.evaluate(() => {
      const root = document.getElementById('root');
      const rootEmpty = !root || root.childElementCount === 0;
      const bodyText = document.body?.innerText || '';
      // Textos del Error Boundary (ver src/components/ui/ErrorBoundary.tsx).
      const boundaryHit =
        /Ocurrió un error inesperado\. Puedes reintentar o volver al inicio\./.test(bodyText) ||
        /Algo salió mal/.test(bodyText) ||
        /^Error en /m.test(bodyText);
      return { rootEmpty, boundaryHit };
    });
    if (result.rootEmpty) return 'Pantalla en blanco: #root quedó vacío.';
    if (result.boundaryHit) return 'Se mostró el Error Boundary de la aplicación.';
    return null;
  } catch {
    return null;
  }
}

/** Resume las violaciones acumuladas en un texto para el mensaje de fallo. */
export function summarizeViolations(v: GuardViolation[]): string {
  if (v.length === 0) return '';
  const lines = v.map((x, i) => `  ${i + 1}. [${x.kind}] ${x.detail}`);
  return `Se detectaron ${v.length} violación(es) durante la prueba:\n${lines.join('\n')}`;
}

export type { TestInfo };
