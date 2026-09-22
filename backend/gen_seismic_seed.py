"""
Generador del seed SQL del catálogo sísmico (Opción A: solo metadatos).

Lee los índices JSON reales (public/data/cm y public/data/galeras) y produce
supabase/seed/seismic_events_full.sql con un INSERT por evento (166 en total).

Diseño:
    - CM (tectónicos): coordenada = centroide de las estaciones (los eventos no
      traen epicentro). magnitud del nombre del archivo. depth_km NULL (sin dato).
    - Galeras (volcánicos): coordenada fija del cráter (1.2216, -77.3742).
      magnitud y depth_km NULL (los MiniSEED del Galeras no las traen).
    - region: 'Colombia' | 'Ecuador' | 'Nariño (Galeras)'.
    - event_id: id original (para localizar el JSON de detalle).

Uso:
    cd backend
    py gen_seismic_seed.py

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CM_INDEX = ROOT / "public" / "data" / "cm" / "index.json"
GAL_INDEX = ROOT / "public" / "data" / "galeras" / "index.json"
OUT = ROOT / "supabase" / "seed" / "seismic_events_full.sql"

GALERAS_LAT, GALERAS_LON = 1.2216, -77.3742
SUBTYPE_LABEL = {"lp": "Largo Período", "to": "Tornillo", "tr": "Tremor", "va": "Volcano-Tectónico"}


def sql_str(v) -> str:
    """Formatea un valor como literal SQL (NULL o texto escapado)."""
    if v is None or v == "":
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_num(v) -> str:
    """Formatea un número como literal SQL, o NULL si no hay dato."""
    if v is None:
        return "NULL"
    return str(v)


def build_rows() -> tuple[list[str], list[str]]:
    """Construye las filas INSERT para CM y Galeras.

    Returns:
        (filas_cm, filas_galeras) — listas de cadenas VALUES(...).
    """
    cm = json.loads(CM_INDEX.read_text(encoding="utf-8")).get("events", [])
    gal = json.loads(GAL_INDEX.read_text(encoding="utf-8")).get("events", [])

    cols = ("event_id, event_date, event_time, magnitude, depth_km, latitude, "
            "longitude, location_name, event_type, volcanic_subtype, region, "
            "station_count, source")

    cm_rows = []
    for e in cm:
        stations = e.get("stations", [])
        # Centroide de las estaciones (los eventos CM no traen epicentro).
        if stations:
            lat = round(sum(s["latitude"] for s in stations) / len(stations), 6)
            lon = round(sum(s["longitude"] for s in stations) / len(stations), 6)
        else:
            lat, lon = 1.5, -78.1
        region = e.get("folder", "Colombia")
        loc = f"Red CM — {region}"
        cm_rows.append(
            f"({sql_str(e['id'])}, {sql_str(e['date'])}, {sql_str(e['time'])}, "
            f"{sql_num(e.get('magnitude'))}, NULL, {lat}, {lon}, {sql_str(loc)}, "
            f"'tectonic', NULL, {sql_str(region)}, {len(stations)}, 'SGC-RSNC')"
        )

    gal_rows = []
    for e in gal:
        sub = e.get("volcanic_subtype") or None
        label = SUBTYPE_LABEL.get(sub, "Volcánico") if sub else "Volcánico (sin clasificar)"
        loc = f"Volcán Galeras — {label}"
        gal_rows.append(
            f"({sql_str(e['id'])}, {sql_str(e['event_date'])}, {sql_str(e['event_time'])}, "
            f"NULL, NULL, {GALERAS_LAT}, {GALERAS_LON}, {sql_str(loc)}, "
            f"'volcanic', {sql_str(sub)}, 'Nariño (Galeras)', 1, 'SGC-OVSP')"
        )

    return cols, cm_rows, gal_rows


def main():
    cols, cm_rows, gal_rows = build_rows()
    OUT.parent.mkdir(parents=True, exist_ok=True)

    lines = []
    lines.append("-- =============================================")
    lines.append("-- SEED: catálogo sísmico completo (166 eventos)")
    lines.append("-- =============================================")
    lines.append("-- Generado por backend/gen_seismic_seed.py desde los índices JSON")
    lines.append("-- reales (public/data/cm y public/data/galeras). NO editar a mano;")
    lines.append("-- regenerar con: cd backend && py gen_seismic_seed.py")
    lines.append("--")
    lines.append("-- LIMITACIONES DE LOS DATOS (para la sección de limitaciones de la tesis):")
    lines.append("--   * magnitude es NULL en los 32 eventos volcánicos del Galeras: los")
    lines.append("--     registros MiniSEED del OVSP no incluyen magnitud calculada.")
    lines.append("--   * depth_km es NULL en TODOS los eventos: ni los CM ni los Galeras")
    lines.append("--     traen profundidad focal en los datos disponibles.")
    lines.append("--   * En los eventos CM la latitud/longitud es el CENTROIDE de las")
    lines.append("--     estaciones que registraron el evento, no el epicentro real")
    lines.append("--     (los datos no traen epicentro). Coordenadas de estación en su")
    lines.append("--     mayoría aproximadas al municipio (ver core/stations.py).")
    lines.append("--   * Los eventos del Galeras usan la coordenada fija del cráter.")
    lines.append("-- =============================================")
    lines.append("")
    lines.append("-- Reinicio idempotente: limpia el catálogo antes de sembrar.")
    lines.append("DELETE FROM seismic_events;")
    lines.append("")
    lines.append(f"-- ── {len(cm_rows)} eventos tectónicos (Red CM: Colombia + Ecuador) ──")
    lines.append(f"INSERT INTO seismic_events ({cols}) VALUES")
    lines.append(",\n".join(cm_rows) + ";")
    lines.append("")
    lines.append(f"-- ── {len(gal_rows)} eventos volcánicos (Volcán Galeras, 2006) ──")
    lines.append("-- Los eventos con volcanic_subtype NULL son los 10 registros originales")
    lines.append("-- del Galeras, procesados antes de la clasificación por tipo; a")
    lines.append("-- diferencia de los 22 restantes que sí tienen lp / to / tr / va.")
    lines.append(f"INSERT INTO seismic_events ({cols}) VALUES")
    lines.append(",\n".join(gal_rows) + ";")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Generado: {OUT}")
    print(f"  CM: {len(cm_rows)}  |  Galeras: {len(gal_rows)}  |  Total: {len(cm_rows) + len(gal_rows)}")


if __name__ == "__main__":
    main()
