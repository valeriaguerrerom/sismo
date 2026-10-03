"""
Cruce de los eventos de la red CM con el catálogo del USGS (ComCat) para obtener
el EPICENTRO REAL (latitud, longitud, profundidad) de cada evento.

Contexto: las coordenadas actuales de los eventos CM en seismic_events son el
CENTROIDE de las estaciones que registraron cada evento (no el epicentro). Los
MiniSEED del SGC no traen epicentro y el SGC no expone un servicio FDSN event
consultable de forma automatizada. El USGS ComCat, en cambio, federa los sismos
de Colombia y Ecuador CON epicentro real (lat/lon/profundidad revisados), pero
solo los de magnitud suficiente para el catálogo global (típicamente M >= ~4).

Qué hace:
    - Lee los 134 eventos CM de public/data/cm/index.json. El id trae la HORA DE
      ORIGEN al segundo y la MAGNITUD: CM_M{mag}_{YYYY-MM-DDTHH-MM-SS}.
    - Para cada uno consulta el USGS fdsnws/event en una ventana de ±TOL_S
      segundos alrededor de la hora de origen, en la región de Nariño y entorno.
    - Casa el evento del USGS más cercano en tiempo cuya magnitud difiera a lo
      sumo MAG_TOL. Si hay más de un candidato dentro de la tolerancia, se marca
      "ambiguo" y NO se usa (para no asignar un epicentro incorrecto).
    - Escribe un CSV con: event_id, magnitud del nombre, hora de origen, estado
      (match | sin_match | ambiguo), id del evento USGS, lat, lon, profundidad,
      diferencia de tiempo (s), diferencia de magnitud y la URL de consulta.

Uso:
    cd backend
    py scripts/match_cm_epicenters.py

Fuente del epicentro: USGS Earthquake Hazards Program (ComCat), FDSN event service.
Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import csv
import json
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

import requests

ROOT = Path(__file__).resolve().parent.parent.parent
CM_INDEX = ROOT / "public" / "data" / "cm" / "index.json"
OUT_CSV = ROOT / "backend" / "scripts" / "cm_epicenter_match.csv"

BASE = "https://earthquake.usgs.gov/fdsnws/event/1/query"
TOL_S = 8          # tolerancia temporal (segundos) alrededor de la hora de origen
MAG_TOL = 0.6      # tolerancia de magnitud entre el nombre CM y el USGS
# Región amplia (Nariño y entorno), igual que el resto del proyecto.
REGION = {"minlatitude": -1, "maxlatitude": 4, "minlongitude": -81, "maxlongitude": -75}

ID_RE = re.compile(r"CM_M([\d.]+)_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})")


def parse_id(event_id: str):
    """Extrae (magnitud, hora_de_origen_utc) del id CM. None si no casa el patrón."""
    m = ID_RE.match(event_id)
    if not m:
        return None
    mag = float(m.group(1))
    origin = datetime(
        int(m.group(2)[:4]), int(m.group(2)[5:7]), int(m.group(2)[8:10]),
        int(m.group(3)), int(m.group(4)), int(m.group(5)), tzinfo=timezone.utc,
    )
    return mag, origin


def query_usgs(origin: datetime) -> tuple[list, str]:
    """Consulta el USGS en ±TOL_S alrededor de la hora de origen. Devuelve (features, url)."""
    start = (origin - timedelta(seconds=TOL_S)).strftime("%Y-%m-%dT%H:%M:%S")
    end = (origin + timedelta(seconds=TOL_S)).strftime("%Y-%m-%dT%H:%M:%S")
    params = {"format": "geojson", "starttime": start, "endtime": end, **REGION}
    url = f"{BASE}?{urlencode(params)}"
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    return r.json().get("features", []), url


def main() -> None:
    events = json.loads(CM_INDEX.read_text(encoding="utf-8")).get("events", [])
    rows = []
    n_match = n_none = n_ambig = n_badid = 0

    for e in events:
        eid = e["id"]
        parsed = parse_id(eid)
        if not parsed:
            n_badid += 1
            rows.append({"event_id": eid, "estado": "id_no_valido"})
            continue
        mag, origin = parsed

        try:
            feats, url = query_usgs(origin)
        except Exception as ex:
            rows.append({"event_id": eid, "estado": f"error_consulta: {ex}"})
            continue

        # Candidatos cuya magnitud está dentro de la tolerancia.
        cands = []
        for f in feats:
            fmag = f["properties"].get("mag")
            if fmag is None:
                continue
            if abs(fmag - mag) <= MAG_TOL:
                t_ms = f["properties"].get("time")
                ft = datetime.fromtimestamp(t_ms / 1000, tz=timezone.utc) if t_ms else None
                dt_s = abs((ft - origin).total_seconds()) if ft else 999
                coords = f.get("geometry", {}).get("coordinates", [None, None, None])
                cands.append({
                    "usgs_id": f.get("id"), "mag": fmag,
                    "lon": coords[0], "lat": coords[1], "depth": coords[2],
                    "dt_s": round(dt_s, 1), "dmag": round(abs(fmag - mag), 2),
                    "place": f["properties"].get("place"),
                })

        base = {"event_id": eid, "mag_cm": mag, "origin_utc": origin.strftime("%Y-%m-%d %H:%M:%S"), "url": url}

        if not cands:
            n_none += 1
            rows.append({**base, "estado": "sin_match"})
        elif len(cands) > 1:
            # ¿Hay un claramente mejor (más cercano en tiempo) o es ambiguo?
            cands.sort(key=lambda c: c["dt_s"])
            if cands[1]["dt_s"] - cands[0]["dt_s"] >= 3:
                c = cands[0]
                n_match += 1
                rows.append({**base, "estado": "match", **{f"usgs_{k}": c[k] for k in ("usgs_id", "lat", "lon", "depth", "dt_s", "dmag", "place")}})
            else:
                n_ambig += 1
                rows.append({**base, "estado": "ambiguo", "candidatos": len(cands)})
        else:
            c = cands[0]
            n_match += 1
            rows.append({**base, "estado": "match", **{f"usgs_{k}": c[k] for k in ("usgs_id", "lat", "lon", "depth", "dt_s", "dmag", "place")}})

        time.sleep(0.3)  # cortesía con el servidor del USGS

    # Escribir CSV con un encabezado estable.
    cols = ["event_id", "mag_cm", "origin_utc", "estado", "usgs_usgs_id",
            "usgs_lat", "usgs_lon", "usgs_depth", "usgs_dt_s", "usgs_dmag", "usgs_place", "candidatos", "url"]
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)

    print(f"Guardado: {OUT_CSV}")
    print(f"  Total: {len(events)}  |  match: {n_match}  |  sin_match: {n_none}  |  ambiguo: {n_ambig}  |  id_no_valido: {n_badid}")


if __name__ == "__main__":
    main()
