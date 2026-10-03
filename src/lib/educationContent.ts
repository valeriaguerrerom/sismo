/**
 * Contenido científico verificado del Centro de aprendizaje (Educación).
 *
 * REGLA DE RIGOR: cada afirmación con un dato científico lleva su fuente y, si
 * existe, un enlace. No se incluye ningún dato que no esté respaldado por una
 * fuente real citada. Este módulo es la fuente única de verdad del contenido
 * educativo (línea de tiempo, quiz, metadatos de ondas, profundidad), para que
 * sea defendible y revisable. El documento `docs/educacion-contenido.md`
 * resume cada afirmación y su fuente.
 *
 * @module lib/educationContent
 */

/** Una fuente citada: texto de la cita y, opcional, enlace. */
export interface Source {
  cita: string;
  url?: string;
}

// ─── Fuentes reutilizadas (citas canónicas) ───
export const SRC = {
  sarabia2018: {
    cita: 'Sarabia, A. M., & Cifuentes, H. G. (2018). Catálogo de intensidades macrosísmicas y efectos de sismos significativos en Colombia. Boletín Geológico, 44, 133–152. Servicio Geológico Colombiano.',
    url: 'https://revistas.sgc.gov.co/index.php/boletingeo/article/view/691',
  },
  sgcSismos: {
    cita: 'Servicio Geológico Colombiano. Catálogo de la Red Sismológica Nacional de Colombia.',
    url: 'https://www.sgc.gov.co',
  },
  ovsp: {
    cita: 'Servicio Geológico Colombiano, Observatorio Vulcanológico y Sismológico de Pasto. Boletines del volcán Galeras.',
    url: 'https://www2.sgc.gov.co/sgc/volcanes',
  },
  usgsGaleras: {
    cita: 'USGS Volcano Watch (21 de enero de 1993). Galeras, Mauna Loa, Decade Volcanoes.',
    url: 'https://www.usgs.gov/news/volcano-watch-galeras-mauna-loa-decade-volcanoes',
  },
  baxter1997: {
    cita: 'Baxter, P. J., & Gresham, A. (1997). Deaths and injuries in the eruption of Galeras Volcano, Colombia, 14 January 1993. Journal of Volcanology and Geothermal Research, 77(1–4), 325–338.',
    url: 'https://doi.org/10.1016/S0377-0273(96)00103-5',
  },
  usgsPasto1906: {
    cita: 'USGS Earthquake Hazards Program. M 8.8 — 1906 Ecuador–Colombia (costa pacífica).',
    url: 'https://earthquake.usgs.gov',
  },
  usgsTumaco1979: {
    cita: 'USGS Earthquake Hazards Program. M 8.1 — 12 de diciembre de 1979, Tumaco (costa pacífica).',
    url: 'https://earthquake.usgs.gov/earthquakes/eventpage/official19791212075923_30',
  },
  sgcCocha2024: {
    cita: 'Servicio Geológico Colombiano (23 de agosto de 2024). Boletín extraordinario: enjambre sísmico en el sector de La Cocha, campo volcánico Guamuez–Sibundoy.',
    url: 'https://www2.sgc.gov.co',
  },
  shearer2019: {
    cita: 'Shearer, P. M. (2019). Introduction to Seismology (3.ª ed.). Cambridge University Press.',
  },
  stein2003: {
    cita: 'Stein, S., & Wysession, M. (2003). An Introduction to Seismology, Earthquakes, and Earth Structure. Blackwell Publishing.',
  },
  kennett1991: {
    cita: 'Kennett, B. L. N., & Engdahl, E. R. (1991). Traveltimes for global earthquake location and phase identification (IASP91). Geophysical Journal International, 105(2), 429–465.',
  },
} satisfies Record<string, Source>;

// ─── Línea de tiempo: eventos verificados ───
// Magnitud en Mw salvo que se indique otra escala. Cada evento cita su fuente.
export interface TimelineItem {
  id: string;
  /** Fecha ISO (YYYY-MM-DD) o año si no hay fecha exacta. */
  date: string;
  year: number;
  /** Magnitud mostrada (p. ej. "Mw 6.7 (estimada)") o null si no aplica. */
  magnitude: string | null;
  title: string;
  description: string;
  event_type: 'tectonic' | 'volcanic';
  source: Source;
}

