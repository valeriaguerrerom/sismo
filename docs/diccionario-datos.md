# Diccionario de datos — SismoNariño

Documento de referencia para la estructuración de la base de datos (Objetivo 1,
actividades 4 y 5: preprocesamiento y transformación). Contiene las variables
exactas que el prototipo usa para la simulación y para la consulta de registros,
con sus unidades, rangos y valores permitidos.

Universidad Mariana · Ingeniería de Sistemas · 2026

---

## 1. Dónde vive cada cosa

El sistema maneja **dos niveles de datos** que no se guardan en el mismo sitio:

| Nivel | Contenido | Dónde vive | Por qué |
|-------|-----------|-----------|---------|
| **Metadatos del evento** | Fecha, hora, magnitud, profundidad, coordenadas, tipo | **Supabase** (tabla `seismic_events`) | Son pocos campos, se consultan y filtran |
| **Formas de onda** | Series de tiempo N/E/Z (miles de muestras por evento) | **Archivos JSON** en `public/data/` | Pesan ~115 MB; no es práctico en PostgreSQL |
| **Archivos crudos** | MiniSEED originales del SGC | Carpeta `backend/data_raw/` | Fuente de origen, no se versiona |

Esto corresponde al esquema de dos niveles descrito en el documento: la **tabla de
eventos** (Nivel 1) va a Supabase, y el **registro de formas de onda** (Nivel 2)
queda vinculado por el identificador del evento.

---

## 2. Tabla `seismic_events` — esquema actual en Supabase

Es la tabla que alimenta el explorador de registros históricos y que precarga el
simulador. Este es el esquema que el código ya espera:

| Columna | Tipo SQL | Obligatorio | Descripción | Ejemplo |
|---------|----------|-------------|-------------|---------|
| `id` | `uuid` | PK auto | Identificador único | `gen_random_uuid()` |
| `event_date` | `date` | Sí | Fecha del evento en UTC | `2024-08-23` |
| `event_time` | `text` | No (def. `00:00:00`) | Hora UTC `HH:MM:SS` | `03:04:05` |
| `magnitude` | `numeric(4,2)` | Sí | Magnitud del evento | `3.40` |
| `depth_km` | `numeric(6,2)` | Sí | Profundidad focal en km | `15.00` |
| `latitude` | `numeric(9,6)` | Sí | Latitud del epicentro (WGS84 decimal) | `1.213600` |
| `longitude` | `numeric(9,6)` | Sí | Longitud del epicentro (WGS84 decimal) | `-77.281100` |
| `location_name` | `text` | Sí | Lugar de referencia | `Pasto, Nariño` |
| `event_type` | `text` | Sí (def. `tectonic`) | **Solo dos valores**: `tectonic` o `volcanic` | `tectonic` |
| `source` | `text` | No (def. `SGC`) | Agencia de origen | `SGC` |
| `notes` | `text` | No | Observaciones / id público del catálogo | `smi:sgc.gov.co/event/1` |
| `created_at` | `timestamptz` | Auto | Fecha de inserción | `now()` |

**Reglas importantes:**

- `event_type` acepta **únicamente** los literales `tectonic` y `volcanic`, en
  inglés y en minúscula. Todo el frontend filtra y colorea por este campo.
- Las coordenadas van en **grados decimales WGS84**, con signo negativo para
  longitud oeste. Nada de grados-minutos-segundos.
- La hora es **texto**, no tipo `time`, para tolerar registros donde solo se
  conoce la fecha.

### 2.1 Columnas que conviene agregar

Estas no existen todavía, pero el código ya las produce al importar catálogos
QuakeML del SGC y hoy se pierden dentro de `notes`. Si vas a rehacer las tablas,
vale la pena crearlas bien desde el principio:

```sql
ALTER TABLE seismic_events ADD COLUMN IF NOT EXISTS magnitude_type text;   -- 'Mw', 'ML', 'mb'
ALTER TABLE seismic_events ADD COLUMN IF NOT EXISTS event_id_source text;  -- id público del SGC
ALTER TABLE seismic_events ADD COLUMN IF NOT EXISTS stations_available text[]; -- ['PAS2','CUM']
```

- `magnitude_type` respeta la decisión metodológica de **no convertir entre
  escalas**: se guarda la magnitud tal como la reporta el SGC junto con su tipo.
- `stations_available` es el campo de **disponibilidad instrumental** descrito en
  el documento (qué estaciones aportaron señal válida a cada evento).

---

## 3. Las 13 variables de la simulación

Estas son las variables físicas que recibe el motor de diferencias finitas. Son
el corazón del Objetivo 2, pero las incluyo porque varias se precargan desde el
catálogo de eventos.

### 3.1 Propiedades elásticas del subsuelo

