// Copia la página índice de /docs (portada con enlaces a backend, frontend y
// API) desde docs-assets/index.html a public/docs/index.html, y hace una
// limpieza final: elimina los source maps (*.map) que no se necesitan en la
// documentación publicada.
//
// Se ejecuta al final de "docs:build", una vez generadas las tres secciones.
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'docs-assets', 'index.html');
const outDir = resolve(root, 'public', 'docs');
const out = resolve(outDir, 'index.html');

mkdirSync(outDir, { recursive: true });
copyFileSync(src, out);

console.log('Página índice de /docs lista en public/docs/index.html');

// Limpieza: quitar source maps (*.map) de toda la documentación generada.
let removed = 0;
function pruneMaps(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      pruneMaps(full);
    } else if (entry.endsWith('.map')) {
      rmSync(full);
      removed += 1;
    }
  }
}
pruneMaps(outDir);
console.log(`Source maps eliminados de /docs: ${removed}`);
