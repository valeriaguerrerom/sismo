// @vitest-environment jsdom
/**
 * HU017 — Exportar PNG.
 * Prueba exportPNG (src/lib/exportImage): rama WebGL (canvas activo) y rama
 * fallback (html2canvas sobre el área de visualización).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock de html2canvas: devuelve un "canvas" con toDataURL.
vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({
    toDataURL: () => 'data:image/png;base64,' + 'A'.repeat(2000),
  })),
}));

import { exportPNG } from './exportImage';
import html2canvas from 'html2canvas';

let clickedHref = '';
let clickedDownload = '';

beforeEach(() => {
  document.body.innerHTML = '';
  clickedHref = '';
  clickedDownload = '';
  // Interceptar la descarga: capturar href y download del <a> al hacer click.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clickedHref = this.href;
    clickedDownload = this.download;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('HU017 — Exportar PNG', () => {
  it('CPR-017-1 test_exportar_png_webgl: exporta desde el canvas WebGL (width > 100)', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    // toDataURL de jsdom no pinta; lo mockeamos con un dataURL largo válido.
    canvas.toDataURL = () => 'data:image/png;base64,' + 'B'.repeat(2000);
    document.body.appendChild(canvas);

    const source = await exportPNG(document);

    expect(source).toBe('webgl');
    expect(html2canvas).not.toHaveBeenCalled();
    expect(clickedDownload).toBe('sismonarino_2d.png');
    expect(clickedHref).toMatch(/^data:image\/png/);
  });

  it('CPR-017-2 test_exportar_png_fallback: sin canvas WebGL usa html2canvas del área de visualización', async () => {
    // Sin <canvas> válido, pero con el área [data-viz-area].
    const viz = document.createElement('div');
    viz.setAttribute('data-viz-area', '');
    document.body.appendChild(viz);

    const source = await exportPNG(document);

    expect(source).toBe('html2canvas');
    expect(html2canvas).toHaveBeenCalledTimes(1);
    expect(clickedDownload).toBe('sismonarino_2d.png');
    expect(clickedHref).toMatch(/^data:image\/png/);
  });
});