/**
 * Eventos de la historia sísmica y volcánica de Nariño, con fuente por evento.
 * Datos tomados de Sarabia y Cifuentes (2018) y boletines del SGC/OVSP, según
 * lo aportado y verificado. Se omiten 2016 y 2023 por no contar con una ficha
 * oficial citable con sus parámetros; pueden añadirse con su enlace del SGC/USGS.
 */
export const TIMELINE: TimelineItem[] = [
  {
    id: 'sismo-1834',
    date: '1834-01-20',
    year: 1834,
    magnitude: 'Mw 6.7 (estimada por daños)',
    title: 'Sismo de la región de Santiago (Putumayo)',
    description:
      'Magnitud Mw 6.7 estimada a partir de los daños (no por registro instrumental). Sismo superficial asociado al sistema de fallas de Afiladores. Alcanzó intensidad VIII (EMS-98) en Pasto.',
    event_type: 'tectonic',
    source: SRC.sarabia2018,
  },
  {
    id: 'sismo-1906',
    date: '1906-01-31',
    year: 1906,
    magnitude: 'Mw 8.4',
    title: 'Gran sismo de la costa pacífica',
    description:
      'Uno de los mayores sismos instrumentales del mundo, en la zona de subducción frente a la costa pacífica de Colombia y Ecuador. Magnitud Mw 8.4 según el Sistema de Información de Sismicidad Histórica del SGC.',
    event_type: 'tectonic',
    source: SRC.sarabia2018,
  },
  {
    id: 'sismo-1935-tangua',
    date: '1935-08-07',
    year: 1935,
    magnitude: 'Mw 6.1',
    title: 'Sismo de Tangua',
    description: 'Sismo cortical en el sur de Nariño, cerca de Tangua.',
    event_type: 'tectonic',
    source: SRC.sarabia2018,
  },
  {
    id: 'sismo-1935-imues',
    date: '1935-10-26',
    year: 1935,
    magnitude: 'Mw 5.9',
    title: 'Sismo de Imués (falla de Romeral)',
    description: 'Sismo cortical asociado al sistema de fallas de Romeral, cerca de Imués.',
    event_type: 'tectonic',
    source: SRC.sarabia2018,
  },
  {
    id: 'sismo-1936',
    date: '1936-07-17',
    year: 1936,
    magnitude: 'Mw 6.3',
    title: 'Sismo de Túquerres',
    description: 'Sismo cortical en el altiplano de Túquerres, sur de Nariño.',
    event_type: 'tectonic',
    source: SRC.sarabia2018,
  },
  {
    id: 'sismo-1947',
    date: '1947-07-14',
    year: 1947,
    magnitude: 'Mw 6.1',
    title: 'Sismo de Pasto (falla de Romeral)',
    description:
      'Sismo cortical asociado a la falla de Romeral. Alcanzó intensidad VIII en Pasto; se reportó la demolición de unas 500 casas de adobe o ladrillo sin refuerzo.',
    event_type: 'tectonic',
    source: SRC.sarabia2018,
  },
  {
    id: 'sismo-1979',
    date: '1979-12-12',
    year: 1979,
    magnitude: 'Mw 8.1',
    title: 'Sismo de Tumaco',
    description:
      'Sismo de subducción frente a la costa pacífica, a unos 25 km de profundidad. Generó un tsunami que afectó la costa de Nariño.',
    event_type: 'tectonic',
    source: SRC.usgsTumaco1979,
  },
  {
    id: 'galeras-1993',
    date: '1993-01-14',
    year: 1993,
    magnitude: null,
    title: 'Erupción del Galeras durante una visita al cráter',
    description:
      'Erupción súbita durante un taller científico internacional (programa Decade Volcano). Fallecieron 9 personas: 6 científicos y 3 visitantes que se encontraban en el cráter. Marcó un cambio en los protocolos de seguridad en vulcanología.',
    event_type: 'volcanic',
    source: SRC.baxter1997,
  },
  {
    id: 'galeras-2006',
    date: '2006-07-12',
    year: 2006,
    magnitude: null,
    title: 'Erupción explosiva del Galeras',
    description:
      'Erupción explosiva con una columna eruptiva de alrededor de 8 km de altura, según el boletín semestral del OVSP (II semestre de 2006).',
    event_type: 'volcanic',
    source: SRC.ovsp,
  },
  {
    id: 'galeras-2004-2009',
    date: '2004',
    year: 2004,
    magnitude: null,
    title: 'Periodo eruptivo del Galeras (2004–2009)',
    description:
      'Entre 2004 y 2009 el Galeras tuvo 17 erupciones explosivas, 10 de ellas en 2009, según el SGC. Fue uno de los periodos de mayor actividad reciente del volcán.',
    event_type: 'volcanic',
    source: SRC.ovsp,
  },
  {
    id: 'cocha-2024',
    date: '2024-08-23',
    year: 2024,
    magnitude: null,
    title: 'Enjambre sísmico de La Cocha',
    description:
      'Enjambre en el campo volcánico Guamuez–Sibundoy (sector de La Cocha). El SGC reportó 966 sismos, 34 de ellos con magnitud M ≥ 2.0 (boletín del 23 de agosto de 2024).',
    event_type: 'volcanic',
    source: SRC.sgcCocha2024,
  },
];

