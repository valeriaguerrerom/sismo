#!/bin/sh
# Arranque del contenedor Nginx de SismoNariño (frontend).
#
# Genera la config de Nginx a partir de la plantilla sustituyendo
# BACKEND_ORIGIN y CSP_HEADER_NAME, VALIDANDO primero que la CSP no quede
# incompleta (lo que rompería la conexión al backend en modo bloqueo).
#
# Falla rápido y con un mensaje claro en los logs si falta BACKEND_ORIGIN,
# para que Railway muestre el error en vez de arrancar con una CSP rota.
set -e

echo "──────────────────────────────────────────────────────────────"
echo "[entrypoint] Arrancando frontend de SismoNariño (Nginx)"

# ── Validación de BACKEND_ORIGIN ──
# connect-src de la CSP DEBE incluir el origen del backend; si falta, el
# navegador bloquea las llamadas a la API (Simulador, Mapa 3D, etc.).
if [ -z "$BACKEND_ORIGIN" ]; then
  echo "[entrypoint] ERROR: BACKEND_ORIGIN no está definida." >&2
  echo "[entrypoint] En modo bloqueo (Content-Security-Policy) la app NO podrá" >&2
  echo "[entrypoint] conectar con el backend: connect-src quedaría sin su origen." >&2
  echo "[entrypoint] Define BACKEND_ORIGIN con la URL pública del backend, p. ej.:" >&2
  echo "[entrypoint]   BACKEND_ORIGIN=https://sismonarino-api-production.up.railway.app" >&2
  echo "[entrypoint] El contenedor NO arrancará hasta corregirlo." >&2
  exit 1
fi

# Normalizar: quitar una posible barra final (connect-src usa el origen sin path).
BACKEND_ORIGIN="${BACKEND_ORIGIN%/}"
export BACKEND_ORIGIN

echo "[entrypoint] BACKEND_ORIGIN = $BACKEND_ORIGIN"
echo "[entrypoint] CSP_HEADER_NAME = ${CSP_HEADER_NAME:-Content-Security-Policy}"

# ── Generar la config final ──
envsubst '${BACKEND_ORIGIN} ${CSP_HEADER_NAME}' \
  < /etc/nginx/templates-src/default.conf.template \
  > /etc/nginx/conf.d/default.conf

# ── Imprimir la CSP final generada (para revisarla en los logs de Railway) ──
echo "[entrypoint] CSP final generada:"
grep -o 'set \$csp "[^"]*"' /etc/nginx/conf.d/default.conf | sed 's/^set \$csp /  /' || true
echo "──────────────────────────────────────────────────────────────"

# ── Validar la sintaxis de Nginx antes de arrancar (falla claro si hay error) ──
nginx -t

# Arrancar Nginx en primer plano.
exec nginx -g 'daemon off;'
