# Modelo de subsuelo en dos capas (versión mínima)

Este documento describe el modelo de **dos capas horizontales** del simulador,
implementado sobre el motor FDM 2D (`backend/core/fdm.py`), sus supuestos y sus
limitaciones.

## Qué hace

Además del subsuelo **homogéneo** (un solo material en todo el dominio), el
simulador ofrece un modelo de **dos capas**:

- Una **capa superficial** (normalmente blanda) de espesor `layerThickness` (km)
  con sus propias velocidades y densidad: `layerVp`, `layerVs`, `layerDensity`.
- Un **semiespacio** de roca debajo, que usa las variables elásticas generales
  del panel: `vp`, `vs`, `density`.
- Una **interfaz horizontal** entre ambos, a la profundidad del espesor de la
  capa.

Se activa con `subsurfaceModel: 'twoLayer'` (selector "Subsuelo" en el panel).
Los escenarios existentes siguen siendo homogéneos; el escenario **"Pasto sobre
depósitos volcánicos"** trae el modelo de dos capas ya configurado.

## Cómo está implementado

- **Propiedades por nodo**: los coeficientes elásticos del kernel dejan de ser
  escalares y pasan a ser matrices `(nx, nz)`: `c1 = (λ+2μ)/ρ`, `c2 = μ/ρ`,
  `c3 = (λ+μ)/ρ` (P-SV) y `cs2 = μ/ρ` (SH). Cada nodo toma las propiedades de su
  capa. En medio homogéneo estas matrices son constantes y el resultado es
  **idéntico** al de los coeficientes escalares (verificado, diferencia 0).
- **Interfaz suavizada**: en la fila de nodos de la interfaz se usan módulos
  **promediados** (media aritmética de λ, μ y ρ de ambas capas). Esto reduce el
  artefacto de "escalón" numérico en el contacto.
- **Estabilidad (CFL)**: `dt` lo fija la **Vp máxima** de las dos capas
  (`dt ≤ 0.9·dx/(Vp_máx·√2)`).
- **Dispersión (dx)**: la resolución la fija la **Vs mínima** (la capa lenta,
  cuya longitud de onda es la más corta). El motor exige **≥10 nodos por
  longitud de onda mínima**; si el `f0` elegido no lo cumpliera con el `dx`
  dado, el motor **baja `f0` automáticamente** (mantiene la geometría; solo el
  pulso queda un poco más largo). No se aplica al medio homogéneo.
- **Duración y cómputo**: se mantienen las mismas garantías que el modo
  homogéneo — la duración se acota antes del primer rebote de borde y el cómputo
  total queda por debajo de 15 s.

## Física observable (que no aparece en el modelo homogéneo)

- **Reflexión en la interfaz**: parte de la energía rebota en el contacto entre
  capas y vuelve a la estación. Se marca su tiempo teórico (`interfaceReflP`).
- **Amplificación de sitio y reverberación**: la capa blanda atrapa el
  movimiento; la sacudida en superficie **dura más y es más fuerte** que sobre
  roca desnuda. Esta coda sale de la **física del modelo**, no de un artificio.
- **Conversiones y ondas superficiales** también aparecen de forma natural.

## Verificación física

### Reflexión MEDIDA en la señal (no solo calculada)

La reflexión se **mide** restando la traza homogénea de la traza con capas
(mismo pulso, misma frecuencia efectiva) y detectando la primera llegada de esa
diferencia, y se compara con el cálculo a mano por el método de la imagen
especular.

- **Caso controlado y limpio** (fuente a 1.5 km DENTRO de la capa, interfaz a
  3 km, roca rápida debajo; capa Vp 2500): la onda que baja se refleja en la
  interfaz y vuelve a la superficie como una reflexión separable. La resta
  capas−homogéneo aísla esa reflexión. Su **onset medido = 2.181 s**; el
  cálculo a mano (imagen del receptor a través de la interfaz, con la velocidad
  de la capa) da **2.415 s**. El onset llega antes que el centro geométrico por
  la mitad delantera de la envolvente del pulso (`≈ 0.65/f0 = 0.232 s`);
  corrigiendo por eso: 2.415 − 0.232 = **2.183 s** vs **2.181 s** medido →
  **diferencia 2.2 ms**. La reflexión medida coincide con la calculada.

