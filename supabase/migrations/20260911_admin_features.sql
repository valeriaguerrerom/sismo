-- =============================================
-- Funcionalidades administrativas (RF-05, RF-15, RF-22, RF-23, RF-25)
-- =============================================
-- 1. profiles: estado de cuenta (activa/inactiva) y último acceso.
-- 2. Policies de escritura para administradores sobre seismic_events,
--    quiz_questions, wave_facts y timeline_events.
-- 3. Policy de borrado de reportes para administradores.
-- =============================================

-- ─── 1. Perfiles: cuenta activa + último acceso (RF-05, RF-22) ───

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_last_login ON profiles(last_login DESC);

-- Función SECURITY DEFINER para que el cliente registre su último acceso
-- sin necesitar permisos de UPDATE sobre columnas sensibles.
CREATE OR REPLACE FUNCTION public.touch_last_login()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET last_login = now() WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.touch_last_login() FROM public;
GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;

-- ─── 2. Eventos sísmicos: escritura solo admin (RF-15, RF-16) ───

DROP POLICY IF EXISTS "Admins insert events" ON seismic_events;
DROP POLICY IF EXISTS "Admins update events" ON seismic_events;
DROP POLICY IF EXISTS "Admins delete events" ON seismic_events;

CREATE POLICY "Admins insert events" ON seismic_events FOR INSERT
  TO authenticated WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Admins update events" ON seismic_events FOR UPDATE
  TO authenticated USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Admins delete events" ON seismic_events FOR DELETE
  TO authenticated USING (public.current_user_role() = 'admin');

-- ─── 3. Contenido educativo: escritura solo admin (RF-25) ───

DROP POLICY IF EXISTS "Admins write quiz" ON quiz_questions;
DROP POLICY IF EXISTS "Admins write facts" ON wave_facts;
DROP POLICY IF EXISTS "Admins write timeline" ON timeline_events;

CREATE POLICY "Admins write quiz" ON quiz_questions FOR ALL
  TO authenticated USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Admins write facts" ON wave_facts FOR ALL
  TO authenticated USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Admins write timeline" ON timeline_events FOR ALL
  TO authenticated USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ─── 4. Reportes: los admins pueden eliminar cualquier reporte (RF-23) ───

DROP POLICY IF EXISTS "Admins delete any report" ON simulation_reports;

CREATE POLICY "Admins delete any report" ON simulation_reports FOR DELETE
  TO authenticated USING (public.current_user_role() = 'admin');
