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
 * v6: con las secciones compactas y el acordeón exclusivo, los pasos vuelven a
 * resaltar la SECCIÓN COMPLETA (tarjeta con su contenido).
 * v7: cada paso de resultados resalta su pestaña (Sismogramas/Mapa/Partícula) y
 * cambia a ella; el tour de resultados se dispara tras la primera simulación.
 */
export const SIMULACION_TOUR_VERSION = 8;

/** Secciones de acordeón que el tour puede forzar a abrir. */
export type ParamSectionId = 'elasticas' | 'fuente' | 'config';
export type ResultSectionId = 'metricas' | 'malla' | 'interpretacion';
/** Pestañas de la Visualización (deben coincidir con ViewMode de Simulation). */
export type VizView = '2d' | 'triaxial' | 'particle';

interface SimTourControls {
  /** Abre un acordeón del panel de parámetros (izquierda). */
  openParam: (s: ParamSectionId) => void;
  /** Abre un acordeón del panel de resultados (derecha). */
  openResult: (s: ResultSectionId) => void;
  /** Cambia la pestaña de la Visualización (Sismogramas / Mapa / Partícula). */
  showView: (v: VizView) => void;
  /** Si ya hay una simulación generada: añade los pasos de resultados. */
  hasResult?: boolean;
  /** Si true, se OMITEN los pasos de parámetros y solo se muestran los de
   *  resultados (para continuar el tour tras la primera simulación). */
  resultsOnly?: boolean;
}

/** Construye los pasos del tour del Simulador con los controles dados. */
export function buildSimulacionSteps({ openParam, openResult, showView, hasResult = false, resultsOnly = false }: SimTourControls): TourStep[] {
  // Los pasos de parámetros resaltan la SECCIÓN COMPLETA (tarjeta con su
  // contenido), no solo el encabezado. Como el acordeón es exclusivo y las
  // secciones son compactas, la tarjeta abierta cabe en la ventana y el popover
  // se coloca al lado sin desbordarse. La sección se abre con openParam.
  // En modo resultsOnly se omiten (para continuar el tour tras generar).
  const steps: TourStep[] = resultsOnly ? [] : [
    {
      // Se empieza por "Variables elásticas", que es la sección abierta por
      // defecto: así el primer paso ya coincide sin tener que abrir otra.
      element: '[data-tour="params-elasticas"]',
      onHighlightStarted: () => openParam('elasticas'),
      popover: {
        title: 'Propiedades del subsuelo',
        description: 'Empieza aquí: cambia las velocidades de onda y la densidad de la roca. Cada término tiene un ícono de información.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="params-subsuelo"]',
      onHighlightStarted: () => openParam('elasticas'),
      popover: {
        title: 'Subsuelo: homogéneo o dos capas',
        description: 'Elige "Dos capas" para poner una capa superficial blanda sobre la roca. Aparecen la reflexión en la interfaz y una sacudida más larga y amplificada en superficie. El escenario "Pasto sobre depósitos volcánicos" ya viene así.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="params-fuente"]',
      onHighlightStarted: () => openParam('fuente'),
      popover: {
        title: 'Elige la fuente',
        description: 'Parte de un escenario listo (andino, Galeras…) o ajusta el tipo, la magnitud y la profundidad del sismo.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="params-config"]',
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
  if (hasResult || resultsOnly) {
    steps.push(
      {
        // Cada paso cambia a SU pestaña y resalta el botón correspondiente.
        element: '[data-tour="tab-2d"]',
        onHighlightStarted: () => showView('2d'),
        popover: {
          title: 'Sismogramas',
          description: 'Las tres componentes (Norte, Este, Vertical). Cambia "Escala de amplitud" para compararlas mejor.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '[data-tour="tab-triaxial"]',
        onHighlightStarted: () => showView('triaxial'),
        popover: {
          title: 'Mapa de calor del subsuelo',
          description: 'La onda propagándose en un corte vertical. Usa reproducir, la capa y la escala global.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '[data-tour="tab-particle"]',
        onHighlightStarted: () => showView('particle'),
        popover: {
          title: 'Movimiento de partícula',
          description: 'La trayectoria 3D del suelo. Gírala con el mouse: la P (terracota) empuja en la dirección de propagación y la S (verde), perpendicular.',
          side: 'bottom',
          align: 'center',
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
