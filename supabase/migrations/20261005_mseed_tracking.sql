-- Migración: Sistema de tracking de cargas MiniSEED + asociación de eventos con datos reales
-- Fecha: 2026-10-05
-- Descripción: Permite rastrear todas las cargas de usuarios y asociar eventos del catálogo con archivos MiniSEED

-- NOTA: Esta migración es idempotente - puede ejecutarse múltiples veces sin errores
-- Las funciones usan CREATE OR REPLACE, las policies se eliminan antes de crear

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Tabla de logs de cargas MiniSEED (tracking completo de uso)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mseed_upload_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Información del archivo
  filename TEXT NOT NULL,
  file_size_bytes INTEGER,
  
  -- Resultado de la carga
  success BOOLEAN NOT NULL,
  error_reason TEXT, -- NULL si success=true, descripción del error si false
  
  -- Metadatos extraídos (solo si success=true)
  station_count INTEGER, -- Número de estaciones encontradas
  selected_station TEXT, -- Estación triaxial seleccionada (ej: "CUFP")
  channels TEXT[], -- Canales detectados (ej: ["HHE", "HHN", "HHZ"])
  duration_seconds NUMERIC(8,2), -- Duración del registro en segundos
  sample_rate_hz NUMERIC(10,2), -- Frecuencia de muestreo original
  start_time TIMESTAMPTZ, -- Tiempo de inicio del registro sísmico
  end_time TIMESTAMPTZ, -- Tiempo de fin del registro sísmico
  
  -- Procesamiento aplicado
  detrend_applied BOOLEAN DEFAULT false,
  bandpass_applied BOOLEAN DEFAULT false,
  bandpass_freq_min_hz NUMERIC(6,2),
  bandpass_freq_max_hz NUMERIC(6,2),
  decimation_factor INTEGER, -- Factor de submuestreo aplicado
  final_sample_count INTEGER, -- Puntos finales después de decimación
  
  -- Metadata temporal
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_time_ms INTEGER -- Tiempo de procesamiento en milisegundos
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_mseed_logs_user ON mseed_upload_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_mseed_logs_success ON mseed_upload_logs(success);
CREATE INDEX IF NOT EXISTS idx_mseed_logs_uploaded_at ON mseed_upload_logs(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_mseed_logs_station ON mseed_upload_logs(selected_station) WHERE selected_station IS NOT NULL;

-- RLS: usuarios pueden ver solo sus propios logs, admins ven todos
ALTER TABLE mseed_upload_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own upload logs" ON mseed_upload_logs;
CREATE POLICY "Users can view own upload logs"
  ON mseed_upload_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all upload logs" ON mseed_upload_logs;
CREATE POLICY "Admins can view all upload logs"
  ON mseed_upload_logs FOR SELECT
  USING (public.current_user_role() = 'admin');

-- El backend inserta logs (requiere service role key, no RLS policy aquí)

COMMENT ON TABLE mseed_upload_logs IS 'Registro completo de todas las cargas MiniSEED de usuarios para análisis y debugging';
COMMENT ON COLUMN mseed_upload_logs.error_reason IS 'Razón del fallo: "no_triaxial_station", "invalid_format", "file_too_large", "processing_error", etc.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Extender seismic_events para asociar datos reales MiniSEED
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE seismic_events
  ADD COLUMN IF NOT EXISTS mseed_data_source TEXT CHECK (mseed_data_source IN ('galeras', 'cm', 'user', NULL)),
  ADD COLUMN IF NOT EXISTS mseed_file_path TEXT, -- Ruta relativa desde public/ (ej: "data/galeras/0602081159GVA.json")
  ADD COLUMN IF NOT EXISTS mseed_station TEXT, -- Estación de los datos reales (ej: "CUFP")
  ADD COLUMN IF NOT EXISTS mseed_available BOOLEAN DEFAULT false; -- Flag rápido para saber si hay datos sin JOIN

-- Índice para búsquedas rápidas de eventos con datos reales
CREATE INDEX IF NOT EXISTS idx_events_mseed_available ON seismic_events(mseed_available) WHERE mseed_available = true;

COMMENT ON COLUMN seismic_events.mseed_data_source IS 'Fuente de datos reales: galeras (Volcán Galeras 2006), cm (Red CM Colombia/Ecuador), user (subido por investigador), NULL (solo catálogo)';
COMMENT ON COLUMN seismic_events.mseed_file_path IS 'Ruta JSON procesado con waveData (relativa a public/), ej: data/galeras/0602081159GVA.json';
COMMENT ON COLUMN seismic_events.mseed_station IS 'Código de estación de los datos reales (ej: CUFP para Galeras, varias para CM)';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Poblar eventos existentes del Galeras con sus datos reales
-- ═══════════════════════════════════════════════════════════════════════════════

-- Los 10 eventos volcánicos del Galeras 2006 que ya están en el catálogo
-- y tienen datos reales en public/data/galeras/
-- Identificamos por fecha + tipo + región

UPDATE seismic_events
SET 
  mseed_data_source = 'galeras',
  mseed_file_path = 'data/galeras/' || 
    CASE 
      -- Mapeo de fechas conocidas a IDs de archivo
      WHEN event_date = '2006-02-08' AND event_time = '11:59:00' THEN '0602081159GVA'
      WHEN event_date = '2006-02-09' AND event_time = '01:00:00' THEN '0602090100GVA'
      WHEN event_date = '2006-02-15' AND event_time = '16:06:00' THEN '0602151606GVA'
      WHEN event_date = '2006-03-03' AND event_time = '13:47:00' THEN '0603031347GVA'
      WHEN event_date = '2006-03-04' AND event_time = '07:38:00' THEN '0603040738GVA'
      WHEN event_date = '2006-03-11' AND event_time = '04:27:00' THEN '0603110427GVA'
      WHEN event_date = '2006-03-15' AND event_time = '20:13:00' THEN '0603152013GVA'
      WHEN event_date = '2006-03-21' AND event_time = '12:02:00' THEN '0603211202GVA'
      WHEN event_date = '2006-03-22' AND event_time = '09:05:00' THEN '0603220905GVA'
      WHEN event_date = '2006-03-24' AND event_time = '11:40:00' THEN '0603241140GVA'
    END || '.json',
  mseed_station = 'CUFP', -- Estación CUFP para todos los eventos del Galeras
  mseed_available = true
WHERE 
  event_type = 'volcanic' 
  AND region = 'Galeras'
  AND event_date >= '2006-02-08'
  AND event_date <= '2006-03-24';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Vista materializada para estadísticas rápidas de cargas (para panel admin)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE MATERIALIZED VIEW IF NOT EXISTS mseed_upload_stats AS
SELECT
  DATE_TRUNC('day', uploaded_at) AS upload_date,
  COUNT(*) AS total_uploads,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) AS successful_uploads,
  SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) AS failed_uploads,
  ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*), 2) AS success_rate_pct,
  COUNT(DISTINCT user_id) AS unique_users,
  AVG(CASE WHEN success THEN processing_time_ms END)::INTEGER AS avg_processing_time_ms,
  SUM(CASE WHEN success THEN file_size_bytes ELSE 0 END)::BIGINT AS total_bytes_processed
