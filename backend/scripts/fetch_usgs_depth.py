"""
Descarga una sola vez el catálogo del USGS (ComCat) para la región de Nariño y
alrededores, y lo guarda como JSON estático para el laboratorio de profundidad
de la sección Educación.

Por qué un script (y no una llamada en tiempo de ejecución): la política de
seguridad de contenido (CSP) del frontend no permite pedir datos a dominios
externos como earthquake.usgs.gov desde el navegador. Por eso los datos se
descargan aquí, una vez, y se versionan como archivo estático que el frontend
lee desde su propio origen.

Región y filtros (según lo pedido):
    latitud 0 a 3, longitud -80 a -76, magnitud >= 4.0, desde 1980-01-01.

Salida:
    public/data/usgs_narino.json con:
      - consulta: fecha de consulta (UTC) y la URL EXACTA usada.
      - eventos: lista con fecha, magnitud, profundidad (km), lat, lon y lugar.

Uso:
    cd backend
    py scripts/fetch_usgs_depth.py

Fuente: USGS Earthquake Hazards Program, FDSN event web service (ComCat).
Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

import requests

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "public" / "data" / "usgs_narino.json"

BASE = "https://earthquake.usgs.gov/fdsnws/event/1/query"
PARAMS = {
    "format": "geojson",
    "starttime": "1980-01-01",
    "minlatitude": 0,
    "maxlatitude": 3,
    "minlongitude": -80,
    "maxlongitude": -76,
    "minmagnitude": 4,
    "orderby": "time",
}


def main() -> None:
    url = f"{BASE}?{urlencode(PARAMS)}"
    print(f"Consultando USGS ComCat:\n  {url}")
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    gj = r.json()

    eventos = []
    for feat in gj.get("features", []):
        p = feat.get("properties", {})
        geom = feat.get("geometry", {})
        coords = geom.get("coordinates", [None, None, None])
        lon, lat, depth = coords[0], coords[1], coords[2]
        if lon is None or lat is None or depth is None:
            continue
        mag = p.get("mag")
        t_ms = p.get("time")
        # time viene en milisegundos epoch UTC.
        fecha = (
            datetime.fromtimestamp(t_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
            if t_ms else None
        )
        eventos.append({
            "id": feat.get("id"),
            "fecha": fecha,
            "magnitud": round(mag, 1) if mag is not None else None,
            "profundidad_km": round(depth, 1),
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "lugar": p.get("place"),
        })

    out = {
        "consulta": {
            "fuente": "USGS Earthquake Hazards Program (ComCat), FDSN event web service.",
            "url": url,
            "consultado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "region": {"lat": [0, 3], "lon": [-80, -76]},
            "filtros": {"magnitud_minima": 4.0, "desde": "1980-01-01"},
        },
        "eventos": eventos,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Guardado: {OUT}")
    print(f"  Eventos: {len(eventos)}  |  Consultado: {out['consulta']['consultado_utc']}")


if __name__ == "__main__":
    main()
