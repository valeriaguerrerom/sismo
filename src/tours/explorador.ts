/**
 * Pasos del tour guiado del Explorador. Frases cortas que dicen QUÉ HACER.
 * Se lanza la primera vez que el usuario entra al módulo; el botón "?" de la
 * cabecera lo repite. Reutiliza el sistema común de tours.
 * @module tours/explorador
 */
import type { TourStep } from './useTour';

interface ExploradorTourOptions {
  /** true si la fuente "Mi archivo MiniSEED" está disponible (hay sesión). */
  canUpload: boolean;
}

/** Construye los pasos del tour del Explorador. */
export function buildExploradorSteps({ canUpload }: ExploradorTourOptions): TourStep[] {
  const steps: TourStep[] = [
    {
      element: '[data-tour="exp-fuente-volcanic"]',
      popover: {
        title: '1 · Sismos volcánicos',
        description:
          'Registros del Volcán Galeras (OVSP), clasificados por tipo. Es la fuente que ves al entrar.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="exp-fuente-tectonic"]',
      popover: {
        title: '2 · Sismos tectónicos',
        description:
          'Eventos de la Red Sismológica Nacional del SGC en Colombia y Ecuador.',
        side: 'bottom',
        align: 'start',
      },
    },
  ];

  if (canUpload) {
    steps.push({
      element: '[data-tour="exp-fuente-upload"]',
      popover: {
        title: '3 · Tu archivo MiniSEED',
        description:
          'Sube tu propio registro .mseed y el sistema lo procesa para explorarlo aquí.',
        side: 'bottom',
        align: 'end',
      },
    });
  }

  steps.push(
    {
      element: '[data-tour="exp-filtros"]',
      popover: {
        title: 'Filtra los eventos',
        description:
          'Busca por fecha o estación y ajusta el tipo, la región o la magnitud mínima.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="exp-lista"]',
      popover: {
        title: 'Lista de eventos',
        description:
          'Haz clic en un evento para ver su forma de onda real y cargarlo en el simulador.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="exp-mapa"]',
      popover: {
        title: 'Mapa',
        description:
          'Ubica los eventos geográficamente. También puedes seleccionarlos desde aquí.',
        side: 'left',
        align: 'start',
      },
    },
  );

  return steps;
}
