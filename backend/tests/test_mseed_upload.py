"""Pruebas de la carga de MiniSEED por investigadores."""
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.mseed_upload import process_mseed_bytes
from main import app


def _make_mseed(stations=("CUFP",), fs=100.0, seconds=20.0, comps=("Z", "N", "E")) -> bytes:
    """Genera un MiniSEED sintético en memoria con ObsPy."""
    from obspy import Stream, Trace, UTCDateTime

    st = Stream()
    n = int(fs * seconds)
    t = np.arange(n) / fs
    for sta in stations:
        for i, comp in enumerate(comps):
            sig = np.sin(2 * np.pi * (2 + i) * t) * np.exp(-((t - 8) ** 2) / 4) * 1000 + 50
            tr = Trace(data=sig.astype(np.float32))
            tr.stats.network = "CM"
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


def test_process_mseed_acepta_componentes_numericas():
    # Convención 1/2/Z (horizontales numéricas) debe reconocerse como N/E/Z.
    data = _make_mseed(stations=("CUM",), comps=("Z", "1", "2"))
    res = process_mseed_bytes(data, "num.mseed")
    assert res.station == "CUM"
    wd = res.waveData
    # Las tres series tienen datos (no quedaron en ceros).
    assert any(v != 0 for v in wd.north) and any(v != 0 for v in wd.east)


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
    assert "no hace parte de la red de Nariño" in exc.value.detail


def test_process_mseed_rechaza_componentes_incompletas():
    # Estación aceptada pero sin la componente Este → 422.
    from fastapi import HTTPException

    data = _make_mseed(stations=("CUM",), comps=("Z", "N"))
    with pytest.raises(HTTPException) as exc:
        process_mseed_bytes(data, "incompleto.mseed")
    assert exc.value.status_code == 422
    assert "tres componentes" in exc.value.detail


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
    assert "red de Nariño" in r.json()["detail"]


def test_endpoint_upload_mseed_invalido():
    client = TestClient(app)
    r = client.post("/api/upload/mseed", files={"file": ("x.mseed", b"nada", "application/octet-stream")})
    assert r.status_code == 400
