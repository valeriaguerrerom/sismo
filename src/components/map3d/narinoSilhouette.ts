/**
 * Silueta (contorno exterior) del departamento de Nariño.
 *
 * Carga el polígono real del departamento desde `public/terrain/narino_polygon.json`
 * (anillo [lon, lat] extraído de Natural Earth por scripts/make_narino_polygon.py)
 * y lo entrega listo para recortar el bloque 3D del Mapa 3D con su forma real.
 *
 * @module map3d/narinoSilhouette
 */

type Pt = [number, number];

/** Área firmada (shoelace) de un anillo. Su signo indica la orientación. */
function signedArea(ring: Pt[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/**
 * Carga el anillo del departamento de Nariño en coordenadas [lon, lat].
 *
 * Normaliza la orientación a antihoraria (CCW) y elimina un posible punto de
 * cierre duplicado al final.
 *
 * @returns Anillo [lon,lat][] o null si no se pudo cargar.
 */
export async function loadNarinoRing(): Promise<Pt[] | null> {
  try {
    const r = await fetch('/terrain/narino_polygon.json');
    if (!r.ok) return null;
    const raw = (await r.json()) as number[][];
    if (!Array.isArray(raw) || raw.length < 4) return null;

    let ring: Pt[] = raw.map(p => [p[0], p[1]] as Pt);
    // Quitar el vértice de cierre duplicado (GeoJSON repite el primero al final).
    const first = ring[0], last = ring[ring.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) ring = ring.slice(0, -1);
    // Orientación CCW para consistencia con THREE.Shape.
    if (signedArea(ring) < 0) ring = ring.reverse();
    return ring;
  } catch {
    return null;
  }
}