| Variable | Unidad | Mínimo | Máximo | Por defecto | Descripción |
|----------|--------|--------|--------|-------------|-------------|
| `vp` | m/s | 1000 | 8000 | 3500 | Velocidad de onda P (compresional) |
| `vs` | m/s | 200 | 4500 | 2000 | Velocidad de onda S (corte) |
| `density` | kg/m³ | 1500 | 3500 | 2600 | Densidad del medio (ρ) |
| `lambda` | Pa | calculado | calculado | 1.10 × 10¹⁰ | Primer parámetro de Lamé (λ) |
| `mu` | Pa | calculado | calculado | 1.04 × 10¹⁰ | Módulo de corte (μ) |

Los parámetros de Lamé **no se capturan**, se derivan automáticamente:

```
μ = ρ · Vs²
λ = ρ · Vp² − 2μ
```

### 3.2 Fuente sísmica

| Variable | Unidad | Mínimo | Máximo | Por defecto | Descripción |
|----------|--------|--------|--------|-------------|-------------|
| `sourceType` | — | — | — | `tectonic` | `tectonic` (doble par) o `volcanic` (isótropa) |
| `magnitude` | Mw | 2.0 | 9.0 | 5.0 | Magnitud momento |
| `depth` | km | 1 | 300 | 15 | Profundidad focal |
| `epicenterLat` | grados | libre (paso 0.01) | | 1.2136 | Latitud del epicentro |
| `epicenterLon` | grados | libre (paso 0.01) | | −77.2811 | Longitud del epicentro |

El epicentro no está acotado en el formulario, pero el dominio regional que
modela la plataforma es **latitud 0.3° a 2.7° N y longitud −79.6° a −76.6° W**,
con profundidades de 0 a 200 km. Los eventos del catálogo deberían caer dentro de
esa ventana para que el mapa 3D los represente correctamente.

El tipo de fuente cambia el mecanismo físico y la frecuencia dominante:

| Tipo de fuente | Mecanismo | Frecuencia dominante (f₀) |
|----------------|-----------|---------------------------|
| `tectonic` | Doble par (radiación con lóbulos) | 3.5 Hz |
| `volcanic` | Isótropo / explosivo (radiación uniforme) | 2.0 Hz |

La magnitud escala la amplitud de la fuente según `10^(Mw − 2) × 10⁴`.

### 3.3 Configuración numérica

| Variable | Unidad | Mínimo | Máximo | Por defecto | Descripción |
|----------|--------|--------|--------|-------------|-------------|
| `duration` | s | 10 | 120 | 60 | Duración del registro simulado |
| `dx` | m | 10 | 500 | 100 | Resolución espacial de la malla |
| `dt` | s | 0.005 | 0.1 | 0.02 | Paso temporal |

`dt` se ajusta solo si viola la condición de estabilidad CFL:

```
dt ≤ dx / (Vp · √2)
```

### 3.4 Valores precargados para eventos volcánicos

Cuando se carga un registro del Galeras al simulador, estos son los valores que
se aplican automáticamente:

| Variable | Valor |
|----------|-------|
| `vp` / `vs` / `density` | 3000 m/s · 1700 m/s · 2500 kg/m³ |
| `sourceType` | `volcanic` |
| `depth` | 5 km |
| Epicentro | 1.2216, −77.3742 (cráter del Galeras) |

---

## 4. Puente entre el catálogo y el simulador

Cuando el usuario carga un evento histórico en el simulador, el mapeo es directo:

| Columna en `seismic_events` | Variable del simulador |
|-----------------------------|------------------------|
| `magnitude` | `magnitude` |
| `depth_km` | `depth` |
| `latitude` | `epicenterLat` |
| `longitude` | `epicenterLon` |
| `event_type` | `sourceType` |

Las propiedades elásticas (Vp, Vs, densidad) **no vienen del catálogo**: las
configura el usuario o se usan los valores por defecto. Si en el informe de
parámetros geotécnicos tienes valores de Vp/Vs/densidad por zona de Nariño,
podríamos agregar una tabla `geotechnical_zones` y que el simulador los cargue
según el epicentro. Eso conectaría directamente la actividad 5 del Objetivo 2
(integración de datos geotécnicos) con el motor.

---

## 5. Formas de onda (archivos JSON, no Supabase)

### 5.1 Registros volcánicos del Galeras

Índice: `public/data/galeras/index.json` · 32 eventos · fuente `SGC-OVSP`

