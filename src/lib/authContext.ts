/**
 * Contexto de autenticación y hook `useAuth`.
 *
 * Separados de `auth.tsx` para que ese archivo exporte solo el componente
 * `AuthProvider` (requisito de react-refresh / fast refresh). El provider
 * importa `AuthContext` de aquí; las páginas usan `useAuth`.
 * @module authContext
 */
import { createContext, useContext } from 'react';
import type { UserProfile, ResearcherSignUp, DeactivatedInfo } from './authTypes';

export interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  /** Mensaje de bloqueo cuando la cuenta está desactivada (RF-05). */
  blockedMessage: string | null;
  /** Info de cuenta desactivada (para la pantalla de reactivación). */
  deactivatedInfo: DeactivatedInfo | null;
  /** El usuario reactiva su propia cuenta (solo si la desactivó él mismo). */
  reactivateOwnAccount: () => Promise<string | null>;
  /** El usuario desactiva su propia cuenta (conserva datos y reportes). */
  deactivateOwnAccount: () => Promise<string | null>;
  /** true cuando el usuario llegó desde un enlace de recuperación de contraseña. */
  recoveryMode: boolean;
  /**
   * Crea la cuenta. Devuelve `error` (o null) y `needsConfirmation`: true
   * cuando Supabase exige confirmar el correo (no hay sesión aún); false
   * cuando el registro ya dejó la sesión abierta (se entra directo).
   */
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  /**
   * Inicia sesión con correo y contraseña. Devuelve `error` (o null) y
   * `mfaRequired`: true cuando la cuenta tiene verificación en dos pasos y falta
   * introducir el código del segundo factor (la UI muestra el paso del código).
   */
  signIn: (email: string, password: string) => Promise<{ error: string | null; mfaRequired: boolean }>;
  /** Verifica el código del segundo factor (2FA) para completar el inicio de sesión. */
  verifyMfa: (code: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  /**
   * Completa o actualiza los datos de investigador del usuario actual.
   * Si `recordConsent` es true, guarda la fecha de autorización de datos
   * (para cuentas de Google que aceptan al completar el perfil).
   */
  updateProfile: (data: ResearcherSignUp, recordConsent?: boolean) => Promise<string | null>;
  /**
   * Guarda o quita (con `null`) la foto de perfil. Recibe un data URL ya
   * redimensionado; se persiste en la columna `avatar` de `profiles`.
   */
  updateAvatar: (dataUrl: string | null) => Promise<string | null>;
  /** Envía el correo con el enlace para restablecer la contraseña. */
  sendPasswordReset: (email: string) => Promise<string | null>;
  /**
   * Fija la nueva contraseña del usuario. En el cambio desde el perfil se pasa
   * `currentPassword` para verificar primero la contraseña actual (reautentica
   * contra Supabase). En el flujo de recuperación por correo no se pasa (la
   * sesión temporal del enlace ya acredita al usuario).
   */
  updatePassword: (password: string, currentPassword?: string) => Promise<string | null>;
  /** Cierra el modo recuperación (tras guardar o cancelar). */
  clearRecovery: () => void;
  /** Marca un tour como visto guardando su versión (persiste en profiles). */
  markTourSeen: (module: string, version?: number) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false,
  blockedMessage: null,
  deactivatedInfo: null,
  reactivateOwnAccount: async () => 'Auth no disponible',
  deactivateOwnAccount: async () => 'Auth no disponible',
  recoveryMode: false,
  signUp: async () => ({ error: 'Auth no disponible', needsConfirmation: false }),
  signIn: async () => ({ error: 'Auth no disponible', mfaRequired: false }),
  verifyMfa: async () => 'Auth no disponible',
  signInWithGoogle: async () => 'Auth no disponible',
  signOut: async () => {},
  updateProfile: async () => 'Auth no disponible',
  updateAvatar: async () => 'Auth no disponible',
  sendPasswordReset: async () => 'Auth no disponible',
  updatePassword: async () => 'Auth no disponible',
  clearRecovery: () => {},
  markTourSeen: () => {},
});

/** Hook para acceder al contexto de autenticación. */
export function useAuth() {
  return useContext(AuthContext);
}
