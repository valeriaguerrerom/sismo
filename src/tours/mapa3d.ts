/**
 * Pasos del tour guiado del Mapa 3D. Frases cortas que dicen QUÉ HACER, con
 * cada control bien señalado. Se lanza la primera vez que el usuario entra al
 * módulo; el botón "?" de la cabecera lo repite. Reutiliza el sistema común.
 *
 * En desktop resalta cada panel y control de la pantalla.
 * En móvil (<1024px) los paneles laterales arrancan ocultos para dar espacio a
 * la escena 3D, así que esos controles no están en pantalla: para esos pasos
 * usamos popovers centrados (sin element) que explican lo mismo e indican
 * tocar "Mostrar paneles" cuando haga falta.
 * @module tours/mapa3d
 */
import type { TourStep } from './useTour';

/**
 * true si la pantalla está por debajo del breakpoint lg (paneles ocultos).
 * Usa matchMedia (igual que Tailwind) para que coincida con el layout real,
 * incluso en el modo responsive del navegador donde innerWidth puede mentir.
 */
function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(max-width: 1023px)').matches;
  }
  return window.innerWidth < 1024;
}

/** Construye los pasos del tour del Mapa 3D. */
export function buildMapa3dSteps(): TourStep[] {
  const mobile = isMobile();

  // Paso que apunta a un control de panel: en desktop resalta el elemento; en
  // móvil (paneles ocultos) muestra un popover centrado con el mismo mensaje.
  const panelStep = (
    element: string,
    title: string,
    description: string,
    side: 'left' | 'right' | 'top' | 'bottom',
    align: 'start' | 'end' | 'center' = 'start',
  ): TourStep =>
    mobile
      ? { popover: { title, description, align: 'center' } }
      : { element, popover: { title, description, side, align } };

  return [
    {
      element: '[data-tour="m3d-escena"]',
      popover: {
        title: 'Escena 3D',
        description:
          'Este es el terreno de Nariño en 3D. Arrastra para girar, usa dos dedos (o la rueda) para acercar y explora la propagación de las ondas.',
        side: mobile ? 'bottom' : 'left',
        align: 'center',
      },
    },
    {
      // Sin `element`: popover centrado (nota general), para NO volver a
      // resaltar toda la escena como el paso anterior (se veía "mal señalado").
      popover: {
        title: '¿Por qué el bloque llega a 200 km?',
        description:
          'En Nariño la placa de Nazca se hunde bajo la de Sudamérica (subducción). Eso genera sismos no solo superficiales, sino también intermedios, de decenas hasta ~200 km de profundidad. Por eso el bloque llega tan hondo.',
      },
    },
    {
      element: '[data-tour="m3d-hint"]',
      popover: {
        title: 'Coloca el epicentro',
        description:
          'Toca el terreno para ubicar el foco del sismo, y toca un triángulo ▲ para seleccionar una estación.',
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
    // A partir de aquí, en móvil los paneles están ocultos: antes de describir
    // sus controles, invitamos a mostrarlos. En desktop este paso no aparece.
    ...(mobile
      ? [{
          popover: {
            title: 'Muestra los paneles',
            description:
              'En el celular los paneles arrancan ocultos para que la escena se vea grande. Toca "Mostrar paneles" arriba a la derecha para ver los sismogramas y los controles que siguen.',
            align: 'center' as const,
          },
        }]
      : []),
    panelStep('[data-tour="m3d-transporte"]', 'Reproducir',
      'Inicia o pausa la animación de la propagación. El botón circular la reinicia desde cero.', 'left'),
    panelStep('[data-tour="m3d-velocidad"]', 'Velocidad',
      'Acelera la animación de 1× hasta 20× para ver el recorrido más rápido.', 'left'),
    panelStep('[data-tour="m3d-modelo"]', 'Modelo de velocidades',
      'Elige cómo viajan las ondas: con velocidad constante o con el modelo terrestre IASP91 (cambia con la profundidad).', 'left'),
    panelStep('[data-tour="m3d-sismogramas"]', 'Sismogramas',
      'Compara las llegadas de las ondas P y S en cada estación mientras avanza la simulación.', 'right'),
    panelStep('[data-tour="m3d-evento"]', 'Cargar un evento real',
      'Elige un sismo del catálogo para simular su propagación con datos reales.', 'top', 'end'),
  ];
}
