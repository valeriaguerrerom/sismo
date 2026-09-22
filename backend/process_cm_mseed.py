"""
Procesador de sismos tectónicos de la Red Sismológica Nacional de Colombia (red CM).

Lee los archivos MiniSEED de data_raw/Colombia y data_raw/Ecuador, donde cada
archivo contiene múltiples estaciones y canales. Por cada evento y estación,
elige un instrumento triaxial (preferencia HH > HN > EH > BH), extrae las tres
componentes E/N/Z, las sincroniza, normaliza y diezma, y las exporta como JSON.

Nomenclatura de archivo: CM_M<magnitud>_<fecha>T<hora>.mseed
    Ejemplo: CM_M4.3_2023-01-15T17-59-19.mseed

Salida (compatible con el Explorer del frontend):
    public/data/cm/index.json                  -> índice de eventos + estaciones
    public/data/cm/<event_id>/<station>.json   -> sismograma triaxial por estación

Coordenadas de estación:
    TUM es oficial (federada en EarthScope/IRIS). El resto son APROXIMADAS a la
    ubicación del municipio de la estación (el metadato MiniSEED no trae lat/lon).
    Marcadas con "approx": true para que el frontend lo indique.

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana (2026)
"""
import sys
import json
import re
import math
from pathlib import Path

import numpy as np
from obspy import read


# ── Coordenadas de las estaciones (lat, lon, nombre, approx) ──
# TUM es oficial (EarthScope/IRIS). Las demás son aproximadas al municipio.
STATION_COORDS: dict[str, dict] = {
    "TUM":   {"lat": 1.8237, "lon": -78.7267, "name": "Tumaco, Nariño", "approx": False},
    "TUM3C": {"lat": 1.8200, "lon": -78.7300, "name": "Tumaco, Nariño", "approx": True},
    "PAS2":  {"lat": 1.2136, "lon": -77.2811, "name": "Pasto, Nariño", "approx": True},
    "CUM":   {"lat": 0.9000, "lon": -77.7800, "name": "Cumbal, Nariño", "approx": True},
    "CRU":   {"lat": 1.6000, "lon": -76.9700, "name": "La Cruz, Nariño", "approx": True},
    "CPOP2": {"lat": 2.4400, "lon": -76.6100, "name": "Popayán, Cauca", "approx": True},
    "BBAC":  {"lat": 1.2000, "lon": -77.3000, "name": "Nariño (aprox.)", "approx": True},
}

# Prioridad de prefijo de canal al elegir el instrumento por estación.
INSTRUMENT_PRIORITY = ["HH", "BH", "HN", "EH", "EL"]

# Descripción del tipo de instrumento y magnitud física registrada.
INSTRUMENT_INFO = {
    "HH": ("Velocímetro banda ancha", "Velocidad"),
    "BH": ("Velocímetro banda ancha (baja tasa)", "Velocidad"),
    "HN": ("Acelerómetro", "Aceleración"),
    "HL": ("Acelerómetro", "Aceleración"),
    "EH": ("Velocímetro periodo corto", "Velocidad"),
    "EL": ("Velocímetro periodo corto", "Velocidad"),
}


def parse_filename(name: str) -> dict:
    """Extrae magnitud, fecha y hora del nombre del archivo CM.

    Formato: CM_M<magnitud>_<YYYY-MM-DD>T<HH-MM-SS>.mseed

    Args:
        name: Nombre del archivo .mseed.

    Returns:
        dict con magnitude, date, time; vacío si no parsea.
    """
    m = re.match(r"CM_M([\d.]+)_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})", name)
    if not m:
        return {}
    mag, date, hh, mm, ss = m.groups()
    return {
        "magnitude": float(mag),
        "date": date,
        "time": f"{hh}:{mm}:{ss}",
    }


def component_of(channel: str) -> str | None:
    """Devuelve la componente ('E'/'N'/'Z') a partir del código de canal."""
    if not channel:
        return None
    last = channel[-1].upper()
    return last if last in ("E", "N", "Z") else None


