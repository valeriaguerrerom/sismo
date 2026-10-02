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

## OWASP Top 10 (Fase 2)

Revisión por categorías del OWASP Top 10 (2021). Para cada una se indica lo
revisado, el estado y la corrección aplicada.

### A01 — Control de acceso roto

- **RLS en todas las tablas.** `simulation_reports` está acotado por
  `auth.uid() = user_id`: un usuario no puede leer ni modificar reportes de
  otro (protección contra IDOR). Las acciones de administrador pasan por
  `current_user_role()` (SECURITY DEFINER, lee `profiles.role` del lado del
  servidor, nunca de `user_metadata` del token).
- **CRÍTICO corregido — escalada de privilegios.** La policy
  `"Users update own profile"` permitía `UPDATE` de la propia fila sin
  restringir columnas, de modo que un usuario podía hacer
  `UPDATE profiles SET role='admin' WHERE id = auth.uid()` y volverse admin.
  **Fix:** migración `supabase/migrations/20260930_prevent_role_self_escalation.sql`
  con un trigger `BEFORE UPDATE` que rechaza (ERRCODE 42501) cualquier cambio de
  `role` si quien lo ejecuta no es admin. Se eligió trigger (no revocar la
  columna ni cambiar la policy) para no romper la autodesactivación de cuentas,
  que sí actualiza `active`/`deactivated_by`. **Aplicada y verificada** en el
  panel de Supabase (SQL editor → "Success. No rows returned"): la función y el
  trigger quedaron creados.
- **Escalada por otras vías (INSERT/UPSERT y columnas administrativas) — corregido.**
  La policy de INSERT `"Users insert own profile"` permitía crear la fila con
  cualquier `role`/`active`, y el trigger anterior solo cubría `role` en UPDATE.
  **Fix:** migración `supabase/migrations/20261002_harden_profiles_privileges.sql`,
  que reemplaza el trigger por uno `BEFORE INSERT OR UPDATE`
  (`prevent_profile_privilege_escalation`, SECURITY DEFINER + `SET search_path=public`):
  - **service_role** (`auth.uid() IS NULL`) y **admin** (`current_user_role()='admin'`): sin restricción.
  - usuario normal en **INSERT**: se fuerzan `role='user'`, `active=true` y las columnas de desactivación a NULL.
  - usuario normal en **UPDATE**: no puede cambiar `role`, `deactivated_by` (salvo a `'usuario'`), `deactivation_reason`; puede autodesactivarse (`active`→`false`) y reactivarse **solo si él mismo** se había desactivado (`OLD.deactivated_by='usuario'`), nunca si lo desactivó un admin.
- **Confirmado sobre `current_user_role()`:** es `SECURITY DEFINER` con
  `SET search_path = public` (migración `20260902`). Bajo **service_role**
  devuelve `NULL` (no hay `auth.uid()`), por eso el trigger usa
  `auth.uid() IS NULL` para reconocer al backend/scripts y **no** bloquearlos.
  Verificado en vivo: `rpc('current_user_role')` con la service key → `None`.
- `feedback_messages`: sin INSERT para `anon`/`authenticated`; solo el backend
  escribe con la service key (migración `20260926_feedback_backend_only.sql`).

### A02 — Fallos criptográficos

- Contraseñas derivadas en el cliente (PBKDF2-SHA256, ver sección anterior) y
  guardadas con bcrypt en Supabase. Transporte HTTPS. La contraseña en claro no
  viaja por la red.
- La `service_role` key vive solo en `backend/.env` (ignorado por git); nunca se
  expone al frontend.

### A03 — Inyección

- **SQL:** el backend usa el SDK de Supabase con filtros parametrizados
  (`.eq/.ilike/.gte`). Los únicos f-strings son `f"{year}-01-01"` (entero
  validado) y `ilike(..., f"%{search}%")` (el valor va como parámetro, no
  concatenado al SQL). Sin construcción dinámica de SQL.
- **XSS:** no hay `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`
  ni `document.write` en el código de producción; React escapa todo el texto por
  defecto.
- **Inyección de fórmulas en hojas de cálculo (CWE-1236) — corregido.** Los
  exports a Excel/CSV escribían datos de usuario (nombre, institución, título de
  reporte, etc.) sin neutralizar: un valor como `=HYPERLINK(...)` se ejecutaría
  al abrir el archivo. **Fix:** `src/lib/csvSafe.ts` → `sanitizeCell()` antepone
  un apóstrofo a las celdas que empiezan por `= + - @ \t \r`. Aplicado en
  `adminExport.ts`, `adminChars.ts` (`characterizationCsv`) y `map3dReport.ts`
  (`buildMap3dCsv`). Tests en `src/lib/csvSafe.test.ts`.

