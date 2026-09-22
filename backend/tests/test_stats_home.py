"""Tests del endpoint /api/stats/home."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)
PUBLIC_DATA = Path(__file__).resolve().parent.parent.parent / "public" / "data"


def _count_index(path: Path) -> int:
    """Conteo directo de eventos en un index.json (0 si no existe)."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return len(json.load(f).get("events", []))
    except Exception:
        return 0


def test_home_stats_total_coincide_con_conteo_directo():
    """total_eventos = COUNT directo de los índices JSON (CM + Galeras).

    Nota: la fuente real son archivos JSON estáticos (la tabla Supabase está
    vacía por diseño), así que el test de 'agregar un evento y ver subir el
    número' se adapta a contar directamente sobre los archivos: el endpoint
    debe reflejar exactamente lo que hay en los índices.
    """
    directo = _count_index(PUBLIC_DATA / "cm" / "index.json") + \
        _count_index(PUBLIC_DATA / "galeras" / "index.json")
    r = client.get("/api/stats/home")
    assert r.status_code == 200
    assert r.json()["total_eventos"] == directo


def test_home_stats_campos_y_coherencia():
    """Los campos existen y son coherentes entre sí."""
    j = client.get("/api/stats/home").json()
    assert j["eventos_cm"] + j["eventos_galeras"] == j["total_eventos"]
    if j["anio_min"] and j["anio_max"]:
        assert j["anio_max"] >= j["anio_min"]
        assert j["anios_registro"] == j["anio_max"] - j["anio_min"] + 1
    if j["magnitud_maxima"] is not None:
        assert j["magnitud_maxima"] > 0
