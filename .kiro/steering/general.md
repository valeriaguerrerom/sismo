---
inclusion: always
---

# SismoNariño — Convenciones Generales

## Proyecto

- Nombre: SismoNariño — Simulador Triaxial de Pseudo-Sismogramas
- Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
- Idioma de la UI y documentación: español
- Idioma del código (variables, funciones, comentarios técnicos): inglés

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend | React | 18.3.x |
| Lenguaje frontend | TypeScript | 5.5.x |
| Bundler | Vite | 5.4.x |
| CSS | Tailwind CSS | 3.4.x |
| 3D | Three.js | 0.183.x |
| Íconos | react-bootstrap-icons | 1.11.x |
| Captura de pantalla | html2canvas | 1.4.x |
| PDF | jspdf | 4.x |
| Excel | xlsx (SheetJS) | 0.18.x |
| Mapas 2D | leaflet + react-leaflet | 1.9.x / 4.2.x |
| BD cliente | @supabase/supabase-js | 2.57.x |
| Backend | FastAPI | 0.115.0 |
| Servidor ASGI | Uvicorn | 0.30.0 |
| Cómputo numérico | NumPy | 1.26.4 (o 2.x según Python) |
| BD backend | supabase (Python) | 2.9.1 |
| Modelos backend | Pydantic | 2.9.0 |
| Documentación frontend | TypeDoc | 0.28.x |
| Documentación backend | pdoc | 16.x |
| Linting | ESLint 9 + typescript-eslint | — |

## Comandos del Proyecto

```bash
# Frontend (desarrollo)
pnpm install        # o npm install
pnpm dev            # o npm run dev → http://localhost:5173

# Backend (otra terminal)
cd backend
py -m uvicorn main:app --reload --port 8000  # → http://localhost:8000

# Verificación de tipos
pnpm typecheck      # o npm run typecheck

# Build producción
pnpm build          # o npm run build → genera dist/

# Documentación frontend (TypeDoc)
pnpm docs:frontend  # → docs/frontend/index.html

# Documentación backend (pdoc)
cd backend
py -m pdoc main simulation -o ../docs/backend  # → docs/backend/index.html

# Pruebas
npm run test                    # vitest (frontend)
cd backend && py -m pytest -q   # pytest (backend)

# Docker
docker compose up --build       # frontend :8080, backend :8000

# Reprocesamiento de datos MiniSEED
cd backend
py process_galeras_types.py     # Galeras por tipo (lp/to/tr/va) -> public/data/galeras
py process_cm_events.py         # Red CM (Colombia/Ecuador) -> public/data/cm
# Script legado (formato de carpetas YYMMDDHHMMGVA):
py process_mseed.py "C:\ruta\a\Sismos Galeras\Sismos Galeras" --output ../public/data/galeras
```

## Base de Datos

- Proveedor: Supabase (PostgreSQL + RLS)
- El frontend consulta Supabase directamente con `@supabase/supabase-js` (archivo `src/lib/supabase.ts`)
- El backend tiene su propio cliente Python (`supabase-py`) pero actualmente no puede conectar por DNS desde la red local — usa datos fallback
- Tablas: `seismic_events`, `quiz_questions`, `wave_facts`, `timeline_events`, `profiles` (con `active`, `last_login`), `simulation_reports`
- Escritura sobre eventos y contenido educativo solo para admins (policies con `current_user_role()`)
- Todas las tablas tienen RLS habilitado con policy de lectura pública para `anon` y `authenticated`

## Roles y control de acceso

- Es una plataforma con acceso restringido, no un sitio público: sin sesión solo se ven `home`, `about` y `auth`
- `App.tsx` redirige a `auth` cualquier intento de abrir un módulo sin sesión y recuerda la página pendiente
- Roles: `user` = **Investigador** (simula, explora, carga MiniSEED propios, guarda reportes) y `admin` = **Administrador** (todo lo anterior + panel admin)
- El registro público siempre crea Investigador; solo un admin promueve a otro admin desde el panel
- El registro captura: nombre, institución, ocupación, área de investigación, ciudad, país y propósito de uso (`profiles`, migración 20260911b)
- Etiquetas de rol en `ROLE_LABELS` (`src/lib/auth.tsx`)
- **Completar perfil obligatorio**: si `profiles` no tiene institución y ocupación (registro con Google o cuentas antiguas), `App.tsx` muestra `pages/CompleteProfile.tsx` en lugar de cualquier módulo hasta que se guarde (`updateProfile` en `auth.tsx`, `isProfileComplete`)
- Los campos de investigador viven en `components/auth/ResearcherFields.tsx` y los comparten el registro y el paso de completar perfil

## Autenticación (activa)

- `src/lib/auth.tsx` usa Supabase Auth (email/contraseña y Google OAuth) y carga el perfil desde `profiles`
- La recursión de las RLS policies de `profiles` se resolvió con `public.current_user_role()` (migración 20260902)
- Cuentas desactivadas por un admin (`profiles.active = false`) se cierran automáticamente al cargar el perfil (RF-05)
- Al iniciar sesión se llama `rpc('touch_last_login')` para registrar el último acceso (RF-22)
- Rutas protegidas: `reports` requiere usuario, `admin` requiere `role === 'admin'`

## Panel de administración (`src/pages/AdminDashboard.tsx`)

- Resumen: indicadores, simulaciones por mes (SVG), distribución de roles, últimos accesos (RF-22)
- Usuarios: cambiar rol y activar/desactivar cuentas (RF-05)
- Eventos sísmicos: CRUD sobre `seismic_events` + importación QuakeML (RF-15, RF-16)
- Contenido educativo: CRUD de `quiz_questions`, `wave_facts`, `timeline_events` (RF-25)
- Reportes: filtro por período, borrado y exportación Excel/PDF (RF-23)
- Acceso a datos en `src/lib/adminData.ts`; exportación en `src/lib/adminExport.ts`
- Requiere la migración `supabase/migrations/20260911_admin_features.sql`

## Reportes PDF (RF-19)

- `src/lib/reportPdf.ts` (jsPDF) genera el PDF con parámetros, métricas, 3 sismogramas e interpretación
- `simulation_reports.results` guarda `gridInfo` y `waveData` submuestreado (≤ 600 puntos) para regenerar el PDF
- La interpretación educativa (RF-12) vive en `src/lib/interpretation.ts` y la comparten ResultsPanel y el PDF

## Despliegue (RNF-07)

- `docker-compose.yml` + `Dockerfile` (frontend con Nginx) + `backend/Dockerfile`
- `vercel.json` / `netlify.toml` para el frontend, `render.yaml` / `railway.json` para el backend
- Guía completa en `docs/despliegue.md`

## Carga de MiniSEED por investigadores

- `POST /api/upload/mseed` (`backend/api/mseed_upload.py`): ObsPy lee el archivo en memoria, lista estaciones, elige una triaxial, detrend + pasabanda opcional, normaliza y decima (≤ 3000 muestras). No persiste nada.
- Frontend: tercera fuente "Mi archivo MiniSEED" en el Explorador (`src/components/explorer/MseedUpload.tsx`, cliente `src/lib/mseedUpload.ts`), visible solo con sesión
- El resultado se envía al simulador con el mismo flujo que los registros del Galeras/CM (`onLoadRealData`)
