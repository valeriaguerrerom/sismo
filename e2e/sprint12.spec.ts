import { test } from './support/fixtures';

/**
 * Sprint 12 — HU021 (recuperar contraseña), HU022 (gestión del perfil propio) y
 * HU037 (verificación en dos pasos). Parte Playwright.
 *
 * TODOS los casos de esta parte se OMITEN porque requieren servicios externos
 * reales (correo SMTP, app autenticadora / enrolamiento TOTP) o modifican datos
 * que NO son reportes propios de la cuenta de prueba (perfil, estado de la
 * cuenta, segundo factor), y no hay una Supabase de pruebas aparte. Se dejan
 * registrados como `skip` con su motivo para que queden trazados en el reporte.
 *
 * La parte de HU004 (administración de usuarios) se cubre en
 * `backend/tests/test_sprint12.py` (pytest, contra un Supabase simulado).
 */

const PROD_WRITE = 'evitar escritura en la base de datos de producción, no hay Supabase de pruebas aparte';
const EXTERNAL = 'requiere un servicio externo real que no se puede automatizar con la cuenta de prueba';

test.describe('HU021 — Recuperar contraseña (omitida)', () => {
  test('CPR-021-1 test_solicitar_recuperacion: envía un enlace al correo', async () => {
    test.skip(true, `OMITIDO: ${EXTERNAL} (envío de correo SMTP real).`);
  });
  test('CPR-021-2 test_abrir_enlace_correo: abre el formulario de nueva contraseña', async () => {
    test.skip(true, `OMITIDO: ${EXTERNAL} (requiere el enlace que llega al correo real).`);
  });
  test('CPR-021-3 test_definir_nueva_contrasena_valida: actualiza la contraseña', async () => {
    test.skip(true, `OMITIDO: ${EXTERNAL} (requiere el token de recuperación del correo) y ${PROD_WRITE}.`);
  });
  test('CPR-021-4 test_definir_contrasena_debil: indica la regla incumplida y no la guarda', async () => {
    test.skip(true, `OMITIDO: ${EXTERNAL} (la pantalla de nueva contraseña solo se abre con el token del correo).`);
  });
});

test.describe('HU022 — Gestión del perfil propio (omitida)', () => {
  test('CPR-022-1 test_ingresar_perfil_incompleto: pide completar el perfil antes de abrir un módulo', async () => {
    test.skip(true, `OMITIDO: la cuenta de prueba tiene el perfil completo; forzar un perfil incompleto implicaría modificarlo (${PROD_WRITE}).`);
  });
  test('CPR-022-2 test_editar_institucion: guarda los cambios', async () => {
    test.skip(true, `OMITIDO: editar la institución modifica el perfil de la cuenta (dato propio pero no es un reporte); ${PROD_WRITE}.`);
  });
  test('CPR-022-3 test_desactivar_reactivar_cuenta: la desactiva y permite reactivarla', async () => {
    test.skip(true, `OMITIDO: cambia el estado de la cuenta; ${PROD_WRITE}.`);
  });
  test('CPR-022-4 test_eliminar_cuenta: elimina la cuenta y anonimiza sus reportes', async () => {
    test.skip(true, `OMITIDO: elimina la cuenta de prueba; ${PROD_WRITE}.`);
  });
});

test.describe('HU037 — Verificación en dos pasos (omitida)', () => {
  test('CPR-037-1 test_iniciar_activacion: muestra el QR y el secreto', async () => {
    test.skip(true, `OMITIDO: ${EXTERNAL} (enrola un factor TOTP real en la cuenta); ${PROD_WRITE}.`);
  });
  test('CPR-037-2 test_confirmar_codigo_valido: activa el segundo factor', async () => {
    test.skip(true, `OMITIDO: ${EXTERNAL} (requiere el código de una app autenticadora real).`);
  });
  test('CPR-037-3 test_iniciar_sesion_segundo_factor: pide el código tras la contraseña', async () => {
    test.skip(true, `OMITIDO: ${EXTERNAL} (requiere una cuenta con 2FA real activo).`);
  });
  test('CPR-037-4 test_ingresar_codigo_errado: muestra un mensaje y no da acceso', async () => {
    test.skip(true, `OMITIDO: ${EXTERNAL} (requiere una cuenta con 2FA real activo).`);
  });
  test('CPR-037-5 test_desactivar_segundo_factor: retira el segundo factor', async () => {
    test.skip(true, `OMITIDO: ${EXTERNAL} (requiere una cuenta con 2FA real activo); ${PROD_WRITE}.`);
  });
});
