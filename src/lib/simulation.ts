/**
 * Presets de parámetros del Simulador y utilidades de propiedades elásticas.
 *
 * El motor FDM real corre en el BACKEND (FastAPI, `backend/core/fdm.py`) y se
 * consume vía `POST /api/simulate/full` (ver `src/lib/api.ts`). Este módulo solo
 * aporta los valores por defecto/óptimos y el cálculo de Lamé para el panel; ya
 * no hay un motor FDM en el navegador.
 *
 * @module lib/simulation
 */
import { SimulationParams } from './types';

/**
 * Preset tectónico. dx = 22 m ⇒ ≈10.4 nodos/λ (sin advertencia de dispersión,
 * esquema de 2º orden). El bucle temporal del backend está compilado con Numba
 * (~5×), lo que permite un dominio amplio (~18×15 km) con geometría simétrica
 * (fuente y receptor a ±d/2 del centro): el PRIMER rebote de borde llega a
 * ~8.4 s, después de P + S + superficial, así que en medio homogéneo la señal
 * cae a la calma (no hay coda física). f0 = 3.5 Hz.
 *  · dt = 0.004 s < CFL (dx/(Vp·√2) ≈ 0.00444 s), Courant ≈ 0.90 (estable).
 *  · duración 8 s: termina ANTES del primer rebote de borde (S a ~8.4 s),
 *    dejando margen tras P (1.8 s), S (3.0 s) y superficial. Cómputo ~6 s.
 */
export function tectonicParams(): SimulationParams {
  const vp = 3500, vs = 2000, density = 2600;
  const mu = density * vs * vs;
  const lambda = density * vp * vp - 2 * mu;
  return { vp, vs, density, lambda, mu, sourceType: 'tectonic', magnitude: 5.0, depth: 5, epicenterLat: 1.2136, epicenterLon: -77.2811, duration: 8, dx: 22, dt: 0.004 };
}

/**
 * Preset volcánico (tipo Galeras). f0 = 2.0 Hz, Vs = 1700 ⇒ λ mayor; con dx = 30 m
 * son ≈11.3 nodos/λ (sin advertencia). Con Numba el dominio llega a ~24×21 km y
 * geometría simétrica: el primer rebote de borde llega a ~13 s, fuera de la
 * ventana útil (medio homogéneo: sin coda).
 *  · dt = 0.006 s < CFL (dx/(Vp·√2) ≈ 0.00707 s), estable.
 *  · Vp = 3000, Vs = 1700, ρ = 2500 y epicentro en el Galeras.
 *  · duración 13 s (cómputo ~6 s en el servidor, con ~80 fotogramas).
 */
export function volcanicParams(): SimulationParams {
  const vp = 3000, vs = 1700, density = 2500;
  const mu = density * vs * vs;
  const lambda = density * vp * vp - 2 * mu;
  return { vp, vs, density, lambda, mu, sourceType: 'volcanic', magnitude: 4.5, depth: 6, epicenterLat: 1.2216, epicenterLon: -77.3742, duration: 13, dx: 30, dt: 0.006 };
}

/** Preset óptimo según el tipo de fuente elegido. */
export function presetForSource(sourceType: SimulationParams['sourceType']): SimulationParams {
  return sourceType === 'volcanic' ? volcanicParams() : tectonicParams();
}

/** Valores predeterminados iniciales del simulador (fuente tectónica). */
export function defaultParams(): SimulationParams {
  return tectonicParams();
}

/** Parámetros de Lamé a partir de velocidades y densidad: μ = ρ·Vs², λ = ρ·Vp² − 2μ. */
export function computeLame(vp: number, vs: number, density: number) {
  const mu = density * vs * vs;
  const lambda = density * vp * vp - 2 * mu;
  return { lambda, mu };
}
