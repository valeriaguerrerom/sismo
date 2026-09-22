-- =============================================
-- TABLA: quiz_questions
-- Preguntas del quiz sísmico educativo
-- =============================================
CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  options jsonb NOT NULL, -- ["opcion1", "opcion2", "opcion3", "opcion4"]
  correct_index int NOT NULL, -- 0-based index
  explanation text NOT NULL,
  category text DEFAULT 'general', -- 'ondas', 'volcanes', 'tectonica', 'general'
  difficulty text DEFAULT 'medio', -- 'facil', 'medio', 'dificil'
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read quiz" ON quiz_questions FOR SELECT TO anon, authenticated USING (true);

INSERT INTO quiz_questions (question, options, correct_index, explanation, category, difficulty) VALUES
('¿Cuál es la onda sísmica más rápida?', '["Onda S", "Onda P", "Onda Love", "Onda Rayleigh"]', 1, 'Las ondas P (primarias) son las más rápidas porque viajan por compresión del material, alcanzando velocidades de 3 a 8 km/s en roca.', 'ondas', 'facil'),
('¿Qué volcán de Nariño es considerado uno de los más activos de Colombia?', '["Cumbal", "Azufral", "Galeras", "Doña Juana"]', 2, 'El volcán Galeras, ubicado cerca de Pasto, es uno de los volcanes más activos de Colombia con actividad registrada desde el siglo XVI.', 'volcanes', 'facil'),
('¿Qué escala mide la energía total liberada por un sismo?', '["Escala de Mercalli", "Escala de Richter", "Magnitud Momento (Mw)", "Escala MSK"]', 2, 'La Magnitud Momento (Mw) es la escala más precisa para medir la energía total liberada. Cada unidad representa ~31.6 veces más energía.', 'general', 'medio'),
('¿Las ondas S pueden propagarse a través de líquidos?', '["Sí, siempre", "Solo en agua salada", "No, nunca", "Solo a altas presiones"]', 2, 'Las ondas S (de corte) no se propagan en líquidos porque los fluidos no resisten esfuerzos de corte. Esto demostró que el núcleo externo de la Tierra es líquido.', 'ondas', 'medio'),
('¿Qué es el epicentro de un sismo?', '["El punto más profundo del sismo", "El punto en superficie sobre el foco", "La zona de mayor destrucción", "El lugar donde se mide el sismo"]', 1, 'El epicentro es la proyección vertical del hipocentro (foco) sobre la superficie terrestre.', 'general', 'facil'),
('¿Qué placa tectónica se subduce bajo Nariño?', '["Placa del Caribe", "Placa de Cocos", "Placa de Nazca", "Placa Antártica"]', 2, 'La Placa de Nazca se subduce bajo la Placa Sudamericana en la costa pacífica colombiana.', 'tectonica', 'medio'),
('¿Qué parámetro clasifica el tipo de suelo para diseño sísmico?', '["Densidad", "Vs30", "Magnitud", "Profundidad focal"]', 1, 'Vs30 es la velocidad promedio de ondas de corte en los primeros 30 metros. Es el parámetro estándar para clasificar suelos en diseño sísmico.', 'general', 'dificil'),
('¿Qué tipo de onda produce el movimiento rolling en sismos lejanos?', '["Onda P", "Onda S", "Onda Love", "Onda Rayleigh"]', 3, 'Las ondas Rayleigh producen un movimiento elíptico que genera la sensación de balanceo, especialmente perceptible a grandes distancias.', 'ondas', 'medio'),
('¿En qué año ocurrió el devastador sismo de Tumaco?', '["1906", "1958", "1979", "1993"]', 2, 'El sismo de Tumaco de 1979 (Mw 8.1) generó un tsunami devastador en la costa pacífica nariñense con más de 450 víctimas.', 'tectonica', 'facil'),
('¿Qué método numérico usa SismoNariño para simular ondas?', '["Elementos Finitos", "Diferencias Finitas", "Volúmenes Finitos", "Monte Carlo"]', 1, 'SismoNariño usa el Método de Diferencias Finitas (FDM) para resolver la ecuación de onda elástica 2D.', 'general', 'medio'),
('¿Cuál es la altura del Volcán Cumbal?', '["4,070 m", "4,150 m", "4,276 m", "4,764 m"]', 3, 'El Volcán Cumbal es el más alto de Nariño con 4,764 metros, ubicado en la frontera con Ecuador.', 'volcanes', 'dificil'),
('¿Qué institución monitorea los volcanes de Nariño 24/7?', '["IDEAM", "IGAC", "SGC (OVSP)", "INGEOMINAS"]', 2, 'El Observatorio Vulcanológico y Sismológico de Pasto (OVSP) del SGC monitorea permanentemente la actividad volcánica y sísmica de Nariño.', 'volcanes', 'facil'),
('¿Qué son los parámetros de Lamé (λ y μ)?', '["Coordenadas geográficas", "Constantes elásticas del medio", "Frecuencias de onda", "Magnitudes sísmicas"]', 1, 'Los parámetros de Lamé describen las propiedades elásticas del material: λ relaciona esfuerzo y deformación volumétrica, μ es el módulo de corte.', 'general', 'dificil'),
('¿Qué volcán de Nariño tiene una laguna cratérica verde?', '["Galeras", "Cumbal", "Azufral", "Doña Juana"]', 2, 'El Volcán Azufral es conocido por su espectacular Laguna Verde cratérica, formada por la actividad fumarólica.', 'volcanes', 'facil'),
('¿Qué condición debe cumplir dt para estabilidad numérica en FDM?', '["dt > dx/Vp", "dt ≤ dx/(Vp·√2)", "dt = dx·Vp", "dt ≥ dx²"]', 1, 'La condición CFL (Courant-Friedrichs-Lewy) establece que dt ≤ dx/(Vp·√2) para garantizar estabilidad numérica.', 'general', 'dificil');

