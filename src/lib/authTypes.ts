/**
 * Tipos, constantes y helpers de autenticación (sin componentes).
 *
 * Se separan de `auth.tsx` para que ese archivo exporte solo el componente
 * `AuthProvider` y el hook `useAuth` (requisito de react-refresh / fast refresh).
 * Aquí viven las piezas puras que consumen páginas y utilidades.
 * @module authTypes
 */

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
  /** false cuando la cuenta está desactivada (por el usuario o un admin). */
  active: boolean;
  occupation: string;
  research_area: string;
  city: string;
  country: string;
  usage_purpose: string;
  /** true cuando el perfil tiene los datos mínimos (institución y ocupación). */
  profileComplete: boolean;
  /**
   * Tours guiados vistos por el usuario. Guarda la VERSIÓN vista de cada
   * módulo, { modulo: version }. Valores antiguos `true` se tratan como
   * versión 1. Si el tour cambia (versión mayor), se vuelve a mostrar una vez.
   */
  tours_vistos: Record<string, number | boolean>;
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

/** Info de una cuenta desactivada que intenta entrar. */
export interface DeactivatedInfo {
  /** Quién la desactivó: el propio usuario o un administrador. */
  by: 'usuario' | 'administrador';
}
