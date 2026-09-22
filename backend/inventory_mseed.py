"""
Inventario de archivos MiniSEED — Red CM (Colombia)
====================================================

Recorre backend/data_raw/, lee cada archivo .mseed con ObsPy y genera
un reporte detallado sin procesar ni convertir nada.

Salida:
    - backend/data_raw/inventario.csv (una fila por estación+instrumento por evento)
    - Resumen impreso en consola

Uso:
    cd backend
    py inventory_mseed.py

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana (2026)
"""
import os
import sys
import re
import csv
import math
from pathlib import Path
from collections import defaultdict

import numpy as np

# ObsPy import with graceful failure
try:
    from obspy import read
except ImportError:
    print("ERROR: ObsPy no está instalado. Instalar con: pip install obspy")
    sys.exit(1)


def parse_cm_filename(name: str) -> dict:
    """Extrae magnitud y fecha del nombre de archivo CM.

    Formato: CM_M<magnitud>_<fecha>T<hora>.mseed
    Ejemplo: CM_M6.3_2025-04-25T11-44-52.mseed

    Args:
        name: Nombre del archivo.

    Returns:
        dict con magnitude, date, time, datetime_str. Vacío si no matchea.
    """
    match = re.match(
        r"CM_M([\d.]+)_(\d{4}-\d{2}-\d{2})T(\d{2}-\d{2}-\d{2})\.mseed",
        name
    )
    if not match:
        return {}
    mag_str, date_str, time_str = match.groups()
    time_formatted = time_str.replace("-", ":")
    return {
        "magnitude": float(mag_str),
        "date": date_str,
        "time": time_formatted,
        "datetime_str": f"{date_str}T{time_formatted}",
    }


def get_channel_prefix(channel: str) -> str:
    """Extrae el prefijo de canal (banda + instrumento) de un código de canal.

    Ejemplo: 'HNE' -> 'HN', 'BHZ' -> 'BH'
    """
    if len(channel) >= 2:
        return channel[:2]
    return channel


def get_instrument_type(prefix: str) -> str:
    """Describe el tipo de instrumento según el prefijo de canal SEED.

    Args:
        prefix: Prefijo de 2 letras (band + instrument code).

    Returns:
        Descripción del tipo de instrumento.
    """
    instrument_map = {
        "HN": "Acelerómetro (strong motion) — registra aceleración",
        "HL": "Acelerómetro (strong motion, low gain) — registra aceleración",
        "HH": "Velocímetro broadband (alta tasa) — registra velocidad",
        "BH": "Velocímetro broadband (baja tasa) — registra velocidad",
        "EH": "Velocímetro short period (alta tasa) — registra velocidad",
        "SH": "Velocímetro short period (baja tasa) — registra velocidad",
    }
    return instrument_map.get(prefix, f"Desconocido ({prefix})")


