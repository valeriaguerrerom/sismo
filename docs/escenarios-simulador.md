# Escenarios predeterminados del Simulador

Documento de apoyo para la tesis. Describe los escenarios que trae el Simulador,
sus valores, el mecanismo focal de cada uno, el acimut de la estación y las
fuentes que respaldan las velocidades, densidades, profundidades y magnitudes.

El motor es de diferencias finitas 2D (P-SV + SH) en un **medio homogéneo**
(Vp, Vs y densidad constantes). Los escenarios se eligieron para que sean
didácticos **dentro de los límites del motor**: sin rebotes de borde dentro de la
ventana útil, al menos 10 nodos por longitud de onda mínima y cómputo por debajo
de 15 s. Todos los valores se validaron ejecutando el motor real.

## Nota importante sobre la onda Rayleigh (honestidad física)

En un **semiespacio homogéneo** la onda Rayleigh viaja a ≈ 0.92·Vs, muy cerca de
la velocidad de la onda S. Por eso **no se separa nítidamente de la S** a las
distancias que caben en el dominio (unos pocos km): se midió la velocidad
aparente de la fase tardía y resultó ≈ Vs, no 0.92·Vs. Una onda Rayleigh
dispersiva y bien separada requiere un **medio estratificado** (capa lenta sobre
roca rápida) o distancias de decenas de km, que están fuera del alcance de este
motor homogéneo.

Lo que sí se muestra, y es real y didáctico, es:

- La **P y la S bien separadas** (varios segundos entre ellas).
- Con **fuente somera** y **mayor distancia epicentral**, un **tren de ondas
  superficiales** (SV + Rayleigh combinadas) fuerte en la **vertical y la
  radial** justo después de la S.
- El **contraste** entre una fuente somera (tren superficial marcado) y una
  fuente más profunda (tren superficial débil o ausente).

Por eso las etiquetas y descripciones hablan de "tren de ondas superficiales" y
no de una onda Rayleigh cronométricamente aislada.

## Distancia epicentral como parámetro

Para que la P, la S y el tren superficial se separen, se expuso la **distancia
epicentral** (`epicentralDistanceKm`, 1–12 km) como parámetro. A mayor distancia
las fases se separan más, pero el receptor se acerca al borde y el primer rebote
llega antes; los escenarios equilibran ambos efectos. La distancia efectiva se
recorta al espacio disponible entre las zonas absorbentes.

## Acimut de la estación

El acimut por defecto es **45° (NE)**. Se eligió así porque con el mecanismo de
doble par, un acimut intermedio (ni 0° ni 90°) hace que **tanto la componente
radial como la transversal aporten a Norte y a Este**, de modo que las tres
componentes (N, E, Z) se ven distintas y didácticas. Con acimut 0° o 90° una de
las dos horizontales quedaría dominada por una sola de las fases y el carácter
triaxial se apreciaría menos. Cada escenario ajusta ligeramente el acimut para
resaltar las diferencias entre componentes.

## Los escenarios

### 1. Superficial didáctico (escenario por defecto)

| Parámetro | Valor |
|-----------|-------|
| Tipo | Tectónico (doble par) |
| Magnitud | Mw 4.0 |
| Profundidad focal | 2 km |
| Vp / Vs / ρ | 3200 m/s / 1850 m/s / 2500 kg/m³ |
| Distancia epicentral | 6 km |
| Acimut estación | 40° |
| Mecanismo (strike/dip/rake) | 20° / 35° / 60° |
| dx / dt / duración | 20 m / 0.0045 s / 7 s |

**Qué se observa:** P (~2.4 s), S (~3.6 s) y, justo después, el tren de ondas
superficiales en la vertical y la radial. Es el más didáctico y por eso es el
que se carga al abrir el Simulador.

### 2. Cortical superficial andino (Nariño)

| Parámetro | Valor |
|-----------|-------|
| Tipo | Tectónico (doble par) |
| Magnitud | Mw 5.0 |
| Profundidad focal | 5 km |
| Vp / Vs / ρ | 3500 m/s / 2000 m/s / 2600 kg/m³ |
| Distancia epicentral | 6 km |
| Acimut estación | 45° |
| Mecanismo (strike/dip/rake) | 30° / 40° / 80° |
| dx / dt / duración | 22 m / 0.004 s / 7 s |

**Qué se observa:** P (~2.5 s), S (~4.1 s) y tren superficial, con energía en las
tres componentes; la transversal muestra el aporte del SH del mecanismo.

### 3. Cortical más profundo (comparación)

| Parámetro | Valor |
|-----------|-------|
| Tipo | Tectónico (doble par) |
| Magnitud | Mw 5.5 |
| Profundidad focal | 9 km |
| Vp / Vs / ρ | 3500 m/s / 2000 m/s / 2600 kg/m³ |
| Distancia epicentral | 5 km |
| Acimut estación | 45° |
| Mecanismo (strike/dip/rake) | 30° / 40° / 80° |
| dx / dt / duración | 22 m / 0.004 s / 8 s |

