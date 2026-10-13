// Ensambla la sección "API" de la documentación en public/docs/api:
//   1. Copia los assets versionados del visor Redoc (index.html + bundle
//      self-hosted) desde docs-assets/api.
//   2. Exporta el esquema OpenAPI a openapi.json ejecutando el script de Python
//      del backend (no abre puertos ni hace peticiones de red).
//
// La referencia es estática y de SOLO LECTURA: Redoc no ofrece "Try it out" y
// todo (bundle y esquema) se sirve en local, sin ningún CDN.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = resolve(root, 'docs-assets', 'api');
const outDir = resolve(root, 'public', 'docs', 'api');

mkdirSync(outDir, { recursive: true });

// 1. Visor Redoc self-hosted (index.html + redoc.standalone.js).
cpSync(srcDir, outDir, { recursive: true });

// 2. Esquema OpenAPI estático. Se usa "py" en Windows y "python" como respaldo.
const outJson = resolve(outDir, 'openapi.json');
const backendDir = resolve(root, 'backend');
const candidates = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python'];

let exported = false;
let lastError;
for (const bin of candidates) {
  try {
    execFileSync(bin, ['export_openapi.py', outJson], {
      cwd: backendDir,
      stdio: 'inherit',
    });
    exported = true;
    break;
  } catch (err) {
    lastError = err;
  }
}

if (!exported) {
  console.error('No se pudo ejecutar export_openapi.py con ningún intérprete de Python.');
  throw lastError;
}

console.log('Sección API lista en public/docs/api');
