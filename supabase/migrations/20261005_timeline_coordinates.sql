-- =============================================
-- Coordenadas de los eventos de la línea de tiempo (capítulo Historia)
-- =============================================
-- El capítulo Historia del centro de aprendizaje muestra un mapa de Nariño con
-- los eventos de la línea de tiempo ubicados por sus coordenadas. Estas columnas
-- guardan la posición y una nota sobre su origen, para que Educación la lea desde
-- Supabase (con el contenido de educationContent.ts solo como respaldo).
--
-- Columnas nuevas (todas idempotentes):
--   timeline_events.lat           : latitud del epicentro o cráter (grados).
--   timeline_events.lon           : longitud del epicentro o cráter (grados).
--   timeline_events.location_note : origen de las coordenadas (p. ej.
--                                    "epicentro estimado (SISH, SGC)").
--
-- Las coordenadas de los sismos históricos provienen de la tabla 1 de Sarabia y
-- Cifuentes (2018), basada en el SISH del SGC; las de los eventos del Galeras
-- corresponden a su cráter (SGC). Los eventos sin coordenadas publicadas quedan
-- con lat/lon NULL y no se dibujan en el mapa.
-- =============================================

ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS lon double precision;
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS location_note text;

COMMENT ON COLUMN timeline_events.lat IS 'Latitud del epicentro/cráter (grados). NULL si no se ubica en el mapa.';
COMMENT ON COLUMN timeline_events.lon IS 'Longitud del epicentro/cráter (grados). NULL si no se ubica en el mapa.';
COMMENT ON COLUMN timeline_events.location_note IS 'Origen de las coordenadas (p. ej. epicentro estimado del SISH, SGC).';