### A04 — Diseño inseguro

- Los parámetros del simulador se validan en el servidor con Pydantic
  (`ge`/`le` en `backend/core/fdm.py`); el backend nunca confía en la validación
  del navegador.
- La subida de MiniSEED valida el contenido real con ObsPy (no la extensión) y
  aplica una lista blanca de estaciones de la red de Nariño.

### A05 — Mala configuración de seguridad (corregido)

- **CORS:** se eliminó `allow_origins=["*"]`. Ahora los orígenes vienen de
  `ALLOWED_ORIGINS` (variable de entorno). En desarrollo se añaden los orígenes
  locales de Vite; en producción solo los de la variable (fallo seguro si está
  vacía). Ver `backend/core/config.py` y `backend/main.py`.
- **Fuga de detalle de errores:** el handler global y los `except` de
  `/api/simulate`, `/api/simulate/full`, `waveforms.py`, `synthetic.py` y
  `account.py` pasan por `safe_error_detail()`, que oculta el mensaje interno en
  producción (`APP_ENV=production`) y lo muestra solo en desarrollo.
- **Documentación de la API:** `/docs`, `/redoc` y `/openapi.json` se
  deshabilitan en producción (`APP_ENV=production`).

### A06 — Componentes vulnerables (corregido)

- **Frontend (`pnpm audit`):** DOMPurify 3.4.15 (transitiva de `jspdf`) con DOM
  XSS (GHSA-p98j-92pf-mc4p, severidad baja). Corregido con un `overrides` en
  `pnpm-workspace.yaml` forzando `>=3.4.16`. Audit limpio tras el cambio.
- **Backend (`pip-audit`):** actualizados en `requirements.txt`:
  `python-multipart` 0.0.9 → 0.0.32 (CVEs de DoS en el parser multipart, que
  procesa las subidas), `fastapi` 0.115.0 → 0.115.6 + `starlette` 0.41.3
  (advisories de la serie 0.38.x), `python-dotenv` → 1.1.1, `pillow` → 11.3.0
  (solo scripts). Suite de 69 tests verde con las versiones nuevas.

### A07 — Fallos de identificación y autenticación

- Supabase Auth (email/contraseña y Google OAuth). Mensaje de login genérico
  (no revela si el correo existe). Rate limiting de Auth y expiración del JWT se
  configuran en el panel de Supabase *(pendiente: anotar los valores exactos)*.

### A08 — Fallos de integridad de software y datos

- Dependencias con versión fija (pinned) en `requirements.txt` y
  `pnpm-lock.yaml`. Sin ejecución de código desde contenido subido: el MiniSEED
  se parsea con ObsPy en memoria y no se persiste.

### A09 — Fallos de registro y monitoreo

- Las bajas de cuenta se registran en `account_deletions` sin datos personales.
  Los accesos actualizan `last_login` (`touch_last_login`). No se registran
  secretos ni contraseñas.

### A10 — SSRF (Server-Side Request Forgery)

- La única petición saliente del backend es a URLs **públicas y fijas** del
  bucket de Supabase Storage (`waveforms.py`), construidas a partir de
  `SUPABASE_URL` + rutas del manifiesto, nunca a partir de entrada libre del
  usuario. No hay endpoints que acepten una URL del cliente y la soliciten.

---

## Límite de peticiones (rate limiting)

- `backend/core/rate_limit.py` → `RateLimiter` por IP (ventanas de minuto y
  hora), respetando `X-Forwarded-For` tras el proxy de Railway/Nginx.
- **Simulación FDM** (`/api/simulate`, `/api/simulate/full`): 20/min y 200/hora.
- **Subida de MiniSEED** (`/api/upload/mseed`): 10/min y 60/hora.
- **Formulario de contacto** (`/api/feedback`): 3/min y 20/día (lógica propia en
  `feedback.py`).
- **Login/registro/recuperación:** los gestiona Supabase Auth con su propio rate
  limiting.
- **Limitación conocida:** el estado del limitador vive en memoria del proceso,
  válido para un worker único (caso Railway). Con varias réplicas haría falta un
  backend compartido (Redis).

## Subida de archivos (`/api/upload/mseed`)

