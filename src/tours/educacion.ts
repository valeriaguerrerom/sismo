/**
 * Pasos del tour guiado del Centro de Aprendizaje. Frases cortas que dicen
 * QUÉ HACER. Recorre las secciones clave cambiando de pestaña en cada paso.
 * Se lanza la primera vez que el usuario entra al módulo; el botón "?" de la
 * cabecera lo repite. Reutiliza el sistema común de tours.
 * @module tours/educacion
 */
import type { TourStep } from './useTour';

interface EduTourControls {
  /** Selecciona una sección del centro educativo (para mostrarla en su paso). */
  openSection: (id: string) => void;
}

/** Construye los pasos del tour de Educación con los controles dados. */
export function buildEducacionSteps({ openSection }: EduTourControls): TourStep[] {
  return [
    {
      element: '[data-tour="edu-tabs"]',
      onHighlightStarted: () => openSection('waves'),
      popover: {
        title: 'Elige un tema',
        description:
          'Estas pestañas son las 8 secciones del centro educativo. Te mostramos qué hay en cada una.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="edu-tab-waves"]',
      onHighlightStarted: () => openSection('waves'),
      popover: {
        title: 'Tipos de ondas',
        description: 'Explora de forma interactiva las ondas P, S, Love y Rayleigh y cómo se propagan.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="edu-tab-magnitude"]',
      onHighlightStarted: () => openSection('magnitude'),
      popover: {
        title: 'Escala de magnitud',
        description: 'Entiende cómo se mide la energía de un sismo y su potencial destructivo.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="edu-tab-depth"]',
      onHighlightStarted: () => openSection('depth'),
      popover: {
        title: 'Profundidad',
        description: 'Descubre cómo la profundidad del foco afecta lo que se siente en superficie.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="edu-tab-fdm"]',
      onHighlightStarted: () => openSection('fdm'),
      popover: {
        title: 'Metodología FDM',
        description: 'Conoce el método de diferencias finitas que usa el simulador para generar las ondas.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="edu-tab-timeline"]',
      onHighlightStarted: () => openSection('timeline'),
      popover: {
        title: 'Línea de tiempo',
        description: 'Recorre los sismos y erupciones históricas más relevantes de Nariño.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="edu-tab-glossary"]',
      onHighlightStarted: () => openSection('glossary'),
      popover: {
        title: 'Glosario',
        description: 'Consulta los términos sismológicos clave cuando tengas dudas.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="edu-tab-references"]',
      onHighlightStarted: () => openSection('references'),
      popover: {
        title: 'Referencias',
        description: 'Las fuentes científicas e institucionales en las que se apoya el contenido.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="edu-contenido"]',
      onHighlightStarted: () => openSection('waves'),
      popover: {
        title: 'Aquí se muestra el contenido',
        description: 'Cada pestaña despliega su contenido interactivo en esta zona.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '[data-tour="edu-tab-quiz"]',
      onHighlightStarted: () => openSection('quiz'),
      popover: {
        title: 'Ponte a prueba',
        description: 'Cuando quieras, responde el quiz para repasar todo lo aprendido.',
        side: 'bottom',
        align: 'end',
      },
    },
  ];
}
