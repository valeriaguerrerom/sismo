"""
Genera la migración SQL que actualiza el epicentro real (lat, lon, profundidad)
de los eventos CM que casaron con el USGS (ver match_cm_epicenters.py), y añade
la columna location_source para distinguir el origen de la coordenada:
    'SGC/USGS'               -> epicentro real (cruzado con el USGS ComCat)
    'centroide de estaciones' -> aún sin epicentro (coordenada por zona)

NO aplica nada: solo escribe el archivo de migración para revisarlo y aplicarlo
a mano en Supabase.

Uso:
    cd backend
    py scripts/gen_epicenter_migration.py
"""
import csv
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
CSV_IN = ROOT / "backend" / "scripts" / "cm_epicenter_match.csv"
OUT = ROOT / "supabase" / "migrations" / "20261004_cm_real_epicenters.sql"


def main() -> None:
    rows = list(csv.DictReader(CSV_IN.open(encoding="utf-8")))
    matched = [r for r in rows if r["estado"] == "match" and r.get("usgs_lat")]

    lines = []
    lines.append("-- =============================================")
    lines.append("-- Epicentros reales (USGS ComCat) para los eventos CM que casaron")
    lines.append("-- =============================================")
    lines.append("-- Generado por backend/scripts/gen_epicenter_migration.py a partir del")
    lines.append("-- cruce de match_cm_epicenters.py (por hora de origen + magnitud contra el")
    lines.append("-- USGS fdsnws/event). NO editar a mano.")
    lines.append("--")
    lines.append(f"-- Casaron {len(matched)} de 134 eventos CM. Los que no casaron son de magnitud")
    lines.append("-- baja (M <= ~3.7) y no están en el catálogo global del USGS; conservan su")
    lines.append("-- coordenada por zona (centroide de estaciones).")
    lines.append("--")
    lines.append("-- Añade location_source: 'SGC/USGS' = epicentro real; 'centroide de")
    lines.append("-- estaciones' = aún sin epicentro individual.")
    lines.append("-- =============================================")
    lines.append("")
    lines.append("ALTER TABLE seismic_events ADD COLUMN IF NOT EXISTS location_source text;")
    lines.append("")
    lines.append("-- Por defecto, todos los eventos CM existentes son 'centroide de estaciones'")
    lines.append("-- (los volcánicos del Galeras usan la coordenada del cráter: se dejan NULL).")
    lines.append("UPDATE seismic_events SET location_source = 'centroide de estaciones'")
    lines.append("  WHERE event_type = 'tectonic' AND location_source IS NULL;")
    lines.append("")
    lines.append(f"-- ── {len(matched)} eventos con epicentro real del USGS ──")
    for r in matched:
        lat = float(r["usgs_lat"]); lon = float(r["usgs_lon"]); dep = float(r["usgs_depth"])
        eid = r["event_id"].replace("'", "''")
        lines.append(
            f"UPDATE seismic_events SET latitude = {lat}, longitude = {lon}, "
            f"depth_km = {dep}, location_source = 'SGC/USGS' WHERE event_id = '{eid}';"
        )
    lines.append("")
    lines.append(f"-- Consultado del USGS ComCat el {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}.")
    lines.append("")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Generada: {OUT}")
    print(f"  UPDATE de epicentro real: {len(matched)} eventos")


if __name__ == "__main__":
    main()
