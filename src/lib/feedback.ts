/**
 * Mensajes del formulario "Escríbenos" de la página Acerca de.
 *
 * El envío funciona sin sesión (policy RLS de INSERT pública). La lectura y la
 * gestión de estado (Nuevo/Leído/Respondido) solo la pueden hacer los
 * administradores. La protección anti spam es del lado del cliente: un campo
 * trampa (honeypot) que debe ir vacío y un límite de envíos por minuto en
 * localStorage.
 *
 * Requiere la migración `supabase/migrations/20260925_feedback_messages.sql`.
 * @module feedback
 */
import { supabase } from './supabase';

/** Tipo de mensaje que puede enviar el visitante. */
export type FeedbackType = 'sugerencia' | 'error' | 'datos' | 'otro';

/** Estado de gestión del mensaje en el panel de administración. */
export type FeedbackStatus = 'nuevo' | 'leido' | 'respondido';

/** Un mensaje de contacto tal como vive en `feedback_messages`. */
export interface FeedbackMessage {
  id: string;
  type: FeedbackType;
  message: string;
  email: string | null;
  user_id: string | null;
  status: FeedbackStatus;
  created_at: string;
}

/** Datos que envía el formulario. */
export interface FeedbackInput {
  type: FeedbackType;
  message: string;
  email?: string | null;
  /** Autorización de datos (Ley 1581). Obligatoria cuando se deja correo. */
  consent?: boolean;
  /** Campo trampa: si trae texto, es un bot y se descarta silenciosamente. */
  honeypot?: string;
}

/** Etiquetas legibles de cada tipo, para los selectores y el panel. */
export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  sugerencia: 'Sugerencia',
  error: 'Reporte de error',
  datos: 'Solicitud de datos',
  otro: 'Otro',
};

/** Etiquetas legibles de cada estado. */
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  nuevo: 'Nuevo',
  leido: 'Leído',
  respondido: 'Respondido',
};

/** Longitud máxima del mensaje (coincide con el CHECK de la tabla). */
export const FEEDBACK_MAX_LENGTH = 1000;

/** Resultado del intento de envío. */
export type SubmitResult =
  | { ok: true }
  | { ok: false; reason: 'rate_limit' | 'validation' | 'error'; message: string };

/** Base del backend FastAPI (mismo criterio que src/lib/api.ts). */
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/** Valida un correo de forma sencilla (solo si el usuario dejó uno). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Envía un mensaje de contacto a través del backend FastAPI (POST /api/feedback).
 *
 * El backend es quien valida, limita por IP, toma el id del usuario del token
 * y guarda con la clave de servicio. El navegador NO escribe en Supabase. Aquí
 * solo se hacen comprobaciones básicas para dar retroalimentación inmediata.
 *
 * @param input Tipo, mensaje, correo opcional, consentimiento y honeypot.
 * @returns Resultado del envío.
 */
export async function submitFeedback(input: FeedbackInput): Promise<SubmitResult> {
  // Honeypot: un bot rellena el campo oculto. Fingimos éxito y no enviamos nada.
  if (input.honeypot && input.honeypot.trim() !== '') {
    return { ok: true };
  }

  const message = input.message.trim();
  if (!message) {
    return { ok: false, reason: 'validation', message: 'El mensaje no puede estar vacío.' };
  }
  if (message.length > FEEDBACK_MAX_LENGTH) {
    return { ok: false, reason: 'validation', message: `El mensaje supera los ${FEEDBACK_MAX_LENGTH} caracteres.` };
  }

  const email = input.email?.trim() || null;
  if (email && !isValidEmail(email)) {
    return { ok: false, reason: 'validation', message: 'El correo no tiene un formato válido.' };
  }
  if (email && !input.consent) {
    return { ok: false, reason: 'validation', message: 'Debes autorizar el tratamiento de tu correo para que podamos responderte.' };
  }

  // Si hay sesión, adjuntar el token: el backend obtiene de él el id del usuario.
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (supabase) {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      /* sin sesión: se envía como anónimo */
    }
  }

  try {
    const res = await fetch(`${API_BASE}/api/feedback`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: input.type,
        message,
        email,
        consent: !!input.consent,
        honeypot: '',
      }),
    });
    if (res.ok) return { ok: true };

    if (res.status === 429) {
      const data = await res.json().catch(() => null);
      return { ok: false, reason: 'rate_limit', message: data?.detail || 'Demasiados envíos. Inténtalo más tarde.' };
    }
    if (res.status === 400) {
      const data = await res.json().catch(() => null);
      return { ok: false, reason: 'validation', message: data?.detail || 'Revisa los datos del formulario.' };
    }
    return { ok: false, reason: 'error', message: 'No se pudo enviar el mensaje. Inténtalo más tarde.' };
  } catch {
    return { ok: false, reason: 'error', message: 'No hay conexión con el servidor. Inténtalo más tarde.' };
  }
}

// ─── Funciones del panel de administración ───

/** Lista todos los mensajes ordenados del más reciente al más antiguo. */
export async function listFeedback(): Promise<FeedbackMessage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('feedback_messages')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FeedbackMessage[];
}

/** Cambia el estado de un mensaje (Nuevo/Leído/Respondido). */
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('feedback_messages').update({ status }).eq('id', id);
  if (error) throw error;
}

/** Elimina un mensaje. */
export async function deleteFeedback(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('feedback_messages').delete().eq('id', id);
  if (error) throw error;
}

/** Cuenta los mensajes en estado "nuevo" (para el indicador del Resumen). */
export async function countNewFeedback(): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from('feedback_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'nuevo');
  if (error) return 0;
  return count ?? 0;
}
