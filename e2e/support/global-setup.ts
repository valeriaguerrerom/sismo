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
  let origin: string;
  try {
    origin = new URL(baseURL).origin;
  } catch {
    return;
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
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
      console.log(`[e2e] calentando DNS intento ${attempt}/5: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  // No abortamos la suite: los reintentos por prueba cubren el resto.
}
