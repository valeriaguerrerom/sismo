"""
Router de estaciones y tiempos de viaje.

Endpoints:
    GET  /api/stations       — catálogo de estaciones de Nariño
    POST /api/travel-times   — tiempos de llegada P y S por estación

Modo 'homogeneous': medio de velocidad constante, tP = d_hipocentral / vp.
Modo 'iasp91': modelo terrestre estándar vía obspy.taup.
Todo el cálculo se hace en Python (core/geo.py + obspy).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core import geo
from core.stations import get_stations

router = APIRouter(tags=["Mapa 3D"])

# El modelo TauP es costoso de instanciar: se cachea perezosamente.
_taup_model = None


def _get_taup():
    """Devuelve una instancia cacheada de TauPyModel('iasp91').

    Returns:
        obspy.taup.TauPyModel para el modelo iasp91.
    """
    global _taup_model
    if _taup_model is None:
        from obspy.taup import TauPyModel
        _taup_model = TauPyModel(model="iasp91")
    return _taup_model


class TravelTimeRequest(BaseModel):
    """Entrada para el cálculo de tiempos de viaje.

    Attributes:
        lat: Latitud del epicentro (grados).
        lon: Longitud del epicentro (grados).
        depth_km: Profundidad focal (km).
        vp_km_s: Velocidad P para el modo homogéneo (km/s).
        vs_km_s: Velocidad S para el modo homogéneo (km/s).
        model: 'homogeneous' o 'iasp91'.
    """
    lat: float = Field(..., description="Latitud del epicentro")
    lon: float = Field(..., description="Longitud del epicentro")
    depth_km: float = Field(..., ge=0, description="Profundidad focal (km)")
    vp_km_s: float = Field(default=6.0, gt=0, description="Vp para modo homogéneo (km/s)")
    vs_km_s: float = Field(default=3.5, gt=0, description="Vs para modo homogéneo (km/s)")
    model: str = Field(default="homogeneous", description="homogeneous | iasp91")


class StationTravelTime(BaseModel):
    """Tiempos de viaje calculados para una estación.

    Attributes:
        code: Código de la estación.
        name: Nombre / municipio.
        latitude, longitude: Coordenadas de la estación.
        approx: True si la ubicación es aproximada.
        distancia_epicentral_km: Distancia horizontal epicentro→estación.
        distancia_hipocentral_km: Distancia 3D foco→estación.
        distancia_grados: Distancia epicentral en grados de arco.
        azimut: Azimut epicentro→estación (grados, desde el norte).
        tP: Tiempo de llegada de la onda P (s).
        tS: Tiempo de llegada de la onda S (s).
        tS_menos_tP: Diferencia S−P (s).
    """
    code: str
    name: str
    latitude: float
    longitude: float
    approx: bool
    distancia_epicentral_km: float
    distancia_hipocentral_km: float
    distancia_grados: float
    azimut: float
    tP: float | None
    tS: float | None
    tS_menos_tP: float | None


class TravelTimeResponse(BaseModel):
    """Respuesta con los tiempos por estación y el modelo usado."""
    model_config = {"protected_namespaces": ()}

    modelo_usado: str
    estaciones: list[StationTravelTime]


@router.get("/api/stations", summary="Estaciones sismológicas de Nariño")
def stations():
    """Devuelve el catálogo de las 7 estaciones del dominio de Nariño.

    Returns:
        dict: { estaciones: [...] } con código, nombre, lat, lon, altitud y flag approx.
    """
    return {"estaciones": [s.model_dump() for s in get_stations()]}


def _iasp91_times(depth_km: float, dist_deg: float) -> tuple[float | None, float | None]:
    """Obtiene los primeros arribos P y S con el modelo iasp91.

    Args:
        depth_km: Profundidad focal en km.
        dist_deg: Distancia epicentral en grados.

    Returns:
        Tupla (tP, tS); cada valor puede ser None si no hay fase.
    """
    model = _get_taup()
    arrivals = model.get_travel_times(
        source_depth_in_km=max(0.0, depth_km),
        distance_in_degree=dist_deg,
        phase_list=["P", "S", "p", "s"],
    )
    tP = tS = None
    for arr in arrivals:
        name = arr.name.lower()
        if name in ("p",) and tP is None:
            tP = float(arr.time)
        elif name in ("s",) and tS is None:
            tS = float(arr.time)
    return tP, tS


@router.post("/api/travel-times", response_model=TravelTimeResponse,
             summary="Tiempos de viaje P/S por estación")
def travel_times(req: TravelTimeRequest):
    """Calcula los tiempos de llegada P y S a cada estación.

    - homogeneous: tP = d_hipocentral / vp, tS = d_hipocentral / vs.
    - iasp91: usa obspy.taup con el primer arribo de cada tipo.

    Args:
        req: Epicentro, profundidad, velocidades y modelo.

    Returns:
        TravelTimeResponse con una entrada por estación, ordenada por
        distancia epicentral ascendente.

    Raises:
        HTTPException(400): Si el modelo no es reconocido.
    """
    model = req.model.lower()
    if model not in ("homogeneous", "iasp91"):
        raise HTTPException(status_code=400, detail="model debe ser 'homogeneous' o 'iasp91'")

    results: list[StationTravelTime] = []

    for st in get_stations():
        d_epi = geo.haversine_km(req.lat, req.lon, st.latitude, st.longitude)
        d_hypo = geo.hypocentral_km(d_epi, req.depth_km)
        d_deg = geo.km_to_degrees(d_epi)
        az = geo.azimuth_deg(req.lat, req.lon, st.latitude, st.longitude)

        if model == "homogeneous":
            tP = d_hypo / req.vp_km_s
            tS = d_hypo / req.vs_km_s
        else:
            tP, tS = _iasp91_times(req.depth_km, d_deg)

        ts_minus_tp = (tS - tP) if (tP is not None and tS is not None) else None

        results.append(StationTravelTime(
            code=st.code, name=st.name,
            latitude=st.latitude, longitude=st.longitude, approx=st.approx,
            distancia_epicentral_km=round(d_epi, 3),
            distancia_hipocentral_km=round(d_hypo, 3),
            distancia_grados=round(d_deg, 5),
            azimut=round(az, 2),
            tP=round(tP, 4) if tP is not None else None,
            tS=round(tS, 4) if tS is not None else None,
            tS_menos_tP=round(ts_minus_tp, 4) if ts_minus_tp is not None else None,
        ))

    results.sort(key=lambda r: r.distancia_epicentral_km)
    return TravelTimeResponse(modelo_usado=model, estaciones=results)