def pick_instrument(traces_by_channel: dict[str, list]) -> tuple[str, dict[str, object]] | None:
    """Selecciona el mejor instrumento triaxial de una estación.

    Agrupa las trazas por prefijo de canal y elige el de mayor prioridad que
    tenga las tres componentes E/N/Z.

    Args:
        traces_by_channel: dict {prefijo -> {comp -> Trace}}.

    Returns:
        (prefijo, {comp: Trace}) o None si ninguno es triaxial.
    """
    for pref in INSTRUMENT_PRIORITY:
        comps = traces_by_channel.get(pref)
        if comps and all(c in comps for c in ("E", "N", "Z")):
            return pref, comps
    for pref, comps in traces_by_channel.items():
        if all(c in comps for c in ("E", "N", "Z")):
            return pref, comps
    return None


def process_station(comps: dict[str, object], max_samples: int = 3000) -> dict | None:
    """Sincroniza, normaliza y diezma las 3 componentes de una estación.

    Args:
        comps: dict {comp -> Trace} con las componentes E, N, Z.
        max_samples: máximo de muestras por componente en la salida.

    Returns:
        dict con waveData, duration, sampling_rate, num_samples, had_gaps;
        o None si no es procesable.
    """
    traces = {c: comps[c] for c in ("E", "N", "Z")}

    # Sincronización a ventana común
    starttimes = {c: traces[c].stats.starttime for c in traces}
    endtimes = {c: traces[c].stats.endtime for c in traces}
    common_start = max(starttimes.values())
    common_end = min(endtimes.values())
    if common_start >= common_end:
        return None

    had_gaps = len(set(traces[c].stats.npts for c in traces)) > 1
    for c in traces:
        traces[c].trim(starttime=common_start, endtime=common_end)

    min_npts = min(traces[c].stats.npts for c in traces)
    if min_npts < 10:
        return None
    for c in traces:
        if traces[c].stats.npts > min_npts:
            traces[c].data = traces[c].data[:min_npts]
            traces[c].stats.npts = min_npts

    original_sr = traces["Z"].stats.sampling_rate
    npts_original = traces["Z"].stats.npts

    # Diezmado con filtro antialias (mismo factor para las 3)
    if npts_original > max_samples:
        test_factor = math.ceil(npts_original / max_samples)
        for c in traces:
            remaining = test_factor
            while remaining > 1:
                this_pass = min(16, remaining)
                if this_pass < 2:
                    break
                traces[c].decimate(factor=this_pass, no_filter=False)
                remaining = math.ceil(remaining / this_pass)

    # Detrend + normalización global
    data = {}
    for c in traces:
        arr = traces[c].data.astype(np.float64)
        arr = arr - np.mean(arr)
        data[c] = arr
    max_global = max(np.max(np.abs(a)) for a in data.values())
    if max_global < 1e-30:
        max_global = 1.0
    for c in data:
        data[c] = data[c] / max_global

    sr = traces["Z"].stats.sampling_rate
    npts = traces["Z"].stats.npts
    dt = 1.0 / sr
    times = [i * dt for i in range(npts)]

    return {
        "sampling_rate": round(sr, 2),
        "original_sampling_rate": original_sr,
        "duration": round(times[-1] if times else 0.0, 2),
        "num_samples": npts,
        "had_gaps": had_gaps,
        "normalization_factor": float(max_global),
        "waveData": {
            "time": times,
            "north": data["N"].tolist(),
            "east": data["E"].tolist(),
            "vertical": data["Z"].tolist(),
        },
    }


