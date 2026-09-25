-- =============================================
-- Eliminación de cuentas por el administrador (RF-05)
-- =============================================
-- Reemplaza el flujo de "activar/desactivar" por la eliminación real de la
-- cuenta. El administrador ya no desactiva: elimina de forma permanente.
--
-- La eliminación borra la fila de `profiles`, los reportes del usuario y su
-- registro en `auth.users`. Como `auth.users` vive en el esquema `auth` (no
-- accesible con la clave anon), se hace mediante una función SECURITY DEFINER
-- que valida que quien llama sea administrador.
-- =============================================

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo un administrador puede eliminar cuentas.
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede eliminar cuentas';
  END IF;

  -- Un administrador no puede eliminarse a sí mismo.
  IF target_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes eliminar tu propia cuenta';
  END IF;

  -- Borrar los reportes del usuario (por si no hay ON DELETE CASCADE).
  DELETE FROM public.simulation_reports WHERE user_id = target_id;

  -- Borrar el perfil.
  DELETE FROM public.profiles WHERE id = target_id;

  -- Borrar la cuenta de autenticación (esquema auth).
  DELETE FROM auth.users WHERE id = target_id;
END;
$$;

COMMENT ON FUNCTION public.admin_delete_user(uuid) IS
  'Elimina de forma permanente una cuenta (perfil, reportes y usuario de auth). Solo admins; no permite autoeliminarse.';

-- Permitir que los usuarios autenticados invoquen la función (la propia
-- función valida internamente que sean administradores).
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
