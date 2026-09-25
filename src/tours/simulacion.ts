/**
 * Pasos del tour guiado del módulo Simulador (5 pasos). Frases cortas que
 * dicen QUÉ HACER, no qué es. Si el acordeón del paso está cerrado, se abre
 * automáticamente vía `openParam`/`openResult` durante ese paso.
 * @module tours/simulacion
 */
import type { TourStep } from './useTour';

/** Secciones de acordeón que el tour puede forzar a abrir. */
export type ParamSectionId = 'elasticas' | 'fuente' | 'config';
export type ResultSectionId = 'metricas' | 'malla' | 'interpretacion';

interface SimTourControls {
  /** Abre un acordeón del panel de parámetros (izquierda). */
  openParam: (s: ParamSectionId) => void;
  /** Abre un acordeón del panel de resultados (derecha). */
  openResult: (s: ResultSectionId) => void;
}

/** Construye los pasos del tour del Simulador con los controles dados. */
export function buildSimulacionSteps({ openParam, openResult }: SimTourControls): TourStep[] {
  return [
    {
      element: '[data-tour="params-elasticas"]',
      onHighlightStarted: () => openParam('elasticas'),
      popover: {
        title: 'Variables elásticas',
        description: 'Ajusta aquí las propiedades del subsuelo.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="params-fuente"]',
      onHighlightStarted: () => openParam('fuente'),
      popover: {
        title: 'Fuente sísmica',
        description: 'Elige si el sismo es tectónico o volcánico y su magnitud.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="btn-generar"]',
      popover: {
        title: 'Generar',
        description: 'Genera el pseudo-sismograma con estos valores.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '[data-tour="viz-area"]',
      popover: {
        title: 'Visualización',
        description: 'Mira las tres componentes del movimiento o el mapa de calor.',
        side: 'left',
        align: 'start',
      },
    },
    {
      element: '[data-tour="results-panel"]',
      onHighlightStarted: () => openResult('metricas'),
      popover: {
        title: 'Resultados',
        description: 'Revisa los resultados y exporta en CSV, PNG o PDF.',
        side: 'left',
        align: 'start',
      },
    },
  ];
}
