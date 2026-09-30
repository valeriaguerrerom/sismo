"""
Agrega `original_sampling_rate` a cada estación del índice CM (index.json).

El índice de la red CM (public/data/cm/index.json) guarda la frecuencia de
muestreo YA DIEZMADA por estación, pero para el Explorador queremos mostrar la
frecuencia ORIGINAL del equipo. Ese dato SÍ está en cada JSON por estación
(public/data/cm/<evento>/<ESTACION>.json → campo original_sampling_rate).

Este script recorre el índice, lee la frecuencia original de cada estación
desde su JSON y la escribe de vuelta en el índice, sin reprocesar los MiniSEED.
Es idempotente: se puede correr varias veces.

Uso:
    cd backend
    py add_original_sr_to_cm_index.py

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import json
from pathlib import Path

CM_DIR = Path("../public/data/cm")


def main() -> None:
    index_path = CM_DIR / "index.json"
    if not index_path.exists():
        print(f"No existe {index_path.resolve()}")
        return

    with open(index_path, "r", encoding="utf-8") as f:
        index = json.load(f)

    events = index.get("events", [])
    updated_stations = 0
    missing = 0

    for ev in events:
        event_id = ev.get("id")
        for st in ev.get("stations", []):
            sta = st.get("station")
            sta_path = CM_DIR / event_id / f"{sta}.json"
            if not sta_path.exists():
                missing += 1
                continue
            try:
                with open(sta_path, "r", encoding="utf-8") as f:
                    sdata = json.load(f)
            except Exception:
                missing += 1
                continue
            orig = sdata.get("original_sampling_rate")
            if orig is not None:
                st["original_sampling_rate"] = orig
                # Mantener también el factor de diezmado por si el Explorador
                # quiere mostrarlo ("100 Hz → 50 Hz para visualización").
                if sdata.get("decimation_factor") is not None:
                    st["decimation_factor"] = sdata["decimation_factor"]
                updated_stations += 1

    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"Estaciones actualizadas: {updated_stations}")
    if missing:
        print(f"Estaciones sin JSON individual (omitidas): {missing}")
    print(f"Índice actualizado: {index_path.resolve()}")


if __name__ == "__main__":
    main()
