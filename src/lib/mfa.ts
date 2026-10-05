/**
 * Verificación en dos pasos (2FA) con app autenticadora (TOTP).
 *
 * Envuelve la API de MFA de Supabase (`supabase.auth.mfa.*`) para que el Perfil
 * y el inicio de sesión no dependan de sus detalles. El segundo factor es un
 * código de 6 dígitos que genera una app como Google Authenticator o Microsoft
 * Authenticator a partir de un secreto que se muestra como código QR al activar.
 *
 * Es OPCIONAL y por usuario: quien quiera más seguridad lo activa en su perfil;
 * quien no, inicia sesión solo con su contraseña.
 *
 * @module mfa
 */
import { supabase } from './supabase';

/** Datos del enrolamiento TOTP: QR para escanear y secreto manual de respaldo. */
export interface MfaEnrollment {
  factorId: string;
  /** Imagen SVG del código QR (data URL o SVG embebido). */
  qr: string;
  /** Secreto en texto, por si la app pide escribirlo a mano. */
  secret: string;
}

/** Mensaje de error en español para los fallos más comunes de la API de MFA. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid') && (m.includes('code') || m.includes('totp'))) {
    return 'El código no es correcto. Revisa que sea el actual de tu app (cambia cada 30 segundos).';
  }
  if (m.includes('expired')) return 'El código expiró. Escribe el que muestra tu app ahora.';
  if (m.includes('rate') || m.includes('too many')) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  if (m.includes('mfa') && m.includes('not enabled')) {
    return 'La verificación en dos pasos no está habilitada en el servidor. Pide al administrador que la active en Supabase.';
  }
  return 'No se pudo completar la verificación en dos pasos. Inténtalo de nuevo.';
}

/** true si hay al menos un factor TOTP verificado en la cuenta. */
export async function hasVerifiedTotp(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.mfa.listFactors();
    return Boolean(data?.totp?.some(f => f.status === 'verified'));
  } catch {
    return false;
  }
}

/**
 * Inicia el enrolamiento de un factor TOTP. Devuelve el QR y el secreto para
 * mostrarlos; el usuario los escanea y luego confirma con `verifyEnrollment`.
 * Limpia primero cualquier factor TOTP a medio enrolar (sin verificar) para no
 * acumular basura si el usuario cancela y reintenta.
 */
export async function startEnrollment(): Promise<{ data: MfaEnrollment | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Auth no disponible.' };
  try {
    // Quita factores previos NO verificados (reintentos) para evitar el error
    // "factor with friendly name already exists".
    const { data: list } = await supabase.auth.mfa.listFactors();
    const stale = (list?.totp ?? []).filter(f => f.status !== 'verified');
    for (const f of stale) {
      try { await supabase.auth.mfa.unenroll({ factorId: f.id }); } catch { /* no crítico */ }
    }

    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error) return { data: null, error: friendly(error.message) };
    return {
      data: {
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? friendly(e.message) : 'No se pudo iniciar la verificación en dos pasos.' };
  }
}

/**
 * Confirma el enrolamiento verificando el primer código de 6 dígitos. Al pasar,
 * el factor queda `verified` y la cuenta exige el código en adelante.
 */
export async function verifyEnrollment(factorId: string, code: string): Promise<string | null> {
  if (!supabase) return 'Auth no disponible.';
  try {
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr) return friendly(chErr.message);
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
    if (error) return friendly(error.message);
    return null;
  } catch (e) {
    return e instanceof Error ? friendly(e.message) : 'No se pudo verificar el código.';
  }
}

/** Desactiva la verificación en dos pasos quitando todos los factores TOTP. */
export async function disableTotp(): Promise<string | null> {
  if (!supabase) return 'Auth no disponible.';
  try {
    const { data: list } = await supabase.auth.mfa.listFactors();
    const factors = list?.totp ?? [];
    for (const f of factors) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) return friendly(error.message);
    }
    return null;
  } catch (e) {
    return e instanceof Error ? friendly(e.message) : 'No se pudo desactivar la verificación en dos pasos.';
  }
}

/**
 * true si, tras iniciar sesión con contraseña, falta el segundo factor: la
 * cuenta tiene TOTP verificado y la sesión está en aal1 pero debe llegar a aal2.
 */
export async function needsMfaChallenge(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
  } catch {
    return false;
  }
}

/**
 * Completa el segundo factor en el inicio de sesión: toma el primer factor TOTP
 * verificado, lanza un challenge y verifica el código. Al pasar, la sesión sube
 * a aal2 y el usuario queda plenamente autenticado.
 */
export async function completeMfaChallenge(code: string): Promise<string | null> {
  if (!supabase) return 'Auth no disponible.';
  try {
    const { data: list, error: listErr } = await supabase.auth.mfa.listFactors();
    if (listErr) return friendly(listErr.message);
    const factor = (list?.totp ?? []).find(f => f.status === 'verified');
    if (!factor) return 'No hay un segundo factor configurado en esta cuenta.';
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (chErr) return friendly(chErr.message);
    const { error } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, code: code.trim() });
    if (error) return friendly(error.message);
    return null;
  } catch (e) {
    return e instanceof Error ? friendly(e.message) : 'No se pudo verificar el código.';
  }
}
