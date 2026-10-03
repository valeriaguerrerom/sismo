# Contenido científico de la sección Educación y sus fuentes

Este documento lista cada afirmación con un dato científico que aparece en el
Centro de aprendizaje (módulo Educación) y la fuente que la respalda. Sirve para
la revisión del contenido por parte del equipo y del asesor.

Regla aplicada: no se incluye ningún dato que no esté respaldado por una fuente
real citada. El contenido vive en `src/lib/educationContent.ts` (fuente única de
verdad), más `src/components/education/glossaryData.ts` (glosario),
`src/components/education/References.tsx` (referencias) y
`src/components/education/FdmMethodology.tsx` (metodología, con valores leídos del
Simulador).

> Nota de verificación pendiente: en Referencias se citó **Gómez, D. M., & Torres, R. A. (1997),
> JVGR 77, 173–193** (señales LP y tremor en Galeras) en lugar de "Gómez et al. (1999),
> Annali di Geofisica 42(3)", porque es la referencia que se pudo verificar con DOI.
> Si el asesor prefiere la de Annali di Geofisica (1999), se cambia la cita.

---

## 1. Línea de tiempo (eventos verificados)

Fuente general: Sarabia, A. M., & Cifuentes, H. G. (2018). *Evaluación del grado de daño
en la ciudad de Pasto (Colombia) a causa de sismos históricos.* Boletín Geológico, 44,
133–152. Servicio Geológico Colombiano.
https://granate.sgc.gov.co/index.php/boletingeo/article/download/413/363/455

**Coordenadas (capítulo Historia).** Cada evento tiene lat/lon y una nota de origen
(`location_note`). Los sismos históricos usan el epicentro estimado de la tabla 1 de Sarabia
y Cifuentes (2018), basada en el SISH del SGC: 1834 (1.2, −77.1), 1906 (1.5, −80.0),
1935 Tangua (1.06, −77.35), 1935 Imués (1.1, −77.5), 1936 (1.1, −77.6), 1947 (1.2, −77.3),
1979 (1.6, −79.36). Los eventos del Galeras (1993, 2006, 2004–2009) usan el cráter
(1.2288, −77.3592, SGC). La Cocha 2024 no tiene coordenadas publicadas en el boletín, así que
queda **sin punto en el mapa** (solo en la línea de tiempo). Columnas nuevas en Supabase vía
`supabase/migrations/20261005_timeline_coordinates.sql`.

| Fecha | Dato en la app | Fuente |
|-------|----------------|--------|
| 1834-01-20 | Mw 6.7 estimada por daños (no instrumental), superficial, región de Santiago (Putumayo), sistema de fallas de Afiladores, intensidad VIII (EMS-98) en Pasto | Sarabia y Cifuentes (2018) |
| 1906-01-31 | Mw 8.4 (SISH del SGC), costa pacífica (subducción) | Sarabia y Cifuentes (2018) / SGC |
| 1935-08-07 | Mw 6.1, Tangua | Sarabia y Cifuentes (2018) |
| 1935-10-26 | Mw 5.9, Imués, falla de Romeral | Sarabia y Cifuentes (2018) |
| 1936-07-17 | Mw 6.3, Túquerres | Sarabia y Cifuentes (2018) |
| 1947-07-14 | Mw 6.1, Pasto, falla de Romeral, intensidad VIII en Pasto, ~500 casas de adobe/ladrillo sin refuerzo demolidas | Sarabia y Cifuentes (2018) |
| 1979-12-12 | Mw 8.1, profundidad ~25 km, Tumaco (subducción), tsunami | USGS Earthquake Hazards Program |
| 1993-01-14 | Erupción del Galeras durante taller científico en el cráter; 9 fallecidos (6 científicos y 3 visitantes) | Baxter & Gresham (1997), JVGR 77:325–338; USGS Volcano Watch (1993) |
| 2006-07-12 | Erupción explosiva, columna ~8 km (boletín semestral OVSP II-2006) | SGC/OVSP |
| 2004–2009 | 17 erupciones explosivas del Galeras, 10 en 2009 | SGC/OVSP |
| 2024-08-23 | Enjambre de La Cocha (campo volcánico Guamuez–Sibundoy): 966 sismos, 34 con M ≥ 2.0 | SGC, boletín del 23-08-2024 |

