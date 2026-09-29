# Mejoras del motor FDM del Simulador

Documento de apoyo para la tesis. Resume los cambios hechos al motor de
diferencias finitas (FDM 2D) del Simulador de pseudo-sismogramas, con el
diagnóstico que los motivó y los parámetros finales.

El motor corre en el **servidor** (backend FastAPI, `backend/core/fdm.py`,
Python + NumPy). El frontend solo envía los parámetros y dibuja el resultado.

## 0. El medio es homogéneo: no debe haber coda

El simulador usa un medio elástico **homogéneo** (Vp, Vs y densidad constantes).
En un medio homogéneo, después de que pasan la onda P, la onda S y la onda
superficial, la señal en el receptor debe quedar prácticamente **en calma**: no
hay dispersión ni heterogeneidades que generen coda. Por lo tanto, cualquier
energía que reaparezca de forma tardía y sostenida es **artificial**.

## 1. Diagnóstico de las reflexiones de borde

Con la configuración inicial, las trazas mostraban paquetes de energía que
reaparecían mucho después de la S y no decaían. Se identificaron dos causas
artificiales:

1. **Reflexiones en los bordes de la malla.** El dominio era pequeño y el
   receptor quedaba cerca de un borde, así que el frente rebotaba y volvía al
   receptor. Se confirmó calculando el tiempo de ida y vuelta fuente→borde→
   receptor (imagen especular): los picos tardíos coincidían con esos tiempos.
   Como control, una simulación de referencia con un dominio mucho más grande
   (28×17 km) mostró la señal casi en cero entre la S y el primer rebote, y los
   rebotes aparecían justo en los tiempos calculados (S a ~12–14 s para bordes a
   ~13 km) — confirmando que eran artificiales, no coda del medio.

2. **Absorción incompleta.** La zona absorbente (Cerjan) se aplicaba solo al
   nivel de tiempo `u_next`. En el esquema leapfrog `u_next = 2·u_curr −
   u_prev + …`, el término `−u_prev` reinyectaba energía no amortiguada, dejando
   una oscilación residual entre la superficie libre y el fondo.

## 2. Correcciones aplicadas

### Zona absorbente de Cerjan (exponencial), en dos niveles de tiempo

Perfil clásico de Cerjan:

```
G(d) = exp( −(a · d)² ),  con a = 0.02,  grosor = 44 nodos
```

`d` = número de nodos dentro de la capa (0 en el borde interno, creciente hacia
el borde físico). Se aplica en los **bordes laterales e inferior**; la
**superficie libre** (z = 0) se mantiene. Clave: el coeficiente se aplica a
**`u_next` y `u_curr`** en cada paso; como `u_curr` pasa a ser `u_prev` tras el
intercambio de buffers, el término `−u_prev` del leapfrog también queda
amortiguado y no reinyecta energía en la capa absorbente.

### Aceleración del bucle temporal con Numba (~5×)

El paso temporal del FDM (stencil de 2º orden + derivada cruzada + superficie
libre + sponge) se compila con **Numba** (`@njit`, `backend/core/fdm.py`,
función `_fdm_step`). La compilación se hace una sola vez por proceso (warmup
fuera de la ruta de medición). Medición local (mismos parámetros por defecto):

| Preset    | NumPy vectorizado | Numba | Aceleración | Diferencia relativa máx. |
|-----------|-------------------|-------|-------------|--------------------------|
| Tectónico | 11.7 s            | 2.3 s | **5.1×**    | 6.9 × 10⁻⁷               |
| Volcánico | 7.0 s             | 1.4 s | **5.2×**    | 1.7 × 10⁻⁶               |

Las trazas son idénticas dentro del ruido de punto flotante (float32); la
diferencia relativa máxima es del orden de 10⁻⁶. Si Numba no está disponible en
el entorno, el motor cae automáticamente a un kernel NumPy equivalente (sin la
dependencia obligatoria). En despliegue (Railway, `python:3.11-slim`) `numba`
se instala desde `requirements.txt` con las ruedas manylinux (incluye llvmlite,
sin dependencias del sistema adicionales).

