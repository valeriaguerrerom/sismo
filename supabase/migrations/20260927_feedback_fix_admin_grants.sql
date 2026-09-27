-- =============================================
-- Corrección: el administrador debe poder gestionar los mensajes
-- =============================================
-- La migración 20260926 revocó INSERT, UPDATE y DELETE sobre feedback_messages
-- a anon y authenticated para forzar que el envío pase por el backend. El
-- problema: revocar UPDATE/DELETE a nivel de TABLA también bloquea al
-- administrador (que es un usuario `authenticated`), porque el privilegio de
-- tabla se evalúa ANTES que las policies RLS. Resultado: el admin no podía
-- cambiar el estado ni eliminar mensajes desde el panel.
--
-- Este parche:
--   - Mantiene revocado solo el INSERT (el envío sigue siendo solo por backend).
--   - Devuelve SELECT, UPDATE y DELETE al rol `authenticated`, que quedan
--     acotados por las policies RLS de administrador (solo admin puede leer,
--     actualizar y borrar; definidas en 20260925).
-- =============================================

-- Reponer los privilegios de tabla que la gestión de admin necesita. La
-- restricción real la imponen las policies RLS (solo admin), no el GRANT.
GRANT SELECT, UPDATE, DELETE ON public.feedback_messages TO authenticated;

-- El INSERT sigue prohibido desde el cliente: solo el backend (service_role)
-- inserta. No se concede INSERT a anon ni a authenticated.
REVOKE INSERT ON public.feedback_messages FROM anon, authenticated;

-- Reafirmar las policies de administrador por si acaso (idempotente).
DROP POLICY IF EXISTS "Admins read feedback" ON public.feedback_messages;
CREATE POLICY "Admins read feedback" ON public.feedback_messages
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "Admins update feedback" ON public.feedback_messages;
CREATE POLICY "Admins update feedback" ON public.feedback_messages
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "Admins delete feedback" ON public.feedback_messages;
CREATE POLICY "Admins delete feedback" ON public.feedback_messages
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');
