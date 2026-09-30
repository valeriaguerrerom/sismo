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
import base64
import math
import numpy as np
from pydantic import BaseModel, Field, model_validator

# Numba acelera el bucle temporal ~5x. Si no está disponible (entorno sin
# compilador), se degrada a un kernel NumPy vectorizado equivalente, así el
# motor sigue funcionando sin la dependencia.
try:
    from numba import njit, prange
    _HAS_NUMBA = True
except Exception:  # pragma: no cover - entorno sin numba
    _HAS_NUMBA = False

    def njit(*args, **kwargs):  # type: ignore
        def _wrap(fn):
            return fn
        if args and callable(args[0]):
            return args[0]
        return _wrap

    prange = range  # type: ignore  # fallback secuencial sin numba


# ── Rangos válidos de los parámetros (fuente única de verdad, compartida con el
# frontend en src/lib/paramLimits.ts). El motor simula bien dentro de estos
# rangos; fuera de ellos la malla, la estabilidad o la física dejan de ser
# válidas. Área de Nariño para el epicentro (solo referencia geográfica). ──
PARAM_RANGES = {
    "vp": (1500.0, 8000.0),
    "vs": (500.0, 4500.0),
    "density": (1500.0, 3500.0),
    "magnitude": (2.0, 9.0),
    "depth": (1.0, 100.0),
    "duration": (5.0, 120.0),
    "dx": (10.0, 200.0),
    "strike": (0.0, 360.0),
    "dip": (0.0, 90.0),
    "rake": (-180.0, 180.0),
    "stationAzimuth": (0.0, 360.0),
    "epicentralDistanceKm": (1.0, 12.0),
    # Nariño y su entorno inmediato (incluye la red CM Colombia-Ecuador, cuyos
    # eventos reales pueden cargarse en el simulador).
    "epicenterLat": (-1.0, 3.0),
    "epicenterLon": (-79.5, -75.5),
}
# Factor de seguridad de Vs respecto a Vp para que λ = ρ(Vp² − 2Vs²) > 0 con
# margen (medio sólido físico). Vs_max = Vp / √2 · factor.
VS_VP_SAFETY = 0.98


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
    vp: float = Field(default=3500, ge=1500, le=8000, description="Velocidad de onda P (m/s)")
    vs: float = Field(default=2000, ge=500, le=4500, description="Velocidad de onda S (m/s)")
    density: float = Field(default=2600, ge=1500, le=3500, description="Densidad del medio (kg/m³)")
    lambda_: float = Field(default=0, description="Primer parámetro de Lamé (Pa)")
    mu: float = Field(default=0, description="Módulo de corte (Pa)")
    sourceType: str = Field(default="tectonic", description="Tipo de fuente: tectonic | volcanic")
    magnitude: float = Field(default=5.0, ge=2.0, le=9.0, description="Magnitud momento (Mw)")
    depth: float = Field(default=15, ge=1, le=100, description="Profundidad focal (km)")
    epicenterLat: float = Field(default=1.2136, ge=-1.0, le=3.0, description="Latitud del epicentro (Nariño y entorno)")
    epicenterLon: float = Field(default=-77.2811, ge=-79.5, le=-75.5, description="Longitud del epicentro (Nariño y entorno)")
    duration: float = Field(default=60, ge=5, le=120, description="Duración de simulación (s)")
    dx: float = Field(default=100, ge=10, le=200, description="Espaciado de malla (m)")
    dt: float = Field(default=0.02, gt=0, description="Paso temporal (s)")
    # Mecanismo focal (solo fuente tectónica). Convención Aki & Richards:
    # strike (rumbo) 0-360° medido desde el norte en sentido horario; dip
    # (buzamiento) 0-90° desde la horizontal; rake (deslizamiento) -180..180°
    # (90° = falla inversa, -90° = normal, 0° = desgarre dextral).
    strike: float = Field(default=30, ge=0, le=360, description="Rumbo de la falla (°), 0-360 desde el norte")
    dip: float = Field(default=45, ge=0, le=90, description="Buzamiento de la falla (°), 0-90")
    rake: float = Field(default=90, ge=-180, le=180, description="Deslizamiento (°), 90=inversa, -90=normal, 0=desgarre")
    # Acimut de la estación virtual respecto a la fuente: 0-360° desde el norte
    # en sentido horario. Orienta el corte y la rotación radial/transversal→N/E.
    stationAzimuth: float = Field(default=45, ge=0, le=360, description="Dirección de la estación (°), 0-360 desde el norte")
    # Distancia epicentral: separación horizontal fuente→estación en superficie.
    # Controla la separación temporal entre la P y la S (a mayor distancia, más
    # se separan). Rango acotado por el dominio y los rebotes.
    epicentralDistanceKm: float = Field(default=2.5, ge=1.0, le=12.0, description="Distancia epicentral fuente→estación (km)")
    # Nº de ciclos visibles del pulso de la fuente. 1 ≈ Ricker (un lóbulo);
    # 2–3 produce un tren de ondas por arribo (más parecido a un sismo real y
    # visualmente más llamativo). Se mantiene la frecuencia dominante f0, así
    # que la dispersión numérica (nodos/λ) y la CFL no cambian.
    sourceCycles: float = Field(default=1.0, ge=1.0, le=6.0, description="Ciclos del pulso de la fuente (1=Ricker, 3-4=tren de ondas llamativo)")
    # Frecuencia dominante de la fuente (Hz). Si es 0 se usa el valor por defecto
    # según el tipo (2 volcánica / 3.5 tectónica). Subirla hace oscilaciones más
    # rápidas y densas (registro más "vivo"); requiere dx pequeño para no dispersar.
    sourceFreq: float = Field(default=0.0, ge=0.0, le=12.0, description="Frecuencia dominante de la fuente (Hz); 0 = automática por tipo")
    # ── Modelo de subsuelo (versión mínima de capas) ──
    # 'homogeneous' (por defecto): un solo medio con vp/vs/density.
    # 'twoLayer': una CAPA SUPERFICIAL blanda de espesor `layerThickness` km con
    # sus propias velocidades/densidad (layerVp/layerVs/layerDensity), sobre un
    # SEMIESPACIO de roca que usa vp/vs/density. La interfaz es horizontal.
    subsurfaceModel: str = Field(default="homogeneous", description="Modelo de subsuelo: homogeneous | twoLayer")
    layerThickness: float = Field(default=0.5, ge=0.05, le=5.0, description="Espesor de la capa superficial (km), solo twoLayer")
    layerVp: float = Field(default=1800, ge=1500, le=8000, description="Vp de la capa superficial (m/s), solo twoLayer")
    layerVs: float = Field(default=600, ge=300, le=4500, description="Vs de la capa superficial (m/s), solo twoLayer")
    layerDensity: float = Field(default=1900, ge=1200, le=3500, description="Densidad de la capa superficial (kg/m³), solo twoLayer")

    @model_validator(mode="after")
    def _check_physics(self):
        """Valida la restricción física clave: Vs < Vp/√2 para que λ > 0.

        En un sólido elástico real λ = ρ(Vp² − 2·Vs²) debe ser positivo. Si el
        usuario (o un cliente que no validó) envía Vs demasiado cerca de Vp, se
        rechaza con un mensaje claro en español. Los rangos por campo ya los
        cubren los límites ge/le. En el modelo de dos capas se valida también la
        capa superficial.
        """
        vs_max = self.vp / math.sqrt(2.0) * VS_VP_SAFETY
        if self.vs > vs_max:
            raise ValueError(
                f"Vs = {self.vs:.0f} m/s es demasiado alta para Vp = {self.vp:.0f} m/s: "
                f"debe ser menor que {vs_max:.0f} m/s para que el parámetro de Lamé λ "
                f"no sea negativo (roca físicamente imposible)."
            )
        if self.subsurfaceModel == "twoLayer":
            layer_vs_max = self.layerVp / math.sqrt(2.0) * VS_VP_SAFETY
            if self.layerVs > layer_vs_max:
                raise ValueError(
                    f"Vs de la capa superficial = {self.layerVs:.0f} m/s es demasiado alta "
                    f"para Vp = {self.layerVp:.0f} m/s: debe ser menor que {layer_vs_max:.0f} m/s."
                )
        return self

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
    firstBounceP: float = Field(default=0.0, description="Tiempo del primer rebote de borde para la onda P (s)")
    firstBounceS: float = Field(default=0.0, description="Tiempo del primer rebote de borde para la onda S (s)")
    sourceDelay: float = Field(default=0.0, description="Retardo del pico del pulso de la fuente Ricker, t0 (s). Los frentes teóricos parten en t0.")
    # ── Modelo de dos capas (opcional) ──
    subsurfaceModel: str = Field(default="homogeneous", description="Modelo de subsuelo usado: homogeneous | twoLayer")
    interfaceZ: int = Field(default=0, description="Índice Z de la interfaz entre capas (solo twoLayer); 0 si no aplica")
    interfaceDepthKm: float = Field(default=0.0, description="Profundidad de la interfaz entre capas (km); 0 si no aplica")
    interfaceReflP: float = Field(default=0.0, description="Tiempo teórico de la reflexión P en la interfaz al receptor (s); 0 si no aplica")
    durationCappedByBounce: bool = Field(default=False, description="True si la duración se acotó al primer rebote de borde (el backend la redujo).")


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


