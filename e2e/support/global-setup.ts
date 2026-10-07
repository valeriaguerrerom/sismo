import type { FullConfig } from '@playwright/test';

/**
 * Setup global. En esta máquina el DNS resuelve en frío de forma intermitente
 * (la primera petición a sismonarino.com a veces da ERR_NAME_NOT_RESOLVED y
 * luego funciona). Para que la primera prueba no gaste un reintento, calentamos
 * el DNS/handshake haciendo un par de peticiones al host base antes de empezar.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL as string | undefined;
  if (!baseURL) return;

  // Calentamos el DNS/handshake del FRONTEND y del BACKEND. En prod, el backend
  // es otro host (Railway); si su DNS está en frío, las llamadas /api fallan
  // (sobre todo en WebKit, que no se recupera). En local ambos son localhost.
  const origins = new Set<string>();
  try {
    origins.add(new URL(baseURL).origin);
  } catch {
    /* ignore */
  }
  if (/sismonarino\.com/.test(baseURL)) {
    origins.add('https://sismonarino-api-production.up.railway.app');
  }

  for (const origin of origins) {
    await warm(origin);
  }
}

async function warm(origin: string): Promise<void> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15_000);
      const res = await fetch(origin, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok || res.status < 500) {
        // eslint-disable-next-line no-console
        console.log(`[e2e] host listo: ${origin} (HTTP ${res.status})`);
        return;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`[e2e] calentando ${origin} intento ${attempt}/6: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
