/**
 * Pasos del tour de bienvenida (Inicio). Se lanza la primera vez que el
 * usuario inicia sesión y explica QUÉ ES cada parte de la plataforma.
 *
 * En desktop resalta los botones de la barra de navegación.
 * En móvil (<768px), como esos botones están dentro del menú hamburguesa
 * (ocultos), usa pasos centrados (sin element) que funcionan igual de bien.
 * @module tours/home
 */
import type { TourStep } from './useTour';

interface HomeTourOptions {
  /** true si el perfil de investigador ya está completo. */
  profileComplete: boolean;
}

/** true si la pantalla es "mobile" (por debajo del breakpoint md de Tailwind). */
function isMobile(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

/** Construye los pasos del tour de bienvenida del Inicio. */
export function buildHomeSteps({ profileComplete }: HomeTourOptions): TourStep[] {
  const mobile = isMobile();

  // En desktop, paso que apunta a un elemento del navbar.
  // En móvil, paso centrado (sin element) con el mismo título y descripción.
  const navStep = (element: string, title: string, description: string, side: 'bottom' | 'top' = 'bottom', align: 'start' | 'end' | 'center' = 'start'): TourStep =>
    mobile
      ? { popover: { title, description, align: 'center' } }
      : { element, popover: { title, description, side, align } };

  return [
    {
      // Paso de bienvenida sin elemento: popover centrado.
      popover: {
        title: '¡Bienvenido a SismoNariño! 👋',
        description:
          mobile
            ? 'Esta es una plataforma para simular y explorar sismos del subsuelo de Nariño. Abre el menú ☰ para navegar entre las secciones.'
            : 'Esta es una plataforma para simular y explorar sismos del subsuelo de Nariño. Te mostramos en 30 segundos qué encontrarás en cada sección.',
        align: 'center',
      },
    },
    navStep('[data-tour="nav-simulation"]', 'Simulador',
      'Genera pseudo-sismogramas: defines las propiedades del terreno y la fuente, y el sistema simula cómo viajan las ondas.'),
    navStep('[data-tour="nav-explorer"]', 'Explorador',
      'Consulta registros sísmicos reales del Galeras y de la red del SGC, con su mapa y sus formas de onda.'),
    navStep('[data-tour="nav-map3d"]', 'Mapa 3D',
      'Visualiza en tres dimensiones cómo se propaga la energía sísmica por la región.'),
    navStep('[data-tour="nav-education"]', 'Educación',
      'Aprende sobre tipos de ondas, magnitud, profundidad y el método de simulación, con un glosario y un quiz.'),
    navStep('[data-tour="nav-reports"]', 'Reportes',
      'Aquí quedan guardadas tus simulaciones. Puedes volver a verlas y exportarlas en PDF.', 'bottom', 'end'),
    navStep('[data-tour="nav-perfil"]', 'Tu perfil',
      'Tus datos de investigador y el acceso para cerrar sesión.', 'bottom', 'end'),
    profileComplete
      ? mobile
        ? { popover: { title: 'Empieza cuando quieras', description: 'Abre el menú ☰ y entra al simulador, al explorador o al centro educativo. ¡Explora a tu ritmo!', align: 'center' as const } }
        : {
            element: '[data-tour="hero-modulos"]',
            popover: {
              title: 'Empieza cuando quieras',
              description: 'Desde aquí puedes entrar directo al simulador, al explorador o al centro educativo. ¡Explora a tu ritmo!',
              side: 'top' as const,
              align: 'start' as const,
            },
          }
      : mobile
        ? { popover: { title: 'Completa tu perfil', description: 'Completa tus datos de investigador una sola vez para habilitar todos los módulos. Abre el menú ☰ y ve a tu perfil.', align: 'center' as const } }
        : {
            element: '[data-tour="hero-completar-perfil"]',
            popover: {
              title: 'Completa tu perfil',
              description: 'Antes de empezar, completa tus datos de investigador una sola vez. Así habilitas el simulador, el explorador, el mapa 3D y el centro educativo.',
              side: 'top' as const,
              align: 'start' as const,
            },
          },
  ];
}
