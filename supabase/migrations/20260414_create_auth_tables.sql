-- =============================================
-- TABLA: profiles
-- Perfil de usuario con rol
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  institution text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users read own profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- Users can update their own profile (but not role)
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can read all profiles
CREATE POLICY "Admins read all profiles" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can update any profile
CREATE POLICY "Admins update any profile" ON profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- TABLA: simulation_reports
-- Reportes de simulaciones guardados por usuarios
-- =============================================
CREATE TABLE IF NOT EXISTS simulation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Simulación sin título',
  params jsonb NOT NULL, -- SimulationParams completos
  results jsonb NOT NULL, -- métricas: maxAmplitude, pArrival, sArrival, etc.
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE simulation_reports ENABLE ROW LEVEL SECURITY;

-- Users can CRUD their own reports
CREATE POLICY "Users manage own reports" ON simulation_reports FOR ALL
  TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all reports
CREATE POLICY "Admins read all reports" ON simulation_reports FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX idx_reports_user ON simulation_reports(user_id);
CREATE INDEX idx_reports_date ON simulation_reports(created_at DESC);

-- =============================================
-- Crear primer admin (cámbialo después del registro)
-- Ejecuta esto DESPUÉS de registrar tu cuenta admin:
-- UPDATE profiles SET role = 'admin' WHERE email = 'tu-email@ejemplo.com';
-- =============================================
