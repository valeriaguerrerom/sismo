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

# Los MiniSEED crudos (data_raw) no se copian al contenedor: son opcionales
# y pesados. Móntalos como volumen si se necesita /api/waveforms.
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
