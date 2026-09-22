"""
Procesador de sismos volcánicos del Volcán Galeras por tipo de evento.

Procesa las carpetas de data_raw/datos_mseed organizadas por tipo de
sismicidad volcánica:
    lp -> Largo Período (movimiento de fluidos/magma)
    to -> Tornillo (resonancia de conductos, precursor de erupciones)
    tr -> Tremor (vibración sostenida)
    va -> Volcano-Tectónico (fractura de roca)

Cada carpeta de evento (ej. 0602022301GLP) contiene una traza .mseed por
estación/canal con el patrón: ESTACION.RED.LOC.CANAL.fecha_estaciones.mseed
(ej. CUFP.CM.00.HHZ.02022301_estaciones.mseed).

Selección de estación: se prefiere CUFP con canales broadband HH (las tres
componentes E/N/Z). Si no está disponible, se cae a cualquier estación con
las 3 componentes, priorizando HH sobre HN/EL.

Salida: JSON individual por evento + índice, en el mismo formato que los
datos del Galeras existentes (public/data/galeras), añadiendo el campo
`volcanic_subtype` (lp/to/tr/va).

Uso:
    py process_galeras_types.py [--input data_raw/datos_mseed] [--output ../public/data/galeras]

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana (2026)
"""
import sys
import json
import re
import math
from pathlib import Path

import numpy as np
from obspy import read


# Mapeo de sufijo de carpeta -> subtipo volcánico y etiqueta legible.
SUBTYPE_MAP = {
    "GLP": ("lp", "Largo Período"),
    "GTO": ("to", "Tornillo"),
    "GTR": ("tr", "Tremor"),
    "GVA": ("va", "Volcano-Tectónico"),
}

# Coordenadas del cráter del Galeras (usadas como epicentro aproximado).
GALERAS_LAT = 1.2216
GALERAS_LON = -77.3742

# Prioridad de prefijo de canal (broadband HH preferido).
CHANNEL_PRIORITY = ["HH", "BH", "HN", "EL", "EH"]


def parse_event_folder_name(name: str) -> dict:
    """Extrae fecha, hora y subtipo del nombre de carpeta.

    Formato: YYMMDDHHMM + sufijo (GLP, GTO, GTR, GVA).
    Ejemplo: 0602022301GLP -> 2006-02-02 23:01, subtipo 'lp'.

    Args:
        name: Nombre de la carpeta del evento.

    Returns:
        dict con event_date, event_time, subtype, subtype_label; vacío si no parsea.
    """
    match = re.match(r"(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(G[A-Z]{2})", name)
    if not match:
        return {}
    yy, mm, dd, hh, mi, suffix = match.groups()
    if suffix not in SUBTYPE_MAP:
        return {}
    subtype, label = SUBTYPE_MAP[suffix]
    year = 2000 + int(yy)
    return {
        "event_date": f"{year}-{mm}-{dd}",
        "event_time": f"{hh}:{mi}:00",
        "subtype": subtype,
        "subtype_label": label,
    }


def component_of(channel: str) -> str | None:
    """Devuelve la componente ('E'/'N'/'Z') a partir del código de canal."""
    if not channel:
        return None
    last = channel[-1].upper()
    return last if last in ("E", "N", "Z") else None


