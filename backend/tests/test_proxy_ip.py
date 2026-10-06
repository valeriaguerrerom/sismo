"""Verifica que client_ip distingue IPs reales tras el proxy (X-Forwarded-For)."""
from types import SimpleNamespace

from fastapi import HTTPException

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


def test_toma_ultimo_valor_de_xff_que_pone_el_proxy():
    # Railway añade la IP real del cliente al FINAL: X-Forwarded-For: <cliente>, <real>
    # Con 1 hop de confianza (Railway), la IP real es la última.
    req = _req(xff="201.1.2.3, 190.0.0.5")
    assert client_ip(req) == "190.0.0.5"


def test_xff_falsificado_no_cambia_la_ip_real():
    # El cliente intenta saltarse el límite enviando un XFF falso. Railway
    # igual añade su IP real al final, así que el valor confiable NO cambia.
    real = "190.0.0.5"
    req_normal = _req(xff=f"203.0.113.9, {real}")        # sin manipular
    req_spoof = _req(xff=f"1.1.1.1, 2.2.2.2, {real}")     # cliente mete basura al inicio
    # Ambas resuelven a la MISMA IP real (la que agrega el proxy al final).
    assert client_ip(req_normal) == real
    assert client_ip(req_spoof) == real


def test_dos_clientes_distintos_tras_el_mismo_proxy():
    # Dos usuarios reales distintos (último valor de XFF), misma IP de conexión.
    req_a = _req(xff="201.1.2.3, 190.0.0.5", client_host="100.64.0.1")
    req_b = _req(xff="201.1.2.3, 188.0.0.9", client_host="100.64.0.1")
    assert client_ip(req_a) != client_ip(req_b)
    assert client_ip(req_a) == "190.0.0.5"
    assert client_ip(req_b) == "188.0.0.9"


def test_fallback_x_real_ip():
    req = _req(xff=None, xreal="188.4.5.6")
    assert client_ip(req) == "188.4.5.6"


def test_fallback_client_host():
    req = _req(xff=None, xreal=None, client_host="172.16.0.9")
    assert client_ip(req) == "172.16.0.9"


def test_rate_limit_por_ip_independiente_con_proxy():
    # Dos IP reales distintas (último valor de XFF) no comparten contador.
    rl = RateLimiter(per_minute=2, per_hour=100)
    a = client_ip(_req(xff="201.1.2.3, 190.0.0.5"))
    b = client_ip(_req(xff="201.1.2.3, 188.0.0.9"))
    rl.check(a); rl.check(a)  # agota el de A (2/min)
    rl.check(b)               # B tiene su propio contador: no debe lanzar


def test_rate_limit_resiste_spoofing_de_xff():
    """Un cliente NO puede evadir el límite rotando el primer valor de XFF.

    Aunque cambie la parte que él controla (el inicio de X-Forwarded-For), su
    IP real (la que el proxy añade al final) es siempre la misma, así que el
    límite se le sigue aplicando y acaba recibiendo 429.
    """
    import pytest
    rl = RateLimiter(per_minute=2, per_hour=100)
    real = "190.0.0.5"
    # El atacante manda un primer valor distinto en cada intento para engañar.
    for i in range(2):
        ip = client_ip(_req(xff=f"10.0.0.{i}, {real}"))
        rl.check(ip)  # consume la cuota de la IP REAL (no del valor falso)
    # Tercer intento con OTRO valor falso: debe bloquearse igual (misma IP real).
    ip3 = client_ip(_req(xff=f"8.8.8.8, {real}"))
    with pytest.raises(HTTPException) as exc:
        rl.check(ip3)
    assert exc.value.status_code == 429
