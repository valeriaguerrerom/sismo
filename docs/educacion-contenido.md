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
`educationContent.ts`, arreglo `QUIZ`).

- Se **retiró** la pregunta "¿Qué institución monitorea los volcanes de Nariño?" que ofrecía
  "SGC (OVSP)" e "INGEOMINAS" como opciones distintas: **INGEOMINAS se fusionó en el actual
  Servicio Geológico Colombiano**, de modo que eran la misma entidad y la pregunta admitía dos
  respuestas válidas.
- Preguntas revisadas: onda más rápida (P), ondas S en líquidos (no), movimiento Rayleigh
  (elíptico retrógrado), placa que subduce (Nazca), profundidad superficial (< 70 km),
  para qué sirve la CFL (estabilidad), qué pasó en el Galeras en 1993.

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

## 11. Estructura por capítulos y estado de los laboratorios

La sección se reorganizó en capítulos (barra lateral numerada): Ondas, Magnitud,
Profundidad, Historia y Metodología, con el progreso guardado en localStorage
(`src/lib/useChapterProgress.ts`). Glosario, Referencias y Quiz quedan en un
bloque de consulta aparte. Cada capítulo tiene un botón para abrir el Simulador
o el Mapa 3D y la fuente al pie.

Laboratorios IMPLEMENTADOS esta noche:
- **Ondas** (`src/components/education/WaveLab.tsx`): malla de partículas con el
  movimiento físico correcto (P longitudinal, S transversal, Love cizalla
  horizontal en vista superior, Rayleigh elíptica retrógrada que decae con la
  profundidad), controles de frecuencia y velocidad, "seguir una partícula" con
  su trayectoria, sismómetro virtual en superficie en tiempo real (componentes
  vertical y horizontal), y reto de 5 rondas. Fuente: Shearer (2019).
- **Profundidad** (`src/components/education/DepthLab.tsx`): corte longitud vs
  profundidad con los hipocentros reales del USGS (`public/data/usgs_narino.json`,
  444 eventos), franjas superficial/intermedio, hover con fecha, magnitud,
  profundidad y lugar, fuente "USGS ComCat, consultado el [fecha]", nota de
  subducción citada (Stein y Wysession, 2003) y reto de clasificar 5 eventos.

Pendiente de laboratorio propio (los capítulos muestran su contenido corregido
mientras tanto, sin plantillas repetidas):
- **Magnitud:** hoy es la escala interactiva; falta el comparador logarítmico
  con sismos reales de la línea de tiempo (amplitud ×10, energía ×~32).
- **Historia:** hoy es la línea de tiempo con fuentes; falta el mapa de Nariño
  con los eventos de Sarabia y Cifuentes ubicados por zona.
- **Metodología:** hoy es el acordeón del método con valores reales; falta la
  mini simulación de CFL y dispersión numérica.
- **Localiza el sismo:** usar solo TUM, CRU, CUM y BBAC (confirmadas). Los
  eventos CM no tienen epicentro individual (centroide de zona), así que el reto
  debe mostrar la zona estimada sin afirmar un error en km contra el catálogo.
- **Quiz basado en laboratorios:** preguntas ligadas a lo que el usuario hizo.

Nota sobre el reto del laboratorio de ondas: por ahora describe el movimiento en
texto; una mejora es mostrar la trayectoria o el sismograma animado y que el
usuario los identifique visualmente.

El tour guiado anterior de Educación (`src/tours/educacion.ts`) apuntaba a la
estructura vieja (data-tour que ya no existe) y quedó sin cablear; se puede
rehacer para la estructura por capítulos.
