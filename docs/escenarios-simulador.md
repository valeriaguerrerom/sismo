# Escenarios predeterminados del Simulador

Documento de apoyo para la tesis. Describe los escenarios que trae el Simulador,
sus valores y cómo se eligieron.

El motor es de diferencias finitas 2D (P-SV + SH). Admite un **medio homogéneo**
o un **modelo de dos capas** (capa superficial blanda sobre un semiespacio de
roca; ver `docs/modelo-capas.md`). Todos los valores de velocidades y densidades
son **representativos con fines educativos** (no un estudio de sitio calibrado)
y no se atribuyen a una fuente puntual que no podamos respaldar.

## Cómo se eligieron los parámetros

Cada escenario se optimizó **midiendo criterios objetivos** en el motor real
(no a ojo). Un candidato se acepta si cumple, medido en la señal simulada:

1. **Cola tras la S** (solo escenarios con capa): la energía RMS de la coda
   (después del paquete S directo) es claramente mayor que en el **mismo caso
   homogéneo con la misma frecuencia** de fuente. Se mide restando/comparando
   ambas corridas.
2. **P visible**: la amplitud máxima de la P es ≥ 15 % de la de la S en escala
   común (el máximo de las tres componentes).
3. **Tres componentes con señal**: la menor de las tres es ≥ 25 % de la mayor.
   Excepción: en el **volcánico** la fuente es isótropa y **no excita la
   transversal (SH = 0)**; ahí el criterio se aplica a la radial y la vertical.
