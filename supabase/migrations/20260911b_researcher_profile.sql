-- =============================================
-- Perfil de investigador (RF-01): datos relevantes capturados en el registro
-- =============================================
-- Los roles siguen siendo 'user' (Investigador) y 'admin' (Administrador).
-- El registro público crea siempre un investigador; solo un admin puede
-- promover a otro investigador desde el panel de administración.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS occupation text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS research_area text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country text DEFAULT 'Colombia';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS usage_purpose text DEFAULT '';

-- El trigger de creación de perfil copia los metadatos del registro.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, role, institution, occupation, research_area, city, country, usage_purpose
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    'user',
    COALESCE(NEW.raw_user_meta_data->>'institution', ''),
    COALESCE(NEW.raw_user_meta_data->>'occupation', ''),
    COALESCE(NEW.raw_user_meta_data->>'research_area', ''),
    COALESCE(NEW.raw_user_meta_data->>'city', ''),
    COALESCE(NEW.raw_user_meta_data->>'country', 'Colombia'),
    COALESCE(NEW.raw_user_meta_data->>'usage_purpose', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    institution   = COALESCE(NULLIF(EXCLUDED.institution, ''), profiles.institution),
    occupation    = COALESCE(NULLIF(EXCLUDED.occupation, ''), profiles.occupation),
    research_area = COALESCE(NULLIF(EXCLUDED.research_area, ''), profiles.research_area),
    city          = COALESCE(NULLIF(EXCLUDED.city, ''), profiles.city),
    country       = COALESCE(NULLIF(EXCLUDED.country, ''), profiles.country),
    usage_purpose = COALESCE(NULLIF(EXCLUDED.usage_purpose, ''), profiles.usage_purpose);
  RETURN NEW;
END;
$$;
