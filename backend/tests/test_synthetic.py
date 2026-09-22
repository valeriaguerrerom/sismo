"""Tests del endpoint /api/synthetic (FDM 2D)."""
import time

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


def _post(nx=80, nz=80, dt=0.01, **kw):
    payload = {
        "vp": 3500, "vs": 2000, "density": 2600, "magnitude": 5,
        "depth_km": 15, "source_type": "tectonic", "distance_km": 3,
        "nx": nx, "nz": nz, "dt_max_s": dt,
    }
    payload.update(kw)
    return client.post("/api/synthetic", json=payload)


def test_synthetic_forma_salida():
    """La salida tiene las 4 series de igual longitud y campos requeridos."""
    r = _post()
    assert r.status_code == 200
    j = r.json()
    for k in ("t", "north", "east", "vertical", "tP_detectado", "tS_detectado",
              "cfl_ok", "tiempo_computo_ms"):
        assert k in j
    n = len(j["t"])
    assert n > 0
    assert len(j["north"]) == n and len(j["east"]) == n and len(j["vertical"]) == n


def test_synthetic_tp_menor_ts():
    """La llegada P ocurre antes que la S."""
    r = _post()
    j = r.json()
    assert j["tP_detectado"] < j["tS_detectado"]


def test_synthetic_cfl_ok_true():
    """Con dt pequeño, CFL se cumple sin recorte."""
    r = _post(dt=0.005)
    assert r.json()["cfl_ok"] is True


def test_synthetic_cfl_violado_se_recorta():
    """Con dt grande, cfl_ok=False pero la simulación corre (dt recortado)."""
    r = _post(dt=5.0)
    j = r.json()
    assert j["cfl_ok"] is False
    assert j["dt_s"] < 5.0  # fue recortado
    assert len(j["t"]) > 0


def test_synthetic_200x150_bajo_15s():
    """Meta de rendimiento: malla 200x150 en menos de 15 s."""
    t0 = time.perf_counter()
    r = _post(nx=200, nz=150, dt=0.02, distance_km=5)
    wall = time.perf_counter() - t0
    assert r.status_code == 200
    assert wall < 15.0, f"Tardó {wall:.2f}s (meta < 15s)"
    # El servidor también reporta su propio tiempo
    assert r.json()["tiempo_computo_ms"] < 15000
