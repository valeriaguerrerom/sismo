-- =============================================
-- Endurecimiento de privilegios en profiles (INSERT + UPDATE)
-- =============================================
-- Amplía la protección de 20260930 (que solo cubría el cambio de `role` en
-- UPDATE). Un trigger BEFORE INSERT OR UPDATE protege TODAS las columnas
-- administrativas frente a un usuario normal, incluyendo la vía de
-- INSERT/upsert, y cierra el ataque de reactivación "en dos pasos".
--
-- Actores:
--   * service_role (auth.uid() IS NULL): acceso total — backend/scripts.
--   * admin (current_user_role() = 'admin'): acceso total.
--   * usuario normal:
--       - INSERT: se FUERZAN role='user', active=true y las columnas de
--         desactivación a NULL (no puede autoasignarse privilegios al crear).
--       - UPDATE: `role` NUNCA cambia. Las columnas active/deactivated_by/
--         deactivated_at/deactivation_reason solo pueden cambiar en DOS
--         transiciones EXACTAS, resueltas en la MISMA sentencia:
--           (a) AUTODESACTIVACIÓN:
--               OLD.active=true  -> NEW.active=false
--               NEW.deactivated_by='usuario', NEW.deactivation_reason IS NULL
--           (b) REACTIVACIÓN PROPIA:
--               OLD.active=false AND OLD.deactivated_by='usuario'
--               -> NEW.active=true, NEW.deactivated_by IS NULL,
--                  NEW.deactivated_at IS NULL, NEW.deactivation_reason IS NULL
--         Cualquier otro cambio de esas columnas se rechaza. Así, un usuario
--         desactivado por un ADMIN (OLD.deactivated_by='administrador') no puede
--         "firmar" la baja como propia (paso 1) para luego reactivarse (paso 2):
--         ese paso 1 ya no es ninguna de las dos transiciones y se rechaza.
--
-- current_user_role() es SECURITY DEFINER + SET search_path = public (20260902);
-- esta función también fija search_path. Idempotente.
-- =============================================

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_service boolean := auth.uid() IS NULL;            -- conexión service_role
  is_admin   boolean := public.current_user_role() = 'admin';
  deact_cols_changed boolean;
  is_self_deactivation boolean;
  is_self_reactivation boolean;
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

  -- ── TG_OP = 'UPDATE' para un usuario normal sobre su propia fila ──

  -- 1) El rol nunca cambia por un no-admin.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'No autorizado: solo un administrador puede cambiar el rol de una cuenta.'
      USING ERRCODE = '42501';
  END IF;

  -- 2) ¿Cambió alguna columna de estado de cuenta?
  deact_cols_changed := (
       NEW.active              IS DISTINCT FROM OLD.active
    OR NEW.deactivated_by      IS DISTINCT FROM OLD.deactivated_by
    OR NEW.deactivated_at      IS DISTINCT FROM OLD.deactivated_at
    OR NEW.deactivation_reason IS DISTINCT FROM OLD.deactivation_reason
  );

  -- Si no cambió ninguna, es una edición de perfil normal: permitida.
  IF NOT deact_cols_changed THEN
    RETURN NEW;
  END IF;

  -- Transición (a): AUTODESACTIVACIÓN completa en una sola sentencia.
  is_self_deactivation := (
        OLD.active = true
    AND NEW.active = false
    AND NEW.deactivated_by = 'usuario'
    AND NEW.deactivation_reason IS NULL
  );

  -- Transición (b): REACTIVACIÓN PROPIA completa (solo si la baja fue del propio
  -- usuario). deactivated_at debe quedar NULL para no arrastrar marca previa.
  is_self_reactivation := (
        OLD.active = false
    AND COALESCE(OLD.deactivated_by, '') = 'usuario'
    AND NEW.active = true
    AND NEW.deactivated_by IS NULL
    AND NEW.deactivated_at IS NULL
    AND NEW.deactivation_reason IS NULL
  );

  IF is_self_deactivation OR is_self_reactivation THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'No autorizado: cambio no permitido del estado de la cuenta.'
    USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.prevent_profile_privilege_escalation() IS
  'Impide que un usuario normal se autoasigne role o manipule el estado de cuenta (active/deactivated_by/deactivated_at/deactivation_reason). Solo permite autodesactivación y reactivación propia como transiciones exactas en una sola sentencia. service_role y admin sin restricción.';

-- Reemplaza el trigger anterior (solo-rol, solo-UPDATE) por el completo.
DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON public.profiles;
DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- La función antigua queda obsoleta; se elimina si ya no la usa ningún trigger.
DROP FUNCTION IF EXISTS public.prevent_role_self_escalation();