**Eventos retirados:** se quitaron 2016 (Ecuador–Nariño, Mw 7.8) y 2023 (Nariño, 5.6)
porque no se incluyó una ficha oficial citable con sus parámetros. Pueden volver a
agregarse con su enlace del USGS o del SGC.

**Cambios de dato respecto a la versión anterior:**
- Antes decía "ML" (magnitud local) para todos; ahora se usa **Mw** (magnitud momento),
  que es lo que reportan las fuentes citadas, y se marca "(estimada por daños)" en 1834.
- 1906 figuraba como 8.8; se corrigió a **Mw 8.4** según el valor del SISH del SGC indicado.
- 1979 figuraba como 8.1 en un sitio y 8.2 en otro; queda **Mw 8.1** con la ficha del USGS.
- Galeras 1993: la cifra de 9 fallecidos (6 científicos + 3 visitantes) queda citada con
  Baxter & Gresham (1997) y USGS (verificada, antes sin fuente).

## 2. Ondas sísmicas (movimiento y animación)

Fuente: Shearer, P. M. (2019). *Introduction to Seismology* (3.ª ed.). Cambridge University Press.

- Onda P: de cuerpo, la más rápida; movimiento **longitudinal** (compresión y dilatación
  en la dirección de propagación); se propaga en sólidos y líquidos. ✔ La animación ahora
  muestra partículas desplazándose a lo largo del eje de propagación.
- Onda S: de cuerpo; movimiento **transversal** (perpendicular); no se propaga en líquidos.
- Onda Love: superficial; **cizalla horizontal** perpendicular a la propagación; amplitud
  máxima en superficie que **decae con la profundidad**.
- Onda Rayleigh: superficial; movimiento **elíptico retrógrado** en el plano vertical;
  amplitud que **decae con la profundidad**.
- Se retiró la etiqueta "Componente: Vertical (Z)" y el "Daño (bajo/alto)". En su lugar se
  explica que **la componente donde mejor se observa cada onda depende del ángulo de llegada**
  al sismómetro y de la orientación del movimiento respecto a la estación.

## 3. Profundidad

Fuente: Stein, S., & Wysession, M. (2003). *An Introduction to Seismology, Earthquakes,
and Earth Structure.* Blackwell.

- Clasificación estándar por profundidad del foco: **superficial < 70 km**, **intermedio
  70–300 km**, **profundo 300–700 km**.
- Se **retiró** la "intensidad" que se calculaba solo con la profundidad. Se aclara que la
  intensidad en superficie depende de **magnitud, distancia, profundidad, tipo de suelo y
  vulnerabilidad de las construcciones**.
- Subducción: la afirmación de que los sismos se profundizan hacia el oriente, coherente con
  la subducción de la placa de Nazca bajo el occidente de Colombia, se cita ahora con
  **Vargas, C. A., & Mann, P. (2013). *Tearing and Breaking Off of Subducted Slabs…* Bulletin
  of the Seismological Society of America, 103(3), 2025–2046. DOI 10.1785/0120120328**
  (confirmada en Crossref). Se **retiró Yarce et al. (2014)**: no se pudo confirmar en Crossref
  un artículo con ese autor, volumen, páginas y DOI, así que no cumplía la regla de fuente
  verificable.

## 4. Metodología FDM

Los valores (Vp, Vs, ρ, dx, dt, duración, frecuencia de la fuente) se **leen de los presets
reales del Simulador** (`src/lib/simulation.ts`: `tectonicParams`, `volcanicParams`), no se
escriben a mano. CFL (2D): `dt ≤ dx / (Vp·√2)`.

- Modelo del medio: el simulador ofrece **una capa** (homogéneo) o **dos capas** (capa
  superficial blanda sobre semiespacio de roca). Se explica cada uno; se evitó presentar
  "homogéneo" como la única opción.
