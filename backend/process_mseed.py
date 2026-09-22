"""
Procesador de datos MiniSEED del Volcán Galeras.
Lee archivos .mseed de estaciones sismológicas del SGC,
extrae sismogramas triaxiales y los exporta como JSON para la plataforma web.

Correcciones aplicadas:
    1. Normalización global (una sola constante para las 3 componentes)
    2. Diezmado con filtro antialias (ObsPy decimate, pasadas múltiples si >16)
    3. Metadato de frecuencia efectiva post-diezmado
    4. Sincronización temporal entre componentes con recorte a ventana común

Uso:
    py process_mseed.py <ruta_carpeta_sismos> [--output ../public/data/galeras]

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana (2026)
"""
import os
import sys
import json
import re
import math
from pathlib import Path

import numpy as np
from obspy import read, UTCDateTime


def parse_event_folder_name(name: str) -> dict:
    """Extrae fecha y tipo del nombre de carpeta.

    Formato: YYMMDDHHMMGVA
    Ejemplo: 0602081159GVA -> 2006-02-08 11:59, Galeras Volcánico A

    Args:
        name: Nombre de la carpeta del evento.

    Returns:
        dict con year, month, day, hour, minute, event_date, event_time.
    """
    match = re.match(r"(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})GVA", name)
    if not match:
        return {}
    yy, mm, dd, hh, mi = match.groups()
    year = 2000 + int(yy)
    return {
        "year": year,
        "month": int(mm),
        "day": int(dd),
        "hour": int(hh),
        "minute": int(mi),
        "event_date": f"{year}-{mm}-{dd}",
        "event_time": f"{hh}:{mi}:00",
    }


def find_triaxial_station(folder: Path) -> dict[str, Path]:
    """Busca la estación con 3 componentes (E, N, Z) en una carpeta.

    Prioriza estaciones con canales HH (broadband) sobre EL (short period).

    Args:
        folder: Ruta a la carpeta del evento.

    Returns:
        dict con claves 'E', 'N', 'Z' y valores Path a los archivos .mseed.
    """
    files = list(folder.glob("*.mseed"))

    # Agrupar por estación
    stations: dict[str, dict[str, Path]] = {}
    for f in files:
        parts = f.name.split(".")
        station = parts[0]
        if len(parts) >= 4:
            channel = parts[3] if len(parts) > 3 else parts[-1].split("_")[0]
        else:
            channel = ""

        # Extraer componente del canal
        comp = None
        if channel.endswith("E") or channel.endswith("e"):
            comp = "E"
        elif channel.endswith("N") or channel.endswith("n"):
            comp = "N"
        elif channel.endswith("Z") or channel.endswith("z"):
            comp = "Z"

        if comp:
            if station not in stations:
                stations[station] = {}
            stations[station][comp] = f

    # Buscar estación con las 3 componentes, preferir HH
    for station, comps in stations.items():
        if "E" in comps and "N" in comps and "Z" in comps:
            is_hh = any("HH" in str(comps[c]) for c in comps)
            if is_hh:
                return comps

    # Fallback: cualquier estación con 3 componentes
    for station, comps in stations.items():
        if "E" in comps and "N" in comps and "Z" in comps:
            return comps

    # Fallback: solo Z
    for station, comps in stations.items():
        if "Z" in comps:
            return {"Z": comps["Z"]}

    return {}


def decimate_trace(tr, target_samples: int):
    """Diezma un Trace hasta tener <= target_samples, con filtro antialias.

    Aplica ObsPy decimate en pasadas de factor <= 16 como recomienda la librería.

    Args:
        tr: obspy.Trace a diezmar (se modifica in-place).
        target_samples: Número máximo de muestras deseado.

    Returns:
        Factor de diezmado total aplicado.
    """
    total_factor = 1
    while tr.stats.npts > target_samples:
        remaining_factor = math.ceil(tr.stats.npts / target_samples)
        # Apply in passes of at most 16
        this_pass = min(16, remaining_factor)
        if this_pass < 2:
            break
        tr.decimate(factor=this_pass, no_filter=False)
        total_factor *= this_pass
    return total_factor