**Qué se observa:** P (~3.1 s) y S (~5.3 s) más separadas y un tren superficial
débil o ausente, porque la fuente profunda no excita bien la superficie libre.
Sirve para **comparar** con el escenario superficial. (La profundidad máxima que
mantiene ≥ 10 nodos/λ con este dx es ~9 km; más profundo obligaría a subir dx y
dispararía la advertencia de dispersión.)

### 4. Volcano-tectónico del Galeras

| Parámetro | Valor |
|-----------|-------|
| Tipo | Volcánico (isótropo) |
| Magnitud | Mw 2.5 |
| Profundidad focal | 3 km |
| Vp / Vs / ρ | 3000 m/s / 1700 m/s / 2500 kg/m³ |
| Distancia epicentral | 5 km |
| Acimut estación | 45° |
| Mecanismo | No aplica (fuente isótropa) |
| dx / dt / duración | 28 m / 0.0055 s / 7 s |

**Qué se observa:** domina la onda P y la componente transversal es
**prácticamente nula** (la explosión isótropa no genera cizalla / SH). La señal
decae rápido a la calma del medio homogéneo. Al ser isótropo, este escenario no
usa mecanismo focal (strike/dip/rake).

## Fuentes

- **Velocidades y densidad de la corteza (Vp, Vs, ρ).** Vásquez, L. E. &
  Vargas, C. A. (2001). *Crustal structure and local seismicity in Colombia.*
  Journal of Seismology. Proponen un modelo 1D de la corteza colombiana con la
  capa superior con Vp ≈ 4.8 km/s (0–4 km) y una corteza media con Vp ≈ 6.6 km/s
  (4–25 km). Los valores del Simulador (Vp 3000–3500 m/s) están en el extremo
  bajo de ese rango, apropiado para los primeros kilómetros de corteza y para
  material volcánico/andino somero. La razón Vp/Vs ≈ 1.75 corresponde a un
  cociente de Poisson típico de la corteza.
  [Enlace](https://link.springer.com/article/10.1023/A:1012053206408)
  *(Contenido reformulado para cumplir las restricciones de licencia.)*

- **Mecanismos focales corticales del suroccidente de Colombia.** Arcila, M. &
  Muñoz–Martín, A. (2020). *Integrated Perspective of the Present–Day Stress and
  Strain Regime in Colombia from Analysis of Earthquake Focal Mechanisms and
  Geodetic Data.* Servicio Geológico Colombiano (Geología de Colombia). El
  catálogo de mecanismos muestra que en la zona andina del suroccidente
  predominan soluciones **inversas y inverso-desgarre** (compresión asociada a la
  subducción de la placa de Nazca y al sistema de fallas de Romeral). De ahí los
  mecanismos de los escenarios tectónicos (rumbo andino ~20–30°, buzamiento
  moderado, rake inverso a inverso-desgarre 60–80°).
  [Enlace](https://www2.sgc.gov.co/LibroGeologiaColombia/tgc/sgcpubesp38201917.pdf)
  *(Contenido reformulado para cumplir las restricciones de licencia.)*

- **Catálogo de mecanismo focal y tensor momento del SGC.** Servicio Geológico
  Colombiano — Catálogo de Mecanismo Focal (soluciones por SWIFT, SCMTV, Fase W,
  ISOLA y polaridades) para eventos en Colombia y regiones fronterizas.
  [Enlace](https://bdrsnc.sgc.gov.co/sismologia1/sismologia/focal_seiscomp_3/index.html)

- **Sismicidad volcano-tectónica del Galeras (profundidad y frecuencia).**
  Gómez, D. M. & Torres, R. A. (1997), INGEOMINAS–Observatorio Vulcanológico y
  Sismológico de Pasto, *Journal of Volcanology and Geothermal Research*; y
  reportes del Global Volcanism Program (Smithsonian). Los eventos VT del Galeras
  se localizan típicamente a **2.5–8 km** de profundidad bajo el cráter (varios
  reportes ubican los enjambres a ~4–6 km), con eventos de baja magnitud. Los
  tornillos muestran frecuencias dominantes en torno a 2 Hz. De ahí la
  profundidad (3 km) y la magnitud (Mw 2.5) del escenario volcánico.
  [GVP Galeras](https://volcano.si.edu/volcano.cfm?vn=351080)

### Valores sin fuente específica (declarados, no inventados)

- **Mecanismo focal exacto de un evento VT del Galeras.** No se encontró una
  solución de mecanismo focal publicada para un evento volcano-tectónico
  específico del Galeras. Por eso el escenario del Galeras se modela como
  **fuente isótropa (volcánica)**, que no requiere strike/dip/rake; no se inventó
  un mecanismo.
- **Valores exactos de strike/dip/rake de los escenarios tectónicos.** Son
  **representativos** del régimen inverso-desgarre andino descrito por Arcila &
  Muñoz–Martín (2020), no la solución de un evento puntual. Se eligieron dentro
  del rango de rumbo andino y buzamiento/rake compresivo reportado, para ilustrar
  el efecto del mecanismo en las componentes; el usuario puede cambiarlos.
- Las velocidades exactas (3000–3500 m/s) son valores **someros representativos**
  dentro del rango de Vásquez & Vargas (2001), no medidas de un sitio puntual de
  Nariño.
