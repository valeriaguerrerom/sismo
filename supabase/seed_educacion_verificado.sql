-- =============================================
-- Seed del contenido educativo VERIFICADO (quiz + línea de tiempo)
-- =============================================
-- Reemplaza el contenido de quiz_questions y timeline_events por el contenido
-- revisado con fuentes (el mismo de src/lib/educationContent.ts). Requiere haber
-- aplicado antes las migraciones:
--   20261003_education_sources.sql  (source, source_url, event_date)
--   20261005_timeline_coordinates.sql (lat, lon, location_note)
--
-- Cómo aplicarlo: pégalo en el SQL Editor de Supabase y ejecútalo. Antes de
-- borrar, GUARDA UNA COPIA de las tablas actuales en quiz_questions_backup y
-- timeline_events_backup (por si quieres revertir). No afecta a wave_facts.
--
-- Para revertir, si hiciera falta:
--   DELETE FROM quiz_questions;
--   INSERT INTO quiz_questions SELECT * FROM quiz_questions_backup;
--   DELETE FROM timeline_events;
--   INSERT INTO timeline_events SELECT * FROM timeline_events_backup;
--
-- Coordenadas: epicentros estimados del SISH (SGC) según la tabla 1 de Sarabia y
-- Cifuentes (2018); eventos del Galeras en su cráter (SGC); La Cocha 2024 sin
-- coordenadas publicadas (sin punto en el mapa).
-- =============================================

BEGIN;

-- ── Copia de seguridad del contenido actual (antes de borrar) ──
DROP TABLE IF EXISTS quiz_questions_backup;
CREATE TABLE quiz_questions_backup AS TABLE quiz_questions;
DROP TABLE IF EXISTS timeline_events_backup;
CREATE TABLE timeline_events_backup AS TABLE timeline_events;

-- ── Línea de tiempo verificada ──
DELETE FROM timeline_events;
INSERT INTO timeline_events (event_date, year, magnitude, title, description, event_type, lat, lon, location_note, source, source_url, active) VALUES
('1834-01-20', 1834, 'Mw 6.7 (estimada por daños)', 'Sismo de la región de Santiago (Putumayo)',
 'Magnitud Mw 6.7 estimada a partir de los daños (no por registro instrumental). Sismo superficial asociado al sistema de fallas de Afiladores. Alcanzó intensidad VIII (EMS-98) en Pasto.',
 'tectonic', 1.2, -77.1, 'epicentro estimado (SISH, SGC)',
 'Sarabia, A. M., & Cifuentes, H. G. (2018). Evaluación del grado de daño en la ciudad de Pasto (Colombia) a causa de sismos históricos. Boletín Geológico, 44, 133–152. Servicio Geológico Colombiano.', 'https://granate.sgc.gov.co/index.php/boletingeo/article/download/413/363/455', true),
('1906-01-31', 1906, 'Mw 8.4', 'Gran sismo de la costa pacífica',
 'Uno de los mayores sismos instrumentales del mundo, en la zona de subducción frente a la costa pacífica de Colombia y Ecuador. Magnitud Mw 8.4 según el Sistema de Información de Sismicidad Histórica del SGC.',
 'tectonic', 1.5, -80.0, 'epicentro estimado (SISH, SGC)',
 'Sarabia, A. M., & Cifuentes, H. G. (2018). Evaluación del grado de daño en la ciudad de Pasto (Colombia) a causa de sismos históricos. Boletín Geológico, 44, 133–152. Servicio Geológico Colombiano.', 'https://granate.sgc.gov.co/index.php/boletingeo/article/download/413/363/455', true),
('1935-08-07', 1935, 'Mw 6.1', 'Sismo de Tangua',
 'Sismo cortical en el sur de Nariño, cerca de Tangua.',
 'tectonic', 1.06, -77.35, 'epicentro estimado (SISH, SGC)',
 'Sarabia, A. M., & Cifuentes, H. G. (2018). Evaluación del grado de daño en la ciudad de Pasto (Colombia) a causa de sismos históricos. Boletín Geológico, 44, 133–152. Servicio Geológico Colombiano.', 'https://granate.sgc.gov.co/index.php/boletingeo/article/download/413/363/455', true),
