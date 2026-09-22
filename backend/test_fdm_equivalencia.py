"""
Test de Equivalencia FDM — Vectorizado vs Legacy
=================================================

Verifica que la versión vectorizada (NumPy slicing) produce resultados
numéricamente idénticos a la versión legacy (bucles element-wise), usando
np.allclose(rtol=1e-5).

La comparación se hace CON EL MISMO rango de j que usa el legacy (j=2..nz-3),
es decir, la corrección de la Tarea B (j empieza en 1) se desactiva para esta
prueba, de modo que sólo se verifica la vectorización pura.

Imprime tiempos por paso de cada versión.
"""
import sys
import time
import math
import numpy as np

# ─── Importar legacy tal cual ───
sys.path.insert(0, ".")
import simulation_legacy as legacy

# ─── Reimplementar el motor vectorizado con j=2..nz-3 (sin fix Tarea B) ───
def run_fdm_vectorized_no_taskb(params):
    """Versión vectorizada con rango j=2..nz-3, idéntico al legacy."""
    from simulation import (
        compute_lame, ricker, _build_sponge_2d,
        SimulationResult, WaveData, GridInfo
    )

    vp, vs, density = params.vp, params.vs, params.density
    magnitude, depth = params.magnitude, params.depth
    source_type, duration = params.sourceType, params.duration
    dx, dt = params.dx, params.dt

    lam, mu = compute_lame(vp, vs, density)
    if params.lambda_ != 0:
        lam = params.lambda_
    if params.mu != 0:
        mu = params.mu

    nx = min(200, max(60, int(20000 / dx)))
    nz = min(150, max(40, int(15000 / dx)))

    cfl_limit = dx / (vp * math.sqrt(2))
    dt_adjusted = False
    if dt > cfl_limit:
        dt = cfl_limit * 0.9
        dt_adjusted = True

    total_steps = min(6000, int(duration / dt))
    snapshot_interval = max(1, total_steps // 80)

    src_x = nx // 2
    src_z = min(int(nz * 0.4), max(5, int((depth * 1000) / dx)))
    rec_offset = min(int(nx * 0.15), int(3000 / dx))
    rec_x = min(nx - 15, src_x + rec_offset)
    rec_z = 2

    f0 = 2.0 if source_type == "volcanic" else 3.5
    t0 = 1.5 / f0
    amp_scale = 10 ** (magnitude - 2) * 1e4

    ux_prev = np.zeros((nx, nz), dtype=np.float32)
    ux_curr = np.zeros((nx, nz), dtype=np.float32)
    ux_next = np.zeros((nx, nz), dtype=np.float32)
    uz_prev = np.zeros((nx, nz), dtype=np.float32)
    uz_curr = np.zeros((nx, nz), dtype=np.float32)
    uz_next = np.zeros((nx, nz), dtype=np.float32)

    abs_coeff = _build_sponge_2d(nx, nz, abs_thick=15)

    dx2 = dx * dx
    dt2 = dt * dt
    c1 = (lam + 2 * mu) / density
    c2 = mu / density
    c3 = (lam + mu) / density

    time_arr, north_arr, east_arr, vert_arr = [], [], [], []
    snapshot_count = 0

    for step in range(total_steps):
        t = step * dt

        src_val = ricker(t, f0, t0) * amp_scale
        spread = 2
        for di in range(-spread, spread + 1):
            for dj in range(-spread, spread + 1):
                si, sj = src_x + di, src_z + dj
                if si < 2 or si >= nx - 2 or sj < 2 or sj >= nz - 2:
                    continue
                dist = math.sqrt(di * di + dj * dj)
                weight = math.exp(-dist * dist / (spread * 0.8))
                if source_type == "tectonic":
                    sign = math.copysign(0.3, di) if di != 0 else 1.0
                    ux_curr[si, sj] += src_val * weight * 0.8 * sign
                    uz_curr[si, sj] += src_val * weight * 1.0
                else:
                    angle = math.atan2(dj, di)
                    ux_curr[si, sj] += src_val * weight * 0.4 * math.cos(angle)
                    uz_curr[si, sj] += src_val * weight * 1.0

        # FDM update — j from 2 to nz-3 (same as legacy)
        d2ux_dx2 = (ux_curr[3:nx-1, 2:nz-2] - 2*ux_curr[2:nx-2, 2:nz-2] + ux_curr[1:nx-3, 2:nz-2]) / dx2
        d2ux_dz2 = (ux_curr[2:nx-2, 3:nz-1] - 2*ux_curr[2:nx-2, 2:nz-2] + ux_curr[2:nx-2, 1:nz-3]) / dx2
        d2uz_dx2 = (uz_curr[3:nx-1, 2:nz-2] - 2*uz_curr[2:nx-2, 2:nz-2] + uz_curr[1:nx-3, 2:nz-2]) / dx2
        d2uz_dz2 = (uz_curr[2:nx-2, 3:nz-1] - 2*uz_curr[2:nx-2, 2:nz-2] + uz_curr[2:nx-2, 1:nz-3]) / dx2
        d2uz_dxdz = (uz_curr[3:nx-1, 3:nz-1] - uz_curr[3:nx-1, 1:nz-3]
                     - uz_curr[1:nx-3, 3:nz-1] + uz_curr[1:nx-3, 1:nz-3]) / (4 * dx2)
        d2ux_dxdz = (ux_curr[3:nx-1, 3:nz-1] - ux_curr[3:nx-1, 1:nz-3]
                     - ux_curr[1:nx-3, 3:nz-1] + ux_curr[1:nx-3, 1:nz-3]) / (4 * dx2)

        ux_next[2:nx-2, 2:nz-2] = (2*ux_curr[2:nx-2, 2:nz-2] - ux_prev[2:nx-2, 2:nz-2]
                                    + dt2 * (c1*d2ux_dx2 + c2*d2ux_dz2 + c3*d2uz_dxdz))
        uz_next[2:nx-2, 2:nz-2] = (2*uz_curr[2:nx-2, 2:nz-2] - uz_prev[2:nx-2, 2:nz-2]
                                    + dt2 * (c2*d2uz_dx2 + c1*d2uz_dz2 + c3*d2ux_dxdz))

        # Superficie libre (same as legacy)
        for i in range(1, nx - 1):
            uz_next[i, 0] = -uz_next[i, 1]
            ux_next[i, 0] = ux_next[i, 1]

        ux_next *= abs_coeff
        uz_next *= abs_coeff

        ux_prev, ux_curr, ux_next = ux_curr, ux_next, ux_prev
        uz_prev, uz_curr, uz_next = uz_curr, uz_next, uz_prev

        ux_val = float(ux_curr[rec_x, rec_z])
        uz_val = float(uz_curr[rec_x, rec_z])
        rec_up_z = max(1, rec_z - 2)
        rec_down_z = min(nz - 2, rec_z + 2)
        transverse_val = float((ux_curr[rec_x, rec_up_z] - ux_curr[rec_x, rec_down_z]) / (4 * dx) * dx * 0.5)

        time_arr.append(t)
        north_arr.append(transverse_val)
        east_arr.append(ux_val)
        vert_arr.append(uz_val)

        if step % snapshot_interval == 0:
            snapshot_count += 1

    return time_arr, north_arr, east_arr, vert_arr


def main():
    print("=" * 60)
    print("TEST DE EQUIVALENCIA: Vectorizado vs Legacy (duration=2.0s)")
    print("=" * 60)

    params = legacy.SimulationParams(duration=2.0)

    # ─── Ejecutar legacy ───
    print("\n[1] Ejecutando versión LEGACY (bucles element-wise)...")
    t0_legacy = time.perf_counter()
    result_legacy = legacy.run_fdm(params)
    t1_legacy = time.perf_counter()
    elapsed_legacy = t1_legacy - t0_legacy
    steps_legacy = result_legacy.gridInfo.totalSteps
    ms_per_step_legacy = (elapsed_legacy / steps_legacy) * 1000
    print(f"    Tiempo total: {elapsed_legacy:.3f} s")
    print(f"    Pasos: {steps_legacy}")
    print(f"    Tiempo por paso: {ms_per_step_legacy:.3f} ms")

    # ─── Ejecutar vectorizado (sin fix Tarea B) ───
    print("\n[2] Ejecutando versión VECTORIZADA (slicing, sin Tarea B)...")
    t0_vec = time.perf_counter()
    time_v, north_v, east_v, vert_v = run_fdm_vectorized_no_taskb(params)
    t1_vec = time.perf_counter()
    elapsed_vec = t1_vec - t0_vec
    # Same total_steps
    ms_per_step_vec = (elapsed_vec / steps_legacy) * 1000
    print(f"    Tiempo total: {elapsed_vec:.3f} s")
    print(f"    Pasos: {steps_legacy}")
    print(f"    Tiempo por paso: {ms_per_step_vec:.3f} ms")

    # ─── Comparación ───
    print("\n[3] Comparando resultados...")

    # Legacy devuelve datos posiblemente submuestreados, así que comparamos con
    # los mismos índices. Ambos usan max_points=3000 y misma lógica de submuestreo.
    leg_time = np.array(result_legacy.waveData.time)
    leg_north = np.array(result_legacy.waveData.north)
    leg_east = np.array(result_legacy.waveData.east)
    leg_vert = np.array(result_legacy.waveData.vertical)

    # Aplicar el mismo submuestreo a la versión vectorizada
    max_points = 3000
    if len(time_v) > max_points:
        s = math.ceil(len(time_v) / max_points)
        time_v = time_v[::s]
        north_v = north_v[::s]
        east_v = east_v[::s]
        vert_v = vert_v[::s]

    vec_time = np.array(time_v)
    vec_north = np.array(north_v)
    vec_east = np.array(east_v)
    vec_vert = np.array(vert_v)

    # Asegurar misma longitud (debería ser igual)
    min_len = min(len(leg_time), len(vec_time))
    leg_time = leg_time[:min_len]
    leg_north = leg_north[:min_len]
    leg_east = leg_east[:min_len]
    leg_vert = leg_vert[:min_len]
    vec_time = vec_time[:min_len]
    vec_north = vec_north[:min_len]
    vec_east = vec_east[:min_len]
    vec_vert = vec_vert[:min_len]

    # Tolerancias
    rtol = 1e-5
    atol = 1e-10

    ok_time = np.allclose(leg_time, vec_time, rtol=rtol, atol=atol)
    ok_north = np.allclose(leg_north, vec_north, rtol=rtol, atol=atol)
    ok_east = np.allclose(leg_east, vec_east, rtol=rtol, atol=atol)
    ok_vert = np.allclose(leg_vert, vec_vert, rtol=rtol, atol=atol)

    print(f"    time   allclose: {'PASS' if ok_time else 'FAIL'}")
    print(f"    north  allclose: {'PASS' if ok_north else 'FAIL'}")
    print(f"    east   allclose: {'PASS' if ok_east else 'FAIL'}")
    print(f"    vert   allclose: {'PASS' if ok_vert else 'FAIL'}")

    if not ok_north:
        diff = np.abs(leg_north - vec_north)
        print(f"      max diff north: {diff.max():.2e} at index {diff.argmax()}")
    if not ok_east:
        diff = np.abs(leg_east - vec_east)
        print(f"      max diff east: {diff.max():.2e} at index {diff.argmax()}")
    if not ok_vert:
        diff = np.abs(leg_vert - vec_vert)
        print(f"      max diff vert: {diff.max():.2e} at index {diff.argmax()}")

    all_pass = ok_time and ok_north and ok_east and ok_vert

    # ─── Resumen ───
    speedup = elapsed_legacy / elapsed_vec if elapsed_vec > 0 else float('inf')
    print(f"\n{'=' * 60}")
    print(f"SPEEDUP: {speedup:.1f}x ({ms_per_step_legacy:.3f} ms → {ms_per_step_vec:.3f} ms por paso)")
    print(f"RESULTADO: {'✓ PASS — vectorización equivalente' if all_pass else '✗ FAIL — hay diferencias numéricas'}")
    print(f"{'=' * 60}")

    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
