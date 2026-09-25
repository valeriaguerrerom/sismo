import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type UserRole = 'visitor' | 'user' | 'admin';

/** Etiquetas de rol para la interfaz. 'user' es el rol Investigador. */
export const ROLE_LABELS: Record<UserRole, string> = {
  visitor: 'Visitante',
  user: 'Investigador',
  admin: 'Administrador',
};

/** Datos capturados en el registro de un investigador (RF-01). */
export interface ResearcherSignUp {
  fullName: string;
  institution: string;
  occupation: string;
  researchArea: string;
  city: string;
  country: string;
  usagePurpose: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  institution: string;
  /** false cuando un administrador desactivó la cuenta (RF-05). */
  active: boolean;
  occupation: string;
  research_area: string;
  city: string;
  country: string;
  usage_purpose: string;
  /** true cuando el perfil tiene los datos mínimos (institución y ocupación). */
  profileComplete: boolean;
  /** Tours guiados ya vistos por el usuario, mapa { modulo: true }. */
  tours_vistos: Record<string, boolean>;
  /** Proveedor de inicio de sesión: 'email' o 'google'. */
  provider: string;
  /** Fecha de creación de la cuenta (ISO) o null si no está disponible. */
  created_at: string | null;
  /** Fecha de autorización del tratamiento de datos (ISO) o null. */
  data_authorization_at: string | null;
}