// ─── Metadatos de los tipos de onda (sin "daño" ni "componente fija") ───
export interface WaveInfo {
  key: 'P' | 'S' | 'Love' | 'Rayleigh';
  name: string;
  /** Rango de velocidad típico, en las mismas unidades del Simulador (km/s). */
  speed: string;
  /** Movimiento de partícula (física). */
  motion: string;
  type: 'cuerpo' | 'superficial';
  desc: string;
  source: Source;
}

export const WAVE_INFO: WaveInfo[] = [
  {
    key: 'P',
    name: 'Onda P (primaria)',
    speed: '≈ 3–8 km/s',
    motion: 'Longitudinal: compresión y dilatación en la dirección de propagación',
    type: 'cuerpo',
    desc:
      'Onda de cuerpo más rápida; es la primera en llegar. El material se comprime y se dilata en la misma dirección en que viaja la onda, como el sonido. Se propaga en sólidos y en líquidos.',
    source: SRC.shearer2019,
  },
  {
    key: 'S',
    name: 'Onda S (secundaria)',
    speed: '≈ 2–5 km/s',
    motion: 'Transversal: desplazamiento perpendicular a la dirección de propagación',
    type: 'cuerpo',
    desc:
      'Onda de cuerpo más lenta que la P. El material se desplaza perpendicularmente a la dirección de propagación (cizalla). No se propaga en líquidos, lo que ayudó a inferir que el núcleo externo es líquido.',
    source: SRC.shearer2019,
  },
  {
    key: 'Love',
    name: 'Onda Love',
    speed: '≈ 2–4.5 km/s',
    motion: 'Superficial: cizalla horizontal, perpendicular a la propagación',
    type: 'superficial',
    desc:
      'Onda superficial de cizalla horizontal. Resulta de ondas S atrapadas en capas superficiales. Su amplitud es máxima en la superficie y decrece con la profundidad.',
    source: SRC.shearer2019,
  },
  {
    key: 'Rayleigh',
    name: 'Onda Rayleigh',
    speed: '≈ 1–4 km/s',
    motion: 'Superficial: movimiento elíptico retrógrado en el plano vertical',
    type: 'superficial',
    desc:
      'Onda superficial con movimiento elíptico retrógrado (combina componente vertical y horizontal). Su amplitud es máxima en la superficie y decrece con la profundidad. Suele dominar el movimiento a grandes distancias.',
    source: SRC.shearer2019,
  },
];

/** Nota común sobre la componente observada (reemplaza "Componente: Z"). */
export const COMPONENT_NOTE =
  'En qué componente (vertical, norte o este) se observa mejor cada onda no es fijo: depende del ángulo de llegada al sismómetro y de la orientación del movimiento respecto a la estación.';

// ─── Clasificación de profundidad (estándar) ───
export interface DepthClass {
  label: string;
  from: number;
  to: number;
  desc: string;
}

/**
 * Clasificación estándar por profundidad del foco (Stein y Wysession, 2003).
 * No se usa ninguna "intensidad" calculada solo con la profundidad.
 */
export const DEPTH_CLASSES: DepthClass[] = [
  { label: 'Superficial', from: 0, to: 70, desc: 'Foco a menos de 70 km. Son los más frecuentes en la corteza.' },
  { label: 'Intermedio', from: 70, to: 300, desc: 'Foco entre 70 y 300 km, asociado a zonas de subducción.' },
  { label: 'Profundo', from: 300, to: 700, desc: 'Foco entre 300 y 700 km, en la placa que subduce.' },
];

/** Factores reales de la intensidad en superficie (no solo la profundidad). */
export const INTENSITY_FACTORS =
  'La intensidad que se siente en un lugar depende de varios factores: la magnitud del sismo, la distancia al foco, la profundidad, el tipo de suelo (que puede amplificar el movimiento) y la vulnerabilidad de las construcciones. La profundidad por sí sola no determina el daño.';

