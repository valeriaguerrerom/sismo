-- =============================================
-- Autorización de datos personales (Ley 1581 de 2012)
-- =============================================
-- Guarda la fecha/hora en que el usuario aceptó el tratamiento de sus datos
-- personales (casilla obligatoria del registro y de "Completa tu perfil").
-- NULL = aún no ha aceptado (cuentas antiguas anteriores a esta política).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS data_authorization_at timestamptz;

COMMENT ON COLUMN profiles.data_authorization_at IS
  'Fecha de autorización del tratamiento de datos personales (Ley 1581 de 2012).';

-- El trigger de creación de perfil copia la fecha desde los metadatos del
-- registro (raw_user_meta_data->>''data_authorization_at'').
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, role, institution, occupation, research_area,
    city, country, usage_purpose, data_authorization_at
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
    COALESCE(NEW.raw_user_meta_data->>'usage_purpose', ''),
    (NULLIF(NEW.raw_user_meta_data->>'data_authorization_at', ''))::timestamptz
  )
  ON CONFLICT (id) DO UPDATE SET
    institution           = COALESCE(NULLIF(EXCLUDED.institution, ''), profiles.institution),
    occupation            = COALESCE(NULLIF(EXCLUDED.occupation, ''), profiles.occupation),
    research_area         = COALESCE(NULLIF(EXCLUDED.research_area, ''), profiles.research_area),
    city                  = COALESCE(NULLIF(EXCLUDED.city, ''), profiles.city),
    country               = COALESCE(NULLIF(EXCLUDED.country, ''), profiles.country),
    usage_purpose         = COALESCE(NULLIF(EXCLUDED.usage_purpose, ''), profiles.usage_purpose),
    data_authorization_at = COALESCE(profiles.data_authorization_at, EXCLUDED.data_authorization_at);
  RETURN NEW;
END;
$$;
