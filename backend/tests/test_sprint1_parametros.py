"""
Casos de prueba del servidor del Sprint 1 (HU005 y HU006).
Cada prueba lleva el identificador CPR del documento Casos_de_pruebas_Sprint1.
Ubicación en el repositorio: backend/tests/test_sprint1_parametros.py
"""
import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


def _payload(**kw):
    p = {
        "vp": 3500, "vs": 2000, "density": 2600, "sourceType": "tectonic",
        "magnitude": 5.0, "depth": 4, "duration": 8, "dx": 24, "dt": 0.0045,
    }
    p.update(kw)
    return p


def test_cpr_005_5_backend_rechaza_vs_alta():
    """CPR-005-5 El servidor rechaza Vs mayor que Vp/raíz de 2 con un mensaje en español."""
    r = client.post("/api/simulate", json=_payload(vp=3000, vs=2950))
    assert r.status_code == 422
    detalle = str(r.json()["detail"])
    assert "Vs" in detalle or "λ" in detalle


def test_cpr_005_6_endpoint_lame():
    """CPR-005-6 GET /api/lame devuelve λ y μ calculados con ρ, Vp y Vs."""
    r = client.get("/api/lame", params={"vp": 4000, "vs": 2300, "density": 2600})
    assert r.status_code == 200
    data = r.json()
    assert data["mu"] == pytest.approx(2600 * 2300 ** 2)
    assert data["lambda"] == pytest.approx(2600 * 4000 ** 2 - 2 * 2600 * 2300 ** 2)


@pytest.mark.parametrize("campo,valor", [("magnitude", 15), ("depth", 500), ("dip", 120)])
def test_cpr_006_8_backend_rechaza_fuera_de_rango(campo, valor):
    """CPR-006-8 El servidor rechaza magnitud, profundidad o buzamiento fuera de rango."""
    r = client.post("/api/simulate", json=_payload(**{campo: valor}))
    assert r.status_code == 422
