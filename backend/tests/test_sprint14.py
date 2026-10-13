"""
Sprint 14 — HU029: formulario de contacto "Escríbenos".

Casos CPR-029-1 a CPR-029-4 (pytest). Se prueba el endpoint `POST /api/feedback`
(`backend/api/feedback.py`): registro del mensaje, exigencia de la autorización
de datos cuando se deja correo, rechazo de correo mal formado y límite de envíos
por IP.

NOTA de alcance (ver RESUMEN): el usuario pidió NO enviar mensajes de prueba
reales. CPR-029-1 (registrar un mensaje) se prueba con el cliente de Supabase
MOCKEADO en memoria, de modo que el "insert" nunca llega a la base de datos de
producción. CPR-029-2/3/4 son validaciones y límite que ocurren ANTES de
cualquier escritura, así que tampoco tocan la base real.

Herramienta: pytest (TestClient de FastAPI).
"""
import pytest
from fastapi.testclient import TestClient

import main
import api.feedback as feedback

client = TestClient(main.app)


# ─────────────────── Cliente Supabase simulado (solo para 029-1) ───────────────────

class _Insert:
    def __init__(self, sink):
        self._sink = sink
    def insert(self, row):
        self._sink.append(row)
        return self
    def execute(self):
        return type("R", (), {"data": self._sink[-1:]})()


class FakeSupabase:
    def __init__(self):
        self.rows = []
    def table(self, _name):
        return _Insert(self.rows)


@pytest.fixture(autouse=True)
def isolate(monkeypatch):
    """Aísla cada prueba de la base real y del rate limit entre pruebas.

    IMPORTANTE: `main.py` carga el .env del backend, por lo que la clave de
    servicio de Supabase está disponible y un insert llegaría a PRODUCCIÓN. Para
    cumplir "no enviar mensajes de prueba", se mockea `create_client` en TODAS
    las pruebas: cualquier insert cae en un cliente en memoria, nunca en la base
    real. Las pruebas que necesiten inspeccionar el insert usan su propio fake.
    """
    feedback._ip_hits.clear()
    monkeypatch.setattr(feedback, "create_client", lambda url, key: FakeSupabase())
    yield
    feedback._ip_hits.clear()


def _headers(ip: str) -> dict:
    # Cada prueba usa una IP distinta para aislar el rate limit por IP.
    return {"X-Forwarded-For": ip}


# ───────────────────────────── CPR-029-1 ─────────────────────────────
def test_enviar_sugerencia(monkeypatch):
    """El sistema registra el mensaje y confirma el envío (sin tocar producción)."""
    fake = FakeSupabase()
    # Env con clave de servicio simulada + cliente de Supabase mockeado: el
    # "insert" se queda en memoria, NO se envía ningún mensaje real.
    monkeypatch.setattr(feedback, "_env", lambda: ("http://fake", "anon", "service"))
    monkeypatch.setattr(feedback, "create_client", lambda url, key: fake)

    res = client.post("/api/feedback", headers=_headers("10.0.0.1"), json={
        "type": "sugerencia",
        "message": "Me gustaría ver más eventos del Galeras.",
    })
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    # Se registró el mensaje (en el cliente simulado), con su tipo y estado.
    assert len(fake.rows) == 1
    assert fake.rows[0]["type"] == "sugerencia"
    assert fake.rows[0]["status"] == "nuevo"


# ───────────────────────────── CPR-029-2 ─────────────────────────────
def test_enviar_correo_sin_autorizar():
    """Exige autorizar el tratamiento del correo antes de enviarlo (400)."""
    res = client.post("/api/feedback", headers=_headers("10.0.0.2"), json={
        "type": "sugerencia",
        "message": "Respondan a mi correo, por favor.",
        "email": "persona@ejemplo.com",
        "consent": False,
    })
    assert res.status_code == 400
    assert "autoriz" in res.json()["detail"].lower()


# ───────────────────────────── CPR-029-3 ─────────────────────────────
def test_enviar_correo_invalido():
    """Indica el error de formato de correo y no envía (400)."""
    res = client.post("/api/feedback", headers=_headers("10.0.0.3"), json={
        "type": "error",
        "message": "Hay un fallo en el mapa.",
        "email": "esto-no-es-un-correo",
        "consent": True,
    })
    assert res.status_code == 400
    assert "correo" in res.json()["detail"].lower()


# ───────────────────────────── CPR-029-4 ─────────────────────────────
def test_superar_limite_envios():
    """Al superar el límite por IP, el sistema pide esperar (429)."""
    ip = "10.0.0.4"
    # El cliente de Supabase está mockeado (fixture isolate), así que ningún
    # envío llega a la base real. Lo que se verifica es el rate limit: tras
    # PER_MINUTE envíos válidos, el siguiente debe responder 429.
    status_codes = []
    for _ in range(feedback.PER_MINUTE + 1):
        r = client.post("/api/feedback", headers=_headers(ip), json={
            "type": "otro", "message": "mensaje de prueba de límite",
        })
        status_codes.append(r.status_code)
    # El último intento supera el límite por minuto.
    assert status_codes[-1] == 429
    # Y los anteriores NO fueron 429 (pasaron el límite dentro de la ventana).
    assert 429 not in status_codes[:feedback.PER_MINUTE]
