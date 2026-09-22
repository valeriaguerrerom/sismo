/*
  # Create seismic events table for SismoNariño

  1. New Tables
    - `seismic_events`
      - `id` (uuid, primary key)
      - `event_date` (date) — date of the seismic event
      - `event_time` (text) — time in UTC
      - `magnitude` (numeric) — Richter/moment magnitude
      - `depth_km` (numeric) — focal depth in kilometers
      - `latitude` (numeric) — epicenter latitude
      - `longitude` (numeric) — epicenter longitude
      - `location_name` (text) — descriptive location name
      - `event_type` (text) — 'tectonic' or 'volcanic'
      - `source` (text) — data source (SGC, OVSP, etc.)
      - `notes` (text) — additional notes
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `seismic_events` table
    - Public read access (educational platform, no auth required)

  Nota: La tabla se crea vacía. Los eventos se cargan desde el
  procesamiento de datos MiniSEED reales de la red CM (Colombia/Ecuador).
*/

CREATE TABLE IF NOT EXISTS seismic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date date NOT NULL,
  event_time text DEFAULT '00:00:00',
  magnitude numeric(4,2) NOT NULL,
  depth_km numeric(6,2) NOT NULL,
  latitude numeric(9,6) NOT NULL,
  longitude numeric(9,6) NOT NULL,
  location_name text NOT NULL,
  event_type text NOT NULL DEFAULT 'tectonic',
  source text DEFAULT 'SGC',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE seismic_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for seismic events"
  ON seismic_events FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_seismic_events_date ON seismic_events(event_date);
CREATE INDEX IF NOT EXISTS idx_seismic_events_magnitude ON seismic_events(magnitude);
CREATE INDEX IF NOT EXISTS idx_seismic_events_type ON seismic_events(event_type);

-- Tabla sin datos sembrados. Los eventos reales se insertan desde el
-- procesamiento de MiniSEED de la red CM (ver backend).