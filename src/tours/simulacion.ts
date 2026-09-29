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
  /** Si ya hay una simulación generada: añade los pasos de resultados. */
  hasResult?: boolean;
}

/** Construye los pasos del tour del Simulador con los controles dados. */
export function buildSimulacionSteps({ openParam, openResult, hasResult = false }: SimTourControls): TourStep[] {
  const steps: TourStep[] = [
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
      element: '[data-tour="params-config"]',
      onHighlightStarted: () => openParam('config'),
      popover: {
        title: 'Configuración',
        description: 'Define la duración, la resolución de la malla y el paso de tiempo de la simulación.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="btn-generar"]',
      onHighlightStarted: () => openParam('config'),
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
        description: 'Mira las tres componentes del movimiento o el corte del subsuelo.',
        side: 'left',
        align: 'start',
      },
    },
  ];

  // Los pasos de resultados solo tienen sentido cuando ya se generó una
  // simulación (sus elementos existen y muestran contenido real).
  if (hasResult) {
    steps.push(
      {
        element: '[data-tour="sim-metricas"]',
        onHighlightStarted: () => openResult('metricas'),
        popover: {
          title: 'Métricas del sismo',
          description: 'Aquí ves la amplitud máxima, la duración, la frecuencia dominante, la relación Vp/Vs y los arribos de las ondas P y S.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="sim-malla"]',
        onHighlightStarted: () => openResult('malla'),
        popover: {
          title: 'Malla FDM',
          description: 'El detalle numérico de la simulación: tamaño de malla, resolución, paso de tiempo y avisos de estabilidad si algún parámetro se ajustó.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="sim-interpretacion"]',
        onHighlightStarted: () => openResult('interpretacion'),
        popover: {
          title: 'Interpretación automática',
          description: 'Un resumen en palabras de lo que muestra tu sismograma: tipo de fuente, profundidad, arribos y mecanismo. Ideal para entender el resultado.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="sim-export"]',
        popover: {
          title: 'Exportar',
          description: 'Descarga tu resultado en CSV (datos), PNG (imagen) o PDF (reporte completo con la interpretación).',
          side: 'top',
          align: 'center',
        },
      },
    );
  }

  return steps;
}
