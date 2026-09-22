# SismoNariño — Backend (FastAPI)

API REST que hace **todo el cálculo numérico** del proyecto: geometría sísmica,
tiempos de viaje, síntesis FDM 2D y lectura de MiniSEED. El frontend solo pide
datos por HTTP y los dibuja.

## Estructura

```
backend/
├── main.py                # App FastAPI, CORS, incluye routers
├── simulation.py          # Shim de compatibilidad → re-exporta core/fdm
├── core/
│   ├── geo.py             # Haversine, hipocentral, azimut, proyección local
│   ├── fdm.py             # Motor FDM 2D (NumPy) — fuente canónica
│   └── stations.py        # Catálogo de las 7 estaciones de Nariño
├── api/
│   ├── travel_times.py    # POST /api/travel-times
│   ├── synthetic.py       # POST /api/synthetic
│   └── waveforms.py       # GET /api/waveforms/{event}/{station}
├── tests/                 # pytest
└── requirements.txt
```

## Instalación

```bash
cd backend
py -m pip install -r requirements.txt
```

## Levantar el servidor

```bash
cd backend
py -m uvicorn main:app --reload --port 8000
```

- API: http://localhost:8000
- Documentación Swagger: http://localhost:8000/docs

## Tests

```bash
cd backend
py -m pytest -q
```

## Endpoints del Mapa 3D

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/api/stations` | Estaciones de la red de Nariño |
| POST | `/api/travel-times` | Tiempos P/S por estación (homogéneo o iasp91) |
| POST | `/api/synthetic` | Sismograma sintético FDM 2D a una distancia dada |
| GET  | `/api/waveforms/{event_id}/{station_code}` | Forma de onda real (MiniSEED) |

Ver `docs/mapa3d.md` para los contratos completos con ejemplos.

## Notas sobre datos

- Las coordenadas de estación son oficiales solo para **TUM**; el resto son
  aproximadas al municipio (ver `core/stations.py`). Las altitudes están
  pendientes del StationXML del SGC.
- Los eventos se sirven desde los JSON de `public/data/cm` y `public/data/galeras`
  (la tabla `seismic_events` de Supabase está vacía por diseño).
