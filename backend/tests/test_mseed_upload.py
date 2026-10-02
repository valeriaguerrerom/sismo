"""Pruebas de la carga de MiniSEED por investigadores."""
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.mseed_upload import process_mseed_bytes
from main import app


def _make_mseed(stations=("CUFP",), fs=100.0, seconds=20.0, comps=("Z", "N", "E"), network="CM") -> bytes:
    """Genera un MiniSEED sintético en memoria con ObsPy."""
    from obspy import Stream, Trace, UTCDateTime

    st = Stream()
    n = int(fs * seconds)
    t = np.arange(n) / fs
    for sta in stations:
        for i, comp in enumerate(comps):
            sig = np.sin(2 * np.pi * (2 + i) * t) * np.exp(-((t - 8) ** 2) / 4) * 1000 + 50
            tr = Trace(data=sig.astype(np.float32))
            tr.stats.network = network
            tr.stats.station = sta
            tr.stats.channel = f"HH{comp}"
            tr.stats.sampling_rate = fs
            tr.stats.starttime = UTCDateTime("2024-08-23T03:04:05")
            st += tr
    buf = io.BytesIO()
    st.write(buf, format="MSEED")
    return buf.getvalue()


def test_process_mseed_devuelve_registro_triaxial_normalizado():
    res = process_mseed_bytes(_make_mseed(), "prueba.mseed")
    assert res.station == "CUFP"
    assert res.network == "CM"
    assert res.channels == {"Z": "HHZ", "N": "HHN", "E": "HHE"}
    assert res.sampling_rate == 100.0
    assert res.stations[0].triaxial is True
    assert 19.9 <= res.duration <= 20.0
    wd = res.waveData
    assert len(wd.time) == len(wd.north) == len(wd.east) == len(wd.vertical)
    assert len(wd.time) <= 3000
    peak = max(abs(v) for s in (wd.north, wd.east, wd.vertical) for v in s)
    assert 0.9 <= peak <= 1.0
    # el offset DC de +50 se elimina con detrend
    assert abs(sum(wd.vertical) / len(wd.vertical)) < 0.05


def test_process_mseed_selecciona_estacion_indicada():
    # Dos estaciones ACEPTADAS de la red de Nariño (CUM y BBAC).
    data = _make_mseed(stations=("CUM", "BBAC"))
    res = process_mseed_bytes(data, "dos.mseed", station="BBAC")
    assert res.station == "BBAC"
    assert {s.station for s in res.stations} == {"CUM", "BBAC"}


def test_process_mseed_componentes_alfabeticas_orientacion_confirmada():
    # Con canales N/E/Z la orientación está confirmada (rótulos Norte/Este).
    res = process_mseed_bytes(_make_mseed(stations=("CUM",)), "ne.mseed")
    assert res.orientation_confirmed is True
    assert res.orientation_note is None
    assert res.horizontal_labels == {"north": "Norte (N)", "east": "Este (E)"}


def test_process_mseed_componentes_numericas_no_se_rotan():
    # Convención 1/2/Z sin azimut: se leen las tres series PERO la orientación
    # NO se confirma: se etiquetan Horizontal 1/2 y no se presentan como N/E.
    data = _make_mseed(stations=("CUM",), comps=("Z", "1", "2"))
    res = process_mseed_bytes(data, "num.mseed")
    assert res.station == "CUM"
    wd = res.waveData
    assert any(v != 0 for v in wd.north) and any(v != 0 for v in wd.east)
    assert res.orientation_confirmed is False
    assert "no se rotaron" in (res.orientation_note or "")
    assert res.horizontal_labels == {"north": "Horizontal 1", "east": "Horizontal 2"}


def test_process_mseed_prefiere_velocimetro_sobre_acelerometro():
    # Estación con velocímetro (EH) y acelerómetro (HN): debe usar el velocímetro.
    from obspy import Stream, Trace, UTCDateTime
    import io as _io

    st = Stream()
    n = int(100 * 20)
    t = np.arange(n) / 100.0
    for prefix in ("EH", "HN"):
        for comp in ("Z", "N", "E"):
            sig = np.sin(2 * np.pi * 3 * t) * 1000
            tr = Trace(data=sig.astype(np.float32))
            tr.stats.network = "CM"
            tr.stats.station = "CUM"
            tr.stats.channel = f"{prefix}{comp}"
            tr.stats.sampling_rate = 100.0
            tr.stats.starttime = UTCDateTime("2024-01-01T00:00:00")
            st += tr
    buf = _io.BytesIO(); st.write(buf, format="MSEED")
    res = process_mseed_bytes(buf.getvalue(), "mix.mseed")
    assert res.sensor_kind == "velocimetro"
    assert all(ch.startswith("EH") for ch in res.channels.values())


