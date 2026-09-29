/**
 * Convierte los TTF subset de IBM Plex Sans (Regular/Bold) a base64 y genera
 * src/lib/pdfFont.ts para incrustarlos en jsPDF con soporte Unicode del PDF
 * (griegas λ, μ, ρ; símbolos √ · × ° ² ³ – —; tildes y ñ).
 *
 * El subset se crea antes con pyftsubset (ver scripts/build_pdf_font.ps1 o el
 * comando en docs). Aquí solo se codifican los .ttf ya recortados.
 *
 * uso: node scripts/gen_pdf_font.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = path.resolve('scripts/_fonts');
const reg = (await readFile(path.join(DIR, 'PlexSubset-Regular.ttf'))).toString('base64');
const bold = (await readFile(path.join(DIR, 'PlexSubset-Bold.ttf'))).toString('base64');

const out = `/**
 * Fuente TTF (IBM Plex Sans, OFL) recortada (subset) a los caracteres que usa
 * el PDF: latín básico y extendido (tildes, ñ, ü), griego (λ, μ, ρ…) y símbolos
 * (√ · × ° ² ³ – —). En base64 para incrustar en jsPDF con soporte Unicode.
 * Generado por scripts/gen_pdf_font.mjs — NO editar a mano.
 * @module lib/pdfFont
 */
export const PLEX_REGULAR_B64 = '${reg}';
export const PLEX_BOLD_B64 = '${bold}';
`;

await writeFile(path.resolve('src/lib/pdfFont.ts'), out);
console.log(`pdfFont.ts generado: regular ${reg.length} b64, bold ${bold.length} b64`);