| Campo | Tipo | Ejemplo | Descripción |
|-------|------|---------|-------------|
| `id` | texto | `0601040656GVA` | Nombre de la carpeta original `AAMMDDHHMM` + tipo |
| `event_date` | texto | `2006-01-04` | Fecha derivada del nombre |
| `event_time` | texto | `06:56:00` | Hora derivada del nombre |
| `station` | texto | `CUFP` | Estación triaxial seleccionada |
| `sampling_rate` | número | `100.0` | Frecuencia de muestreo final (Hz) |
| `original_sampling_rate` | número | `100.0` | Frecuencia antes de diezmar |
| `decimation_factor` | entero | `1` | Factor de diezmado aplicado |
| `normalization_factor` | número | `7345.74` | Valor pico usado para normalizar |
| `duration` | número | `20.36` | Duración en segundos |
| `num_samples` | entero | `2037` | Muestras por componente |
| `components` | lista | `["E","N","Z"]` | Componentes disponibles |
| `event_type` | texto | `volcanic` | Siempre volcánico |
| `volcanic_subtype` | texto | `va` | Ver tabla de subtipos |
| `volcanic_subtype_label` | texto | `Volcano-Tectónico` | Etiqueta legible |
| `source` | texto | `SGC-OVSP` | Origen |
| `location_name` | texto | `Volcán Galeras — …` | Descripción compuesta |

### 5.2 Registros tectónicos de la red CM

Índice: `public/data/cm/index.json` · 134 eventos · 2023-01-07 a 2026-06-05 ·
magnitudes 2.5 a 6.3 · 112 de Colombia y 22 de Ecuador

Cada evento agrupa hasta 7 estaciones:

| Campo del evento | Ejemplo |
|------------------|---------|
| `id` | `CM_M2.5_2023-01-09T00-24-00` |
| `magnitude` | `2.5` |
| `date` / `time` | `2023-01-09` / `00:24:00` |
| `folder` | `Colombia` o `Ecuador` |
| `stations` | lista de estaciones con señal |

| Campo de cada estación | Ejemplo | Descripción |
|------------------------|---------|-------------|
| `station` | `BBAC` | Código FDSN |
| `location` | `Nariño (aprox.)` | Municipio |
| `instrument_type` | `Velocímetro banda ancha` | Tipo de sensor |
| `physical_quantity` | `Velocidad` | `Velocidad` o `Aceleración` |
| `sampling_rate` | `7.69` | Hz tras diezmado |
| `duration` | `360.62` | Segundos |
| `num_samples` | `2775` | Muestras |
| `had_gaps` | `true` | Si la traza tenía vacíos |
| `latitude` / `longitude` | `1.2` / `-77.3` | Coordenadas de la estación |
| `approx_location` | `true` | Si la coordenada es aproximada |

**Ojo con esto:** los eventos CM **no traen epicentro**. El mapa 3D usa hoy el
centroide de las estaciones como aproximación. Si tu catálogo de 111 eventos trae
latitud, longitud y profundidad reales del SGC, eso corrige la limitación más
grande del módulo. Ver la sección 9.

### 5.3 Estructura de la serie de tiempo

Igual para ambas fuentes, dentro de cada archivo individual:

```json
"waveData": {
  "time":     [0.0, 0.01, 0.02, ...],
  "north":    [-0.18191, -0.16653, ...],
  "east":     [...],
  "vertical": [...]
}
```

- Las cuatro listas tienen **exactamente la misma longitud**.
- `time` en segundos desde el inicio del registro.
- Las tres componentes vienen **normalizadas a [−1, 1]** con el mismo factor
  global (`normalization_factor`), para no distorsionar la relación entre ejes.
- Se elimina la media (offset DC) antes de normalizar.
- Máximo 3000 muestras por componente.

---

## 6. Catálogo de estaciones

Siete estaciones. Cinco tienen coordenada oficial del Boletín Sismológico REDSW
Vol. 5 N°1 (OSSO Univalle, 2016, Tabla 1, datos RSNC/SGC):

| Código | Municipio | Latitud | Longitud | Altitud (m) | Coordenada |
|--------|-----------|---------|----------|-------------|------------|
| `TUM` | Tumaco, Nariño | 1.840 | −78.730 | 50 | Oficial |
| `CRU` | La Cruz, Nariño | 1.570 | −76.950 | 2761 | Oficial |
| `CUM` | Cumbal, Nariño | 0.860 | −77.840 | 3420 | Oficial |
| `BBAC` | Balboa, Cauca | 2.021 | −77.248 | 1723 | Oficial |
| `CPOP2` | Popayán, Cauca | 2.540 | −76.680 | 1869 | Asumida igual a POP2 |
| `PAS2` | Pasto, Nariño | 1.2136 | −77.2811 | — | **Aproximada** |
| `TUM3C` | Tumaco, Nariño | 1.8620 | −78.7100 | — | **Aproximada** |

Si consigues el StationXML oficial del SGC, las dos aproximadas y las altitudes
faltantes quedarían resueltas.