/** Un perfil está completo cuando tiene institución y ocupación. */
export function isProfileComplete(p: { institution?: string | null; occupation?: string | null }): boolean {
  return Boolean(p.institution?.trim()) && Boolean(p.occupation?.trim());
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  /** Mensaje de bloqueo cuando la cuenta está desactivada (RF-05). */
  blockedMessage: string | null;
  /** true cuando el usuario llegó desde un enlace de recuperación de contraseña. */
  recoveryMode: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  /**
   * Completa o actualiza los datos de investigador del usuario actual.
   * Si `recordConsent` es true, guarda la fecha de autorización de datos
   * (para cuentas de Google que aceptan al completar el perfil).
   */
  updateProfile: (data: ResearcherSignUp, recordConsent?: boolean) => Promise<string | null>;
  /** Envía el correo con el enlace para restablecer la contraseña. */
  sendPasswordReset: (email: string) => Promise<string | null>;
  /** Fija la nueva contraseña del usuario en sesión de recuperación. */
  updatePassword: (password: string) => Promise<string | null>;
  /** Cierra el modo recuperación (tras guardar o cancelar). */
  clearRecovery: () => void;
  /** Marca un tour guiado como visto (persiste en profiles.tours_vistos). */
  markTourSeen: (module: string) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false,
  blockedMessage: null,
  recoveryMode: false,
  signUp: async () => 'Auth no disponible',
  signIn: async () => 'Auth no disponible',
  signInWithGoogle: async () => 'Auth no disponible',
  signOut: async () => {},
  updateProfile: async () => 'Auth no disponible',
  sendPasswordReset: async () => 'Auth no disponible',
  updatePassword: async () => 'Auth no disponible',
  clearRecovery: () => {},
  markTourSeen: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Envuelve una promesa con un límite de tiempo. Si no resuelve en `ms`,
 * rechaza con un error de timeout. Evita que una petición de red colgada
 * deje la UI esperando para siempre.
 */
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tiempo de espera agotado (${label}). Revisa tu conexión.`)),
      ms,
    );
    Promise.resolve(promise).then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Traduce errores comunes de Supabase Auth a mensajes en español, específicos. */
function translateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Aún no has confirmado tu correo. Revisa tu bandeja de entrada y confírmalo antes de iniciar sesión.';
  if (m.includes('user already registered') || m.includes('already registered')) return 'Ese correo ya está registrado. Inicia sesión o usa otro correo.';
  if (m.includes('password should contain') || m.includes('weak') || m.includes('pwned')) return 'La contraseña no cumple los requisitos de seguridad (mínimo 8 caracteres con letra, número y símbolo).';
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 8 caracteres.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'El correo electrónico no es válido.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  if (m.includes('for security purposes')) return 'Por seguridad, espera unos segundos antes de volver a intentarlo.';
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);

  /** Carga el perfil desde la tabla profiles para una sesión dada. */
  const loadProfile = useCallback(async (session: Session | null) => {
    if (!supabase || !session?.user) {
      setUser(null);
      return;
    }

    const authUser = session.user;
    // Proveedor de inicio de sesión (email/contraseña vs Google OAuth).
    const provider =
      (authUser.app_metadata?.provider as string) ||
      (authUser.identities?.[0]?.provider as string) ||
      'email';

    // Fallback cuando la consulta a `profiles` se cuelga o falla (p. ej. la red
    // a Supabase falla en un refresh de token). CLAVE: si ya teníamos un perfil
    // cargado (mismo usuario), lo CONSERVAMOS en vez de degradarlo a "perfil
    // incompleto" — así no aparece "Completar perfil" cada vez que un refresh
    // no logra releer la tabla. Solo se usa el perfil mínimo si es la primera
    // carga (aún no había user en memoria).
    const authFallback = () => {
      setUser(prev => {
        if (prev && prev.id === authUser.id) return prev; // conservar el existente
        return {
          id: authUser.id,
          email: authUser.email ?? '',
          full_name: (authUser.user_metadata?.full_name as string) ?? (authUser.user_metadata?.name as string) ?? '',
          role: 'user',
          institution: '', active: true, occupation: '', research_area: '',
          city: '', country: '', usage_purpose: '', profileComplete: false,
          tours_vistos: {},
          provider,
          created_at: authUser.created_at ?? null,
          data_authorization_at: null,
        };
      });
    };

    // Consulta del perfil CON timeout. Si la red a Supabase se cuelga, no deja
    // la sesión colgada: cae al fallback de auth.
    let data: Record<string, unknown> | null = null;
    try {
      const res = await withTimeout(
        supabase
          .from('profiles')
          .select('id, email, full_name, role, institution, active, occupation, research_area, city, country, usage_purpose, tours_vistos, created_at, data_authorization_at')
          .eq('id', authUser.id)
          .maybeSingle(),
        8000, 'perfil',
      );
      data = res.data as Record<string, unknown> | null;
    } catch {
      // La consulta de perfil se colgó o falló: se usan los datos mínimos de
      // auth. No se registra el detalle para no exponer datos de sesión/perfil.
      authFallback();
      return;
    }

    if (data) {
      const p = data as {
        id: string; email: string; full_name: string | null; role: string | null;
        institution: string | null; active: boolean | null; occupation: string | null;
        research_area: string | null; city: string | null; country: string | null;
        usage_purpose: string | null; tours_vistos: Record<string, boolean> | null;
        created_at: string | null; data_authorization_at: string | null;
      };
      // Cuenta desactivada por un administrador (RF-05): cerrar sesión y avisar.
      if (p.active === false) {
        setUser(null);
        setBlockedMessage('Tu cuenta fue desactivada por un administrador. Escribe al equipo de SismoNariño para reactivarla.');
        await supabase.auth.signOut();
        return;
      }
      setBlockedMessage(null);
      setUser({
        id: p.id,
        email: p.email,
        full_name: p.full_name ?? '',
        role: (p.role as UserRole) ?? 'user',
        institution: p.institution ?? '',
        active: true,
        occupation: p.occupation ?? '',
        research_area: p.research_area ?? '',
        city: p.city ?? '',
        country: p.country ?? '',
        usage_purpose: p.usage_purpose ?? '',
        profileComplete: isProfileComplete(p),
        tours_vistos: p.tours_vistos ?? {},
        provider,
        created_at: p.created_at ?? authUser.created_at ?? null,
        data_authorization_at: p.data_authorization_at ?? null,
      });
      // Registrar último acceso (RF-22). No bloquea la UI si falla.
      supabase.rpc('touch_last_login').then(() => { /* best-effort, sin log */ });
    } else {
      // El perfil aún no existe (el trigger puede tardar) o la consulta no lo
      // devolvió: usamos los datos de auth (queda logueado, perfil por completar).
      authFallback();
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Sesión inicial al cargar la app. Con timeout: si la red a Supabase se
    // cuelga, la app igual sale de la pantalla de carga (sin sesión) en vez de
    // quedarse bloqueada indefinidamente.
    withTimeout(supabase.auth.getSession(), 8000, 'sesión inicial')
      .then(async ({ data }) => { await loadProfile(data.session); })
      .catch(() => { /* sin sesión; no se registra el detalle */ })
      .finally(() => setLoading(false));

    // Suscripción a cambios de sesión (login, logout, refresh, OAuth redirect).
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      // El enlace del correo de recuperación dispara PASSWORD_RECOVERY con una
      // sesión temporal: se marca el modo recuperación para mostrar la pantalla
      // "Nueva contraseña" (no se entra a los módulos con esa sesión).
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setLoading(false);
        return;
      }
      await loadProfile(session);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string): Promise<string | null> => {
      if (!supabase) return 'Auth no disponible: falta configurar Supabase.';
      // Registro en dos pasos: aquí solo se crea la cuenta con nombre y la
      // fecha de autorización de datos (Ley 1581). El resto del perfil de
      // investigador se completa después en "Completa tu perfil".
      const meta = {
        full_name: fullName.trim(),
        data_authorization_at: new Date().toISOString(),
      };
      try {
        // Los metadatos los copia el trigger handle_new_user a la tabla profiles.
        // Con timeout para que el botón no se quede en "Procesando…" si la red
        // a Supabase se cuelga. La contraseña la cifra Supabase en el servidor;
        // nunca se transforma ni se registra en el cliente.
        const { data, error } = await withTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: { data: meta, emailRedirectTo: window.location.origin },
          }), 12000, 'registro',
        );
        if (error) return translateError(error.message);

        // Si no hay confirmación de email, ya hay sesión: asegurar los datos.
        if (data.session && data.user) {
          await withTimeout(
            supabase.from('profiles').update(meta).eq('id', data.user.id), 8000, 'perfil',
          );
        }
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'No se pudo completar el registro. Revisa tu conexión.';
      }
    },
    [],
  );

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'Auth no disponible: falta configurar Supabase.';
    try {
      // Con timeout: si la red a Supabase se cuelga, el botón no se queda
      // eternamente en "Procesando…" y se muestra un mensaje claro.
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }), 12000, 'inicio de sesión',
      );
      if (error) return translateError(error.message);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'No se pudo iniciar sesión. Revisa tu conexión.';
    }
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    if (!supabase) return 'Auth no disponible: falta configurar Supabase.';
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        }), 12000, 'inicio de sesión con Google',
      );
      if (error) return translateError(error.message);
      return null; // El navegador redirige a Google; onAuthStateChange completa el resto.
    } catch (e) {
      return e instanceof Error ? e.message : 'No se pudo conectar con Google. Revisa tu conexión.';
    }
  }, []);

  const updateProfile = useCallback(async (form: ResearcherSignUp, recordConsent = false): Promise<string | null> => {
    if (!supabase) return 'Auth no disponible: falta configurar Supabase.';
    try {
      const { data: sess } = await withTimeout(supabase.auth.getSession(), 8000, 'sesión');
      const authUser = sess.session?.user;
      if (!authUser) return 'No hay una sesión activa. Vuelve a iniciar sesión.';

      const row = {
        full_name: form.fullName.trim(),
        institution: form.institution.trim(),
        occupation: form.occupation,
        research_area: form.researchArea.trim(),
        city: form.city.trim(),
        country: form.country.trim() || 'Colombia',
        usage_purpose: form.usagePurpose.trim(),
        // Solo se escribe la fecha de autorización cuando el usuario la acepta
        // aquí (cuentas de Google); no se sobreescribe en actualizaciones normales.
        ...(recordConsent ? { data_authorization_at: new Date().toISOString() } : {}),
      };

      // upsert (INSERT ... ON CONFLICT): crea la fila si no existe o la actualiza.
      // Con timeout para que una petición colgada no deje "Guardando…" eterno.
      const { data: upserted, error } = await withTimeout(
        supabase
          .from('profiles')
          .upsert({ id: authUser.id, email: authUser.email ?? '', ...row }, { onConflict: 'id' })
          .select(),
        12000,
        'guardado',
      );
      if (error) return translateError(error.message);
      if (!upserted || upserted.length === 0) {
        return 'El guardado no se pudo confirmar. Revisa tu conexión e inténtalo de nuevo.';
      }

      // El guardado YA está confirmado (upserted trae la fila). Actualizamos el
      // perfil en memoria directamente con lo que devolvió la BD, sin depender
      // de otra consulta que pudiera colgarse. Esto desbloquea la UI siempre.
      const saved = upserted[0] as Record<string, unknown>;
      setUser(prev => ({
        id: authUser.id,
        email: (saved.email as string) ?? authUser.email ?? '',
        full_name: (saved.full_name as string) ?? row.full_name,
        role: (saved.role as UserRole) ?? prev?.role ?? 'user',
        institution: (saved.institution as string) ?? row.institution,
        active: saved.active === false ? false : true,
        occupation: (saved.occupation as string) ?? row.occupation,
        research_area: (saved.research_area as string) ?? row.research_area,
        city: (saved.city as string) ?? row.city,
        country: (saved.country as string) ?? row.country,
        usage_purpose: (saved.usage_purpose as string) ?? row.usage_purpose,
        profileComplete: isProfileComplete(row),
        tours_vistos: (saved.tours_vistos as Record<string, boolean>) ?? prev?.tours_vistos ?? {},
        provider: prev?.provider ?? 'email',
        created_at: (saved.created_at as string) ?? prev?.created_at ?? null,
        data_authorization_at: (saved.data_authorization_at as string) ?? prev?.data_authorization_at ?? null,
      }));

      // Refresco en segundo plano (best-effort); no bloquea ni cuelga la UI.
      withTimeout(loadProfile(sess.session), 8000, 'refresco').catch(() => { /* no crítico */ });
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido al guardar el perfil.';
      return translateError(msg);
    }
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    // Limpiamos el estado local PRIMERO para que la UI responda al instante.
    // Si la petición a Supabase se cuelga (p. ej. una extensión bloquea la red),
    // el usuario igual queda deslogueado en la app. La llamada de red corre en
    // segundo plano con un límite de tiempo y no bloquea el botón.
    setUser(null);
    setRecoveryMode(false);
    setBlockedMessage(null);
    if (!supabase) return;
    try {
      await withTimeout(supabase.auth.signOut(), 5000, 'cierre de sesión');
    } catch {
      // La sesión local ya se cerró; no se registra el detalle.
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string): Promise<string | null> => {
    if (!supabase) return 'Auth no disponible: falta configurar Supabase.';
    try {
      // El enlace del correo vuelve a la app; onAuthStateChange detecta
      // PASSWORD_RECOVERY y muestra la pantalla "Nueva contraseña".
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/?recovery=1`,
        }), 12000, 'envío de enlace',
      );
      // No se revela si el correo existe: el llamador muestra siempre el mismo
      // mensaje. Solo se devuelve error ante fallos de red/límite de tasa.
      if (error && /rate limit|too many|for security/i.test(error.message)) {
        return translateError(error.message);
      }
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'No se pudo enviar el enlace. Revisa tu conexión.';
    }
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<string | null> => {
    if (!supabase) return 'Auth no disponible: falta configurar Supabase.';
    try {
      const { error } = await withTimeout(
        supabase.auth.updateUser({ password }), 12000, 'actualización de contraseña',
      );
      if (error) {
        const m = error.message.toLowerCase();
        if (m.includes('session') || m.includes('expired') || m.includes('jwt') || m.includes('token')) {
          return 'EXPIRED';
        }
        return translateError(error.message);
      }
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'No se pudo actualizar la contraseña. Revisa tu conexión.';
    }
  }, []);

  const clearRecovery = useCallback(() => setRecoveryMode(false), []);

  const markTourSeen = useCallback((module: string) => {
    // Optimista: actualiza el estado local de inmediato para no relanzar el
    // tour, y persiste en segundo plano (best-effort, no bloquea la UI).
    setUser(prev => {
      if (!prev || prev.tours_vistos?.[module]) return prev;
      const tours_vistos = { ...prev.tours_vistos, [module]: true };
      if (supabase && prev.id !== 'mock') {
        withTimeout(
          supabase.from('profiles').update({ tours_vistos }).eq('id', prev.id),
          8000, 'tour',
        ).catch(() => { /* no crítico: se reintenta la próxima sesión */ });
      }
      return { ...prev, tours_vistos };
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, blockedMessage, recoveryMode, signUp, signIn, signInWithGoogle, signOut, updateProfile, sendPasswordReset, updatePassword, clearRecovery, markTourSeen }}>
      {children}
    </AuthContext.Provider>
  );
}
