# Mapa 3D — Documentación técnica

Visualización estilo Swaves (EarthScope) de la propagación de ondas sísmicas
en Nariño y la zona fronteriza con Ecuador. Muestra en 3D los frentes de onda
P y S expandiéndose desde un hipocentro hacia las estaciones de la red, con una
sección de registro (sismogramas) sincronizada.

## Regla central de arquitectura

**Todo el cálculo numérico se hace en el backend (Python).** El frontend solo
pide datos por HTTP y los dibuja. No hay fórmulas de física en TypeScript.

- Distancias, azimut y proyección: `backend/core/geo.py`
- Tiempos de viaje (homogéneo e IASP91): `backend/api/travel_times.py`
- Síntesis FDM 2D: `backend/core/fdm.py` (`run_fdm_synthetic`)
- Lectura de MiniSEED: `backend/api/waveforms.py`

El frontend (`src/pages/Map3D.tsx`, `src/components/map3d/`) solo hace:
proyección de coordenadas a la escena (dibujo, no física), animación por reloj,
y render con Three.js.

## Dominio

| Eje | Rango |
|-----|-------|
| Latitud | 0.3° a 2.7° N |
| Longitud | -79.6° a -76.6° W |
| Profundidad | 0 a 200 km |

Definido en `backend/core/geo.py` (`DOMAIN`) y replicado para dibujo en
`src/components/map3d/domain.ts`.

## Flujo de uso

1. El usuario coloca un epicentro haciendo clic en el terreno del bloque 3D, o
   carga un evento del catálogo (JSON de `public/data/cm` y `public/data/galeras`).
2. El frontend llama `POST /api/travel-times` → posiciona la escena y habilita
   reproducir.
3. Al reproducir, un reloj (`elapsed`) avanza; los anillos P/S se dibujan con
   radio `v · elapsed` (v del panel) y las estaciones parpadean al ser
   alcanzadas por el frente, usando los tiempos del backend.
4. Por cada estación se pide `POST /api/synthetic` con su distancia epicentral;
   la componente vertical alimenta la traza de la sección de registro.
5. Al hacer clic en una estación se muestra su detalle (tP/tS, malla, tiempo).

## Fuentes de datos

### Coordenadas de estaciones (`backend/core/stations.py`)

El servicio FDSN del SGC no es accesible desde la red local y los MiniSEED no
incluyen coordenadas; solo **TUM** está federada en EarthScope/IRIS. Las demás se
tomaron del **Boletín Sismológico REDSW Vol. 5 N°1, OSSO Univalle, 2016, Tabla 1
(datos RSNC/SGC)**:

| Código | Lat | Lon | Alt (m) | Nota |
|--------|-----|-----|---------|------|
| TUM | 1.840 | -78.730 | 50 | Boletín |
| CRU | 1.570 | -76.950 | 2761 | Boletín |
| CUM | 0.860 | -77.840 | 3420 | Boletín |
| BBAC | 2.021 | -77.248 | 1723 | Boletín (Balboa, Cauca) |
| CPOP2 | 2.540 | -76.680 | 1869 | asumida = POP2 (Popayán) |
| PAS2 | 1.2136 | -77.2811 | — | aproximada (Pasto), pendiente SGC |
| TUM3C | 1.862 | -78.710 | — | aproximada (Tumaco), desplazada ~3.3 km de TUM |

Cada estación expone su `source`, visible en el tooltip del marcador.

### Relieve (SRTM / terrain-tiles)

`scripts/make_terrain.py` genera los recursos de terreno del dominio:
- `narino_heightmap.png` — mapa de altura (1536×1024, de teselas Terrarium AWS
  `elevation-tiles-prod`, dominio abierto; batimetría recortada a 0 m).
- `narino_hillshade.png` — sombreado de relieve (azimut 315, altitud 45) con
  tinte de elevación (azul mar, verdes bajos, ocres altos).
- `narino_coast.json` / `narino_border.json` — polilíneas de costa y límite
  departamental de **Natural Earth** (dominio público, capas ne_10m).