- Borde absorbente: esquema de **Cerjan et al. (1985)**, *Geophysics* 50(4), 705–708.
- Detección de arribos: tipo **STA/LTA**.
- Referencias del método: Virieux (1986); Moczo, Kristek & Gális (2014); Courant, Friedrichs
  & Lewy (1928); Aki & Richards (2002).

## 5. Glosario (términos revisados)

- "Algoritmo STA" → **"STA/LTA"**: cociente de promedios de corto y largo plazo; detector
  clásico de arribos (Shearer, 2019).
- "Profundidad focal": se corrigió la clasificación a superficial < 70 / intermedia 70–300 /
  profunda 300–700 km (Stein y Wysession, 2003). Antes decía < 30 / 30–70 / > 70, que es
  incorrecto.
- "Onda Love": se quitó el juicio de daño ("muy destructiva") y se dejó la descripción física.
- "Capa esponja" → **"Borde absorbente (Cerjan)"**, citando Cerjan et al. (1985).
- **"Moho (discontinuidad de Mohorovičić)"** (nuevo): límite corteza–manto; en el modelo
  global IASP91 está a 35 km, pero bajo los Andes la corteza es más gruesa y el Moho más
  profundo. (Kennett & Engdahl, 1991 para IASP91.)
- "IASP91": se aclara que es un **promedio global**, no un modelo local de Nariño.

## 6. Quiz

Cada pregunta tiene una sola respuesta correcta, con explicación y fuente (ver
`educationContent.ts`, arreglo `QUIZ`). Ahora son **13 preguntas** (el quiz muestra 9 por
intento, siempre con las visuales). Cada intento da el puntaje final y, por cada fallo, un
acceso al capítulo correspondiente para repasar (categoría → capítulo).

- Se **retiró** la pregunta "¿Qué institución monitorea los volcanes de Nariño?" que ofrecía
  "SGC (OVSP)" e "INGEOMINAS" como opciones distintas: **INGEOMINAS se fusionó en el actual
  Servicio Geológico Colombiano**, de modo que eran la misma entidad y la pregunta admitía dos
  respuestas válidas.
- Preguntas de ondas (P más rápida, S en líquidos, movimiento Rayleigh), tectónica (placa de
  Nazca), profundidad (superficial < 70 km; foco a 120 km es intermedio), metodología (CFL),
  volcanes (Galeras 1993) y magnitud (×32 de energía por unidad, con Hanks y Kanamori 1979;
  magnitud frente a intensidad con el ejemplo de 1947, con Sarabia y Cifuentes 2018).
- **Preguntas visuales:** una trayectoria elíptica (Rayleigh), un sismograma de movimiento
  transversal (S) y una profundidad de 120 km para clasificar. Los distractores son las
  confusiones típicas (P frente a S, superficial frente a intermedio).

## 7. Referencias

Separadas en **"Para aprender"** (Shearer 2019; Stein & Wysession 2003; Sarabia y Cifuentes
2018; Narváez et al. 1997; Gómez & Torres 1997; Baxter & Gresham 1997; boletines del OVSP) y
**"Base técnica del proyecto"** (Aki & Richards 2002; Moczo et al. 2014; Virieux 1986; CFL
1928; Cerjan et al. 1985; Kennett & Engdahl 1991 IASP91; ObsPy), más fuentes oficiales (SGC,
FDSN, USGS, EarthScope/IRIS).

- Se **retiró la Guía de Scrum** (Schwaber & Sutherland, 2020): corresponde a la metodología
  de desarrollo del software, no al contenido educativo.

## 8. Verificación de referencias (cuáles se comprobaron)

Verificadas abriendo el enlace, el DOI o el registro del autor:

- **Sarabia & Cifuentes (2018)** — título corregido a *"Evaluación del grado de daño en la
  ciudad de Pasto (Colombia) a causa de sismos históricos"*. Verificado por el registro ORCID
  de Ana Milena Sarabia (0000-0002-7362-5429), que lista ese título. El enlace oficial
  (granate.sgc.gov.co/.../413/363/455) no se pudo abrir desde la herramienta por un error de
  certificado del servidor del SGC, pero es el enlace institucional indicado. (El título
  anterior, "Catálogo de intensidades macrosísmicas…", correspondía a OTRO artículo de los
  mismos autores; era un error.)
