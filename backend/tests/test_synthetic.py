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


def _onset_time(t, series, rel_thr=0.05):
    """Primer instante en que |series| supera `rel_thr`·max(|series|)."""
    peak = max((abs(v) for v in series), default=0.0)
    if peak <= 0:
        return None
    thr = peak * rel_thr
    for ti, v in zip(t, series):
        if abs(v) >= thr:
            return ti
    return None


def test_synthetic_tp_coincide_con_inicio_de_P():
    """La marca tP_detectado cae donde la onda P realmente empieza en la traza.

    Comprueba la propiedad física que usa el frontend para alinear las trazas al
    modelo: el inicio real de la energía en la componente vertical ocurre en
    tP_detectado dentro de una tolerancia pequeña (unos pocos pasos de muestreo).
    """
    r = _post(nx=120, nz=120, dt=0.02, distance_km=5)
    assert r.status_code == 200
    j = r.json()
    t = j["t"]
    dt = j["dt_s"]
    onset = _onset_time(t, j["vertical"])
    assert onset is not None, "La traza vertical no tiene energía detectable"
    # Tolerancia: la P se detecta por STA/LTA; el inicio por umbral puede caer
    # unas pocas muestras antes o después. Permitimos ~10 pasos de muestreo.
    tol = max(0.3, 10 * dt)
    assert abs(onset - j["tP_detectado"]) <= tol, (
        f"inicio de P={onset:.2f}s vs tP_detectado={j['tP_detectado']:.2f}s "
        f"(tol {tol:.2f}s)"
    )


def _rms(values):
    """RMS de una lista (0 si vacía)."""
    if not values:
        return 0.0
    return (sum(v * v for v in values) / len(values)) ** 0.5


def test_synthetic_ts_marca_salto_de_energia_de_S():
    """En tS_detectado hay un salto de energía en la horizontal (llegada de S).

    Detectar el "inicio" de S por simple umbral de amplitud es poco fiable
    porque la coda de la P aún tiene energía horizontal. En su lugar comprobamos
    la propiedad de una llegada: la energía (RMS) de la ventana justo DESPUÉS de
    tS es claramente mayor que la de la ventana justo ANTES (pero después de P),
    es decir, tS marca un aumento real de movimiento S.
    """
    r = _post(nx=120, nz=120, dt=0.02, distance_km=5)
    j = r.json()
    t, dt = j["t"], j["dt_s"]
    ts = j["tS_detectado"]
    win = 1.0  # ventana de 1 s a cada lado
    before = [v for ti, v in zip(t, j["east"]) if ts - win <= ti < ts]
    after = [v for ti, v in zip(t, j["east"]) if ts <= ti < ts + win]
    rms_before, rms_after = _rms(before), _rms(after)
    assert rms_after > rms_before, (
        f"RMS tras tS ({rms_after:.3e}) no supera al previo ({rms_before:.3e})"
    )
    assert dt > 0  # sanity