- **Límite de tamaño efectivo:** 50 MB verificados leyendo por bloques de 1 MB y
  abortando en cuanto se supera, sin materializar el archivo completo en memoria
  (evita DoS por memoria). Tests: archivo vacío y archivo de 51 MB se rechazan
  con 400.
- **Validación de contenido:** ObsPy valida que sea MiniSEED real; archivo
  corrupto o no-MiniSEED → 400. Lista blanca de estaciones.
- **Sin path traversal:** no se persiste nada; el nombre del archivo solo se
  devuelve como eco, no se usa para construir rutas.
- **Riesgo residual (bajo):** un MiniSEED válido pero con muchísimas muestras
  consume CPU en el procesamiento (ObsPy). Mitigado por el límite de 50 MB y los
  límites del plan de Railway; no hay un tope de tiempo de cómputo explícito.

## Secretos

- `.gitignore` cubre `.env`, `.env.*`, `backend/.env`, `*.pem`, `*.key`.
  Verificado en todo el historial de git: ningún archivo de secretos fue
  commiteado jamás. Las claves se leen con `os.getenv()`; el `.env.example` usa
  solo marcadores de posición.

---

## Evidencia de control de acceso (RLS por tabla)

Todas las tablas tienen RLS habilitado. La escritura privilegiada la hace el
backend con la **service_role** (salta RLS); por eso varias tablas no tienen
policy de escritura para clientes. "admin" = `current_user_role() = 'admin'`.

| Tabla | SELECT (leer) | INSERT (crear) | UPDATE (editar) | DELETE (borrar) |
|-------|---------------|----------------|-----------------|-----------------|
| `profiles` | dueño (su fila) · admin (todas) | dueño (su fila; trigger fuerza role=user/active) | dueño (sin tocar columnas admin, vía trigger) · admin (todo) | — (no hay policy; baja vía backend) |
| `simulation_reports` | dueño (`user_id=auth.uid()`) · admin (todos) | dueño | dueño | dueño · admin (cualquiera) |
| `seismic_events` | todos (autenticados) | admin | admin | admin |
| `quiz_questions` | todos (autenticados) | admin | admin | admin |
| `wave_facts` | todos (autenticados) | admin | admin | admin |
| `timeline_events` | todos (autenticados) | admin | admin | admin |
| `account_deletions` | admin | — (solo backend/service) | — | — |
| `feedback_messages` | admin | — (solo backend/service) | admin | — |

Notas:
- Los reportes anonimizados (`user_id = NULL`, tras borrar una cuenta) no los ve
  ningún usuario común: la policy exige `user_id IS NOT NULL AND auth.uid() = user_id`.
- No hay lectura anónima en ninguna tabla: la plataforma es de acceso restringido.

## Pruebas de control de acceso

**Automáticas (en la suite, sin cuentas reales)** — `backend/tests/`:
- `test_access_control.py`: endpoint admin `DELETE /api/admin/users/{id}` sin
  sesión → **401**; con token de rol `user` → **403**; `DELETE /api/account` sin
  sesión → **401**.
- `test_injection.py`: payloads de inyección (SQL, XSS, path traversal, control
  chars) contra `/api/events?search=`, filtros numéricos, `/api/waveforms/...`
  (path traversal) y `/api/simulate` con tipos inválidos. Resultado esperado y
  obtenido: **200** tratando el valor como literal, o **4xx** controlado; nunca
  **500** con traza. Además, `sourceType`/`source_type` pasaron de `str` libre a
  `Literal["tectonic","volcanic"]` (un valor fuera de ese conjunto ahora da 422).

**En vivo (requiere las cuentas de prueba)** — `backend/scripts/admin/verify_access_control.py`:
inicia sesión como `prueba1` y `prueba2` (rol user) y comprueba que `prueba1`
**no** puede: leer/editar/borrar reportes de `prueba2` (IDOR), leer el perfil de
`prueba2`, subirse a `role='admin'` por UPDATE ni por upsert, ni leer
`account_deletions`. Cada comprobación imprime PASA (acceso denegado) o FALLA.
Correr cuando existan las cuentas (`manage_test_accounts.py`). Para el caso de
reactivación tras baja administrativa, desactiva `prueba1` desde el panel admin
y luego intenta `active=true` desde la consola: debe fallar.

## Resultado de las pruebas de inyección por endpoint

