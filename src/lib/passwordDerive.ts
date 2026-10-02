/**
 * Derivación de un "secreto de autenticación" a partir de la contraseña, en el
 * CLIENTE, para que la contraseña en texto plano NUNCA viaje por la red ni
 * aparezca en F12 → Network (requisito del curso de seguridad).
 *
 * Lo que se envía a Supabase Auth es el resultado de PBKDF2 sobre la contraseña
 * (64 caracteres hexadecimales), no la contraseña real. Supabase sigue guardando
 * ese valor con bcrypt y sigue usando HTTPS: la derivación es una capa EXTRA,
 * no un reemplazo de esas protecciones.
 *
 * IMPORTANTE: la sal incluye el correo. Si el correo de inicio de sesión cambia,
 * el secreto derivado cambia y la contraseña dejaría de funcionar. Por eso el
 * cambio de correo de login está deshabilitado en la aplicación (ver auth.tsx y
 * docs/seguridad.md). Un cambio de correo requiere restablecer la contraseña.
 *
 * @module passwordDerive
 */

/** Parámetros de PBKDF2. No cambiar sin un plan de migración de contraseñas. */
const ITERATIONS = 310_000;
const HASH = 'SHA-256';
const KEY_BYTES = 32; // 256 bits → 64 caracteres hex
const SALT_PREFIX = 'sismonarino:';

/** Normaliza el correo para la sal: minúsculas y sin espacios al borde. */
function normalizeEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}

/** Convierte un ArrayBuffer a una cadena hexadecimal en minúsculas. */
function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Deriva el secreto de autenticación a partir del correo y la contraseña.
 *
 * - Algoritmo: PBKDF2 con SHA-256 y 310 000 iteraciones.
 * - Sal: "sismonarino:" + correo en minúsculas y sin espacios al borde.
 * - Salida: 32 bytes (256 bits) en hexadecimal (64 caracteres).
 *
 * La misma entrada (mismo correo normalizado y misma contraseña) produce
 * siempre el mismo resultado; correos que solo difieren en mayúsculas o
 * espacios producen el mismo resultado; contraseñas distintas producen
 * resultados distintos.
 *
 * @param email Correo del usuario (se normaliza para la sal).
 * @param password Contraseña en texto plano (no se almacena ni se registra).
 * @returns Secreto derivado en hexadecimal (64 caracteres).
 */
export async function deriveAuthSecret(email: string, password: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Sin Web Crypto (contexto no seguro) no se puede derivar de forma segura.
    throw new Error('Tu navegador no permite cifrado seguro en esta página (se requiere HTTPS).');
  }

  const enc = new TextEncoder();
  const salt = enc.encode(SALT_PREFIX + normalizeEmail(email));

  // Material de clave a partir de la contraseña. `password` solo vive dentro de
  // esta función; el llamador debe limpiar su copia tras el intento.
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: HASH },
    keyMaterial,
    KEY_BYTES * 8,
  );

  return toHex(bits);
}
