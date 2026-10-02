"""
Tests de los endpoints del Mapa 3D que se llaman AL ABRIR la página (sin evento):
estaciones, geometría de escena e hipocentros del catálogo. Ninguno debe dar 500.

Cubre la regresión del "Error 500 al abrir el Mapa 3D sin evento": todas las
estaciones (incluidas las de coordenadas aproximadas PAS2/TUM3C/CPOP2) deben
posicionarse sin fallar.
"""
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_stations_ok():
    r = client.get("/api/stations")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "estaciones" in data and len(data["estaciones"]) >= 7


def test_scene_geometry_ok():
    r = client.get("/api/scene-geometry")
    assert r.status_code == 200, r.text
    body = r.json()
    # Todas las estaciones del catálogo quedan posicionadas (x/z numéricos).
    assert len(body["stations"]) >= 7
    for s in body["stations"]:
        assert isinstance(s["x"], (int, float))
        assert isinstance(s["z"], (int, float))


def test_scene_events_con_catalogo_tipico_no_da_500():
    # Eventos como los que manda el frontend al abrir (volcánico y tectónico,
    # con y sin profundidad/magnitud). Debe responder 200, nunca 500.
    req = {
        "events": [
            {"id": "e1", "lat": 1.22, "lon": -77.37, "event_type": "volcanic", "label": "Galeras LP"},
            {"id": "e2", "lat": 1.6, "lon": -79.3, "depth_km": 24, "magnitude": 7.1,
             "event_type": "tectonic", "label": "Tumaco"},
            {"id": "e3", "lat": 2.0, "lon": -77.2, "event_type": None},
        ]
    }
    r = client.post("/api/scene-geometry/events", json=req)
    assert r.status_code == 200, r.text
    assert len(r.json()["hypocenters"]) == 3


def test_travel_times_homogeneo_e_iasp91_ok():
    for model in ("homogeneous", "iasp91"):
        body = {"lat": 1.2, "lon": -77.3, "depth_km": 15,
                "vp_km_s": 3.5, "vs_km_s": 2.0, "model": model}
        r = client.post("/api/travel-times", json=body)
        assert r.status_code == 200, f"{model}: {r.text}"
        assert len(r.json()["estaciones"]) >= 7
