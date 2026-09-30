"""
Saneamiento de registros del Galeras con TRANSITORIO DE BORDE al inicio.

Algunos JSON del Galeras (los procesados con el script legado, cuyos .mseed
crudos ya no están en el repo para reprocesar de raíz) traen un pico artificial
enorme en las primeras muestras: es el transitorio del filtro antialias del
diezmado, no señal sísmica. Ese pico domina la normalización y aplasta la señal
real (queda ~500x más pequeña), así que los sismogramas se ven planos.

Este script corrige ESOS JSON in situ (no toca los que ya están limpios ni los
reprocesados de raíz por process_galeras_types.py): detecta el transitorio de
borde, lo atenúa con un taper coseno, recorta la cola residual y RENORMALIZA la
señal a [-1, 1] con el cuerpo real, de modo que el paquete sísmico verdadero
queda visible. El resultado se guarda con el mismo formato/normalización que el
resto de los datos, así el frontend solo lee y dibuja (sin procesar nada).

Es idempotente: si un evento ya está limpio (pico no dominante al inicio), se
deja intacto.

Uso:
    py fix_galeras_edge_transient.py [--dir ../public/data/galeras] [--dry-run]

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana (2026)
"""
import sys
import json
import math
from pathlib import Path

import numpy as np


def combined_mag(n: np.ndarray, e: np.ndarray, z: np.ndarray) -> np.ndarray:
    """Magnitud combinada |N| + |E| + |Z| por muestra."""
    return np.abs(n) + np.abs(e) + np.abs(z)


def sanitize(wave: dict) -> tuple[dict, bool]:
    """Sanea un waveData si tiene transitorio de borde. Devuelve (wave, cambiado).

    Reproduce en NumPy la misma lógica robusta validada: detección por
    pico/p99 al inicio, taper del transitorio, recorte de la cola residual y
    renormalización al cuerpo real.
    """
    t = np.asarray(wave["time"], dtype=np.float64)
    N = np.asarray(wave["north"], dtype=np.float64).copy()
    E = np.asarray(wave["east"], dtype=np.float64).copy()
    Z = np.asarray(wave["vertical"], dtype=np.float64).copy()
    n = len(t)
    if n < 40:
        return wave, False

    mag = combined_mag(N, E, Z)
    peak = float(mag.max())
    if peak <= 0:
        return wave, False

    body = np.sort(mag[int(n * 0.02):])
    p99 = float(body[int(0.99 * len(body))]) if len(body) else 0.0
    if p99 <= 0:
        p99 = 1e-30
    peak_idx = int(mag.argmax())
    onset_frac = peak_idx / n

    # ¿Es un transitorio de borde artificial? (pico enorme y al inicio)
    if not (peak / p99 > 20 and onset_frac < 0.05):
        return wave, False

    # Fin del transitorio: avanzar desde el pico hasta que la magnitud se
    # mantenga bajo ~3x p99 durante una ventana larga (cola oscilante). Tope 8 %.
    max_cut = int(n * 0.08)
    back_to = 3 * p99
    settle_needed = max(10, int(n * 0.01))
    cut = peak_idx
    settled = 0
    while cut < max_cut:
        if mag[cut] <= back_to:
            settled += 1
            if settled >= settle_needed:
                break
        else:
            settled = 0
        cut += 1
    cut = min(cut + 2, max_cut)

    # Taper coseno a cero en [0, cut] (sin escalón).
    for i in range(cut + 1):
        w = 0.5 * (1 - math.cos(math.pi * i / (cut + 1)))
        N[i] *= w
        E[i] *= w
        Z[i] *= w

    # Recorte de la cola residual del transitorio en la zona de arranque
    # (primeras 12 %) que aún supere 1.5x el p99 del cuerpo, para que no fije la
    # escala. No inventa señal: limita un residuo artificial.
    clip_end = min(n - 1, int(n * 0.12))
    ceil = 1.5 * p99
    for i in range(clip_end + 1):
        m = abs(N[i]) + abs(E[i]) + abs(Z[i])
        if m > ceil:
            k = ceil / m
            N[i] *= k
            E[i] *= k
            Z[i] *= k

    # Renormalizar al nuevo máximo (el cuerpo real domina ahora), igual que el
    # resto de los datos: cada componente en [-1, 1] respecto al máximo común.
    new_max = max(np.max(np.abs(N)), np.max(np.abs(E)), np.max(np.abs(Z)))
    if new_max < 1e-30:
        new_max = 1.0
    N /= new_max
    E /= new_max
    Z /= new_max

    wave["north"] = N.tolist()
    wave["east"] = E.tolist()
    wave["vertical"] = Z.tolist()
    return wave, True


def main():
    args = sys.argv[1:]
    data_dir = Path("../public/data/galeras")
    if "--dir" in args:
        data_dir = Path(args[args.index("--dir") + 1])
    dry = "--dry-run" in args

    if not data_dir.exists():
        print(f"Error: no existe {data_dir}")
        sys.exit(1)

    fixed, skipped = 0, 0
    for fp in sorted(data_dir.glob("*.json")):
        if fp.name == "index.json":
            continue
        try:
            with open(fp, "r", encoding="utf-8") as f:
                doc = json.load(f)
        except Exception as ex:
            print(f"  [SKIP] {fp.name}: {ex}")
            continue
        wave = doc.get("waveData")
        if not wave:
            continue
        _, changed = sanitize(wave)
        if changed:
            fixed += 1
            if not dry:
                # Marca de saneamiento para trazabilidad.
                doc["edge_transient_fixed"] = True
                with open(fp, "w", encoding="utf-8") as f:
                    json.dump(doc, f, ensure_ascii=False)
            print(f"  FIX  {fp.name} (transitorio de borde saneado)")
        else:
            skipped += 1

    print(f"\nSaneados: {fixed}  |  intactos: {skipped}  {'(dry-run)' if dry else ''}")


if __name__ == "__main__":
    main()
