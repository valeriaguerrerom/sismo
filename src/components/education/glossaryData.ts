/**
 * Términos del glosario educativo (RF-24).
 * @module glossaryData
 */
export interface Term {
  term: string;
  def: string;
  cat: 'sismología' | 'ondas' | 'numérico' | 'región';
}

export const GLOSSARY: Term[] = [
  { term: 'Hipocentro (foco)', def: 'Punto del interior de la Tierra donde se origina la ruptura y comienza la liberación de energía sísmica.', cat: 'sismología' },
  { term: 'Epicentro', def: 'Proyección vertical del hipocentro sobre la superficie terrestre. Se expresa en latitud y longitud.', cat: 'sismología' },
  { term: 'Profundidad focal', def: 'Distancia vertical entre el epicentro y el hipocentro. Clasificación estándar: superficial < 70 km, intermedia 70–300 km, profunda 300–700 km (Stein y Wysession, 2003).', cat: 'sismología' },
  { term: 'Magnitud momento (Mw)', def: 'Escala logarítmica que mide la energía liberada a partir del momento sísmico. Cada unidad equivale a ~31.6 veces más energía.', cat: 'sismología' },
  { term: 'Sismograma', def: 'Registro del movimiento del suelo en función del tiempo captado por un sismómetro.', cat: 'sismología' },
  { term: 'Pseudo-sismograma', def: 'Señal sísmica sintética o semi-sintética generada por un modelo físico o paramétrico, no por un instrumento real.', cat: 'sismología' },
  { term: 'Registro triaxial', def: 'Sismograma de tres componentes ortogonales: Norte (N), Este (E) y Vertical (Z).', cat: 'sismología' },
  { term: 'Estación sismológica', def: 'Sitio instrumentado con sensores (velocímetros o acelerómetros) que registran y transmiten el movimiento del suelo.', cat: 'sismología' },
  { term: 'MiniSEED', def: 'Formato binario estándar para almacenar series temporales sísmicas continuas. Es el formato de los datos crudos del SGC.', cat: 'sismología' },
  { term: 'QuakeML', def: 'Formato XML estándar para catálogos de eventos sísmicos (origen, magnitud, tipo). Se usa para importar eventos del SGC.', cat: 'sismología' },
  { term: 'Onda P (primaria)', def: 'Onda de cuerpo compresional. Es la más rápida y viaja por sólidos, líquidos y gases. Vp típica en corteza: 5–7 km/s.', cat: 'ondas' },
  { term: 'Onda S (secundaria)', def: 'Onda de cuerpo de corte (cizalla). Solo viaja por sólidos. Vs ≈ Vp / 1.73 en roca típica.', cat: 'ondas' },
  { term: 'Onda Love', def: 'Onda superficial de cizalla horizontal, perpendicular a la dirección de propagación. Su amplitud es máxima en la superficie y decrece con la profundidad.', cat: 'ondas' },
  { term: 'Onda Rayleigh', def: 'Onda superficial con movimiento elíptico retrógrado, similar a las olas del mar.', cat: 'ondas' },
  { term: 'Tiempo S − P', def: 'Diferencia entre el arribo de la onda S y la P. Es proporcional a la distancia al hipocentro.', cat: 'ondas' },
  { term: 'Frecuencia dominante', def: 'Frecuencia con mayor energía en el espectro del sismograma. Se estima con la transformada de Fourier.', cat: 'ondas' },
  { term: 'Vp / Vs', def: 'Razón de velocidades. Depende del módulo de Poisson; ≈ 1.73 para un sólido de Poisson.', cat: 'ondas' },
  { term: 'Vs30', def: 'Velocidad promedio de la onda S en los primeros 30 m. Parámetro estándar para clasificar el suelo en diseño sísmico.', cat: 'ondas' },
  { term: 'Parámetros de Lamé (λ, μ)', def: 'Constantes elásticas del medio. μ es el módulo de corte (ρ·Vs²) y λ = ρ·Vp² − 2μ.', cat: 'numérico' },
  { term: 'Densidad (ρ)', def: 'Masa por unidad de volumen del medio. Roca cortical típica: 2500–2800 kg/m³.', cat: 'numérico' },
  { term: 'Impedancia acústica', def: 'Producto ρ·Vp. Los contrastes de impedancia generan reflexiones y refracciones.', cat: 'numérico' },
  { term: 'Método de Diferencias Finitas (FDM)', def: 'Técnica numérica que aproxima derivadas por cocientes de diferencias sobre una malla discreta.', cat: 'numérico' },
  { term: 'Malla (nx × nz)', def: 'Rejilla de nodos que discretiza el dominio 2D: nx en horizontal y nz en profundidad, separados por dx.', cat: 'numérico' },
  { term: 'Paso temporal (dt)', def: 'Intervalo entre dos instantes consecutivos de la simulación.', cat: 'numérico' },
  { term: 'Condición CFL', def: 'Criterio de estabilidad de Courant–Friedrichs–Lewy: dt ≤ dx / (Vp·√2) en 2D.', cat: 'numérico' },
  { term: 'Esquema leapfrog', def: 'Integración temporal explícita de segundo orden que usa los dos instantes anteriores.', cat: 'numérico' },
  { term: 'Ondícula de Ricker', def: 'Pulso de banda limitada (segunda derivada de una gaussiana) usado como función fuente.', cat: 'numérico' },
  { term: 'Doble par (double couple)', def: 'Modelo de fuente de una falla: dos pares de fuerzas opuestas. Produce un patrón de radiación con cuatro lóbulos.', cat: 'numérico' },
  { term: 'Fuente isótropa', def: 'Fuente explosiva que radia energía por igual en todas las direcciones. Se usa para eventos volcánicos.', cat: 'numérico' },
  { term: 'Borde absorbente (Cerjan)', def: 'Zona en los bordes de la malla que amortigua las ondas para evitar reflexiones artificiales. El motor usa el esquema de Cerjan et al. (1985), un amortiguamiento gradual tipo "esponja".', cat: 'numérico' },
  { term: 'Superficie libre', def: 'Condición de frontera en z = 0 con esfuerzo nulo, que representa el contacto suelo-aire.', cat: 'numérico' },
  { term: 'Dispersión numérica', def: 'Error por malla gruesa: las altas frecuencias viajan a una velocidad incorrecta. Se evita con ≥ 10 nodos por longitud de onda.', cat: 'numérico' },
  { term: 'STA/LTA', def: 'Cociente entre el promedio de corto plazo (STA) y el de largo plazo (LTA) de la señal. Cuando sube por encima de un umbral marca el arribo de una fase; es un detector automático clásico (Shearer, 2019).', cat: 'numérico' },
  { term: 'Snapshot del campo de onda', def: 'Instantánea del desplazamiento en toda la malla en un instante dado, usada para la animación 3D.', cat: 'numérico' },
  { term: 'IASP91', def: 'Modelo de velocidades 1D de referencia global (Kennett y Engdahl, 1991) usado por el Mapa 3D para calcular tiempos de viaje. Es un promedio mundial, no un modelo local de Nariño.', cat: 'numérico' },
  { term: 'Moho (discontinuidad de Mohorovičić)', def: 'Límite entre la corteza y el manto, marcado por un salto de velocidad. En el modelo global IASP91 se sitúa a 35 km, pero es un valor de referencia: bajo los Andes la corteza es más gruesa y el Moho es más profundo.', cat: 'sismología' },
  { term: 'SGC', def: 'Servicio Geológico Colombiano. Entidad que opera la Red Sismológica Nacional y los observatorios vulcanológicos.', cat: 'región' },
  { term: 'OVSP', def: 'Observatorio Vulcanológico y Sismológico de Pasto. Monitorea Galeras, Cumbal, Azufral y Doña Juana.', cat: 'región' },
  { term: 'Red CM', def: 'Código de red de la Red Sismológica Nacional de Colombia en los estándares FDSN.', cat: 'región' },
  { term: 'Sismo volcano-tectónico (VT)', def: 'Sismo por fractura de roca dentro del edificio volcánico. Señal impulsiva de alta frecuencia.', cat: 'región' },
  { term: 'Sismo de largo período (LP)', def: 'Sismo volcánico asociado al movimiento de fluidos. Señal emergente de baja frecuencia (1–5 Hz).', cat: 'región' },
  { term: 'Tornillo', def: 'Sismo volcánico con decaimiento lento y cuasi-monocromático, precursor de erupciones en el Galeras.', cat: 'región' },
  { term: 'Tremor', def: 'Vibración sísmica sostenida, de minutos a horas, asociada a tránsito de fluidos o emisiones.', cat: 'región' },
  { term: 'Zona de subducción', def: 'Frontera donde la placa de Nazca se hunde bajo la Sudamericana frente a la costa de Nariño.', cat: 'región' },
  { term: 'Sistema de fallas Romeral', def: 'Sistema de fallas cortical que atraviesa Nariño y genera sismicidad superficial.', cat: 'región' },
];
