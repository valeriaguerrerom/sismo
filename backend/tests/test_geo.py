"""Tests de core/geo.py — geometría sísmica."""
import math

import numpy as np

from core import geo


def test_haversine_cero():
    """Distancia de un punto a sí mismo es 0."""
    assert geo.haversine_km(1.2, -77.3, 1.2, -77.3) == 0.0


def test_haversine_un_grado_latitud():
    """Un grado de latitud ≈ 111.19 km (verificable a mano).

    A lo largo de un meridiano, 1° equivale a 2πR/360 ≈ 111.19 km.
    """
    d = geo.haversine_km(0.0, 0.0, 1.0, 0.0)
    assert abs(d - 111.19) < 0.5  # tolerancia por radio usado


def test_haversine_conocida_pasto_tumaco():
    """Distancia Pasto→Tumaco es del orden de ~150-170 km."""
    d = geo.haversine_km(1.2136, -77.2811, 1.8237, -78.7267)
    assert 140 < d < 190


def test_hypocentral_pitagoras():
    """Hipocentral = sqrt(epicentral² + prof²). Caso 3-4-5."""
    assert abs(geo.hypocentral_km(4.0, 3.0) - 5.0) < 1e-9


def test_azimuth_norte():
    """Un punto justo al norte tiene azimut ≈ 0°."""
    az = geo.azimuth_deg(0.0, 0.0, 1.0, 0.0)
    assert az < 1.0 or az > 359.0


def test_km_to_degrees():
    """111.195 km ≈ 1 grado."""
    assert abs(geo.km_to_degrees(geo.KM_PER_DEG) - 1.0) < 1e-6


def test_project_centro_es_origen():
    """El centro del dominio se proyecta al origen (0,0)."""
    x, y = geo.project_to_local_km(geo.DOMAIN_CENTER_LAT, geo.DOMAIN_CENTER_LON)
    assert abs(x) < 1e-6 and abs(y) < 1e-6


def test_project_vectorizado():
    """La proyección acepta arrays NumPy."""
    lats = np.array([1.0, 1.5, 2.0])
    lons = np.array([-78.1, -78.1, -78.1])
    x, y = geo.project_to_local_km(lats, lons)
    assert x.shape == (3,) and y.shape == (3,)
    # A lon constante = centro, x ≈ 0
    assert np.allclose(x, 0.0, atol=1e-6)
