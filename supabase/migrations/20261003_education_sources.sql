-- =============================================
-- Fuente y enlace en el contenido educativo (quiz y línea de tiempo)
-- =============================================
-- La sección Educación debe mostrar la FUENTE (y un enlace) de cada afirmación
-- científica. Estas columnas permiten que el administrador edite esa fuente y
-- que Educación la lea desde Supabase (con el contenido de educationContent.ts
-- solo como respaldo si la consulta falla).
--
-- Columnas nuevas (todas idempotentes):
--   quiz_questions.source      : cita textual de la fuente de la respuesta.
--   quiz_questions.source_url  : enlace a la fuente (opcional).
--   timeline_events.source     : cita textual de la fuente del evento.
--   timeline_events.source_url : enlace a la fuente (opcional).
--   timeline_events.event_date : fecha exacta (YYYY-MM-DD) si se conoce.
--   wave_facts.source          : fuente del dato (opcional).
--
-- No se marcan NOT NULL para no romper filas antiguas; la obligatoriedad de la
-- fuente se valida en el formulario del administrador (capa de aplicación).
-- =============================================

ALTER TABLE quiz_questions   ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE quiz_questions   ADD COLUMN IF NOT EXISTS source_url text;

ALTER TABLE timeline_events  ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE timeline_events  ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE timeline_events  ADD COLUMN IF NOT EXISTS event_date text;

ALTER TABLE wave_facts       ADD COLUMN IF NOT EXISTS source text;

COMMENT ON COLUMN quiz_questions.source  IS 'Cita de la fuente de la respuesta (obligatoria desde el panel de administración).';
COMMENT ON COLUMN timeline_events.source IS 'Cita de la fuente del evento (obligatoria desde el panel de administración).';
