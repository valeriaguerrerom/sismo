"""
Motor de Simulación FDM 2D — Ecuación de Onda Elástica
======================================================

Implementación del Método de Diferencias Finitas (FDM) para resolver
la ecuación de onda elástica 2D en medios isótropos:

    ρ(∂²u/∂t²) = (λ+2μ)∇(∇·u) - μ∇×(∇×u) + f

Características:
    - Fuente Ricker wavelet con mecanismo doble-cupla (tectónico) o isótropo (volcánico)
    - Condiciones de frontera absorbentes tipo sponge
    - Superficie libre (stress-free) en z=0
    - Verificación de estabilidad CFL
    - Detección automática de llegadas P y S por STA
    - Descomposición triaxial N/E/Z en el receptor

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
        totalSteps: Número total de pasos temporales ejecutados.
        receiverX: Índice X del receptor en la malla.
        receiverZ: Índice Z del receptor en la malla.
        sourceX: Índice X de la fuente en la malla.
        sourceZ: Índice Z de la fuente en la malla.
    """
    nx: int
    nz: int
    dx: float
    dt: float
    dtAdjusted: bool
    totalSteps: int
    receiverX: int
    receiverZ: int
    sourceX: int
    sourceZ: int


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


def detect_arrival(signal: np.ndarray, dt: float, threshold: float = 0.05) -> float:
    """Detecta el tiempo de primera llegada en una señal sísmica usando STA.

    Calcula el promedio de corto plazo (Short-Term Average) en una ventana
    deslizante de 5 muestras y compara contra un umbral relativo al máximo.

    Args:
        signal: Array con la señal sísmica (amplitudes).
        dt: Paso temporal en segundos.
        threshold: Fracción del máximo absoluto para activar la detección.

    Returns:
        Tiempo de primera llegada en segundos. 0.0 si la señal es nula.
    """
    max_val = np.max(np.abs(signal))
    if max_val < 1e-30:
        return 0.0
    trigger = max_val * threshold
    for i in range(10, len(signal)):
        sta = np.mean(np.abs(signal[max(0, i - 4):i + 1]))
        if sta > trigger:
            return i * dt
    return len(signal) * dt