**Kernel paralelo (`prange`).** El bucle externo sobre X usa `numba.prange`
(`parallel=True`): cada índice `i` escribe una columna distinta y solo lee
vecinos (i±1), sin condición de carrera. En el dominio grande (820×700) esto
acelera ~7× frente al kernel serial en máquinas multinúcleo. Es lo que mantiene
el cómputo dentro del presupuesto en el stack de producción (ver más abajo);
sin él, en Python 3.11 el motor serial tardaba ~16 s (fuera del límite).

**Verificación en el stack de producción.** Se creó un entorno con las versiones
exactas del despliegue (Python 3.11.4, NumPy 1.26.4, Numba 0.60.0, Pydantic
2.9.0) y se corrieron las simulaciones por defecto y las pruebas del motor. Las
trazas coinciden con el entorno de desarrollo (P y S idénticas al milisegundo,
misma amplitud máxima) y el cómputo con el kernel paralelo es de ~3 s por
simulación (tectónica y volcánica), holgadamente bajo 15 s.

**Compilación al arrancar.** El kernel se precompila en el evento de arranque de
FastAPI (`lifespan`), en un hilo aparte, así la primera petición de un usuario
ya no paga el costo de compilación JIT (~2 s). El arranque del servidor añade
ese tiempo una sola vez; después la primera simulación corre a plena velocidad.

### Dominio grande + geometría simétrica (primer rebote > 8 s)

Con el bucle ~5× más rápido, el dominio se agranda mucho manteniendo el cómputo
por debajo de 15 s. Además la geometría es **simétrica respecto al centro**: la
fuente se coloca a −d/2 y la estación a +d/2 (d ≈ 2.5 km, la distancia
epicentral), de modo que ninguna queda cerca de un borde y el primer rebote es
lo más tardío posible.

| Preset    | dx (m) | Malla (nx × nz) | Dominio     | nodos/λ | dt (s) | dur | cómputo (+~80 fotogramas) |
|-----------|--------|-----------------|-------------|---------|--------|-----|---------------------------|
| Tectónico | 22     | 820 × 700       | 18.0×15.4 km | 10.4   | 0.004  | 8 s  | ~3 s (kernel paralelo)    |
| Volcánico | 30     | 820 × 700       | 24.6×21.0 km | 11.3   | 0.006  | 13 s | ~3 s (kernel paralelo)    |

La duración por defecto del tectónico es **8 s**: termina antes del primer rebote
de borde de la S (8.40 s), dejando margen tras la P, la S y la superficial. El
volcánico usa 13 s porque su primer rebote llega a 13.35 s. El control de
duración permite pedir más, y el panel avisa cuando la duración supera el primer
rebote (aparecerían reflexiones artificiales al final del registro).

**Tiempos del primer rebote de borde al receptor** (borde derecho, el más
cercano por la geometría):

| Preset    | P directa | S directa | 1er rebote P | 1er rebote S | ¿S > 8 s? |
|-----------|-----------|-----------|--------------|--------------|-----------|
| Tectónico | 1.80 s    | 2.99 s    | 4.80 s       | **8.40 s**   | Sí        |
| Volcánico | 2.48 s    | 4.53 s    | 7.56 s       | **13.35 s**  | Sí        |

El primer rebote **S llega después de ~8 s** en ambos casos, más allá de la S
directa y la superficial. El rebote P llega antes que la S en el tectónico
(4.80 s), pero su amplitud es baja y el sponge lo atenúa; la energía útil (P + S
+ superficial) queda limpia dentro de la ventana de 13 s.

El esquema espacial es de **segundo orden** (stencil de 3 puntos), por lo que el
umbral recomendado es **≥ 10 nodos por longitud de onda mínima**; ambos presets
lo cumplen y no disparan la advertencia de dispersión.

### Condición absorbente de Clayton–Engquist: probada y descartada

