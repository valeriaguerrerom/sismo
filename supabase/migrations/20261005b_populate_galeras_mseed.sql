-- ============================================================================
-- Población de datos MiniSEED para eventos del Galeras 2006
-- ============================================================================
-- Este script marca los eventos que tienen datos reales MiniSEED procesados
-- y configura sus rutas de archivo. Solo aplica a eventos que ya existen en
-- seismic_events.
--
-- IMPORTANTE: Ejecutar DESPUÉS de 20261005_mseed_tracking.sql
-- ============================================================================

-- Eventos del Galeras 2006 con datos reales de la estación CUFP
-- Los archivos JSON están en public/data/galeras/{id}.json

-- Ejemplo: Actualizar UN evento específico del Galeras
-- (Reemplaza 'EVENT_UUID_AQUI' con el UUID real del evento en tu tabla)
/*
UPDATE seismic_events
SET 
  mseed_available = true,
  mseed_file_path = 'data/galeras/0602011028GVA.json',
  mseed_station = 'CUFP',
  mseed_data_source = 'galeras'
WHERE event_id = 'EVENT_UUID_AQUI';
*/

-- Para actualizar TODOS los eventos del Galeras 2006 que tienen archivos JSON,
-- necesitas crear un registro por cada archivo. Los 10 eventos son:
-- 0602011028GVA, 0602011151GVA, 0602012318GVA, 0602020145GVA, 0602021026GVA,
-- 0602021159GVA, 0602081159GVA, 0602201653GVA, 0602221030GVA, 0602261019GVA

-- PASO 1: Lista los eventos del Galeras 2006 que existen en tu tabla
-- SELECT event_id, event_date, event_time, location_name, event_type
-- FROM seismic_events
-- WHERE location_name ILIKE '%galeras%' 
--   AND event_date >= '2006-02-01' 
--   AND event_date <= '2006-02-28'
-- ORDER BY event_date, event_time;

-- PASO 2: Manualmente asocia cada evento con su archivo JSON
-- Ejemplo para el primer evento (2006-02-01 10:28):
/*
UPDATE seismic_events
SET 
  mseed_available = true,
  mseed_file_path = 'data/galeras/0602011028GVA.json',
  mseed_station = 'CUFP',
  mseed_data_source = 'galeras'
WHERE event_date = '2006-02-01' 
  AND event_time >= '10:28:00' 
  AND event_time < '10:29:00'
  AND location_name ILIKE '%galeras%';
*/

-- PASO 3: Verifica que se actualizaron correctamente
-- SELECT event_id, event_date, event_time, location_name, 
--        mseed_available, mseed_file_path, mseed_station
-- FROM seismic_events
-- WHERE mseed_available = true;

-- ============================================================================
-- NOTA: Este script requiere que conozcas los UUIDs o fechas exactas de los
-- eventos en tu base de datos. Ejecuta el SELECT del PASO 1 primero para
-- ver qué eventos tienes, y luego descomenta y adapta los UPDATEs del PASO 2.
-- ============================================================================
