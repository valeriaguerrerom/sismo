-- =============================================
-- Foto de perfil del investigador (columna avatar)
-- =============================================
-- Añade una columna de texto `avatar` a `profiles` para guardar la foto de
-- perfil como data URL (JPEG redimensionado a ~128 px por el cliente). Se usa
-- texto en lugar de Supabase Storage para no depender de buckets ni políticas
-- de almacenamiento: la imagen es pequeña (unos pocos KB) y viaja en la misma
-- fila del perfil.
--
-- No requiere nuevas policies: el usuario ya puede actualizar su propia fila
-- (RLS de profiles) y el trigger de endurecimiento (20261002) solo protege las
-- columnas administrativas (role, active, deactivated_*), no `avatar`.
-- Idempotente.
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar text;

COMMENT ON COLUMN public.profiles.avatar IS
  'Foto de perfil como data URL (JPEG ~128 px) o NULL. La redimensiona el cliente antes de guardarla; no usa Supabase Storage.';
