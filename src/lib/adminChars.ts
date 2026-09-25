/**
 * Utilidades de presentación y caracterización de usuarios para el panel admin.
 *
 * - `titleCase`: normaliza SOLO para mostrar (no cambia lo guardado en la BD),
 *   evitando mayúsculas sostenidas ("LICEO" -> "Liceo").
 * - `normKey`: clave de agrupación insensible a mayúsculas y tildes.
 * - `characterize`: agrega los usuarios por ocupación, institución, área de
 *   interés y ciudad, aplicando alias de ciudad (p. ej. "San Juan de Pasto" y
 *   "PASTO" cuentan como "Pasto").
 * @module adminChars
 */
import type { AdminUser } from './adminData';

/** Palabras que se dejan en minúscula dentro de un título (conectores). */
const LOWER_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'el', 'o', 'u', 'para']);

/**
 * Convierte a formato título para MOSTRAR (no muta la BD). Respeta acrónimos
 * cortos (2-3 letras, p. ej. "SGC", "UN") y pone conectores en minúscula.
 */
export function titleCase(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  return s
    .split(/\s+/)
    .map((word, i) => {
      // Acrónimos: 2-3 letras todas mayúsculas y sin dígitos se conservan.
      if (/^[A-ZÁÉÍÓÚÑ]{2,3}$/.test(word)) return word;
      const lower = word.toLocaleLowerCase('es');
      if (i > 0 && LOWER_WORDS.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
    })
    .join(' ');
}

/** Quita tildes y pasa a minúscula para comparar/agrupar sin ambigüedad. */
export function normKey(raw: string): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Alias de ciudad: distintas formas que deben contar como una sola. */
const CITY_ALIASES: Record<string, string> = {
  'san juan de pasto': 'Pasto',
  'pasto': 'Pasto',
  'santiago de cali': 'Cali',
  'cali': 'Cali',
  'bogota': 'Bogotá',
  'bogota dc': 'Bogotá',
  'bogota d c': 'Bogotá',
  'santa fe de bogota': 'Bogotá',
};

/** Etiqueta canónica de ciudad (aplica alias; si no, título del valor). */
export function canonicalCity(raw: string): string {
  const key = normKey(raw);
  if (!key) return '';
  return CITY_ALIASES[key] ?? titleCase(raw);
}

/** Un grupo de la caracterización: etiqueta visible y conteo. */
export interface CharBucket {
  label: string;
  count: number;
}

/** Caracterización agregada por dimensión. */
export interface Characterization {
  ocupacion: CharBucket[];
  institucion: CharBucket[];
  area: CharBucket[];
  ciudad: CharBucket[];
  total: number;
}

interface CountOptions {
  /** Función que canoniza el valor a su etiqueta visible. */
  canonical: (raw: string) => string;
  /** Si se da, agrupa el resto (más allá de topN) en "Otras/Otros". */
  topN?: number;
  otherLabel?: string;
}

/** Cuenta valores no vacíos agrupando por clave normalizada. */
function countBy(users: AdminUser[], pick: (u: AdminUser) => string, opts: CountOptions): CharBucket[] {
  const map = new Map<string, { label: string; count: number }>();
  let sinDato = 0;
  for (const u of users) {
    const raw = (pick(u) ?? '').trim();
    if (!raw) { sinDato++; continue; }
    const label = opts.canonical(raw);
    const key = normKey(label);
    const cur = map.get(key);
    if (cur) cur.count++;
    else map.set(key, { label, count: 1 });
  }
  let buckets = Array.from(map.values()).sort((a, b) => b.count - a.count);

  if (opts.topN && buckets.length > opts.topN) {
    const top = buckets.slice(0, opts.topN);
    const restCount = buckets.slice(opts.topN).reduce((s, b) => s + b.count, 0);
    top.push({ label: opts.otherLabel ?? 'Otras', count: restCount });
    buckets = top;
  }
  if (sinDato > 0) buckets.push({ label: 'Sin dato', count: sinDato });
  return buckets;
}

/**
 * Genera la caracterización agregada de los usuarios.
 *
 * Reglas de agrupación:
 * - Insensible a mayúsculas y tildes (NFD + strip diacríticos + lower).
 * - Ciudad: alias explícitos (p. ej. "San Juan de Pasto" -> "Pasto").
 * - Institución: top 5 y el resto agrupado como "Otras".
 * - Los vacíos se cuentan aparte como "Sin dato".
 */
export function characterize(users: AdminUser[]): Characterization {
  return {
    ocupacion: countBy(users, u => u.occupation, { canonical: titleCase }),
    institucion: countBy(users, u => u.institution, { canonical: titleCase, topN: 5, otherLabel: 'Otras' }),
    area: countBy(users, u => u.research_area, { canonical: titleCase, topN: 8, otherLabel: 'Otras' }),
    ciudad: countBy(users, u => u.city, { canonical: canonicalCity, topN: 8, otherLabel: 'Otras' }),
    total: users.length,
  };
}

/** Construye el CSV de la caracterización para exportar (para la tesis). */
export function characterizationCsv(c: Characterization): string {
  const rows: string[] = ['Dimensión,Categoría,Usuarios'];
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const add = (dim: string, buckets: CharBucket[]) => {
    for (const b of buckets) rows.push(`${esc(dim)},${esc(b.label)},${b.count}`);
  };
  add('Ocupación', c.ocupacion);
  add('Institución', c.institucion);
  add('Área de interés', c.area);
  add('Ciudad', c.ciudad);
  return rows.join('\n');
}
