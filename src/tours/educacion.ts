/**
 * Pasos del tour guiado del Centro de aprendizaje sísmico (Educación). Explica
 * QUÉ encontrará el usuario: los capítulos como ruta numerada, el bloque de
 * consulta (glosario, referencias y quiz) y el lienzo interactivo de cada tema.
 * Se lanza la primera vez que se entra al módulo; el botón "?" lo repite.
 * @module tours/educacion
 */
import type { TourStep } from './useTour';

/**
 * true si la pantalla está por debajo del breakpoint lg (la barra lateral se
 * apila arriba). Usa matchMedia para coincidir con el layout real de Tailwind.
 */
function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(max-width: 1023px)').matches;
  }
  return window.innerWidth < 1024;
}

/** Construye los pasos del tour del Centro de aprendizaje. */
export function buildEducacionSteps(): TourStep[] {
  const mobile = isMobile();

  return [
    {
      // Bienvenida centrada (sin resaltar nada): se ve bien en cualquier ancho.
      popover: {
        title: 'Centro de aprendizaje sísmico',
        description:
          'Aquí aprendes por capítulos sobre ondas, magnitud, profundidad, historia y la metodología del simulador. Cada capítulo es un laboratorio interactivo.',
        align: 'center',
      },
    },
    {
      element: '[data-tour="edu-capitulos"]',
      popover: {
        title: 'Capítulos',
        description:
          'Recorre los temas en orden. El número se marca con un check cuando terminas el laboratorio de ese capítulo.',
        side: mobile ? 'bottom' : 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="edu-consulta"]',
      popover: {
        title: 'Glosario, referencias y quiz',
        description:
          'Consulta términos clave, las fuentes citadas y pon a prueba lo aprendido con el quiz.',
        side: mobile ? 'bottom' : 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="edu-contenido"]',
      popover: {
        title: 'Laboratorio del capítulo',
        description:
          'Aquí va el contenido interactivo del tema que elijas: animaciones, gráficos y botones para explorar.',
        side: mobile ? 'top' : 'left',
        align: 'start',
      },
    },
  ];
}
