/**
 * Textos y validaciones compartidas del flujo de autenticación:
 * requisitos de contraseña segura y autorización de datos personales
 * (Ley 1581 de 2012). Usados por el registro y por "Completa tu perfil".
 * @module authConsent
 */

/** URL institucional de la política de protección de datos. */
export const DATA_POLICY_URL = 'https://www.umariana.edu.co/politicas-proteccion-datos.html';

/** Un requisito de contraseña con su verificación. */
export interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

/** Requisitos de contraseña segura (deben coincidir con el ajuste de Supabase). */
export const PASSWORD_RULES: PasswordRule[] = [
  { label: 'Mínimo 8 caracteres', test: pw => pw.length >= 8 },
  { label: 'Al menos una letra', test: pw => /[a-zA-Z]/.test(pw) },
  { label: 'Al menos un número', test: pw => /\d/.test(pw) },
  { label: 'Al menos un símbolo', test: pw => /[^a-zA-Z0-9]/.test(pw) },
];

/** true cuando la contraseña cumple todos los requisitos. */
export function isPasswordStrong(pw: string): boolean {
  return PASSWORD_RULES.every(r => r.test(pw));
}
