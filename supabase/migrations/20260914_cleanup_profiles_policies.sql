-- =============================================
-- LIMPIEZA de policies de la tabla profiles
-- =============================================
-- La tabla acumuló 9 policies (varias creadas a mano en el panel de Supabase,
-- no versionadas), con duplicados y una lectura PÚBLICA que expone datos
-- personales de los investigadores (nombre, institución, ciudad, ocupación)
-- a cualquiera sin sesión.
--
-- Esta migración deja un set MÍNIMO, coherente y seguro:
--   SELECT  -> el usuario lee su propio perfil; los admins leen todos.
--   INSERT  -> el usuario crea su propia fila; el trigger la crea en el registro.
--   UPDATE  -> el usuario edita su propio perfil; los admins editan cualquiera.
--
-- No hay lectura anónima: la plataforma es de acceso restringido.
-- Idempotente: se puede re-ejecutar sin error.
-- =============================================

-- ── Eliminar TODAS las policies previas de profiles (duplicados incluidos) ──
DROP POLICY IF EXISTS "Allow insert for trigger"     ON profiles;
DROP POLICY IF EXISTS "Allow profile creation"       ON profiles;
DROP POLICY IF EXISTS "Users insert own profile"     ON profiles;
DROP POLICY IF EXISTS "Anyone can read profiles"     ON profiles;
DROP POLICY IF EXISTS "Authenticated read profiles"  ON profiles;
DROP POLICY IF EXISTS "Admins read all profiles"     ON profiles;
DROP POLICY IF EXISTS "Users read own profile"       ON profiles;
DROP POLICY IF EXISTS "Users update own"             ON profiles;
DROP POLICY IF EXISTS "Users update own profile"     ON profiles;
DROP POLICY IF EXISTS "Admins update any profile"    ON profiles;

-- ── SELECT ──
-- El usuario lee su propio perfil.
CREATE POLICY "Users read own profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- Los administradores leen todos los perfiles (sin recursión, vía función).
CREATE POLICY "Admins read all profiles" ON profiles FOR SELECT
  TO authenticated USING (public.current_user_role() = 'admin');

-- ── INSERT ──
-- El usuario puede crear su propia fila (respaldo si el trigger no la creó).
-- El trigger handle_new_user corre como SECURITY DEFINER, así que no depende
-- de esta policy para insertar en el registro.
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- ── UPDATE ──
-- El usuario edita su propio perfil.
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Los administradores editan cualquier perfil (cambiar rol, activar/desactivar).
CREATE POLICY "Admins update any profile" ON profiles FOR UPDATE
  TO authenticated USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');
