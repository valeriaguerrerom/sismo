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

/** Clases Tailwind compartidas para los inputs de los formularios de auth. */
export const inputCls = 'w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#C4553A] bg-stone-50';
