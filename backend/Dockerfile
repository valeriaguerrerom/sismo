# SismoNariño — Backend (FastAPI + NumPy + ObsPy)
# Build:  docker build -t sismonarino-backend ./backend
# Run:    docker run -p 8000:8000 --env-file backend/.env sismonarino-backend
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencias del sistema necesarias para ObsPy/SciPy/rasterio.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Los MiniSEED crudos (data_raw) no se copian al contenedor: en producción se
# leen del bucket público de Supabase Storage (ver api/waveforms.py).
EXPOSE 8000

# En Railway/plataformas cloud el puerto lo inyecta la variable $PORT; en local
# no existe y se usa 8000. Forma shell del CMD para que $PORT se expanda.
# El healthcheck lo hace la plataforma (railway.json → /health), no el Docker.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
