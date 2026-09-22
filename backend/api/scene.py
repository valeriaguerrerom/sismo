"""
Router de geometría de escena del "Mapa 3D".

Entrega al frontend las posiciones de escena YA CALCULADAS (regla técnica: el
cálculo numérico vive en el backend). El frontend solo renderiza.

Endpoints:
    GET  /api/scene-geometry          — bloque, estaciones, eje de profundidad,
                                         Moho, barra de escala e iluminación.
    POST /api/scene-geometry/events   — posiciones de escena de hipocentros
                                         (tamaño por magnitud, color por profundidad).
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from core import scene
from core.geo import DOMAIN
from core.stations import get_stations

router = APIRouter(tags=["Mapa 3D"])


# ─────────────────────────── Modelos de salida ───────────────────────────

class ScenePoint(BaseModel):
    """Posición de escena (unidades Three.js)."""
    x: float
    y: float
    z: float


class SceneStation(BaseModel):
    """Estación con su posición de escena en superficie (sin relieve).

    La Y final la ajusta el frontend sumando la altura del relieve muestreada
    del heightmap; aquí se entrega la posición horizontal y un offset del marcador.
    """
    code: str
    name: str
    latitude: float
    longitude: float
    approx: bool
    source: str
    x: float
    z: float
    marker_offset_y: float = Field(..., description="Altura del cono sobre el relieve")


class DepthLevel(BaseModel):
    """Nivel del eje de profundidad."""
    km: int
    y: float
    is_moho: bool


class SceneBlock(BaseModel):
    """Dimensiones del bloque de escena."""
    width: float
    depth_xy: float
    height: float


class SceneGeometry(BaseModel):
    """Geometría estática de la escena del Mapa 3D."""
    block: SceneBlock
    terrain_scene_height: float
    terrain_exaggeration: float
    hillshade_azimuth_deg: int
    hillshade_altitude_deg: int
    domain: dict
    stations: list[SceneStation]
    depth_levels: list[DepthLevel]
    moho_km: int
    moho_y: float
    scale_bar: dict
    domain_width_km: float
    domain_height_km: float


@router.get("/api/scene-geometry", response_model=SceneGeometry,
            summary="Geometría de escena del Mapa 3D (posiciones calculadas)")
def scene_geometry():
    """Devuelve el bloque, estaciones, eje de profundidad, Moho y escala.

    Todas las posiciones vienen ya convertidas a unidades de escena Three.js.
    El frontend solo las coloca; no calcula proyecciones.

    Returns:
        SceneGeometry con posiciones listas para renderizar.
    """
    stations = [
        SceneStation(
            code=s.code, name=s.name, latitude=s.latitude, longitude=s.longitude,
            approx=s.approx, source=s.source,
            x=round(scene.lon_to_x(s.longitude), 5),
            z=round(scene.lat_to_z(s.latitude), 5),
            marker_offset_y=0.6,
        )
        for s in get_stations()
    ]

    depth_levels = [
        DepthLevel(km=km, y=round(scene.depth_to_y(km), 5), is_moho=(km == scene.MOHO_KM))
        for km in scene.DEPTH_LEVELS
    ]

    return SceneGeometry(
        block=SceneBlock(
            width=scene.BLOCK_WIDTH, depth_xy=scene.BLOCK_DEPTH_XY, height=scene.BLOCK_HEIGHT,
        ),
        terrain_scene_height=round(scene.TERRAIN_SCENE_HEIGHT, 5),
        terrain_exaggeration=scene.TERRAIN_EXAGGERATION,
        hillshade_azimuth_deg=scene.HILLSHADE_AZIMUTH_DEG,
        hillshade_altitude_deg=scene.HILLSHADE_ALTITUDE_DEG,
        domain=DOMAIN,
        stations=stations,
        depth_levels=depth_levels,
        moho_km=scene.MOHO_KM,
        moho_y=round(scene.depth_to_y(scene.MOHO_KM), 5),
        scale_bar=scene.scene_scale_bar(50.0),
        domain_width_km=round(scene.domain_width_km(), 2),
        domain_height_km=round(scene.domain_height_km(), 2),
    )


# ───────────────────────── Hipocentros (eventos) ─────────────────────────

class EventIn(BaseModel):
    """Evento de entrada para posicionar como hipocentro."""
    id: str
    lat: float
    lon: float
    depth_km: float | None = None
    magnitude: float | None = None
    event_type: str | None = None  # 'volcanic' | 'tectonic'
    label: str | None = None


class EventsRequest(BaseModel):
    """Lista de eventos a posicionar en la escena."""
    events: list[EventIn]


class SceneHypocenter(BaseModel):
    """Hipocentro con posición de escena, radio y color ya calculados."""
    id: str
    x: float
    y: float
    z: float
    surface_y: float = Field(..., description="Y de escena en superficie (prof=0)")
    depth_km: float
    magnitude: float
    radius: float = Field(..., description="Radio de la esfera (unidades de escena)")
    color: str = Field(..., description="Color hex según profundidad")
    label: str | None


class EventsResponse(BaseModel):
    """Hipocentros posicionados + rampa de color usada."""
    hypocenters: list[SceneHypocenter]
    depth_color_ramp: list[dict]


def _depth_color(depth_km: float) -> str:
    """Color por profundidad (someros cálidos → profundos fríos).

    Rangos aproximados: <30 km rojo, 30–70 naranja, 70–150 verde, >150 azul.
    """
    if depth_km < 30:
        return "#e5484d"   # rojo (superficial)
    if depth_km < 70:
        return "#f5a524"   # naranja
    if depth_km < 150:
        return "#2fbf71"   # verde
    return "#3b82f6"       # azul (profundo)


def _magnitude_radius(mag: float) -> float:
    """Radio de la esfera del hipocentro según la magnitud.

    Escala suave para que M2 y M8 se distingan sin dominar la escena.
    """
    m = max(0.0, mag)
    return round(0.18 + 0.16 * m, 4)  # M0≈0.18, M5≈0.98, M8≈1.46


@router.post("/api/scene-geometry/events", response_model=EventsResponse,
             summary="Posiciones de escena de hipocentros (tamaño/color calculados)")
def scene_events(req: EventsRequest):
    """Convierte eventos (lat/lon/prof/mag) en hipocentros de escena.

    El tamaño de la esfera codifica la magnitud y el color la profundidad,
    calculados aquí en el backend.

    Args:
        req: Lista de eventos con lat, lon, profundidad y magnitud.

    Returns:
        EventsResponse con esferas posicionadas y la rampa de color usada.
    """
    default_depth = {"volcanic": 5.0, "tectonic": 15.0}
    out: list[SceneHypocenter] = []
    for ev in req.events:
        depth = ev.depth_km
        if depth is None:
            depth = default_depth.get((ev.event_type or "").lower(), 15.0)
        mag = ev.magnitude if ev.magnitude is not None else 4.5
        out.append(SceneHypocenter(
            id=ev.id,
            x=round(scene.lon_to_x(ev.lon), 5),
            y=round(scene.depth_to_y(depth), 5),
            z=round(scene.lat_to_z(ev.lat), 5),
            surface_y=0.0,
            depth_km=round(depth, 2),
            magnitude=round(mag, 2),
            radius=_magnitude_radius(mag),
            color=_depth_color(depth),
            label=ev.label,
        ))

    ramp = [
        {"label": "< 30 km", "color": "#e5484d"},
        {"label": "30–70 km", "color": "#f5a524"},
        {"label": "70–150 km", "color": "#2fbf71"},
        {"label": "> 150 km", "color": "#3b82f6"},
    ]
    return EventsResponse(hypocenters=out, depth_color_ramp=ramp)