4. **El pulso llena la ventana del evento** (la misma ventana "Ajustar al
   evento" que muestra la pantalla por defecto).
5. **Sin rebotes de borde** (P ni S; se toma el **menor** de los dos) dentro de
   la duración.
6. **≥ 10 nodos por longitud de onda** mínima y **cómputo < 15 s**.

En el modo dos capas la frecuencia de la fuente se baja automáticamente si hace
falta para cumplir el criterio 6 (se avisa al usuario).

## Los escenarios

El **escenario por defecto** al abrir el Simulador es **"Pasto sobre depósitos
volcánicos"**. Los tres primeros usan el modelo de dos capas; los dos últimos
son homogéneos, como comparación.

### 1. Pasto sobre depósitos volcánicos (dos capas) — por defecto

Capa blanda de depósitos volcánicos sobre roca. La onda S se amplifica y la
sacudida se prolonga tras su llegada.

| Parámetro | Valor |
|-----------|-------|
| Tipo | Tectónico (doble par) |
| Semiespacio (roca) | Vp 4000, Vs 2300, ρ 2600 |
| Capa superficial | espesor 0.5 km, Vp 1800, Vs 600, ρ 1900 |
| Magnitud / profundidad | Mw 4.5 / 2 km |
| Mecanismo / acimut | strike 30, dip 45, rake 60 / az 45 |
| Distancia estación | 4 km |
| Malla / duración | dx 25 m, duración 6.5 s |

### 2. Cortical andino (Nariño, dos capas)

Sedimentos moderadamente blandos sobre roca; P y S bien marcadas y cola algo
prolongada por la capa.

| Parámetro | Valor |
|-----------|-------|
| Tipo | Tectónico (doble par) |
| Semiespacio (roca) | Vp 3500, Vs 2000, ρ 2600 |
| Capa (sedimentos) | espesor 0.6 km, Vp 2600, Vs 1000, ρ 2100 |
| Magnitud / profundidad | Mw 5.0 / 3 km |
| Mecanismo / acimut | strike 30, dip 45, rake 60 / az 45 |
| Distancia estación | 4 km |
| Malla / duración | dx 25 m, duración 6.5 s |

### 3. Volcano-tectónico del Galeras (dos capas)

Fuente isótropa (volcánica) con depósitos piroclásticos sobre roca volcánica.
Domina la P, la transversal es casi nula (no hay cizalla) y la capa prolonga la
sacudida.

| Parámetro | Valor |
|-----------|-------|
| Tipo | Volcánico (isótropo) |
| Semiespacio (roca volcánica) | Vp 3000, Vs 1700, ρ 2500 |
| Capa (piroclásticos) | espesor 0.4 km, Vp 1900, Vs 700, ρ 1800 |
| Magnitud / profundidad | Mw 3.5 / 2.5 km |
| Distancia estación | 3 km |
| Malla / duración | dx 25 m, duración 6 s |

### 4. Cortical más profundo (homogéneo)

Corteza homogénea con la fuente más profunda: P y S bien separadas. Comparación
sin capa.

| Parámetro | Valor |
|-----------|-------|
| Tipo | Tectónico (doble par) |
| Medio | Vp 3600, Vs 2050, ρ 2700 |
| Magnitud / profundidad | Mw 5.5 / 5 km |
| Mecanismo / acimut | strike 30, dip 45, rake 80 / az 45 |
| Distancia estación | 6 km |
| Malla / duración | dx 20 m, duración 6 s |

### 5. Cortical didáctico (homogéneo)

Corteza homogénea somera: P clara y un tren de onda S fuerte, con energía en las
tres componentes. Comparación sin capa.

| Parámetro | Valor |
|-----------|-------|
| Tipo | Tectónico (doble par) |
| Medio | Vp 3200, Vs 1850, ρ 2500 |
| Magnitud / profundidad | Mw 4.5 / 2 km |
| Mecanismo / acimut | strike 20, dip 45, rake 60 / az 35 |
| Distancia estación | 4 km |
| Malla / duración | dx 20 m, duración 6 s |

## Métricas medidas (motor real)

Valores medidos con los criterios de arriba. `cola` = RMS coda capa / homogéneo
(— = homogéneo, no aplica). `P/S` = amplitud P / S en escala común. `comp` =
menor componente / mayor. `ventana` = fracción de la duración que ocupa la
ventana del evento. `rebote/dur` = primer rebote de borde (menor P/S) frente a
la duración (debe ser mayor que la duración).

| Escenario | cola | P/S | comp | ventana | nodos/λ | rebote/dur | cómputo | f0 |
|-----------|------|-----|------|---------|---------|------------|---------|-----|
| Pasto (defecto) | 242× | 0.74 | 0.29 | 0.70 | 10.0 | 8.5 / 6.5 s | 10.5 s | 0.96 Hz |
| Cortical andino | 726× | 0.82 | 0.29 | 0.74 | 10.0 | 8.9 / 6.5 s | 9.8 s | 1.60 Hz |
| Galeras VT | 96× | 3.13 | 1.00* | 0.71 | 10.0 | 10.6 / 6.0 s | 7.6 s | 1.12 Hz |
| Cortical profundo | — | 0.29 | 0.31 | 0.52 | 11.7 | 6.2 / 6.0 s | 10.4 s | 3.50 Hz |
| Cortical didáctico | — | 0.57 | 0.52 | 0.43 | 10.6 | 6.8 / 6.0 s | 9.1 s | 3.50 Hz |

*Galeras: al ser fuente isótropa, Norte y Este provienen de la misma radial
(por eso `comp = 1.00`) y la **transversal medida es 0** (SH no excitado);
la vertical es ~32 % de la horizontal. Las colas altas de los escenarios con
capa se deben a que la coda del caso homogéneo con la misma frecuencia es casi
nula, de modo que el contraste es grande.

## Distancia epicentral y acimut

- **Distancia epicentral** (`epicentralDistanceKm`): a mayor distancia, P y S se
  separan más, pero el receptor se acerca al borde. El máximo del control depende
  de dx; si se pide más, se ajusta al máximo alcanzable y se avisa el motivo.
- **Acimut de la estación**: un valor intermedio (≈45°) reparte la energía entre
  Norte y Este, así las tres componentes se ven distintas. En el volcánico no
  hay transversal, así que el acimut solo reparte la radial entre N y E.
