-- =============================================
-- Mensajes de contacto del formulario "Escríbenos" (Acerca de)
-- =============================================
-- Tabla para los mensajes que cualquier visitante (con o sin sesión) envía
-- desde el formulario de la página "Acerca de".
--
-- RLS:
--   - INSERT: cualquiera (anon o authenticated) puede enviar un mensaje.
--   - SELECT / UPDATE: solo administradores (vía public.current_user_role()).
--   - DELETE: solo administradores.
--
-- Anti-spam: el honeypot y el límite de envíos por minuto se aplican en el
-- cliente (src/lib/feedback.ts). Aquí se validan longitudes y valores.
-- =============================================

CREATE TABLE IF NOT EXISTS public.feedback_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tipo de mensaje: sugerencia | error | datos | otro
  type       text NOT NULL DEFAULT 'otro'
             CHECK (type IN ('sugerencia', 'error', 'datos', 'otro')),
  -- Cuerpo del mensaje (obligatorio, máximo 1000 caracteres).
  message    text NOT NULL
             CHECK (char_length(message) BETWEEN 1 AND 1000),
  -- Correo opcional para responder (puede ser NULL si no lo dejó).
  email      text
             CHECK (email IS NULL OR char_length(email) <= 254),
  -- Usuario autenticado que lo envió (NULL si no había sesión).
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Estado de gestión: nuevo | leido | respondido
  status     text NOT NULL DEFAULT 'nuevo'
             CHECK (status IN ('nuevo', 'leido', 'respondido')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feedback_messages IS
  'Mensajes del formulario "Escríbenos" de la página Acerca de. Insert público; lectura y gestión solo admins.';

-- Índices para el panel de administración (orden por fecha, filtros).
CREATE INDEX IF NOT EXISTS feedback_messages_created_at_idx
  ON public.feedback_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_messages_status_idx
  ON public.feedback_messages (status);
CREATE INDEX IF NOT EXISTS feedback_messages_type_idx
  ON public.feedback_messages (type);

-- ── Row Level Security ──
ALTER TABLE public.feedback_messages ENABLE ROW LEVEL SECURITY;

-- INSERT: cualquiera puede enviar (anon y authenticated). El estado y la fecha
-- los fija el DEFAULT; el WITH CHECK impide que se cree ya "leido/respondido".
DROP POLICY IF EXISTS "Anyone can send feedback" ON public.feedback_messages;
CREATE POLICY "Anyone can send feedback" ON public.feedback_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'nuevo');

-- SELECT: solo administradores.
DROP POLICY IF EXISTS "Admins read feedback" ON public.feedback_messages;
CREATE POLICY "Admins read feedback" ON public.feedback_messages
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

-- UPDATE: solo administradores (cambiar estado nuevo/leido/respondido).
DROP POLICY IF EXISTS "Admins update feedback" ON public.feedback_messages;
CREATE POLICY "Admins update feedback" ON public.feedback_messages
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- DELETE: solo administradores.
DROP POLICY IF EXISTS "Admins delete feedback" ON public.feedback_messages;
CREATE POLICY "Admins delete feedback" ON public.feedback_messages
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');
