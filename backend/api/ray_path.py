"""
Router de trayectoria de rayos sísmicos (para el corte del Mapa 3D).

Endpoint:
    GET /api/ray-path — trayectoria del rayo P desde el hipocentro a una estación.

- Modo iasp91: usa obspy.taup.get_ray_paths para obtener la curva real del rayo
  P (profundidad vs distancia) en el modelo terrestre estándar.
- Modo homogeneous: el rayo es una recta; se devuelven los dos extremos.

Todo el cálculo se hace en Python. El frontend solo dibuja la polilínea.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from core import geo
from core.stations import get_station

router = APIRouter(tags=["Mapa 3D"])

_taup_model = None


def _get_taup():
    """Devuelve una instancia cacheada de TauPyModel('iasp91')."""
    global _taup_model
    if _taup_model is None:
        from obspy.taup import TauPyModel
        _taup_model = TauPyModel(model="iasp91")
    return _taup_model


class RayPoint(BaseModel):
    """Un punto de la trayectoria del rayo.

    Attributes:
        dist_km: Distancia horizontal desde el epicentro (km).
        depth_km: Profundidad (km, positiva hacia abajo).
    """
    dist_km: float
    depth_km: float


class RayPathResponse(BaseModel):
    """Trayectoria del rayo y metadatos.

    Attributes:
        modelo_usado: 'homogeneous' o 'iasp91'.
        fase: Nombre de la fase (p.ej. 'P') o 'recto' en homogéneo.
        station: Código de la estación destino.
        distancia_epicentral_km: Distancia epicentral a la estación.
        puntos: Polilínea (dist_km, depth_km) del hipocentro a la superficie.
    """
    modelo_usado: str
    fase: str
    station: str
    distancia_epicentral_km: float
    puntos: list[RayPoint]


@router.get("/api/ray-path", response_model=RayPathResponse,
            summary="Trayectoria del rayo P hacia una estación")
def ray_path(
    lat: float = Query(..., description="Latitud del epicentro"),
    lon: float = Query(..., description="Longitud del epicentro"),
    depth_km: float = Query(..., ge=0, description="Profundidad focal (km)"),
    station: str = Query(..., description="Código de la estación destino"),
    model: str = Query(default="homogeneous", description="homogeneous | iasp91"),
):
    """Calcula la trayectoria del rayo P desde el hipocentro a una estación.

    En modo homogéneo devuelve la recta hipocentro→estación (dos puntos).
    En modo iasp91 devuelve la curva real del rayo P vía obspy.taup.

    Args:
        lat, lon: Epicentro en grados.
        depth_km: Profundidad focal en km.
        station: Código de la estación destino.
        model: Modelo de tiempos ('homogeneous' | 'iasp91').

    Returns:
        RayPathResponse con la polilínea (dist_km, depth_km).

    Raises:
        HTTPException(404): Si la estación no existe.
        HTTPException(400): Si el modelo no es válido.
    """
    model = model.lower()
    if model not in ("homogeneous", "iasp91"):
        raise HTTPException(status_code=400, detail="model debe ser 'homogeneous' o 'iasp91'")

    st = get_station(station)
    if st is None:
        raise HTTPException(status_code=404, detail=f"Estación '{station}' no encontrada")

    d_epi = geo.haversine_km(lat, lon, st.latitude, st.longitude)

    if model == "homogeneous":
        # Rayo recto del hipocentro (dist 0, prof depth) a la estación (dist d_epi, prof 0).
        return RayPathResponse(
            modelo_usado="homogeneous", fase="recto", station=station,
            distancia_epicentral_km=round(d_epi, 3),
            puntos=[
                RayPoint(dist_km=0.0, depth_km=depth_km),
                RayPoint(dist_km=round(d_epi, 3), depth_km=0.0),
            ],
        )

    # iasp91: curva real del rayo P.
    model_taup = _get_taup()
    d_deg = geo.km_to_degrees(d_epi)
    arrivals = model_taup.get_ray_paths(
        source_depth_in_km=max(0.0, depth_km),
        distance_in_degree=max(1e-4, d_deg),
        phase_list=["P", "p"],
    )
    if not arrivals:
        # Sin fase P a esa distancia: cae a recta.
        return RayPathResponse(
            modelo_usado="iasp91", fase="recto (sin P)", station=station,
            distancia_epicentral_km=round(d_epi, 3),
            puntos=[
                RayPoint(dist_km=0.0, depth_km=depth_km),
                RayPoint(dist_km=round(d_epi, 3), depth_km=0.0),
            ],
        )

    arr = arrivals[0]
    path = arr.path  # array con campos 'depth' (km) y 'dist' (rad)
    pts: list[RayPoint] = []
    for row in path:
        depth = float(row["depth"])
        dist_rad = float(row["dist"])
        dist_km = dist_rad * geo.EARTH_RADIUS_KM
        pts.append(RayPoint(dist_km=round(dist_km, 3), depth_km=round(depth, 3)))

    return RayPathResponse(
        modelo_usado="iasp91", fase=arr.name, station=station,
        distancia_epicentral_km=round(d_epi, 3),
        puntos=pts,
    )
