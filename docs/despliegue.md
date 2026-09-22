# Despliegue de SismoNariño (RNF-07 Portabilidad)

Meta del requerimiento: despliegue completo en menos de 1 hora, contenedorizable con Docker.

## Opción A — Docker Compose (local o servidor propio)

```bash
cp .env.example .env            # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
# backend/.env debe tener SUPABASE_URL y SUPABASE_ANON_KEY
docker compose up --build
```

| Servicio | URL | Imagen |
|----------|-----|--------|
| Frontend (Nginx + SPA) | http://localhost:8080 | `Dockerfile` (raíz) |
| Backend (FastAPI) | http://localhost:8000/docs | `backend/Dockerfile` |

Nginx reenvía `/api/*` al contenedor `backend`, así que el frontend se construye con
`VITE_API_URL` vacío y usa rutas relativas. Los MiniSEED crudos de `backend/data_raw`
se montan como volumen de solo lectura (opcional, solo para `/api/waveforms`).

## Opción B — Vercel o Netlify (frontend) + Render o Railway (backend)

### Backend

- **Render**: importa el repositorio y usa `render.yaml` (Blueprint). Define `SUPABASE_URL`
  y `SUPABASE_ANON_KEY` en el panel. Health check en `/health`.
- **Railway**: `railway.json` apunta a `backend/Dockerfile`. Define las mismas variables.

Anota la URL pública del backend (p. ej. `https://sismonarino-api.onrender.com`).

### Frontend

- **Vercel**: `vercel.json` ya define el build de Vite y el rewrite SPA.
- **Netlify**: `netlify.toml` define build y redirect SPA.

Variables de entorno en el panel del proveedor:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=https://sismonarino-api.onrender.com
```

`VITE_API_URL` es necesario porque en Vercel/Netlify no hay proxy hacia el backend.

## Base de datos (Supabase)

Ejecutar en orden, en el SQL Editor del proyecto:

1. `supabase/migrations/20260412044137_create_seismic_events_table.sql`
2. `supabase/migrations/20260414_create_auth_tables.sql`
3. `supabase/migrations/20260414_create_education_tables.sql`
4. `supabase/migrations/20260902_fix_profiles_rls_recursion.sql`
5. `supabase/migrations/20260911_admin_features.sql` — cuentas activas/inactivas, último
   acceso y policies de escritura para administradores.
6. `supabase/migrations/20260911b_researcher_profile.sql` — campos del perfil de
   investigador (ocupación, área, ciudad, país, propósito) copiados desde el registro.

Después de registrar la cuenta del administrador:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'tu-email@ejemplo.com';
```

## Verificación post-despliegue

- `GET /health` responde `{"status":"healthy", ...}`.
- La página de inicio carga en menos de 3 s (RNF-02).
- Iniciar sesión, guardar una simulación y descargar el PDF desde "Mis Reportes".
- Como admin: importar un QuakeML de prueba y exportar el reporte Excel.
