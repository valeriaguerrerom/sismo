"""
Comparación cross-language: TypeScript runFDM vs Python run_fdm
===============================================================

Compara las tres componentes (north, east, vertical) y tiempos de arribo
entre el motor TypeScript y el Python vectorizado, ambos con la corrección
de superficie libre (Tarea B) activa.

Tolerancia: rtol=1e-3 (diferencias float32 entre lenguajes son esperables).
"""
import json
import sys
import time
import math
import numpy as np

sys.path.insert(0, ".")
from simulation import run_fdm, SimulationParams


def main():
    print("=" * 65)
    print("COMPARACIÓN CROSS-LANGUAGE: TypeScript vs Python (duration=2.0s)")
    print("=" * 65)

    # ─── Cargar resultado TypeScript ───
    with open("ts_fdm_output.json", "r") as f:
        ts_data = json.load(f)

    ts_time = np.array(ts_data["time"])
    ts_north = np.array(ts_data["north"])
    ts_east = np.array(ts_data["east"])
    ts_vert = np.array(ts_data["vertical"])
    ts_p = ts_data["pArrival"]
    ts_s = ts_data["sArrival"]
    ts_max = ts_data["maxAmplitude"]
    ts_grid = ts_data["gridInfo"]

    print(f"\n[TypeScript]")
    print(f"  Grid: nx={ts_grid['nx']}, nz={ts_grid['nz']}")
    print(f"  Source: ({ts_grid['sourceX']}, {ts_grid['sourceZ']})")
    print(f"  Receiver: ({ts_grid['receiverX']}, {ts_grid['receiverZ']})")
    print(f"  dt={ts_grid['dt']}, dtAdjusted={ts_grid['dtAdjusted']}")
    print(f"  totalSteps={ts_grid['totalSteps']}")
    print(f"  Samples: {len(ts_time)}")
    print(f"  maxAmplitude: {ts_max:.4e}")
    print(f"  pArrival: {ts_p:.4f} s")
    print(f"  sArrival: {ts_s:.4f} s")

    # ─── Ejecutar Python ───
    print(f"\n[Python] Ejecutando run_fdm(duration=2.0)...")
    params = SimulationParams(duration=2.0)
    t0 = time.perf_counter()
    result = run_fdm(params)
    t1 = time.perf_counter()

    py_time = np.array(result.waveData.time)
    py_north = np.array(result.waveData.north)
    py_east = np.array(result.waveData.east)
    py_vert = np.array(result.waveData.vertical)
    py_p = result.pArrival
    py_s = result.sArrival
    py_max = result.maxAmplitude
    gi = result.gridInfo

    print(f"  Grid: nx={gi.nx}, nz={gi.nz}")
    print(f"  Source: ({gi.sourceX}, {gi.sourceZ})")
    print(f"  Receiver: ({gi.receiverX}, {gi.receiverZ})")
    print(f"  dt={gi.dt}, dtAdjusted={gi.dtAdjusted}")
    print(f"  totalSteps={gi.totalSteps}")
    print(f"  Samples: {len(py_time)}")
    print(f"  maxAmplitude: {py_max:.4e}")
    print(f"  pArrival: {py_p:.4f} s")
    print(f"  sArrival: {py_s:.4f} s")
    print(f"  Tiempo ejecución: {(t1-t0)*1000:.1f} ms")

    # ─── Verificar configuración idéntica ───
    print(f"\n[Verificación de configuración]")
    config_ok = True
    checks = [
        ("nx", gi.nx, ts_grid["nx"]),
        ("nz", gi.nz, ts_grid["nz"]),
        ("sourceX", gi.sourceX, ts_grid["sourceX"]),
        ("sourceZ", gi.sourceZ, ts_grid["sourceZ"]),
        ("receiverX", gi.receiverX, ts_grid["receiverX"]),
        ("receiverZ", gi.receiverZ, ts_grid["receiverZ"]),
        ("dt", gi.dt, ts_grid["dt"]),
        ("totalSteps", gi.totalSteps, ts_grid["totalSteps"]),
    ]
    for name, py_val, ts_val in checks:
        match = py_val == ts_val
        status = "✓" if match else "✗"
        print(f"  {status} {name}: Python={py_val}, TS={ts_val}")
        if not match:
            config_ok = False

    if not config_ok:
        print("\n  ⚠ Configuración diferente — las salidas no son directamente comparables")

    # ─── Comparar señales ───
    print(f"\n[Comparación de señales]")
    min_len = min(len(ts_time), len(py_time))
    ts_time = ts_time[:min_len]
    ts_north = ts_north[:min_len]
    ts_east = ts_east[:min_len]
    ts_vert = ts_vert[:min_len]
    py_time = py_time[:min_len]
    py_north = py_north[:min_len]
    py_east = py_east[:min_len]
    py_vert = py_vert[:min_len]

    rtol = 1e-3
    atol = 1e-8

    ok_time = np.allclose(ts_time, py_time, rtol=rtol, atol=atol)
    ok_north = np.allclose(ts_north, py_north, rtol=rtol, atol=atol)
    ok_east = np.allclose(ts_east, py_east, rtol=rtol, atol=atol)
    ok_vert = np.allclose(ts_vert, py_vert, rtol=rtol, atol=atol)

    print(f"  Tolerancia: rtol={rtol}, atol={atol}")
    print(f"  time     allclose: {'PASS' if ok_time else 'FAIL'}")
    print(f"  north    allclose: {'PASS' if ok_north else 'FAIL'}")
    print(f"  east     allclose: {'PASS' if ok_east else 'FAIL'}")
    print(f"  vertical allclose: {'PASS' if ok_vert else 'FAIL'}")

    # Detalles de diferencias
    for name, ts_arr, py_arr, ok in [
        ("north", ts_north, py_north, ok_north),
        ("east", ts_east, py_east, ok_east),
        ("vertical", ts_vert, py_vert, ok_vert),
    ]:
        diff = np.abs(ts_arr - py_arr)
        max_diff = diff.max()
        max_idx = diff.argmax()
        rel_diff = max_diff / (np.abs(ts_arr[max_idx]) + 1e-30)
        print(f"    {name}: max_abs_diff={max_diff:.4e} at step {max_idx} "
              f"(ts={ts_arr[max_idx]:.6e}, py={py_arr[max_idx]:.6e}, rel={rel_diff:.4e})")

    # ─── Tiempos de arribo ───
    print(f"\n[Tiempos de arribo]")
    print(f"  P-arrival: TS={ts_p:.4f} s, Python={py_p:.4f} s, diff={abs(ts_p-py_p):.4f} s")
    print(f"  S-arrival: TS={ts_s:.4f} s, Python={py_s:.4f} s, diff={abs(ts_s-py_s):.4f} s")

    # ─── Resumen ───
    all_pass = ok_time and ok_north and ok_east and ok_vert
    print(f"\n{'=' * 65}")
    if all_pass:
        print("RESULTADO: ✓ PASS — Ambos motores producen resultados equivalentes")
    else:
        print("RESULTADO: ✗ DIVERGENCIA DETECTADA — Ver detalles arriba")
        print("\nAnálisis de divergencia por paso temporal:")
        # Find first divergent step
        for name, ts_arr, py_arr in [
            ("north", ts_north, py_north),
            ("east", ts_east, py_east),
            ("vertical", ts_vert, py_vert),
        ]:
            diffs = np.abs(ts_arr - py_arr)
            threshold = rtol * np.abs(ts_arr) + atol
            divergent = np.where(diffs > threshold)[0]
            if len(divergent) > 0:
                first = divergent[0]
                print(f"  {name}: primera divergencia en paso {first} "
                      f"(t={ts_time[first]:.4f}s), "
                      f"ts={ts_arr[first]:.6e}, py={py_arr[first]:.6e}")
    print(f"{'=' * 65}")

    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