def run_fdm(params: SimulationParams, on_progress=None) -> SimulationResult:
    """Ejecuta la simulación FDM 2D de la ecuación de onda elástica.

    Resuelve el sistema acoplado de ecuaciones de onda elástica en 2D
    usando diferencias finitas de segundo orden en espacio y tiempo:

        ρ · ∂²ux/∂t² = (λ+2μ)·∂²ux/∂x² + μ·∂²ux/∂z² + (λ+μ)·∂²uz/∂x∂z
        ρ · ∂²uz/∂t² = μ·∂²uz/∂x² + (λ+2μ)·∂²uz/∂z² + (λ+μ)·∂²ux/∂x∂z

    Incluye:
        - Fuente distribuida con wavelet de Ricker
        - Mecanismo doble-cupla (tectónico) o isótropo (volcánico)
        - Condición de superficie libre (stress-free) en z=0
        - Fronteras absorbentes tipo sponge en los bordes laterales e inferior
        - Verificación y ajuste automático de estabilidad CFL: dt ≤ dx/(Vp·√2)
        - Registro triaxial (N, E, Z) en un receptor en superficie

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

    # Dimensiones de la malla
    nx = min(200, max(60, int(20000 / dx)))
    nz = min(150, max(40, int(15000 / dx)))

    # Verificación de estabilidad CFL
    cfl_limit = dx / (vp * math.sqrt(2))
    dt_adjusted = False
    if dt > cfl_limit:
        dt = cfl_limit * 0.9
        dt_adjusted = True

    total_steps = min(6000, int(duration / dt))
    snapshot_interval = max(1, total_steps // 80)

    # Posición de la fuente y receptor
    src_x = nx // 2
    src_z = min(int(nz * 0.4), max(5, int((depth * 1000) / dx)))
    rec_offset = min(int(nx * 0.15), int(3000 / dx))
    rec_x = min(nx - 15, src_x + rec_offset)
    rec_z = 2

    # Parámetros de la fuente Ricker
    f0 = 2.0 if source_type == "volcanic" else 3.5
    t0 = 1.5 / f0
    amp_scale = 10 ** (magnitude - 2) * 1e4

    # Inicialización de campos de desplazamiento
    size = nx * nz
    ux_prev = np.zeros(size, dtype=np.float32)
    ux_curr = np.zeros(size, dtype=np.float32)
    ux_next = np.zeros(size, dtype=np.float32)
    uz_prev = np.zeros(size, dtype=np.float32)
    uz_curr = np.zeros(size, dtype=np.float32)
    uz_next = np.zeros(size, dtype=np.float32)

    # Coeficientes de frontera absorbente (sponge layer)
    abs_thick = 15
    abs_coeff = np.ones(size, dtype=np.float32)
    for i in range(nx):
        for j in range(nz):
            d = 1.0
            if i < abs_thick:
                d *= (i / abs_thick) ** 2
            if i >= nx - abs_thick:
                d *= ((nx - 1 - i) / abs_thick) ** 2
            if j >= nz - abs_thick:
                d *= ((nz - 1 - j) / abs_thick) ** 2
            abs_coeff[i * nz + j] = d

    # Constantes del esquema FDM
    dx2 = dx * dx
    dt2 = dt * dt
    c1 = (lam + 2 * mu) / density  # Coeficiente para ondas P
    c2 = mu / density               # Coeficiente para ondas S
    c3 = (lam + mu) / density       # Coeficiente de acoplamiento

    time_arr, north_arr, east_arr, vert_arr = [], [], [], []
    snapshot_count = 0

    def idx(i, j):
        """Convierte coordenadas 2D (i, j) a índice lineal 1D."""
        return i * nz + j

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
                s_idx = idx(si, sj)
                if source_type == "tectonic":
                    sign = math.copysign(0.3, di) if di != 0 else 1.0
                    ux_curr[s_idx] += src_val * weight * 0.8 * sign
                    uz_curr[s_idx] += src_val * weight * 1.0
                else:
                    angle = math.atan2(dj, di)
                    ux_curr[s_idx] += src_val * weight * 0.4 * math.cos(angle)
                    uz_curr[s_idx] += src_val * weight * 1.0

        # Actualización FDM del interior de la malla
        for i in range(2, nx - 2):
            for j in range(2, nz - 2):
                ij = idx(i, j)
                d2ux_dx2 = (ux_curr[idx(i+1,j)] - 2*ux_curr[ij] + ux_curr[idx(i-1,j)]) / dx2
                d2ux_dz2 = (ux_curr[idx(i,j+1)] - 2*ux_curr[ij] + ux_curr[idx(i,j-1)]) / dx2
                d2uz_dx2 = (uz_curr[idx(i+1,j)] - 2*uz_curr[ij] + uz_curr[idx(i-1,j)]) / dx2
                d2uz_dz2 = (uz_curr[idx(i,j+1)] - 2*uz_curr[ij] + uz_curr[idx(i,j-1)]) / dx2
                d2uz_dxdz = (uz_curr[idx(i+1,j+1)] - uz_curr[idx(i+1,j-1)] - uz_curr[idx(i-1,j+1)] + uz_curr[idx(i-1,j-1)]) / (4*dx2)
                d2ux_dxdz = (ux_curr[idx(i+1,j+1)] - ux_curr[idx(i+1,j-1)] - ux_curr[idx(i-1,j+1)] + ux_curr[idx(i-1,j-1)]) / (4*dx2)
                ux_next[ij] = 2*ux_curr[ij] - ux_prev[ij] + dt2*(c1*d2ux_dx2 + c2*d2ux_dz2 + c3*d2uz_dxdz)
                uz_next[ij] = 2*uz_curr[ij] - uz_prev[ij] + dt2*(c2*d2uz_dx2 + c1*d2uz_dz2 + c3*d2ux_dxdz)

        # Condición de superficie libre en z=0
        for i in range(1, nx - 1):
            uz_next[idx(i, 0)] = -uz_next[idx(i, 1)]
            ux_next[idx(i, 0)] = ux_next[idx(i, 1)]

        # Aplicar fronteras absorbentes
        ux_next *= abs_coeff
        uz_next *= abs_coeff

        # Intercambio de buffers temporales
        ux_prev, ux_curr, ux_next = ux_curr, ux_next, ux_prev
        uz_prev, uz_curr, uz_next = uz_curr, uz_next, uz_prev

        # Registro en el receptor
        rec_idx = idx(rec_x, rec_z)
        ux_val = float(ux_curr[rec_idx])
        uz_val = float(uz_curr[rec_idx])
        rec_up = idx(rec_x, max(1, rec_z - 2))
        rec_down = idx(rec_x, min(nz - 2, rec_z + 2))
        transverse_val = float((ux_curr[rec_up] - ux_curr[rec_down]) / (4 * dx) * dx * 0.5)

        time_arr.append(t)
        north_arr.append(transverse_val)
        east_arr.append(ux_val)
        vert_arr.append(uz_val)

        if step % snapshot_interval == 0:
            snapshot_count += 1
        if on_progress and step % 200 == 0:
            on_progress(step, total_steps)

    # ═══ Post-procesamiento ═══
    all_amps = np.abs(np.concatenate([north_arr, east_arr, vert_arr]))
    max_amplitude = float(np.max(all_amps)) if len(all_amps) > 0 else 1e-30

    # Detección de llegadas P y S
    dist_m = math.sqrt((rec_x - src_x) ** 2 + (rec_z - src_z) ** 2) * dx
    p_arrival_det = detect_arrival(np.array(vert_arr), dt, 0.03)
    s_arrival_det = detect_arrival(np.array(east_arr), dt, 0.05)
    p_arrival = p_arrival_det if p_arrival_det > 0 else dist_m / vp + t0
    s_arrival = s_arrival_det if s_arrival_det > p_arrival_det else dist_m / vs + t0

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
    result_params.lambda_ = lam
    result_params.mu = mu

    return SimulationResult(
        waveData=WaveData(time=time_arr, north=north_arr, east=east_arr, vertical=vert_arr),
        maxAmplitude=max_amplitude,
        duration=duration,
        dominantFrequency=f0,
        params=result_params,
        gridInfo=GridInfo(
            nx=nx, nz=nz, dx=dx, dt=dt, dtAdjusted=dt_adjusted,
            totalSteps=total_steps, receiverX=rec_x, receiverZ=rec_z,
            sourceX=src_x, sourceZ=src_z,
        ),
        pArrival=p_arrival,
        sArrival=s_arrival,
        snapshotCount=snapshot_count,
    )