def main():
    data_dir = Path("data_raw")

    if not data_dir.exists():
        print(f"Creando directorio {data_dir}...")
        data_dir.mkdir(parents=True, exist_ok=True)

    # Collect all mseed files from subdirectories
    subdirs = ["Col_full", "Colombia", "Ecuador"]
    all_files: list[tuple[str, Path]] = []  # (subfolder_name, file_path)

    for subdir in subdirs:
        subpath = data_dir / subdir
        if subpath.exists():
            mseed_files = sorted(subpath.glob("*.mseed"))
            for f in mseed_files:
                all_files.append((subdir, f))

    # Also check root of data_raw
    for f in sorted(data_dir.glob("*.mseed")):
        all_files.append((".", f))

    print("=" * 70)
    print("INVENTARIO MiniSEED — Red CM (Colombia)")
    print("=" * 70)
    print(f"\nDirectorio: {data_dir.resolve()}")
    print(f"Archivos .mseed encontrados: {len(all_files)}")

    if not all_files:
        print("\n  (Ningún archivo .mseed encontrado en data_raw/)")
        print("  Copie los archivos a las subcarpetas Col_full/, Colombia/, Ecuador/")
        print("\nGenerando inventario vacío...")
        csv_path = data_dir / "inventario.csv"
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "archivo", "carpeta", "tamano_mb", "magnitud", "fecha", "hora",
                "num_trazas", "red", "estacion", "location", "canal_prefijo",
                "sampling_rate_hz", "componentes", "npts_E", "npts_N", "npts_Z",
                "starttime_E", "starttime_N", "starttime_Z",
                "max_desfase_s", "falta_componente"
            ])
        print(f"CSV vacío guardado en: {csv_path.resolve()}")
        return

    # ── Process each file ──
    csv_rows = []
    total_traces = 0
    stations_events: dict[str, int] = defaultdict(int)  # station -> event count
    channel_prefixes: dict[str, int] = defaultdict(int)  # prefix -> count
    sampling_rates: dict[float, int] = defaultdict(int)  # sr -> count
    max_desfase_global = 0.0
    total_samples_all = 0

    print(f"\n{'─' * 70}")
    print(f"{'Archivo':<45} {'Carpeta':<12} {'Trazas':>6} {'Estaciones':>10}")
    print(f"{'─' * 70}")

    for subfolder, filepath in all_files:
        file_info = parse_cm_filename(filepath.name)
        file_size_mb = filepath.stat().st_size / (1024 * 1024)

        try:
            st = read(str(filepath))
        except Exception as e:
            print(f"  [ERROR] {filepath.name}: {e}")
            continue

        num_traces = len(st)
        total_traces += num_traces

        # Group traces by (network, station, location, channel_prefix)
        groups: dict[tuple, dict] = {}  # key -> {comp: trace_info}
        for tr in st:
            net = tr.stats.network
            sta = tr.stats.station
            loc = tr.stats.location
            chan = tr.stats.channel
            prefix = get_channel_prefix(chan)

            # Component is last character
            comp = chan[-1].upper() if chan else "?"
            # Map numeric or alternate codes to standard E/N/Z
            if comp in ("1", "E"):
                comp = "E"
            elif comp in ("2", "N"):
                comp = "N"
            elif comp in ("3", "Z"):
                comp = "Z"

            key = (net, sta, loc, prefix)
            if key not in groups:
                groups[key] = {}

            groups[key][comp] = {
                "npts": tr.stats.npts,
                "starttime": tr.stats.starttime,
                "sampling_rate": tr.stats.sampling_rate,
                "channel": chan,
            }

        # Count unique stations for this event
        unique_stations = set(k[1] for k in groups.keys())
        for sta_name in unique_stations:
            stations_events[sta_name] += 1

        print(f"  {filepath.name:<43} {subfolder:<12} {num_traces:>6} {len(unique_stations):>10}")

        # Process each group
        for key, comps in groups.items():
            net, sta, loc, prefix = key
            channel_prefixes[prefix] += 1

            # Determine present components and their info
            present_comps = sorted(comps.keys())
            comp_str = "".join(present_comps)

            npts_e = comps.get("E", {}).get("npts", 0)
            npts_n = comps.get("N", {}).get("npts", 0)
            npts_z = comps.get("Z", {}).get("npts", 0)

            starttime_e = str(comps["E"]["starttime"]) if "E" in comps else ""
            starttime_n = str(comps["N"]["starttime"]) if "N" in comps else ""
            starttime_z = str(comps["Z"]["starttime"]) if "Z" in comps else ""

            # Sampling rate (from any available component)
            sr = next(iter(comps.values()))["sampling_rate"]
            sampling_rates[sr] += 1

            # Total samples for JSON size estimation
            total_samples_all += npts_e + npts_n + npts_z

            # Max time offset between components
            starttimes = [comps[c]["starttime"] for c in comps if c in ("E", "N", "Z")]
            max_desfase = 0.0
            if len(starttimes) >= 2:
                times_float = [float(t.timestamp) for t in starttimes]
                max_desfase = max(times_float) - min(times_float)
                max_desfase_global = max(max_desfase_global, max_desfase)

            # Missing components
            missing = []
            for c in ["E", "N", "Z"]:
                if c not in comps:
                    missing.append(c)
            missing_str = ",".join(missing) if missing else ""

            csv_rows.append([
                filepath.name,
                subfolder,
                f"{file_size_mb:.2f}",
                file_info.get("magnitude", ""),
                file_info.get("date", ""),
                file_info.get("time", ""),
                num_traces,
                net,
                sta,
                loc,
                prefix,
                sr,
                comp_str,
                npts_e,
                npts_n,
                npts_z,
                starttime_e,
                starttime_n,
                starttime_z,
                f"{max_desfase:.6f}",
                missing_str,
            ])

    # ── Write CSV ──
    csv_path = data_dir / "inventario.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "archivo", "carpeta", "tamano_mb", "magnitud", "fecha", "hora",
            "num_trazas", "red", "estacion", "location", "canal_prefijo",
            "sampling_rate_hz", "componentes", "npts_E", "npts_N", "npts_Z",
            "starttime_E", "starttime_N", "starttime_Z",
            "max_desfase_s", "falta_componente"
        ])
        writer.writerows(csv_rows)

    # ── Console summary ──
    print(f"\n{'=' * 70}")
    print("RESUMEN")
    print(f"{'=' * 70}")

    print(f"\n  Total de eventos (archivos): {len(all_files)}")
    print(f"  Total de trazas: {total_traces}")
    print(f"  Combinaciones estación+instrumento: {len(csv_rows)}")

    # Stations
    print(f"\n  Estaciones únicas: {len(stations_events)}")
    print(f"  {'Estación':<10} {'Eventos':>8}")
    print(f"  {'─' * 20}")
    for sta, count in sorted(stations_events.items(), key=lambda x: -x[1])[:30]:
        print(f"  {sta:<10} {count:>8}")
    if len(stations_events) > 30:
        print(f"  ... y {len(stations_events) - 30} más")

    # Channel prefixes
    print(f"\n  Prefijos de canal encontrados:")
    print(f"  {'Prefijo':<8} {'Ocurrencias':>12}  {'Tipo de instrumento'}")
    print(f"  {'─' * 60}")
    for prefix, count in sorted(channel_prefixes.items(), key=lambda x: -x[1]):
        print(f"  {prefix:<8} {count:>12}  {get_instrument_type(prefix)}")

    # Sampling rates
    print(f"\n  Frecuencias de muestreo:")
    print(f"  {'Hz':<10} {'Ocurrencias':>12}")
    print(f"  {'─' * 25}")
    for sr, count in sorted(sampling_rates.items()):
        print(f"  {sr:<10.1f} {count:>12}")

    # Temporal misalignment
    print(f"\n  Desalineación temporal máxima entre componentes: {max_desfase_global:.6f} s")
    if max_desfase_global > 0.01:
        print(f"  ⚠️ Desfase significativo (>{0.01}s) — requiere recorte a ventana común")
    elif max_desfase_global > 0:
        print(f"  ℹ️ Desfase menor — dentro de tolerancia para la mayoría de usos")
    else:
        print(f"  ✓ Sin desfase detectado")

    # JSON size estimation
    # Each sample: ~15 chars in JSON (float with 6 decimals + comma)
    # 3 components + time = 4 arrays
    estimated_json_bytes = total_samples_all * 4 * 15
    estimated_json_mb = estimated_json_bytes / (1024 * 1024)
    print(f"\n  Estimación de tamaño JSON (todas las estaciones):")
    print(f"    Muestras totales: {total_samples_all:,}")
    print(f"    Tamaño estimado: ~{estimated_json_mb:.1f} MB")

    print(f"\n  CSV guardado en: {csv_path.resolve()}")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
