# Despliegue de SismoNariño (RNF-07 Portabilidad)

Meta del requerimiento: despliegue completo en menos de 1 hora, contenedorizable con Docker.

El despliegue de referencia en producción es **Railway** (dos servicios Docker:
frontend y backend) + **Supabase** (base de datos y Auth). Al final se incluyen
alternativas (Docker Compose local, Render, Vercel/Netlify).

---

## Variables de entorno

### Frontend (build con Vite)

| Variable | Ejemplo | Notas |
|----------|---------|-------|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Proyecto de Supabase. |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Clave pública (anon). |
| `VITE_API_URL` | `https://sismonarino-api.up.railway.app` | URL pública del backend. En local, vacío → usa `http://localhost:8000`. |

Variables del **contenedor** del frontend (Nginx, no son build args; se leen al
arrancar para generar la config con `envsubst`):

| Variable | Ejemplo | Notas |
|----------|---------|-------|
| `BACKEND_ORIGIN` | `https://api.midominio.com` | URL del backend que se añade a `connect-src` de la CSP. Permite usar dominio propio sin editar la plantilla. Vacío = solo Supabase. |
| `CSP_HEADER_NAME` | `Content-Security-Policy-Report-Only` | Primer despliegue en Report-Only (reporta sin romper). Tras verificar, cambiar a `Content-Security-Policy`. |

Se inyectan en el **build** (son `import.meta.env.*`). En Railway van como
*build args / variables* del servicio del frontend.

### Backend (FastAPI)

| Variable | Ejemplo | Notas |
|----------|---------|-------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Igual que el frontend. |
| `SUPABASE_ANON_KEY` | `eyJ...` | Clave pública (anon). |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | **Secreto.** Necesaria para feedback y gestión de cuentas. Nunca se versiona. |
| `APP_ENV` | `production` | Activa el endurecimiento: CORS restringido, oculta detalles de error y deshabilita `/docs`. |
| `ALLOWED_ORIGINS` | `https://sismonarino.up.railway.app` | Dominios del frontend permitidos por CORS, separados por comas. **Obligatorio en producción.** |

El puerto lo inyecta Railway con `$PORT` (el Dockerfile ya lo usa). En local es 8000.

---

## Opción A (referencia) — Railway: frontend + backend

Dos servicios en el mismo proyecto de Railway, ambos a partir del repositorio.

### 1. Servicio del backend

- **Root directory:** `backend`
- Railway detecta `backend/Dockerfile` y `backend/railway.json` (healthcheck en `/health`).
- Variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `APP_ENV=production` y `ALLOWED_ORIGINS` (se rellena en el paso 3, con el dominio del frontend).
- Genera el dominio público (p. ej. `https://sismonarino-api.up.railway.app`). Anótalo.

### 2. Servicio del frontend

- **Root directory:** raíz del repo (usa el `Dockerfile` de la raíz, Nginx en el puerto 8080).
- **Build args / variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y
  `VITE_API_URL` = dominio del backend del paso 1.
- **Variables del contenedor** (para la CSP): `BACKEND_ORIGIN` = dominio del
  backend del paso 1; `CSP_HEADER_NAME` = `Content-Security-Policy-Report-Only`
  en el primer despliegue (cambiar a `Content-Security-Policy` tras verificar).
- Genera el dominio público (p. ej. `https://sismonarino.up.railway.app`). Anótalo.

### 3. Cerrar el círculo de CORS

- Vuelve al servicio del backend y pon en `ALLOWED_ORIGINS` el dominio del frontend
  del paso 2. Redeploy del backend.

---

## Configuración de Supabase Auth y Google (OBLIGATORIO para producción)

El login con Google usa `window.location.origin` como `redirectTo`; además hay que
autorizar las URLs en los paneles de Supabase y Google. Pon **ambos** entornos
(producción y localhost) para poder probar en los dos.

### Supabase → Authentication → URL Configuration

- **Site URL:**
  `https://sismonarino.up.railway.app`  *(ajusta al dominio real del frontend)*