def test_process_mseed_aplica_pasabanda():
    res = process_mseed_bytes(_make_mseed(), "f.mseed", freqmin=1.0, freqmax=10.0)
    assert res.filtro == {"freqmin": 1.0, "freqmax": 10.0}


def test_process_mseed_rechaza_basura():
    with pytest.raises(ValueError):
        process_mseed_bytes(b"esto no es miniseed", "malo.mseed")


def test_process_mseed_rechaza_estacion_fuera_de_la_red():
    # Estación que NO pertenece a la red de Nariño → 422 con mensaje claro.
    from fastapi import HTTPException

    data = _make_mseed(stations=("ZZZZ",))
    with pytest.raises(HTTPException) as exc:
        process_mseed_bytes(data, "fuera.mseed")
    assert exc.value.status_code == 422
    assert "estaciones del proyecto en Nariño y sur del Cauca" in exc.value.detail


def test_process_mseed_rechaza_componentes_incompletas():
    # Estación aceptada pero sin la componente Este → 422.
    from fastapi import HTTPException

    data = _make_mseed(stations=("CUM",), comps=("Z", "N"))
    with pytest.raises(HTTPException) as exc:
        process_mseed_bytes(data, "incompleto.mseed")
    assert exc.value.status_code == 422
    assert "tres componentes" in exc.value.detail


def test_process_mseed_rechaza_codigo_valido_en_red_incorrecta():
    # 'CUM' es un código aceptado, pero en una red distinta a CM se rechaza:
    # la lista blanca es por par RED.ESTACIÓN.
    from fastapi import HTTPException

    data = _make_mseed(stations=("CUM",), network="XX")
    with pytest.raises(HTTPException) as exc:
        process_mseed_bytes(data, "otra_red.mseed")
    assert exc.value.status_code == 422
    assert "estaciones del proyecto en Nariño y sur del Cauca" in exc.value.detail


def test_endpoint_upload_mseed():
    client = TestClient(app)
    r = client.post(
        "/api/upload/mseed",
        files={"file": ("evento.mseed", _make_mseed(), "application/octet-stream")},
        data={"freqmin": "1", "freqmax": "10"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["station"] == "CUFP"
    assert len(body["waveData"]["time"]) > 100


def test_endpoint_upload_mseed_estacion_inexistente():
    client = TestClient(app)
    r = client.post(
        "/api/upload/mseed",
        files={"file": ("evento.mseed", _make_mseed(), "application/octet-stream")},
        data={"station": "ZZZZ"},
    )
    assert r.status_code == 404


def test_endpoint_upload_mseed_estacion_fuera_de_la_red():
    client = TestClient(app)
    r = client.post(
        "/api/upload/mseed",
        files={"file": ("fuera.mseed", _make_mseed(stations=("ZZZZ",)), "application/octet-stream")},
    )
    assert r.status_code == 422, r.text
    assert "estaciones del proyecto" in r.json()["detail"]


def test_endpoint_upload_mseed_invalido():
    client = TestClient(app)
    r = client.post("/api/upload/mseed", files={"file": ("x.mseed", b"nada", "application/octet-stream")})
    assert r.status_code == 400


def test_endpoint_example_mseed_descarga():
    # El backend sirve el archivo de ejemplo como descarga (Content-Disposition).
    client = TestClient(app)
    r = client.get("/api/examples/mseed")
    assert r.status_code == 200, r.text
    assert "attachment" in r.headers.get("content-disposition", "")
    assert "ejemplo_CUM_tectonico.mseed" in r.headers.get("content-disposition", "")
    # Debe ser un MiniSEED legible con la estación CUM.
    from obspy import read
    st = read(io.BytesIO(r.content))
    assert {tr.stats.station for tr in st} == {"CUM"}


def test_endpoint_upload_mseed_vacio_rechazado():
    # Un archivo vacío se rechaza con 400 (no se intenta leer como MiniSEED).
    client = TestClient(app)
    r = client.post("/api/upload/mseed", files={"file": ("vacio.mseed", b"", "application/octet-stream")})
    assert r.status_code == 400


def test_endpoint_upload_mseed_demasiado_grande_rechazado():
    # Un archivo que supera el límite (50 MB) se rechaza con 400 por tamaño,
    # SIN intentar parsearlo. Se usa un payload de 51 MB de bytes nulos.
    client = TestClient(app)
    big = b"\x00" * (51 * 1024 * 1024)
    r = client.post(
        "/api/upload/mseed",
        files={"file": ("grande.mseed", big, "application/octet-stream")},
    )
    assert r.status_code == 400
    assert "50 MB" in r.json().get("detail", "")
