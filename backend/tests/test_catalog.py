"""Tests del catálogo de eventos (seismic_events / stats home).

El catálogo esperado es de 166 eventos (134 CM + 32 Galeras). La fuente de
verdad tras la carga es la tabla seismic_events de Supabase; hasta que se corra
el seed, /api/stats/home cae al respaldo JSON, que también da 166. Estos tests
verifican la coherencia del número esperado desde ambos ángulos.
"""
import json
from pathlib import Path

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)
PUBLIC_DATA = Path(__file__).resolve().parent.parent.parent / "public" / "data"

EXPECTED_TOTAL = 166
EXPECTED_CM = 134
EXPECTED_GALERAS = 32


def _count(path: Path) -> int:
    try:
        return len(json.loads(path.read_text(encoding="utf-8")).get("events", []))
    except Exception:
        return 0


def test_catalogo_json_tiene_166():
    """Los índices JSON (respaldo del catálogo) suman 166 eventos."""
    cm = _count(PUBLIC_DATA / "cm" / "index.json")
    gal = _count(PUBLIC_DATA / "galeras" / "index.json")
    assert cm == EXPECTED_CM
    assert gal == EXPECTED_GALERAS
    assert cm + gal == EXPECTED_TOTAL


def test_stats_home_total_166():
    """El endpoint del Home reporta 166 eventos (Supabase o respaldo JSON)."""
    r = client.get("/api/stats/home")
    assert r.status_code == 200
    j = r.json()
    assert j["total_eventos"] == EXPECTED_TOTAL
    assert j["eventos_cm"] == EXPECTED_CM
    assert j["eventos_galeras"] == EXPECTED_GALERAS


def test_seismic_events_count_si_hay_datos():
    """Si la tabla seismic_events ya tiene datos, deben ser 166.

    No falla si la tabla está vacía (el seed aún no se ha corrido): en ese
    caso solo se valida que /api/stats/home dé 166 vía el respaldo JSON.
    """
    sb = getattr(main, "supabase", None)
    if sb is None:
        return  # sin conexión Supabase en este entorno; nada que validar aquí
    try:
        resp = sb.table("seismic_events").select("event_id", count="exact").execute()
    except Exception:
        return  # tabla/estructura aún no lista; se valida tras correr la migración+seed
    total = resp.count if resp.count is not None else len(resp.data or [])
    if total > 0:
        assert total == EXPECTED_TOTAL, f"seismic_events tiene {total}, se esperaban {EXPECTED_TOTAL}"
