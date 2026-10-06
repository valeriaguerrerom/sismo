-- =============================================
-- Respuesta del administrador a los mensajes de contacto
-- =============================================
-- Agrega las columnas necesarias para que un administrador responda, desde el
-- panel, un mensaje del formulario "Escríbenos". La respuesta se envía por
-- correo al remitente (vía Resend, desde el backend) y se guarda aquí para
-- dejar constancia de qué se respondió, cuándo y quién.
--
-- Idempotente: puede ejecutarse varias veces sin error (ADD COLUMN IF NOT EXISTS).
-- =============================================

ALTER TABLE public.feedback_messages
  ADD COLUMN IF NOT EXISTS admin_reply  text,         -- cuerpo de la respuesta enviada
  ADD COLUMN IF NOT EXISTS replied_at   timestamptz,  -- cuándo se respondió
  ADD COLUMN IF NOT EXISTS replied_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL; -- admin que respondió

COMMENT ON COLUMN public.feedback_messages.admin_reply IS
  'Cuerpo de la respuesta que el administrador envió por correo al remitente.';
COMMENT ON COLUMN public.feedback_messages.replied_at IS
  'Fecha y hora en que se envió la respuesta por correo.';
COMMENT ON COLUMN public.feedback_messages.replied_by IS
  'Administrador (auth.users) que redactó y envió la respuesta.';

-- Índice para listar rápidamente lo ya respondido (opcional, barato).
CREATE INDEX IF NOT EXISTS feedback_messages_replied_at_idx
  ON public.feedback_messages (replied_at DESC)
  WHERE replied_at IS NOT NULL;
