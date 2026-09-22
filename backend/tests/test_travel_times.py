"""Tests del endpoint /api/travel-times y /api/stations."""
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


def test_stations():
    """Devuelve las 7 estaciones con los campos esperados (incluye source)."""
    r = client.get("/api/stations")
    assert r.status_code == 200
    est = r.json()["estaciones"]
    assert len(est) == 7
    codes = {s["code"] for s in est}
    assert "TUM" in codes and "PAS2" in codes
    # TUM tiene coordenada del boletín (no aproximada)
    tum = next(s for s in est if s["code"] == "TUM")
    assert tum["approx"] is False
    # Cada estación documenta su fuente
    for s in est:
        assert s["source"] and len(s["source"]) > 0


def test_stations_no_duplicadas():
    """CA0.2: no hay dos estaciones a menos de 100 m entre sí."""
    from core.geo import haversine_km
    r = client.get("/api/stations")
    est = r.json()["estaciones"]
    for i in range(len(est)):
        for j in range(i + 1, len(est)):
            d_km = haversine_km(est[i]["latitude"], est[i]["longitude"],
                                est[j]["latitude"], est[j]["longitude"])
            assert d_km > 0.1, f"{est[i]['code']} y {est[j]['code']} a {d_km*1000:.0f} m (<100 m)"


def test_travel_homogeneous_basico():
    """Modo homogéneo: tP = d_hypo/vp, tS = d_hypo/vs, ordenado por distancia."""
    r = client.post("/api/travel-times", json={
        "lat": 1.2136, "lon": -77.2811, "depth_km": 15,
        "vp_km_s": 6.0, "vs_km_s": 3.5, "model": "homogeneous",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["modelo_usado"] == "homogeneous"
    est = body["estaciones"]
    assert len(est) == 7
    # Orden ascendente por distancia epicentral
    dists = [e["distancia_epicentral_km"] for e in est]
    assert dists == sorted(dists)
    # La estación en el epicentro (PAS2): d_epi≈0, tP = 15/6 = 2.5
    pas2 = next(e for e in est if e["code"] == "PAS2")
    assert abs(pas2["tP"] - 2.5) < 0.01
    assert abs(pas2["tS"] - (15.0 / 3.5)) < 0.01
    # tS > tP siempre
    for e in est:
        assert e["tS"] > e["tP"]
        assert abs(e["tS_menos_tP"] - (e["tS"] - e["tP"])) < 0.01


def test_travel_iasp91():
    """Modo iasp91: devuelve tiempos con obspy.taup (P antes que S)."""
    r = client.post("/api/travel-times", json={
        "lat": 1.2136, "lon": -77.2811, "depth_km": 30,
        "vp_km_s": 6.0, "vs_km_s": 3.5, "model": "iasp91",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["modelo_usado"] == "iasp91"
    # Al menos la estación más lejana debe tener P y S
    lejana = body["estaciones"][-1]
    assert lejana["tP"] is not None and lejana["tS"] is not None
    assert lejana["tS"] > lejana["tP"]


def test_travel_modelo_invalido():
    """Un modelo no reconocido devuelve 400."""
    r = client.post("/api/travel-times", json={
        "lat": 1.2, "lon": -77.3, "depth_km": 10, "model": "xyz",
    })
    assert r.status_code == 400
