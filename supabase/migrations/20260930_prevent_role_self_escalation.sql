-- =============================================
-- Seguridad: impedir que un usuario se auto-promueva a administrador.
-- =============================================
-- La policy "Users update own profile" permite al usuario actualizar su propia
-- fila (auth.uid() = id), PERO no restringía columnas. Como el rol vive en
-- profiles.role y current_user_role() lo lee para autorizar al admin, un usuario
-- podía ejecutar  UPDATE profiles SET role='admin' WHERE id = auth.uid()  y
-- escalar privilegios (vulnerabilidad crítica de control de acceso).
--
-- Solución: un trigger BEFORE UPDATE que RECHAZA cualquier cambio de `role`
-- hecho por quien no es administrador. El cambio de rol legítimo lo hace el
-- panel de administración (el admin pasa current_user_role() = 'admin').
--
-- No afecta otros flujos: ningún flujo de usuario cambia su propio rol; la
-- autodesactivación/reactivación (active, deactivated_by) sigue permitida.
-- =============================================

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo importa cuando el rol REALMENTE cambia.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Si quien hace el cambio no es administrador, se rechaza.
    IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'No autorizado: solo un administrador puede cambiar el rol de una cuenta.'
        USING ERRCODE = '42501';  -- insufficient_privilege
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_escalation();

COMMENT ON FUNCTION public.prevent_role_self_escalation() IS
  'Impide que un usuario no administrador cambie profiles.role (evita auto-promoción a admin). El cambio legítimo lo hace el panel de admin.';
