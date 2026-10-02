/**
 * Estilo compartido de los reportes PDF (jsPDF).
 *
 * Layout A4 y paleta comunes a los generadores de PDF (`reportPdfBuilder.ts`
 * y `map3dReport.ts`) para que no se desincronicen. Los colores coinciden con
 * la paleta de la aplicación.
 * @module pdfStyle
 */

/** Terna RGB para jsPDF. */
export type RGB = [number, number, number];

/** Ancho de página A4 en mm. */
export const PAGE_W = 210;
/** Margen lateral en mm. */
export const MARGIN = 15;
/** Ancho útil del contenido (A4 menos los dos márgenes). */
export const CONTENT_W = PAGE_W - MARGIN * 2;

/** Paleta base de los reportes (coincide con la paleta de la app). */
export const COLORS: {
  primary: RGB; green: RGB; gold: RGB; text: RGB; muted: RGB; line: RGB;
} = {
  primary: [196, 85, 58],
  green: [45, 106, 79],
  gold: [212, 168, 83],
  text: [26, 26, 46],
  muted: [120, 113, 108],
  line: [214, 211, 209],
};

/** Formatea una fecha (o ahora) en es-CO, fecha larga + hora corta. */
export function fmtDate(d?: string | Date): string {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
}