El script intenta primero Terrarium (sin límite de teselas), luego SRTM vía la
librería `elevation`. Si no hay conexión, admite un GeoTIFF local
`scripts/srtm_narino.tif` con `--no-download`.

## Contratos de los endpoints

### GET /api/stations

Devuelve el catálogo de estaciones.

Respuesta:
```json
{
  "estaciones": [
    { "code": "TUM", "name": "Tumaco, Nariño", "latitude": 1.8237,
      "longitude": -78.7267, "altitude_m": null, "approx": false }
  ]
}
```

### POST /api/travel-times

Petición:
```json
{ "lat": 1.2136, "lon": -77.2811, "depth_km": 15,
  "vp_km_s": 6.0, "vs_km_s": 3.5, "model": "homogeneous" }
```

Respuesta (ordenada por distancia epicentral ascendente):
```json
{
  "modelo_usado": "homogeneous",
  "estaciones": [
    { "code": "PAS2", "name": "Pasto, Nariño", "latitude": 1.2136,
      "longitude": -77.2811, "approx": true,
      "distancia_epicentral_km": 0.0, "distancia_hipocentral_km": 15.0,
      "distancia_grados": 0.0, "azimut": 0.0,
      "tP": 2.5, "tS": 4.2857, "tS_menos_tP": 1.7857 }
  ]
}
```

- `model: "homogeneous"` → `tP = d_hipocentral / vp`, `tS = d_hipocentral / vs`.
- `model: "iasp91"` → `obspy.taup.TauPyModel("iasp91").get_travel_times(...)`,
  primer arribo P y S.

### POST /api/synthetic

Petición:
```json
{ "vp": 3500, "vs": 2000, "density": 2600, "magnitude": 5,
  "depth_km": 15, "source_type": "tectonic", "distance_km": 5,
  "nx": 200, "nz": 150, "dt_max_s": 0.02 }
```

Respuesta:
```json
{
  "t": [0.0, 0.02, ...], "north": [...], "east": [...], "vertical": [...],
  "tP_detectado": 4.33, "tS_detectado": 7.81,
  "cfl_ok": true, "tiempo_computo_ms": 534.0,
  "nx": 200, "nz": 150, "dx_m": 100.0, "dt_s": 0.02
}
```

### GET /api/ray-path?lat=&lon=&depth_km=&station=&model=

Trayectoria del rayo P del hipocentro a una estación.

- `homogeneous`: recta (2 puntos).
- `iasp91`: curva real del rayo P vía `obspy.taup.get_ray_paths`.

Respuesta:
```json
{
  "modelo_usado": "iasp91", "fase": "P", "station": "TUM",
  "distancia_epicentral_km": 141.84,
  "puntos": [ {"dist_km": 0.0, "depth_km": 30.0}, {"dist_km": 6.9, "depth_km": 35.0}, ... ]
}
```

### GET /api/waveforms/{event_id}/{station_code}?freqmin=1&freqmax=10

Respuesta:
```json
{
  "event_id": "CM_M4.3_2023-01-15T17-59-19", "station": "PAS2",
  "t": [...], "canales": { "Z": [...], "N": [...], "E": [...] },
  "fs": 50.0, "starttime_utc": "2023-01-15T17:58:46.945000Z",
  "filtro": { "freqmin": 1.0, "freqmax": 10.0 }
}
```

Devuelve 404 si el evento no existe o la estación no tiene señal en él.

## Fórmulas usadas (backend)

- **Haversine** (distancia epicentral):
  `a = sin²(Δφ/2) + cosφ₁·cosφ₂·sin²(Δλ/2)`, `d = 2R·asin(√a)`, `R = 6371 km`.
