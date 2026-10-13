"""
Sprint 9 — HU025: carga de archivos MiniSEED por investigadores.

Casos CPR-025-1 .. CPR-025-6 (pytest). Se prueba la lógica del endpoint de
carga (`backend/api/mseed_upload.py`): el procesamiento en memoria de un
MiniSEED con ObsPy (`process_mseed_bytes`), la lista blanca de estaciones de la
red de Nariño, el rechazo de archivos de otra red, de registros incompletos y
de archivos ilegibles, y el manejo de componentes 1/2 (horizontales sin azimut).

Los MiniSEED se sintetizan en memoria con ObsPy (no se tocan archivos reales),
de modo que cada caso controla exactamente la red, la estación y los canales.
"""
import io

import numpy as np
import pytest
from fastapi import HTTPException
from obspy import Stream, Trace, UTCDateTime

from api.mseed_upload import process_mseed_bytes
from core.stations import ACCEPTED_STATION_CODES, is_accepted_station


# ─────────────────────── utilidades de construcción ───────────────────────

def _trace(network: str, station: str, channel: str, fs: float = 100.0,
           npts: int = 2000, seed: int = 0) -> Trace:
    """Crea una traza sintética con ruido + un pulso, para una (red, estación, canal)."""
    rng = np.random.default_rng(seed)
    data = rng.standard_normal(npts).astype(np.float32) * 0.1
    # Un pulso para que haya una "llegada" detectable (no es imprescindible).
    data[npts // 3: npts // 3 + 20] += 1.0
    tr = Trace(data=data)
    tr.stats.network = network
    tr.stats.station = station
    tr.stats.channel = channel
    tr.stats.sampling_rate = fs
    tr.stats.starttime = UTCDateTime("2023-01-01T00:00:00")
    return tr


def _mseed_bytes(network: str, station: str, channels: list[str], fs: float = 100.0) -> bytes:
    """Serializa a MiniSEED una estación con los canales dados."""
    st = Stream(traces=[_trace(network, station, ch, fs=fs, seed=i)
                        for i, ch in enumerate(channels)])
    buf = io.BytesIO()
    st.write(buf, format="MSEED")
    return buf.getvalue()


# ───────────────────────────── CPR-025-1 ─────────────────────────────
# Consultar el tutorial / descargar ejemplo: el sistema expone las estaciones
# aceptadas y dos archivos de ejemplo (tectónico y volcánico) para descargar.
def test_consultar_tutorial_descargar_ejemplo():
    # Las estaciones aceptadas incluyen la red de Nariño (CUM, PAS2, TUM...) y la
    # del Galeras (CUFP). Son las que el tutorial muestra como válidas.
    assert "CUM" in ACCEPTED_STATION_CODES      # tectónica (SGC)
    assert "CUFP" in ACCEPTED_STATION_CODES     # volcánica (Galeras, OVSP)
    assert len(ACCEPTED_STATION_CODES) >= 7

    # Hay dos tipos de ejemplo descargables: tectónico y volcánico.
    from api.mseed_upload import EXAMPLE_MSEED
    assert set(EXAMPLE_MSEED.keys()) == {"tectonico", "volcanico"}
    # Cada entrada apunta a un nombre de archivo .mseed.
    for _kind, (_path, filename) in EXAMPLE_MSEED.items():
        assert filename.endswith(".mseed")


# ───────────────────────────── CPR-025-2 ─────────────────────────────
# Cargar un archivo válido (estación aceptada, tres componentes): se procesa y
# devuelve el sismograma triaxial con el canal usado y el tipo de sensor.
def test_cargar_archivo_ejemplo():
    data = _mseed_bytes("CM", "CUM", ["HHN", "HHE", "HHZ"])
    res = process_mseed_bytes(data, "ejemplo_CUM.mseed")

    assert res.station == "CUM"
    assert res.network == "CM"
    # Las tres componentes salen pobladas y del mismo largo.
    assert len(res.waveData.north) > 0
    assert len(res.waveData.north) == len(res.waveData.east) == len(res.waveData.vertical)
    # Reporta el canal usado por componente y el tipo de sensor (velocímetro HH).
    assert set(res.channels.keys()) == {"N", "E", "Z"}
    assert res.channels["Z"] == "HHZ"
    assert res.sensor_kind == "velocimetro"
    # Horizontales como N/E (orientación confirmada).
    assert res.orientation_confirmed is True
    assert res.horizontal_labels == {"north": "Norte (N)", "east": "Este (E)"}


# ───────────────────────────── CPR-025-3 ─────────────────────────────
# Cargar un archivo de OTRA red (estación fuera del proyecto): se rechaza (422)
# e informa cuáles son las estaciones aceptadas.
def test_cargar_archivo_otra_red():
    # Estación 'XYZ' de una red cualquiera: no está en la lista blanca.
    assert not is_accepted_station("XYZ", "IU")
    data = _mseed_bytes("IU", "XYZ", ["HHN", "HHE", "HHZ"])

    with pytest.raises(HTTPException) as exc:
        process_mseed_bytes(data, "otra_red.mseed")
    assert exc.value.status_code == 422
    # El mensaje nombra la estación rechazada y lista las aceptadas.
    assert "XYZ" in exc.value.detail
    assert "CUM" in exc.value.detail  # aparece en la lista de aceptadas


# ───────────────────────────── CPR-025-4 ─────────────────────────────
# Cargar un archivo con solo DOS componentes: se rechaza (422) indicando la
# componente que falta.
def test_cargar_archivo_dos_componentes():
    # Estación aceptada (CUM) pero sin la vertical.
    data = _mseed_bytes("CM", "CUM", ["HHN", "HHE"])

    with pytest.raises(HTTPException) as exc:
        process_mseed_bytes(data, "dos_componentes.mseed")
    assert exc.value.status_code == 422
    # El mensaje indica que falta la componente vertical.
    assert "Vertical" in exc.value.detail
    assert "tres componentes" in exc.value.detail


# ───────────────────────────── CPR-025-5 ─────────────────────────────
# Cargar un archivo inválido (no es MiniSEED): se rechaza con un mensaje claro.
def test_cargar_archivo_invalido():
    data = b"esto no es un archivo mseed, solo texto plano"

    with pytest.raises(ValueError) as exc:
        process_mseed_bytes(data, "basura.txt")
    # El mensaje explica que no se pudo leer como MiniSEED.
    assert "MiniSEED" in str(exc.value)


# ───────────────────────────── CPR-025-6 ─────────────────────────────
# Cargar un archivo con componentes 1/2 (sin azimut): se muestran como
# Horizontal 1 y Horizontal 2, y NO se permiten como norte y este.
def test_cargar_archivo_componentes_1_2():
    # Estación aceptada con horizontales numéricas (HH1/HH2) + vertical HHZ.
    data = _mseed_bytes("CM", "CUM", ["HH1", "HH2", "HHZ"])
    res = process_mseed_bytes(data, "comp_1_2.mseed")

    # Se procesa (tiene las tres componentes: 1→N, 2→E, Z→Z) pero la orientación
    # NO está confirmada: no se presentan como Norte/Este.
    assert res.orientation_confirmed is False
    assert res.horizontal_labels == {"north": "Horizontal 1", "east": "Horizontal 2"}
    assert res.orientation_note is not None
    assert "no se rotaron" in res.orientation_note.lower()
