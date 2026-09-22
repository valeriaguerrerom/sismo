# SismoNariño — Frontend (React + Vite) servido con Nginx
# Build: docker build -t sismonarino-frontend \
#          --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... .
# Run:   docker run -p 8080:80 sismonarino-frontend

# ── Etapa 1: build ──
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# En producción el frontend usa rutas relativas /api (proxy de Nginx al backend).
ARG VITE_API_URL=
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Etapa 2: servir ──
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost/ >/dev/null || exit 1
