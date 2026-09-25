/**
 * Pasos del tour de bienvenida (Inicio). Se lanza la primera vez que el
 * usuario inicia sesión y explica QUÉ ES cada parte de la plataforma:
 * la barra de navegación (Simulador, Explorador, Mapa 3D, Educación,
 * Reportes) y el perfil. Reutiliza el sistema común de tours.
 * @module tours/home
 */
import type { TourStep } from './useTour';

interface HomeTourOptions {
  /** true si el perfil de investigador ya está completo. */
  profileComplete: boolean;
}

/** Construye los pasos del tour de bienvenida del Inicio. */
export function buildHomeSteps({ profileComplete }: HomeTourOptions): TourStep[] {
  return [
    {
      // Paso de bienvenida sin elemento: popover centrado.
      popover: {
        title: '¡Bienvenido a SismoNariño! 👋',
        description:
          'Esta es una plataforma para simular y explorar sismos del subsuelo de Nariño. Te mostramos en 30 segundos qué encontrarás en cada sección.',
        align: 'center',
      },
    },
    {
      element: '[data-tour="nav-simulation"]',
      popover: {
        title: 'Simulador',
        description:
          'Genera pseudo-sismogramas: defines las propiedades del terreno y la fuente, y el sistema simula cómo viajan las ondas.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="nav-explorer"]',
      popover: {
        title: 'Explorador',
        description:
          'Consulta registros sísmicos reales del Galeras y de la red del SGC, con su mapa y sus formas de onda.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="nav-map3d"]',
      popover: {
        title: 'Mapa 3D',
        description:
          'Visualiza en tres dimensiones cómo se propaga la energía sísmica por la región.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="nav-education"]',
      popover: {
        title: 'Educación',
        description:
          'Aprende sobre tipos de ondas, magnitud, profundidad y el método de simulación, con un glosario y un quiz.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="nav-reports"]',
      popover: {
        title: 'Reportes',
        description:
          'Aquí quedan guardadas tus simulaciones. Puedes volver a verlas y exportarlas en PDF.',
        side: 'bottom',
        align: 'end',
      },
    },
    {
      element: '[data-tour="nav-perfil"]',
      popover: {
        title: 'Tu perfil',
        description:
          'Tus datos de investigador y el acceso para cerrar sesión. Completa tu perfil para habilitar todos los módulos.',
        side: 'bottom',
        align: 'end',
      },
    },
    profileComplete
      ? {
          element: '[data-tour="hero-modulos"]',
          popover: {
            title: 'Empieza cuando quieras',
            description:
              'Desde aquí puedes entrar directo al simulador, al explorador o al centro educativo. ¡Explora a tu ritmo!',
            side: 'top',
            align: 'start',
          },
        }
      : {
          element: '[data-tour="hero-completar-perfil"]',
          popover: {
            title: 'Completa tu perfil',
            description:
              'Antes de empezar, completa tus datos de investigador una sola vez. Así habilitas el simulador, el explorador, el mapa 3D y el centro educativo.',
            side: 'top',
            align: 'start',
          },
        },
  ];
}
