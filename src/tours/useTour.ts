/**
 * Utilidad común para lanzar tours guiados con Driver.js, con el estilo y los
 * textos en español de SismoNariño. Cada módulo define solo su archivo de
 * pasos (p. ej. src/tours/simulacion.ts) y usa `startTour(steps, opts)`.
 *
 * Añadir el tour de otra página después es solo crear su archivo de pasos y
 * llamar a `startTour` con ellos; no hace falta tocar esta utilidad.
 * @module tours/useTour
 */
import { driver, type DriveStep, type Config } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour.css';

/** Un paso del tour. Reutiliza el tipo de Driver.js. */
export type TourStep = DriveStep;

export interface StartTourOptions {
  /** Se llama cuando el tour termina o se omite (para marcarlo como visto). */
  onDone?: () => void;
}

/** True si el usuario prefiere movimiento reducido. */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Lanza un tour con los pasos dados. Aplica el tema de la app, los botones en
 * español y un indicador de progreso "N de M". `onDone` se dispara tanto al
 * terminar como al omitir/cerrar, para persistir que ya se vio.
 */
export function startTour(steps: TourStep[], opts: StartTourOptions = {}): void {
  const reduced = prefersReducedMotion();
  let done = false;
  const markDone = () => { if (!done) { done = true; opts.onDone?.(); } };

  const config: Config = {
    showProgress: true,
    // Indicador de progreso en español: "2 de 5".
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Siguiente',
    prevBtnText: 'Anterior',
    doneBtnText: 'Terminar',
    popoverClass: 'sismo-tour',
    // Animaciones suaves; se desactivan con prefers-reduced-motion.
    animate: !reduced,
    smoothScroll: !reduced,
    overlayColor: '#1A1A2E',
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 12,
    allowClose: true,
    steps,
    // Al terminar (botón Terminar en el último paso) o al destruir el tour.
    onDestroyed: () => { markDone(); },
    // Botón "Omitir" (enlace discreto) inyectado en el pie del popover.
    onPopoverRender: (popover, { config: cfg, state }) => {
      const total = (cfg.steps?.length ?? 0);
      const idx = state.activeIndex ?? 0;
      // No mostrar "Omitir" en el último paso (ahí el botón es "Terminar").
      if (idx >= total - 1) return;
      const skip = document.createElement('button');
      skip.className = 'sismo-skip-btn';
      skip.innerText = 'Omitir';
      skip.addEventListener('click', () => { markDone(); d.destroy(); });
      // Se inserta al inicio del pie, antes del progreso y los botones nav.
      popover.footer?.insertBefore(skip, popover.footer.firstChild);
    },
  };

  const d = driver(config);
  d.drive();
}