FROM mseed_upload_logs
GROUP BY DATE_TRUNC('day', uploaded_at)
ORDER BY upload_date DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mseed_stats_date ON mseed_upload_stats(upload_date);

-- Función para refrescar las estadísticas (se puede llamar desde un cron job)
CREATE OR REPLACE FUNCTION refresh_mseed_upload_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mseed_upload_stats;
END;
$$;

COMMENT ON MATERIALIZED VIEW mseed_upload_stats IS 'Estadísticas agregadas de cargas MiniSEED por día (para dashboards rápidos)';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Función para obtener top usuarios por cargas exitosas (panel admin)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_top_mseed_uploaders(limit_count INTEGER DEFAULT 10)
RETURNS TABLE(
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  total_uploads BIGINT,
  successful_uploads BIGINT,
  failed_uploads BIGINT,
  success_rate_pct NUMERIC,
  total_duration_hours NUMERIC,
  last_upload TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    l.user_id,
    p.email AS user_email,
    p.full_name AS user_name,
    COUNT(*) AS total_uploads,
    SUM(CASE WHEN l.success THEN 1 ELSE 0 END) AS successful_uploads,
    SUM(CASE WHEN NOT l.success THEN 1 ELSE 0 END) AS failed_uploads,
    ROUND(100.0 * SUM(CASE WHEN l.success THEN 1 ELSE 0 END) / COUNT(*), 2) AS success_rate_pct,
    ROUND(SUM(CASE WHEN l.success THEN l.duration_seconds ELSE 0 END) / 3600.0, 2) AS total_duration_hours,
    MAX(l.uploaded_at) AS last_upload
  FROM mseed_upload_logs l
  LEFT JOIN profiles p ON p.id = l.user_id
  GROUP BY l.user_id, p.email, p.full_name
  ORDER BY successful_uploads DESC
  LIMIT limit_count;
$$;

COMMENT ON FUNCTION get_top_mseed_uploaders IS 'Top N usuarios por cargas MiniSEED exitosas (para panel admin)';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Función para obtener razones de fallo más comunes (panel admin)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_mseed_failure_reasons(limit_count INTEGER DEFAULT 20)
RETURNS TABLE(
  error_reason TEXT,
  failure_count BIGINT,
  percentage NUMERIC,
  example_filename TEXT,
  last_occurrence TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH total AS (
    SELECT COUNT(*) AS total_failures 
    FROM mseed_upload_logs 
    WHERE success = false
  )
  SELECT 
    l.error_reason,
    COUNT(*) AS failure_count,
    ROUND(100.0 * COUNT(*) / t.total_failures, 2) AS percentage,
    (ARRAY_AGG(l.filename ORDER BY l.uploaded_at DESC))[1] AS example_filename,
    MAX(l.uploaded_at) AS last_occurrence
  FROM mseed_upload_logs l, total t
  WHERE l.success = false
  GROUP BY l.error_reason, t.total_failures
  ORDER BY failure_count DESC
  LIMIT limit_count;
$$;

COMMENT ON FUNCTION get_mseed_failure_reasons IS 'Razones de fallo más frecuentes en cargas MiniSEED (para debugging)';
