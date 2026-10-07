# Pruebas E2E (Playwright)

Pruebas de punta a punta de toda la plataforma con Playwright, en Chromium,
Firefox, WebKit y un perfil de celular (Pixel 7). Verifican los flujos reales
del instrumento de software y del instrumento de civil, además de seguridad,
privacidad y comentarios.

## Qué se prueba

- **Humo** (`e2e/01-smoke.spec.ts`): cada página carga y muestra su contenido
  principal (Inicio, Simulador, Explorador, Mapa 3D, Educación con sus capítulos,
  Acerca de, Reportes, login, registro y recuperar contraseña).
- **Ocho escenarios del instrumento de software** (`e2e/02-software.spec.ts`):
  registro e inicio de sesión, simulación con parámetros propios, descargar
  CSV/JSON/PDF (y que quede en «Mis Reportes»), Explorador con sismos tectónicos
  y volcánicos y cargar al Simulador, MiniSEED con el archivo de ejemplo, Mapa 3D
  (cargar evento, reproducir, cambiar de modelo y Recalcular), datos inválidos, y
  la vista de celular.
- **Ocho escenarios del instrumento de civil** (`e2e/03-civil.spec.ts`): dos
  capas, fuente volcánica, métricas, movimiento de partícula, mapa de calor del
  subsuelo, IASP91 en el Mapa 3D, quiz de Educación e interpretación educativa.
- **Seguridad y privacidad** (`e2e/05-seguridad.spec.ts`): un investigador no
  entra a Admin ni forzando la navegación; la contraseña nunca viaja en texto
  plano (se deriva con PBKDF2 en el cliente); el aviso de cookies aparece y, al
  rechazarlo, no se hacen peticiones de datos a Google Analytics.
- **Comentarios** (`e2e/06-comentarios.spec.ts`): enviar un comentario y
  verificar que no da 429.

## Guardias automáticos

Toda prueba falla automáticamente (sin aserción explícita) si durante la página:

- aparece un **error en consola** o una **violación de CSP** («Refused to …»),
- hay una petición a **nuestro backend o a Supabase con estado 4xx/5xx** (salvo
  las toleradas —p. ej. `404/503` de formas de onda inexistentes— o las que una
  prueba provoca a propósito y marca con `guards.expectFailure(...)`),
- queda una **pantalla en blanco** (`#root` vacío) o se muestra el mensaje del
  **Error Boundary**.

La lógica vive en `e2e/support/guards.ts` y se conecta a cada prueba con el
fixture de `e2e/support/fixtures.ts`.

## Configuración local

1. Copia `.env.e2e.example` a `.env.e2e` y pon las credenciales de la cuenta de
   prueba (`prueba1`). Ese archivo NO se sube al repo.
2. Instala Playwright y los navegadores:
   ```bash
   pnpm install
   pnpm e2e:install   # descarga Chromium/Firefox/WebKit (script con curl)
   ```
   > En redes donde el descargador interno de Playwright falla por el redirect
   > a `storage.googleapis.com`, usa `pnpm e2e:install`, que baja los navegadores
   > con `curl` a la caché de Playwright. En CI se usa `playwright install` normal.

## Dos entornos

### Local (docker, igual que producción) — antes de cada push

Levanta el mismo nginx con la **misma CSP en modo bloqueo** y las mismas
variables que producción:

```bash
pnpm e2e:local:up      # docker compose -f docker-compose.e2e.yml up --build -d --wait
pnpm e2e:local         # corre las pruebas contra http://localhost:8080
pnpm e2e:local:down    # apaga el stack
# o todo junto:
pnpm e2e:local:full
```

### Producción — contra sismonarino.com

```bash
pnpm e2e:prod
```

Solo usa la cuenta de prueba y **no deja datos basura**: los reportes que crea se
borran al terminar y las peticiones van espaciadas (un worker, en serie, con
`slowMo`) para no activar el límite de tasa. El comentario de feedback NO se
envía en prod salvo que exportes `E2E_RUN_FEEDBACK=1` (se marca con `[E2E]` para
que un admin lo pueda purgar).

## Reporte

Reporte HTML con capturas y video de cada prueba que falle:

```bash
pnpm e2e:report               # abre playwright-report/prod
pnpm exec playwright show-report playwright-report/local
```

## CI (GitHub Actions)

`.github/workflows/e2e.yml`:

- **En cada push y PR a `main`**: job `local` — levanta el stack docker y corre
  la suite contra el contenedor (nginx + CSP bloqueo).
- **Una vez al día** (cron 09:10 UTC): job `prod` — corre la suite contra
  `https://sismonarino.com`.
- Manual: *Run workflow* → elige `local` o `prod`.

Secrets necesarios en el repositorio (Settings → Secrets and variables → Actions):

| Secret | Para qué |
|--------|----------|
| `VITE_SUPABASE_URL` | build del frontend y backend en el job local |
| `VITE_SUPABASE_ANON_KEY` | idem |
| `SUPABASE_SERVICE_ROLE_KEY` | backend (feedback) en el job local |
| `E2E_USER_EMAIL` | cuenta de prueba |
| `E2E_USER_PASSWORD` | cuenta de prueba |

## Railway: esperar a que pasen las pruebas antes de desplegar («Wait for CI»)

Railway puede esperar a que los checks de GitHub Actions estén en verde antes de
construir y desplegar un commit. Así, si las pruebas locales fallan, el deploy no
sale.

Pasos:

1. En Railway, abre el **servicio del frontend** (y, si quieres, el del backend).
2. **Settings → Deploy / Source** (sección del repositorio conectado).
3. Activa **«Wait for CI»** (a veces aparece como *Check Status* / *Wait for
   CI to pass before deploying*).
4. Railway esperará a que **todos los checks requeridos** del commit pasen. El
   job `local` de este workflow publica un check por commit en `main`; cuando
   está verde, Railway continúa; si falla, no despliega.
5. Opcional pero recomendado: en GitHub, **Settings → Branches → Branch
   protection rules** para `main`, marca *Require status checks to pass before
   merging* y elige el check **E2E (Playwright) / local**. Así tampoco se puede
   mezclar un PR con las pruebas en rojo.

> Nota: «Wait for CI» mira los checks del commit que se va a desplegar. Como el
> workflow corre `on: push` a `main`, cada commit que llega a `main` genera el
> check que Railway espera.