-- =============================================
-- TABLA: wave_facts
-- Datos curiosos sobre ondas sísmicas
-- =============================================
CREATE TABLE IF NOT EXISTS wave_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_type text NOT NULL, -- 'P', 'S', 'Love', 'Rayleigh'
  fact text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE wave_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read facts" ON wave_facts FOR SELECT TO anon, authenticated USING (true);

INSERT INTO wave_facts (wave_type, fact) VALUES
('P', 'Pueden atravesar el núcleo líquido de la Tierra, por eso se detectan en todo el planeta.'),
('P', 'Viajan a ~6 km/s en la corteza terrestre, más rápido que cualquier avión comercial.'),
('P', 'Fueron las primeras ondas sísmicas identificadas, de ahí su nombre "Primarias".'),
('P', 'En el aire se convierten en ondas sonoras — algunos animales las detectan antes del sismo.'),
('P', 'Su velocidad en el manto terrestre puede superar los 13 km/s.'),
('S', 'Su ausencia en el núcleo externo de la Tierra demostró que este es líquido.'),
('S', 'Son las principales responsables del daño en edificaciones durante un sismo.'),
('S', 'Se mueven como una serpiente, perpendicular a la dirección de propagación.'),
('S', 'No pueden viajar por el agua ni por el aire, solo por materiales sólidos.'),
('S', 'Generan el mayor movimiento horizontal del suelo, peligroso para estructuras.'),
('Love', 'Nombradas por Augustus Love, quien las predijo matemáticamente en 1911.'),
('Love', 'Son especialmente destructivas para edificios altos por su movimiento horizontal.'),
('Love', 'Solo se propagan en la superficie, no penetran al interior de la Tierra.'),
('Love', 'Su amplitud decrece exponencialmente con la profundidad.'),
('Rayleigh', 'Lord Rayleigh las predijo en 1885. Son las ondas que más se sienten en sismos lejanos.'),
('Rayleigh', 'Producen un movimiento elíptico retrógrado, como olas del mar en reversa.'),
('Rayleigh', 'Son las ondas de mayor amplitud a grandes distancias del epicentro.'),
('Rayleigh', 'Pueden dar la vuelta completa al planeta después de un gran terremoto.');

-- =============================================
-- TABLA: timeline_events
-- Eventos históricos sísmicos y volcánicos de Nariño
-- =============================================
CREATE TABLE IF NOT EXISTS timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  magnitude text, -- puede ser '~7.0', '8.2', o null para volcánicos
  title text NOT NULL,
  description text NOT NULL,
  event_type text NOT NULL DEFAULT 'tectonic', -- 'tectonic' o 'volcanic'
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read timeline" ON timeline_events FOR SELECT TO anon, authenticated USING (true);

INSERT INTO timeline_events (year, magnitude, title, description, event_type) VALUES
(1834, '~7.0', 'Gran sismo de Pasto', 'Uno de los sismos más destructivos registrados en Nariño. Causó graves daños en Pasto y poblaciones cercanas. Asociado a la actividad de la Falla de Romeral.', 'tectonic'),
(1906, '8.8', 'Gran sismo del Pacífico', 'Uno de los sismos más grandes registrados en Colombia. Generó un tsunami en la costa pacífica. Sentido en todo el sur del país.', 'tectonic'),
(1936, '7.0', 'Sismo Colombia-Ecuador', 'Sismo de gran magnitud en la frontera colombo-ecuatoriana. Afectó severamente el sur de Nariño y el norte de Ecuador.', 'tectonic'),
(1979, '8.2', 'Sismo de Tumaco', 'Uno de los sismos más grandes del siglo XX en Colombia. Generó un tsunami devastador en la costa pacífica nariñense. Más de 450 víctimas.', 'tectonic'),
(1993, NULL, 'Erupción del Galeras', 'Erupción durante una conferencia de vulcanólogos. Fallecieron 9 personas, incluyendo 6 científicos. Marcó un antes y después en la seguridad vulcanológica mundial.', 'volcanic'),
(2004, NULL, 'Reactivación Galeras', 'Nueva fase eruptiva del volcán Galeras con emisiones de ceniza y flujos piroclásticos. Se evacuaron miles de personas.', 'volcanic'),
(2007, NULL, 'Erupciones Galeras', 'Serie de erupciones con columnas de ceniza de hasta 8 km de altura. Afectación a comunidades rurales y al aeropuerto de Pasto.', 'volcanic'),
(2016, '7.8', 'Sismo Ecuador-Nariño', 'Terremoto en la costa de Ecuador sentido fuertemente en Nariño. Más de 650 víctimas en Ecuador.', 'tectonic'),
(2023, '5.6', 'Sismo en Nariño', 'Sismo moderado sentido en todo el departamento. Recordatorio de la alta sismicidad de la región.', 'tectonic');
