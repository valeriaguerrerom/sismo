/**
 * Exportación de la visualización a PNG (HU017 / RF-17).
 *
 * Estrategia en dos niveles:
 *  1. Si hay un canvas WebGL válido (la vista 3D / mapa de calor), se exporta
 *     directamente con `toDataURL` (rápido y fiel).
 *  2. Si no, se usa html2canvas sobre el área de visualización (`[data-viz-area]`)
 *     para capturar los sismogramas 2D (SVG/HTML).
 *
 * Extraído de ResultsPanel a un módulo de lib para poder probarlo de forma
 * automatizada (Vitest) contra el código real, no una copia.
 * @module exportImage
 */
import html2canvas from 'html2canvas';

/** Origen del PNG generado (útil para pruebas y logs). */
export type PngSource = 'webgl' | 'html2canvas' | 'none';

const FILENAME = 'sismonarino_2d.png';

function triggerDownload(href: string) {
  const link = document.createElement('a');
  link.download = FILENAME;
  link.href = href;
  link.click();
}

/**
 * Exporta la visualización actual a un PNG descargable.
 *
 * @param doc Documento (inyectable para pruebas); por defecto `document`.
 * @returns Promesa con la fuente usada: 'webgl', 'html2canvas' o 'none'
 *          (si no hay canvas ni área de visualización).
 */
export async function exportPNG(doc: Document = document): Promise<PngSource> {
  const webglCanvas = doc.querySelector('canvas') as HTMLCanvasElement | null;
  if (webglCanvas && webglCanvas.width > 100) {
    const dataUrl = webglCanvas.toDataURL('image/png');
    if (dataUrl.length > 1000) {
      triggerDownload(dataUrl);
      return 'webgl';
    }
  }

  const vizArea = doc.querySelector('[data-viz-area]') as HTMLElement | null;
  if (!vizArea) return 'none';

  const canvas = await html2canvas(vizArea, {
    backgroundColor: '#FAFAF8', scale: 2, useCORS: true, logging: false,
  });
  triggerDownload(canvas.toDataURL('image/png'));
  return 'html2canvas';
}