- **Distancia hipocentral**: `√(epicentral² + profundidad²)`.
- **Azimut**: `atan2(sinΔλ·cosφ₂, cosφ₁·sinφ₂ − sinφ₁·cosφ₂·cosΔλ)`.
- **km→grados**: `d_km / 111.195`.
- **Tiempos homogéneos**: `t = d_hipocentral / v`.
- **FDM 2D**: ecuación de onda elástica isótropa, esquema leapfrog de 2º orden,
  derivadas cruzadas con stencil de 4 puntos, fuente Ricker (doble par para
  tectónico, isótropa para volcánico), superficie libre por espejo antisimétrico
  (`uz[:,0] = −uz[:,1]`), sponge cuadrático, estabilidad CFL `dt ≤ dx/(Vp·√2)`.
  Ver `backend/core/fdm.py`.

## Limitaciones

- **No hay propagación 3D por diferencias finitas.** Los frentes de onda de la
  escena se animan con los tiempos de viaje del backend (anillos de radio `v·t`).
  El FDM 2D solo genera los sismogramas de la sección de registro.
- **Coordenadas de estación**: solo **TUM** es oficial (EarthScope/IRIS). Las
  otras 6 (PAS2, CUM, CRU, CPOP2, TUM3C, BBAC) son aproximadas al municipio y se
  marcan con `approx` / sufijo `*`. Las altitudes están pendientes del
  StationXML del SGC (`altitude_m: null`).
- **Epicentro de eventos CM**: los datos no traen epicentro; se usa el centroide
  de las estaciones que registraron el evento como aproximación. El usuario puede
  reposicionarlo con clic.
- **Solo fases P y S directas** en la animación.

## ¿Por qué un bloque regional y no una esfera de Tierra?

A diferencia de visualizaciones globales como Swaves (EarthScope), que muestran
terremotos telesísmicos cuyas ondas recorren miles de kilómetros y atraviesan el
núcleo, este módulo trabaja a **escala local**:

- Las 7 estaciones de la red están **a menos de ~300 km** del epicentro.
- A esa escala, la **curvatura de la Tierra es despreciable**: sobre 300 km la
  desviación respecto a un plano es de pocos km, irrelevante para la
  visualización y para tiempos de ondas directas P/S.
- Una esfera del planeta completo dejaría todas las estaciones **amontonadas en
  un punto** sobre Colombia, con anillos de frente de onda invisibles de tan
  pequeños; se vería peor y no aportaría información.

Por eso el dominio se modela como un **bloque 3D regional** (lat 0.3–2.7 N,
lon -79.6 a -76.6 W, 0–200 km de profundidad), que permite ver con claridad la
superficie, el corte del subsuelo, el hipocentro a profundidad y la expansión de
los frentes P/S sobre la región.

Como **contexto geográfico** se incluye un mini globo (esquina superior derecha)
con textura Blue Marble y un punto rojo sobre Nariño; es puramente ilustrativo y
no participa en cálculos ni en la animación.

## Terreno / heightmap (opcional)

La escena usa por defecto una superficie plana con rejilla. Si existe
`public/terrain/narino_heightmap.png`, se puede usar como mapa de altura con
exageración vertical ×3.

### Cómo generar el heightmap desde SRTM 90 m

1. Descargar los tiles SRTM (90 m) que cubren el dominio (lat 0.3–2.7 N,
   lon -79.6 a -76.6 W) desde, por ejemplo, el visor de datos de la USGS
   (EarthExplorer) o CGIAR-CSI SRTM.
2. Recortar al bounding box del dominio y remuestrear a una imagen en escala de
   grises (16 bits idealmente) con GDAL:
   ```bash
   gdal_translate -projwin -79.6 2.7 -76.6 0.3 srtm_input.tif recorte.tif
   gdal_translate -of PNG -scale -ot Byte recorte.tif narino_heightmap.png
   ```
3. Colocar el PNG resultante en `public/terrain/narino_heightmap.png`.

## Ejecución

Backend:
```bash
cd backend
py -m uvicorn main:app --reload --port 8000
```

Frontend (el proxy `/api` de Vite redirige a :8000):
```bash
npm run dev
```

Tests:
```bash
cd backend && py -m pytest -q      # backend
npm run test                       # frontend (vitest)
```
