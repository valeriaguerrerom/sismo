"""
Catálogo de estaciones sismológicas de la Red Sismológica Nacional (red CM)
usadas en el dominio de Nariño.

Fuente principal de coordenadas (5 de 7):
    Boletín Sismológico REDSW Vol. 5 N°1, OSSO Univalle, 2016, Tabla 1
    (datos RSNC/SGC).

Notas por estación:
    - TUM, CRU, CUM, BBAC: coordenadas del boletín citado.
    - CPOP2: asumida igual a la estación POP2 (Popayán) del mismo boletín.
    - PAS2, TUM3C: aproximadas por municipio (Pasto y Tumaco), pendientes de
      confirmación con el StationXML oficial del SGC. TUM3C lleva un
      desplazamiento documentado de ~2.5 km respecto a TUM para no compartir
      coordenada exacta hasta tener el dato real.

El servicio FDSN del SGC (sismo.sgc.gov.co) no es accesible desde la red local
y los MiniSEED no incluyen coordenadas; solo TUM está federada en EarthScope/IRIS.

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
from pydantic import BaseModel

_BOLETIN = "Boletín Sismológico REDSW Vol. 5 N°1, OSSO Univalle, 2016, Tabla 1 (datos RSNC/SGC)"


class Station(BaseModel):
    """Estación sismológica.

    Attributes:
        code: Código FDSN de la estación (p.ej. 'PAS2').
        name: Nombre descriptivo / municipio.
        latitude: Latitud en grados decimales.
        longitude: Longitud en grados decimales.
        altitude_m: Altitud en metros sobre el nivel del mar. None si no disponible.
        approx: True si la ubicación es aproximada (no oficial confirmada).
        source: Fuente/procedencia de la coordenada (se muestra en el tooltip).
    """
    code: str
    name: str
    latitude: float
    longitude: float
    altitude_m: float | None
    approx: bool
    source: str


# Las 7 estaciones presentes en los datos de la red CM (Colombia + Ecuador).
STATIONS: list[Station] = [
    Station(code="TUM", name="Tumaco, Nariño", latitude=1.840, longitude=-78.730,
            altitude_m=50, approx=False, source=_BOLETIN),
    Station(code="CRU", name="La Cruz, Nariño", latitude=1.570, longitude=-76.950,
            altitude_m=2761, approx=False, source=_BOLETIN),
    Station(code="CUM", name="Cumbal, Nariño", latitude=0.860, longitude=-77.840,
            altitude_m=3420, approx=False, source=_BOLETIN),
    Station(code="BBAC", name="Balboa, Cauca", latitude=2.021, longitude=-77.248,
            altitude_m=1723, approx=False, source=_BOLETIN),
    Station(code="CPOP2", name="Popayán, Cauca", latitude=2.540, longitude=-76.680,
            altitude_m=1869, approx=False,
            source=_BOLETIN + " — asumida igual a POP2 (Popayán)"),
    # Aproximadas por municipio, pendientes de confirmación SGC.
    Station(code="PAS2", name="Pasto, Nariño", latitude=1.2136, longitude=-77.2811,
            altitude_m=None, approx=True,
            source="Aproximada por municipio (Pasto), pendiente confirmación SGC"),
    # TUM3C es Tumaco; se desplaza ~2.5 km al NE de TUM para no compartir coordenada.
    Station(code="TUM3C", name="Tumaco, Nariño", latitude=1.8620, longitude=-78.7100,
            altitude_m=None, approx=True,
            source="Aproximada por municipio (Tumaco), desplazada ~2.5 km de TUM; pendiente confirmación SGC"),
]


def get_stations() -> list[Station]:
    """Devuelve la lista de estaciones del dominio de Nariño.

    Returns:
        Lista de objetos Station.
    """
    return STATIONS


def get_station(code: str) -> Station | None:
    """Busca una estación por su código.

    Args:
        code: Código FDSN de la estación.

    Returns:
        La estación si existe, None en caso contrario.
    """
    for s in STATIONS:
        if s.code == code:
            return s
    return None
