"""
make_narino_polygon.py — Extrae el polígono del departamento de Nariño.

Descarga las provincias de Natural Earth (ne_10m_admin_1_states_provinces),
localiza Nariño y guarda su anillo exterior (el más grande) como
public/terrain/narino_polygon.json en formato [[lon, lat], ...].

Este polígono se usa para recortar el bloque 3D del Mapa 3D con la silueta
real del departamento (no el rectángulo del dominio).

Uso:
    cd scripts
    py make_narino_polygon.py

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import json
from pathlib import Path

import requests

OUT = Path(__file__).resolve().parent.parent / "public" / "terrain" / "narino_polygon.json"
URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"


def largest_ring(coords, geom_type):
    """Devuelve el anillo exterior más grande de un (Multi)Polygon."""
    rings = []
    if geom_type == "Polygon":
        rings = [coords[0]]
    elif geom_type == "MultiPolygon":
        rings = [poly[0] for poly in coords]

    def area(ring):
        s = 0.0
        for i in range(len(ring)):
            x1, y1 = ring[i]
            x2, y2 = ring[(i + 1) % len(ring)]
            s += x1 * y2 - x2 * y1
        return abs(s) / 2.0

    return max(rings, key=area) if rings else None


def main():
    print("[narino_polygon] Descargando provincias de Natural Earth...")
    gj = requests.get(URL, timeout=120).json()

    target = None
    for feat in gj.get("features", []):
        props = feat.get("properties", {})
        name = (props.get("name") or props.get("name_es") or props.get("woe_name") or "")
        admin = props.get("admin") or ""
        if "nari" in name.lower() and "colombia" in admin.lower():
            target = feat
            break
    # Respaldo: buscar solo por nombre si no matcheó admin.
    if target is None:
        for feat in gj.get("features", []):
            props = feat.get("properties", {})
            name = (props.get("name") or "")
            if "nari" in name.lower():
                target = feat
                break

    if target is None:
        raise SystemExit("[narino_polygon] No se encontró Nariño en el dataset.")

    geom = target["geometry"]
    ring = largest_ring(geom["coordinates"], geom["type"])
    if not ring:
        raise SystemExit("[narino_polygon] Geometría vacía.")

    # Redondear a 6 decimales para reducir tamaño.
    ring = [[round(x, 6), round(y, 6)] for x, y in ring]
    OUT.write_text(json.dumps(ring), encoding="utf-8")
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    print(f"[narino_polygon] Nariño: {len(ring)} puntos. "
          f"lon [{min(lons):.3f}, {max(lons):.3f}] lat [{min(lats):.3f}, {max(lats):.3f}]")
    print(f"[narino_polygon] Guardado en {OUT}")


if __name__ == "__main__":
    main()
