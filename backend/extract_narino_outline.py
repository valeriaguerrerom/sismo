"""
Extrae el polígono cerrado del departamento de Nariño desde el GeoJSON público
de Colombia (john-guerra, dominio público) y lo simplifica a un contorno ligero
para el mini mapa del Home. Guarda public/terrain/narino_outline.json como una
lista de anillos [[ [lon,lat], ... ], ...] (el primero es el continental).
"""
import json
import os
import tempfile
from pathlib import Path

SRC = Path(tempfile.gettempdir()) / "colombia.geo.json"
OUT = Path(__file__).resolve().parent.parent / "public" / "terrain" / "narino_outline.json"


def rdp(points, eps):
    """Simplificación Ramer-Douglas-Peucker de una polilínea."""
    if len(points) < 3:
        return points

    def dist(p, a, b):
        (x, y), (x1, y1), (x2, y2) = p, a, b
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
        t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
        t = max(0, min(1, t))
        px, py = x1 + t * dx, y1 + t * dy
        return ((x - px) ** 2 + (y - py) ** 2) ** 0.5

    dmax, idx = 0, 0
    for i in range(1, len(points) - 1):
        d = dist(points[i], points[0], points[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        left = rdp(points[: idx + 1], eps)
        right = rdp(points[idx:], eps)
        return left[:-1] + right
    return [points[0], points[-1]]


def main() -> None:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    feat = None
    for f in data["features"]:
        name = (f.get("properties") or {}).get("NOMBRE_DPT") or (f.get("properties") or {}).get("name") or ""
        if "NARI" in str(name).upper():
            feat = f
            break
    if feat is None:
        # imprime nombres disponibles para depurar
        names = [(f.get("properties") or {}) for f in data["features"][:3]]
        raise SystemExit(f"Nariño no encontrado. Ejemplo props: {names}")

    geom = feat["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]

    # Toma el anillo exterior más grande (masa continental) y lo simplifica.
    rings = []
    for poly in polys:
        outer = poly[0]
        rings.append(outer)
    rings.sort(key=len, reverse=True)
    main_ring = rings[0]

    simplified = rdp([list(p) for p in main_ring], eps=0.01)
    if simplified[0] != simplified[-1]:
        simplified.append(simplified[0])  # cerrar el anillo
    simplified = [[round(x, 4), round(y, 4)] for x, y in simplified]

    OUT.write_text(json.dumps([simplified]), encoding="utf-8")
    lons = [p[0] for p in simplified]
    lats = [p[1] for p in simplified]
    print(f"puntos simplificados: {len(simplified)}")
    print(f"lon {min(lons):.3f}..{max(lons):.3f}  lat {min(lats):.3f}..{max(lats):.3f}")
    print(f"escrito {OUT}")


if __name__ == "__main__":
    main()