- **Redirect URLs** (añade todas):
  - `https://sismonarino.up.railway.app`
  - `https://sismonarino.up.railway.app/?recovery=1`  *(enlace de recuperación de contraseña)*
  - `http://localhost:5173`
  - `http://localhost:5173/?recovery=1`

### Google Cloud Console → APIs y servicios → Credenciales → ID de cliente OAuth

- **Orígenes de JavaScript autorizados:**
  - `https://sismonarino.up.railway.app`
  - `https://<ref-del-proyecto>.supabase.co`  *(dominio de tu proyecto Supabase)*
  - `http://localhost:5173`
- **URIs de redirección autorizados:**
  - `https://<ref-del-proyecto>.supabase.co/auth/v1/callback`
    *(Supabase es quien recibe el callback de Google; este URI es el que importa)*

> Nota: con Supabase como proveedor de OAuth, Google siempre redirige al
> `/auth/v1/callback` de Supabase, y Supabase reenvía al `redirectTo` del frontend.
> Por eso el URI de redirección de Google es el de Supabase, no el del frontend.

---

## Base de datos (Supabase)

Ejecutar en orden, en el SQL Editor del proyecto (todas las migraciones de
`supabase/migrations/`):

1. `20260412044137_create_seismic_events_table.sql`
2. `20260414_create_auth_tables.sql`
3. `20260414_create_education_tables.sql`
4. `20260902_fix_profiles_rls_recursion.sql`
5. `20260911_admin_features.sql` — cuentas activas/inactivas, último acceso y policies de admin.
6. `20260911b_researcher_profile.sql` — campos del perfil de investigador.
7. `20260913_profiles_insert_policy.sql`
8. `20260914_cleanup_profiles_policies.sql`
9. `20260916_data_authorization.sql` — fecha de autorización de datos (Ley 1581).
10. `20260926_feedback_backend_only.sql` — tabla de contacto, solo escritura desde el backend.
11. `20260930_prevent_role_self_escalation.sql` — **seguridad:** impide la auto-promoción a admin.

> Revisa en `supabase/migrations/` por si hay migraciones más recientes y aplícalas
> en orden cronológico por el nombre.

Después de registrar la cuenta del administrador:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'tu-email@ejemplo.com';
```

### Storage: bucket `mseed-raw`

- Bucket **público** (lectura por URL), **sin** políticas de escritura para `anon`
  ni `authenticated`. La carga se hace solo offline con la service key:
  `cd backend && py scripts/admin/upload_mseed_storage.py`.

---

## Alternativas

### Docker Compose (local o servidor propio)

```bash
cp .env.example .env            # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
# backend/.env con SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
docker compose up --build
```

| Servicio | URL |
|----------|-----|
| Frontend (Nginx + SPA) | http://localhost:8080 |
| Backend (FastAPI) | http://localhost:8000 |

En local `APP_ENV` queda sin definir (modo desarrollo): CORS permite `localhost` y
`/docs` queda disponible en http://localhost:8000/docs.

### Render (backend) + Vercel/Netlify (frontend)

- **Render:** `render.yaml` (Blueprint) ya incluye las variables, incluidas
  `APP_ENV` y `ALLOWED_ORIGINS`. Health check en `/health`.
- **Vercel:** `vercel.json` (build de Vite + rewrite SPA). **Netlify:** `netlify.toml`.
- En estos casos `VITE_API_URL` debe apuntar al backend (no hay proxy).

---

## Verificación post-despliegue

- `GET /health` responde `{"status":"healthy", ...}`.
- En producción, `GET /docs` debe devolver 404 (deshabilitado por `APP_ENV=production`).
- La página de inicio carga en menos de 3 s (RNF-02).
- Login con correo/contraseña **y** con Google (desde el dominio de producción).
- Guardar una simulación y descargar el PDF desde "Mis Reportes".
- Como admin: importar un QuakeML de prueba y exportar el reporte Excel.
