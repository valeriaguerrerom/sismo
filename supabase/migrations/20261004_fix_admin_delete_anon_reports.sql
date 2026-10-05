-- Fix: los admins no podían borrar reportes anónimos (user_id = NULL).
--
-- La migración 20260920 recreó "Users manage own reports" con la condición
-- USING (user_id IS NOT NULL AND auth.uid() = user_id). Eso es correcto para
-- usuarios normales. Pero la policy de DELETE para admins ("Admins delete any
-- report", 20260911) NO fue recreada junto a ella, lo que deja a los reportes
-- anónimos sin cobertura por la policy de admin en DELETE.
--
-- Se recrea explícitamente para cubrir TODOS los reportes, incluidos los
-- anonimizados (user_id IS NULL).

DROP POLICY IF EXISTS "Admins delete any report" ON public.simulation_reports;
CREATE POLICY "Admins delete any report" ON public.simulation_reports FOR DELETE
  TO authenticated USING (public.current_user_role() = 'admin');
