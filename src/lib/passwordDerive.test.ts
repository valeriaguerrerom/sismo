// @vitest-environment node
/**
 * Pruebas de la derivación de contraseña en el cliente (passwordDerive).
 *
 * Se corre en entorno Node para usar la Web Crypto nativa (crypto.subtle), que
 * es la misma API que el navegador. Verifica el contrato esperado por los
 * flujos de autenticación.
 */
import { describe, it, expect } from 'vitest';
import { deriveAuthSecret } from './passwordDerive';

describe('deriveAuthSecret', () => {
  it('la misma entrada da siempre el mismo resultado', async () => {
    const a = await deriveAuthSecret('persona@correo.com', 'Clave1234$');
    const b = await deriveAuthSecret('persona@correo.com', 'Clave1234$');
    expect(a).toBe(b);
  });

  it('devuelve 64 caracteres hexadecimales (32 bytes)', async () => {
    const h = await deriveAuthSecret('persona@correo.com', 'Clave1234$');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el correo con mayúsculas o espacios da el mismo resultado', async () => {
    const base = await deriveAuthSecret('persona@correo.com', 'Clave1234$');
    const upper = await deriveAuthSecret('PERSONA@CORREO.COM', 'Clave1234$');
    const spaced = await deriveAuthSecret('  Persona@Correo.com  ', 'Clave1234$');
    expect(upper).toBe(base);
    expect(spaced).toBe(base);
  });

  it('contraseñas distintas dan resultados distintos', async () => {
    const a = await deriveAuthSecret('persona@correo.com', 'Clave1234$');
    const b = await deriveAuthSecret('persona@correo.com', 'Clave1234#');
    expect(a).not.toBe(b);
  });

  it('correos distintos (misma contraseña) dan resultados distintos', async () => {
    const a = await deriveAuthSecret('uno@correo.com', 'Clave1234$');
    const b = await deriveAuthSecret('dos@correo.com', 'Clave1234$');
    expect(a).not.toBe(b);
  });
});
