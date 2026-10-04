"""Pruebas de la carga de MiniSEED por investigadores."""
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.mseed_upload import process_mseed_bytes
from main import app


@pytest.fixture(autouse=True)
def _sin_supabase(monkeypatch):
    """Fuerza el modo sin Supabase en las pruebas de endpoint.

    La carga de MiniSEED exige sesión verificada contra Supabase. En las pruebas
    no hay proveedor, así que se limpian las variables para que require_user_id
    use el modo local (sin bloqueo) y se pueda probar la lógica de procesamiento.
    La exigencia real de sesión (401) se prueba aparte en test_require_user_id.
    """
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "")


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


def test_endpoint_example_mseed_por_tipo():
    # Los dos ejemplos (tectónico CUM y volcánico Galeras/CUFP) se descargan y
    # son MiniSEED legibles con la estación esperada.
    from obspy import read as _read
    client = TestClient(app)

    r = client.get("/api/examples/mseed/tectonico")
    assert r.status_code == 200, r.text
    assert "ejemplo_CUM_tectonico.mseed" in r.headers.get("content-disposition", "")
    st = _read(io.BytesIO(r.content))
    assert {tr.stats.station for tr in st} == {"CUM"}

    r = client.get("/api/examples/mseed/volcanico")
    assert r.status_code == 200, r.text
    assert "ejemplo_CUFP_volcanico.mseed" in r.headers.get("content-disposition", "")
    st = _read(io.BytesIO(r.content))
    assert {tr.stats.station for tr in st} == {"CUFP"}


def test_endpoint_example_mseed_tipo_desconocido_es_404():
    client = TestClient(app)
    r = client.get("/api/examples/mseed/nosoyuntipo")
    assert r.status_code == 404


def test_estimacion_distancia_sp_en_ejemplos():
    # El ejemplo tectónico (CUM) tiene fases P/S detectables → distancia estimada.
    # El volcánico (CUFP) no tiene fases claras → 'desconocido' (no se inventa).
    from pathlib import Path
    base = Path(__file__).resolve().parent.parent / "example_data"

    tecto = process_mseed_bytes((base / "ejemplo_CUM_tectonico.mseed").read_bytes(), "t.mseed")
    assert tecto.origin_class in ("local", "regional", "lejano")
    assert tecto.distance_km_est is not None and tecto.distance_km_est > 0
    assert tecto.sp_seconds is not None and tecto.sp_seconds > 0

    volc = process_mseed_bytes((base / "ejemplo_CUFP_volcanico.mseed").read_bytes(), "v.mseed")
    assert volc.origin_class == "desconocido"
    assert volc.distance_km_est is None


def test_estimacion_distancia_sinteticos():
    # Señal sintética con P clara en vertical y S (más tarde) en horizontales:
    # debe estimar una distancia > 0 y clasificar el origen.
    import numpy as np
    fs = 100.0
    n = 3000
    t = np.arange(n) / fs
    rng = np.random.default_rng(0)
    ruido = rng.normal(0, 0.01, n)
    # P en t=5 s (fuerte en vertical), S en t=12 s (fuerte en horizontales).
    def pulso(center, amp):
        return amp * np.exp(-((t - center) ** 2) / 0.5)
    vertical = (pulso(5.0, 1.0) + 0.3 * pulso(12.0, 1.0) + ruido).tolist()
    horiz = (0.2 * pulso(5.0, 1.0) + pulso(12.0, 1.0) + ruido)
    from api.mseed_upload import _estimate_distance_sp
    sp, dist, origin, _ = _estimate_distance_sp(vertical, horiz.tolist(), horiz.tolist(), fs)
    assert sp is not None and dist is not None
    assert origin in ("local", "regional", "lejano")


def test_require_user_id_exige_sesion_cuando_supabase_configurado(monkeypatch):
    """Con Supabase configurado, require_user_id exige un Bearer válido.

    Sin encabezado Authorization devuelve 401. Es la verificación de sesión del
    lado del servidor para la carga de MiniSEED (no basta con ocultar el botón).
    """
    from fastapi import HTTPException
    from core.config import require_user_id

    monkeypatch.setenv("SUPABASE_URL", "https://proyecto.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "clave-anon-de-prueba")

    with pytest.raises(HTTPException) as exc:
        require_user_id(None)
    assert exc.value.status_code == 401

    with pytest.raises(HTTPException) as exc:
        require_user_id("Bearer   ")
    assert exc.value.status_code == 401