('1935-10-26', 1935, 'Mw 5.9', 'Sismo de Imués (falla de Romeral)',
 'Sismo cortical asociado al sistema de fallas de Romeral, cerca de Imués.',
 'tectonic', 1.1, -77.5, 'epicentro estimado (SISH, SGC)',
 'Sarabia, A. M., & Cifuentes, H. G. (2018). Evaluación del grado de daño en la ciudad de Pasto (Colombia) a causa de sismos históricos. Boletín Geológico, 44, 133–152. Servicio Geológico Colombiano.', 'https://granate.sgc.gov.co/index.php/boletingeo/article/download/413/363/455', true),
('1936-07-17', 1936, 'Mw 6.3', 'Sismo de Túquerres',
 'Sismo cortical en el altiplano de Túquerres, sur de Nariño.',
 'tectonic', 1.1, -77.6, 'epicentro estimado (SISH, SGC)',
 'Sarabia, A. M., & Cifuentes, H. G. (2018). Evaluación del grado de daño en la ciudad de Pasto (Colombia) a causa de sismos históricos. Boletín Geológico, 44, 133–152. Servicio Geológico Colombiano.', 'https://granate.sgc.gov.co/index.php/boletingeo/article/download/413/363/455', true),
('1947-07-14', 1947, 'Mw 6.1', 'Sismo de Pasto (falla de Romeral)',
 'Sismo cortical asociado a la falla de Romeral. Alcanzó intensidad VIII en Pasto; se reportó la demolición de unas 500 casas de adobe o ladrillo sin refuerzo.',
 'tectonic', 1.2, -77.3, 'epicentro estimado (SISH, SGC)',
 'Sarabia, A. M., & Cifuentes, H. G. (2018). Evaluación del grado de daño en la ciudad de Pasto (Colombia) a causa de sismos históricos. Boletín Geológico, 44, 133–152. Servicio Geológico Colombiano.', 'https://granate.sgc.gov.co/index.php/boletingeo/article/download/413/363/455', true),
('1979-12-12', 1979, 'Mw 8.1', 'Sismo de Tumaco',
 'Sismo de subducción frente a la costa pacífica, a unos 25 km de profundidad. Generó un tsunami que afectó la costa de Nariño.',
 'tectonic', 1.6, -79.36, 'epicentro estimado (SISH, SGC)',
 'USGS Earthquake Hazards Program. M 8.1 — 12 de diciembre de 1979, Tumaco (costa pacífica).', 'https://earthquake.usgs.gov/earthquakes/eventpage/official19791212075923_30', true),
('1993-01-14', 1993, NULL, 'Erupción del Galeras durante una visita al cráter',
 'Erupción súbita durante un taller científico internacional (programa Decade Volcano). Fallecieron 9 personas: 6 científicos y 3 visitantes que se encontraban en el cráter. Marcó un cambio en los protocolos de seguridad en vulcanología.',
 'volcanic', 1.2288, -77.3592, 'cráter del Galeras (SGC)',
 'Baxter, P. J., & Gresham, A. (1997). Deaths and injuries in the eruption of Galeras Volcano, Colombia, 14 January 1993. Journal of Volcanology and Geothermal Research, 77(1–4), 325–338.', 'https://doi.org/10.1016/S0377-0273(96)00103-5', true),
('2006-07-12', 2006, NULL, 'Erupción explosiva del Galeras',
 'Erupción explosiva con una columna eruptiva de alrededor de 8 km de altura, según el boletín semestral del OVSP (II semestre de 2006).',
 'volcanic', 1.2288, -77.3592, 'cráter del Galeras (SGC)',
 'Servicio Geológico Colombiano, Observatorio Vulcanológico y Sismológico de Pasto. Boletines del volcán Galeras.', 'https://www2.sgc.gov.co/sgc/volcanes', true),
