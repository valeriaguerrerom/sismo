-- =============================================
-- Epicentros reales (USGS ComCat) para los eventos CM que casaron
-- =============================================
-- Generado por backend/scripts/gen_epicenter_migration.py a partir del
-- cruce de match_cm_epicenters.py (por hora de origen + magnitud contra el
-- USGS fdsnws/event). NO editar a mano.
--
-- Casaron 46 de 134 eventos CM. Los que no casaron son de magnitud
-- baja (M <= ~3.7) y no están en el catálogo global del USGS; conservan su
-- coordenada por zona (centroide de estaciones).
--
-- Añade location_source: 'SGC/USGS' = epicentro real; 'centroide de
-- estaciones' = aún sin epicentro individual.
-- =============================================

ALTER TABLE seismic_events ADD COLUMN IF NOT EXISTS location_source text;

-- Por defecto, todos los eventos CM existentes son 'centroide de estaciones'
-- (los volcánicos del Galeras usan la coordenada del cráter: se dejan NULL).
UPDATE seismic_events SET location_source = 'centroide de estaciones'
  WHERE event_type = 'tectonic' AND location_source IS NULL;

-- ── 46 eventos con epicentro real del USGS ──
UPDATE seismic_events SET latitude = 0.7556, longitude = -77.3987, depth_km = 9.7, location_source = 'SGC/USGS' WHERE event_id = 'CM_M3.7_2023-01-15T17-59-18';
UPDATE seismic_events SET latitude = 0.7556, longitude = -77.3987, depth_km = 9.7, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.3_2023-01-15T17-59-19';
UPDATE seismic_events SET latitude = 3.8178, longitude = -76.489, depth_km = 146.602, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.3_2023-06-10T06-53-57';
UPDATE seismic_events SET latitude = 2.7209, longitude = -79.6777, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.3_2023-08-13T12-58-42';
UPDATE seismic_events SET latitude = 2.6312, longitude = -79.0382, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.3_2024-05-26T10-24-52';
UPDATE seismic_events SET latitude = 2.5853, longitude = -79.7833, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.3_2025-06-23T00-10-30';
UPDATE seismic_events SET latitude = 3.8376, longitude = -76.5812, depth_km = 136.419, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.3_2025-11-01T19-52-42';
UPDATE seismic_events SET latitude = 2.8041, longitude = -79.7139, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.4_2023-09-15T19-29-58';
UPDATE seismic_events SET latitude = 2.7226, longitude = -76.7369, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.4_2025-08-27T09-31-35';
UPDATE seismic_events SET latitude = 0.7544, longitude = -77.9505, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.5_2023-05-12T06-06-16';
UPDATE seismic_events SET latitude = 2.5126, longitude = -79.7082, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.5_2023-11-18T23-32-53';
UPDATE seismic_events SET latitude = 3.9409, longitude = -78.0653, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.5_2024-08-28T00-49-19';
UPDATE seismic_events SET latitude = 2.5566, longitude = -78.869, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.5_2025-03-25T22-08-06';
UPDATE seismic_events SET latitude = 2.2187, longitude = -79.0054, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.6_2023-04-15T03-50-57';
UPDATE seismic_events SET latitude = 0.9582, longitude = -77.5751, depth_km = 95.262, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.6_2023-12-11T07-36-33';
UPDATE seismic_events SET latitude = 2.5004, longitude = -79.0534, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.7_2024-05-22T08-44-13';
UPDATE seismic_events SET latitude = 3.7915, longitude = -78.5829, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.7_2024-07-10T09-53-36';
UPDATE seismic_events SET latitude = 2.1028, longitude = -79.7589, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.7_2024-10-16T22-04-48';
UPDATE seismic_events SET latitude = 3.3141, longitude = -77.507, depth_km = 35.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.8_2025-05-23T04-56-45';
UPDATE seismic_events SET latitude = 2.5724, longitude = -79.7378, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.9_2025-08-08T00-31-47';
UPDATE seismic_events SET latitude = 2.946, longitude = -79.319, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4_2024-06-07T15-27-42';
UPDATE seismic_events SET latitude = 2.2475, longitude = -79.7656, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4_2024-08-01T12-35-02';
UPDATE seismic_events SET latitude = 2.5123, longitude = -79.0178, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M5_2024-05-22T05-34-19';
UPDATE seismic_events SET latitude = 2.871, longitude = -79.4812, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M5_2025-03-01T09-38-49';
UPDATE seismic_events SET latitude = 0.8375, longitude = -78.7836, depth_km = 68.193, location_source = 'SGC/USGS' WHERE event_id = 'CM_M2.9_2024-09-27T00-29-32';
UPDATE seismic_events SET latitude = 0.6074, longitude = -77.8502, depth_km = 11.785, location_source = 'SGC/USGS' WHERE event_id = 'CM_M2.9_2024-10-09T23-32-05';
UPDATE seismic_events SET latitude = 1.7167, longitude = -79.6878, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M2.9_2024-10-10T01-43-57';
UPDATE seismic_events SET latitude = 1.1182, longitude = -79.3631, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M3.2_2024-10-22T00-55-10';
UPDATE seismic_events SET latitude = 1.3893, longitude = -79.7834, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M3.4_2024-10-07T20-12-06';
UPDATE seismic_events SET latitude = 0.2419, longitude = -78.3038, depth_km = 7.9, location_source = 'SGC/USGS' WHERE event_id = 'CM_M3.6_2023-10-23T05-23-31';
UPDATE seismic_events SET latitude = 0.4041, longitude = -78.5537, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M3.7_2024-11-01T03-54-58';
UPDATE seismic_events SET latitude = 1.2324, longitude = -78.8118, depth_km = 53.309, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.1_2023-09-28T06-28-04';
UPDATE seismic_events SET latitude = 0.5213, longitude = -79.9972, depth_km = 12.915, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.3_2025-10-02T14-52-50';
UPDATE seismic_events SET latitude = 0.5931, longitude = -80.1644, depth_km = 29.058, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.4_2023-03-08T04-24-57';
UPDATE seismic_events SET latitude = 0.764, longitude = -77.8395, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.4_2023-04-26T03-16-18';
UPDATE seismic_events SET latitude = 1.2167, longitude = -78.9339, depth_km = 77.318, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.4_2024-02-08T02-36-12';
UPDATE seismic_events SET latitude = 0.4719, longitude = -79.3622, depth_km = 57.913, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.4_2025-07-20T21-06-32';
UPDATE seismic_events SET latitude = 1.1728, longitude = -79.1733, depth_km = 48.268, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.5_2023-09-26T19-25-02';
UPDATE seismic_events SET latitude = 0.8665, longitude = -79.7091, depth_km = 42.703, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.6_2025-07-08T17-36-09';
UPDATE seismic_events SET latitude = 0.6912, longitude = -77.9134, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.8_2023-10-05T20-55-06';
UPDATE seismic_events SET latitude = 0.4825, longitude = -77.5688, depth_km = 8.031, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.8_2024-05-06T15-32-31';
UPDATE seismic_events SET latitude = 0.4474, longitude = -77.5722, depth_km = 4.838, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.9_2024-05-06T15-17-03';
UPDATE seismic_events SET latitude = 2.1354, longitude = -79.9559, depth_km = 10.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4.9_2025-08-25T18-10-57';
UPDATE seismic_events SET latitude = 1.2765, longitude = -79.4858, depth_km = 35.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M4_2023-07-24T01-47-57';
UPDATE seismic_events SET latitude = 0.5974, longitude = -79.9871, depth_km = 35.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M5_2023-06-27T14-07-27';
UPDATE seismic_events SET latitude = 1.0835, longitude = -79.5319, depth_km = 18.0, location_source = 'SGC/USGS' WHERE event_id = 'CM_M6.3_2025-04-25T11-44-52';

-- Consultado del USGS ComCat el 2026-10-03 16:20 UTC.
