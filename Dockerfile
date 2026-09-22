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

# La config es una plantilla: al arrancar se sustituye ${PORT} (que inyecta
# Railway) con envsubst y se genera la config real de Nginx. Fallback a 80 local.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# La imagen oficial de nginx procesa /etc/nginx/templates/*.template con
# envsubst al iniciar. NGINX_ENVSUBST_FILTER limita la sustitución a la variable
# PORT, para NO tocar las variables propias de nginx ($uri, $host, etc.).
ENV PORT=80
ENV NGINX_ENVSUBST_FILTER="PORT"
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
