"""Verifica que client_ip distingue IPs reales tras el proxy (X-Forwarded-For)."""
from types import SimpleNamespace

from core.rate_limit import client_ip, RateLimiter


def _req(xff=None, xreal=None, client_host="10.0.0.1"):
    headers = {}
    if xff is not None:
        headers["x-forwarded-for"] = xff
    if xreal is not None:
        headers["x-real-ip"] = xreal
    return SimpleNamespace(
        headers=headers,
        client=SimpleNamespace(host=client_host),
    )


def test_toma_primer_valor_de_xff():
    # Railway: X-Forwarded-For: <cliente>, <proxy>
    req = _req(xff="201.1.2.3, 100.64.0.1")
    assert client_ip(req) == "201.1.2.3"


def test_dos_clientes_distintos_tras_el_mismo_proxy():
    # Dos usuarios reales distintos, misma IP de conexion del proxy.
    req_a = _req(xff="201.1.2.3, 100.64.0.1", client_host="100.64.0.1")
    req_b = _req(xff="190.9.8.7, 100.64.0.1", client_host="100.64.0.1")
    assert client_ip(req_a) != client_ip(req_b)
    assert client_ip(req_a) == "201.1.2.3"
    assert client_ip(req_b) == "190.9.8.7"


def test_fallback_x_real_ip():
    req = _req(xff=None, xreal="188.4.5.6")
    assert client_ip(req) == "188.4.5.6"


def test_fallback_client_host():
    req = _req(xff=None, xreal=None, client_host="172.16.0.9")
    assert client_ip(req) == "172.16.0.9"


def test_rate_limit_por_ip_independiente_con_proxy():
    # Dos IP reales distintas no comparten contador aunque pasen por el proxy.
    rl = RateLimiter(per_minute=2, per_hour=100)
    a = client_ip(_req(xff="201.1.2.3, 100.64.0.1"))
    b = client_ip(_req(xff="190.9.8.7, 100.64.0.1"))
    rl.check(a); rl.check(a)  # agota el de A (2/min)
    # B tiene su propio contador: no debe lanzar.
    rl.check(b)
