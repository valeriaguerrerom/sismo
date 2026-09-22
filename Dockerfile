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

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Etapa 2: servir con Nginx ──
FROM nginx:1.27-alpine

# Config directa (nginx escucha en 8080 fijo, sin plantillas ni envsubst).
# En Railway el dominio se genera apuntando al puerto 8080.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
