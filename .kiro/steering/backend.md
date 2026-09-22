---
inclusion: always
---

# SismoNariño — Convenciones Backend

## Estructura

```
backend/
├── main.py                  # FastAPI app: endpoints, lifespan, CORS, datos fallback, routers
├── simulation.py            # Shim -> core/fdm (modelos Pydantic + run_fdm)
├── core/                    # geo.py, fdm.py, stations.py
├── api/                     # travel_times.py, synthetic.py, waveforms.py, quakeml.py, mseed_upload.py
├── tests/                   # pytest (geo, synthetic, travel_times, waveforms, quakeml)
├── process_cm_events.py     # MiniSEED red CM -> public/data/cm
├── process_galeras_types.py # MiniSEED Galeras por tipo -> public/data/galeras
├── Dockerfile               # Imagen python:3.11-slim + uvicorn
├── requirements.txt         # Dependencias Python pinneadas
└── .env                     # SUPABASE_URL + SUPABASE_ANON_KEY
```

## Endpoints (main.py)

| Método | Ruta | Tag Swagger | Descripción |
|--------|------|-------------|-------------|
| GET | `/` | Health | Estado del servicio |
| GET | `/health` | Health | Health check con estado Supabase |
| POST | `/api/simulate` | Simulación | Ejecuta FDM 2D, retorna sismogramas |
| GET | `/api/lame` | Simulación | Calcula λ y μ desde Vp, Vs, ρ |
| GET | `/api/events` | Datos Sísmicos | Eventos con filtros (type, mag, year, search) |
| GET | `/api/events/{id}` | Datos Sísmicos | Evento por UUID |
| GET | `/api/quiz` | Educación | N preguntas aleatorias |
| GET | `/api/wave-facts` | Educación | Facts agrupados por tipo de onda |
| GET | `/api/timeline` | Educación | Eventos históricos ordenados |
| GET | `/api/stats` | Datos Sísmicos | Conteos de todas las tablas |
| GET | `/api/stations` | Mapa 3D | Catálogo de estaciones de Nariño |
| POST | `/api/travel-times` | Mapa 3D | Tiempos P/S por estación (homogéneo o iasp91) |
| POST | `/api/synthetic` | Mapa 3D | Sismograma sintético FDM 2D a una distancia |
| GET | `/api/waveforms/{event}/{station}` | Mapa 3D | Forma de onda real desde MiniSEED |
| POST | `/api/import/quakeml` | Importación | Parsea un QuakeML del SGC con ObsPy (RF-16) |
| POST | `/api/upload/mseed` | Importación | Procesa un MiniSEED subido por un investigador (ObsPy) |

## Patrón de Endpoints

Cada endpoint sigue esta estructura:
1. Decorador con `tags=["..."]` y `summary="..."`
2. Docstring Google-style con Args, Returns, Raises
3. Si `not supabase`: retorna datos `FALLBACK_*` (definidos en main.py)
4. `try/except` que captura cualquier error de Supabase y retorna fallback
5. Nunca lanza 503 — siempre retorna algo útil

## Modelos Pydantic (simulation.py)

Los modelos en Python replican las interfaces de `src/lib/types.ts`:

| Python (simulation.py) | TypeScript (types.ts) | Campos |
|------------------------|----------------------|--------|
| `SimulationParams` | `SimulationParams` | vp, vs, density, lambda_, mu, sourceType, magnitude, depth, epicenterLat, epicenterLon, duration, dx, dt |
| `WaveData` | `WaveData` | time, north, east, vertical (listas de float) |
| `GridInfo` | `GridInfo` | nx, nz, dx, dt, dtAdjusted, totalSteps, receiverX, receiverZ, sourceX, sourceZ |
| `SimulationResult` | `SimulationResult` | waveData, maxAmplitude, duration, dominantFrequency, params, gridInfo, pArrival, sArrival, snapshotCount |

**REGLA CRÍTICA**: Estas 4 estructuras están duplicadas en Python y TypeScript. Cualquier cambio en una debe replicarse en la otra. El campo `lambda_` en Python corresponde a `lambda` en TypeScript (reserved word en Python).

## Docstrings

- Estilo: Google (Args, Returns, Raises)
- Obligatorios en todas las funciones públicas y clases
- Modelos Pydantic usan `Field(description="...")` para Swagger

## Motor FDM (simulation.py)

La función `run_fdm(params, on_progress)` implementa:
- Ecuación de onda elástica 2D: ρ(∂²u/∂t²) = (λ+2μ)∇(∇·u) - μ∇×(∇×u) + f
- Fuente: wavelet de Ricker (`ricker(t, f0, t0)`)
- Mecanismo: doble-cupla (tectónico) o isótropo (volcánico)
- Fronteras: sponge layer (absorbente) + superficie libre en z=0
- Estabilidad: CFL check (dt ≤ dx / (Vp·√2))
- Detección de llegadas: STA con `detect_arrival(signal, dt, threshold)`
- Salida: submuestreada a max 3000 puntos

## Script process_mseed.py

- Lee carpetas con nombre formato `YYMMDDHHMMGVA` (ej: `0602081159GVA`)
- Busca estación triaxial (prioriza canales HH sobre EL)
- Remueve offset DC: `data = data - mean(data)`
- Normaliza a [-1, 1]: `data = data / max(abs(data))`
- Submuestrea a max 3000 puntos
- Genera JSON individual por evento + `index.json` con metadatos
- Output: `public/data/galeras/`