// ─── Quiz verificado (con explicación y fuente por pregunta) ───
export interface QuizItem {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  source: Source;
  category: 'ondas' | 'volcanes' | 'tectonica' | 'general';
}

/**
 * Preguntas revisadas: una sola respuesta correcta por pregunta y con fuente.
 * Se retiró la pregunta que ofrecía "SGC" e "INGEOMINAS" como opciones distintas
 * (INGEOMINAS se fusionó en el actual Servicio Geológico Colombiano, así que
 * eran la misma entidad y la pregunta tenía dos respuestas válidas).
 */
export const QUIZ: QuizItem[] = [
  {
    id: 'q-onda-rapida',
    question: '¿Cuál es la onda sísmica más rápida?',
    options: ['Onda S', 'Onda P', 'Onda Love', 'Onda Rayleigh'],
    correct_index: 1,
    explanation: 'La onda P es la más rápida; por eso es la primera en registrarse en un sismograma.',
    source: SRC.shearer2019,
    category: 'ondas',
  },
  {
    id: 'q-onda-s-liquidos',
    question: '¿Las ondas S se propagan por los líquidos?',
    options: ['Sí, igual que en sólidos', 'No', 'Solo en agua salada', 'Solo a gran presión'],
    correct_index: 1,
    explanation: 'Las ondas S son de cizalla y no se propagan en líquidos. Su ausencia tras el núcleo externo indicó que este es líquido.',
    source: SRC.shearer2019,
    category: 'ondas',
  },
  {
    id: 'q-rayleigh-movimiento',
    question: '¿Qué movimiento de partícula caracteriza a la onda Rayleigh?',
    options: ['Compresión longitudinal', 'Cizalla horizontal', 'Elíptico retrógrado', 'Sin movimiento'],
    correct_index: 2,
    explanation: 'La onda Rayleigh produce un movimiento elíptico retrógrado en el plano vertical, con amplitud máxima en la superficie.',
    source: SRC.shearer2019,
    category: 'ondas',
  },
  {
    id: 'q-nazca',
    question: '¿Qué placa se subduce frente a la costa de Nariño?',
    options: ['Placa del Caribe', 'Placa de Cocos', 'Placa de Nazca', 'Placa Antártica'],
    correct_index: 2,
    explanation: 'La placa de Nazca se subduce bajo la placa Sudamericana frente a la costa pacífica, lo que explica la sismicidad y el volcanismo de la región.',
    source: SRC.stein2003,
    category: 'tectonica',
  },
  {
    id: 'q-profundidad',
    question: '¿Hasta qué profundidad se considera superficial un sismo?',
    options: ['Hasta 70 km', 'Hasta 300 km', 'Hasta 700 km', 'Hasta 10 km'],
    correct_index: 0,
    explanation: 'Según la clasificación estándar, un sismo es superficial si su foco está a menos de 70 km; intermedio entre 70 y 300 km, y profundo entre 300 y 700 km.',
    source: SRC.stein2003,
    category: 'general',
  },
  {
    id: 'q-cfl',
    question: 'En el método de diferencias finitas, ¿para qué sirve la condición CFL?',
    options: [
      'Para hacer la simulación más rápida',
      'Para que la solución numérica sea estable',
      'Para aumentar la magnitud',
      'Para cambiar el tipo de fuente',
    ],
    correct_index: 1,
    explanation: 'La condición de Courant–Friedrichs–Lewy (dt ≤ dx/(Vp·√2) en 2D) limita el paso de tiempo para que el esquema explícito sea estable; si se viola, la solución diverge.',
    source: {
      cita: 'Courant, R., Friedrichs, K., & Lewy, H. (1928). Über die partiellen Differenzengleichungen der mathematischen Physik. Mathematische Annalen, 100, 32–74.',
    },
    category: 'general',
  },
  {
    id: 'q-galeras-1993',
    question: '¿Qué ocurrió en el Galeras el 14 de enero de 1993?',
    options: [
      'Una erupción sin víctimas',
      'Una erupción durante una visita científica al cráter, con víctimas',
      'Un sismo de magnitud 8',
      'La formación del volcán',
    ],
    correct_index: 1,
    explanation: 'El Galeras hizo erupción mientras un grupo científico estaba en el cráter durante un taller internacional; fallecieron 9 personas (6 científicos y 3 visitantes).',
    source: SRC.baxter1997,
    category: 'volcanes',
  },
];