- **Narváez et al. (1997)**, "Tornillo-type seismic signals at Galeras volcano" — verificado
  en NASA ADS: 1997 JVGR 77, 159. Volumen y página correctos.
- **Gómez & Torres (1997)**, señales de largo período y tremor en Galeras — verificado: PDF
  real con el identificador PII S0377-0273(96)00093-5 (coincide con el DOI citado).
- **Baxter & Gresham (1997)**, muertes en la erupción del Galeras 1993 — verificado antes en
  ADS y USGS Volcano Watch; JVGR 77, 325–338.
- **Shearer (2019)**, **Stein & Wysession (2003)**, **Aki & Richards (2002)**,
  **Moczo et al. (2014)**, **Virieux (1986)**, **CFL (1928)**, **Cerjan et al. (1985)**,
  **Kennett & Engdahl (1991, IASP91)** — libros y artículos clásicos, citados por su
  referencia estándar (no se abrió un enlace por título/edición, son referencias de catálogo
  bibliográfico ampliamente conocidas).

## 9. Datos del catálogo (seismic_events) — origen de las coordenadas

Fuente: `backend/gen_seismic_seed.py` (generador del seed del catálogo).

- **Eventos CM (tectónicos): la latitud/longitud NO es el epicentro real.** Es el
  **centroide de las estaciones** que registraron el evento (los datos no traen epicentro).
  La magnitud sale del nombre del archivo; `depth_km` es **NULL** (sin dato).
- **Eventos Galeras (volcánicos): coordenada fija del cráter** (1.2216, −77.3742);
  magnitud y profundidad NULL.
- **Cifras:** de 134 eventos CM hay solo **28 coordenadas distintas**; **121 de 134 comparten
  su coordenada** con otro evento (el centroide más repetido lo usan 24 eventos). Son por tanto
  **puntos por zona, no epicentros individuales**.
- **Consecuencia:** estas coordenadas **no deben usarse para medir el error de localización**
  en ningún laboratorio. En el Explorador y el Mapa 3D se marcan como "ubicación aproximada
  (centroide de estaciones), no epicentro". `depth_km` NULL se muestra como "profundidad no
  disponible en el catálogo; se usa 15 km para la simulación".

## 10. Condición CFL del motor (verificada en el código)

Leída de `backend/core/fdm.py` (`cfl_limit = dx / (vp_max · √2)`, líneas 681 y 1458):
el motor usa **dt ≤ dx / (Vp·√2)** en 2D, con la Vp máxima del medio (en modelo de dos capas
la fija la capa más rápida). Si el dt elegido la viola, el motor lo reduce a `cfl_limit · 0.9`.
El glosario y la metodología usan esta misma fórmula.

## Pendiente para los laboratorios (Fase siguiente)

- **Magnitud:** comparador logarítmico con sismos reales de la línea de tiempo (amplitud ×10
  por unidad, energía ×~32). Usar las magnitudes de `TIMELINE` (ya con fuente).
- **Historia:** mapa de Nariño con los eventos de Sarabia y Cifuentes (los de `TIMELINE`
  tectónicos), ubicados por municipio/zona (no por epicentro instrumental).
- **Metodología:** mini simulación 1D de la condición CFL y la dispersión numérica (variar
  dx/dt y ver estabilidad), coherente con la fórmula del motor.
- **Localiza el sismo:** usar SOLO TUM, CRU, CUM y BBAC (coordenadas confirmadas). Problema
  pendiente: los eventos CM no tienen epicentro individual (centroide de zona), así que no se
  puede medir "error vs epicentro real". Opción honesta: plantear el reto con tiempos S−P y
  mostrar la zona estimada, sin afirmar un error en km contra un epicentro que es de zona.
- **Quiz:** preguntas basadas en lo que el usuario hizo en los laboratorios.

## 11. Estructura por capítulos y estado de los laboratorios (rediseño final)

