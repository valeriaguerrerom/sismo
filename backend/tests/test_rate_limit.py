"""Tests del limitador de peticiones por IP (core.rate_limit)."""
import pytest
from fastapi import HTTPException

from core.rate_limit import RateLimiter


def test_permite_hasta_el_limite_por_minuto():
    rl = RateLimiter(per_minute=3, per_hour=100)
    for _ in range(3):
        rl.check("1.2.3.4")  # no debe lanzar
    with pytest.raises(HTTPException) as exc:
        rl.check("1.2.3.4")  # la 4ª supera el límite
    assert exc.value.status_code == 429


def test_limite_es_por_ip_independiente():
    rl = RateLimiter(per_minute=1, per_hour=100)
    rl.check("10.0.0.1")
    # Otra IP tiene su propio contador y no se ve afectada.
    rl.check("10.0.0.2")
    with pytest.raises(HTTPException):
        rl.check("10.0.0.1")


def test_mensaje_personalizado_en_429():
    rl = RateLimiter(per_minute=1, per_hour=100, mensaje="Mensaje de prueba")
    rl.check("9.9.9.9")
    with pytest.raises(HTTPException) as exc:
        rl.check("9.9.9.9")
    assert exc.value.detail == "Mensaje de prueba"


def test_limite_por_hora():
    rl = RateLimiter(per_minute=1000, per_hour=5)
    for _ in range(5):
        rl.check("8.8.8.8")
    with pytest.raises(HTTPException) as exc:
        rl.check("8.8.8.8")
    assert exc.value.status_code == 429
