/**
 * Autogestión de la cuenta: eliminación permanente por el propio usuario.
 *
 * Llama al backend FastAPI (`DELETE /api/account`), que verifica el JWT del
 * usuario y elimina su cuenta con la clave de servicio (nunca expuesta al
 * frontend). El borrado arrastra perfil y reportes por las claves foráneas.
 * @module account
 */
import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_URL || '';

/** Resultado de un intento de eliminación de cuenta. */
export interface DeleteAccountResult {
  ok: boolean;
  /** Mensaje de error en español cuando `ok` es false. */
  error?: string;
}

/**
 * Elimina la cuenta del usuario en sesión a través del backend.
 * Devuelve `{ ok: true }` si se eliminó, o `{ ok: false, error }` si falló
 * (p. ej. es el único administrador, sesión inválida o error de red).
 */
export async function deleteOwnAccount(): Promise<DeleteAccountResult> {
  if (!supabase) return { ok: false, error: 'Servicio no disponible.' };

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'No hay una sesión activa. Vuelve a iniciar sesión.' };

  try {
    const res = await fetch(`${API_BASE}/api/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return { ok: true };

    // El backend responde con { detail: "..." } en español.
    let detail = 'No se pudo eliminar la cuenta. Inténtalo de nuevo.';
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* respuesta sin cuerpo JSON: se usa el mensaje por defecto */
    }
    return { ok: false, error: detail };
  } catch {
    return { ok: false, error: 'No se pudo conectar con el servidor. Revisa tu conexión.' };
  }
}