La sección tiene cinco capítulos (barra que es una fila deslizable en móvil y una columna en
escritorio): Ondas, Magnitud, Profundidad, Historia y Metodología, con el progreso guardado en
localStorage (`src/lib/useChapterProgress.ts`). El progreso se marca **al completar el reto**
de cada capítulo, no al abrirlo. Glosario, Referencias y Quiz quedan en un bloque de consulta.
Los capítulos **ya no** tienen botones al Simulador ni al Mapa 3D: hay un **único cierre** que
aparece al completar los cinco, con accesos al Simulador y al Mapa 3D. El botón de ayuda del
encabezado abre una guía breve de uso (ya no un tour). Cada capítulo tiene su diseño propio y
su fuente al pie.

Todos los laboratorios están implementados:
- **Ondas** (`WaveLab.tsx`): corte vertical con malla de partículas; selector P, S (SV y SH),
  Love y Rayleigh. Corrección de Love: en la vista en planta todas las partículas de la
  superficie tienen la misma amplitud, y el decaimiento con la profundidad se muestra en un
  perfil lateral. Clic en una partícula para seguir su trayectoria. Sismómetro a todo el ancho,
  con las componentes vertical y horizontal; en Rayleigh van desfasadas un cuarto de periodo.
  Modo carrera que estima la distancia con d = (tS − tP)·Vp·Vs/(Vp − Vs). Reto de 5 rondas.
  Fuente: Shearer (2019).
- **Magnitud** (`MagnitudeLab.tsx`): comparador de dos sismos (de la línea de tiempo o magnitud
  libre); amplitud ×10 por unidad y energía con log10 E = 1.5 Mw + 4.8; cuadrícula de bloques
  (un bloque = energía del menor, con escala si son demasiados); magnitud frente a intensidad
  con el ejemplo de 1947; reto de estimar veces de energía. Fuentes: Hanks y Kanamori (1979),
  Shearer (2019), Sarabia y Cifuentes (2018) para la intensidad de 1947.
- **Profundidad** (`DepthLab.tsx`): corte longitud vs profundidad con los 444 hipocentros del
  USGS (`public/data/usgs_narino.json`), franjas superficial/intermedio, tooltip en español con
  el lugar del USGS, nota de subducción citada con Vargas y Mann (2013) y reto de clasificar.
- **Historia** (`HistoryLab.tsx`): mapa de Nariño (mismo componente Leaflet del Explorador,
  `SeismicMap`) con los eventos ubicados por sus coordenadas, junto a la línea de tiempo
  cronológica. Al tocar un evento en el mapa se resalta en la línea y al revés. Filtro
  tectónico/volcánico. Cada evento muestra fecha, magnitud, su nota de ubicación y la fuente.
  Lee de Supabase con respaldo en el código.
- **Metodología** (`FdmMethodology.tsx`): seis pasos con mini interacciones: malla (nodos por
  longitud de onda según dx, avisa cuando son menos de diez), CFL (una onda 1D que se vuelve
  inestable al subir dt sobre dx/(Vp·√2)) y fuente (la ondícula de Ricker cambiando con la
  frecuencia). Los valores del Simulador se leen de los presets reales. Reto de 3 preguntas.

**Corrección de la duración:** los presets del Simulador tenían `duration: 9`, pero el
comentario del código y el tope del panel son 8 s (tectónico) y 13 s (volcánico), y el primer
rebote de borde del dominio tectónico llega a ~8.4 s. Se corrigió a **8 s (tectónico)** y
**7 s (volcánico)** en `src/lib/simulation.ts`, así que Metodología y el Simulador muestran el
mismo valor.

**Glosario y referencias:** el glosario es una lista en dos columnas, alfabética, con índice de
letras y buscador; la categoría de cada término va como texto de color. Las referencias están
en APA, en dos grupos (Para aprender / Base técnica), con los enlaces mostrados cortos (DOI) y
un botón para copiar cada cita.

**Pendiente (no bloqueante):** subrayar los términos del glosario dentro del texto de los
capítulos con su definición al tocarlos. Queda para una iteración siguiente. El tour antiguo
`src/tours/educacion.ts` quedó sin uso (Educación ya no lanza tour); se puede borrar.
