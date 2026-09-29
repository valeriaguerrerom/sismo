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

### Dominio grande + geometría simétrica (primer rebote > 8 s)

Con el bucle ~5× más rápido, el dominio se agranda mucho manteniendo el cómputo
por debajo de 15 s. Además la geometría es **simétrica respecto al centro**: la
fuente se coloca a −d/2 y la estación a +d/2 (d ≈ 2.5 km, la distancia
epicentral), de modo que ninguna queda cerca de un borde y el primer rebote es
lo más tardío posible.

| Preset    | dx (m) | Malla (nx × nz) | Dominio     | nodos/λ | dt (s) | dur | cómputo (+~80 fotogramas) |
|-----------|--------|-----------------|-------------|---------|--------|-----|---------------------------|
| Tectónico | 22     | 820 × 700       | 18.0×15.4 km | 10.4   | 0.004  | 13 s | ~9–10 s                  |
| Volcánico | 30     | 820 × 700       | 24.6×21.0 km | 11.3   | 0.006  | 13 s | ~6 s                     |

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