Se probó añadir una condición absorbente de **primer orden de Clayton y
Engquist** (`∂u/∂t = c·∂u/∂n`) en los bordes exteriores (izquierdo, derecho,
inferior), además de la zona de Cerjan. Midiendo la energía RMS después de la S
**con y sin** la condición, los valores resultaron **idénticos** hasta la
precisión mostrada (p. ej. tectónico 4–6 s: 1.22 × 10⁴ en ambos casos). La razón
física: la capa de Cerjan (44 nodos) ya atenúa la onda ~99 % **antes** de que
alcance el borde exterior, así que la reflexión que Clayton–Engquist corregiría
es despreciable. Se descartó por no aportar mejora medible y sí complejidad.

### Distancia del receptor (estación virtual)

La estación virtual queda a **2.5 km del epicentro, en superficie** (distancia
epicentral horizontal). Con la geometría simétrica, la fuente y el receptor se
sitúan a ±1.25 km del centro del dominio. Este valor se muestra en el Simulador
(sección Malla FDM y leyenda de las gráficas) y en el PDF (parámetros); si algún
parámetro cambiara la distancia efectiva, se muestra el valor real de cada
simulación, calculado desde `gridInfo` (`|receiverX − sourceX|·dx`).

### Paso temporal (dt) automático por CFL

`dt` no lo fija el usuario: se calcula para respetar Courant–Friedrichs–Lewy en
todo el rango de Vp y dx:

```
dt = 0.9 · dx / (Vp · √2)
```

El panel lo muestra como información (solo lectura), junto al número de Courant.

### Duración efectiva

La duración que se grafica y se reporta (métricas y PDF) es `total_steps · dt`
(la que realmente se simula), coherente en pantalla, reproductor, métricas y PDF.

## 3. Verificación: RMS por ventanas de 2 s (motor final)

Energía RMS de la componente Este (radial, con la S dominante). El pico está en
la ventana 2–4 s (onda S directa); después la energía cae y se mantiene baja
hasta que llega el primer rebote (S > 8 s).

**Tectónico** (Vp 3500, Vs 2000, ρ 2600, Mw 5.0, prof. 5 km) — dominio 18×15 km,
cómputo ~10 s con ~82 fotogramas:

| Ventana | 0-2s | 2-4s (S) | 4-6s | 6-8s | 8-10s | 10-12s | 12-14s |
|---------|------|----------|------|------|-------|--------|--------|
| RMS E   | 2.3e4 | **2.0e5** | 1.2e4 | 1.4e4 | 8.8e3 | 2.7e3 | 3.0e4 |

Tras la S (pico 2.0 × 10⁵) la energía cae ~1.2 órdenes (1.2–1.4 × 10⁴ entre 4 y
8 s) y sigue bajando (2.7 × 10³ en 10–12 s, ~1.9 órdenes). El repunte de 12–14 s
es el primer rebote de borde (S a 8.4 s ya integrado en la cola), que queda al
final de la ventana de 13 s.

**Volcánico** (Vp 3000, Vs 1700, ρ 2500, Mw 4.5, prof. 6 km) — dominio 24×21 km,
cómputo ~6 s con ~81 fotogramas:

| Ventana | 0-2s | 2-4s (S) | 4-6s | 6-8s | 8-10s | 10-12s |
|---------|------|----------|------|------|-------|--------|
| RMS E   | ~0 | **2.3e4** | 3.5e2 | 1.5e1 | 1.8e3 | 9.6e2 |

Aquí la caída es aún más marcada: tras la S (2.3 × 10⁴) la energía baja a
3.5 × 10² – 1.5 × 10¹ (2 a 3 órdenes por debajo). El primer rebote S llega a
13.35 s, fuera de la ventana.

En ambos casos la P y la S se detectan por STA y la energía decae a la calma del
medio homogéneo. Se cumple el criterio: **primer rebote S > 8 s** y, en el
volcánico, además **energía residual ≥ 2 órdenes por debajo de la S**, con
cómputo < 15 s incluyendo ~80 fotogramas del campo de ondas (para el corte del
subsuelo).

