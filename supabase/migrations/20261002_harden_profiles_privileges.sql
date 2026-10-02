-- =============================================
-- Endurecimiento de privilegios en profiles (INSERT + UPDATE)
-- =============================================
-- Amplía la protección de 20260930 (que solo cubría el cambio de `role` en
-- UPDATE). Ahora un trigger BEFORE INSERT OR UPDATE protege TODAS las columnas
-- administrativas (role, active, deactivated_by, deactivated_at,
-- deactivation_reason) frente a un usuario normal, incluyendo la vía de
-- INSERT/upsert (la policy "Users insert own profile" permitía crear la fila
-- con cualquier role/active).
--
-- Actores y permisos:
--   * service_role (auth.uid() IS NULL): acceso total — es el backend/scripts.
--   * admin (current_user_role() = 'admin'): acceso total.
--   * usuario normal:
--       - INSERT: se FUERZAN role='user', active=true y las columnas de
--         desactivación a NULL (no puede autoasignarse privilegios al crear).
--       - UPDATE: no puede cambiar `role`, ni `deactivated_by`/`deactivated_at`/
--         `deactivation_reason`, ni reactivarse si lo desactivó un ADMIN.
--         Sí puede autodesactivarse (active true->false) y reactivarse SOLO si
--         él mismo se había desactivado (OLD.deactivated_by = 'usuario').
--
-- current_user_role() ya es SECURITY DEFINER + SET search_path = public
-- (ver 20260902); aquí la nueva función también fija search_path.
--
-- Idempotente. Reemplaza el trigger de 20260930 por uno más completo.
-- =============================================

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_service boolean := auth.uid() IS NULL;           -- conexión service_role (sin usuario)
  is_admin   boolean := public.current_user_role() = 'admin';
BEGIN
  -- El backend (service_role) y los administradores no tienen restricciones.
  IF is_service OR is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Un usuario normal no puede nacer con privilegios ni desactivado por nadie.
    NEW.role                := 'user';
    NEW.active              := true;
    NEW.deactivated_by      := NULL;
    NEW.deactivated_at      := NULL;
    NEW.deactivation_reason := NULL;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE' para un usuario normal sobre su propia fila.

  -- 1) El rol nunca cambia por un no-admin.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'No autorizado: solo un administrador puede cambiar el rol de una cuenta.'
      USING ERRCODE = '42501';
  END IF;

  -- 2) deactivated_by solo puede quedar NULL (reactivación propia) o 'usuario'
  --    (autodesactivación). Nunca 'administrador' puesto por el propio usuario.
  IF NEW.deactivated_by IS DISTINCT FROM OLD.deactivated_by
     AND NEW.deactivated_by IS NOT NULL
     AND NEW.deactivated_by <> 'usuario' THEN
    RAISE EXCEPTION 'No autorizado: no puedes modificar el origen de la desactivación.'
      USING ERRCODE = '42501';
  END IF;

  -- 3) El motivo de desactivación (lo pone el admin) no lo cambia un usuario.
  IF NEW.deactivation_reason IS DISTINCT FROM OLD.deactivation_reason THEN
    RAISE EXCEPTION 'No autorizado: no puedes modificar el motivo de la desactivación.'
      USING ERRCODE = '42501';
  END IF;

  -- 4) Reactivación: pasar de inactivo a activo SOLO si la cuenta la había
  --    desactivado el PROPIO usuario. Si la desactivó un administrador, no
  --    puede reactivarse por su cuenta.
  IF OLD.active = false AND NEW.active = true
     AND COALESCE(OLD.deactivated_by, '') <> 'usuario' THEN
    RAISE EXCEPTION 'Tu cuenta fue desactivada por un administrador; no puedes reactivarla.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_profile_privilege_escalation() IS
  'Impide que un usuario normal se autoasigne role/active/deactivated_by (en INSERT o UPDATE). service_role y admin sin restricción. Autodesactivación y reactivación propia permitidas.';

-- Reemplaza el trigger anterior (solo-rol, solo-UPDATE) por el completo.
DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON public.profiles;
DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- La función antigua queda obsoleta; se elimina si ya no la usa ningún trigger.
DROP FUNCTION IF EXISTS public.prevent_role_self_escalation();
