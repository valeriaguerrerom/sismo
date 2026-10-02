# Seguridad — SismoNariño

Documento vivo de la auditoría de seguridad previa a la revisión de expertos.
Capas principales que NO cambian: **HTTPS** en todo el transporte y **bcrypt**
del lado de Supabase para las contraseñas. Lo que se describe aquí son medidas
adicionales de defensa en profundidad.

---

## Almacenamiento (Supabase Storage): bucket `mseed-raw`

- **Contenido:** los MiniSEED crudos de `backend/data_raw/`, con su ruta
  relativa como key (`Colombia/{id}.mseed`, `Ecuador/{id}.mseed`,
  `datos_mseed/{lp|to|tr|va}/{id}/{canal}.mseed`) y un `manifest.json` con la
  lista de rutas.
- **Quién lo lee:** solo `backend/api/waveforms.py` (`GET /api/waveforms/...`),
  usado por el Mapa 3D. Lee por URL pública anónima; prioriza disco local si
  existe `data_raw/`.
- **Producción:** en Railway `data_raw/` no se copia a la imagen, así que las
  formas de onda reales del Mapa 3D dependen del bucket. El resto de la app no.
- **Escritura:** solo desde `backend/scripts/upload_mseed_storage.py`, que exige
  `SUPABASE_SERVICE_ROLE_KEY` (service_role) de `backend/.env`. El frontend no
  toca Storage (0 referencias a `.storage` en `src/`).
- **Verificado (panel de Supabase):** el bucket tiene **0 políticas de Storage**,
  por lo que `anon` y `authenticated` NO pueden escribir ni listar; solo lectura
  pública de objetos por URL. **Configuración que debe mantenerse:** bucket
  público para lectura, SIN políticas de INSERT/UPDATE/DELETE para `anon` ni
  `authenticated`. La escritura se hace solo offline con la service key.

---

## Contraseñas fuera de F12 (derivación en el cliente)

La contraseña en texto plano **no debe aparecer** en F12 → Network en ningún
flujo. Para lograrlo, el cliente deriva un "secreto de autenticación" y envía
ese valor a Supabase, nunca la contraseña real.

- **Función:** `src/lib/passwordDerive.ts` → `deriveAuthSecret(email, password)`.
- **Esquema:** PBKDF2 con **SHA-256**, **310 000 iteraciones**, sal =
  `"sismonarino:" + email` en minúsculas y sin espacios, salida de **32 bytes**
  (256 bits) en **hexadecimal** (64 caracteres).
- **Dónde se aplica:** `src/lib/auth.tsx` en `signUp`, `signIn` y
  `updatePassword` (este último cubre el restablecimiento por correo y el cambio
  desde el perfil). El `signInWithGoogle` no usa contraseña. El
  `sendPasswordReset` solo envía el correo, no maneja contraseña.
- **Política mínima** (validada sobre la contraseña ORIGINAL antes de derivar,
  en `src/lib/authConsent.ts`): 8+ caracteres, con letra, número y símbolo.
- **Limpieza de estado:** la contraseña original y el secreto derivado se
  limpian del estado tras cada intento (exitoso o fallido) en `Auth.tsx`,
  `ResetPassword.tsx` y `Profile.tsx`, y la copia local del secreto se vacía en
  `auth.tsx` tras cada llamada.
- **No persiste** en localStorage, sessionStorage, cookies, IndexedDB, URL,
  `console.log` ni logs del backend.
- **Inputs:** `type="password"` con `autocomplete="new-password"` (registro,
  nueva contraseña) o `current-password` (login).
- **Mensaje de login genérico:** "Correo o contraseña incorrectos" — no revela
  si el correo existe.
- **Cambio de correo de login:** DESHABILITADO en la app. Como la sal depende
  del correo, cambiarlo rompería la contraseña derivada; por eso la aplicación
  no ofrece cambiar el correo de inicio de sesión. Un cambio de correo requiere
  restablecer la contraseña (flujo "¿Olvidaste tu contraseña?" o reset de admin).

### Supabase Auth (capas del servidor)

- Las contraseñas (el secreto derivado) se guardan con **bcrypt** en Supabase.
- El transporte es **HTTPS**.
- El token de sesión (JWT) lo gestiona `@supabase/supabase-js` con
  `persistSession` + `autoRefreshToken`; se guarda en el almacenamiento local
  del navegador que usa la librería. `signOut()` invalida la sesión local y la
  del servidor.
- Límite de intentos y expiración del token: configurados en el panel de
  Supabase Auth (rate limiting de Auth y expiración del JWT). *(Verificar/anotar
  los valores exactos en el panel.)*

### Restablecer cuentas tras activar la derivación

Las cuentas creadas antes del cambio tienen guardada la contraseña original
(no el derivado), así que deben restablecerse:

- **Admin y cuentas de prueba (local):** `backend/reset_password_derived.py`.
  Corre solo en local con `SUPABASE_SERVICE_ROLE_KEY`, pide el correo y la nueva
  contraseña por consola (oculta, no por argumento ni archivo), deriva con el
  **mismo esquema** del frontend (verificado byte a byte) y la fija con la API
  de administración. No hardcodea correos ni contraseñas.
- **Cuentas de usuarios reales:** usan el flujo "¿Olvidaste tu contraseña?" en
  la propia aplicación (el `updatePassword` ya deriva con el nuevo esquema).

### Pruebas automáticas

`src/lib/passwordDerive.test.ts`: misma entrada → mismo resultado; correo con
mayúsculas/espacios → mismo resultado; contraseñas distintas → resultados
distintos; correos distintos → resultados distintos; salida de 64 hex.

---

## OWASP Top 10

*(Se completa en la Fase 2.)*
