/*
 * Red de seguridad para la limpieza de datos de las pruebas E2E en producción.
 *
 * La suite borra desde la UI los reportes que crea; pero si una prueba se cae a
 * mitad (p. ej. por un corte de red), puede dejar un reporte huérfano. Este
 * script inicia sesión como la cuenta de prueba (con el secreto DERIVADO con
 * PBKDF2, igual que la app) y lista/borra reportes cuyo título empiece por
 * "E2E ".
 *
 * Uso:
 *   node scripts/e2e-cleanup.mjs            # solo lista (incluye otros reportes)
 *   node scripts/e2e-cleanup.mjs --delete   # borra los de título "E2E ..."
 *
 * Lee credenciales de .env (VITE_SUPABASE_URL/ANON_KEY) y .env.e2e
 * (E2E_USER_EMAIL/PASSWORD). Ninguno se sube al repo.
 */
import { webcrypto as crypto } from 'node:crypto';
import { readFileSync } from 'node:fs';

function envFromFile(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
  } catch {
    /* archivo ausente */
  }
  return out;
}
const root = envFromFile('.env');
const e2e = envFromFile('.env.e2e');
const URL = root.VITE_SUPABASE_URL;
const ANON = root.VITE_SUPABASE_ANON_KEY;
const email = e2e.E2E_USER_EMAIL;
const password = e2e.E2E_USER_PASSWORD;
const doDelete = process.argv.includes('--delete');

if (!URL || !ANON || !email || !password) {
  console.error('Faltan credenciales en .env / .env.e2e');
  process.exit(1);
}

const toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function derive(mail, pass) {
  const enc = new TextEncoder();
  const salt = enc.encode('sismonarino:' + mail.trim().toLowerCase());
  const km = await crypto.subtle.importKey('raw', enc.encode(pass), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, km, 256);
  return toHex(bits);
}

const secret = await derive(email, password);
const loginRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON },
  body: JSON.stringify({ email, password: secret }),
});
const auth = await loginRes.json();
if (!loginRes.ok) { console.error('login falló:', auth); process.exit(1); }
const H = { apikey: ANON, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' };
const uid = auth.user?.id;

const repRes = await fetch(`${URL}/rest/v1/simulation_reports?user_id=eq.${uid}&select=id,title,created_at&order=created_at.desc`, { headers: H });
const reports = await repRes.json();
if (!Array.isArray(reports)) { console.error(reports); process.exit(1); }
console.log(`Reportes totales de la cuenta de prueba: ${reports.length}`);
const e2eReports = reports.filter((r) => (r.title || '').startsWith('E2E '));
console.log(`Reportes de prueba (título "E2E ..."): ${e2eReports.length}`);
for (const r of e2eReports) console.log(`  - ${r.title}  ${r.created_at}  id=${r.id}`);
const others = reports.filter((r) => !(r.title || '').startsWith('E2E '));
if (others.length) {
  console.log(`\nOtros reportes en la cuenta (${others.length}) — revisa si alguno es de prueba:`);
  for (const r of others.slice(0, 20)) console.log(`  - ${r.title || '(sin título)'}  ${r.created_at}  id=${r.id}`);
}

if (doDelete && e2eReports.length) {
  for (const r of e2eReports) {
    const del = await fetch(`${URL}/rest/v1/simulation_reports?id=eq.${r.id}`, { method: 'DELETE', headers: H });
    console.log(`  borrado ${r.id}: HTTP ${del.status}`);
  }
  console.log('Limpieza completada.');
}