def process_event(mseed_path: Path, folder_name: str, out_dir: Path) -> dict | None:
    """Procesa un evento CM completo: todas sus estaciones triaxiales.

    Args:
        mseed_path: Ruta al archivo .mseed del evento.
        folder_name: Región de origen ('Colombia' o 'Ecuador').
        out_dir: Carpeta base de salida (public/data/cm).

    Returns:
        Resumen del evento para el índice, o None si no hay estaciones útiles.
    """
    meta = parse_filename(mseed_path.name)
    if not meta:
        print(f"  [SKIP] Nombre no parseable: {mseed_path.name}")
        return None

    event_id = mseed_path.stem  # nombre sin extensión, único
    try:
        st = read(str(mseed_path))
    except Exception as e:
        print(f"  [ERROR] Lectura {mseed_path.name}: {e}")
        return None

    # Agrupar: estación -> prefijo_canal -> {comp: Trace}
    grouped: dict[str, dict[str, dict[str, object]]] = {}
    for tr in st:
        station = tr.stats.station
        if station not in STATION_COORDS:
            continue  # solo estaciones con coordenadas conocidas
        comp = component_of(tr.stats.channel)
        if not comp:
            continue
        pref = tr.stats.channel[:2].upper()
        grouped.setdefault(station, {}).setdefault(pref, {})[comp] = tr

    if not grouped:
        print(f"  [SKIP] Sin estaciones triaxiales conocidas: {mseed_path.name}")
        return None

    event_dir = out_dir / event_id
    station_summaries = []

    for station, by_channel in sorted(grouped.items()):
        picked = pick_instrument(by_channel)
        if not picked:
            continue
        prefix, comps = picked
        processed = process_station(comps)
        if not processed:
            continue

        instr_name, phys = INSTRUMENT_INFO.get(prefix, ("Desconocido", "—"))
        coords = STATION_COORDS[station]

        # Guardar JSON de la estación (con waveData)
        event_dir.mkdir(parents=True, exist_ok=True)
        station_file = event_dir / f"{station}.json"
        with open(station_file, "w", encoding="utf-8") as f:
            json.dump({
                "event_id": event_id,
                "station": station,
                "instrument_type": instr_name,
                "physical_quantity": phys,
                "sampling_rate": processed["sampling_rate"],
                "duration": processed["duration"],
                "waveData": processed["waveData"],
            }, f, ensure_ascii=False)

        station_summaries.append({
            "station": station,
            "location": coords["name"],
            "instrument_type": instr_name,
            "physical_quantity": phys,
            "sampling_rate": processed["sampling_rate"],
            "duration": processed["duration"],
            "num_samples": processed["num_samples"],
            "had_gaps": processed["had_gaps"],
            "latitude": coords["lat"],
            "longitude": coords["lon"],
            "approx_location": coords["approx"],
        })

    if not station_summaries:
        print(f"  [SKIP] Ninguna estación procesable: {mseed_path.name}")
        return None

    print(f"  OK {event_id} — {len(station_summaries)} estaciones: {', '.join(s['station'] for s in station_summaries)}")

    return {
        "id": event_id,
        "magnitude": meta["magnitude"],
        "date": meta["date"],
        "time": meta["time"],
        "folder": folder_name,
        "stations": station_summaries,
    }


def main():
    """Procesa Colombia + Ecuador y genera el índice combinado."""
    args = sys.argv[1:]
    base = Path("data_raw")
    out_dir = Path("../public/data/cm")
    if "--output" in args:
        out_dir = Path(args[args.index("--output") + 1])

    out_dir.mkdir(parents=True, exist_ok=True)

    regions = ["Colombia", "Ecuador"]
    all_events = []

    for region in regions:
        region_dir = base / region
        if not region_dir.exists():
            print(f"[AVISO] No existe {region_dir}, se omite.")
            continue
        files = sorted(region_dir.glob("*.mseed"))
        print(f"\n=== {region}: {len(files)} archivos ===")
        for f in files:
            print(f"Procesando: {f.name}...")
            summary = process_event(f, region, out_dir)
            if summary:
                all_events.append(summary)

    # Ordenar por fecha descendente
    all_events.sort(key=lambda e: (e["date"], e["time"]), reverse=True)

    index_file = out_dir / "index.json"
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump({"events": all_events, "count": len(all_events)}, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 60}")
    print(f"Eventos procesados: {len(all_events)}")
    print(f"Salida: {out_dir.resolve()}")


if __name__ == "__main__":
    main()