## 4. Combinación final adoptada

De las cuatro mejoras probadas:

1. **Numba (@njit) en el paso temporal** — adoptada. Aceleración ~5×, resultados
   idénticos (diff. relativa 10⁻⁶). Es la que habilita todo lo demás.
2. **Dominio grande** — adoptada. 18×15 km (tectónico) y 24×21 km (volcánico),
   manteniendo dx ≥ 10 nodos/λ y cómputo < 15 s.
3. **Clayton–Engquist** — descartada. No aporta mejora medible sobre el sponge
   de Cerjan de 44 nodos (ver §2).
4. **Geometría simétrica** — adoptada. Fuente y receptor a ±d/2 del centro; es
   lo que aleja ambos de los bordes y hace que el primer rebote llegue > 8 s.

Combinación final = **Numba + dominio grande + geometría simétrica + Cerjan**
(sin Clayton–Engquist).

## Nota sobre el compromiso

El motor corre en Python + NumPy (con Numba) en el servidor, con un tope de
tiempo de ~15 s por simulación. Los presets equilibran dominio (para alejar los
bordes y llevar el primer rebote más allá de 8 s), resolución (≥ 10 nodos/λ) y
duración (13 s), adecuado para pseudo-sismogramas con fines educativos. El
rebote P del tectónico (4.8 s) es la única reflexión que entra en la ventana; su
amplitud es baja y el sponge la atenúa, por lo que no compromete la lectura de
la P, la S ni la superficial.

## 5. Registro triaxial real: P-SV + SH y rotación a Norte/Este

El motor es 2D en un corte vertical, pero el sismograma debe ser triaxial
(Norte, Este, Vertical). Antes, "Norte" se obtenía derivando la componente
horizontal `ux`, así que no era una componente independiente y el registro no
era realmente triaxial. Ahora se construye combinando **dos** simulaciones 2D en
la misma malla, con la misma zona absorbente y superficie libre:

- **P-SV** (en el plano del corte): resuelve `ux` (radial) y `uz` (vertical),
  las ondas P y SV.
- **SH** (fuera del plano): resuelve una ecuación de onda **escalar**
  `ρ·∂²v/∂t² = μ·(∂²v/∂x² + ∂²v/∂z²)` para el desplazamiento transversal `v`
  (tipo Love/SH). Solo depende de Vs y ρ. Superficie libre por Neumann
  (`∂v/∂z = 0`). Es un tercer campo independiente.

### Fuente: tensor de momento del doble par

Para la fuente tectónica se define el mecanismo con **rumbo (strike), buzamiento
(dip) y deslizamiento (rake)** (convención Aki & Richards, ejes 1 = Norte,
2 = Este, 3 = Abajo). Con ellos se calcula el **tensor de momento** M (traza
nula, doble par puro) y se **proyecta al marco del corte** (r, t, z) según el
acimut de la estación:

- `e_r = (cos az, sin az, 0)` (radial, apunta de la fuente a la estación),
- `e_t = (sin az, −cos az, 0)` (transversal, 90° horario respecto a r),
- `e_z = (0, 0, 1)` (hacia abajo).

Las componentes **en el plano** (Mrr, Mrz, Mzz) excitan el P-SV; las de **fuera
del plano** (Mrt, Mtz) excitan el SH. La fuente se inyecta como la **divergencia
del tensor de momento** (`f_i = −M_ij·∂δ/∂x_j`), no como un lóbulo aproximado a
mano, de modo que la amplitud y la polaridad de P-SV y SH son físicamente
consistentes.

**Mecanismo por defecto para Nariño:** falla **inversa de rumbo andino**
(strike 30° ≈ NNE-SSO, dip 45°, rake 90° inversa pura). Es coherente con el
régimen compresivo de la subducción de la placa de Nazca bajo Sudamérica, que
domina la tectónica de Nariño. Está disponible como parámetro avanzado en la
sección "Fuente sísmica".

