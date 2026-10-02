/**
 * Constantes compartidas de los campos de investigador.
 *
 * Separadas de `ResearcherFields.tsx` para que ese archivo exporte solo
 * componentes (requisito de react-refresh / fast refresh).
 */

/** Lista de ocupaciones del formulario de perfil de investigador. */
export const OCCUPATIONS = [
  'Estudiante de pregrado', 'Estudiante de posgrado', 'Docente', 'Investigador(a)',
  'Profesional (geociencias / ingeniería)', 'Funcionario(a) de entidad pública', 'Otro',
];

/** Instituciones sugeridas (las más comunes del proyecto) + "Otra". */
export const INSTITUTIONS = [
  'Universidad Mariana',
  'Servicio Geológico Colombiano',
  'Universidad de Nariño',
  'Otra',
];

/** Áreas de investigación o interés sugeridas + "Otra". */
export const RESEARCH_AREAS = [
  'Sismología',
  'Vulcanología',
  'Geotecnia',
  'Geofísica',
  'Geología',
  'Ingeniería civil / sísmica',
  'Gestión del riesgo de desastres',
  'Educación y divulgación',
  'Otra',
];

/** Propósitos de uso sugeridos + "Otro". */
export const USAGE_PURPOSES = [
  'Tesis o trabajo de grado',
  'Docencia',
  'Investigación',
  'Análisis de eventos del Galeras',
  'Aprendizaje personal',
  'Otro',
];

/**
 * Países: Colombia primero (valor por defecto), luego Ecuador y Perú (vecinos
 * del dominio), y el resto en orden. Lista acotada pero suficiente; "Otro"
 * permite escribir uno distinto.
 */
export const COUNTRIES = [
  'Colombia', 'Ecuador', 'Perú', 'Venezuela', 'Panamá', 'México',
  'Argentina', 'Chile', 'España', 'Estados Unidos', 'Otro',
];

/**
 * Ciudades sugeridas: municipios de Nariño (Pasto primero) donde hay actividad
 * sísmica/volcánica del proyecto, más "Otra" para escribir cualquier otra.
 */
export const CITIES = [
  'Pasto', 'Tumaco', 'Ipiales', 'Túquerres', 'La Cruz', 'Cumbal',
  'La Unión', 'Samaniego', 'Popayán', 'Otra',
];

/** Valor que activa el input libre en los selects con opción "Otro/Otra". */
export const OTHER_VALUES = ['Otro', 'Otra'];

/** Clases Tailwind compartidas para los inputs de los formularios de auth. */
export const inputCls = 'w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#C4553A] bg-stone-50';
