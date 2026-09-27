-- =============================================
-- Desactivación con origen + eliminación con anonimización de reportes
-- =============================================
-- Cambia el modelo de baja de cuentas:
--  1. profiles: columnas de desactivación (quién, cuándo, motivo).
--  2. simulation_reports: user_id pasa a NULL-able con ON DELETE SET NULL, para
--     conservar las simulaciones (anonimizadas) al eliminar al usuario.
--  3. account_deletions: bitácora SIN datos personales de las eliminaciones.
--  4. RLS: los reportes anonimizados (user_id NULL) NO se exponen a usuarios
--     comunes; solo cuentan para las estadísticas del administrador.
--
-- Todo es idempotente (IF NOT EXISTS / DROP-CREATE). Seguro de correr antes del
-- código. Orden interno: 1 -> 2 -> 3 -> 4.
-- =============================================


-- ─── 1. profiles: estado de desactivación con origen ───

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deactivated_by      text,        -- 'usuario' | 'administrador' | NULL (activa)
  ADD COLUMN IF NOT EXISTS deactivated_at      timestamptz,
  ADD COLUMN IF NOT EXISTS deactivation_reason text;        -- solo cuando la hace un administrador

COMMENT ON COLUMN public.profiles.deactivated_by IS
  'Origen de la desactivación: usuario (la hizo el propio dueño) o administrador. NULL si la cuenta está activa.';
COMMENT ON COLUMN public.profiles.deactivation_reason IS
  'Motivo de la desactivación cuando la realiza un administrador (Cuenta de prueba, Solicitud del usuario, Inactividad, Uso indebido, Otro).';


-- ─── 2. simulation_reports: conservar reportes anonimizados al borrar el usuario ───

-- user_id deja de ser obligatorio (un reporte anonimizado no tiene dueño).
ALTER TABLE public.simulation_reports
  ALTER COLUMN user_id DROP NOT NULL;

-- Reemplazar la FK con ON DELETE CASCADE por una con ON DELETE SET NULL.
-- (El nombre por defecto que da Postgres es <tabla>_<columna>_fkey.)
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'public.simulation_reports'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[
      (SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.simulation_reports'::regclass AND attname = 'user_id')
    ];
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.simulation_reports DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE public.simulation_reports
  ADD CONSTRAINT simulation_reports_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


-- ─── 3. account_deletions: bitácora SIN datos personales ───

CREATE TABLE IF NOT EXISTS public.account_deletions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_at               timestamptz NOT NULL DEFAULT now(),
  origin                   text NOT NULL,          -- 'usuario' | 'administrador'
  admin_id                 uuid,                   -- id del admin que la ejecutó (si aplica); NO es dato del eliminado
  reason                   text,                   -- motivo (si aplica)
  anonymized_reports_count int NOT NULL DEFAULT 0  -- cuántas simulaciones quedaron anonimizadas
  -- OJO: NO se guarda nombre, correo ni id del usuario eliminado.
);

COMMENT ON TABLE public.account_deletions IS
  'Bitácora de cuentas eliminadas SIN datos personales del eliminado (Ley 1581). Solo origen, admin ejecutor, motivo y nº de reportes anonimizados.';

ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

-- Solo los administradores pueden leer la bitácora.
DROP POLICY IF EXISTS "Admins read deletions" ON public.account_deletions;
CREATE POLICY "Admins read deletions" ON public.account_deletions FOR SELECT
  TO authenticated USING (public.current_user_role() = 'admin');
-- La escritura la hace el backend con la clave de servicio (bypassa RLS); no se
-- crea policy de INSERT para clientes.


-- ─── 4. RLS: los reportes anonimizados no se exponen a usuarios comunes ───

-- La policy de usuario compara auth.uid() = user_id; con user_id NULL esa
-- comparación es NULL (no TRUE), así que un usuario común NUNCA ve reportes
-- anonimizados. Se recrea explícitamente para dejarlo documentado y seguro.
DROP POLICY IF EXISTS "Users manage own reports" ON public.simulation_reports;
CREATE POLICY "Users manage own reports" ON public.simulation_reports FOR ALL
  TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

-- Los administradores siguen viendo todos los reportes (incluidos los
-- anonimizados) para las estadísticas. Se recrea por claridad.
DROP POLICY IF EXISTS "Admins read all reports" ON public.simulation_reports;
CREATE POLICY "Admins read all reports" ON public.simulation_reports FOR SELECT
  TO authenticated USING (public.current_user_role() = 'admin');
