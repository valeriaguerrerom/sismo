"""
Mapeo geo → coordenadas de escena 3D del "Mapa 3D" (backend autoritativo).

REGLA TÉCNICA: todo cálculo numérico de la escena (conversión lat/lon/prof a
posiciones de escena Three.js, tamaño del bloque, exageración vertical, escalas,
niveles del eje de profundidad) se hace AQUÍ, en Python. El frontend solo
renderiza las posiciones que este módulo entrega.

El sistema de coordenadas de escena coincide con el que usaba el frontend
(`domain.ts`) para no romper la escena existente:
    - X = longitud (oeste→este), centrado en 0, ancho BLOCK_WIDTH.
    - Z = latitud (norte hacia −Z), profundidad-plano BLOCK_DEPTH_XY.
    - Y = profundidad del subsuelo (hacia abajo negativo), alto BLOCK_HEIGHT.

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import math

from core.geo import DOMAIN

# ── Tamaño del bloque en unidades de escena (coincide con domain.ts BLOCK) ──
BLOCK_WIDTH = 30.0    # eje X (longitud)
BLOCK_DEPTH_XY = 30.0  # eje Z (latitud)
BLOCK_HEIGHT = 12.0   # eje Y (profundidad del subsuelo, 0..depth_max)

# ── Relieve ──
TERRAIN_MAX_ELEV_M = 5724.0    # elevación máxima real del dominio (heightmap)
TERRAIN_EXAGGERATION = 1.8     # exageración vertical moderada (antes 2.5)
# Altura de escena para elevación normalizada [0,1].
TERRAIN_SCENE_HEIGHT = 2.2 * TERRAIN_EXAGGERATION

# ── Niveles del eje de profundidad (km) ──
DEPTH_LEVELS = [0, 15, 35, 60, 100, 150, 200]
MOHO_KM = 35

# ── Iluminación del hillshade (para que el frontend/leyenda sea consistente) ──
HILLSHADE_AZIMUTH_DEG = 315  # luz desde el noroeste
HILLSHADE_ALTITUDE_DEG = 45


def lon_to_x(lon: float) -> float:
    """Convierte longitud (grados) a X de escena, centrado en 0."""
    t = (lon - DOMAIN["lon_min"]) / (DOMAIN["lon_max"] - DOMAIN["lon_min"])
    return (t - 0.5) * BLOCK_WIDTH


def lat_to_z(lat: float) -> float:
    """Convierte latitud (grados) a Z de escena (norte hacia −Z)."""
    t = (lat - DOMAIN["lat_min"]) / (DOMAIN["lat_max"] - DOMAIN["lat_min"])
    return -(t - 0.5) * BLOCK_DEPTH_XY


def depth_to_y(depth_km: float) -> float:
    """Convierte profundidad (km) a Y de escena (negativo hacia abajo)."""
    t = depth_km / DOMAIN["depth_max"]
    return -t * BLOCK_HEIGHT


def domain_width_km() -> float:
    """Ancho aproximado del dominio en km (para barras de escala)."""
    from core.geo import KM_PER_DEG
    center_lat = (DOMAIN["lat_min"] + DOMAIN["lat_max"]) / 2.0
    return (DOMAIN["lon_max"] - DOMAIN["lon_min"]) * KM_PER_DEG * math.cos(math.radians(center_lat))


def domain_height_km() -> float:
    """Alto aproximado del dominio en km."""
    from core.geo import KM_PER_DEG
    return (DOMAIN["lat_max"] - DOMAIN["lat_min"]) * KM_PER_DEG


def km_to_scene_units(km: float) -> float:
    """Convierte una distancia horizontal en km a unidades de escena X."""
    return (km / domain_width_km()) * BLOCK_WIDTH


def scene_scale_bar(target_km: float = 50.0) -> dict:
    """Longitud en unidades de escena de una barra de escala de `target_km`."""
    return {"km": target_km, "scene_units": round(km_to_scene_units(target_km), 4)}
