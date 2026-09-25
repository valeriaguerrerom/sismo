# SismoNariño — Frontend (React + Vite) servido con Nginx.
#
# En Railway: el puerto lo inyecta $PORT y el backend es otro servicio, así que
# el frontend se construye con VITE_API_URL = URL pública del backend.
# En local: docker build --build-arg VITE_SUPABASE_URL=... etc.  y  docker run -p 8080:80

# ── Etapa 1: build ──
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL=
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_URL=$VITE_API_URL

# El proyecto usa pnpm (pnpm-lock.yaml). Se instala con npm para evitar la
# verificación de firma de corepack, que falla de forma intermitente en Alpine.
RUN npm install -g pnpm@11.20.0

# pnpm 11 convierte "Ignored build scripts" en error fatal (ERR_PNPM_IGNORED_BUILDS)
# en instalaciones limpias como la de Docker. Se desactiva strictDepBuilds para
# que vuelva a ser una advertencia y no aborte el build. CI=true evita el prompt
# interactivo de aprobación de builds. Los scripts que se saltan (esbuild,
# core-js) no hacen falta para 'vite build'.
ENV CI=true \
    PNPM_CONFIG_STRICT_DEP_BUILDS=false

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