- **En el escenario "Pasto"** (fuente a 2 km EN LA ROCA, interfaz somera a
  0.5 km) la geometría es distinta: la interfaz está **encima** de la fuente,
  así que la reflexión image-en-roca no es el evento dominante. La primera
  diferencia capas−homogéneo (**2.149 s**) coincide con la **P directa
  transmitida** por la capa (P en 2.177 s), no con una reflexión limpia. Es un
  resultado honesto: para una fuente bajo una capa somera, lo que más cambia en
  la estación es la P transmitida y las reverberaciones de la capa, no una
  reflexión especular aislada.

### Origen de la cola (RMS por ventanas de 1 s tras la S)

Comparando la energía RMS después de la S entre capas y homogéneo (mismo pulso):

| Ventana | capas / homogéneo |
|---------|-------------------|
| 4.2–5.2 s | **39×** |
| 5.2–6.2 s | **11×** |
| 6.2–6.5 s | **2.2×** |

La cola larga es **mucho** mayor con capas: confirma que la coda proviene de la
capa blanda (amplificación y reverberación), no de un artificio.

### Rebote de borde y ventana

Con roca rápida el rebote de borde de la **P** llega antes que el de la S. Por
eso el dominio horizontal se **amplía** en el modo dos capas (1200 nodos ≈ 24 km
frente a 820 del modo homogéneo), y la duración del escenario Pasto es **6.5 s**:

- `firstBounceP ≈ 6.82 s` (> 6.5 s ⇒ **fuera** de la ventana).
- `firstBounceS ≈ 10.94 s`.
- El tope de duración del panel usa el **menor** de los dos rebotes (P o S).
- **Cómputo ≈ 12 s** (< 15 s) con la malla ampliada 1200×700.

### Otros

- **Nodos por longitud de onda**: 10.0 (cumple el mínimo; f0 se baja a 1.2 Hz).
- **No regresión**: los escenarios homogéneos dan un resultado **idéntico**
  (diferencia 0) al de antes de introducir el kernel por nodo.

## Frecuencia de la fuente en el modelo de capas

Cuando se activan dos capas y el usuario **no** fija una frecuencia manual, el
motor puede **bajar `f0`** para que la capa lenta tenga ≥10 nodos/λ (evita
dispersión numérica). En el escenario Pasto queda en **1.2 Hz**. Este ajuste se
muestra al usuario con la nota *"La frecuencia de la fuente se ajustó a X Hz
para representar bien la capa blanda sin dispersión numérica"* en las **métricas**
del panel, en el **PDF** y en la **interpretación educativa**.

## Valores del escenario "Pasto sobre depósitos volcánicos"

Los valores de la capa superficial son **representativos con fines educativos**,
no un estudio de sitio calibrado. La ciudad de Pasto se asienta sobre depósitos
volcánicos y piroclásticos del complejo Galeras, un contexto donde una capa
blanda superficial sobre roca es esperable; los números concretos (espesor,
velocidades, densidad) son ilustrativos y **no proceden de una medición**.

No se cita una fuente puntual porque no se localizó una referencia verificable y
específica para estos parámetros; preferimos marcarlos como representativos antes
que atribuir un dato que no podemos respaldar. Si se dispone de un perfil de
velocidades local (p. ej. un estudio de microzonificación de Pasto), debería
sustituir estos valores y citarse con enlace.

## Limitaciones

- **Dos capas, interfaz plana y horizontal**: no hay topografía, buzamiento ni
  más de dos medios. Es una versión mínima con fines didácticos.
- **2D**: el simulador resuelve un corte vertical (P-SV) más la componente
  transversal (SH); no es un modelo 3D.
- **Interfaz suavizada a un nodo**: el promedio en la fila de la interfaz reduce
  el escalón pero no es un tratamiento sub-celda exacto; contrastes muy fuertes
  pueden dejar un pequeño residuo numérico en el contacto.
- **Reducción de `f0` por dispersión**: con capas muy lentas, para respetar los
  10 nodos/λ el motor baja la frecuencia de la fuente, lo que ensancha el pulso.
- **Frentes teóricos en el mapa de calor**: los círculos de P y S se dibujan con
  la velocidad del semiespacio (roca); dentro de la capa blanda el frente real
  va más lento, así que esas guías son orientativas cerca de la superficie.
