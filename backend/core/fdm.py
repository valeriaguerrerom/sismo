"""
Motor de Simulación FDM 2D — Ecuación de Onda Elástica (Vectorizado)
====================================================================

Implementación del Método de Diferencias Finitas (FDM) para resolver
la ecuación de onda elástica 2D en medios isótropos:

    ρ(∂²u/∂t²) = (λ+2μ)∇(∇·u) - μ∇×(∇×u) + f

Versión vectorizada con NumPy slicing — sin bucles element-wise en el
paso de actualización FDM ni en la construcción de la sponge layer.

Características:
    - Fuente Ricker wavelet con mecanismo doble-cupla (tectónico) o isótropo (volcánico)
    - Condiciones de frontera absorbentes tipo sponge (vectorizadas)
    - Superficie libre (stress-free) en z=0 con fila j=1 actualizada
    - Dimensionamiento de malla en función de la profundidad focal
    - Verificación de estabilidad CFL
    - Detección robusta de llegadas P y S por STA con validación teórica
    - Descomposición triaxial N/E/Z en el receptor

Este módulo es la fuente canónica del motor FDM del backend. El archivo
backend/simulation.py re-exporta desde aquí para mantener compatibilidad.

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import math
import numpy as np
from pydantic import BaseModel, Field


class SimulationParams(BaseModel):
    """Parámetros de entrada para la simulación FDM.

    Attributes:
        vp: Velocidad de onda P en m/s. Rango típico: 1500-8000.
        vs: Velocidad de onda S en m/s. Rango típico: 800-4500.
        density: Densidad del medio en kg/m³. Rango típico: 1800-3300.
        lambda_: Primer parámetro de Lamé (Pa). Se calcula automáticamente si es 0.
        mu: Segundo parámetro de Lamé / módulo de corte (Pa). Se calcula si es 0.
        sourceType: Tipo de fuente sísmica: 'tectonic' (doble-cupla) o 'volcanic' (isótropo).
        magnitude: Magnitud momento (Mw) del evento. Controla la amplitud de la fuente.
        depth: Profundidad focal en kilómetros.
        epicenterLat: Latitud del epicentro en grados decimales.
        epicenterLon: Longitud del epicentro en grados decimales.
        duration: Duración total de la simulación en segundos.
        dx: Espaciado de la malla en metros.
        dt: Paso temporal en segundos. Se ajusta automáticamente si viola CFL.
    """
    vp: float = Field(default=3500, description="Velocidad de onda P (m/s)")
    vs: float = Field(default=2000, description="Velocidad de onda S (m/s)")
    density: float = Field(default=2600, description="Densidad del medio (kg/m³)")
    lambda_: float = Field(default=0, description="Primer parámetro de Lamé (Pa)")
    mu: float = Field(default=0, description="Módulo de corte (Pa)")
    sourceType: str = Field(default="tectonic", description="Tipo de fuente: tectonic | volcanic")
    magnitude: float = Field(default=5.0, description="Magnitud momento (Mw)")
    depth: float = Field(default=15, description="Profundidad focal (km)")
    epicenterLat: float = Field(default=1.2136, description="Latitud del epicentro")
    epicenterLon: float = Field(default=-77.2811, description="Longitud del epicentro")
    duration: float = Field(default=60, description="Duración de simulación (s)")
    dx: float = Field(default=100, description="Espaciado de malla (m)")
    dt: float = Field(default=0.02, description="Paso temporal (s)")

    class Config:
        populate_by_name = True


class GridInfo(BaseModel):
    """Información de la malla computacional y posiciones clave.

    Attributes:
        nx: Número de nodos en dirección horizontal.
        nz: Número de nodos en dirección vertical (profundidad).
        dx: Espaciado de malla utilizado (m).
        dt: Paso temporal utilizado (s), puede diferir del solicitado si se ajustó por CFL.
        dtAdjusted: True si dt fue reducido para cumplir la condición CFL.
        dxAdjusted: True si dx fue aumentado para acomodar la profundidad focal.
        totalSteps: Número total de pasos temporales ejecutados.
        receiverX: Índice X del receptor en la malla.
        receiverZ: Índice Z del receptor en la malla.
        sourceX: Índice X de la fuente en la malla.
        sourceZ: Índice Z de la fuente en la malla.
        pointsPerWavelength: Nodos por longitud de onda mínima (Vs / f_max / dx).
    """
    nx: int
    nz: int
    dx: float
    dt: float
    dtAdjusted: bool
    dxAdjusted: bool
    totalSteps: int
    receiverX: int
    receiverZ: int
    sourceX: int
    sourceZ: int
    pointsPerWavelength: float


class WaveData(BaseModel):
    """Series temporales triaxiales registradas en el receptor.

    Attributes:
        time: Vector de tiempos en segundos.
        north: Componente Norte (transversal) del desplazamiento.
        east: Componente Este (radial) del desplazamiento.
        vertical: Componente Vertical (Z) del desplazamiento.
    """
    time: list[float]
    north: list[float]
    east: list[float]
    vertical: list[float]


class SimulationResult(BaseModel):
    """Resultado completo de una simulación FDM.

    Attributes:
        waveData: Series temporales triaxiales (N, E, Z) en el receptor.
        maxAmplitude: Amplitud máxima absoluta registrada en cualquier componente.
        duration: Duración total de la simulación (s).
        dominantFrequency: Frecuencia dominante de la fuente Ricker (Hz).
        params: Parámetros utilizados (pueden diferir de los solicitados si dt fue ajustado).
        gridInfo: Información de la malla computacional.
        pArrival: Tiempo estimado de llegada de la onda P al receptor (s).
        sArrival: Tiempo estimado de llegada de la onda S al receptor (s).
        pArrivalDetected: True si el arribo P fue detectado por STA, False si es estimado.
        sArrivalDetected: True si el arribo S fue detectado por STA, False si es estimado.
        snapshotCount: Número de snapshots del campo de ondas generados.
    """
    waveData: WaveData
    maxAmplitude: float
    duration: float
    dominantFrequency: float
    params: SimulationParams
    gridInfo: GridInfo
    pArrival: float
    sArrival: float
    pArrivalDetected: bool
    sArrivalDetected: bool
    snapshotCount: int


def compute_lame(vp: float, vs: float, density: float) -> tuple[float, float]:
    """Calcula los parámetros de Lamé a partir de velocidades sísmicas y densidad.

    Utiliza las relaciones:
        μ = ρ · Vs²
        λ = ρ · Vp² - 2μ

    Args:
        vp: Velocidad de onda P en m/s.
        vs: Velocidad de onda S en m/s.
        density: Densidad del medio en kg/m³.

    Returns:
        Tupla (lambda, mu) con los parámetros de Lamé en Pascales.
    """
    mu = density * vs * vs
    lam = density * vp * vp - 2 * mu
    return lam, mu


def ricker(t: float, f0: float, t0: float) -> float:
    """Genera el valor de una wavelet de Ricker (derivada segunda de Gaussiana).

    La wavelet de Ricker es la fuente estándar en sismología computacional:
        R(t) = (1 - 2π²f₀²(t-t₀)²) · exp(-π²f₀²(t-t₀)²)

    Args:
        t: Tiempo actual en segundos.
        f0: Frecuencia dominante en Hz.
        t0: Tiempo de retardo (centro de la wavelet) en segundos.

    Returns:
        Amplitud de la wavelet en el tiempo t.
    """
    arg = math.pi * f0 * (t - t0)
    return (1 - 2 * arg * arg) * math.exp(-arg * arg)


def detect_arrival(signal: np.ndarray, dt: float, threshold: float = 0.05,
                   start_idx: int = 10) -> float:
    """Detecta el tiempo de primera llegada en una señal sísmica usando STA.

    Calcula el promedio de corto plazo (Short-Term Average) en una ventana
    deslizante de 5 muestras y compara contra un umbral relativo al máximo.

    Args:
        signal: Array con la señal sísmica (amplitudes).
        dt: Paso temporal en segundos.
        threshold: Fracción del máximo absoluto para activar la detección.
        start_idx: Índice desde donde empezar la búsqueda.

    Returns:
        Tiempo de primera llegada en segundos. 0.0 si no se detecta.
    """
    max_val = np.max(np.abs(signal))
    if max_val < 1e-30:
        return 0.0
    trigger = max_val * threshold
    for i in range(max(10, start_idx), len(signal)):
        sta = np.mean(np.abs(signal[max(0, i - 4):i + 1]))
        if sta > trigger:
            return i * dt
    return 0.0


def _build_sponge_2d(nx: int, nz: int, abs_thick: int = 15) -> np.ndarray:
    """Construye la matriz de coeficientes sponge con broadcasting (sin bucles).

    Args:
        nx: Nodos en dirección X.
        nz: Nodos en dirección Z.
        abs_thick: Grosor de la capa absorbente en nodos.

    Returns:
        Array 2D de forma (nx, nz) con coeficientes en [0, 1].
    """
    ix = np.arange(nx, dtype=np.float32)
    dx_left = np.where(ix < abs_thick, (ix / abs_thick) ** 2, 1.0)
    dx_right = np.where(ix >= nx - abs_thick, ((nx - 1 - ix) / abs_thick) ** 2, 1.0)
    factor_x = dx_left * dx_right

    jz = np.arange(nz, dtype=np.float32)
    factor_z = np.where(jz >= nz - abs_thick, ((nz - 1 - jz) / abs_thick) ** 2, 1.0)

    return (factor_x[:, np.newaxis] * factor_z[np.newaxis, :]).astype(np.float32)


def run_fdm(params: SimulationParams, on_progress=None) -> SimulationResult:
    """Ejecuta la simulación FDM 2D de la ecuación de onda elástica (vectorizada).

    Resuelve el sistema acoplado de ecuaciones de onda elástica en 2D
    usando diferencias finitas de segundo orden en espacio y tiempo:

        ρ · ∂²ux/∂t² = (λ+2μ)·∂²ux/∂x² + μ·∂²ux/∂z² + (λ+μ)·∂²uz/∂x∂z
        ρ · ∂²uz/∂t² = μ·∂²uz/∂x² + (λ+2μ)·∂²uz/∂z² + (λ+μ)·∂²ux/∂x∂z

    Args:
        params: Parámetros de simulación (velocidades, densidad, fuente, malla, etc.).
        on_progress: Callback opcional para reportar progreso. Recibe (step, total_steps).

    Returns:
        SimulationResult con sismogramas triaxiales, métricas y metadatos de la malla.

    Raises:
        ValueError: Si los parámetros producen una malla inválida.
    """
    vp, vs, density = params.vp, params.vs, params.density
    magnitude, depth = params.magnitude, params.depth
    source_type, duration = params.sourceType, params.duration
    dx, dt = params.dx, params.dt

    # Calcular o usar parámetros de Lamé
    lam, mu = compute_lame(vp, vs, density)
    if params.lambda_ != 0:
        lam = params.lambda_
    if params.mu != 0:
        mu = params.mu

    # ── Grid sizing: nz adapts to requested depth ──
    abs_thick = 15
    NX_MAX = 200
    NZ_MAX = 400

    nx = min(NX_MAX, max(60, int(20000 / dx)))

    # Source should sit within top 70% of nz (leaving 30% for propagation + sponge below)
    depth_nodes = int((depth * 1000) / dx)
    # nz must fit: source at 70% → nz >= depth_nodes / 0.7
    nz_required = max(40, math.ceil(depth_nodes / 0.7) + abs_thick)
    dx_adjusted = False

    if nz_required <= NZ_MAX:
        nz = min(NZ_MAX, max(40, nz_required))
    else:
        # Depth exceeds representable range: increase dx
        max_depth_nodes = int((NZ_MAX - abs_thick) * 0.7)
        dx = math.ceil((depth * 1000) / max_depth_nodes)
        dx_adjusted = True
        nz = NZ_MAX
        # Recompute nx with new dx
        nx = min(NX_MAX, max(60, int(20000 / dx)))

    # Verificación de estabilidad CFL (re-check after possible dx change)
    cfl_limit = dx / (vp * math.sqrt(2))
    dt_adjusted = False
    if dt > cfl_limit:
        dt = cfl_limit * 0.9
        dt_adjusted = True

    total_steps = min(6000, int(duration / dt))
    snapshot_interval = max(1, total_steps // 80)

    # Posición de la fuente: depth in nodes, capped at 70% of nz
    src_x = nx // 2
    src_z = min(int(nz * 0.7), max(5, int((depth * 1000) / dx)))

    # Receptor en superficie
    rec_offset = min(int(nx * 0.15), int(3000 / dx))
    rec_x = min(nx - 15, src_x + rec_offset)
    rec_z = 2

    # Parámetros de la fuente Ricker
    f0 = 2.0 if source_type == "volcanic" else 3.5
    t0 = 1.5 / f0
    amp_scale = 10 ** (magnitude - 2) * 1e4

    # Inicialización de campos de desplazamiento — arrays 2D (nx, nz)
    ux_prev = np.zeros((nx, nz), dtype=np.float32)
    ux_curr = np.zeros((nx, nz), dtype=np.float32)
    ux_next = np.zeros((nx, nz), dtype=np.float32)
    uz_prev = np.zeros((nx, nz), dtype=np.float32)
    uz_curr = np.zeros((nx, nz), dtype=np.float32)
    uz_next = np.zeros((nx, nz), dtype=np.float32)

    # Coeficientes de frontera absorbente (sponge layer) — vectorizado
    abs_coeff = _build_sponge_2d(nx, nz, abs_thick=abs_thick)

    # Constantes del esquema FDM
    dx2 = dx * dx
    dt2 = dt * dt
    c1 = (lam + 2 * mu) / density
    c2 = mu / density
    c3 = (lam + mu) / density

    time_arr = []
    north_arr = []
    east_arr = []
    vert_arr = []
    snapshot_count = 0

    # ═══ Bucle temporal principal ═══
    for step in range(total_steps):
        t = step * dt

        # Inyección de fuente distribuida
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

        # ── Actualización FDM vectorizada con slicing ──
        # Región interior: i in [2, nx-3], j in [1, nz-3]
        d2ux_dx2 = (ux_curr[3:nx-1, 1:nz-2] - 2*ux_curr[2:nx-2, 1:nz-2] + ux_curr[1:nx-3, 1:nz-2]) / dx2
        d2ux_dz2 = (ux_curr[2:nx-2, 2:nz-1] - 2*ux_curr[2:nx-2, 1:nz-2] + ux_curr[2:nx-2, 0:nz-3]) / dx2
        d2uz_dx2 = (uz_curr[3:nx-1, 1:nz-2] - 2*uz_curr[2:nx-2, 1:nz-2] + uz_curr[1:nx-3, 1:nz-2]) / dx2
        d2uz_dz2 = (uz_curr[2:nx-2, 2:nz-1] - 2*uz_curr[2:nx-2, 1:nz-2] + uz_curr[2:nx-2, 0:nz-3]) / dx2
        d2uz_dxdz = (uz_curr[3:nx-1, 2:nz-1] - uz_curr[3:nx-1, 0:nz-3]
                     - uz_curr[1:nx-3, 2:nz-1] + uz_curr[1:nx-3, 0:nz-3]) / (4 * dx2)
        d2ux_dxdz = (ux_curr[3:nx-1, 2:nz-1] - ux_curr[3:nx-1, 0:nz-3]
                     - ux_curr[1:nx-3, 2:nz-1] + ux_curr[1:nx-3, 0:nz-3]) / (4 * dx2)

        ux_next[2:nx-2, 1:nz-2] = (2*ux_curr[2:nx-2, 1:nz-2] - ux_prev[2:nx-2, 1:nz-2]
                                    + dt2 * (c1*d2ux_dx2 + c2*d2ux_dz2 + c3*d2uz_dxdz))
        uz_next[2:nx-2, 1:nz-2] = (2*uz_curr[2:nx-2, 1:nz-2] - uz_prev[2:nx-2, 1:nz-2]
                                    + dt2 * (c2*d2uz_dx2 + c1*d2uz_dz2 + c3*d2ux_dxdz))

        # ── Condición de superficie libre en z=0 ──
        uz_next[1:nx-1, 0] = -uz_next[1:nx-1, 1]
        ux_next[1:nx-1, 0] = ux_next[1:nx-1, 1]

        # Aplicar fronteras absorbentes (vectorizado)
        ux_next *= abs_coeff
        uz_next *= abs_coeff

        # Intercambio de buffers temporales
        ux_prev, ux_curr, ux_next = ux_curr, ux_next, ux_prev
        uz_prev, uz_curr, uz_next = uz_curr, uz_next, uz_prev

        # Registro en el receptor
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
        if on_progress and step % 200 == 0:
            on_progress(step, total_steps)

    # ═══ Post-procesamiento ═══
    all_amps = np.abs(np.array(north_arr + east_arr + vert_arr, dtype=np.float64))
    max_amplitude = float(np.max(all_amps)) if len(all_amps) > 0 else 1e-30

    # ── Detección robusta de llegadas P y S ──
    dist_m = math.sqrt((rec_x - src_x) ** 2 + (rec_z - src_z) ** 2) * dx
    p_theoretical = dist_m / vp + t0
    s_theoretical = dist_m / vs + t0
    vp_vs_ratio = vp / vs

    # P-arrival: detect on vertical component (15% tolerance)
    p_arrival_det = detect_arrival(np.array(vert_arr), dt, 0.03, start_idx=10)
    if p_arrival_det > 0:
        p_rel_err = abs(p_arrival_det - p_theoretical) / p_theoretical
        if p_rel_err < 0.15:
            p_arrival = p_arrival_det
            p_arrival_detected = True
        else:
            p_arrival = p_theoretical
            p_arrival_detected = False
    else:
        p_arrival = p_theoretical
        p_arrival_detected = False

    # S-arrival: search AFTER P-arrival + wavelet duration (several periods)
    wavelet_duration = 3.0 / f0
    s_search_start_time = p_arrival + wavelet_duration
    s_search_start_idx = max(10, int(s_search_start_time / dt))
    s_arrival_det = detect_arrival(np.array(east_arr), dt, 0.05, start_idx=s_search_start_idx)
    if s_arrival_det > 0:
        # Validate: 15% tolerance against theoretical
        s_rel_err = abs(s_arrival_det - s_theoretical) / s_theoretical
        # Coherence check: (S - t0)/(P - t0) should be close to Vp/Vs
        detected_ratio = (s_arrival_det - t0) / (p_arrival - t0 + 1e-30)
        ratio_rel_err = abs(detected_ratio - vp_vs_ratio) / vp_vs_ratio
        if s_rel_err < 0.15 and ratio_rel_err < 0.15:
            s_arrival = s_arrival_det
            s_arrival_detected = True
        else:
            s_arrival = s_theoretical
            s_arrival_detected = False
    else:
        s_arrival = s_theoretical
        s_arrival_detected = False

    # ── Numerical dispersion metric ──
    # Minimum wavelength: Vs / f_max, where f_max ≈ 2.5 * f0 for Ricker wavelet
    f_max = 2.5 * f0
    lambda_min = vs / f_max
    points_per_wavelength = lambda_min / dx

    # Submuestreo para limitar tamaño de respuesta
    max_points = 3000
    if len(time_arr) > max_points:
        s = math.ceil(len(time_arr) / max_points)
        time_arr = time_arr[::s]
        north_arr = north_arr[::s]
        east_arr = east_arr[::s]
        vert_arr = vert_arr[::s]

    result_params = params.model_copy()
    result_params.dt = dt
    result_params.dx = dx
    result_params.lambda_ = lam
    result_params.mu = mu

    return SimulationResult(
        waveData=WaveData(time=time_arr, north=north_arr, east=east_arr, vertical=vert_arr),
        maxAmplitude=max_amplitude,
        duration=duration,
        dominantFrequency=f0,
        params=result_params,
        gridInfo=GridInfo(
            nx=nx, nz=nz, dx=dx, dt=dt, dtAdjusted=dt_adjusted, dxAdjusted=dx_adjusted,
            totalSteps=total_steps, receiverX=rec_x, receiverZ=rec_z,
            sourceX=src_x, sourceZ=src_z, pointsPerWavelength=points_per_wavelength,
        ),
        pArrival=p_arrival,
        sArrival=s_arrival,
        pArrivalDetected=p_arrival_detected,
        sArrivalDetected=s_arrival_detected,
        snapshotCount=snapshot_count,
    )


# ═══════════════════════════════════════════════════════════════════════
# Variante para el endpoint /api/synthetic del "Mapa 3D"
# ═══════════════════════════════════════════════════════════════════════

class SyntheticParams(BaseModel):
    """Parámetros para un sintético con receptor a distancia controlada.

    A diferencia de SimulationParams (que coloca el receptor a un offset
    fijo), aquí el receptor se ubica en superficie a `distance_km` de la
    fuente, y la malla (nx, nz) y el paso temporal máximo son explícitos.
    La física del solver es idéntica a run_fdm.

    Attributes:
        vp: Velocidad de onda P (m/s).
        vs: Velocidad de onda S (m/s).
        density: Densidad (kg/m³).
        magnitude: Magnitud Mw.
        depth_km: Profundidad focal (km).
        source_type: 'tectonic' | 'volcanic'.
        distance_km: Distancia epicentral fuente→receptor en superficie (km).
        nx: Nodos en X (horizontal).
        nz: Nodos en Z (profundidad).
        dt_max_s: Paso temporal máximo solicitado (se recorta por CFL).
    """
    vp: float = Field(default=3500, gt=0)
    vs: float = Field(default=2000, gt=0)
    density: float = Field(default=2600, gt=0)
    magnitude: float = Field(default=5.0)
    depth_km: float = Field(default=15.0, ge=0)
    source_type: str = Field(default="tectonic")
    distance_km: float = Field(default=3.0, ge=0)
    nx: int = Field(default=200, ge=40, le=600)
    nz: int = Field(default=150, ge=40, le=600)
    dt_max_s: float = Field(default=0.02, gt=0)


class SyntheticResult(BaseModel):
    """Resultado del sintético para el Mapa 3D.

    Attributes:
        t: Vector de tiempos (s).
        north, east, vertical: Componentes del sismograma.
        tP_detectado: Llegada P estimada/detectada (s).
        tS_detectado: Llegada S estimada/detectada (s).
        cfl_ok: True si el dt solicitado cumplía CFL sin recorte.
        tiempo_computo_ms: Tiempo de cómputo del solver en milisegundos.
        nx, nz, dx_m, dt_s: Parámetros efectivos de la malla.
    """
    t: list[float]
    north: list[float]
    east: list[float]
    vertical: list[float]
    tP_detectado: float
    tS_detectado: float
    cfl_ok: bool
    tiempo_computo_ms: float
    nx: int
    nz: int
    dx_m: float
    dt_s: float


def run_fdm_synthetic(p: "SyntheticParams") -> "SyntheticResult":
    """FDM 2D con receptor en superficie a una distancia dada (para /api/synthetic).

    Reutiliza EXACTAMENTE la física de run_fdm (inyección de fuente Ricker
    doble-par/isótropa, stencils de 2º orden con derivada cruzada de 4 puntos,
    superficie libre por espejo antisimétrico, sponge cuadrático, CFL), pero
    con malla (nx, nz) explícita y receptor colocado a distance_km de la fuente.

    Args:
        p: Parámetros del sintético.

    Returns:
        SyntheticResult con las tres componentes, llegadas P/S, estado CFL y
        tiempo de cómputo.
    """
    import time as _time
    t_start = _time.perf_counter()

    vp, vs, density = p.vp, p.vs, p.density
    lam, mu = compute_lame(vp, vs, density)

    nx, nz = int(p.nx), int(p.nz)
    abs_thick = 15

    # dx elegido para que la fuente quepa en profundidad y el receptor
    # a distance_km entre dentro del dominio horizontal.
    # Reservamos ~70% de nz para profundidad, y colocamos la fuente al centro.
    src_x = nx // 2
    # Espacio horizontal disponible entre fuente y borde (menos sponge):
    horiz_nodes = (nx - abs_thick - 2) - src_x
    horiz_nodes = max(5, horiz_nodes)
    # dx tal que distance_km caiga dentro del espacio horizontal, y que la
    # profundidad quepa en el 70% de nz. Tomamos el mayor de ambos requisitos.
    dx_from_dist = (p.distance_km * 1000.0) / horiz_nodes
    depth_avail_nodes = max(5, int(nz * 0.7))
    dx_from_depth = (p.depth_km * 1000.0) / depth_avail_nodes if p.depth_km > 0 else 0.0
    dx = max(dx_from_dist, dx_from_depth, 20.0)  # nunca menos de 20 m

    # CFL
    cfl_limit = dx / (vp * math.sqrt(2))
    dt = p.dt_max_s
    cfl_ok = dt <= cfl_limit
    if not cfl_ok:
        dt = cfl_limit * 0.9

    # Fuente
    src_z = min(int(nz * 0.7), max(5, int((p.depth_km * 1000) / dx)))
    f0 = 2.0 if p.source_type == "volcanic" else 3.5
    t0 = 1.5 / f0
    amp_scale = 10 ** (p.magnitude - 2) * 1e4

    # Receptor a distance_km de la fuente, en superficie (z=2)
    rec_nodes = int((p.distance_km * 1000.0) / dx)
    rec_x = min(nx - abs_thick - 1, max(src_x + 2, src_x + rec_nodes))
    rec_z = 2

    # Duración suficiente para ver la llegada S con margen
    d_hypo_m = math.sqrt(((rec_x - src_x) * dx) ** 2 + ((rec_z - src_z) * dx) ** 2)
    duration = (d_hypo_m / vs) * 1.6 + 4.0 / f0 + 2.0
    total_steps = min(8000, max(200, int(duration / dt)))

    # Campos
    ux_prev = np.zeros((nx, nz), dtype=np.float32)
    ux_curr = np.zeros((nx, nz), dtype=np.float32)
    ux_next = np.zeros((nx, nz), dtype=np.float32)
    uz_prev = np.zeros((nx, nz), dtype=np.float32)
    uz_curr = np.zeros((nx, nz), dtype=np.float32)
    uz_next = np.zeros((nx, nz), dtype=np.float32)

    abs_coeff = _build_sponge_2d(nx, nz, abs_thick=abs_thick)

    dx2 = dx * dx
    dt2 = dt * dt
    c1 = (lam + 2 * mu) / density
    c2 = mu / density
    c3 = (lam + mu) / density

    # Precomputar pesos de fuente distribuida (5×5) — vectorización parcial
    spread = 2
    time_arr, north_arr, east_arr, vert_arr = [], [], [], []

    for step in range(total_steps):
        t = step * dt
        src_val = ricker(t, f0, t0) * amp_scale
        for di in range(-spread, spread + 1):
            for dj in range(-spread, spread + 1):
                si, sj = src_x + di, src_z + dj
                if si < 2 or si >= nx - 2 or sj < 2 or sj >= nz - 2:
                    continue
                dist = math.sqrt(di * di + dj * dj)
                weight = math.exp(-dist * dist / (spread * 0.8))
                if p.source_type == "tectonic":
                    sign = math.copysign(0.3, di) if di != 0 else 1.0
                    ux_curr[si, sj] += src_val * weight * 0.8 * sign
                    uz_curr[si, sj] += src_val * weight * 1.0
                else:
                    angle = math.atan2(dj, di)
                    ux_curr[si, sj] += src_val * weight * 0.4 * math.cos(angle)
                    uz_curr[si, sj] += src_val * weight * 1.0

        d2ux_dx2 = (ux_curr[3:nx-1, 1:nz-2] - 2*ux_curr[2:nx-2, 1:nz-2] + ux_curr[1:nx-3, 1:nz-2]) / dx2
        d2ux_dz2 = (ux_curr[2:nx-2, 2:nz-1] - 2*ux_curr[2:nx-2, 1:nz-2] + ux_curr[2:nx-2, 0:nz-3]) / dx2
        d2uz_dx2 = (uz_curr[3:nx-1, 1:nz-2] - 2*uz_curr[2:nx-2, 1:nz-2] + uz_curr[1:nx-3, 1:nz-2]) / dx2
        d2uz_dz2 = (uz_curr[2:nx-2, 2:nz-1] - 2*uz_curr[2:nx-2, 1:nz-2] + uz_curr[2:nx-2, 0:nz-3]) / dx2
        d2uz_dxdz = (uz_curr[3:nx-1, 2:nz-1] - uz_curr[3:nx-1, 0:nz-3]
                     - uz_curr[1:nx-3, 2:nz-1] + uz_curr[1:nx-3, 0:nz-3]) / (4 * dx2)
        d2ux_dxdz = (ux_curr[3:nx-1, 2:nz-1] - ux_curr[3:nx-1, 0:nz-3]
                     - ux_curr[1:nx-3, 2:nz-1] + ux_curr[1:nx-3, 0:nz-3]) / (4 * dx2)

        ux_next[2:nx-2, 1:nz-2] = (2*ux_curr[2:nx-2, 1:nz-2] - ux_prev[2:nx-2, 1:nz-2]
                                    + dt2 * (c1*d2ux_dx2 + c2*d2ux_dz2 + c3*d2uz_dxdz))
        uz_next[2:nx-2, 1:nz-2] = (2*uz_curr[2:nx-2, 1:nz-2] - uz_prev[2:nx-2, 1:nz-2]
                                    + dt2 * (c2*d2uz_dx2 + c1*d2uz_dz2 + c3*d2ux_dxdz))

        uz_next[1:nx-1, 0] = -uz_next[1:nx-1, 1]
        ux_next[1:nx-1, 0] = ux_next[1:nx-1, 1]

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

    # Llegadas
    dist_m = math.sqrt((rec_x - src_x) ** 2 + (rec_z - src_z) ** 2) * dx
    p_theo = dist_m / vp + t0
    s_theo = dist_m / vs + t0
    p_det = detect_arrival(np.array(vert_arr), dt, 0.03, start_idx=10)
    tP = p_det if (p_det > 0 and abs(p_det - p_theo) / p_theo < 0.15) else p_theo
    s_start = max(10, int((tP + 3.0 / f0) / dt))
    s_det = detect_arrival(np.array(east_arr), dt, 0.05, start_idx=s_start)
    tS = s_det if (s_det > 0 and abs(s_det - s_theo) / s_theo < 0.15) else s_theo

    # Submuestreo
    max_points = 3000
    if len(time_arr) > max_points:
        s = math.ceil(len(time_arr) / max_points)
        time_arr = time_arr[::s]
        north_arr = north_arr[::s]
        east_arr = east_arr[::s]
        vert_arr = vert_arr[::s]

    elapsed_ms = (_time.perf_counter() - t_start) * 1000.0

    return SyntheticResult(
        t=time_arr, north=north_arr, east=east_arr, vertical=vert_arr,
        tP_detectado=round(tP, 4), tS_detectado=round(tS, 4),
        cfl_ok=cfl_ok, tiempo_computo_ms=round(elapsed_ms, 1),
        nx=nx, nz=nz, dx_m=round(dx, 2), dt_s=round(dt, 6),
    )
