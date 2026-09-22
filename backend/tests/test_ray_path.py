"""Tests del endpoint /api/ray-path."""
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


def _q(model, station="TUM", depth=30):
    return client.get("/api/ray-path", params={
        "lat": 1.5, "lon": -77.5, "depth_km": depth, "station": station, "model": model,
    })


def test_ray_homogeneous_es_recto():
    """En homogéneo el rayo es una recta: 2 puntos, del hipocentro a superficie."""
    r = _q("homogeneous")
    assert r.status_code == 200
    j = r.json()
    assert j["modelo_usado"] == "homogeneous"
    assert len(j["puntos"]) == 2
    assert j["puntos"][0]["depth_km"] == 30
    assert j["puntos"][-1]["depth_km"] == 0.0


def test_ray_iasp91_es_curvo():
    """En iasp91 el rayo P tiene múltiples puntos (curva)."""
    r = _q("iasp91")
    assert r.status_code == 200
    j = r.json()
    assert j["modelo_usado"] == "iasp91"
    assert len(j["puntos"]) > 2
    # Empieza en profundidad y termina en superficie
    assert j["puntos"][0]["depth_km"] >= 29
    assert j["puntos"][-1]["depth_km"] < 1


def test_ray_estacion_inexistente_404():
    """Estación desconocida devuelve 404."""
    r = _q("homogeneous", station="ZZZZ")
    assert r.status_code == 404


def test_ray_modelo_invalido_400():
    """Modelo no reconocido devuelve 400."""
    r = _q("xyz")
    assert r.status_code == 400
