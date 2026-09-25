"""
Detecta las llegadas P y S del registro real BBAC del sismo ML 6.3
(CM_M6.3_2025-04-25T11-44-52) para marcarlas en el Home.

No inventa tiempos: los mide sobre la MISMA señal decimada que muestra el Home
(public/data/cm/.../BBAC.json) con el detector STA del backend (core.fdm).
- P: primera llegada en la componente vertical.
- S: primera llegada en una componente horizontal, buscada DESPUÉS de P.

Escribe los tiempos (en segundos) de vuelta en el JSON como `pPick` y `sPick`.
"""
import json
from pathlib import Path

import numpy as np

from core.fdm import detect_arrival

JSON = (Path(__file__).resolve().parent.parent
        / "public" / "data" / "cm"
        / "CM_M6.3_2025-04-25T11-44-52" / "BBAC.json")


def main() -> None:
    data = json.loads(JSON.read_text(encoding="utf-8"))
    wd = data["waveData"]
    t = wd["time"]
    dt = (t[-1] - t[0]) / (len(t) - 1)  # paso temporal efectivo de la señal decimada

    vert = np.array(wd["vertical"], dtype=float)
    north = np.array(wd["north"], dtype=float)
    east = np.array(wd["east"], dtype=float)

    # P sobre la vertical (umbral bajo: primera energía coherente).
    p_pick = detect_arrival(vert, dt, threshold=0.08, start_idx=5)

    # S sobre la horizontal de mayor amplitud, buscada tras P + un margen.
    horiz = east if np.max(np.abs(east)) >= np.max(np.abs(north)) else north
    s_start_idx = max(5, int((p_pick + 3.0) / dt))
    s_pick = detect_arrival(horiz, dt, threshold=0.12, start_idx=s_start_idx)

    print(f"dt={dt:.4f}s  n={len(t)}  t_max={t[-1]:.1f}s")
    print(f"P = {p_pick:.2f}s   S = {s_pick:.2f}s   S-P = {s_pick - p_pick:.2f}s")

    data["pPick"] = round(p_pick, 2)
    data["sPick"] = round(s_pick, 2)
    JSON.write_text(json.dumps(data), encoding="utf-8")
    print(f"Escrito pPick/sPick en {JSON.name}")


if __name__ == "__main__":
    main()
