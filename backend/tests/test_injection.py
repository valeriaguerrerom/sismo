"""
Pruebas de payloads de inyección contra los endpoints que reciben entrada libre.

Objetivo: que ningún payload malicioso provoque ejecución, error 500 con fuga,
ni comportamiento inseguro. Las respuestas esperadas son 200 (manejado como
dato literal) o un 4xx controlado — nunca 500 con una traza.

Endpoints cubiertos:
  - GET /api/events?search=...  (va a un .ilike parametrizado de Supabase)
  - GET /api/events con filtros numéricos fuera de rango
  - GET /api/waveforms/{event}/{station}  (path traversal / inyección en ruta)
  - POST /api/simulate con tipos inválidos (no numéricos)

El backend usa el SDK de Supabase (consultas parametrizadas) y, sin Supabase
configurado en el entorno de test, cae a datos fallback: en ambos casos el
payload se trata como valor literal, nunca como código.
"""
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

# Payloads clásicos de inyección (SQL, XSS, path traversal, control chars).
PAYLOADS = [
    "'; DROP TABLE profiles; --",
    "' OR '1'='1",
    "1); DELETE FROM seismic_events; --",
    "<script>alert(1)</script>",
    "%00",
    "../../../../etc/passwd",
    "${jndi:ldap://x}",
    "\" OR \"\"=\"",
]


def test_events_search_no_rompe_con_payloads():
    for p in PAYLOADS:
        r = client.get("/api/events", params={"search": p})
        # Nunca 500: el valor se trata como texto de búsqueda, no como SQL.
        assert r.status_code == 200, f"payload {p!r} -> {r.status_code}: {r.text[:200]}"
        body = r.json()
        assert "data" in body and isinstance(body["data"], list)


def test_events_filtros_numericos_invalidos_son_422_no_500():
    # type espera un valor; un numérico donde va texto o viceversa no debe reventar.
    r = client.get("/api/events", params={"min_mag": "no-soy-numero"})
    assert r.status_code in (200, 422), r.text
    r = client.get("/api/events", params={"start_year": "'; DROP"})
    assert r.status_code in (200, 422), r.text


def test_waveforms_path_traversal_no_escapa():
    # Un event_id con intento de path traversal debe dar 404/4xx, nunca servir
    # un archivo del sistema ni un 500 con traza.
    for p in ["..%2f..%2fetc%2fpasswd", "....//....//", "Colombia/../../secret"]:
        r = client.get(f"/api/waveforms/{p}/CUM")
        assert r.status_code in (400, 404, 422), f"{p} -> {r.status_code}"


def test_simulate_tipos_invalidos_son_422():
    # Campos numéricos con payloads de texto: validación Pydantic -> 422, no 500.
    bad = {
        "vp": "'; DROP TABLE x; --", "vs": 2000, "density": 2600,
        "sourceType": "tectonic", "magnitude": 5.0, "depth": 5,
        "duration": 8, "dx": 22, "dt": 0.004,
    }
    r = client.post("/api/simulate", json=bad)
    assert r.status_code == 422, r.text


def test_simulate_sourcetype_invalido_es_422():
    bad = {
        "vp": 3500, "vs": 2000, "density": 2600,
        "sourceType": "<script>", "magnitude": 5.0, "depth": 5,
        "duration": 8, "dx": 22, "dt": 0.004,
    }
    r = client.post("/api/simulate", json=bad)
    assert r.status_code == 422, r.text