| Endpoint | Vector probado | Resultado |
|----------|----------------|-----------|
| `GET /api/events?search=` | SQLi, XSS, control chars | 200, valor tratado como texto (`.ilike` parametrizado) |
| `GET /api/events` (filtros) | texto donde van números | 200/422, nunca 500 |
| `GET /api/waveforms/{event}/{station}` | path traversal (`../`, `%2f`) | 400/404/422, no sirve archivos del sistema |
| `POST /api/simulate` | tipo no numérico en campos | 422 (validación Pydantic) |
| `POST /api/simulate` | `sourceType` arbitrario | 422 (`Literal`) |

El backend usa el SDK de Supabase (consultas parametrizadas `.eq/.ilike/.gte`),
no concatena SQL, y Pydantic valida tipos y rangos antes de ejecutar.

## Cabeceras de seguridad HTTP

**Frontend (Nginx)** — la config se genera al arrancar el contenedor con
`envsubst` a partir de `nginx.conf.template` (ver Dockerfile). En todas las
respuestas:
- CSP (ver abajo), `Strict-Transport-Security` (`max-age=31536000; includeSubDomains`),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`,
  `X-Frame-Options: DENY` (+ `frame-ancestors 'none'` en la CSP).

Variables de la plantilla (se pasan como variables de entorno del contenedor):
- `BACKEND_ORIGIN`: URL del backend que se añade a `connect-src` (p. ej.
  `https://api.midominio.com`). Así el dominio del backend NO queda fijo en el
  repositorio y funciona con dominio propio o con `*.up.railway.app`.
- `CSP_HEADER_NAME`: en el **primer despliegue** se deja en
  `Content-Security-Policy-Report-Only` (reporta en la consola lo que se
  bloquearía, sin romper la página). Tras verificar que todo funciona, se cambia
  a `Content-Security-Policy` para activar el bloqueo real.

CSP (resumen de directivas y por qué):
- `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
- `script-src 'self'` (los bundles de Vite llevan hash; **sin** `unsafe-inline`).
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` (Tailwind/React
  y Leaflet aplican estilos en línea; CSS de Google Fonts).
- `font-src 'self' https://fonts.gstatic.com` (IBM Plex Sans).
- `img-src 'self' data: blob: https://*.tile.openstreetmap.org` (teselas de
  Leaflet; `data:`/`blob:` para capturas de html2canvas y el canvas de Three.js).
- `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${BACKEND_ORIGIN}`
  (REST/Auth de Supabase, `wss://` para Realtime, y el backend vía la variable
  `BACKEND_ORIGIN`, que se sustituye al arrancar el contenedor).
- `frame-src https://accounts.google.com https://*.supabase.co` (OAuth de Google
  vía Supabase).
- `worker-src 'self' blob:` (el motor FDM corre en un Web Worker).
- El Mapa 3D (Three.js) carga sus texturas/datos desde `/terrain` y `/textures`
  **locales**, así que no requiere orígenes externos extra.

**Backend (FastAPI, middleware en `main.py`)** — en todas las respuestas:
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`,
`Permissions-Policy`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
(la API solo devuelve JSON) y `Strict-Transport-Security` **solo en producción**
(`APP_ENV=production`). Verificado en vivo sobre `/health`.

**Despliegue con CSP en dos tiempos** (recomendado):
1. Primer despliegue con `CSP_HEADER_NAME=Content-Security-Policy-Report-Only` y
   `BACKEND_ORIGIN` = URL real del backend. Navega la app completa (login con
   Google, Explorador con mapas Leaflet, Mapa 3D, generar PDF) con las DevTools
   abiertas: la consola muestra `[Report Only]` para cualquier recurso que se
   bloquearía, sin romper la página.
2. Si aparece algún reporte, ajusta la directiva correspondiente en
   `nginx.conf.template` (lo más común: un dominio que falte en `connect-src` o
   `img-src`).
3. Cuando no haya reportes, cambia `CSP_HEADER_NAME` a `Content-Security-Policy`
   y redespliega para activar el bloqueo real.

## Pendientes en el panel de Supabase

- ~~Aplicar la migración `20260930_prevent_role_self_escalation.sql`.~~
  **Hecho** (SQL editor: "Success. No rows returned").
- ~~Aplicar la migración `20261002_harden_profiles_privileges.sql`~~ **Hecho**
  (amplía la protección a INSERT/UPSERT y a las columnas `active`/`deactivated_by`;
  cierra el ataque de reactivación en dos pasos).
- Confirmar la configuración del bucket `mseed-raw` (lectura pública, 0 políticas
  de escritura).
- Anotar los valores de rate limiting de Auth y la expiración del JWT.
- Tras desplegar: verificar en DevTools que la CSP del Nginx no bloquea Google
  login, los mapas ni el Mapa 3D.
