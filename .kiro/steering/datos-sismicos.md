---
inclusion: always
---

# SismoNariño — Datos Sísmicos y Motor FDM

## Fuentes de Datos

### Supabase (históricos)
- Tabla `seismic_events`: 35 eventos históricos de Nariño (1827–2023)
- Fuentes: SGC, OVSP, USGS
- Campos: id, event_date, event_time, magnitude, depth_km, latitude, longitude, location_name, event_type, source, notes
- RLS: lectura pública para `anon` y `authenticated`

### Datos Reales MiniSEED (Galeras 2006)
- 10 eventos volcánicos del Volcán Galeras
- Estación: CUFP (broadband, 3 componentes HHE/HHN/HHZ, 100 Hz)
- Procesados a JSON en `public/data/galeras/`
- Archivo índice: `public/data/galeras/index.json`
- Archivos individuales: `public/data/galeras/{id}.json` con campo `waveData`
- Los nombres de carpeta codifican fecha: `YYMMDDHHMMGVA` → 2006-MM-DD HH:MM, Galeras Volcánico A

### Datos Educativos (Supabase)
- `quiz_questions`: 15 preguntas con categorías (ondas, volcanes, tectónica, general)
- `wave_facts`: 18 datos curiosos por tipo de onda (P, S, Love, Rayleigh)
- `timeline_events`: 9 eventos históricos para la línea de tiempo
- Todos con campo `active` (boolean) para habilitar/deshabilitar sin borrar

## Motor FDM — Implementaciones Paralelas

El motor FDM existe en dos lenguajes con lógica idéntica:

| Aspecto | TypeScript (`src/lib/simulation.ts`) | Python (`backend/simulation.py`) |
|---------|--------------------------------------|----------------------------------|
| Ejecución | Web Worker en navegador | Servidor FastAPI |
| Librería numérica | Arrays nativos Float32Array | NumPy float32 |
| Snapshots | Genera WavefieldSnapshot[] para 3D | Solo cuenta (snapshotCount) |
| Transferencia | ArrayBuffers transferibles al main thread | JSON response |
| Uso actual | Activo (es el que corre) | Disponible via `/api/simulate` |

### Parámetros por defecto (`defaultParams()`)
```
vp: 3500 m/s, vs: 2000 m/s, density: 2600 kg/m³
sourceType: 'tectonic', magnitude: 5.0, depth: 15 km
epicenterLat: 1.2136, epicenterLon: -77.2811 (Pasto)
duration: 60 s, dx: 100 m, dt: 0.02 s
```

### Parámetros volcánicos (precargados al cargar datos Galeras)
```
vp: 3000 m/s, vs: 1700 m/s, density: 2500 kg/m³
sourceType: 'volcanic', magnitude: 4.5, depth: 5 km
epicenterLat: 1.2216, epicenterLon: -77.3742 (Galeras)
duration: ajustada al evento real (max 60 s)
```

### Flujo de Simulación en el Frontend
1. Usuario configura params en `ParametersPanel`
2. `Simulation.tsx` → `handleRun()` crea Web Worker con `simulation.worker.ts`
3. Worker importa `runFDM` de `simulation.ts` y ejecuta
4. Worker envía mensajes `progress` y `done` al main thread
5. Al completar: `result` se llena con `SimulationResult`
6. `WaveChart` muestra sismogramas 2D con `visibleRatio` animado
7. `TriaxialPlane` muestra propagación 3D con snapshots y Three.js

### Flujo de Datos Reales Galeras
1. `Explorer.tsx` carga `index.json` al montar
2. Usuario hace clic en evento → `loadGalerasWave()` carga JSON individual
3. `RealWaveChart` muestra preview en el explorador
4. "Cargar en Simulador" → `App.tsx` pasa `realWaveData` + params volcánicos a `Simulation.tsx`
5. Simulación FDM se lanza automáticamente en background
6. Vista 2D muestra datos reales, vista 3D muestra propagación simulada

## Contrato de Datos Frontend ↔ Backend

El endpoint `POST /api/simulate` recibe `SimulationParams` y retorna `SimulationResult`.
La diferencia con el resultado del frontend es que el backend no incluye `snapshots` (campo `WavefieldSnapshot[]`) — solo retorna `snapshotCount`.

Los snapshots son pesados (cada uno es un Float32Array de nx×nz×3 floats) y no es práctico transferirlos via HTTP. La propagación 3D solo funciona con la simulación local del Web Worker.
