"""Tests del endpoint /api/waveforms/{event}/{station}."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)

DATA_RAW = Path(__file__).resolve().parent.parent / "data_raw"


def _first_cm_event() -> str | None:
    """Devuelve el id (nombre sin .mseed) del primer evento CM disponible."""
    for region in ("Colombia", "Ecuador"):
        d = DATA_RAW / region
        if d.exists():
            files = sorted(d.glob("*.mseed"))
            if files:
                return files[0].stem
    return None


def test_waveforms_evento_inexistente_404():
    """Un evento que no existe devuelve 404."""
    r = client.get("/api/waveforms/NO_EXISTE_XYZ/PAS2")
    assert r.status_code == 404


def test_waveforms_evento_real_devuelve_canales():
    """Con un evento CM real y una estación conocida, devuelve canales Z/N/E."""
    event_id = _first_cm_event()
    if event_id is None:
        pytest.skip("No hay MiniSEED CM en data_raw para probar")

    # Probar varias estaciones hasta encontrar una con señal
    ok = False
    for st in ("PAS2", "CUM", "CRU", "CPOP2", "TUM", "BBAC", "TUM3C"):
        r = client.get(f"/api/waveforms/{event_id}/{st}")
        if r.status_code == 200:
            j = r.json()
            assert "canales" in j and "Z" in j["canales"]
            assert len(j["t"]) == len(j["canales"]["Z"])
            assert len(j["t"]) <= 2000  # decimado
            assert j["fs"] > 0
            ok = True
            break
    assert ok, "Ninguna estación devolvió señal para el evento de prueba"


def test_waveforms_estacion_sin_senal_404():
    """Una estación que no registró el evento devuelve 404."""
    event_id = _first_cm_event()
    if event_id is None:
        pytest.skip("No hay MiniSEED CM en data_raw para probar")
    # 'ZZZZ' no existe en ningún evento
    r = client.get(f"/api/waveforms/{event_id}/ZZZZ")
    assert r.status_code == 404
