/**
 * Dominio geográfico y mapeo a coordenadas de escena 3D del "Mapa 3D".
 *
 * IMPORTANTE: aquí NO hay física. Solo se convierte (lat, lon, profundidad)
 * a coordenadas de la escena Three.js para dibujar. Todo cálculo sísmico
 * (distancias reales, tiempos, ondas) lo hace el backend.
 *
 * @module map3d/domain
 */

/** Límites del dominio de Nariño (coinciden con backend/core/geo.py DOMAIN). */
export const DOMAIN = {
  latMin: 0.3,
  latMax: 2.7,
  lonMin: -79.6,
  lonMax: -76.6,
  depthMin: 0,
  depthMax: 200, // km
};

/** Tamaño del bloque en unidades de escena. */
export const BLOCK = {
  width: 30, // eje X (longitud)
  depthXY: 30, // eje Z de la escena (latitud)
  height: 12, // eje Y (profundidad del subsuelo)
};

/** Kilómetros por grado de latitud (para escalar distancias del backend). */
export const KM_PER_DEG = 111.195;

/** Elevación máxima real del dominio (m) y exageración vertical del relieve. */
export const TERRAIN_MAX_ELEV_M = 5724; // ~Galeras/nevados (del heightmap generado)
export const TERRAIN_EXAGGERATION = 2.5;
/** Altura del relieve en unidades de escena para elevación normalizada [0,1]. */
export const TERRAIN_SCENE_HEIGHT = 2.2 * TERRAIN_EXAGGERATION;

/** Marcas de profundidad (km) para las capas geológicas del corte. */
export const DEPTH_LAYERS = [0, 15, 35, 60, 100, 150, 200];

/** Ancho del dominio en km (aprox), para convertir km→unidades de escena. */
export const DOMAIN_WIDTH_KM = (DOMAIN.lonMax - DOMAIN.lonMin) * KM_PER_DEG * Math.cos((1.5 * Math.PI) / 180);
export const DOMAIN_HEIGHT_KM = (DOMAIN.latMax - DOMAIN.latMin) * KM_PER_DEG;

/**
 * Convierte longitud a coordenada X de escena, centrada en 0.
 * @param lon Longitud en grados.
 */
export function lonToX(lon: number): number {
  const t = (lon - DOMAIN.lonMin) / (DOMAIN.lonMax - DOMAIN.lonMin);
  return (t - 0.5) * BLOCK.width;
}

/**
 * Convierte latitud a coordenada Z de escena, centrada en 0.
 * En Three.js Z apunta hacia el observador; usamos -Z para que el norte
 * quede "hacia atrás".
 * @param lat Latitud en grados.
 */
export function latToZ(lat: number): number {
  const t = (lat - DOMAIN.latMin) / (DOMAIN.latMax - DOMAIN.latMin);
  return -(t - 0.5) * BLOCK.depthXY;
}

/**
 * Convierte profundidad (km) a coordenada Y de escena (negativa hacia abajo).
 * @param depthKm Profundidad en kilómetros.
 */
export function depthToY(depthKm: number): number {
  const t = depthKm / DOMAIN.depthMax;
  return -t * BLOCK.height;
}

/**
 * Convierte una distancia horizontal en km a unidades de escena.
 * @param km Distancia en kilómetros.
 */
export function kmToSceneUnits(km: number): number {
  return (km / DOMAIN_WIDTH_KM) * BLOCK.width;
}