### Rotación radial/transversal → Norte/Este

En el receptor se registran la radial (R = `ux`), la transversal (T = `v`) y la
vertical (Z = `uz`), y se rotan R y T a Norte y Este según el acimut de la
estación (0-360° desde el norte, en sentido horario):

```
Norte = R·cos(az) − T·sin(az)
Este  = R·sin(az) + T·cos(az)
```

Convención de signos: radial positiva **alejándose** de la fuente; transversal
positiva 90° en **sentido horario** respecto a la radial. Así las tres
componentes N, E, Z son genuinamente independientes.

### Validación: la fuente volcánica no genera SH

La fuente volcánica es **isótropa** (explosiva): irradia P de forma uniforme y
no produce cizalla, por lo que **no excita el SH**. Como prueba de validación se
mide la razón entre el pico transversal y el radial: para la volcánica por
defecto **T/R = 0.0000** (transversal nula, como debe ser), mientras que para la
tectónica por defecto **T/R ≈ 0.28** (transversal significativa e independiente).
Hay tests automáticos que verifican ambos casos.

### Costo de cómputo

El SH añade un solve escalar (más barato que el P-SV, que actualiza dos campos
con derivada cruzada). Con el kernel paralelo (`prange`), el costo total por
simulación queda en ~7 s (tectónica) y ~4 s (volcánica), bajo el límite de 15 s.

### Límites y validación de parámetros

Cada parámetro tiene un rango válido (fuente de verdad en `PARAM_RANGES`,
espejada en `src/lib/paramLimits.ts` y en el modelo Pydantic del backend). Las
restricciones físicas clave:

- **Vs < Vp/√2** para que el parámetro de Lamé λ = ρ(Vp² − 2·Vs²) no sea
  negativo (roca físicamente imposible).
- **Profundidad focal** dentro del dominio, con margen sobre la zona absorbente.
- **dx** que dé al menos **10 nodos por longitud de onda** mínima (evita
  dispersión numérica).

En el Simulador, si el usuario escribe un valor fuera de rango o una combinación
inválida, se ajusta automáticamente al valor válido más cercano y se muestra el
motivo junto al control. El **backend valida exactamente lo mismo** (validadores
Pydantic) y responde con un mensaje claro en español si recibe algo inválido;
nunca confía solo en la validación del navegador.

**Primer rebote de borde:** el backend calcula, en cada simulación y con la
geometría real, el tiempo del primer rebote de borde para P y S (método de la
imagen especular sobre los bordes exteriores) y lo devuelve en `gridInfo`
(`firstBounceP`, `firstBounceS`). El aviso de duración del panel usa ese valor,
no una estimación fija por tipo de fuente.

**Latitud y longitud:** se limitan al área de Nariño y su entorno (incluida la
red CM Colombia-Ecuador de los registros reales). Como el medio es homogéneo y
2D, la ubicación del epicentro es **solo una referencia geográfica** y no cambia
el cálculo; así se aclara bajo los campos en el Simulador.

## Limitación: fuente lineal 2D vs. fuente puntual 3D

La simulación es 2D, lo que físicamente equivale a una **fuente lineal**
(infinita en la dirección perpendicular al corte), no a una **fuente puntual
3D**. La consecuencia principal es el **decaimiento geométrico**: en 2D la
amplitud decae como ~1/√r, mientras que en 3D una fuente puntual decae como
~1/r (y las ondas superficiales como ~1/√r). Por eso las amplitudes relativas
entre fases y con la distancia no son idénticas a las de un registro real 3D.
Para fines educativos (mostrar P, S, superficial, el carácter triaxial y el
efecto del mecanismo focal) esto es aceptable. Como **trabajo futuro** existe una
**corrección 2D→3D** (filtro de conversión en el dominio de la frecuencia, del
tipo √(t) / transformada, que ajusta el decaimiento y la fase de la respuesta de
fuente lineal a la de fuente puntual) que podría aplicarse a las trazas para
aproximar mejor las amplitudes 3D.
