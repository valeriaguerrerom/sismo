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

# Config directa (nginx escucha en 8080 fijo, sin plantillas ni envsubst).
# En Railway el dominio se genera apuntando al puerto 8080.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
