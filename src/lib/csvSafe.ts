/**
 * Protección contra inyección de fórmulas en hojas de cálculo (CWE-1236).
 *
 * Al exportar datos a CSV o XLSX, una celda de texto cuyo valor empieza por
 * `=`, `+`, `-`, `@` o un carácter de control (tab, CR) es interpretada como
 * fórmula por Excel, LibreOffice y Google Sheets al abrir el archivo. Un valor
 * guardado por un usuario (nombre, institución, título de un reporte…) podría
 * así ejecutar fórmulas al abrir la exportación en el equipo de un administrador.
 *
 * La mitigación recomendada por OWASP es anteponer un apóstrofo a los valores
 * peligrosos: la hoja lo trata como texto literal y no evalúa la fórmula.
 * @module csvSafe
 */

/** Caracteres que, al inicio de una celda, disparan la evaluación de fórmulas. */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Neutraliza una celda de texto para que las hojas de cálculo no la evalúen
 * como fórmula. Si el valor empieza por un carácter peligroso, le antepone un
 * apóstrofo. Los valores que no son texto (números, null, undefined) se
 * devuelven tal cual.
 *
 * @param value Valor de la celda.
 * @returns El valor saneado (string) o el valor original si no es texto.
 */
export function sanitizeCell<T>(value: T): T | string {
  if (typeof value !== 'string') return value;
  if (value.length > 0 && FORMULA_TRIGGERS.includes(value[0])) {
    return `'${value}`;
  }
  return value;
}
