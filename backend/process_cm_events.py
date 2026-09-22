"""
Procesador de datos MiniSEED — Red Sismológica Nacional de Colombia (CM)
========================================================================

Lee archivos .mseed de backend/data_raw/{Col_full,Colombia,Ecuador}/,
selecciona UN instrumento por estación (máx 7 estaciones por evento),
normaliza globalmente, diezma con filtro antialias conservando ≥40 Hz,
y exporta JSON a public/data/cm/.

Correcciones v2:
    1. Selección por estación (no por location code) — máx 7 registros/evento
    2. Frecuencia mínima de 40 Hz post-diezmado (no un tope fijo de muestras)
    3. merge con fill_value=None — huecos masked → descarte de estación
    4. Metadatos completos, codificación UTF-8

Uso:
    cd backend
    py process_cm_events.py

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import sys
import json
import re
import math
from pathlib import Path
from collections import defaultdict

import numpy as np
from obspy import read

# ─────────────────────────────────────────────────────────────────────
# Configuración
# ─────────────────────────────────────────────────────────────────────
DATA_RAW = Path("data_raw")
OUTPUT_DIR = Path("../public/data/cm")
MIN_SR_AFTER_DECIMATE = 40.0  # Hz — no diezmar por debajo de esto

# Orden de preferencia de instrumento
INSTRUMENT_PREFERENCE = ["HH", "EH", "BH", "HN"]

INSTRUMENT_INFO = {
    "HH": ("velocimetro broadband", "velocidad"),
    "EH": ("velocimetro short period", "velocidad"),
    "BH": ("velocimetro broadband (baja tasa)", "velocidad"),
    "HN": ("acelerometro strong motion", "aceleracion"),
    "HL": ("acelerometro strong motion (low gain)", "aceleracion"),
}


# ─────────────────────────────────────────────────────────────────────
# Utilidades
# ─────────────────────────────────────────────────────────────────────
def parse_cm_filename(name: str) -> dict:
    """Extrae event_id, magnitud y fecha del nombre CM."""
    match = re.match(
        r"(CM_M[\d.]+_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.mseed", name
    )
    if not match:
        return {}
    event_id = match.group(1)
    detail = re.match(
        r"CM_M([\d.]+)_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})", event_id
    )
    if not detail:
        return {}
    mag, date_str, hh, mm, ss = detail.groups()
    return {
        "event_id": event_id,
        "magnitude": float(mag),
        "date": date_str,
        "time": f"{hh}:{mm}:{ss}",
    }


def get_channel_prefix(channel: str) -> str:
    return channel[:2] if len(channel) >= 2 else channel


def component_from_channel(channel: str) -> str:
    if not channel:
        return "?"
    c = channel[-1].upper()
    if c in ("1", "E"):
        return "E"
    elif c in ("2", "N"):
        return "N"
    elif c in ("3", "Z"):
        return "Z"
    return c


# ─────────────────────────────────────────────────────────────────────
# Procesamiento
# ─────────────────────────────────────────────────────────────────────
def process_file(filepath: Path, subfolder: str) -> tuple[list[dict], list[str]]:
    """Procesa un archivo mseed.

    Returns:
        (lista de dicts por estación procesada, lista de motivos de descarte)
    """
    file_info = parse_cm_filename(filepath.name)
    if not file_info:
        return [], ["nombre no reconocido"]

    try:
        st = read(str(filepath))
    except Exception as e:
        return [], [f"error lectura: {e}"]

    # ── 1. Merge con fill_value=None (masked array en huecos) ──
    num_traces_before = len(st)
    st.merge(method=1, fill_value=None)
    num_traces_after = len(st)
    had_gaps = num_traces_before > num_traces_after
    gap_count = num_traces_before - num_traces_after if had_gaps else 0

    # ── 2. Group traces by STATION only ──
    # station -> prefix -> location -> component -> trace
    station_data: dict[str, dict[str, dict[str, dict[str, object]]]] = {}

    for tr in st:
        sta = tr.stats.station
        chan = tr.stats.channel
        loc = tr.stats.location or ""
        prefix = get_channel_prefix(chan)
        comp = component_from_channel(chan)

        if comp not in ("E", "N", "Z"):
            continue

        if sta not in station_data:
            station_data[sta] = {}
        if prefix not in station_data[sta]:
            station_data[sta][prefix] = {}
        if loc not in station_data[sta][prefix]:
            station_data[sta][prefix][loc] = {}

        station_data[sta][prefix][loc][comp] = tr

    # ── 3. For each station, select best instrument ──
    results = []
    discard_reasons = []

    for station, prefixes in station_data.items():
        chosen_prefix = None
        chosen_loc = None
        chosen_traces = None

        for pref in INSTRUMENT_PREFERENCE:
            if pref not in prefixes:
                continue
            # Among location codes with this prefix, pick best
            best_loc = None
            best_npts = 0
            for loc, comps in prefixes[pref].items():
                if {"E", "N", "Z"}.issubset(comps.keys()):
                    # Has all 3 components — pick by max npts
                    npts = min(comps[c].stats.npts for c in ("E", "N", "Z"))
                    if npts > best_npts:
                        best_npts = npts
                        best_loc = loc
            if best_loc is not None:
                chosen_prefix = pref
                chosen_loc = best_loc
                chosen_traces = prefixes[pref][best_loc]
                break

        if chosen_prefix is None:
            discard_reasons.append(f"{station}: sin triaxial completo")
            continue

        tr_e = chosen_traces["E"]
        tr_n = chosen_traces["N"]
        tr_z = chosen_traces["Z"]

        # ── Check for masked data (gaps) ──
        has_mask = False
        for tr in (tr_e, tr_n, tr_z):
            if isinstance(tr.data, np.ma.MaskedArray) and tr.data.mask.any():
                has_mask = True
                break

        if has_mask:
            discard_reasons.append(f"{station}: huecos en registro (masked data)")
            continue

        # ── 4. Sync: trim to common time window ──
        original_sr = tr_z.stats.sampling_rate
        starttimes = [tr_e.stats.starttime, tr_n.stats.starttime, tr_z.stats.starttime]
        endtimes = [tr_e.stats.endtime, tr_n.stats.endtime, tr_z.stats.endtime]

        common_start = max(starttimes)
        common_end = min(endtimes)

        if common_start >= common_end:
            discard_reasons.append(f"{station}: componentes no se solapan")
            continue

        # Max misalignment
        times_float = [float(t.timestamp) for t in starttimes]
        max_desfase = max(times_float) - min(times_float)

        # Trim if needed
        needs_trim = (
            abs(tr_e.stats.starttime - common_start) > 0.5 / original_sr
            or abs(tr_n.stats.starttime - common_start) > 0.5 / original_sr
            or abs(tr_z.stats.starttime - common_start) > 0.5 / original_sr
            or tr_e.stats.npts != tr_n.stats.npts
            or tr_e.stats.npts != tr_z.stats.npts
        )

        if needs_trim:
            tr_e.trim(starttime=common_start, endtime=common_end)
            tr_n.trim(starttime=common_start, endtime=common_end)
            tr_z.trim(starttime=common_start, endtime=common_end)

        # Force same npts
        min_npts = min(tr_e.stats.npts, tr_n.stats.npts, tr_z.stats.npts)
        for tr in (tr_e, tr_n, tr_z):
            if tr.stats.npts > min_npts:
                tr.data = tr.data[:min_npts]
                tr.stats.npts = min_npts

        if min_npts < 10:
            discard_reasons.append(f"{station}: muy pocas muestras ({min_npts})")
            continue

        # ── 5. Decimate: keep ≥ 40 Hz ──
        decimation_factor = int(math.floor(original_sr / MIN_SR_AFTER_DECIMATE))
        if decimation_factor < 2:
            decimation_factor = 1  # No decimate

        if decimation_factor > 1:
            # Apply in passes of ≤ 16
            for tr in (tr_e, tr_n, tr_z):
                remaining = decimation_factor
                while remaining > 1:
                    this_pass = min(16, remaining)
                    if this_pass < 2:
                        break
                    tr.decimate(factor=this_pass, no_filter=False)
                    remaining = math.ceil(remaining / this_pass)

        effective_sr = tr_z.stats.sampling_rate
        npts_final = tr_z.stats.npts

        # ── 6. Detrend + global normalization ──
        data_e = tr_e.data.astype(np.float64)
        data_n = tr_n.data.astype(np.float64)
        data_z = tr_z.data.astype(np.float64)

        data_e -= np.mean(data_e)
        data_n -= np.mean(data_n)
        data_z -= np.mean(data_z)

        max_global = max(
            np.max(np.abs(data_e)),
            np.max(np.abs(data_n)),
            np.max(np.abs(data_z)),
        )
        if max_global < 1e-30:
            max_global = 1.0

        data_e /= max_global
        data_n /= max_global
        data_z /= max_global

        # ── 7. Build output ──
        dt = 1.0 / effective_sr
        times = [round(i * dt, 6) for i in range(npts_final)]
        duration = times[-1] if times else 0.0

        inst_type, phys_mag = INSTRUMENT_INFO.get(
            chosen_prefix, ("desconocido", "desconocido")
        )

        station_result = {
            "event_id": file_info["event_id"],
            "station": station,
            "location": chosen_loc,
            "instrument_prefix": chosen_prefix,
            "instrument_type": inst_type,
            "physical_quantity": phys_mag,
            "sampling_rate": effective_sr,
            "original_sampling_rate": original_sr,
            "decimation_factor": decimation_factor,
            "normalization_factor": float(max_global),
            "duration": round(duration, 2),
            "num_samples": npts_final,
            "max_desfase_s": round(max_desfase, 6),
            "had_gaps": had_gaps,
            "gap_count": gap_count,
            "waveData": {
                "time": times,
                "north": data_n.tolist(),
                "east": data_e.tolist(),
                "vertical": data_z.tolist(),
            },
        }

        results.append(station_result)

    return results, discard_reasons


def main():
    print("=" * 70)
    print("PROCESADOR MiniSEED v2 — Red CM (Colombia)")
    print("=" * 70)

    if not DATA_RAW.exists():
        print(f"\nError: No existe {DATA_RAW.resolve()}")
        sys.exit(1)

    # Collect files
    subdirs = ["Col_full", "Colombia", "Ecuador"]
    all_files: list[tuple[str, Path]] = []
    for subdir in subdirs:
        subpath = DATA_RAW / subdir
        if subpath.exists():
            for f in sorted(subpath.glob("*.mseed")):
                all_files.append((subdir, f))

    print(f"\nArchivos .mseed encontrados: {len(all_files)}")
    if not all_files:
        print("  No hay archivos para procesar.")
        sys.exit(0)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Process
    index_events = []
    total_stations = 0
    total_json_bytes = 0
    max_desfase_all = 0.0
    events_processed = 0
    events_discarded: list[tuple[str, str]] = []
    stations_discarded_gaps = 0
    all_sampling_rates: list[float] = []
    all_stations_per_event: list[int] = []
    instrument_counts: dict[str, int] = defaultdict(int)

    for subfolder, filepath in all_files:
        file_info = parse_cm_filename(filepath.name)
        if not file_info:
            events_discarded.append((filepath.name, "nombre no reconocido"))
            continue

        event_id = file_info["event_id"]
        print(f"  {filepath.name}...", end="", flush=True)

        results, discards = process_file(filepath, subfolder)

        # Count gap discards
        for d in discards:
            if "huecos" in d:
                stations_discarded_gaps += 1

        if not results:
            reason = discards[0] if discards else "sin estaciones validas"
            events_discarded.append((filepath.name, reason))
            print(f" SKIP ({reason})")
            continue

        # Write per-station JSON
        event_dir = OUTPUT_DIR / event_id
        event_dir.mkdir(parents=True, exist_ok=True)

        station_summaries = []
        for sdata in results:
            sta_name = sdata["station"]
            outfile = event_dir / f"{sta_name}.json"

            json_str = json.dumps(sdata, ensure_ascii=False)
            with open(outfile, "w", encoding="utf-8") as f:
                f.write(json_str)

            total_json_bytes += len(json_str.encode("utf-8"))
            total_stations += 1
            max_desfase_all = max(max_desfase_all, sdata["max_desfase_s"])
            all_sampling_rates.append(sdata["sampling_rate"])
            instrument_counts[sdata["instrument_prefix"]] += 1

            station_summaries.append({
                "station": sta_name,
                "location": sdata["location"],
                "instrument_prefix": sdata["instrument_prefix"],
                "instrument_type": sdata["instrument_type"],
                "physical_quantity": sdata["physical_quantity"],
                "sampling_rate": sdata["sampling_rate"],
                "duration": sdata["duration"],
                "num_samples": sdata["num_samples"],
                "had_gaps": sdata["had_gaps"],
            })

        events_processed += 1
        all_stations_per_event.append(len(results))
        print(f" OK {len(results)} estaciones")

        index_events.append({
            "id": event_id,
            "magnitude": file_info["magnitude"],
            "date": file_info["date"],
            "time": file_info["time"],
            "folder": subfolder,
            "stations": station_summaries,
        })

    # Write index
    index_path = OUTPUT_DIR / "index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(
            {"events": index_events, "count": len(index_events)},
            f, ensure_ascii=False, indent=2,
        )
    total_json_bytes += index_path.stat().st_size

    # ── REPORTE FINAL ──
    print(f"\n{'=' * 70}")
    print("REPORTE FINAL")
    print(f"{'=' * 70}")

    print(f"\n  Eventos procesados: {events_processed}")
    print(f"  Eventos descartados: {len(events_discarded)}")
    if events_discarded:
        for name, reason in events_discarded:
            print(f"    - {name}: {reason}")

    if all_stations_per_event:
        print(f"\n  Registros por evento:")
        print(f"    Minimo:   {min(all_stations_per_event)}")
        print(f"    Maximo:   {max(all_stations_per_event)}")
        print(f"    Promedio: {sum(all_stations_per_event)/len(all_stations_per_event):.1f}")

    print(f"\n  Distribucion de instrumentos elegidos:")
    for pref, count in sorted(instrument_counts.items(), key=lambda x: -x[1]):
        inst_type, _ = INSTRUMENT_INFO.get(pref, ("?", "?"))
        print(f"    {pref}: {count} registros ({inst_type})")

    if all_sampling_rates:
        print(f"\n  Frecuencia de muestreo resultante:")
        print(f"    Minima:   {min(all_sampling_rates):.2f} Hz")
        print(f"    Maxima:   {max(all_sampling_rates):.2f} Hz")
        print(f"    Promedio: {sum(all_sampling_rates)/len(all_sampling_rates):.2f} Hz")

    print(f"\n  Estaciones descartadas por huecos: {stations_discarded_gaps}")
    print(f"  Desfase maximo entre componentes: {max_desfase_all:.6f} s")
    print(f"  Tamano total en disco: {total_json_bytes / (1024*1024):.2f} MB")
    print(f"\n  Indice: {index_path.resolve()}")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