def gabor(t: float, f0: float, t0: float, cycles: float) -> float:
    """Wavelet de Gabor: coseno modulado por una gaussiana (fuente multi-ciclo).

    A diferencia de la Ricker (un solo lóbulo, "un pestañeo"), la Gabor oscila
    varias veces dentro de una envolvente gaussiana, así cada arribo (P, S) se
    ve como un TREN DE ONDAS de unos pocos ciclos —mucho más parecido a un
    registro sísmico real y visualmente más llamativo— sin dejar de estar
    centrada en la frecuencia dominante f0 (misma banda ⇒ misma dispersión/CFL):

        g(t) = cos(2π f₀ (t−t₀)) · exp(−( 2π f₀ (t−t₀) / (2·cycles) )²)

    ``cycles`` controla cuántas oscilaciones visibles tiene el pulso (ancho de
    la envolvente). Con cycles≈1 se parece a una Ricker; con 2–3 se ve el tren.

    Args:
        t: Tiempo actual (s).
        f0: Frecuencia dominante (Hz).
        t0: Centro del pulso (s). Conviene t0 ≳ cycles / f0 para no truncar.
        cycles: Número aproximado de ciclos visibles del pulso.

    Returns:
        Amplitud de la wavelet en el tiempo t (media cero, banda limitada).
    """
    w = 2.0 * math.pi * f0 * (t - t0)
    envArg = w / (2.0 * max(0.5, cycles))
    return math.cos(w) * math.exp(-envArg * envArg)


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
    # Perfil clásico de Cerjan: G = exp(-(a·d)²), con d = nº de nodos DENTRO de la
    # zona absorbente (0 en el borde interno, abs_thick-1 en el borde físico). El
    # coeficiente decae suave desde 1 hasta ~exp(-(a·abs_thick)²) en el borde.
    CERJAN_A = 0.02

    def edge_factor(dist_into_layer: np.ndarray) -> np.ndarray:
        # dist_into_layer: 0 fuera de la capa; crece hacia el borde físico.
        return np.exp(-((CERJAN_A * dist_into_layer) ** 2)).astype(np.float32)

    ix = np.arange(nx, dtype=np.float32)
    d_left = np.where(ix < abs_thick, abs_thick - ix, 0.0)          # bordes laterales
    d_right = np.where(ix >= nx - abs_thick, ix - (nx - 1 - abs_thick), 0.0)
    factor_x = edge_factor(d_left) * edge_factor(d_right)

    jz = np.arange(nz, dtype=np.float32)
    d_bottom = np.where(jz >= nz - abs_thick, jz - (nz - 1 - abs_thick), 0.0)  # solo inferior
    factor_z = edge_factor(d_bottom)

    return (factor_x[:, np.newaxis] * factor_z[np.newaxis, :]).astype(np.float32)


@njit(cache=True, fastmath=False, parallel=True)
def _fdm_step(ux_p, ux_c, ux_n, uz_p, uz_c, uz_n, abs_coeff,
              nx, nz, dx2, dt2, c1, c2, c3):
    """Un paso temporal del esquema FDM 2º orden (compilado con Numba, paralelo).

    Actualiza el campo interior con el stencil de 3 puntos + derivada cruzada de
    4 puntos, aplica superficie libre en z=0 y multiplica el coeficiente sponge
    de Cerjan a los niveles ``next`` y ``curr`` (curr pasa a ser prev tras el
    swap, así el término -u_prev del leapfrog también queda amortiguado).

    Los bucles externos usan ``prange``: cada índice ``i`` escribe una columna
    distinta y solo lee vecinos (i±1), así que no hay condición de carrera. En
    mallas grandes esto acelera ~7× frente al kernel serial en máquinas multinúcleo
    (y degrada a secuencial si Numba corre con un solo hilo).

    Los coeficientes elásticos ``c1, c2, c3`` son ARRAYS (nx, nz): así el mismo
    kernel sirve para el medio homogéneo (arrays constantes) y para el modelo de
    dos capas (cada nodo con las propiedades de su capa). En medio homogéneo el
    resultado es idéntico al de los coeficientes escalares.

    Args:
        ux_p, ux_c, ux_n: Campos Ux en t-dt, t, t+dt (se escriben in place).
        uz_p, uz_c, uz_n: Campos Uz en t-dt, t, t+dt (se escriben in place).
        abs_coeff: Matriz sponge (nx, nz) en [0, 1].
        nx, nz: Dimensiones de la malla.
        dx2, dt2: dx² y dt².
        c1, c2, c3: Arrays (nx, nz) de (λ+2μ)/ρ, μ/ρ, (λ+μ)/ρ por nodo.
    """
    for i in prange(2, nx - 2):
        for j in range(1, nz - 2):
            d2ux_dx2 = (ux_c[i+1, j] - 2.0*ux_c[i, j] + ux_c[i-1, j]) / dx2
            d2ux_dz2 = (ux_c[i, j+1] - 2.0*ux_c[i, j] + ux_c[i, j-1]) / dx2
            d2uz_dx2 = (uz_c[i+1, j] - 2.0*uz_c[i, j] + uz_c[i-1, j]) / dx2
            d2uz_dz2 = (uz_c[i, j+1] - 2.0*uz_c[i, j] + uz_c[i, j-1]) / dx2
            d2uz_dxdz = (uz_c[i+1, j+1] - uz_c[i+1, j-1] - uz_c[i-1, j+1] + uz_c[i-1, j-1]) / (4.0*dx2)
            d2ux_dxdz = (ux_c[i+1, j+1] - ux_c[i+1, j-1] - ux_c[i-1, j+1] + ux_c[i-1, j-1]) / (4.0*dx2)
            a1 = c1[i, j]; a2 = c2[i, j]; a3 = c3[i, j]
            ux_n[i, j] = (2.0*ux_c[i, j] - ux_p[i, j]
                          + dt2 * (a1*d2ux_dx2 + a2*d2ux_dz2 + a3*d2uz_dxdz))
            uz_n[i, j] = (2.0*uz_c[i, j] - uz_p[i, j]
                          + dt2 * (a2*d2uz_dx2 + a1*d2uz_dz2 + a3*d2ux_dxdz))
    # Superficie libre (stress-free) en z=0 por espejo antisimétrico.
    for i in prange(1, nx - 1):
        uz_n[i, 0] = -uz_n[i, 1]
        ux_n[i, 0] = ux_n[i, 1]
    # Fronteras absorbentes (Cerjan) en next y curr.
    for i in prange(nx):
        for j in range(nz):
            a = abs_coeff[i, j]
            ux_n[i, j] *= a
            uz_n[i, j] *= a
            ux_c[i, j] *= a
            uz_c[i, j] *= a


