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

/**
 * Instancia de Driver.js actualmente activa. Solo puede haber UNA a la vez: si
 * se pide un tour nuevo (p. ej. el auto-tour y luego el botón de ayuda), se
 * destruye la anterior antes de crear la nueva. Así nunca quedan dos popovers
 * superpuestos ("pegados").
 */
let activeDriver: ReturnType<typeof driver> | null = null;

/**
 * Reposiciona el popover del tour activo sobre su elemento resaltado. Se usa
 * cuando la página cambia de tamaño por una acción del propio tour (p. ej.
 * abrir un acordeón, que crece y desplaza el elemento). Driver.js recalcula la
 * posición con `refresh()`, más fiable que disparar eventos `resize` sintéticos.
 */
export function refreshActiveTour(): void {
  if (activeDriver) {
    try { if (activeDriver.isActive()) activeDriver.refresh(); } catch { /* tour ya cerrado */ }
  }
}

/**
 * Lanza un tour con los pasos dados. Aplica el tema de la app, los botones en
 * español y un indicador de progreso "N de M". `onDone` se dispara tanto al
 * terminar como al omitir/cerrar, para persistir que ya se vio.
 */
export function startTour(steps: TourStep[], opts: StartTourOptions = {}): void {
  // Nunca dos tours a la vez: destruye el anterior si seguía activo.
  if (activeDriver) {
    try { activeDriver.destroy(); } catch { /* ya destruido */ }
    activeDriver = null;
  }
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
    // Sin animación de transición del popover: evita que al pasar de paso se
    // vean dos tarjetas superpuestas (el popover anterior "fantasma"). El
    // resaltado cambia al instante, limpio. smoothScroll también off para que
    // no arrastre el popover durante el scroll.
    animate: false,
    smoothScroll: false,
    overlayColor: '#1A1A2E',
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 12,
    allowClose: true,
    steps,
    // Tras resaltar cada paso, aseguramos que el elemento quede COMPLETAMENTE
    // visible dentro de su contenedor con scroll (las columnas de parámetros y
    // resultados tienen scroll interno). Driver.js hace scrollIntoView del
    // elemento, pero no siempre alcanza a mostrar una tarjeta larga que quedó
    // parcialmente bajo el borde; forzamos un scroll centrado y refrescamos el
    // popover para que "Siguiente" siempre apunte a la tarjeta bien encuadrada.
    onHighlighted: (element) => {
      if (!(element instanceof HTMLElement)) return;
      // Dos frames para que el acordeón que abrió el paso ya haya crecido.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try {
          element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } catch {
          element.scrollIntoView();
        }
        // Recolocar el popover sobre el elemento ya encuadrado.
        setTimeout(() => refreshActiveTour(), 320);
      }));
    },
    // Al terminar (botón Terminar en el último paso) o al destruir el tour.
    onDestroyed: () => { markDone(); if (activeDriver === d) activeDriver = null; },
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
  activeDriver = d;
  d.drive();
}
