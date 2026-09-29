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

Con el escenario "Pasto sobre depósitos volcánicos"
(capa 0.5 km, Vp 1800 / Vs 600 / ρ 1900; roca Vp 4000 / Vs 2300 / ρ 2600;
fuente a 2 km, estación a 4 km, dx 20 m):

- **Reflexión P en la interfaz**: el motor reporta `interfaceReflP` y el valor
  se compara con el **cálculo a mano** por el método de la imagen especular en
  la roca (imagen del receptor a `2·z_interfaz − z_receptor`, distancia
  fuente→imagen dividida por Vp de la roca, más el retardo del pulso `t0`).
  Resultado: engine ≈ 2.283 s vs a mano ≈ 2.283 s (**diferencia ≈ 0.05 ms**).
- **Reverberación vertical en la capa blanda**: `2·h/Vp_capa ≈ 0.56 s` (modo
  dominante observable de la capa somera).
- **Nodos por longitud de onda**: 10.0 (cumple el mínimo).
- **Cómputo**: ≈ 10 s (< 15 s).
- **No regresión**: los escenarios homogéneos dan un resultado **idéntico**
  (diferencia 0) al de antes de introducir el kernel por nodo.

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
