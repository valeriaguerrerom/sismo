# Escenarios predeterminados del Simulador

Documento de apoyo para la tesis. Describe los escenarios que trae el Simulador,
sus valores, el mecanismo focal de cada uno y el acimut de la estación.

El motor es de diferencias finitas 2D (P-SV + SH) en un **medio homogéneo**
(Vp, Vs y densidad constantes). Los escenarios se eligieron para que sean
didácticos **dentro de los límites del motor**: sin rebotes de borde dentro de la
ventana útil, al menos 10 nodos por longitud de onda mínima y cómputo por debajo
de 15 s. Todos los valores se validaron ejecutando el motor real.

## Distancia epicentral como parámetro

La **distancia epicentral** (`epicentralDistanceKm`) es un parámetro del
Simulador. A mayor distancia, la llegada de la P y la de la S se separan más en
el tiempo; pero el receptor se acerca al borde y el primer rebote llega antes,
así que los escenarios equilibran ambos efectos. El rango del control depende del
tamaño de malla (dx) elegido: el máximo alcanzable es la mayor distancia que
mantiene fuente y receptor lejos de las zonas absorbentes. Si se pide una
distancia mayor, el valor se ajusta al máximo alcanzable y el Simulador muestra
el motivo.

## Acimut de la estación

El acimut por defecto es **45° (NE)**. Se eligió así porque con el mecanismo de
doble par, un acimut intermedio (ni 0° ni 90°) hace que **tanto la componente
radial como la transversal aporten a Norte y a Este**, de modo que las tres
componentes (N, E, Z) se ven distintas y didácticas. Con acimut 0° o 90° una de
las dos horizontales quedaría dominada por una sola de las fases y el carácter
triaxial se apreciaría menos. Cada escenario ajusta ligeramente el acimut para
resaltar las diferencias entre componentes.

## Los escenarios

### 1. Cortical didáctico (escenario por defecto)

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

**Qué se observa:** la llegada de la P (~2.4 s) y, después, la de la S (~3.6 s),
bien separadas en las tres componentes. Es el más didáctico y por eso es el que
se carga al abrir el Simulador.

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

**Qué se observa:** P (~2.5 s) y S (~4.1 s) separadas, con energía en las tres
componentes; la transversal muestra el aporte del SH del mecanismo.

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

**Qué se observa:** P (~3.1 s) y S (~5.3 s) más tardías y más separadas entre sí
que en el escenario superficial. Sirve para **comparar** el efecto de la
profundidad focal. (La profundidad máxima que mantiene ≥ 10 nodos/λ con este dx
es ~9 km; más profundo obligaría a subir dx y dispararía la advertencia de
dispersión.)

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

## Origen de los valores

Los valores de cada escenario son **representativos**, no la solución de un
evento puntual:

- **Escenarios tectónicos.** Las velocidades (Vp 3200–3500 m/s, Vs 1850–2000
  m/s), la densidad (2500–2600 kg/m³) y las profundidades son **valores
  representativos de la corteza andina somera** del suroccidente de Colombia. La
  razón Vp/Vs ≈ 1.75 corresponde a un cociente de Poisson típico de la corteza.
  Los mecanismos focales (rumbo andino ~20–30°, buzamiento moderado, rake inverso
  a inverso-desgarre 60–80°) son **representativos del régimen compresivo
  inverso-desgarre** de la zona (subducción de Nazca y sistema de fallas de
  Romeral); pueden compararse con las soluciones del catálogo del SGC.

- **Escenario volcánico.** Las velocidades y la profundidad (3 km) son valores
  **representativos del edificio volcánico del Galeras** y de su sismicidad
  volcano-tectónica somera (típicamente pocos kilómetros bajo el cráter, eventos
  de baja magnitud). Se modela como **fuente isótropa (volcánica)**, que no
  requiere strike/dip/rake, por lo que no se asignó un mecanismo focal.

## Enlaces de referencia

- **Catálogo de Mecanismo Focal y Tensor Momento del SGC** — Servicio Geológico
  Colombiano. Soluciones de mecanismos focales para eventos en Colombia y
  regiones fronterizas, útil para comparar los mecanismos de los escenarios
  tectónicos con soluciones reales del suroccidente colombiano.
  <https://bdrsnc.sgc.gov.co/sismologia1/sismologia/focal_seiscomp_3/index.html>

- **Global Volcanism Program (Smithsonian) — Galeras** — ficha del volcán con su
  historia eruptiva y actividad sísmica.
  <https://volcano.si.edu/volcano.cfm?vn=351080>
