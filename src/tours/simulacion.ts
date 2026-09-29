/**
 * Pasos del tour guiado del módulo Simulador (5 pasos). Frases cortas que
 * dicen QUÉ HACER, no qué es. Si el acordeón del paso está cerrado, se abre
 * automáticamente vía `openParam`/`openResult` durante ese paso.
 * @module tours/simulacion
 */
import type { TourStep } from './useTour';

/**
 * Versión del tour del Simulador. Súbela cuando cambien los pasos: quien ya
 * había visto una versión anterior lo verá una vez más automáticamente.
 * v2: añade escenarios, mecanismo avanzado, dirección/distancia de la estación,
 * escala de sismogramas, mapa de calor del subsuelo y diálogo del PDF.
 * v3: añade la pestaña "Movimiento de partícula" (hodograma 3D).
 * v4: empieza por "Variables elásticas" (sección abierta por defecto), luego
 * la fuente; el primer paso ya coincide sin abrir otra sección.
 * v5: los pasos de parámetros apuntan al encabezado de cada sección (altura
 * fija), para que el popover no se desborde cuando la sección abierta es alta.
 */
export const SIMULACION_TOUR_VERSION = 5;

/** Secciones de acordeón que el tour puede forzar a abrir. */
export type ParamSectionId = 'elasticas' | 'fuente' | 'config';
export type ResultSectionId = 'metricas' | 'malla' | 'interpretacion';

interface SimTourControls {
  /** Abre un acordeón del panel de parámetros (izquierda). */
  openParam: (s: ParamSectionId) => void;
  /** Abre un acordeón del panel de resultados (derecha). */
  openResult: (s: ResultSectionId) => void;
  /** Si ya hay una simulación generada: añade los pasos de resultados. */
  hasResult?: boolean;
}

/** Construye los pasos del tour del Simulador con los controles dados. */
export function buildSimulacionSteps({ openParam, openResult, hasResult = false }: SimTourControls): TourStep[] {
  // Los pasos de parámetros apuntan al ENCABEZADO de cada sección (elemento de
  // altura fija ~44px), no a la tarjeta completa (que crece al abrirse y puede
  // superar el alto de la ventana). Así el popover siempre cabe al lado y nunca
  // se desborda. La sección se abre igual con openParam para mostrar su contenido.
  const steps: TourStep[] = [
    {
      // Se empieza por "Variables elásticas", que es la sección abierta por
      // defecto: así el primer paso ya coincide sin tener que abrir otra.
      element: '[data-tour="params-elasticas-h"]',
      onHighlightStarted: () => openParam('elasticas'),
      popover: {
        title: 'Propiedades del subsuelo',
        description: 'Empieza aquí: cambia las velocidades de onda y la densidad de la roca. Cada término tiene un ícono de información.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="params-fuente-h"]',
      onHighlightStarted: () => openParam('fuente'),
      popover: {
        title: 'Elige la fuente',
        description: 'Parte de un escenario listo (andino, Galeras…) o ajusta el tipo, la magnitud y la profundidad del sismo.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="params-config-h"]',
      onHighlightStarted: () => openParam('config'),
      popover: {
        title: 'Estación y malla',
        description: 'Aquí defines la distancia y dirección de la estación, la duración y la resolución de la simulación.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="btn-generar"]',
      onHighlightStarted: () => openParam('config'),
      popover: {
        title: 'Genera el sismograma',
        description: 'Pulsa para simular con estos valores. El resultado aparece a la derecha.',
        side: 'top',
        align: 'center',
      },
    },
  ];

  // Los pasos de resultados solo tienen sentido cuando ya se generó una
  // simulación (sus elementos existen y muestran contenido real).
  if (hasResult) {
    steps.push(
      {
        element: '[data-tour="viz-area"]',
        popover: {
          title: 'Sismogramas',
          description: 'Las tres componentes (Norte, Este, Vertical). Cambia "Escala de amplitud" para compararlas mejor.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="viz-area"]',
        popover: {
          title: 'Mapa de calor del subsuelo',
          description: 'Cambia a esta pestaña para ver la onda propagándose en un corte vertical. Usa reproducir, la capa y la escala global.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="viz-area"]',
        popover: {
          title: 'Movimiento de partícula',
          description: 'En esta pestaña ves la trayectoria 3D del suelo. Gírala con el mouse: la P (terracota) empuja en la dirección de propagación y la S (verde), perpendicular.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="sim-metricas"]',
        onHighlightStarted: () => openResult('metricas'),
        popover: {
          title: 'Métricas e interpretación',
          description: 'Aquí ves amplitud, arribos P y S, la malla y un resumen en palabras del resultado.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="sim-export"]',
        popover: {
          title: 'Exportar',
          description: 'Descarga CSV, PNG o PDF. En el PDF eliges qué incluir, incluido el mapa de calor.',
          side: 'top',
          align: 'center',
        },
      },
    );
  }

  return steps;
}
