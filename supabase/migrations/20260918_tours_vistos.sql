-- =============================================
-- Tours guiados: registro de qué tours ya vio cada usuario
-- =============================================
-- Columna JSONB `tours_vistos`: mapa { "<modulo>": true } por usuario.
-- Ej.: {"simulacion": true}. El tour de un módulo se lanza solo la primera vez
-- que el usuario entra a ese módulo; al omitirlo o terminarlo se marca visto.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tours_vistos jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN profiles.tours_vistos IS
  'Tours guiados ya vistos por el usuario, mapa { modulo: true }. Ej: {"simulacion": true}.';
