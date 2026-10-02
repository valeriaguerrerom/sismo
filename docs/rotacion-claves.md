# Rotación a las nuevas claves de API de Supabase (publishable / secret)

## Estado actual

El proyecto usa las **claves clásicas (JWT)** de Supabase:

- `anon` → pública, va en el frontend y en el backend como `SUPABASE_ANON_KEY`.
- `service_role` → secreta, solo en el backend como `SUPABASE_SERVICE_ROLE_KEY`.

Supabase introdujo un nuevo formato de claves de API:

- **`publishable`** (`sb_publishable_...`) → reemplaza a `anon`. Es pública.
- **`secret`** (`sb_secret_...`) → reemplaza a `service_role`. Es secreta y se
  puede crear/rotar/revocar varias veces sin invalidar las sesiones de los
  usuarios (ventaja principal frente a `service_role`).

Las claves clásicas **siguen funcionando**; esta rotación es opcional pero
recomendable para producción. Hazla durante el despliegue, no antes (si rotas
antes de tiempo y algo apunta a la clave vieja desactivada, se cae el servicio).

## Mapeo de variables

| Clásica (actual) | Nueva | Dónde se usa |
|------------------|-------|--------------|
| `anon` | `publishable` | frontend (`VITE_SUPABASE_ANON_KEY`) y backend (`SUPABASE_ANON_KEY`) |
| `service_role` | `secret` | backend (`SUPABASE_SERVICE_ROLE_KEY`) |

> El código lee los valores por nombre de variable de entorno; **no** valida el
> prefijo del token. Por eso puedes poner una `publishable` dentro de
> `SUPABASE_ANON_KEY` y una `secret` dentro de `SUPABASE_SERVICE_ROLE_KEY` sin
> tocar código. (Opcional: más abajo, renombrar las variables para que sea claro.)

## Pasos (durante el despliegue)

1. **Crear las nuevas claves** en Supabase → Project Settings → **API Keys** →
   pestaña de claves nuevas. Copia la `publishable` y crea una `secret`.
2. **No desactives las clásicas todavía.** Supabase permite tener ambas activas
   durante la transición.
3. **Actualizar las variables de entorno** (sin cambiar nombres):
   - Frontend (Railway, build args): `VITE_SUPABASE_ANON_KEY` = la `publishable`.
   - Backend (Railway, variables): `SUPABASE_ANON_KEY` = la `publishable`,
     `SUPABASE_SERVICE_ROLE_KEY` = la `secret`.
   - Local: lo mismo en `.env` (raíz) y `backend/.env`.
4. **Redeploy** del frontend y del backend.
5. **Verificar** (ver checklist abajo).
6. Cuando todo funcione con las nuevas, **desactivar/revocar las clásicas** en
   el panel de Supabase. Si algo falla, vuelves a activarlas al instante.

## Checklist de verificación tras rotar

- [ ] La app carga y se puede iniciar sesión (email y Google).
- [ ] Se guarda una simulación y se descarga su PDF en "Mis Reportes".
- [ ] El formulario de contacto "Escríbenos" envía (usa la clave `secret` del backend).
- [ ] El panel de administración lista usuarios y permite exportar (usa la `secret`).
- [ ] El Mapa 3D carga formas de onda reales (`/api/waveforms`).
- [ ] `GET /health` responde `{"status":"healthy", "supabase": true}`.

## Opcional: renombrar las variables para mayor claridad

Si quieres que los nombres reflejen el nuevo esquema, habría que cambiar el
código que lee `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
(`backend/main.py`, `backend/api/feedback.py`, `backend/api/account.py`,
`backend/scripts/admin/*`, y en el frontend `VITE_SUPABASE_ANON_KEY`). No es
necesario para que funcione: es solo cosmético. Déjalo para una tarea aparte y
pídemelo si lo quieres.

## Rotación de la clave service_role / secret por filtración

Si en algún momento sospechas que la clave secreta se expuso:
1. Crea una nueva `secret` en el panel.
2. Actualiza `SUPABASE_SERVICE_ROLE_KEY` en Railway (y en `backend/.env` local).
3. Redeploy del backend.
4. Revoca la clave comprometida en el panel.

Esto es exactamente lo que las claves nuevas facilitan: con `service_role`
clásica, rotarla invalida más cosas; con `secret` puedes tener varias y rotar
sin fricción.