@njit(cache=True, fastmath=False, parallel=True)
def _sh_step(v_p, v_c, v_n, abs_coeff, nx, nz, dx2, dt2, cs2):
    """Un paso temporal del problema SH 2D (onda escalar fuera del plano).

    Resuelve ρ·∂²v/∂t² = μ·(∂²v/∂x² + ∂²v/∂z²), donde v es el desplazamiento
    perpendicular al plano del corte (la componente transversal, tipo Love/SH).
    Solo depende de Vs y ρ (cs2 = μ/ρ = Vs²). Superficie libre en z=0 por
    condición de Neumann (∂v/∂z = 0 ⇒ v[j=0] = v[j=1]) y sponge de Cerjan en
    next y curr, igual que el kernel P-SV. Paralelizado con prange.

    Args:
        v_p, v_c, v_n: Campo transversal en t-dt, t, t+dt (in place).
        abs_coeff: Matriz sponge (nx, nz).
        nx, nz: Dimensiones de malla.
        dx2, dt2: dx² y dt².
        cs2: Array (nx, nz) de Vs² = μ/ρ por nodo (dos capas o constante).
    """
    for i in prange(2, nx - 2):
        for j in range(1, nz - 2):
            lap = (v_c[i+1, j] - 2.0*v_c[i, j] + v_c[i-1, j]
                   + v_c[i, j+1] - 2.0*v_c[i, j] + v_c[i, j-1]) / dx2
            v_n[i, j] = 2.0*v_c[i, j] - v_p[i, j] + dt2 * cs2[i, j] * lap
    # Superficie libre SH (Neumann): ∂v/∂z = 0 → espejo simétrico.
    for i in prange(1, nx - 1):
        v_n[i, 0] = v_n[i, 1]
    for i in prange(nx):
        for j in range(nz):
            a = abs_coeff[i, j]
            v_n[i, j] *= a
            v_c[i, j] *= a


def moment_tensor(strike: float, dip: float, rake: float) -> np.ndarray:
    """Tensor de momento sísmico de un doble par a partir de strike/dip/rake.

    Usa la convención de Aki & Richards (2002, ec. 4.29) con ejes
    1 = Norte, 2 = Este, 3 = Abajo. El momento escalar es unitario (M₀ = 1); la
    amplitud real la fija la magnitud por separado. El tensor tiene traza nula
    (doble par puro, sin componente isótropa).

    Args:
        strike: Rumbo de la falla en grados (0-360, desde el norte, horario).
        dip: Buzamiento en grados (0-90, desde la horizontal).
        rake: Deslizamiento en grados (90 = inversa, -90 = normal, 0 = desgarre).

    Returns:
        Matriz simétrica 3×3 (float64) del tensor de momento en ejes N, E, Abajo.
    """
    s = math.radians(strike); d = math.radians(dip); r = math.radians(rake)
    sd, cd = math.sin(d), math.cos(d)
    s2d, c2d = math.sin(2*d), math.cos(2*d)
    sl, cl = math.sin(r), math.cos(r)
    ss, cs = math.sin(s), math.cos(s)
    s2s, c2s = math.sin(2*s), math.cos(2*s)
    Mxx = -(sd*cl*s2s + s2d*sl*ss*ss)
    Mxy = (sd*cl*c2s + 0.5*s2d*sl*s2s)
    Mxz = -(cd*cl*cs + c2d*sl*ss)
    Myz = -(cd*cl*ss - c2d*sl*cs)
    Mzz = (s2d*sl)
    Myy = -(Mxx + Mzz)  # traza nula
    return np.array([[Mxx, Mxy, Mxz],
                     [Mxy, Myy, Myz],
                     [Mxz, Myz, Mzz]], dtype=np.float64)


def project_moment_to_cut(M: np.ndarray, azimuth_deg: float) -> dict:
    """Proyecta el tensor de momento al marco del corte vertical (r, t, z).

    El corte vertical se orienta según el acimut de la estación. El eje radial r
    apunta de la fuente hacia la estación (acimut medido desde el norte, en
    sentido horario); el transversal t es horizontal, 90° en sentido horario
    respecto a r; z apunta hacia abajo.

        e_r = (cos az, sin az, 0)   [Norte, Este, Abajo]
        e_t = (sin az, -cos az, 0)
        e_z = (0, 0, 1)

    Las componentes en el plano (Mrr, Mrz, Mzz) excitan el sistema P-SV; las
    fuera del plano (Mrt, Mtz) excitan el SH (transversal).

    Args:
        M: Tensor de momento 3×3 en ejes N, E, Abajo.
        azimuth_deg: Acimut de la estación en grados (0-360, desde el norte).

    Returns:
        Dict con Mrr, Mrz, Mzz (P-SV) y Mrt, Mtz (SH).
    """
    az = math.radians(azimuth_deg)
    ca, sa = math.cos(az), math.sin(az)
    er = np.array([ca, sa, 0.0])
    et = np.array([sa, -ca, 0.0])
    ez = np.array([0.0, 0.0, 1.0])
    return {
        "Mrr": float(er @ M @ er),
        "Mrz": float(er @ M @ ez),
        "Mzz": float(ez @ M @ ez),
        "Mrt": float(er @ M @ et),
        "Mtz": float(et @ M @ ez),
    }


_NUMBA_WARMED = False


def _warmup_numba():
    """Compila los kernels Numba (P-SV y SH) una vez, fuera de la medición."""
    global _NUMBA_WARMED
    if _NUMBA_WARMED or not _HAS_NUMBA:
        return
    n = 8
    z = np.zeros((n, n), dtype=np.float32)
    ones = np.ones((n, n), dtype=np.float32)
    # c1, c2, c3 y cs2 son arrays por nodo (mismo layout que en producción).
    _fdm_step(z.copy(), z.copy(), z.copy(), z.copy(), z.copy(), z.copy(),
              ones, n, n, 1.0, 1.0, ones.copy(), ones.copy(), ones.copy())
    _sh_step(z.copy(), z.copy(), z.copy(), ones, n, n, 1.0, 1.0, ones.copy())
    _NUMBA_WARMED = True


def warmup_fdm() -> float:
    """Precompila el kernel Numba al arrancar el servidor (no en la 1ª petición).

    Compila ``_fdm_step`` con una malla mínima para que la primera simulación
    real de un usuario ya no pague el costo de compilación JIT. Es seguro
    llamarla varias veces (idempotente) y si Numba no está disponible no hace
    nada.

    Returns:
        Segundos que tardó el warmup (0.0 si Numba no está o ya estaba listo).
    """
    import time as _t
    if _NUMBA_WARMED or not _HAS_NUMBA:
        return 0.0
    t0 = _t.perf_counter()
    _warmup_numba()
    return _t.perf_counter() - t0