---

## 7. Valores permitidos (vocabulario controlado)

Para que las dos bases concuerden, estos campos solo aceptan estos valores:

**Tipo de evento** (`event_type`)

| Valor | Significado |
|-------|-------------|
| `tectonic` | Sismo tectónico |
| `volcanic` | Sismo volcánico |

**Subtipo volcánico** (`volcanic_subtype`), derivado del sufijo de carpeta del OVSP:

| Valor | Sufijo original | Etiqueta |
|-------|-----------------|----------|
| `lp` | `GLP` | Largo Período |
| `to` | `GTO` | Tornillo |
| `tr` | `GTR` | Tremor |
| `va` | `GVA` | Volcano-Tectónico |

**Tipo de instrumento**, derivado del prefijo de canal FDSN:

| Prefijo | Instrumento | Magnitud física |
|---------|-------------|-----------------|
| `HH` | Velocímetro banda ancha | Velocidad |
| `EH` | Velocímetro periodo corto | Velocidad |
| `BH` | Velocímetro banda ancha (baja tasa) | Velocidad |
| `HN` | Acelerómetro strong motion | Aceleración |

El último carácter del canal indica la componente: `E` (este), `N` (norte),
`Z` (vertical).

---

## 8. Las demás tablas de Supabase

Estas ya están creadas y funcionando; las incluyo para el inventario completo.

| Tabla | Para qué | Filas actuales |
|-------|----------|----------------|
| `profiles` | Investigadores y administradores | Según registros |
| `simulation_reports` | Simulaciones guardadas por cada usuario | Según uso |
| `quiz_questions` | Preguntas del quiz educativo | 15 |
| `wave_facts` | Datos curiosos por tipo de onda | 18 |
| `timeline_events` | Hitos de la línea de tiempo histórica | 9 |

`profiles` guarda los datos de caracterización de usuarios: nombre, institución,
ocupación, área de investigación, ciudad, país, propósito de uso, rol
(`user` = Investigador, `admin` = Administrador), estado de la cuenta y último acceso.

---

## 9. Puntos a conciliar entre las dos bases

Lo que hay que cuadrar antes de cargar todo a Supabase:

1. **Número de eventos.** El documento reporta 111 eventos consolidados
   (89 colombianos y 22 ecuatorianos). La aplicación tiene 134 eventos CM
   procesados (112 Colombia, 22 Ecuador). Hay que decidir cuál es el conteo
   oficial y por qué difiere.

2. **Epicentros de los eventos CM.** Es lo más valioso que puede aportar tu
   catálogo: los MiniSEED no traen latitud, longitud ni profundidad del evento, y
   hoy el mapa 3D usa el centroide de estaciones como aproximación.

3. **Identificador común.** Los archivos de onda usan ids tipo
   `CM_M2.5_2023-01-09T00-24-00`. Si tu tabla usa otro identificador, hace falta
   una columna puente (por ejemplo `waveform_id`) para vincular Nivel 1 con
   Nivel 2 sin ambigüedad.

4. **Rango temporal.** El documento menciona el periodo 2023–2026 para el
   catálogo consolidado, pero también 1827–2023 para la sismicidad histórica.
   Conviene aclarar si son dos conjuntos distintos y si ambos van a la misma tabla.

5. **Tipo de magnitud.** Si conservaste el tipo reportado por el SGC (Mw, ML, mb),
   necesitamos la columna `magnitude_type` mencionada en la sección 2.1.

---

## 10. Script de referencia

Si quieres crear la tabla desde cero con las columnas recomendadas ya incluidas:

```sql
CREATE TABLE IF NOT EXISTS seismic_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date         date NOT NULL,
  event_time         text DEFAULT '00:00:00',
  magnitude          numeric(4,2) NOT NULL,
  magnitude_type     text,
  depth_km           numeric(6,2) NOT NULL,
  latitude           numeric(9,6) NOT NULL,
  longitude          numeric(9,6) NOT NULL,
  location_name      text NOT NULL,
  event_type         text NOT NULL DEFAULT 'tectonic'
                     CHECK (event_type IN ('tectonic', 'volcanic')),
  source             text DEFAULT 'SGC',
  event_id_source    text,
  waveform_id        text,
  stations_available text[],
  notes              text DEFAULT '',
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE seismic_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for seismic events"
  ON seismic_events FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_seismic_events_date      ON seismic_events(event_date);
CREATE INDEX IF NOT EXISTS idx_seismic_events_magnitude ON seismic_events(magnitude);
CREATE INDEX IF NOT EXISTS idx_seismic_events_type      ON seismic_events(event_type);
```

Las políticas de escritura para administradores están en la migración
`20260911_admin_features.sql` y no cambian con esto.
