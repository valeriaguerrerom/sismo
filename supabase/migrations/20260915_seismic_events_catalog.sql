-- =============================================
-- Ampliación de seismic_events para el catálogo completo (166 eventos)
-- =============================================
-- Adapta la tabla EXISTENTE (no crea una nueva) para alojar los metadatos
-- de los eventos reales que hoy viven en public/data/cm y public/data/galeras.
--
-- Columnas nuevas:
--   event_id         : id original del evento (texto), p.ej.
--                      'CM_M2.9_2026-06-05T16-56-38' o '0601040656GVA'.
--                      Es la clave para localizar el JSON de detalle.
--   volcanic_subtype : lp | to | tr | va para eventos del Galeras; NULL si no aplica.
--   region           : 'Colombia' | 'Ecuador' (CM) | 'Nariño (Galeras)' (volcánicos).
--   station_count    : nº de estaciones que registraron el evento.
--
-- magnitude y depth_km pasan a ser NULLABLE: los eventos volcánicos del Galeras
-- no traen magnitud ni profundidad, y los CM no traen profundidad de epicentro.
-- Se deja NULL donde no hay dato real (no se inventan valores).

ALTER TABLE seismic_events ADD COLUMN IF NOT EXISTS event_id text;
ALTER TABLE seismic_events ADD COLUMN IF NOT EXISTS volcanic_subtype text;
ALTER TABLE seismic_events ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE seismic_events ADD COLUMN IF NOT EXISTS station_count integer DEFAULT 0;

-- Hacer magnitude y depth_km nullables (venían NOT NULL).
ALTER TABLE seismic_events ALTER COLUMN magnitude DROP NOT NULL;
ALTER TABLE seismic_events ALTER COLUMN depth_km DROP NOT NULL;

-- event_id debe ser único para evitar duplicados al re-sembrar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_seismic_events_event_id ON seismic_events(event_id);
CREATE INDEX IF NOT EXISTS idx_seismic_events_region ON seismic_events(region);