def find_triaxial_station(folder: Path) -> dict[str, Path]:
    """Busca la mejor estación con 3 componentes (E, N, Z) en la carpeta.

    Los archivos siguen el patrón ESTACION.RED.LOC.CANAL.fecha_estaciones.mseed.
    Se agrupan por estación y se elige la que tenga las 3 componentes con el
    prefijo de canal de mayor prioridad (HH broadband primero). Se prefiere la
    estación CUFP cuando cumple.

    Args:
        folder: Ruta a la carpeta del evento.

    Returns:
        dict con claves 'E', 'N', 'Z' -> Path; o vacío si no hay estación triaxial.
    """
    files = list(folder.glob("*.mseed"))

    # station -> channel_prefix -> {comp: Path}
    stations: dict[str, dict[str, dict[str, Path]]] = {}
    for f in files:
        parts = f.name.split(".")
        if len(parts) < 4:
            continue
        station = parts[0]
        channel = parts[3]
        comp = component_of(channel)
        if not comp:
            continue
        prefix = channel[:2].upper()
        stations.setdefault(station, {}).setdefault(prefix, {})[comp] = f

    def best_prefix_for(station: str) -> dict[str, Path] | None:
        """Devuelve el mejor grupo triaxial de una estación, según prioridad."""
        prefixes = stations.get(station, {})
        for pref in CHANNEL_PRIORITY:
            comps = prefixes.get(pref)
            if comps and all(c in comps for c in ("E", "N", "Z")):
                return comps
        # Prefijo no listado pero con 3 componentes
        for comps in prefixes.values():
            if all(c in comps for c in ("E", "N", "Z")):
                return comps
        return None

    # 1) Preferir CUFP
    if "CUFP" in stations:
        comps = best_prefix_for("CUFP")
        if comps:
            return comps

    # 2) Cualquier estación con 3 componentes, priorizando HH
    for pref in CHANNEL_PRIORITY:
        for station, prefixes in stations.items():
            comps = prefixes.get(pref)
            if comps and all(c in comps for c in ("E", "N", "Z")):
                return comps

    # 3) Cualquier estación triaxial sin importar prefijo
    for station in stations:
        comps = best_prefix_for(station)
        if comps:
            return comps

    return {}


