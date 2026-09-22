"""
Geometría sísmica — cálculos de distancia y proyección (NumPy).

Funciones para distancia epicentral (haversine), distancia hipocentral
(incluye profundidad focal), azimut, conversión a grados y proyección
equirectangular a coordenadas locales en kilómetros centradas en el dominio
de Nariño.

Dominio del "Mapa 3D":
    latitud   0.3  a  2.7  N
    longitud -79.6 a -76.6 W
    profundidad 0 a 200 km

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import math

import numpy as np

# Radio medio terrestre (km) — valor estándar IUGG.
EARTH_RADIUS_KM = 6371.0

# Kilómetros por grado de latitud (aprox. constante).
KM_PER_DEG = 111.195  # 2π·R / 360

# Centro del dominio de Nariño (para la proyección local).
DOMAIN = {
    "lat_min": 0.3, "lat_max": 2.7,
    "lon_min": -79.6, "lon_max": -76.6,
    "depth_min": 0.0, "depth_max": 200.0,
}
DOMAIN_CENTER_LAT = (DOMAIN["lat_min"] + DOMAIN["lat_max"]) / 2.0  # 1.5
DOMAIN_CENTER_LON = (DOMAIN["lon_min"] + DOMAIN["lon_max"]) / 2.0  # -78.1


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia de gran círculo entre dos puntos (fórmula de haversine).

    Args:
        lat1, lon1: Coordenadas del primer punto en grados decimales.
        lat2, lon2: Coordenadas del segundo punto en grados decimales.

    Returns:
        Distancia epicentral en kilómetros.
    """
    r1, r2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(r1) * math.cos(r2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def hypocentral_km(epicentral_km: float, depth_km: float) -> float:
    """Distancia hipocentral (3D) desde el foco hasta un punto en superficie.

    Combina la distancia epicentral (horizontal) con la profundidad focal
    mediante el teorema de Pitágoras, asumiendo receptor en superficie (z=0).

    Args:
        epicentral_km: Distancia epicentral horizontal en km.
        depth_km: Profundidad focal en km.

    Returns:
        Distancia hipocentral en km.
    """
    return math.sqrt(epicentral_km ** 2 + depth_km ** 2)


def azimuth_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Azimut inicial desde el punto 1 hacia el punto 2 (desde el norte, horario).

    Args:
        lat1, lon1: Origen (p.ej. epicentro) en grados.
        lat2, lon2: Destino (p.ej. estación) en grados.

    Returns:
        Azimut en grados [0, 360).
    """
    r1, r2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    x = math.sin(dlon) * math.cos(r2)
    y = math.cos(r1) * math.sin(r2) - math.sin(r1) * math.cos(r2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def km_to_degrees(distance_km: float) -> float:
    """Convierte una distancia en km a grados de arco (para modelos TauP).

    Args:
        distance_km: Distancia en kilómetros.

    Returns:
        Distancia en grados de arco.
    """
    return distance_km / KM_PER_DEG


def project_to_local_km(lat, lon,
                        center_lat: float = DOMAIN_CENTER_LAT,
                        center_lon: float = DOMAIN_CENTER_LON):
    """Proyección equirectangular a km locales centrada en el dominio.

    Aproxima el mapeo (lat, lon) → (x_km este, y_km norte) usando una
    proyección plana equirectangular. Válida para dominios pequeños como
    Nariño. Vectorizada: acepta escalares o arrays NumPy.

    Args:
        lat: Latitud(es) en grados.
        lon: Longitud(es) en grados.
        center_lat: Latitud del centro de proyección.
        center_lon: Longitud del centro de proyección.

    Returns:
        Tupla (x_km, y_km): este positivo, norte positivo. Mismo tipo que la entrada.
    """
    lat = np.asarray(lat, dtype=np.float64)
    lon = np.asarray(lon, dtype=np.float64)
    x_km = (lon - center_lon) * KM_PER_DEG * np.cos(math.radians(center_lat))
    y_km = (lat - center_lat) * KM_PER_DEG
    if x_km.ndim == 0:
        return float(x_km), float(y_km)
    return x_km, y_km
