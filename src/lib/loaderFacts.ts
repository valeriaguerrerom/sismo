/**
 * Datos curiosos que rotan en los loaders de carga (Simulador y Mapa 3D) para
 * entretener la espera mientras se genera la simulación. Sobre ondas sísmicas,
 * el volcán Galeras y Nariño.
 *
 * @module lib/loaderFacts
 */

/** Frases cortas que van rotando bajo la barra de progreso. */
export const LOADER_FACTS: string[] = [
  'Las ondas P (primarias) son las más rápidas: comprimen y estiran la roca, y viajan a varios km por segundo.',
  'Las ondas S (secundarias) llegan después de las P y no atraviesan líquidos, por eso no pasan por el núcleo externo.',
  'La diferencia de tiempo entre la llegada de la P y la S revela a qué distancia ocurrió el sismo.',
  'El volcán Galeras es uno de los más activos de Colombia y es vigilado por el OVSP en Pasto.',
  'Las ondas superficiales (Love y Rayleigh) suelen causar el mayor movimiento del suelo en un sismo.',
  'Un sismograma triaxial mide el movimiento en tres direcciones: Norte-Sur, Este-Oeste y Vertical.',
  'Nariño tiene siete volcanes activos vigilados por el OVSP, incluidos Galeras, Cumbal y Azufral.',
  'La escala de magnitud es logarítmica: cada punto más equivale a unas 32 veces más energía liberada.',
  'Este simulador resuelve la ecuación de onda elástica en 2D con diferencias finitas (FDM).',
  'La fuente sísmica se modela con una ondícula de Ricker, muy usada en sismología para simular pulsos.',
];

/** Devuelve un índice inicial aleatorio para variar el primer dato mostrado. */
export function randomFactIndex(): number {
  return Math.floor(Math.random() * LOADER_FACTS.length);
}