('2004', 2004, NULL, 'Periodo eruptivo del Galeras (2004–2009)',
 'Entre 2004 y 2009 el Galeras tuvo 17 erupciones explosivas, 10 de ellas en 2009, según el SGC. Fue uno de los periodos de mayor actividad reciente del volcán.',
 'volcanic', 1.2288, -77.3592, 'cráter del Galeras (SGC)',
 'Servicio Geológico Colombiano, Observatorio Vulcanológico y Sismológico de Pasto. Boletines del volcán Galeras.', 'https://www2.sgc.gov.co/sgc/volcanes', true),
('2024-08-23', 2024, NULL, 'Enjambre sísmico de La Cocha',
 'Enjambre en el campo volcánico Guamuez–Sibundoy (sector de La Cocha). El SGC reportó 966 sismos, 34 de ellos con magnitud M ≥ 2.0 (boletín del 23 de agosto de 2024).',
 'volcanic', NULL, NULL, NULL,
 'Servicio Geológico Colombiano (23 de agosto de 2024). Boletín extraordinario: enjambre sísmico en el sector de La Cocha, campo volcánico Guamuez–Sibundoy.', 'https://www2.sgc.gov.co', true);

-- ── Quiz verificado (ligado a los capítulos; incluye preguntas visuales) ──
DELETE FROM quiz_questions;
INSERT INTO quiz_questions (question, options, correct_index, explanation, category, difficulty, source, source_url, active) VALUES
('¿Cuál es la onda sísmica más rápida?', '["Onda S","Onda P","Onda Love","Onda Rayleigh"]', 1,
 'La onda P es la más rápida; por eso es la primera en registrarse en un sismograma.', 'ondas', 'facil',
 'Shearer, P. M. (2019). Introduction to Seismology (3.ª ed.). Cambridge University Press.', NULL, true),
('¿Las ondas S se propagan por los líquidos?', '["Sí, igual que en sólidos","No","Solo en agua salada","Solo a gran presión"]', 1,
 'Las ondas S son de cizalla y no se propagan en líquidos. Su ausencia tras el núcleo externo indicó que este es líquido.', 'ondas', 'medio',
 'Shearer, P. M. (2019). Introduction to Seismology (3.ª ed.). Cambridge University Press.', NULL, true),
('¿Qué movimiento de partícula caracteriza a la onda Rayleigh?', '["Compresión longitudinal","Cizalla horizontal","Elíptico retrógrado","Sin movimiento"]', 2,
 'La onda Rayleigh produce un movimiento elíptico retrógrado en el plano vertical, con amplitud máxima en la superficie.', 'ondas', 'medio',
 'Shearer, P. M. (2019). Introduction to Seismology (3.ª ed.). Cambridge University Press.', NULL, true),
('¿Qué placa se subduce frente a la costa de Nariño?', '["Placa del Caribe","Placa de Cocos","Placa de Nazca","Placa Antártica"]', 2,
 'La placa de Nazca se subduce bajo la placa Sudamericana frente a la costa pacífica, lo que explica la sismicidad y el volcanismo de la región.', 'tectonica', 'medio',
 'Stein, S., & Wysession, M. (2003). An Introduction to Seismology, Earthquakes, and Earth Structure. Blackwell Publishing.', NULL, true),
('¿Hasta qué profundidad se considera superficial un sismo?', '["Hasta 70 km","Hasta 300 km","Hasta 700 km","Hasta 10 km"]', 0,
 'Según la clasificación estándar, un sismo es superficial si su foco está a menos de 70 km; intermedio entre 70 y 300 km, y profundo entre 300 y 700 km.', 'profundidad', 'medio',
 'Stein, S., & Wysession, M. (2003). An Introduction to Seismology, Earthquakes, and Earth Structure. Blackwell Publishing.', NULL, true),
('En el método de diferencias finitas, ¿para qué sirve la condición CFL?', '["Para hacer la simulación más rápida","Para que la solución numérica sea estable","Para aumentar la magnitud","Para cambiar el tipo de fuente"]', 1,
 'La condición de Courant–Friedrichs–Lewy (dt ≤ dx/(Vp·√2) en 2D) limita el paso de tiempo para que el esquema explícito sea estable; si se viola, la solución diverge.', 'general', 'dificil',
 'Courant, R., Friedrichs, K., & Lewy, H. (1928). Über die partiellen Differenzengleichungen der mathematischen Physik. Mathematische Annalen, 100, 32–74.', NULL, true),
