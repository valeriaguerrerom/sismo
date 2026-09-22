-- =============================================
-- FIX: Recursión circular en RLS de profiles
-- =============================================
-- Las policies "Admins read all profiles" / "Admins update any profile"
-- consultaban la tabla profiles DENTRO de una policy sobre profiles,
-- lo que provoca recursión infinita (error 42P17).
--
-- Solución: mover el chequeo de rol a una función SECURITY DEFINER que
-- lee la tabla sin volver a evaluar las policies RLS.
-- =============================================

-- Función que devuelve el rol del usuario actual sin disparar RLS.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM public;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- Eliminar policies recursivas anteriores.
DROP POLICY IF EXISTS "Admins read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins update any profile" ON profiles;
DROP POLICY IF EXISTS "Admins read all reports" ON simulation_reports;

-- Recrear policies de admin usando la función (sin recursión).
CREATE POLICY "Admins read all profiles" ON profiles FOR SELECT
  TO authenticated USING (public.current_user_role() = 'admin');

CREATE POLICY "Admins update any profile" ON profiles FOR UPDATE
  TO authenticated USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Admins read all reports" ON simulation_reports FOR SELECT
  TO authenticated USING (public.current_user_role() = 'admin');

-- =============================================
-- Asegurar que el trigger de creación de perfil también cubre
-- los usuarios que entran vía OAuth (Google), donde el nombre viene
-- en 'name' o 'full_name' dentro de raw_user_meta_data.
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    ),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
