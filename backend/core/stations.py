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
    # Ubicación aproximada al casco urbano del municipio (dato público
    # verificable). No es la coordenada exacta del sensor, que vive en el
    # StationXML oficial del SGC (no accesible desde la red local).
    Station(code="CPOP2", name="Popayán, Cauca", latitude=2.4448, longitude=-76.6147,
            altitude_m=1738, approx=True,
            source="Ubicación aproximada: casco urbano de Popayán, Cauca (estación de la red CM del SGC)"),
    Station(code="PAS2", name="Pasto, Nariño", latitude=1.2136, longitude=-77.2811,
            altitude_m=2527, approx=True,
            source="Ubicación aproximada: casco urbano de Pasto, Nariño (estación de la red CM del SGC)"),
    # TUM3C es Tumaco (zona costera, ~nivel del mar). Se mantiene cerca de TUM.
    Station(code="TUM3C", name="Tumaco, Nariño", latitude=1.8060, longitude=-78.7640,
            altitude_m=5, approx=True,
            source="Ubicación aproximada: zona urbana costera de Tumaco, Nariño (estación de la red CM del SGC)"),
]


# ─────────────────────────────────────────────────────────────────────
# Estaciones ACEPTADAS para la carga de MiniSEED por investigadores.
# ─────────────────────────────────────────────────────────────────────
# La red del SGC opera bajo el código FDSN "CM". Las 7 estaciones del proyecto
# (en Nariño y el sur del Cauca — BBAC en Balboa y CPOP2 en Popayán son del
# Cauca) y la estación del Galeras (CUFP, OVSP) comparten esa red. La lista
# blanca se define por par RED.ESTACIÓN (p. ej. "CM.CUM") para no aceptar por
# accidente una estación homónima de otra red. Esta es la ÚNICA lista que hay
# que ampliar para admitir nuevas estaciones en la carga.
GALERAS_STATION_CODE = "CUFP"
NARINO_NETWORK = "CM"  # red FDSN del SGC (incluye CUFP del OVSP)

# Pares RED.ESTACIÓN aceptados.
ACCEPTED_NET_STA: tuple[str, ...] = tuple(
    [f"{NARINO_NETWORK}.{s.code}" for s in STATIONS]
    + [f"{NARINO_NETWORK}.{GALERAS_STATION_CODE}"]
)

# Solo los códigos de estación (para mensajes al usuario).
ACCEPTED_STATION_CODES: tuple[str, ...] = tuple(
    [s.code for s in STATIONS] + [GALERAS_STATION_CODE]
)


def is_accepted_station(code: str, network: str | None = None) -> bool:
    """True si la estación (y su red, si se da) hace parte de la red de Nariño.

    Args:
        code: Código FDSN de la estación (p. ej. 'CUM', 'CUFP').
        network: Código de red FDSN (p. ej. 'CM'). Si se omite, solo se valida
            el código de estación (compatibilidad); si se da, debe coincidir el
            par RED.ESTACIÓN.

    Returns:
        True si la estación (o el par red.estación) está en la lista blanca.
    """
    code_u = (code or "").upper()
    if network:
        return f"{network.upper()}.{code_u}" in {p.upper() for p in ACCEPTED_NET_STA}
    return code_u in {c.upper() for c in ACCEPTED_STATION_CODES}


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