def process_event(folder: Path, max_samples: int = 3000) -> dict | None:
    """Procesa un evento sísmico: lee .mseed y extrae sismogramas.

    Args:
        folder: Ruta a la carpeta del evento.
        max_samples: Máximo de muestras en la salida (se diezma si excede).

    Returns:
        dict con metadatos del evento y series temporales, o None si falla.
    """
    info = parse_event_folder_name(folder.name)
    if not info:
        print(f"  [SKIP] No se pudo parsear: {folder.name}")
        return None

    comps = find_triaxial_station(folder)
    if not comps:
        print(f"  [SKIP] Sin estación triaxial: {folder.name}")
        return None

    try:
        # ── Leer las tres componentes como Traces ──
        traces: dict[str, object] = {}
        missing_comps: list[str] = []

        for comp_name in ["E", "N", "Z"]:
            if comp_name in comps:
                st = read(str(comps[comp_name]))
                traces[comp_name] = st[0]
            else:
                missing_comps.append(comp_name)

        if "Z" not in traces:
            print(f"  [SKIP] Sin componente Z: {folder.name}")
            return None

        # ── Verificar sincronización temporal (Corrección 4) ──
        sync_warning = None
        available_comps = list(traces.keys())

        if len(available_comps) >= 2:
            starttimes = {c: traces[c].stats.starttime for c in available_comps}
            endtimes = {c: traces[c].stats.endtime for c in available_comps}
            npts_vals = {c: traces[c].stats.npts for c in available_comps}

            # Find common time window
            common_start = max(starttimes.values())
            common_end = min(endtimes.values())

            if common_start >= common_end:
                print(f"  [ERROR] Componentes no se solapan en tiempo: {folder.name}")
                return None

            # Check if trimming is needed
            needs_trim = False
            for c in available_comps:
                if abs(starttimes[c] - common_start) > 0.5 / traces[c].stats.sampling_rate:
                    needs_trim = True
                if abs(endtimes[c] - common_end) > 0.5 / traces[c].stats.sampling_rate:
                    needs_trim = True

            # Check npts alignment
            if len(set(npts_vals.values())) > 1:
                needs_trim = True

            if needs_trim:
                sync_warning = (
                    f"Componentes recortadas a ventana común: "
                    f"start={common_start}, end={common_end}. "
                    f"npts originales: {dict(npts_vals)}"
                )
                for c in available_comps:
                    traces[c].trim(starttime=common_start, endtime=common_end)

            # Verify alignment after trim
            npts_after = {c: traces[c].stats.npts for c in available_comps}
            min_npts = min(npts_after.values())
            # Force same length by truncating to minimum
            for c in available_comps:
                if traces[c].stats.npts > min_npts:
                    traces[c].data = traces[c].data[:min_npts]
                    traces[c].stats.npts = min_npts

        # ── Get metadata from Z trace (reference) ──
        tr_ref = traces["Z"]
        original_sampling_rate = tr_ref.stats.sampling_rate
        station_name = tr_ref.stats.station
        npts_original = tr_ref.stats.npts

        # ── Diezmado con filtro antialias (Corrección 2) ──
        # Calculate same decimation factor for all components
        decimation_factor = 1
        if npts_original > max_samples:
            # Apply same decimation to all traces
            target = max_samples
            # Determine factor from reference trace
            test_factor = math.ceil(npts_original / target)

            # Apply decimate in passes to all components equally
            for c in available_comps:
                remaining = test_factor
                while remaining > 1:
                    this_pass = min(16, remaining)
                    if this_pass < 2:
                        break
                    traces[c].decimate(factor=this_pass, no_filter=False)
                    remaining = math.ceil(remaining / this_pass)

            decimation_factor = math.ceil(npts_original / traces["Z"].stats.npts)

        # ── Detrend and global normalization (Corrección 1) ──
        data_arrays: dict[str, np.ndarray] = {}
        for c in available_comps:
            arr = traces[c].data.astype(np.float64)
            arr = arr - np.mean(arr)  # Remove DC offset per component
            data_arrays[c] = arr

        # Global max across all available components
        max_global = max(np.max(np.abs(arr)) for arr in data_arrays.values())
        if max_global < 1e-30:
            max_global = 1.0

        # Normalize all by the same global max
        for c in available_comps:
            data_arrays[c] = data_arrays[c] / max_global

        # ── Build output ──
        effective_sr = traces["Z"].stats.sampling_rate
        npts_final = traces["Z"].stats.npts
        dt = 1.0 / effective_sr
        times = [i * dt for i in range(npts_final)]

        wavedata = {
            "time": times,
            "north": data_arrays.get("N", np.zeros(npts_final)).tolist(),
            "east": data_arrays.get("E", np.zeros(npts_final)).tolist(),
            "vertical": data_arrays["Z"].tolist(),
        }

        duration = times[-1] if times else 0.0

        result = {
            "id": folder.name,
            "event_date": info["event_date"],
            "event_time": info["event_time"],
            "station": station_name,
            "sampling_rate": effective_sr,
            "original_sampling_rate": original_sampling_rate,
            "decimation_factor": decimation_factor,
            "normalization_factor": float(max_global),
            "duration": round(duration, 2),
            "num_samples": npts_final,
            "components": available_comps,
            "event_type": "volcanic",
            "source": "SGC-OVSP",
            "location_name": f"Volcán Galeras — Estación {station_name}",
            "waveData": wavedata,
        }

        if missing_comps:
            result["missing_components"] = missing_comps

        if sync_warning:
            result["sync_warning"] = sync_warning

        return result

    except Exception as e:
        print(f"  [ERROR] {folder.name}: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    """Procesa todos los eventos y genera archivos JSON."""
    if len(sys.argv) < 2:
        print("Uso: py process_mseed.py <ruta_carpeta_sismos> [--output <dir>]")
        print("Ejemplo: py process_mseed.py 'C:/Users/VALERIA/Downloads/Sismos Galeras/Sismos Galeras'")
        sys.exit(1)

    input_dir = Path(sys.argv[1])
    output_dir = Path(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[2] == "--output" else Path("../public/data/galeras")

    if not input_dir.exists():
        print(f"Error: No existe {input_dir}")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    event_folders = sorted([f for f in input_dir.iterdir() if f.is_dir() and f.name.endswith("GVA")])
    print(f"Encontrados {len(event_folders)} eventos GVA")

    all_events = []
    for folder in event_folders:
        print(f"Procesando: {folder.name}...")
        result = process_event(folder)
        if result:
            # Guardar JSON individual del evento (con waveforms)
            event_file = output_dir / f"{folder.name}.json"
            with open(event_file, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False)
            print(f"  ✓ {result['station']} — {len(result['components'])} comps, "
                  f"{result['num_samples']} muestras, {result['duration']}s, "
                  f"SR: {result['original_sampling_rate']}→{result['sampling_rate']} Hz "
                  f"(factor {result['decimation_factor']})")

            # Para el índice, no incluir waveData (muy pesado)
            summary = {k: v for k, v in result.items() if k != "waveData"}
            all_events.append(summary)

    # Guardar índice de todos los eventos
    index_file = output_dir / "index.json"
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump({"events": all_events, "count": len(all_events)}, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"Procesados: {len(all_events)}/{len(event_folders)} eventos")
    print(f"Archivos en: {output_dir.resolve()}")
    print(f"Índice: {index_file.resolve()}")


if __name__ == "__main__":
    main()
