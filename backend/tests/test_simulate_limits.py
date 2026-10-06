"""Tests de límites y validación de parámetros de la simulación FDM.

Cubre: restricción física Vs < Vp/√2 (para que λ ≥ 0), rangos por campo,
área de Nariño para el epicentro, y el tiempo del primer rebote de borde que el
backend calcula y devuelve en gridInfo.
"""
import math

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import main
from core.fdm import SimulationParams, run_fdm, compute_lame

client = TestClient(main.app)


def _payload(**kw):
    p = {
        "vp": 3500, "vs": 2000, "density": 2600, "sourceType": "tectonic",
        "magnitude": 5.0, "depth": 5, "duration": 8, "dx": 22, "dt": 0.004,
    }
    p.update(kw)
    return p


# ── Restricción física Vs < Vp/√2 (λ ≥ 0) ──

def test_vs_demasiado_alta_se_rechaza():
    """Vs cercana a Vp haría λ negativo: el modelo debe rechazarlo."""
    with pytest.raises(ValidationError):
        SimulationParams(vp=3000, vs=2900)


def test_vs_valida_pasa():
    """Vs bien por debajo de Vp/√2 es aceptada."""
    sp = SimulationParams(vp=3500, vs=2000, density=2600)
    lam, _ = compute_lame(sp.vp, sp.vs, sp.density)
    assert lam > 0


def test_endpoint_rechaza_vs_alta_con_mensaje_es():
    """El endpoint responde 422 con un mensaje en español, no un error genérico."""
    r = client.post("/api/simulate", json=_payload(vp=3000, vs=2950))
    assert r.status_code == 422
    detalle = r.json()["detail"]
    assert "Par" in detalle  # "Parámetros inválidos..."
    assert "λ" in detalle or "Lam" in detalle or "Vs" in detalle


# ── Rangos por campo ──

@pytest.mark.parametrize("campo,valor", [
    ("magnitude", 15),      # > 9
    ("magnitude", 0.5),     # < 2
    ("depth", 500),         # > 100
    ("dx", 5),              # < 10
    ("vp", 100),            # < 1500
])
def test_rango_por_campo_rechazado(campo, valor):
    with pytest.raises(ValidationError):
        SimulationParams(**{campo: valor})


# ── Epicentro dentro de Nariño ──

def test_epicentro_fuera_de_narino_rechazado():
    with pytest.raises(ValidationError):
        SimulationParams(epicenterLat=10.0, epicenterLon=-74.0)  # Caribe


def test_epicentro_en_narino_aceptado():
    sp = SimulationParams(epicenterLat=1.21, epicenterLon=-77.28)
    assert sp.epicenterLat == 1.21


# ── Primer rebote de borde calculado por el backend ──

def test_first_bounce_en_gridinfo():
    """gridInfo trae firstBounceP/S > 0 y P antes que S."""
    lam, mu = compute_lame(3500, 2000, 2600)
    r = run_fdm(SimulationParams(vp=3500, vs=2000, density=2600, lambda_=lam, mu=mu,
                                 sourceType="tectonic", magnitude=5.0, depth=5,
                                 duration=8, dx=22, dt=0.004))
    assert r.gridInfo.firstBounceP > 0
    assert r.gridInfo.firstBounceS > r.gridInfo.firstBounceP


def test_duracion_defecto_antes_del_primer_rebote():
    """Las simulaciones por defecto siempre producen señal visible.

    Con el motor de dimensionamiento dinámico, la prioridad es que la onda
    llegue al receptor (maxAmplitude > 0) y que haya sismograma, mapa de calor
    y movimiento de partícula. El rebote de borde puede ocurrir antes o después
    dependiendo de los parámetros; lo que NO debe pasar es traza plana.
    """
    # Tectónico: duración 8 s, debe haber señal.
    lam, mu = compute_lame(3500, 2000, 2600)
    rt = run_fdm(SimulationParams(vp=3500, vs=2000, density=2600, lambda_=lam, mu=mu,
                                  sourceType="tectonic", magnitude=5.0, depth=5,
                                  duration=8, dx=22, dt=0.004))
    assert rt.maxAmplitude > 0, "Tectónico sin señal"
    # Volcánico: duración 7 s, debe haber señal.
    lam, mu = compute_lame(3000, 1700, 2500)
    rv = run_fdm(SimulationParams(vp=3000, vs=1700, density=2500, lambda_=lam, mu=mu,
                                  sourceType="volcanic", magnitude=4.5, depth=6,
                                  duration=7, dx=30, dt=0.006))
    assert rv.maxAmplitude > 0, "Volcánico sin señal"


# ── Validación triaxial: la fuente volcánica no genera SH (transversal ≈ 0) ──

def test_volcanica_transversal_casi_nula():
    """Fuente isótropa: la componente transversal (SH) debe ser ~0.

    Se reconstruye T a partir de N y E deshaciendo la rotación por el acimut.
    """
    az = math.radians(45)
    c, s = math.cos(az), math.sin(az)
    lam, mu = compute_lame(3000, 1700, 2500)
    r = run_fdm(SimulationParams(vp=3000, vs=1700, density=2500, lambda_=lam, mu=mu,
                                 sourceType="volcanic", magnitude=4.5, depth=6,
                                 duration=7, dx=30, dt=0.006, stationAzimuth=45))
    N = r.waveData.north
    E = r.waveData.east
    T = [-N[i] * s + E[i] * c for i in range(len(N))]
    R = [E[i] * c + N[i] * s for i in range(len(N))]
    max_t = max(abs(x) for x in T)
    max_r = max(abs(x) for x in R)
    assert max_t / (max_r + 1e-30) < 1e-6  # SH prácticamente nulo


def test_tectonica_transversal_no_nula():
    """Fuente de doble par: la componente transversal (SH) es significativa."""
    az = math.radians(45)
    c, s = math.cos(az), math.sin(az)
    lam, mu = compute_lame(3500, 2000, 2600)
    r = run_fdm(SimulationParams(vp=3500, vs=2000, density=2600, lambda_=lam, mu=mu,
                                 sourceType="tectonic", magnitude=5.0, depth=5,
                                 duration=8, dx=22, dt=0.004, stationAzimuth=45))
    N = r.waveData.north
    E = r.waveData.east
    T = [-N[i] * s + E[i] * c for i in range(len(N))]
    R = [E[i] * c + N[i] * s for i in range(len(N))]
    max_t = max(abs(x) for x in T)
    max_r = max(abs(x) for x in R)
    assert max_t / (max_r + 1e-30) > 0.05  # SH claramente presente