('¿Qué ocurrió en el Galeras el 14 de enero de 1993?', '["Una erupción sin víctimas","Una erupción durante una visita científica al cráter, con víctimas","Un sismo de magnitud 8","La formación del volcán"]', 1,
 'El Galeras hizo erupción mientras un grupo científico estaba en el cráter durante un taller internacional; fallecieron 9 personas (6 científicos y 3 visitantes).', 'volcanes', 'medio',
 'Baxter, P. J., & Gresham, A. (1997). Deaths and injuries in the eruption of Galeras Volcano, Colombia, 14 January 1993. Journal of Volcanology and Geothermal Research, 77(1–4), 325–338.', 'https://doi.org/10.1016/S0377-0273(96)00103-5', true),
('Un sismo de magnitud 7 frente a uno de magnitud 6 libera, aproximadamente,', '["2 veces más energía","10 veces más energía","32 veces más energía","la misma energía"]', 2,
 'Cada unidad de magnitud multiplica la energía por unas 32 veces (log10 E = 1.5 Mw + 4.8). La amplitud, en cambio, se multiplica por diez.', 'magnitud', 'medio',
 'Hanks, T. C., & Kanamori, H. (1979). A moment magnitude scale. Journal of Geophysical Research, 84(B5), 2348–2350.', 'https://doi.org/10.1029/JB084iB05p02348', true),
('¿Cuál es la diferencia entre magnitud e intensidad?', '["Son lo mismo medido en escalas distintas","La magnitud mide la energía en el origen; la intensidad, qué tan fuerte se sintió en un lugar","La intensidad siempre es mayor que la magnitud","La magnitud cambia de un sitio a otro"]', 1,
 'La magnitud es un solo número por sismo (energía en el origen). La intensidad describe los efectos en cada sitio y varía con la distancia, el suelo y las construcciones. El sismo de Pasto de 1947 tuvo Mw 6.1 e intensidad VIII en Pasto.', 'magnitud', 'medio',
 'Sarabia, A. M., & Cifuentes, H. G. (2018). Evaluación del grado de daño en la ciudad de Pasto (Colombia) a causa de sismos históricos. Boletín Geológico, 44, 133–152. Servicio Geológico Colombiano.', 'https://granate.sgc.gov.co/index.php/boletingeo/article/download/413/363/455', true),
('Observa la trayectoria de la partícula. ¿Qué onda es?', '["Onda P","Onda S","Onda Love","Onda Rayleigh"]', 3,
 'La partícula describe una elipse en el plano vertical: es una onda Rayleigh, de movimiento elíptico retrógrado en la superficie.', 'ondas', 'medio',
 'Shearer, P. M. (2019). Introduction to Seismology (3.ª ed.). Cambridge University Press.', NULL, true),
('Observa el sismograma. El movimiento es perpendicular a la propagación. ¿Qué onda es?', '["Onda P","Onda S","Onda Love","Onda Rayleigh"]', 1,
 'El movimiento transversal, perpendicular a la dirección de avance y sin componente longitudinal, corresponde a una onda S.', 'ondas', 'medio',
 'Shearer, P. M. (2019). Introduction to Seismology (3.ª ed.). Cambridge University Press.', NULL, true),
('Un sismo tiene su foco a 120 km de profundidad. ¿Cómo se clasifica?', '["Superficial","Intermedio","Profundo","No se puede clasificar"]', 1,
 'Entre 70 y 300 km el sismo es intermedio. A 120 km cae en esa franja, típica de la zona de subducción.', 'profundidad', 'medio',
 'Stein, S., & Wysession, M. (2003). An Introduction to Seismology, Earthquakes, and Earth Structure. Blackwell Publishing.', NULL, true);

COMMIT;
