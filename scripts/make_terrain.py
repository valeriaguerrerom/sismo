"""
make_terrain.py — Genera los recursos de terreno del "Mapa 3D" de SismoNariño.

Dominio: lat 0.3 a 2.7 N, lon -79.6 a -76.6 W.

Salidas (en public/terrain/):
    - narino_heightmap.png   : mapa de altura en escala de grises (>= 1024x1024).
    - narino_hillshade.png   : sombreado de relieve (azimut 315, altitud 45)
                               con tinte de elevación (azul mar, verdes bajos, ocres altos).
    - narino_coast.json      : polilíneas de costa en [lon, lat].
    - narino_border.json     : polilíneas de límite departamental en [lon, lat].

Fuentes de datos:
    - Relieve: SRTM 90 m (CGIAR-CSI SRTM v4.1) o 30 m (SRTMGL1) vía la librería
      `elevation` o descarga directa. En zonas sin conexión, ver la sección
      "MODO OFFLINE" al final.
    - Costa y límites: Natural Earth (dominio público) — capas
      ne_10m_coastline y ne_10m_admin_1_states_provinces.

Requisitos (añádelos a requirements si vas a ejecutarlo):
    pip install numpy pillow elevation rasterio matplotlib requests

Uso:
    cd scripts
    py make_terrain.py                # intenta descargar todo
    py make_terrain.py --no-download  # solo regenera desde un GeoTIFF local srtm.tif

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import json
import sys
from pathlib import Path

import numpy as np

# Dominio del Mapa 3D (debe coincidir con backend/core/geo.py y frontend domain.ts)
LAT_MIN, LAT_MAX = 0.3, 2.7
LON_MIN, LON_MAX = -79.6, -76.6

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "terrain"
SRTM_TIF = Path(__file__).resolve().parent / "srtm_narino.tif"

TARGET_PX = 1024  # resolución mínima de salida


def download_srtm() -> "np.ndarray | None":
    """Descarga el SRTM del dominio y devuelve la matriz de elevación (m).

    Intenta con la librería `elevation` (SRTM 30 m). Si no está o falla,
    devuelve None y se debe usar el GeoTIFF local o el modo offline.

    Returns:
        Array 2D de elevaciones (norte arriba) o None si no se pudo descargar.
    """
    try:
        import elevation
        import rasterio
    except ImportError:
        print("[make_terrain] Falta 'elevation'/'rasterio'. "
              "Instala: pip install elevation rasterio")
        return None
    try:
        print("[make_terrain] Descargando SRTM (puede tardar)...")
        elevation.clip(bounds=(LON_MIN, LAT_MIN, LON_MAX, LAT_MAX), output=str(SRTM_TIF))
        with rasterio.open(SRTM_TIF) as ds:
            dem = ds.read(1).astype(np.float32)
        return dem
    except Exception as e:
        print(f"[make_terrain] Descarga SRTM falló: {e}")
        return None


def download_terrarium(zoom: int = 8) -> "np.ndarray | None":
    """Descarga elevación desde teselas Terrarium (AWS terrain-tiles, abierto).

    No tiene el límite de tiles de la librería `elevation`. Decodifica el DEM
    con la fórmula Terrarium: elev = (R*256 + G + B/256) - 32768.

    Args:
        zoom: Nivel de zoom de teselas (8 ≈ 600 m/px, suficiente para el bloque).

    Returns:
        Matriz de elevación (norte arriba) o None si falla.
    """
    try:
        import requests
        from PIL import Image
        import io
    except ImportError:
        return None

    def deg2tile(lat, lon, z):
        import math
        n = 2 ** z
        x = int((lon + 180.0) / 360.0 * n)
        latr = math.radians(lat)
        y = int((1.0 - math.log(math.tan(latr) + 1 / math.cos(latr)) / math.pi) / 2.0 * n)
        return x, y

    x0, y1 = deg2tile(LAT_MAX, LON_MIN, zoom)  # esquina NO
    x1, y0 = deg2tile(LAT_MIN, LON_MAX, zoom)  # esquina SE
    xs = range(min(x0, x1), max(x0, x1) + 1)
    ys = range(min(y0, y1), max(y0, y1) + 1)
    tile = 256
    mosaic = np.zeros((len(list(ys)) * tile, len(list(xs)) * tile), dtype=np.float32)
    print(f"[make_terrain] Terrarium z{zoom}: {len(list(xs))}x{len(list(ys))} teselas...")
    try:
        for iy, ty in enumerate(ys):
            for ix, tx in enumerate(xs):
                url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zoom}/{tx}/{ty}.png"
                r = requests.get(url, timeout=30)
                r.raise_for_status()
                arr = np.asarray(Image.open(io.BytesIO(r.content)).convert("RGB"), dtype=np.float32)
                elev = (arr[..., 0] * 256 + arr[..., 1] + arr[..., 2] / 256) - 32768
                mosaic[iy * tile:(iy + 1) * tile, ix * tile:(ix + 1) * tile] = elev
        return mosaic
    except Exception as e:
        print(f"[make_terrain] Terrarium falló: {e}")
        return None


def load_local_tif() -> "np.ndarray | None":
    """Carga un GeoTIFF SRTM local (scripts/srtm_narino.tif) si existe.

    Returns:
        Array 2D de elevaciones o None.
    """
    if not SRTM_TIF.exists():
        return None
    try:
        import rasterio
        with rasterio.open(SRTM_TIF) as ds:
            return ds.read(1).astype(np.float32)
    except Exception as e:
        print(f"[make_terrain] No se pudo leer {SRTM_TIF}: {e}")
        return None


def resample(dem: np.ndarray, size: int) -> np.ndarray:
    """Remuestrea la matriz a size×size con interpolación por vecinos/bilineal.

    Args:
        dem: Matriz de elevación original.
        size: Lado de salida en píxeles.

    Returns:
        Matriz size×size.
    """
    from PIL import Image
    # Normalizar NaN/no-data a mínimo válido
    dem = np.nan_to_num(dem, nan=np.nanmin(dem[np.isfinite(dem)]) if np.isfinite(dem).any() else 0)
    img = Image.fromarray(dem)
    img = img.resize((size, size), Image.BILINEAR)
    return np.asarray(img, dtype=np.float32)


def save_heightmap(dem: np.ndarray) -> None:
    """Guarda el heightmap normalizado a 8 bits (0-255)."""
    from PIL import Image
    lo, hi = float(dem.min()), float(dem.max())
    norm = (dem - lo) / (hi - lo + 1e-9)
    img = (norm * 255).astype(np.uint8)
    Image.fromarray(img, mode="L").save(OUT_DIR / "narino_heightmap.png")
    print(f"[make_terrain] heightmap: elev {lo:.0f}–{hi:.0f} m")


def save_hillshade(dem: np.ndarray, azimuth=315, altitude=45) -> None:
    """Genera y guarda el sombreado de relieve con tinte de elevación.

    Args:
        dem: Matriz de elevación (m).
        azimuth: Azimut de la fuente de luz en grados.
        altitude: Altitud de la fuente de luz en grados.
    """
    from PIL import Image
    az = np.radians(360.0 - azimuth + 90.0)
    alt = np.radians(altitude)
    dy, dx = np.gradient(dem)
    slope = np.pi / 2 - np.arctan(np.sqrt(dx * dx + dy * dy))
    aspect = np.arctan2(-dx, dy)
    shade = (np.sin(alt) * np.sin(slope) +
             np.cos(alt) * np.cos(slope) * np.cos(az - aspect))
    shade = np.clip(shade, 0, 1)

    # Tinte por elevación: azul (mar ~0 m), verdes bajos, ocres altos
    lo, hi = float(dem.min()), float(dem.max())
    t = (dem - lo) / (hi - lo + 1e-9)
    rgb = np.zeros((*dem.shape, 3), dtype=np.float32)
    sea = dem < 5
    rgb[..., 0] = np.where(sea, 0.15, 0.30 + 0.55 * t)
    rgb[..., 1] = np.where(sea, 0.30, 0.45 + 0.20 * (1 - t))
    rgb[..., 2] = np.where(sea, 0.55, 0.25 + 0.05 * (1 - t))
    rgb *= shade[..., None]
    img = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(img, mode="RGB").save(OUT_DIR / "narino_hillshade.png")
    print("[make_terrain] hillshade generado (azimut 315, altitud 45)")


def download_vectors() -> None:
    """Descarga costa y límites de Natural Earth y recorta al dominio.

    Genera narino_coast.json y narino_border.json con polilíneas [lon, lat].
    Si falla la descarga, deja archivos vacíos y avisa.
    """
    coast = _fetch_ne_lines(
        "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson"
    )
    border = _fetch_ne_lines(
        "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces_lines.geojson"
    )
    (OUT_DIR / "narino_coast.json").write_text(json.dumps(coast), encoding="utf-8")
    (OUT_DIR / "narino_border.json").write_text(json.dumps(border), encoding="utf-8")
    print(f"[make_terrain] coast: {len(coast)} líneas, border: {len(border)} líneas")


def _fetch_ne_lines(url: str) -> list:
    """Descarga un GeoJSON de líneas y recorta segmentos al dominio.

    Args:
        url: URL del GeoJSON de Natural Earth.

    Returns:
        Lista de polilíneas; cada una es lista de [lon, lat] dentro del dominio.
    """
    try:
        import requests
        gj = requests.get(url, timeout=60).json()
    except Exception as e:
        print(f"[make_terrain] No se pudo descargar {url}: {e}")
        return []
    out = []
    for feat in gj.get("features", []):
        geom = feat.get("geometry") or {}
        lines = []
        if geom.get("type") == "LineString":
            lines = [geom["coordinates"]]
        elif geom.get("type") == "MultiLineString":
            lines = geom["coordinates"]
        for line in lines:
            seg = [[x, y] for x, y in line
                   if LON_MIN <= x <= LON_MAX and LAT_MIN <= y <= LAT_MAX]
            if len(seg) >= 2:
                out.append(seg)
    return out


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    no_download = "--no-download" in sys.argv

    dem = load_local_tif()
    if dem is None and not no_download:
        # Terrarium (AWS terrain-tiles) primero: sin límite de tiles.
        dem = download_terrarium(zoom=9)
        if dem is None:
            dem = download_srtm()

    if dem is not None:
        # Recortar batimetría oceánica a 0 m: el relieve de interés es terrestre.
        dem = np.maximum(dem, 0.0)

    if dem is None:
        print("\n[make_terrain] SIN DEM. No se generaron heightmap/hillshade.")
        print("  Opciones:")
        print("   1) Coloca un GeoTIFF SRTM del dominio en scripts/srtm_narino.tif y re-ejecuta con --no-download.")
        print("   2) Instala 'elevation' + 'rasterio' y ejecuta con conexión.")
    else:
        dem = resample(dem, TARGET_PX)
        save_heightmap(dem)
        save_hillshade(dem)

    download_vectors()
    print("\n[make_terrain] Listo. Revisa public/terrain/.")


if __name__ == "__main__":
    main()