def run_fdm(params: SimulationParams, on_progress=None, snapshot_sink: dict | None = None) -> SimulationResult:
    """Ejecuta la simulación FDM 2D de la ecuación de onda elástica (vectorizada).

    Resuelve el sistema acoplado de ecuaciones de onda elástica en 2D
    usando diferencias finitas de segundo orden en espacio y tiempo:

        ρ · ∂²ux/∂t² = (λ+2μ)·∂²ux/∂x² + μ·∂²ux/∂z² + (λ+μ)·∂²uz/∂x∂z
        ρ · ∂²uz/∂t² = μ·∂²uz/∂x² + (λ+2μ)·∂²uz/∂z² + (λ+μ)·∂²ux/∂x∂z

    Args:
        params: Parámetros de simulación (velocidades, densidad, fuente, malla, etc.).
        on_progress: Callback opcional para reportar progreso. Recibe (step, total_steps).
        snapshot_sink: Si se pasa un dict, se llena con los snapshots del campo de
            ondas submuestreados para el mapa de calor. Claves de salida:
            ``frames`` (lista de dicts {time, field}), ``nx``, ``nz``, ``sourceX``,
            ``sourceZ``, ``receiverX``, ``receiverZ`` en el grid submuestreado. El
            ``field`` de cada frame es una lista concatenada [Ux | Uz | |u|] con
            índice k = i*nz + j (mismo layout que el frontend).

    Returns:
        SimulationResult con sismogramas triaxiales, métricas y metadatos de la malla.

    Raises:
        ValueError: Si los parámetros producen una malla inválida.
    """
    vp, vs, density = params.vp, params.vs, params.density
    magnitude, depth = params.magnitude, params.depth
    source_type, duration = params.sourceType, params.duration
    dx, dt = params.dx, params.dt

    # ── Modelo de subsuelo ──
    # 'homogeneous': un medio (vp/vs/density) en todo el dominio.
    # 'twoLayer': capa superficial blanda (layerVp/layerVs/layerDensity) sobre un
    # semiespacio de roca (vp/vs/density), con interfaz horizontal.
    two_layer = params.subsurfaceModel == "twoLayer"

    # Calcular o usar parámetros de Lamé del SEMIESPACIO (roca).
    lam, mu = compute_lame(vp, vs, density)
    if params.lambda_ != 0:
        lam = params.lambda_
    if params.mu != 0:
        mu = params.mu

    # Velocidades relevantes para malla/estabilidad. Con dos capas, la CFL la
    # fija la Vp MÁXIMA (medio más rápido ⇒ dt más pequeño) y la dispersión la
    # fija la Vs MÍNIMA (medio más lento ⇒ λ más corta ⇒ dx más fino).
    if two_layer:
        vp_max = max(vp, params.layerVp)
        vs_min = min(vs, params.layerVs)
        lam_layer, mu_layer = compute_lame(params.layerVp, params.layerVs, params.layerDensity)
    else:
        vp_max = vp
        vs_min = vs
        lam_layer, mu_layer = lam, mu

    # ── Grid sizing: nz adapts to requested depth ──
    # Zona absorbente ancha (Cerjan) + dominio más grande para que la fuente y
    # el receptor queden lejos de los bordes y la coda decaiga sin reflexiones.
    # Dominio amplio + zona absorbente ancha para que fuente y receptor queden
    # lejos de los bordes. Con la duración corta por defecto (~11 s) el primer
    # rebote de borde llega DESPUÉS de la ventana útil, así que la señal decae a
    # la calma propia del medio homogéneo (no hay coda física).
    # Con el bucle temporal compilado (Numba, ~5x), el dominio puede ser mucho
    # más grande manteniendo el cómputo < 15 s. Un dominio amplio + geometría
    # simétrica (fuente y receptor a ±d/2 del centro) aleja ambos de los bordes,
    # de modo que el PRIMER rebote de borde llega DESPUÉS de ~8 s (más allá de
    # la onda S y la superficial). Esto elimina la coda artificial sin depender
    # solo de la absorción del sponge.
    # Dominio AMPLIO fijo + zona absorbente ancha (valores canónicos): la fuente
    # y el receptor quedan lejos de los bordes y el primer rebote llega tarde.
    # Ya NO se encoge el dominio para "producir coda": el medio es homogéneo y la
    # señal debe decaer a la calma tras la P/S/superficial. La coda física real
    # vendrá del modelo de capas (trabajo futuro), no de reflexiones de borde.
    abs_thick = 44
    # Con dos capas el semiespacio de roca suele ser rápido (Vp alto) y el
    # rebote de borde de la P llega antes; se AMPLÍA el dominio horizontal para
    # que ese primer rebote quede fuera de la ventana útil (el cómputo sigue
    # < 15 s gracias al kernel Numba). En medio homogéneo se mantiene el dominio
    # canónico para no alterar los presets existentes.
    NX_MAX = 1200 if two_layer else 1100
    NZ_MAX = 700
    domain_span_m = 48000 if two_layer else 44000

    nx = min(NX_MAX, max(80, int(domain_span_m / dx)))

    # La fuente se ubica al ~70% de nz; el resto es propagación + sponge inferior.
    depth_nodes = int((depth * 1000) / dx)
    nz_required = max(40, math.ceil(depth_nodes / 0.70) + abs_thick + 20)
    dx_adjusted = False

    # nz al máximo representable para alejar el borde inferior (rebote inferior
    # tardío), sin bajar de lo que exige la profundidad focal.
    if nz_required <= NZ_MAX:
        nz = NZ_MAX
    else:
        # Depth exceeds representable range: increase dx
        max_depth_nodes = int((NZ_MAX - abs_thick - 20) * 0.70)
        dx = math.ceil((depth * 1000) / max_depth_nodes)
        dx_adjusted = True
        nz = NZ_MAX
        # Recompute nx with new dx
        nx = min(NX_MAX, max(80, int(34000 / dx)))

    # Verificación de estabilidad CFL (re-check after possible dx change). Con
    # dos capas, la Vp MÁXIMA es la que restringe dt.
    cfl_limit = dx / (vp_max * math.sqrt(2))
    dt_adjusted = False
    if dt > cfl_limit:
        dt = cfl_limit * 0.9
        dt_adjusted = True

    # Tope de pasos por rendimiento. La duración EFECTIVA (la que se grafica y se
    # reporta) es total_steps · dt, que puede ser menor que la pedida si se
    # alcanza el tope. Todo el resultado usa eff_duration para ser coherente.
    # NOTA: total_steps/eff_duration/snapshot_interval se calculan MÁS ABAJO,
    # después de acotar `duration` por el primer rebote de borde (que necesita la
    # geometría fuente/receptor y t0, definidos más adelante).
    MAX_STEPS = 8000

    # Geometría simétrica respecto al centro del dominio: la fuente en X a −d/2
    # y el receptor a +d/2 (d = distancia epicentral pedida). Así ninguno queda
    # cerca de un borde y el rebote de borde es lo más tardío posible para un
    # dominio dado. La distancia se recorta al espacio disponible entre las zonas
    # absorbentes (con margen) para no acercar fuente/receptor a los bordes. La
    # profundidad de la fuente sigue la focal.
    epic_target_nodes = int(params.epicentralDistanceKm * 1000 / dx)
    epic_nodes = min(epic_target_nodes, (nx - 2 * abs_thick - 60) // 2)
    src_x = nx // 2 - epic_nodes // 2
    rec_x = nx // 2 + epic_nodes // 2
    src_z = min(int(nz * 0.70), max(5, int((depth * 1000) / dx)))
    rec_z = 2

    # Parámetros de la fuente. f0 = frecuencia dominante. Con sourceCycles > 1
    # se usa una wavelet de Gabor (tren de ondas de varios ciclos) en vez de la
    # Ricker de un solo lóbulo: cada arribo P/S se ve como un paquete oscilante,
    # más parecido a un sismo real. t0 (centro del pulso) se agranda con los
    # ciclos para no truncar la envolvente.
    _f0_override = float(getattr(params, "sourceFreq", 0.0) or 0.0)
    f0 = _f0_override if _f0_override > 0 else (2.0 if source_type == "volcanic" else 3.5)
    # Guarda de dispersión para el modelo de dos capas: la capa lenta (Vs mínima)
    # exige ≥10 nodos por longitud de onda mínima (λ_min = Vs_min/f_max, con
    # f_max ≈ 2.5·f0). Si el f0 elegido daría menos, se BAJA f0 automáticamente
    # (mantiene la geometría/dominio; solo el pulso es algo más largo). No se
    # aplica al medio homogéneo para no alterar los presets existentes.
    if two_layer and _f0_override <= 0:
        f0_disp_max = vs_min / (2.5 * 10.0 * dx)
        if f0 > f0_disp_max:
            f0 = max(0.5, f0_disp_max)
    cycles = max(1.0, float(getattr(params, "sourceCycles", 1.0)))
    use_gabor = cycles > 1.0
    t0 = (1.5 / f0) if not use_gabor else (cycles / f0 + 0.5 / f0)
    amp_scale = 10 ** (magnitude - 2) * 1e4

    def source_at(tt: float) -> float:
        return gabor(tt, f0, t0, cycles) if use_gabor else ricker(tt, f0, t0)

    # ── Tope de duración por el primer rebote de borde (garantía del backend) ──
    # El primer rebote de borde (imagen especular en los bordes izq/der/inferior)
    # marca el instante tras el cual la señal contiene reflexiones ARTIFICIALES
    # de los límites de la malla. Se calcula ANTES del bucle con la geometría ya
    # definida y se ACOTA la duración efectiva a ese tiempo, VENGAN DE DONDE
    # VENGAN los parámetros (escenario, reporte guardado, edición manual o
    # cliente externo). Así ninguna simulación incluye reflexiones de borde,
    # aunque el control del panel no lo haya limitado. Se usa el MENOR entre el
    # rebote de la P y el de la S (con roca rápida la P rebota antes).
    # Imagen especular de la FUENTE en cada borde (izq/der/inferior) y distancia
    # a la estación (misma fórmula verificada que el bloque de post-proceso).
    _right_edge = nx - 1 - abs_thick
    _left_edge = abs_thick
    _bottom_edge = nz - 1 - abs_thick
    _bounce_imgs = (
        (2 * _right_edge - src_x, src_z),
        (2 * _left_edge - src_x, src_z),
        (src_x, 2 * _bottom_edge - src_z),
    )
    _bounce_pre = min(
        math.hypot((ix - rec_x) * dx, (iz - rec_z) * dx) for ix, iz in _bounce_imgs
    )
    # Rebote más temprano: usa la velocidad MÁXIMA de la P en el dominio (roca).
    first_bounce_min = _bounce_pre / vp_max + t0
    # Duración pedida y su tope por rebote (con un pequeño margen de seguridad).
    duration_capped_by_bounce = False
    if first_bounce_min > t0 and duration > first_bounce_min:
        duration = max(t0 + 1.0 / f0, first_bounce_min)  # nunca por debajo de 1 pulso
        duration_capped_by_bounce = True

    # Pasos temporales (tras acotar la duración). eff_duration = total_steps·dt.
    total_steps = min(MAX_STEPS, int(duration / dt))
    eff_duration = total_steps * dt
    # ~100 fotogramas del campo para animar el corte del subsuelo con fluidez.
    SNAP_TARGET_FRAMES = 100
    snapshot_interval = max(1, math.ceil(total_steps / SNAP_TARGET_FRAMES))

    # Inicialización de campos de desplazamiento — arrays 2D (nx, nz)
    # P-SV (en el plano del corte): ux (radial), uz (vertical).
    ux_prev = np.zeros((nx, nz), dtype=np.float32)
    ux_curr = np.zeros((nx, nz), dtype=np.float32)
    ux_next = np.zeros((nx, nz), dtype=np.float32)
    uz_prev = np.zeros((nx, nz), dtype=np.float32)
    uz_curr = np.zeros((nx, nz), dtype=np.float32)
    uz_next = np.zeros((nx, nz), dtype=np.float32)
    # SH (fuera del plano): v = desplazamiento transversal (Love/SH).
    v_prev = np.zeros((nx, nz), dtype=np.float32)
    v_curr = np.zeros((nx, nz), dtype=np.float32)
    v_next = np.zeros((nx, nz), dtype=np.float32)

    # ── Fuente sísmica: tensor de momento proyectado al corte ──
    # Para la fuente tectónica se calcula el tensor de momento del doble par
    # (strike/dip/rake) y se proyecta al marco del corte (r, t, z) según el
    # acimut de la estación. Las componentes en el plano (Mrr, Mrz, Mzz) excitan
    # el P-SV; las fuera del plano (Mrt, Mtz) excitan el SH. La fuente volcánica
    # es isótropa (radial): excita P-SV pero NO genera SH (transversal ≈ 0).
    if source_type == "tectonic":
        M = moment_tensor(params.strike, params.dip, params.rake)
        proj = project_moment_to_cut(M, params.stationAzimuth)
        Mrr, Mrz, Mzz = proj["Mrr"], proj["Mrz"], proj["Mzz"]
        Mrt, Mtz = proj["Mrt"], proj["Mtz"]
    else:
        Mrr = Mrz = Mzz = Mrt = Mtz = 0.0

    # Ángulo de rotación radial/transversal → Norte/Este (acimut de la estación).
    az_rad = math.radians(params.stationAzimuth)
    cos_az = math.cos(az_rad)
    sin_az = math.sin(az_rad)

    # Coeficientes de frontera absorbente (sponge layer) — vectorizado, con la
    # absorción canónica fuerte (Cerjan 0.02) para atenuar los rebotes de borde.
    abs_coeff = _build_sponge_2d(nx, nz, abs_thick=abs_thick)

    # ── Campos de propiedades por nodo (c1, c2, c3, cs2) ──
    # c1 = (λ+2μ)/ρ, c2 = μ/ρ, c3 = (λ+μ)/ρ, cs2 = μ/ρ. En medio homogéneo son
    # arrays constantes (resultado idéntico al de coeficientes escalares). Con
    # dos capas, cada nodo toma las propiedades de su capa; en la fila de la
    # interfaz se PROMEDIAN los módulos (media aritmética de λ, μ y ρ de ambas
    # capas) para suavizar el contacto y evitar artefactos de escalón.
    dx2 = dx * dx
    dt2 = dt * dt

    def _coeffs(lam_v, mu_v, rho_v):
        return ((lam_v + 2 * mu_v) / rho_v, mu_v / rho_v, (lam_v + mu_v) / rho_v, mu_v / rho_v)

    interface_z = 0
    interface_depth_km = 0.0
    interface_refl_p = 0.0
    if two_layer:
        # Profundidad de la interfaz en nodos (acotada dentro del dominio útil).
        interface_z = int(round(params.layerThickness * 1000 / dx))
        interface_z = max(2, min(interface_z, nz - abs_thick - 5))
        interface_depth_km = interface_z * dx / 1000.0

    c1 = np.empty((nx, nz), dtype=np.float32)
    c2 = np.empty((nx, nz), dtype=np.float32)
    c3 = np.empty((nx, nz), dtype=np.float32)
    cs2 = np.empty((nx, nz), dtype=np.float32)

    if two_layer:
        # Capa superficial (z < interface_z) y semiespacio (z > interface_z).
        c1_top, c2_top, c3_top, cs2_top = _coeffs(lam_layer, mu_layer, params.layerDensity)
        c1_bot, c2_bot, c3_bot, cs2_bot = _coeffs(lam, mu, density)
        # Módulos promediados en la fila de la interfaz (contacto suave).
        lam_i = 0.5 * (lam_layer + lam)
        mu_i = 0.5 * (mu_layer + mu)
        rho_i = 0.5 * (params.layerDensity + density)
        c1_i, c2_i, c3_i, cs2_i = _coeffs(lam_i, mu_i, rho_i)
        for j in range(nz):
            if j < interface_z:
                c1[:, j] = c1_top; c2[:, j] = c2_top; c3[:, j] = c3_top; cs2[:, j] = cs2_top
            elif j == interface_z:
                c1[:, j] = c1_i; c2[:, j] = c2_i; c3[:, j] = c3_i; cs2[:, j] = cs2_i
            else:
                c1[:, j] = c1_bot; c2[:, j] = c2_bot; c3[:, j] = c3_bot; cs2[:, j] = cs2_bot
    else:
        c1_h, c2_h, c3_h, cs2_h = _coeffs(lam, mu, density)
        c1.fill(c1_h); c2.fill(c2_h); c3.fill(c3_h); cs2.fill(cs2_h)

    _warmup_numba()

    time_arr = []
    north_arr = []
    east_arr = []
    vert_arr = []
    # Radial (en el plano) para la detección de arribos, independiente de la
    # rotación a N/E: la S es clara en la radial y la vertical.
    radial_arr = []
    snapshot_count = 0

    # ── Preparación de snapshots submuestreados para el mapa de calor ──
    # El campo completo (nx·nz·~80 frames) es demasiado pesado para HTTP, así que
    # lo reducimos a un grid <= SNAP_MAX_DIM por lado y <= SNAP_MAX_FRAMES frames.
    collect_snaps = snapshot_sink is not None
    if collect_snaps:
        # Resolución de los fotogramas del corte. Se respeta la PROPORCIÓN real
        # del dominio (misma escala en km en X y Z) fijando el lado mayor a
        # SNAP_MAX_DIM y el menor en proporción, para que los frentes circulares
        # no se deformen.
        SNAP_MAX_DIM = 200
        SNAP_MAX_FRAMES = 100
        if nx >= nz:
            sub_nx = min(nx, SNAP_MAX_DIM)
            sub_nz = max(1, min(nz, int(round(SNAP_MAX_DIM * nz / nx))))
        else:
            sub_nz = min(nz, SNAP_MAX_DIM)
            sub_nx = max(1, min(nx, int(round(SNAP_MAX_DIM * nx / nz))))

        # Submuestreo por PROMEDIO DE BLOQUES (filtro de caja) en vez de tomar
        # puntos sueltos: elimina el moiré (patrones diagonales falsos) que
        # produce el diezmado. Se precomputan los límites de bloque en X y Z y
        # se promedia con np.add.reduceat (rápido y vectorizado).
        bx = np.linspace(0, nx, sub_nx + 1).astype(np.int64)
        bx[-1] = nx
        bz = np.linspace(0, nz, sub_nz + 1).astype(np.int64)
        bz[-1] = nz
        bx_start = bx[:-1].copy()
        bz_start = bz[:-1].copy()
        bx_cnt = (bx[1:] - bx[:-1]).astype(np.float32)
        bz_cnt = (bz[1:] - bz[:-1]).astype(np.float32)
        bx_cnt[bx_cnt == 0] = 1.0
        bz_cnt[bz_cnt == 0] = 1.0

        def _box_downsample(field2d: np.ndarray) -> np.ndarray:
            """Promedia el campo (nx, nz) a (sub_nx, sub_nz) por bloques."""
            sx = np.add.reduceat(field2d, bx_start, axis=0)
            sxz = np.add.reduceat(sx, bz_start, axis=1)
            return (sxz / bx_cnt[:, None] / bz_cnt[None, :]).astype(np.float32)

        approx_snaps = max(1, total_steps // snapshot_interval)
        frame_every = max(1, math.ceil(approx_snaps / SNAP_MAX_FRAMES))
        snap_taken = 0
        snap_frames: list[dict] = []
        # Posiciones fuente/receptor reescaladas al grid submuestreado.
        def _rescale(idx_full: int, n_full: int, n_sub: int) -> int:
            if n_full <= 1:
                return 0
            return int(round(idx_full / (n_full - 1) * (n_sub - 1)))
        snapshot_sink.update({
            "nx": sub_nx, "nz": sub_nz,
            "sourceX": _rescale(src_x, nx, sub_nx), "sourceZ": _rescale(src_z, nz, sub_nz),
            "receiverX": _rescale(rec_x, nx, sub_nx), "receiverZ": _rescale(rec_z, nz, sub_nz),
            # Interfaz de capas reescalada al grid submuestreado (0 si homogéneo).
            "interfaceZ": _rescale(interface_z, nz, sub_nz) if interface_z > 0 else 0,
            "frames": snap_frames,
        })

    # ═══ Bucle temporal principal ═══
    for step in range(total_steps):
        t = step * dt

        # ── Inyección de fuente distribuida ──
        src_val = source_at(t) * amp_scale
        spread = 2
        beta = 0.8 * spread
        for di in range(-spread, spread + 1):
            for dj in range(-spread, spread + 1):
                si, sj = src_x + di, src_z + dj
                if si < 2 or si >= nx - 2 or sj < 2 or sj >= nz - 2:
                    continue
                dist = math.sqrt(di * di + dj * dj)
                weight = math.exp(-dist * dist / beta)
                if source_type == "tectonic":
                    # Fuente por DIVERGENCIA del tensor de momento:
                    # f_i = −M_ij·∂(δ)/∂x_j. Aproximamos ∂(δ)/∂x_j con la derivada
                    # del kernel gaussiano de esparcido. En el corte, el eje r
                    # (radial) es el índice horizontal (di) y z el vertical (dj).
                    #   f_r = −(Mrr·g_r + Mrz·g_z)   → ux (radial, P-SV)
                    #   f_z = −(Mrz·g_r + Mzz·g_z)   → uz (vertical, P-SV)
                    #   f_t = −(Mrt·g_r + Mtz·g_z)   → v  (transversal, SH)
                    g_r = -2.0 * di / beta * weight
                    g_z = -2.0 * dj / beta * weight
                    ux_curr[si, sj] += src_val * (-(Mrr * g_r + Mrz * g_z))
                    uz_curr[si, sj] += src_val * (-(Mrz * g_r + Mzz * g_z))
                    v_curr[si, sj] += src_val * (-(Mrt * g_r + Mtz * g_z))
                else:
                    # Explosión isótropa (volcánica): expansión RADIAL uniforme
                    # → ∇·u ≠ 0, ∇×u ≈ 0. ONDA P dominante, radiación simétrica y
                    # SIN componente transversal (no excita SH). El nodo central
                    # no tiene dirección radial, se omite.
                    if dist > 1e-6:
                        angle = math.atan2(dj, di)
                        ux_curr[si, sj] += src_val * weight * math.cos(angle)
                        uz_curr[si, sj] += src_val * weight * math.sin(angle)

        # ── Actualización FDM (kernels compilados con Numba, en paralelo) ──
        # P-SV: stencil 2º orden + derivada cruzada + superficie libre + sponge.
        # SH: onda escalar transversal (Vs, ρ), misma malla/sponge/superficie.
        _fdm_step(ux_prev, ux_curr, ux_next, uz_prev, uz_curr, uz_next, abs_coeff,
                  nx, nz, dx2, dt2, c1, c2, c3)
        _sh_step(v_prev, v_curr, v_next, abs_coeff, nx, nz, dx2, dt2, cs2)

        # Intercambio de buffers temporales
        ux_prev, ux_curr, ux_next = ux_curr, ux_next, ux_prev
        uz_prev, uz_curr, uz_next = uz_curr, uz_next, uz_prev
        v_prev, v_curr, v_next = v_curr, v_next, v_prev

        # ── Registro triaxial en el receptor ──
        # Componentes en el marco del corte: radial (R = ux), transversal
        # (T = v, del SH) y vertical (Z = uz). Se rotan R y T a Norte y Este
        # según el acimut de la estación (medido desde el norte, horario):
        #   Norte = R·cos(az) − T·sin(az)
        #   Este  = R·sin(az) + T·cos(az)
        # Convención: radial positiva alejándose de la fuente; transversal
        # positiva 90° en sentido horario respecto a la radial.
        radial_val = float(ux_curr[rec_x, rec_z])
        transverse_val = float(v_curr[rec_x, rec_z])
        vertical_val = float(uz_curr[rec_x, rec_z])
        north_val = radial_val * cos_az - transverse_val * sin_az
        east_val = radial_val * sin_az + transverse_val * cos_az

        time_arr.append(t)
        north_arr.append(north_val)
        east_arr.append(east_val)
        vert_arr.append(vertical_val)
        radial_arr.append(radial_val)

        if step % snapshot_interval == 0:
            snapshot_count += 1
            # Capturar un frame submuestreado del campo para el mapa de calor.
            if collect_snaps and (snap_taken % frame_every == 0):
                # Submuestreo por PROMEDIO DE BLOQUES (sin moiré). Se guardan solo
                # las dos componentes del plano (ux radial, uz vertical) en
                # float32; la magnitud |u| se calcula en el navegador. La
                # cuantización a uint8 con escala global se hace tras el bucle
                # (run_fdm_full), cuando ya se conoce el máximo de toda la sim.
                ux_s = _box_downsample(ux_curr)
                uz_s = _box_downsample(uz_curr)
                snap_frames.append({
                    "time": float(t),
                    "ux": ux_s.reshape(-1).astype(np.float32),
                    "uz": uz_s.reshape(-1).astype(np.float32),
                })
            if collect_snaps:
                snap_taken += 1
        if on_progress and step % 200 == 0:
            on_progress(step, total_steps)

    # ═══ Post-procesamiento ═══
    all_amps = np.abs(np.array(north_arr + east_arr + vert_arr, dtype=np.float64))
    max_amplitude = float(np.max(all_amps)) if len(all_amps) > 0 else 1e-30

    # ── Detección robusta de llegadas P y S ──
    # El arribo teórico marca el ONSET (frente) de cada fase. La energía "sale"
    # de la fuente cuando el pulso alcanza su pico (t0), pero un paquete de
    # varios ciclos (Gabor) tiene un frente que llega ANTES del pico por media
    # envolvente; el STA dispara justo en ese frente. Por eso el teórico de
    # referencia resta media anchura de envolvente (≈ cycles/(2·f0)) y la
    # tolerancia se relaja un poco: así los presets (óptimos) detectan P y S sin
    # caer al teórico, sin dejar de rechazar detecciones absurdas.
    dist_m = math.sqrt((rec_x - src_x) ** 2 + (rec_z - src_z) ** 2) * dx
    env_half = (cycles / (2.0 * f0)) if use_gabor else 0.0
    p_theoretical = dist_m / vp + t0            # centro del paquete P
    s_theoretical = dist_m / vs + t0            # centro del paquete S
    p_onset = max(0.0, p_theoretical - env_half)  # frente (lo que ve el STA)
    s_onset = max(0.0, s_theoretical - env_half)
    vp_vs_ratio = vp / vs
    TOL = 0.22  # tolerancia relativa (paquete más ancho ⇒ algo más de holgura)

    # P-arrival: se detecta el frente sobre el MOVIMIENTO EN EL PLANO combinado
    # |u| = √(radial² + vertical²). Así el frente P se ve aunque en una
    # componente concreta (p. ej. la vertical) sea débil por la geometría del
    # mecanismo; antes, al mirar solo la vertical, en escenarios con vertical
    # pequeña el STA se disparaba tarde (con la S) y la P caía al teórico.
    # Umbral bajo (2.5% del máximo): cuando la S es varias veces mayor que la P,
    # el frente P queda muy por debajo del pico global; con un umbral alto el STA
    # se saltaba la P y disparaba en la S. 2.5% capta el frente P sin engancharse
    # al ruido numérico (la coda del medio homogéneo decae a ~0).
    inplane = np.sqrt(np.asarray(radial_arr) ** 2 + np.asarray(vert_arr) ** 2)
    p_arrival_det = detect_arrival(inplane, dt, 0.025, start_idx=10)
    if p_arrival_det > 0 and abs(p_arrival_det - p_onset) / max(p_onset, 1e-9) < TOL:
        p_arrival = p_arrival_det
        p_arrival_detected = True
    else:
        p_arrival = p_onset
        p_arrival_detected = False

    # S-arrival: se busca DESPUÉS del frente P + la duración del paquete P, para
    # no confundir la cola de la P con la S (la guarda crece con los ciclos).
    wavelet_duration = (3.0 + cycles) / f0
    s_search_start_time = p_arrival + wavelet_duration
    s_search_start_idx = max(10, int(s_search_start_time / dt))
    # Se detecta sobre la radial (en el plano), independiente de la rotación a
    # N/E; la S llega clara en la componente radial P-SV.
    s_arrival_det = detect_arrival(np.array(radial_arr), dt, 0.05, start_idx=s_search_start_idx)
    if s_arrival_det > 0:
        s_rel_err = abs(s_arrival_det - s_onset) / max(s_onset, 1e-9)
        # Coherencia: (S − onset0)/(P − onset0) debe parecerse a Vp/Vs.
        ref0 = t0 - env_half
        detected_ratio = (s_arrival_det - ref0) / (p_arrival - ref0 + 1e-30)
        ratio_rel_err = abs(detected_ratio - vp_vs_ratio) / vp_vs_ratio
        if s_rel_err < TOL and ratio_rel_err < TOL:
            s_arrival = s_arrival_det
            s_arrival_detected = True
        else:
            s_arrival = s_onset
            s_arrival_detected = False
    else:
        s_arrival = s_onset
        s_arrival_detected = False

    # ── Numerical dispersion metric ──
    # Minimum wavelength: Vs_min / f_max, where f_max ≈ 2.5 * f0 for Ricker. Con
    # dos capas manda la capa lenta (Vs mínima ⇒ λ más corta ⇒ menos nodos/λ).
    f_max = 2.5 * f0
    lambda_min = vs_min / f_max
    points_per_wavelength = lambda_min / dx

    # ── Tiempo del primer rebote de borde al receptor (geometría real) ──
    # Se calcula por el método de la imagen especular: la reflexión en un borde
    # exterior (izquierdo, derecho, inferior) equivale a una fuente imagen al otro
    # lado del borde (tomado en el límite INTERNO de la zona absorbente, que es
    # donde la onda aún tiene energía). El primer rebote es el mínimo sobre los
    # tres bordes; P usa Vp y S usa Vs. La superficie libre (z=0) no cuenta como
    # rebote artificial (es una condición física real).
    right_edge = nx - 1 - abs_thick
    left_edge = abs_thick
    bottom_edge = nz - 1 - abs_thick
    _edges = (
        (2 * right_edge - src_x, src_z),
        (2 * left_edge - src_x, src_z),
        (src_x, 2 * bottom_edge - src_z),
    )
    _bounce_dists = [math.hypot((ix - rec_x) * dx, (iz - rec_z) * dx) for ix, iz in _edges]
    _min_bounce = min(_bounce_dists) if _bounce_dists else 0.0
    # El rebote de borde usa la velocidad del semiespacio (medio de roca), que
    # es donde viaja el frente directo lejos de la capa superficial.
    first_bounce_p = _min_bounce / vp + t0
    first_bounce_s = _min_bounce / vs + t0

    # ── Reflexión P en la interfaz de capas (solo twoLayer) ──
    # Método de la imagen especular EN EL SEMIESPACIO (roca): la reflexión de la
    # onda P que baja de la fuente, rebota en la interfaz horizontal
    # (z = interface_z) y vuelve a la superficie equivale a una imagen del
    # receptor al otro lado de la interfaz: zr_img = 2·interface_z − zr; la
    # distancia fuente→imagen dividida por Vp de la CAPA (el rayo viaja por la
    # capa, encima de la interfaz) más t0 da el tiempo de reflexión.
    #
    # IMPORTANTE (coherencia física): esta reflexión SOLO es observable en la
    # estación cuando la fuente está DENTRO de la capa superficial (src_z <
    # interface_z). Si la fuente está en el semiespacio, BAJO la interfaz (como
    # en el escenario "Pasto"), la onda que sube cruza la interfaz hacia el
    # receptor (P transmitida directa) y la parte que se refleja va hacia ABAJO,
    # sin volver a la estación: no hay una reflexión aislada que marcar. En ese
    # caso interface_refl_p queda en 0 y no se dibuja marcador.
    interface_refl_observable = two_layer and interface_z > 0 and src_z < interface_z
    if interface_refl_observable:
        zr_img = 2 * interface_z - rec_z
        refl_dist = math.hypot((rec_x - src_x) * dx, (zr_img - src_z) * dx)
        # Velocidad de la capa superficial (donde viaja el rayo reflejado).
        vp_layer = params.layerVp if two_layer else vp
        interface_refl_p = refl_dist / vp_layer + t0

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
    # Duración EFECTIVA (puede haberse acotado por el primer rebote de borde o
    # por el tope de pasos); se reporta la realmente simulada.
    result_params.duration = round(eff_duration, 4)
    # Distancia epicentral EFECTIVA: si la pedida no cabía en la malla, la
    # geometría la recortó; reportamos la realmente usada para que el panel y el
    # PDF muestren el valor correcto.
    result_params.epicentralDistanceKm = round(abs(rec_x - src_x) * dx / 1000, 3)

    return SimulationResult(
        waveData=WaveData(time=time_arr, north=north_arr, east=east_arr, vertical=vert_arr),
        maxAmplitude=max_amplitude,
        duration=eff_duration,
        dominantFrequency=f0,
        params=result_params,
        gridInfo=GridInfo(
            nx=nx, nz=nz, dx=dx, dt=dt, dtAdjusted=dt_adjusted, dxAdjusted=dx_adjusted,
            totalSteps=total_steps, receiverX=rec_x, receiverZ=rec_z,
            sourceX=src_x, sourceZ=src_z, pointsPerWavelength=points_per_wavelength,
            firstBounceP=first_bounce_p, firstBounceS=first_bounce_s,
            sourceDelay=t0,
            subsurfaceModel=params.subsurfaceModel,
            interfaceZ=interface_z,
            interfaceDepthKm=round(interface_depth_km, 4),
            interfaceReflP=round(interface_refl_p, 4),
            durationCappedByBounce=duration_capped_by_bounce,
        ),
        pArrival=p_arrival,
        sArrival=s_arrival,
        pArrivalDetected=p_arrival_detected,
        sArrivalDetected=s_arrival_detected,
        snapshotCount=snapshot_count,
    )


# ═══════════════════════════════════════════════════════════════════════
# Simulación "completa" con snapshots del campo (mapa de calor) — /api/simulate/full
# ═══════════════════════════════════════════════════════════════════════

class SnapshotFrame(BaseModel):
    """Un frame del campo de ondas submuestreado para el corte del subsuelo.

    Cada componente se cuantiza a 8 bits (int8 con signo) usando la escala
    PROPIA de ese fotograma (``scale``): valor_real ≈ byte/127 · scale. Al
    cuantizar cada fotograma contra su propio máximo se aprovecha todo el rango
    [-127, 127] incluso en los residuos tardíos (débiles), lo que elimina el
    "escalonado" (bloques de color) que producía una única escala global. El
    navegador recompone la escala de color global a partir de estos factores,
    así que el aspecto en modo "global" no cambia. La magnitud |u| se calcula
    en el navegador a partir de ``ux`` y ``uz``.

    Attributes:
        time: Instante de tiempo del frame (s).
        ux: Componente radial (int8 en base64), índice k = i·nz + j.
        uz: Componente vertical (int8 en base64), mismo layout.
        scale: Factor de escala propio del fotograma (máx |ux|,|uz| del frame).
    """
    time: float
    ux: str
    uz: str
    scale: float


class SnapshotGrid(BaseModel):
    """Metadatos del grid submuestreado de los snapshots (para el heatmap)."""
    nx: int
    nz: int
    sourceX: int
    sourceZ: int
    receiverX: int
    receiverZ: int
    # Índice Z de la interfaz de capas en el grid submuestreado (0 si homogéneo).
    interfaceZ: int = 0


class SimulationFullResult(BaseModel):
    """Resultado de simulación con los snapshots del campo incluidos.

    Igual que :class:`SimulationResult` pero añade ``snapshots`` (frames del
    campo submuestreado, base64) y ``snapshotGrid`` (dimensiones y posiciones
    de fuente/receptor en ese grid), para que el mapa de calor se renderice en
    el navegador sin recomputar nada.
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
    snapshots: list[SnapshotFrame]
    snapshotGrid: SnapshotGrid
    # Escala global (máximo |ux|,|uz| sobre TODOS los fotogramas) para
    # reconstruir el valor real: valor ≈ byte/127 · snapshotScale.
    snapshotScale: float


def run_fdm_full(params: SimulationParams, on_progress=None) -> SimulationFullResult:
    """Ejecuta el FDM 2D y devuelve también los snapshots del campo (corte).

    Reutiliza :func:`run_fdm` con un ``snapshot_sink`` para materializar los
    fotogramas submuestreados (por promedio de bloques). Cada componente (ux,
    uz) se cuantiza a int8 con una ESCALA GLOBAL (máximo absoluto sobre todos
    los fotogramas), de modo que la respuesta pesa ~4× menos que en float32 y la
    energía tardía se ve tenue. La magnitud |u| se reconstruye en el navegador.

    Args:
        params: Parámetros de simulación.
        on_progress: Callback opcional de progreso (step, total_steps).

    Returns:
        SimulationFullResult con sismogramas, métricas, snapshots y grid del corte.
    """
    sink: dict = {}
    base = run_fdm(params, on_progress=on_progress, snapshot_sink=sink)

    raw_frames = sink.get("frames", [])
    # Escala global (solo referencia): máximo |ux|,|uz| sobre TODOS los fotogramas.
    global_max = 1e-30
    for fr in raw_frames:
        m1 = float(np.max(np.abs(fr["ux"]))) if fr["ux"].size else 0.0
        m2 = float(np.max(np.abs(fr["uz"]))) if fr["uz"].size else 0.0
        if m1 > global_max:
            global_max = m1
        if m2 > global_max:
            global_max = m2

    def _quant(a: np.ndarray, frame_scale: float) -> str:
        # valor → int8 en [-127, 127] con la escala PROPIA del fotograma; base64.
        q = np.clip(np.round(a / frame_scale * 127.0), -127, 127).astype(np.int8)
        return base64.b64encode(q.tobytes()).decode("ascii")

    frames_out: list[SnapshotFrame] = []
    for fr in raw_frames:
        # Escala propia del fotograma: máx |ux|,|uz| en ESE frame. Al usar todo
        # el rango int8 por fotograma, los residuos tardíos no se "escalonan".
        m1 = float(np.max(np.abs(fr["ux"]))) if fr["ux"].size else 0.0
        m2 = float(np.max(np.abs(fr["uz"]))) if fr["uz"].size else 0.0
        frame_scale = max(m1, m2, 1e-30)
        frames_out.append(SnapshotFrame(
            time=fr["time"], ux=_quant(fr["ux"], frame_scale),
            uz=_quant(fr["uz"], frame_scale), scale=frame_scale,
        ))

    grid = SnapshotGrid(
        nx=sink.get("nx", base.gridInfo.nx),
        nz=sink.get("nz", base.gridInfo.nz),
        sourceX=sink.get("sourceX", base.gridInfo.sourceX),
        sourceZ=sink.get("sourceZ", base.gridInfo.sourceZ),
        receiverX=sink.get("receiverX", base.gridInfo.receiverX),
        receiverZ=sink.get("receiverZ", base.gridInfo.receiverZ),
        interfaceZ=sink.get("interfaceZ", 0),
    )

    return SimulationFullResult(
        waveData=base.waveData,
        maxAmplitude=base.maxAmplitude,
        duration=base.duration,
        dominantFrequency=base.dominantFrequency,
        params=base.params,
        gridInfo=base.gridInfo,
        pArrival=base.pArrival,
        sArrival=base.sArrival,
        pArrivalDetected=base.pArrivalDetected,
        sArrivalDetected=base.sArrivalDetected,
        snapshotCount=base.snapshotCount,
        snapshots=frames_out,
        snapshotGrid=grid,
        snapshotScale=global_max,
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
                    # Doble par (cizalla): ONDA S dominante, componentes
                    # horizontales fuertes (patrón de cuatro lóbulos, ∇×u ≠ 0).
                    norm = (1.0 / spread) if dist > 1e-6 else 0.0
                    ux_curr[si, sj] += src_val * weight * 1.0 * (dj * norm)
                    uz_curr[si, sj] += src_val * weight * 1.0 * (di * norm)
                elif dist > 1e-6:
                    # Explosión isótropa (volcánica): expansión radial, ONDA P
                    # dominante, radiación simétrica (∇·u ≠ 0, ∇×u ≈ 0).
                    angle = math.atan2(dj, di)
                    ux_curr[si, sj] += src_val * weight * 1.0 * math.cos(angle)
                    uz_curr[si, sj] += src_val * weight * 1.0 * math.sin(angle)

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
