-- =============================================
-- feedback_messages: la escritura pasa SOLO por el backend
-- =============================================
-- Endurece la seguridad del formulario "Escríbenos": el INSERT ya NO se hace
-- desde el navegador con la clave anon/authenticated, sino a través del
-- endpoint POST /api/feedback del backend FastAPI, que valida el contenido,
-- aplica límite de envíos por IP y toma el id del usuario del token.
--
-- El backend inserta con la clave de servicio (service_role), que salta las
-- RLS. Por eso aquí se ELIMINA la policy de INSERT público: ningún cliente
-- anon o authenticated puede escribir directamente en la tabla.
--
-- Se conservan las policies de solo administrador para leer, actualizar y
-- borrar (definidas en 20260925_feedback_messages.sql).
--
-- Requiere haber aplicado antes 20260925_feedback_messages.sql.
-- =============================================

-- Quitar el INSERT público: nadie inserta desde el cliente.
DROP POLICY IF EXISTS "Anyone can send feedback" ON public.feedback_messages;

-- (Defensa en profundidad) Garantizar que anon y authenticated no tengan
-- privilegios de escritura a nivel de tabla; la lectura/gestión sigue mediada
-- por las policies de administrador.
REVOKE INSERT, UPDATE, DELETE ON public.feedback_messages FROM anon, authenticated;

-- Nota: las policies de administrador (SELECT/UPDATE/DELETE) y el RLS habilitado
-- permanecen tal como los dejó la migración 20260925. El service_role del
-- backend no está sujeto a RLS, así que puede insertar sin una policy explícita.
