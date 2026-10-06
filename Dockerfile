# SismoNariño — Frontend (React + Vite) servido con Nginx.
#
# En Railway: el puerto lo inyecta $PORT y el backend es otro servicio, así que
# el frontend se construye con VITE_API_URL = URL pública del backend.
# En local: docker build --build-arg VITE_SUPABASE_URL=... etc.  y  docker run -p 8080:80

# ── Etapa 1: build ──
# node:22 (Debian/glibc). pnpm 11 requiere Node >= 22.13 (usa node:sqlite);
# con Node 20 pnpm crashea con ERR_UNKNOWN_BUILTIN_MODULE.
FROM node:22 AS build
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL=
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_URL=$VITE_API_URL

# pnpm vía corepack (incluido en node:20). CI=true y strictDepBuilds=false evitan
# el error ERR_PNPM_IGNORED_BUILDS de pnpm 11 en instalaciones limpias (Docker).
ENV CI=true \
    PNPM_CONFIG_STRICT_DEP_BUILDS=false \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --config.strictDepBuilds=false

COPY . .
RUN pnpm run build

# ── Etapa 2: servir con Nginx ──
FROM nginx:1.27-alpine

# El entrypoint genera /etc/nginx/conf.d/default.conf a partir de la plantilla
# con envsubst, sustituyendo ${BACKEND_ORIGIN} y ${CSP_HEADER_NAME}.
#   BACKEND_ORIGIN   OBLIGATORIA. URL pública del backend para connect-src de la
#                    CSP (p. ej. https://sismonarino-api-production.up.railway.app).
#                    Si falta, el entrypoint FALLA con un mensaje claro: en modo
#                    bloqueo una CSP sin este origen rompe la conexión a la API.
#   CSP_HEADER_NAME  Content-Security-Policy (bloqueo, por defecto) o
#                    Content-Security-Policy-Report-Only (solo reporta).
ENV BACKEND_ORIGIN="" \
    CSP_HEADER_NAME="Content-Security-Policy"

COPY nginx.conf.template /etc/nginx/templates-src/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint-sn.sh
RUN chmod +x /docker-entrypoint-sn.sh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# El entrypoint valida BACKEND_ORIGIN, genera la config, imprime la CSP final
# en los logs, valida la sintaxis de Nginx y arranca en primer plano.
CMD ["/docker-entrypoint-sn.sh"]
