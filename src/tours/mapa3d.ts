/**
 * Pasos del tour guiado del Mapa 3D. Frases cortas que dicen QUÉ HACER, con
 * cada control bien señalado. Se lanza la primera vez que el usuario entra al
 * módulo; el botón "?" de la cabecera lo repite. Reutiliza el sistema común.
 * @module tours/mapa3d
 */
import type { TourStep } from './useTour';

/** Construye los pasos del tour del Mapa 3D. */
export function buildMapa3dSteps(): TourStep[] {
  return [
    {
      element: '[data-tour="m3d-escena"]',
      popover: {
        title: 'Escena 3D',
        description:
          'Este es el terreno de Nariño en 3D. Arrastra para girar, usa la rueda para acercar y explora la propagación de las ondas.',
        side: 'left',
        align: 'center',
      },
    },
    {
      element: '[data-tour="m3d-hint"]',
      popover: {
        title: 'Coloca el epicentro',
        description:
          'Haz clic en el terreno para ubicar el foco del sismo, y clic en un triángulo ▲ para seleccionar una estación.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="m3d-vistas"]',
      popover: {
        title: 'Vistas de cámara',
        description:
          'Cambia rápido entre vista Norte, Corte (perfil del subsuelo) y Superior.',
        side: 'top',
        align: 'start',
      },
    },
    {
      element: '[data-tour="m3d-transporte"]',
      popover: {
        title: 'Reproducir',
        description:
          'Inicia o pausa la animación de la propagación. El botón circular la reinicia desde cero.',
        side: 'left',
        align: 'start',
      },
    },
    {
      element: '[data-tour="m3d-velocidad"]',
      popover: {
        title: 'Velocidad',
        description: 'Acelera la animación de 1× hasta 20× para ver el recorrido más rápido.',
        side: 'left',
        align: 'start',
      },
    },
    {
      element: '[data-tour="m3d-modelo"]',
      popover: {
        title: 'Modelo de tiempos',
        description:
          'Elige cómo se calculan los tiempos de llegada: medio homogéneo o el modelo global IASP91.',
        side: 'left',
        align: 'start',
      },
    },
    {
      element: '[data-tour="m3d-sismogramas"]',
      popover: {
        title: 'Sismogramas',
        description:
          'Compara las llegadas de las ondas P y S en cada estación mientras avanza la simulación.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="m3d-evento"]',
      popover: {
        title: 'Cargar un evento real',
        description:
          'Elige un sismo del catálogo para simular su propagación con datos reales.',
        side: 'top',
        align: 'end',
      },
    },
  ];
}
