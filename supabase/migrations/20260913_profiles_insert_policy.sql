-- =============================================
-- FIX: falta la policy de INSERT en profiles
-- =============================================
-- La tabla profiles tiene RLS habilitado con policies de SELECT y UPDATE,
-- pero NINGUNA de INSERT. Por eso cualquier `upsert` (INSERT ... ON CONFLICT)
-- desde el cliente era rechazado por RLS (error 42501: "new row violates
-- row-level security policy for table profiles").
--
-- El flujo normal usa UPDATE (la fila la crea el trigger handle_new_user),
-- pero añadimos la policy de INSERT para que el propio usuario pueda crear
-- su fila si el trigger no la creó (cuentas antiguas, OAuth, etc.), sin que
-- la operación quede bloqueada.
-- =============================================

DROP POLICY IF EXISTS "Users insert own profile" ON profiles;

CREATE POLICY "Users insert own profile" ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