def process_event(folder: Path, meta: dict, max_samples: int = 3000) -> dict | None:
    """Procesa un evento: lee las 3 componentes, sincroniza, normaliza y diezma.

    Args:
        folder: Ruta a la carpeta del evento.
        meta: Metadatos parseados del nombre (fecha, hora, subtipo).
        max_samples: Máximo de muestras por componente en la salida.

    Returns:
        dict con metadatos + waveData, o None si el evento no es procesable.
    """
    comps = find_triaxial_station(folder)
    if not comps or "Z" not in comps:
        print(f"  [SKIP] Sin estación triaxial: {folder.name}")
        return None

    try:
        traces = {c: read(str(comps[c]))[0] for c in ("E", "N", "Z")}

        # ── Sincronización temporal a ventana común ──
        starttimes = {c: traces[c].stats.starttime for c in traces}
        endtimes = {c: traces[c].stats.endtime for c in traces}
        common_start = max(starttimes.values())
        common_end = min(endtimes.values())
        if common_start >= common_end:
            print(f"  [ERROR] Componentes no se solapan en tiempo: {folder.name}")
            return None

        sync_warning = None
        npts_orig = {c: traces[c].stats.npts for c in traces}
        if len(set(npts_orig.values())) > 1 or any(
            abs(starttimes[c] - common_start) > 0.5 / traces[c].stats.sampling_rate
            or abs(endtimes[c] - common_end) > 0.5 / traces[c].stats.sampling_rate
            for c in traces
        ):
            sync_warning = (
                f"Componentes recortadas a ventana común: "
                f"start={common_start}, end={common_end}. npts originales: {dict(npts_orig)}"
            )
            for c in traces:
                traces[c].trim(starttime=common_start, endtime=common_end)

        # Forzar misma longitud
        min_npts = min(traces[c].stats.npts for c in traces)
        for c in traces:
            if traces[c].stats.npts > min_npts:
                traces[c].data = traces[c].data[:min_npts]
                traces[c].stats.npts = min_npts

        tr_ref = traces["Z"]
        original_sr = tr_ref.stats.sampling_rate
        station_name = tr_ref.stats.station
        npts_original = tr_ref.stats.npts

        # ── Diezmado con filtro antialias (mismo factor para las 3) ──
        decimation_factor = 1
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
            decimation_factor = math.ceil(npts_original / traces["Z"].stats.npts)

        # ── Detrend por componente + normalización global ──
        data_arrays = {}
        for c in traces:
            arr = traces[c].data.astype(np.float64)
            arr = arr - np.mean(arr)
            data_arrays[c] = arr
        max_global = max(np.max(np.abs(arr)) for arr in data_arrays.values())
        if max_global < 1e-30:
            max_global = 1.0
        for c in data_arrays:
            data_arrays[c] = data_arrays[c] / max_global

        # ── Construir salida ──
        effective_sr = traces["Z"].stats.sampling_rate
        npts_final = traces["Z"].stats.npts
        dt = 1.0 / effective_sr
        times = [i * dt for i in range(npts_final)]
        duration = times[-1] if times else 0.0

        result = {
            "id": folder.name,
            "event_date": meta["event_date"],
            "event_time": meta["event_time"],
            "station": station_name,
            "sampling_rate": effective_sr,
            "original_sampling_rate": original_sr,
            "decimation_factor": decimation_factor,
            "normalization_factor": float(max_global),
            "duration": round(duration, 2),
            "num_samples": npts_final,
            "components": ["E", "N", "Z"],
            "event_type": "volcanic",
            "volcanic_subtype": meta["subtype"],
            "volcanic_subtype_label": meta["subtype_label"],
            "source": "SGC-OVSP",
            "location_name": f"Volcán Galeras — {meta['subtype_label']} — Estación {station_name}",
            "waveData": {
                "time": times,
                "north": data_arrays["N"].tolist(),
                "east": data_arrays["E"].tolist(),
                "vertical": data_arrays["Z"].tolist(),
            },
        }
        if sync_warning:
            result["sync_warning"] = sync_warning
        return result

    except Exception as e:
        print(f"  [ERROR] {folder.name}: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    """Procesa todos los tipos de eventos y genera JSON + índice combinado."""
    # Parseo simple de argumentos
    args = sys.argv[1:]
    input_dir = Path("data_raw/datos_mseed")
    output_dir = Path("../public/data/galeras")
    if "--input" in args:
        input_dir = Path(args[args.index("--input") + 1])
    if "--output" in args:
        output_dir = Path(args[args.index("--output") + 1])

    if not input_dir.exists():
        print(f"Error: No existe {input_dir}")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    # Conservar los eventos ya presentes en el índice (los 10 originales del Galeras)
    existing_events = []
    index_file = output_dir / "index.json"
    if index_file.exists():
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                existing_events = json.load(f).get("events", [])
        except Exception:
            existing_events = []
    existing_ids = {e.get("id") for e in existing_events}

    new_summaries = []
    processed = 0
    total_folders = 0

    for subdir in sorted(input_dir.iterdir()):
        if not subdir.is_dir():
            continue
        event_folders = sorted([f for f in subdir.iterdir() if f.is_dir()])
        for folder in event_folders:
            meta = parse_event_folder_name(folder.name)
            if not meta:
                print(f"  [SKIP] No se pudo parsear: {folder.name}")
                continue
            total_folders += 1
            print(f"Procesando [{meta['subtype']}]: {folder.name}...")
            result = process_event(folder, meta)
            if not result:
                continue

            event_file = output_dir / f"{folder.name}.json"
            with open(event_file, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False)
            print(
                f"  OK {result['station']} — {result['num_samples']} muestras, "
                f"{result['duration']}s, SR {result['original_sampling_rate']}->{result['sampling_rate']} Hz"
            )

            summary = {k: v for k, v in result.items() if k != "waveData"}
            new_summaries.append(summary)
            processed += 1

    # Combinar con los existentes que no fueron reprocesados
    merged = [e for e in existing_events if e.get("id") not in {s["id"] for s in new_summaries}]
    merged.extend(new_summaries)
    # Ordenar por fecha
    merged.sort(key=lambda e: (e.get("event_date", ""), e.get("event_time", "")))

    with open(index_file, "w", encoding="utf-8") as f:
        json.dump({"events": merged, "count": len(merged)}, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 60}")
    print(f"Nuevos procesados: {processed}/{total_folders}")
    print(f"Total en índice (incluye {len(existing_ids)} previos): {len(merged)}")
    print(f"Salida: {output_dir.resolve()}")


if __name__ == "__main__":
    main()
